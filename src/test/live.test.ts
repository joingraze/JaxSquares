import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Activity, GameState } from "../../shared/types";
import { ApiError } from "../lib/api";
import {
  GameStore,
  LiveGame,
  POLL_INTERVAL_MS,
  backoffDelay,
  browserLiveDeps,
  claimPatch,
  liveSocketUrl,
  parseLiveMessage,
  releasePatch,
  shouldAccept,
  type LiveDeps,
  type SocketLike,
} from "../lib/live";

// ---- fixtures ----

function activity(id: string, at: number, type: Activity["type"] = "claimed"): Activity {
  return { id, type, at, actor: "p1", data: {} };
}

function makeState(version: number, overrides: Partial<GameState> = {}): GameState {
  return {
    game: {
      id: "g1",
      name: "Test board",
      sport: "football",
      league: "custom",
      teamX: { name: "X" },
      teamY: { name: "Y" },
      format: { periods: "quarters", reverse: false, boardSize: 100, freshNumbers: false },
      periods: [],
      prizes: {},
      maxPerPlayer: 0,
      numbers: null,
      status: "open",
      linkedEvent: null,
      hostPlayerId: "host",
      createdAt: 0,
      lockedAt: null,
    },
    players: [],
    squares: [],
    scores: [],
    manualWinners: [],
    live: null,
    activity: [],
    version,
    ...overrides,
  };
}

// ---- pure helpers ----

describe("shouldAccept", () => {
  it("accepts the first state and anything not older", () => {
    expect(shouldAccept(null, makeState(1))).toBe(true);
    expect(shouldAccept(makeState(5), makeState(6))).toBe(true);
    expect(shouldAccept(makeState(5), makeState(5))).toBe(true);
  });

  it("rejects stale states", () => {
    expect(shouldAccept(makeState(5), makeState(4))).toBe(false);
  });
});

describe("backoffDelay", () => {
  it("grows exponentially with jitter between half and all of the ceiling", () => {
    expect(backoffDelay(0, () => 0)).toBe(250);
    expect(backoffDelay(0, () => 1)).toBe(500);
    expect(backoffDelay(3, () => 0)).toBe(2000);
    expect(backoffDelay(3, () => 1)).toBe(4000);
  });

  it("caps at 15s", () => {
    expect(backoffDelay(20, () => 1)).toBe(15_000);
    expect(backoffDelay(20, () => 0)).toBe(7_500);
  });
});

describe("liveSocketUrl", () => {
  it("derives wss from an https API base (native app)", () => {
    expect(liveSocketUrl("abc", "pid-1234567890123456789", "https://jaxsquares.com")).toBe(
      "wss://jaxsquares.com/api/games/abc/live?player=pid-1234567890123456789",
    );
  });

  it("derives ws from an http API base", () => {
    expect(liveSocketUrl("abc", "c", "http://localhost:8787/")).toBe("ws://localhost:8787/api/games/abc/live?player=c");
  });

  it("adds watch=0 for a passive listener, and nothing by default", () => {
    expect(liveSocketUrl("abc", "c", "https://jaxsquares.com", undefined, { passive: true })).toBe(
      "wss://jaxsquares.com/api/games/abc/live?player=c&watch=0",
    );
    expect(liveSocketUrl("abc", "c", "https://jaxsquares.com", undefined, { passive: false })).toBe(
      "wss://jaxsquares.com/api/games/abc/live?player=c",
    );
  });

  it("uses the page origin when there is no API base", () => {
    expect(liveSocketUrl("a b", "c", "", { protocol: "https:", host: "jaxsquares.com" })).toBe(
      "wss://jaxsquares.com/api/games/a%20b/live?player=c",
    );
    expect(liveSocketUrl("a", "c", "", { protocol: "http:", host: "localhost:5173" })).toBe(
      "ws://localhost:5173/api/games/a/live?player=c",
    );
  });
});

describe("browserLiveDeps", () => {
  it("puts the public player id in the socket URL, never the clientId", async () => {
    const { getClientId, getPlayerId } = await import("../lib/identity");
    const url = browserLiveDeps().socketUrl("abc");
    expect(url).toContain(`player=${encodeURIComponent(getPlayerId())}`);
    expect(url).not.toContain(getClientId());
    expect(url).not.toContain("clientId");
    expect(url).not.toContain("watch=");
    expect(browserLiveDeps().socketUrl("abc", { passive: true })).toMatch(/&watch=0$/);
  });
});

describe("parseLiveMessage", () => {
  it("parses the server messages", () => {
    const state = makeState(3);
    expect(parseLiveMessage(JSON.stringify({ type: "state", state }))).toEqual({ type: "state", state });
    expect(parseLiveMessage(JSON.stringify({ type: "presence", watching: 4 }))).toEqual({ type: "presence", watching: 4 });
    const a = activity("a1", 1);
    expect(parseLiveMessage(JSON.stringify({ type: "event", activity: a }))).toEqual({ type: "event", activity: a });
    expect(parseLiveMessage(JSON.stringify({ type: "deleted" }))).toEqual({ type: "deleted" });
  });

  it("ignores keepalive replies, junk and unknown types", () => {
    expect(parseLiveMessage("pong")).toBeNull();
    expect(parseLiveMessage("{nope")).toBeNull();
    expect(parseLiveMessage(JSON.stringify({ type: "pong" }))).toBeNull();
    expect(parseLiveMessage(JSON.stringify({ type: "state", state: {} }))).toBeNull();
    expect(parseLiveMessage(new ArrayBuffer(2))).toBeNull();
  });
});

describe("claimPatch / releasePatch", () => {
  it("claims only free cells and respects the per-player limit", () => {
    const base = makeState(1, { squares: [{ row: 0, col: 0, playerId: "other", claimedAt: 1 }] });
    base.game.maxPerPlayer = 2;
    const next = claimPatch("me", [
      { row: 0, col: 0 },
      { row: 0, col: 1 },
      { row: 0, col: 2 },
      { row: 0, col: 3 },
    ], 5)(base);
    expect(next.squares.filter((s) => s.playerId === "me").map((s) => s.col)).toEqual([1, 2]);
    expect(base.squares).toHaveLength(1); // input untouched
  });

  it("returns the same state when nothing changes", () => {
    const base = makeState(1, { squares: [{ row: 1, col: 1, playerId: "other", claimedAt: 1 }] });
    expect(claimPatch("me", [{ row: 1, col: 1 }])(base)).toBe(base);
    expect(releasePatch("me", [{ row: 1, col: 1 }])(base)).toBe(base);
  });

  it("releases only my own squares", () => {
    const base = makeState(1, {
      squares: [
        { row: 0, col: 0, playerId: "me", claimedAt: 1 },
        { row: 0, col: 1, playerId: "other", claimedAt: 1 },
      ],
    });
    const next = releasePatch("me", [{ row: 0, col: 0 }, { row: 0, col: 1 }])(base);
    expect(next.squares).toEqual([{ row: 0, col: 1, playerId: "other", claimedAt: 1 }]);
  });
});

// ---- GameStore: versions + optimistic reconcile ----

describe("GameStore", () => {
  it("ignores states older than the one held", () => {
    const store = new GameStore();
    expect(store.receive(makeState(3))).toBe(true);
    expect(store.receive(makeState(2))).toBe(false);
    expect(store.getState()?.version).toBe(3);
  });

  it("keeps a stable view reference until something changes", () => {
    const store = new GameStore(makeState(1));
    const a = store.getState();
    expect(store.getState()).toBe(a);
    store.receive(makeState(2));
    expect(store.getState()).not.toBe(a);
  });

  it("shows optimistic patches on top of the server state and rebases them onto newer states", () => {
    const store = new GameStore(makeState(1));
    const listener = vi.fn();
    store.subscribe(listener);
    const id = store.addPatch(claimPatch("me", [{ row: 2, col: 3 }]));
    expect(store.getState()?.squares).toHaveLength(1);
    expect(store.getServerState()?.squares).toHaveLength(0);

    // Someone else's claim arrives while ours is in flight: both show.
    store.receive(makeState(2, { squares: [{ row: 5, col: 5, playerId: "other", claimedAt: 1 }] }));
    expect(store.getState()?.squares.map((s) => s.playerId).sort()).toEqual(["me", "other"]);

    // Our request settles with a state that includes our claim: patch removed, no duplicate.
    store.receive(
      makeState(3, {
        squares: [
          { row: 5, col: 5, playerId: "other", claimedAt: 1 },
          { row: 2, col: 3, playerId: "me", claimedAt: 2 },
        ],
      }),
    );
    store.removePatch(id);
    expect(store.getState()?.squares).toHaveLength(2);
    expect(store.hasPending).toBe(false);
    expect(listener).toHaveBeenCalled();
  });

  it("rolls back when a patch is removed without a server state (failed request)", () => {
    const store = new GameStore(makeState(1));
    const id = store.addPatch(claimPatch("me", [{ row: 0, col: 0 }]));
    expect(store.getState()?.squares).toHaveLength(1);
    store.removePatch(id);
    expect(store.getState()?.squares).toHaveLength(0);
  });

  it("skips a patch that throws instead of breaking the view", () => {
    const store = new GameStore(makeState(1));
    store.addPatch(() => {
      throw new Error("bad patch");
    });
    expect(store.getState()?.version).toBe(1);
  });

  describe("activity", () => {
    let store: GameStore;
    let heard: string[];
    beforeEach(() => {
      store = new GameStore(makeState(1, { activity: [activity("old", 1)] }));
      heard = [];
      store.onActivity((a) => heard.push(a.id));
    });

    it("never announces history: not from the cache, not from the first network state", () => {
      store.receive(makeState(2, { activity: [activity("before-open", 2), activity("old", 1)] }));
      expect(heard).toEqual([]);
    });

    it("announces new activity oldest-first once confirmed", () => {
      store.receive(makeState(2, { activity: [activity("old", 1)] }));
      store.receive(makeState(3, { activity: [activity("b", 30), activity("a", 20), activity("old", 1)] }));
      expect(heard).toEqual(["a", "b"]);
    });

    it("announces a live event once even when a state carrying it follows", () => {
      store.receive(makeState(2));
      store.receiveActivity(activity("e1", 10));
      store.receive(makeState(3, { activity: [activity("e1", 10)] }));
      expect(heard).toEqual(["e1"]);
    });

    it("caps a burst (e.g. after a reconnect) to the newest few", () => {
      store.receive(makeState(2));
      const many = Array.from({ length: 8 }, (_, i) => activity(`m${i}`, 100 + i)).reverse();
      store.receive(makeState(3, { activity: many }));
      expect(heard).toEqual(["m5", "m6", "m7"]);
    });

    it("does not announce from a stale state", () => {
      store.receive(makeState(5));
      store.receive(makeState(4, { activity: [activity("stale", 50)] }));
      expect(heard).toEqual([]);
    });
  });
});

// ---- LiveGame: socket, reconnect, polling ----

class FakeSocket implements SocketLike {
  readyState = 0;
  onopen: ((ev: Event) => void) | null = null;
  onmessage: ((ev: MessageEvent) => void) | null = null;
  onclose: ((ev: CloseEvent) => void) | null = null;
  onerror: ((ev: Event) => void) | null = null;
  sent: string[] = [];
  closedWith: number | null = null;
  constructor(readonly url: string) {}
  send(data: string) {
    this.sent.push(data);
  }
  close(code = 1000) {
    this.closedWith = code;
    this.readyState = 3;
  }
  // test helpers
  open() {
    this.readyState = 1;
    this.onopen?.(new Event("open"));
  }
  message(data: unknown) {
    this.onmessage?.({ data: typeof data === "string" ? data : JSON.stringify(data) } as MessageEvent);
  }
  drop(code = 1006) {
    this.readyState = 3;
    this.onclose?.({ code } as CloseEvent);
  }
}

function harness(fetchImpl?: () => Promise<GameState>) {
  const sockets: FakeSocket[] = [];
  let resume: (() => void) | null = null;
  let network: ((online: boolean) => void) | null = null;
  let online = true;
  const fetchState = vi.fn(fetchImpl ?? (() => Promise.resolve(makeState(1))));
  const deps: LiveDeps = {
    fetchState,
    openSocket: (url) => {
      const s = new FakeSocket(url);
      sockets.push(s);
      return s;
    },
    socketUrl: (id, opts) => `wss://test/api/games/${id}/live${opts?.passive ? "?watch=0" : ""}`,
    random: () => 0,
    now: () => Date.now(),
    isOnline: () => online,
    isVisible: () => true,
    onResume: (cb) => {
      resume = cb;
      return () => (resume = null);
    },
    onNetwork: (cb) => {
      network = cb;
      return () => (network = null);
    },
  };
  return {
    deps,
    sockets,
    fetchState,
    resume: () => resume?.(),
    setOnline: (v: boolean) => {
      online = v;
      network?.(v);
    },
  };
}

describe("LiveGame", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("loads, connects, and applies only newer socket states", async () => {
    const h = harness(() => Promise.resolve(makeState(2)));
    const live = new LiveGame("g-load", h.deps, null);
    live.start();
    await vi.advanceTimersByTimeAsync(0);
    expect(h.fetchState).toHaveBeenCalledTimes(1);
    expect(live.store.getState()?.version).toBe(2);
    expect(h.sockets).toHaveLength(1);

    h.sockets[0].open();
    expect(live.getStatus().connection).toBe("live");
    h.sockets[0].message({ type: "state", state: makeState(1) });
    expect(live.store.getState()?.version).toBe(2);
    h.sockets[0].message({ type: "state", state: makeState(4) });
    expect(live.store.getState()?.version).toBe(4);
    h.sockets[0].message({ type: "presence", watching: 7 });
    expect(live.getStatus().watching).toBe(7);
    h.sockets[0].message("pong");
    live.stop();
  });

  it("by default GETs on start and opens a counted (non-passive) socket", async () => {
    const h = harness();
    const live = new LiveGame("g-defaults", h.deps, null);
    live.start();
    await vi.advanceTimersByTimeAsync(0);
    expect(h.fetchState).toHaveBeenCalledTimes(1);
    expect(h.sockets[0].url).not.toContain("watch=0");
    live.stop();
  });

  it("initialFetch: false skips the GET and takes the state from the socket", async () => {
    const h = harness(() => Promise.resolve(makeState(9)));
    const live = new LiveGame("g-nofetch", h.deps, null);
    live.start({ initialFetch: false });
    await vi.advanceTimersByTimeAsync(0);
    expect(h.fetchState).not.toHaveBeenCalled();
    expect(h.sockets).toHaveLength(1);
    h.sockets[0].open();
    h.sockets[0].message({ type: "state", state: makeState(3) });
    expect(live.store.getState()?.version).toBe(3);
    // Still no GET while the socket is live.
    await vi.advanceTimersByTimeAsync(POLL_INTERVAL_MS * 2);
    expect(h.fetchState).not.toHaveBeenCalled();
    live.stop();
  });

  it("initialFetch: false still falls back to a GET when the socket can't connect", async () => {
    const h = harness(() => Promise.resolve(makeState(4)));
    const live = new LiveGame("g-nofetch-fallback", h.deps, null);
    live.start({ initialFetch: false });
    await vi.advanceTimersByTimeAsync(0);
    expect(h.fetchState).not.toHaveBeenCalled();
    h.sockets[0].drop(1006); // handshake failed: never opened
    await vi.advanceTimersByTimeAsync(0);
    expect(h.fetchState).toHaveBeenCalledTimes(1);
    expect(live.store.getState()?.version).toBe(4);
    expect(live.getStatus().connection).toBe("polling");
    live.stop();
  });

  it("passive: every socket, including reconnects, asks not to be counted as watching", async () => {
    const h = harness();
    const live = new LiveGame("g-passive", h.deps, null);
    live.start({ passive: true });
    await vi.advanceTimersByTimeAsync(0);
    expect(h.fetchState).toHaveBeenCalledTimes(1); // passive alone keeps the initial GET
    expect(h.sockets[0].url).toContain("watch=0");
    h.sockets[0].open();
    h.sockets[0].drop();
    await vi.advanceTimersByTimeAsync(250);
    expect(h.sockets).toHaveLength(2);
    expect(h.sockets[1].url).toContain("watch=0");
    live.stop();
  });

  it("reconnects with backoff and polls every 15s while the socket is down", async () => {
    const h = harness();
    const live = new LiveGame("g-reconnect", h.deps, null);
    live.start();
    await vi.advanceTimersByTimeAsync(0);
    h.sockets[0].open();
    h.fetchState.mockClear();

    h.sockets[0].drop();
    expect(live.getStatus().connection).toBe("polling");
    // random() = 0 -> first retry after 250ms
    await vi.advanceTimersByTimeAsync(249);
    expect(h.sockets).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(h.sockets).toHaveLength(2);

    // That attempt fails too: next retry waits longer (500ms).
    h.sockets[1].drop();
    await vi.advanceTimersByTimeAsync(499);
    expect(h.sockets).toHaveLength(2);
    await vi.advanceTimersByTimeAsync(1);
    expect(h.sockets).toHaveLength(3);

    // Still down: the poll timer fetches.
    h.sockets[2].drop();
    const before = h.fetchState.mock.calls.length;
    await vi.advanceTimersByTimeAsync(POLL_INTERVAL_MS);
    expect(h.fetchState.mock.calls.length).toBeGreaterThan(before);
    live.stop();
  });

  it("does not poll while the socket is live", async () => {
    const h = harness();
    const live = new LiveGame("g-nopoll", h.deps, null);
    live.start();
    await vi.advanceTimersByTimeAsync(0);
    h.sockets[0].open();
    h.fetchState.mockClear();
    await vi.advanceTimersByTimeAsync(POLL_INTERVAL_MS * 3);
    expect(h.fetchState).not.toHaveBeenCalled();
    // Keepalive pings go out on the open socket.
    expect(h.sockets[0].sent).toContain("ping");
    live.stop();
  });

  it("treats close code 4404 as a deleted board and stops reconnecting", async () => {
    const h = harness();
    const live = new LiveGame("g-gone", h.deps, null);
    live.start();
    await vi.advanceTimersByTimeAsync(0);
    h.sockets[0].open();
    h.sockets[0].drop(4404);
    expect(live.getStatus().notFound).toBe(true);
    await vi.advanceTimersByTimeAsync(60_000);
    expect(h.sockets).toHaveLength(1);
    live.stop();
  });

  it("treats a { type: 'deleted' } message as a deleted board, even before the close arrives", async () => {
    const h = harness();
    const live = new LiveGame("g-deleted", h.deps, null);
    live.start();
    await vi.advanceTimersByTimeAsync(0);
    const s = h.sockets[0];
    s.open();
    s.message({ type: "deleted" });
    expect(live.getStatus().notFound).toBe(true);
    expect(s.closedWith).toBe(1000);
    h.fetchState.mockClear();
    await vi.advanceTimersByTimeAsync(60_000);
    expect(h.sockets).toHaveLength(1);
    expect(h.fetchState).not.toHaveBeenCalled();
    live.stop();
  });

  it("checks with a GET when a reconnect handshake fails, so a deleted board is noticed quickly", async () => {
    let gone = false;
    const h = harness(() => (gone ? Promise.reject(new ApiError("Not found", 404)) : Promise.resolve(makeState(1))));
    const live = new LiveGame("g-handshake", h.deps, null);
    live.start();
    await vi.advanceTimersByTimeAsync(0);
    h.sockets[0].open();
    h.sockets[0].drop(1006); // connection lost (no 4404 delivered)
    gone = true;
    await vi.advanceTimersByTimeAsync(250);
    h.sockets[1].drop(1006); // upgrade rejected: never opened
    await vi.advanceTimersByTimeAsync(0);
    expect(live.getStatus().notFound).toBe(true);
    live.stop();
  });

  it("marks a 404 from the initial load as not found", async () => {
    const h = harness(() => Promise.reject(new ApiError("Not found", 404)));
    const live = new LiveGame("g-404", h.deps, null);
    live.start();
    await vi.advanceTimersByTimeAsync(0);
    expect(live.getStatus().notFound).toBe(true);
    live.stop();
  });

  it("keeps the last state and reports an error when a load fails", async () => {
    const h = harness(() => Promise.reject(new ApiError("You're offline.", 0)));
    const live = new LiveGame("g-err", h.deps, makeState(3));
    live.start();
    await vi.advanceTimersByTimeAsync(0);
    expect(live.getStatus().error?.status).toBe(0);
    expect(live.store.getState()?.version).toBe(3);
    live.stop();
  });

  it("refetches and reconnects right away when the app resumes", async () => {
    const h = harness();
    const live = new LiveGame("g-resume", h.deps, null);
    live.start();
    await vi.advanceTimersByTimeAsync(0);
    h.sockets[0].open();
    h.sockets[0].drop();
    h.fetchState.mockClear();
    h.resume();
    expect(h.fetchState).toHaveBeenCalledTimes(1);
    expect(h.sockets).toHaveLength(2); // no backoff wait
    live.stop();
  });

  it("goes offline without hammering, and reconnects when the network returns", async () => {
    const h = harness();
    const live = new LiveGame("g-offline", h.deps, null);
    live.start();
    await vi.advanceTimersByTimeAsync(0);
    h.setOnline(false);
    h.sockets[0].drop();
    expect(live.getStatus().connection).toBe("offline");
    await vi.advanceTimersByTimeAsync(60_000);
    expect(h.sockets).toHaveLength(1);
    h.setOnline(true);
    expect(h.sockets).toHaveLength(2);
    live.stop();
  });

  it("mutate: shows the patch immediately, then reconciles with the response", async () => {
    const h = harness();
    const live = new LiveGame("g-mutate", h.deps, makeState(1));
    let resolve!: (v: { state: GameState }) => void;
    const pending = live.mutate(
      () => new Promise<{ state: GameState }>((r) => (resolve = r)),
      claimPatch("me", [{ row: 1, col: 1 }]),
    );
    expect(live.store.getState()?.squares).toHaveLength(1);
    resolve({ state: makeState(2, { squares: [{ row: 1, col: 1, playerId: "me", claimedAt: 9 }] }) });
    await pending;
    expect(live.store.hasPending).toBe(false);
    expect(live.store.getState()?.version).toBe(2);
    expect(live.store.getState()?.squares).toHaveLength(1);
  });

  it("mutate: rolls back and rethrows on failure", async () => {
    const h = harness();
    const live = new LiveGame("g-rollback", h.deps, makeState(1));
    const err = new ApiError("Someone beat you to it.", 409);
    const pending = live.mutate(() => Promise.reject(err), claimPatch("me", [{ row: 0, col: 0 }]));
    expect(live.store.getState()?.squares).toHaveLength(1);
    await expect(pending).rejects.toBe(err);
    expect(live.store.getState()?.squares).toHaveLength(0);
  });

  it("stop closes the socket and nothing fires afterwards", async () => {
    const h = harness();
    const live = new LiveGame("g-stop", h.deps, null);
    live.start();
    await vi.advanceTimersByTimeAsync(0);
    const s = h.sockets[0];
    s.open();
    live.stop();
    expect(s.closedWith).toBe(1000);
    h.fetchState.mockClear();
    await vi.advanceTimersByTimeAsync(120_000);
    expect(h.fetchState).not.toHaveBeenCalled();
    expect(h.sockets).toHaveLength(1);
  });
});
