// Real-time board state.
//
// useGame(id): initial GET, then a WebSocket to /api/games/:id/live. Server
// states are applied only when their version is >= the one held (stale pushes
// arriving late are dropped). While the socket is down we reconnect with
// exponential backoff + jitter and poll every 15s; coming back to the app or
// regaining network refetches immediately. Optimistic patches sit on top of the
// server state and are rebased onto every new server state until their request
// settles.
//
// useMyGames(): the dashboard list, refetched on focus and every 30s.
//
// The connection logic lives in LiveGame (no React) so it can be tested with a
// fake socket and fake timers; the hooks are thin bindings.
//
// "Mine" is always decided by the public player id (getPlayerId()), which is
// what the server puts in GameState. The secret clientId never goes in a URL.

import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import type { Activity, GameState, GameSummary, LiveMessage, Square } from "../../shared/types";
import { API_BASE, ApiError, api } from "./api";
import { getPlayerId } from "./identity";
import { onAppResume } from "./native";

export type ConnectionState =
  /** First connection attempt in flight. */
  | "connecting"
  /** Socket open: changes arrive within a second. */
  | "live"
  /** Socket down: reconnecting in the background, polling meanwhile. */
  | "polling"
  /** The device is offline. */
  | "offline";

export type Patch = (state: GameState) => GameState;
export type ActivityListener = (activity: Activity, state: GameState) => void;

export const POLL_INTERVAL_MS = 15_000;
export const MY_GAMES_INTERVAL_MS = 30_000;
const KEEPALIVE_MS = 25_000;
/** No message (not even a pong) for this long: the socket is dead even if it claims to be open. */
const STALE_SOCKET_MS = 70_000;
const BACKOFF_BASE_MS = 500;
const BACKOFF_MAX_MS = 15_000;
/** Close code the GameRoom uses when the game was deleted. */
const CLOSE_GONE = 4404;
/** Max activities announced from one state diff (e.g. after a reconnect), newest kept. */
const MAX_ACTIVITY_BURST = 3;

// ---------------------------------------------------------------------------
// Pure helpers
// ---------------------------------------------------------------------------

/** Accept a server state unless it's older than the one we hold. Equal versions are accepted (idempotent). */
export function shouldAccept(current: GameState | null, incoming: GameState): boolean {
  return !current || incoming.version >= current.version;
}

/** Exponential backoff with "equal jitter": between half and all of min(max, base * 2^attempt). */
export function backoffDelay(attempt: number, random: () => number = Math.random): number {
  const ceiling = Math.min(BACKOFF_MAX_MS, BACKOFF_BASE_MS * 2 ** Math.max(0, attempt));
  return Math.round(ceiling / 2 + random() * (ceiling / 2));
}

/**
 * ws(s)://.../api/games/:id/live?player=<public player id>, derived from
 * API_BASE (native app) or the page origin (web). The player id only lets the
 * room count this device once across tabs; it is public, unlike the clientId.
 */
export function liveSocketUrl(
  gameId: string,
  playerId: string,
  apiBase: string = API_BASE,
  loc: Pick<Location, "protocol" | "host"> = location,
): string {
  const base = apiBase
    ? apiBase.replace(/^http(s?):\/\//i, (_m, s: string) => `ws${s}://`).replace(/\/+$/, "")
    : `${loc.protocol === "https:" ? "wss:" : "ws:"}//${loc.host}`;
  return `${base}/api/games/${encodeURIComponent(gameId)}/live?player=${encodeURIComponent(playerId)}`;
}

export function parseLiveMessage(data: unknown): LiveMessage | null {
  if (typeof data !== "string") return null;
  let msg: unknown;
  try {
    msg = JSON.parse(data);
  } catch {
    return null;
  }
  if (!msg || typeof msg !== "object") return null;
  const m = msg as Record<string, unknown>;
  if (m.type === "state" && m.state && typeof m.state === "object" && typeof (m.state as GameState).version === "number") {
    return { type: "state", state: m.state as GameState };
  }
  if (m.type === "presence" && typeof m.watching === "number") return { type: "presence", watching: m.watching };
  if (m.type === "event" && m.activity && typeof (m.activity as Activity).id === "string") {
    return { type: "event", activity: m.activity as Activity };
  }
  return null;
}

/** Optimistically claim cells for this player (public id; skips taken cells and respects the per-player limit). */
export function claimPatch(playerId: string, cells: { row: number; col: number }[], now = Date.now()): Patch {
  return (state) => {
    const taken = new Set(state.squares.map((s) => `${s.row},${s.col}`));
    const limit = state.game.maxPerPlayer;
    let mine = state.squares.filter((s) => s.playerId === playerId).length;
    const added: Square[] = [];
    for (const { row, col } of cells) {
      const key = `${row},${col}`;
      if (taken.has(key)) continue;
      if (limit > 0 && mine >= limit) break;
      taken.add(key);
      mine++;
      added.push({ row, col, playerId, claimedAt: now });
    }
    return added.length ? { ...state, squares: [...state.squares, ...added] } : state;
  };
}

/** Optimistically release this player's (public id) squares at these cells. */
export function releasePatch(playerId: string, cells: { row: number; col: number }[]): Patch {
  return (state) => {
    const drop = new Set(cells.map((c) => `${c.row},${c.col}`));
    const squares = state.squares.filter((s) => !(s.playerId === playerId && drop.has(`${s.row},${s.col}`)));
    return squares.length === state.squares.length ? state : { ...state, squares };
  };
}

// ---------------------------------------------------------------------------
// GameStore: confirmed server state + pending optimistic patches
// ---------------------------------------------------------------------------

export class GameStore {
  private server: GameState | null;
  private pending: { id: number; apply: Patch }[] = [];
  private nextPatchId = 1;
  private view: GameState | null = null;
  private dirty = true;
  /** Activity ids already announced (or present before we started listening). */
  private seen = new Set<string>();
  /** False until a state from the network arrives; cached states never announce activity. */
  private confirmed = false;
  private listeners = new Set<() => void>();
  private activityListeners = new Set<ActivityListener>();

  constructor(initial: GameState | null = null) {
    this.server = initial;
    if (initial) for (const a of initial.activity) this.seen.add(a.id);
  }

  getServerState(): GameState | null {
    return this.server;
  }

  /** What to render: the server state with pending patches applied. Stable reference until something changes. */
  getState = (): GameState | null => {
    if (this.dirty) {
      let s = this.server;
      if (s) {
        for (const p of this.pending) {
          try {
            s = p.apply(s);
          } catch {
            // A patch that no longer applies is simply skipped; the server state wins.
          }
        }
      }
      this.view = s;
      this.dirty = false;
    }
    return this.view;
  };

  get hasPending(): boolean {
    return this.pending.length > 0;
  }

  /** Apply a server state. Returns false when it was older than the one held. */
  receive(state: GameState): boolean {
    if (!shouldAccept(this.server, state)) return false;
    const announce = this.confirmed ? this.unseen(state) : [];
    for (const a of state.activity) this.seen.add(a.id);
    this.confirmed = true;
    this.server = state;
    this.changed();
    for (const a of announce) this.announce(a, state);
    return true;
  }

  /** A live `event` message. Announced once even if a state carrying it arrives too. */
  receiveActivity(activity: Activity): void {
    if (this.seen.has(activity.id)) return;
    this.seen.add(activity.id);
    const state = this.getState();
    if (state && this.confirmed) this.announce(activity, state);
  }

  addPatch(apply: Patch): number {
    const id = this.nextPatchId++;
    this.pending.push({ id, apply });
    this.changed();
    return id;
  }

  removePatch(id: number): void {
    const before = this.pending.length;
    this.pending = this.pending.filter((p) => p.id !== id);
    if (this.pending.length !== before) this.changed();
  }

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  onActivity(listener: ActivityListener): () => void {
    this.activityListeners.add(listener);
    return () => this.activityListeners.delete(listener);
  }

  /** Unseen activities in chronological order, capped to the newest few. */
  private unseen(state: GameState): Activity[] {
    const fresh = state.activity.filter((a) => !this.seen.has(a.id));
    fresh.sort((a, b) => a.at - b.at);
    return fresh.slice(-MAX_ACTIVITY_BURST);
  }

  private announce(activity: Activity, state: GameState): void {
    for (const l of this.activityListeners) {
      try {
        l(activity, state);
      } catch (err) {
        console.error("activity listener failed", err);
      }
    }
  }

  private changed(): void {
    this.dirty = true;
    for (const l of this.listeners) l();
  }
}

// ---------------------------------------------------------------------------
// Module cache: instant render when revisiting a board
// ---------------------------------------------------------------------------

const stateCache = new Map<string, GameState>();
const prefetching = new Map<string, Promise<GameState | null>>();

export function peekGame(id: string): GameState | null {
  return stateCache.get(id) ?? null;
}

/** Seed the cache with a state you already have (e.g. from createGame/join). */
export function primeGame(state: GameState): void {
  const cur = stateCache.get(state.game.id) ?? null;
  if (shouldAccept(cur, state)) stateCache.set(state.game.id, state);
}

/** Warm the cache before navigating to a board (e.g. on pointerdown of a dashboard row). */
export function prefetchGame(id: string): Promise<GameState | null> {
  const cached = stateCache.get(id);
  if (cached) return Promise.resolve(cached);
  let p = prefetching.get(id);
  if (!p) {
    p = api
      .getGame(id)
      .then((s) => {
        primeGame(s);
        return s;
      })
      .catch(() => null)
      .finally(() => prefetching.delete(id));
    prefetching.set(id, p);
  }
  return p;
}

// ---------------------------------------------------------------------------
// LiveGame: socket + polling + lifecycle for one board
// ---------------------------------------------------------------------------

/** Minimal socket surface we use (the browser WebSocket satisfies it). */
export interface SocketLike {
  readonly readyState: number;
  onopen: ((ev: Event) => void) | null;
  onmessage: ((ev: MessageEvent) => void) | null;
  onclose: ((ev: CloseEvent) => void) | null;
  onerror: ((ev: Event) => void) | null;
  send(data: string): void;
  close(code?: number, reason?: string): void;
}

export interface LiveDeps {
  fetchState(id: string, signal: AbortSignal): Promise<GameState>;
  openSocket(url: string): SocketLike;
  socketUrl(id: string): string;
  random(): number;
  now(): number;
  isOnline(): boolean;
  isVisible(): boolean;
  /** Calls back when the app returns to the foreground; returns an unsubscribe. */
  onResume(cb: () => void): () => void;
  /** Network up/down; returns an unsubscribe. */
  onNetwork(cb: (online: boolean) => void): () => void;
}

export interface LiveStatus {
  connection: ConnectionState;
  /** Devices currently watching this board (from presence). */
  watching: number;
  /** Last load error; cleared by the next successful load. */
  error: ApiError | null;
  /** The board doesn't exist (404 or the room closed with 4404). */
  notFound: boolean;
}

const SOCKET_OPEN = 1;

export function browserLiveDeps(): LiveDeps {
  return {
    fetchState: (id, signal) => api.getGame(id, signal),
    openSocket: (url) => new WebSocket(url),
    socketUrl: (id) => liveSocketUrl(id, getPlayerId()),
    random: Math.random,
    now: Date.now,
    isOnline: () => (typeof navigator === "undefined" ? true : navigator.onLine !== false),
    isVisible: () => typeof document === "undefined" || document.visibilityState !== "hidden",
    onResume: (cb) => onAppResume(cb),
    onNetwork: (cb) => {
      const up = () => cb(true);
      const down = () => cb(false);
      window.addEventListener("online", up);
      window.addEventListener("offline", down);
      return () => {
        window.removeEventListener("online", up);
        window.removeEventListener("offline", down);
      };
    },
  };
}

export class LiveGame {
  readonly store: GameStore;
  private status: LiveStatus;
  private statusListeners = new Set<() => void>();

  private running = false;
  private ws: SocketLike | null = null;
  private attempt = 0;
  private lastMessageAt = 0;
  private lastFetchAt = 0;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private pollTimer: ReturnType<typeof setInterval> | null = null;
  private keepaliveTimer: ReturnType<typeof setInterval> | null = null;
  private fetchAbort: AbortController | null = null;
  private inflight: Promise<void> | null = null;
  private unsubs: (() => void)[] = [];

  constructor(
    readonly gameId: string,
    private readonly deps: LiveDeps,
    initial: GameState | null = peekGame(gameId),
  ) {
    this.store = new GameStore(initial);
    this.status = { connection: "connecting", watching: 0, error: null, notFound: false };
  }

  getStatus = (): LiveStatus => this.status;

  subscribeStatus = (listener: () => void): (() => void) => {
    this.statusListeners.add(listener);
    return () => this.statusListeners.delete(listener);
  };

  start(): void {
    if (this.running) return;
    this.running = true;
    this.unsubs.push(
      this.deps.onResume(() => this.wake()),
      this.deps.onNetwork((online) => (online ? this.wake() : this.setStatus({ connection: "offline" }))),
    );
    this.pollTimer = setInterval(() => this.pollTick(), POLL_INTERVAL_MS);
    void this.refresh();
    this.connect();
  }

  stop(): void {
    if (!this.running) return;
    this.running = false;
    for (const u of this.unsubs.splice(0)) u();
    if (this.pollTimer) clearInterval(this.pollTimer);
    this.pollTimer = null;
    this.clearReconnect();
    this.stopKeepalive();
    this.fetchAbort?.abort();
    this.fetchAbort = null;
    this.inflight = null;
    const ws = this.ws;
    this.ws = null;
    if (ws) this.detach(ws, 1000);
  }

  /** GET the board now (deduplicated while one is in flight). */
  refresh(): Promise<void> {
    if (this.status.notFound) return Promise.resolve();
    if (this.inflight) return this.inflight;
    const ctrl = new AbortController();
    this.fetchAbort = ctrl;
    this.lastFetchAt = this.deps.now();
    this.inflight = this.deps
      .fetchState(this.gameId, ctrl.signal)
      .then((state) => {
        if (ctrl.signal.aborted) return;
        this.accept(state);
        if (this.status.error) this.setStatus({ error: null });
      })
      .catch((err: unknown) => {
        if (ctrl.signal.aborted) return;
        if (err instanceof ApiError && err.status === 404) {
          this.gone();
          return;
        }
        const error = err instanceof ApiError ? err : new ApiError("Couldn't load this board.", 0);
        this.setStatus({ error });
      })
      .finally(() => {
        if (this.fetchAbort === ctrl) {
          this.fetchAbort = null;
          this.inflight = null;
        }
      });
    return this.inflight;
  }

  /** Apply a server state from anywhere (socket, poll, mutation response). */
  accept(state: GameState): boolean {
    const ok = this.store.receive(state);
    if (ok) primeGame(state);
    return ok;
  }

  /**
   * Run a mutation with an optional optimistic patch. The patch shows
   * immediately, the response's state is applied when it arrives, then the
   * patch is dropped. On failure the patch is rolled back and the error rethrown.
   */
  async mutate<T>(request: () => Promise<T>, patch?: Patch): Promise<T> {
    const id = patch ? this.store.addPatch(patch) : null;
    try {
      const res = await request();
      const state = (res as { state?: unknown } | null)?.state;
      if (state && typeof state === "object" && typeof (state as GameState).version === "number") {
        this.accept(state as GameState);
      }
      return res;
    } finally {
      if (id !== null) this.store.removePatch(id);
    }
  }

  // ---- socket ----

  private connect(): void {
    if (!this.running || this.status.notFound || this.ws) return;
    if (!this.deps.isOnline()) {
      this.setStatus({ connection: "offline" });
      return;
    }
    let ws: SocketLike;
    try {
      ws = this.deps.openSocket(this.deps.socketUrl(this.gameId));
    } catch {
      this.onSocketDown(true);
      return;
    }
    this.ws = ws;
    let opened = false;
    ws.onopen = () => {
      if (this.ws !== ws) return;
      opened = true;
      this.attempt = 0;
      this.lastMessageAt = this.deps.now();
      this.setStatus({ connection: "live" });
      this.startKeepalive();
    };
    ws.onmessage = (ev) => {
      if (this.ws !== ws) return;
      this.lastMessageAt = this.deps.now();
      if (ev.data === "pong") return;
      const msg = parseLiveMessage(ev.data);
      if (!msg) return;
      if (msg.type === "state") this.accept(msg.state);
      else if (msg.type === "presence") this.setStatus({ watching: msg.watching });
      else this.store.receiveActivity(msg.activity);
    };
    ws.onclose = (ev) => {
      if (this.ws !== ws) return;
      this.ws = null;
      if (ev.code === CLOSE_GONE) {
        this.gone();
        return;
      }
      this.onSocketDown(!opened);
    };
    ws.onerror = () => {
      // A close event always follows; reconnection happens there.
    };
  }

  /** `handshakeFailed`: the socket never opened (server down, or the board is gone: the GET tells which). */
  private onSocketDown(handshakeFailed = false): void {
    this.stopKeepalive();
    if (!this.running || this.status.notFound) return;
    const online = this.deps.isOnline();
    this.setStatus({ connection: online ? "polling" : "offline", watching: 0 });
    if (!online) return; // the "online" event reconnects
    // Catch up right away if we haven't heard from the server in a while.
    if (handshakeFailed || this.deps.now() - this.lastFetchAt >= POLL_INTERVAL_MS) void this.refresh();
    this.scheduleReconnect();
  }

  private scheduleReconnect(): void {
    this.clearReconnect();
    const delay = backoffDelay(this.attempt++, this.deps.random);
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.connect();
    }, delay);
  }

  private clearReconnect(): void {
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.reconnectTimer = null;
  }

  private startKeepalive(): void {
    this.stopKeepalive();
    this.keepaliveTimer = setInterval(() => {
      const ws = this.ws;
      if (!ws) return;
      if (this.deps.now() - this.lastMessageAt > STALE_SOCKET_MS) {
        this.dropSocket();
        return;
      }
      try {
        // Answered by the room's auto-response without waking it from hibernation.
        ws.send("ping");
      } catch {
        this.dropSocket();
      }
    }, KEEPALIVE_MS);
  }

  private stopKeepalive(): void {
    if (this.keepaliveTimer) clearInterval(this.keepaliveTimer);
    this.keepaliveTimer = null;
  }

  /** Abandon the current socket (dead or stale) and go through the normal reconnect path. */
  private dropSocket(): void {
    const ws = this.ws;
    this.ws = null;
    if (ws) this.detach(ws, 4000);
    this.onSocketDown();
  }

  private detach(ws: SocketLike, code: number): void {
    ws.onopen = ws.onmessage = ws.onerror = null;
    ws.onclose = null;
    try {
      ws.close(code);
    } catch {
      // already closed
    }
  }

  // ---- lifecycle ----

  /** Back in the foreground / back online: refetch now and reconnect without waiting for backoff. */
  private wake(): void {
    if (!this.running || this.status.notFound) return;
    void this.refresh();
    const ws = this.ws;
    if (ws && ws.readyState === SOCKET_OPEN && this.deps.now() - this.lastMessageAt > KEEPALIVE_MS + 5_000) {
      // iOS keeps suspended sockets looking "open"; don't trust one that has gone quiet.
      this.dropSocket();
    }
    if (!this.ws) {
      this.clearReconnect();
      this.attempt = 0;
      this.connect();
    }
  }

  private pollTick(): void {
    if (!this.running || this.status.notFound) return;
    if (this.ws && this.ws.readyState === SOCKET_OPEN) return;
    if (!this.deps.isVisible() || !this.deps.isOnline()) return;
    void this.refresh();
  }

  private gone(): void {
    this.setStatus({ notFound: true, watching: 0 });
    this.clearReconnect();
    this.stopKeepalive();
    const ws = this.ws;
    this.ws = null;
    if (ws) this.detach(ws, 1000);
  }

  private setStatus(patch: Partial<LiveStatus>): void {
    const next = { ...this.status, ...patch };
    if (
      next.connection === this.status.connection &&
      next.watching === this.status.watching &&
      next.error === this.status.error &&
      next.notFound === this.status.notFound
    ) {
      return;
    }
    this.status = next;
    for (const l of this.statusListeners) l();
  }
}

// ---------------------------------------------------------------------------
// React bindings
// ---------------------------------------------------------------------------

export interface UseGameOptions {
  /** New activity (claims, joins, scores, winners...) for toasts and haptics. Not called for history already on the board. */
  onActivity?: ActivityListener;
}

export interface UseGameResult extends LiveStatus {
  /** Server state with optimistic patches applied; null until the first load. */
  state: GameState | null;
  /** True only while nothing is available to render yet. */
  loading: boolean;
  refresh: () => Promise<void>;
  /** Apply a `{ state }` you got from a mutation outside `mutate`. */
  receive: (state: GameState) => void;
  /** See LiveGame.mutate: optimistic patch + reconcile with the server's response. */
  mutate: <T>(request: () => Promise<T>, patch?: Patch) => Promise<T>;
}

const IDLE_STATUS: LiveStatus = { connection: "connecting", watching: 0, error: null, notFound: false };
const noopSubscribe = () => () => {};
const getNull = () => null;
const getIdle = () => IDLE_STATUS;

export function useGame(id: string | undefined, options: UseGameOptions = {}): UseGameResult {
  const live = useMemo(() => (id ? new LiveGame(id, browserLiveDeps()) : null), [id]);

  useEffect(() => {
    if (!live) return;
    live.start();
    return () => live.stop();
  }, [live]);

  const onActivityRef = useRef(options.onActivity);
  onActivityRef.current = options.onActivity;
  useEffect(() => live?.store.onActivity((a, s) => onActivityRef.current?.(a, s)), [live]);

  const state = useSyncExternalStore(live ? live.store.subscribe : noopSubscribe, live ? live.store.getState : getNull);
  const status = useSyncExternalStore(live ? live.subscribeStatus : noopSubscribe, live ? live.getStatus : getIdle);

  const refresh = useCallback(() => live?.refresh() ?? Promise.resolve(), [live]);
  const receive = useCallback((s: GameState) => void live?.accept(s), [live]);
  const mutate = useCallback(
    <T,>(request: () => Promise<T>, patch?: Patch) => (live ? live.mutate(request, patch) : request()),
    [live],
  );

  return {
    ...status,
    state,
    loading: state === null && !status.error && !status.notFound,
    refresh,
    receive,
    mutate,
  };
}

// ---- Dashboard ----

let myGamesCache: GameSummary[] | null = null;

export interface UseMyGamesResult {
  games: GameSummary[] | null;
  loading: boolean;
  error: ApiError | null;
  refresh: () => Promise<void>;
}

export function useMyGames(): UseMyGamesResult {
  const [games, setGames] = useState<GameSummary[] | null>(myGamesCache);
  const [error, setError] = useState<ApiError | null>(null);
  const inflight = useRef<Promise<void> | null>(null);
  const mounted = useRef(true);

  const refresh = useCallback((): Promise<void> => {
    if (inflight.current) return inflight.current;
    const p = api
      .myGames()
      .then(({ games: next }) => {
        myGamesCache = next;
        if (!mounted.current) return;
        setGames(next);
        setError(null);
      })
      .catch((err: unknown) => {
        if (!mounted.current) return;
        setError(err instanceof ApiError ? err : new ApiError("Couldn't load your boards.", 0));
      })
      .finally(() => {
        inflight.current = null;
      });
    inflight.current = p;
    return p;
  }, []);

  useEffect(() => {
    mounted.current = true;
    void refresh();
    const visible = () => document.visibilityState !== "hidden";
    const onFocus = () => {
      if (visible()) void refresh();
    };
    const timer = setInterval(onFocus, MY_GAMES_INTERVAL_MS);
    window.addEventListener("focus", onFocus);
    window.addEventListener("online", onFocus);
    document.addEventListener("visibilitychange", onFocus);
    return () => {
      mounted.current = false;
      clearInterval(timer);
      window.removeEventListener("focus", onFocus);
      window.removeEventListener("online", onFocus);
      document.removeEventListener("visibilitychange", onFocus);
    };
  }, [refresh]);

  return { games, loading: games === null && !error, error, refresh };
}
