// Home's live feed: one passive live connection (`watch=0`) per board you're
// in that's still moving (filling up or in play), so counts, activity and
// scores change on Home within a second of happening, exactly like on the
// board itself, without showing up in that board's "N watching". Each
// connection is the board's own LiveGame (socket, reconnect with backoff,
// polling fallback, catch-up on resume), so Home gets the same guarantees:
// a followed socket that falls back to polling keeps feeding Home through the
// same store. A board deleted while Home follows it (the room's `deleted`, a
// 4404 close, or a 404 from the fallback GET) drops off Home right away.
// Finished boards are fetched once, only the ones on screen, and again only
// when their summary is newer than the state held (a finished board can still
// change: the host corrects a score or reopens the final).
//
// A state counts as "fresh" (trusted over the summary) only once it came from
// the network; a cached one may be older. And a state older than its board's
// summary never wins (statesNotOlder): a board Home stopped following keeps its
// last state, and the summary moves on without it.
//
// HomeFeed has no React in it (tested with fake follows); useHomeFeed binds it.

import { useCallback, useEffect, useMemo, useRef, useSyncExternalStore } from "react";
import type { Activity, GameState, GameSummary } from "../../../shared/types";
import { api } from "../../lib/api";
import { browserLiveDeps, LiveGame, peekGame, primeGame, type LiveDeps } from "../../lib/live";

/** Never hold more live connections than this from Home. */
export const MAX_FOLLOWED = 12;

/** One board followed live. */
export interface Follow {
  /** Latest server state (cached until the first network one arrives). */
  getState(): GameState | null;
  /** getState() came from the network (not just the cache). */
  isConfirmed(): boolean;
  /** The board was deleted (it stops reconnecting and polling on its own). */
  isGone(): boolean;
  /** Called after every state from the network (socket or polling), on connection changes, and when the board goes away. */
  subscribe(cb: () => void): () => void;
  /** New activity (claims, joins, scores, winners) as it happens. */
  onActivity(cb: (activity: Activity, state: GameState) => void): () => void;
  stop(): void;
}

export interface FeedDeps {
  follow(id: string): Follow;
  fetchOnce(id: string, signal: AbortSignal): Promise<GameState>;
  peek(id: string): GameState | null;
}

/** `liveDeps` is swappable for tests (a fake socket); the real one opens browser WebSockets. */
export function browserFeedDeps(liveDeps: () => LiveDeps = browserLiveDeps): FeedDeps {
  return {
    follow(id) {
      const live = new LiveGame(id, liveDeps());
      // Home already has this board's summary, and the socket sends the full
      // state on connect, so skip the first GET (a socket that can't connect
      // still falls back to one). Passive: Home following your boards doesn't
      // count toward a board's "N watching".
      live.start({ initialFetch: false, passive: true });
      return {
        getState: () => live.store.getServerState(),
        isConfirmed: () => live.store.hasNetworkState(),
        isGone: () => live.getStatus().notFound,
        subscribe: (cb) => {
          const offState = live.store.subscribe(cb);
          // Status too: a socket that gives up because the board is gone says so only there.
          const offStatus = live.subscribeStatus(cb);
          return () => {
            offState();
            offStatus();
          };
        },
        onActivity: (cb) => live.store.onActivity(cb),
        stop: () => live.stop(),
      };
    },
    fetchOnce: async (id, signal) => {
      const s = await api.getGame(id, signal);
      primeGame(s);
      return s;
    },
    peek: peekGame,
  };
}

export type FeedActivityListener = (gameId: string, activity: Activity, state: GameState) => void;

/**
 * The states worth showing next to these summaries: one older than its
 * board's summary (`version`) would undo what the summary already says, so it's
 * left out until a newer one arrives. Same object when nothing is left out.
 */
export function statesNotOlder(
  states: Readonly<Record<string, GameState>>,
  games: readonly Pick<GameSummary, "id" | "version">[],
): Readonly<Record<string, GameState>> {
  let out: Record<string, GameState> | null = null;
  for (const g of games) {
    const s = states[g.id];
    if (!s || g.version === undefined || s.version >= g.version) continue;
    out ??= { ...states };
    delete out[g.id];
  }
  return out ?? states;
}

export interface FeedSnapshot {
  /** Newest known state per board (possibly from the cache). */
  states: Readonly<Record<string, GameState>>;
  /**
   * Boards whose state came from the network while Home was open: trust these
   * over the summary, unless the summary is newer (see statesNotOlder).
   */
  fresh: ReadonlySet<string>;
  /** Boards deleted while Home followed them: hide them until the summary list catches up. */
  gone: ReadonlySet<string>;
}

export class HomeFeed {
  private follows = new Map<string, { follow: Follow; unsubs: (() => void)[] }>();
  private fetches = new Map<string, AbortController>();
  private states: Record<string, GameState> = {};
  private fresh = new Set<string>();
  private gone = new Set<string>();
  private snap: FeedSnapshot = { states: this.states, fresh: this.fresh, gone: this.gone };
  private listeners = new Set<() => void>();
  private activityListeners = new Set<FeedActivityListener>();

  constructor(private readonly deps: FeedDeps) {}

  getSnapshot = (): FeedSnapshot => this.snap;

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  onActivity(listener: FeedActivityListener): () => void {
    this.activityListeners.add(listener);
    return () => this.activityListeners.delete(listener);
  }

  /** Board ids currently followed live. */
  get following(): string[] {
    return [...this.follows.keys()];
  }

  /**
   * Follow `live` boards in real time (capped at MAX_FOLLOWED, in the order
   * given), fetch `once` boards a single time, and stop following the rest.
   * `versions` are the summaries' (GameSummary.version): a `once` board whose
   * state is older than its summary is fetched again, and without a version a
   * cached state isn't taken as current.
   */
  sync(live: readonly string[], once: readonly string[] = [], versions: Readonly<Record<string, number>> = {}): void {
    const want = new Set(live.filter((id) => !this.gone.has(id)).slice(0, MAX_FOLLOWED));
    for (const id of [...this.follows.keys()]) if (!want.has(id)) this.unfollow(id);
    for (const id of want) if (!this.follows.has(id)) this.startFollow(id);
    for (const id of once) {
      if (want.has(id) || this.fetches.has(id) || this.gone.has(id)) continue;
      const summary = versions[id];
      const held = this.states[id];
      // Already from the network (fetched, or followed until it finished) and not behind the summary.
      if (this.fresh.has(id) && held && (summary === undefined || held.version >= summary)) continue;
      const cached = this.deps.peek(id);
      // A cached state is as good as new only when the summary says nothing changed since.
      if (cached && summary !== undefined && cached.version >= summary) {
        this.put(id, cached, true);
        continue;
      }
      if (cached) this.put(id, cached, false);
      const ctrl = new AbortController();
      this.fetches.set(id, ctrl);
      this.deps
        .fetchOnce(id, ctrl.signal)
        .then((s) => {
          if (!ctrl.signal.aborted) this.put(id, s, true);
        })
        .catch(() => {
          // The row still renders from its summary.
        })
        .finally(() => {
          if (this.fetches.get(id) === ctrl) this.fetches.delete(id);
        });
    }
  }

  /** Close every connection (states stay, so a quick return renders instantly). */
  stop(): void {
    for (const id of [...this.follows.keys()]) this.unfollow(id);
    for (const ctrl of this.fetches.values()) ctrl.abort();
    this.fetches.clear();
  }

  private startFollow(id: string): void {
    const follow = this.deps.follow(id);
    const initial = follow.getState() ?? this.deps.peek(id);
    if (initial) this.put(id, initial, false);
    const unsubs = [
      follow.subscribe(() => {
        if (follow.isGone()) {
          this.drop(id);
          return;
        }
        // Connection changes notify too, before any state arrives: only a state
        // from the network is fresh (a cached one may be older than the summary).
        const s = follow.getState();
        if (s) this.put(id, s, follow.isConfirmed());
      }),
      follow.onActivity((activity, state) => {
        for (const l of this.activityListeners) {
          try {
            l(id, activity, state);
          } catch (err) {
            console.error("home activity listener failed", err);
          }
        }
      }),
    ];
    this.follows.set(id, { follow, unsubs });
  }

  private unfollow(id: string): void {
    const f = this.follows.get(id);
    if (!f) return;
    this.follows.delete(id);
    for (const u of f.unsubs) u();
    f.follow.stop();
  }

  /** The board was deleted: stop following it and forget its state. */
  private drop(id: string): void {
    if (this.gone.has(id)) return;
    this.unfollow(id);
    const states = { ...this.states };
    delete states[id];
    this.states = states;
    this.fresh = new Set(this.fresh);
    this.fresh.delete(id);
    this.gone = new Set(this.gone).add(id);
    this.emit();
  }

  private put(id: string, s: GameState, fromNetwork: boolean): void {
    const cur = this.states[id];
    if (cur && s.version < cur.version) return;
    const freshChanged = fromNetwork && !this.fresh.has(id);
    if (cur === s && !freshChanged) return;
    if (cur !== s) this.states = { ...this.states, [id]: s };
    if (freshChanged) this.fresh = new Set(this.fresh).add(id);
    this.emit();
  }

  private emit(): void {
    this.snap = { states: this.states, fresh: this.fresh, gone: this.gone };
    for (const l of this.listeners) l();
  }
}

export interface UseHomeFeed {
  snapshot: FeedSnapshot;
  /** Set which boards to follow live and which to fetch once, with their summaries' versions (call from an effect). */
  sync: (live: readonly string[], once: readonly string[], versions?: Readonly<Record<string, number>>) => void;
}

export function useHomeFeed(onActivity?: FeedActivityListener, deps?: FeedDeps): UseHomeFeed {
  const feed = useMemo(() => new HomeFeed(deps ?? browserFeedDeps()), [deps]);
  useEffect(() => () => feed.stop(), [feed]);

  const onActivityRef = useRef(onActivity);
  onActivityRef.current = onActivity;
  useEffect(() => feed.onActivity((id, a, s) => onActivityRef.current?.(id, a, s)), [feed]);

  const snapshot = useSyncExternalStore(feed.subscribe, feed.getSnapshot);
  const sync = useCallback(
    (live: readonly string[], once: readonly string[], versions?: Readonly<Record<string, number>>) => feed.sync(live, once, versions),
    [feed],
  );
  return { snapshot, sync };
}
