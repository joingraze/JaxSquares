import { describe, expect, it, vi } from "vitest";
import type { Activity, GameState } from "../../../shared/types";
import { primeGame, type LiveDeps, type SocketLike } from "../../lib/live";
import { browserFeedDeps, HomeFeed, MAX_FOLLOWED, statesNotOlder, type FeedDeps, type Follow } from "./homeFeed";

function state(id: string, version: number, status: GameState["game"]["status"] = "open"): GameState {
  return {
    game: {
      id,
      name: id,
      sport: "football",
      league: "custom",
      teamX: { name: "A" },
      teamY: { name: "B" },
      format: { periods: "quarters", reverse: false, boardSize: 100, freshNumbers: false },
      periods: [],
      prizes: {},
      maxPerPlayer: 0,
      numbers: null,
      status,
      linkedEvent: null,
      hostPlayerId: "h",
      createdAt: 1,
      lockedAt: null,
    },
    players: [],
    squares: [],
    scores: [],
    manualWinners: [],
    live: null,
    activity: [],
    version,
  };
}

class FakeFollow implements Follow {
  state: GameState | null;
  stopped = false;
  gone = false;
  confirmed = false;
  private subs = new Set<() => void>();
  private acts = new Set<(a: Activity, s: GameState) => void>();
  constructor(initial: GameState | null) {
    this.state = initial;
  }
  getState = () => this.state;
  isConfirmed = () => this.confirmed;
  isGone = () => this.gone;
  subscribe = (cb: () => void) => {
    this.subs.add(cb);
    return () => this.subs.delete(cb);
  };
  onActivity = (cb: (a: Activity, s: GameState) => void) => {
    this.acts.add(cb);
    return () => this.acts.delete(cb);
  };
  stop = () => {
    this.stopped = true;
  };
  /** A state arriving from the network. */
  receive(s: GameState) {
    this.state = s;
    this.confirmed = true;
    for (const cb of this.subs) cb();
  }
  /** A connection change (socket open, fallback to polling, an error): no new state. */
  notify() {
    for (const cb of this.subs) cb();
  }
  event(a: Activity) {
    for (const cb of this.acts) cb(a, this.state!);
  }
  /** The board was deleted (socket `deleted`/4404, or a 404 from the polling fallback). */
  delete() {
    this.gone = true;
    for (const cb of this.subs) cb();
  }
}

function setup(cache: Record<string, GameState> = {}, fetched: (id: string) => GameState = (id) => state(id, 9, "final")) {
  const follows = new Map<string, FakeFollow>();
  const fetchOnce = vi.fn(async (id: string) => fetched(id));
  const deps: FeedDeps = {
    follow: (id) => {
      const f = new FakeFollow(cache[id] ?? null);
      follows.set(id, f);
      return f;
    },
    fetchOnce,
    peek: (id) => cache[id] ?? null,
  };
  return { feed: new HomeFeed(deps), follows, fetchOnce };
}

describe("HomeFeed", () => {
  it("follows boards live and marks network states fresh (cached ones aren't)", () => {
    const { feed, follows } = setup({ a: state("a", 1) });
    const changed = vi.fn();
    feed.subscribe(changed);
    feed.sync(["a", "b"]);
    expect(feed.following).toEqual(["a", "b"]);
    expect(feed.getSnapshot().states.a.version).toBe(1);
    expect(feed.getSnapshot().fresh.has("a")).toBe(false);

    follows.get("a")!.receive(state("a", 2));
    follows.get("b")!.receive(state("b", 5));
    const snap = feed.getSnapshot();
    expect(snap.states.a.version).toBe(2);
    expect([...snap.fresh].sort()).toEqual(["a", "b"]);
    expect(changed).toHaveBeenCalled();
  });

  it("never goes back to an older version", () => {
    const { feed, follows } = setup();
    feed.sync(["a"]);
    follows.get("a")!.receive(state("a", 4));
    follows.get("a")!.receive(state("a", 3));
    expect(feed.getSnapshot().states.a.version).toBe(4);
  });

  it("stops boards it no longer needs and caps how many it holds", () => {
    const { feed, follows } = setup();
    const ids = Array.from({ length: MAX_FOLLOWED + 3 }, (_, i) => `g${i}`);
    feed.sync(ids);
    expect(feed.following).toHaveLength(MAX_FOLLOWED);
    feed.sync(["g0"]);
    expect(feed.following).toEqual(["g0"]);
    expect(follows.get("g1")!.stopped).toBe(true);
    expect(follows.get("g0")!.stopped).toBe(false);
    feed.stop();
    expect(follows.get("g0")!.stopped).toBe(true);
    // Reversible (React may stop and restart effects).
    feed.sync(["g0"]);
    expect(feed.following).toEqual(["g0"]);
  });

  it("fetches finished boards once, or not at all when the cached one is as new as the summary", async () => {
    const { feed, fetchOnce } = setup({ done: state("done", 7, "final") });
    feed.sync([], ["done", "old"], { done: 7, old: 9 });
    feed.sync([], ["done", "old"], { done: 7, old: 9 });
    expect(fetchOnce).toHaveBeenCalledTimes(1);
    expect(fetchOnce.mock.calls[0][0]).toBe("old");
    await vi.waitFor(() => expect(feed.getSnapshot().fresh.has("old")).toBe(true));
    expect(feed.getSnapshot().fresh.has("done")).toBe(true);
    feed.sync([], ["old"], { old: 9 });
    expect(fetchOnce).toHaveBeenCalledTimes(1);
  });

  // The host typed a wrong Final (v6), then deleted it and entered the right one (v8).
  it("fetches a finished board again once its summary is newer than the state Home followed it to", async () => {
    const { feed, follows, fetchOnce } = setup({}, (id) => state(id, 8, "final"));
    feed.sync(["g"], [], { g: 5 });
    follows.get("g")!.receive(state("g", 6, "final"));
    // It's final now, so Home stops following it; v6 is still the newest it knows.
    feed.sync([], ["g"], { g: 6 });
    expect(follows.get("g")!.stopped).toBe(true);
    expect(fetchOnce).not.toHaveBeenCalled();
    expect(feed.getSnapshot().fresh.has("g")).toBe(true);
    // The summary moves past it: fetched again.
    feed.sync([], ["g"], { g: 8 });
    expect(fetchOnce).toHaveBeenCalledTimes(1);
    await vi.waitFor(() => expect(feed.getSnapshot().states.g.version).toBe(8));
    expect(feed.getSnapshot().fresh.has("g")).toBe(true);
    feed.sync([], ["g"], { g: 8 });
    expect(fetchOnce).toHaveBeenCalledTimes(1);
  });

  it("doesn't take a cached finished board as current on a new Home unless its summary agrees", async () => {
    const cache = { g: state("g", 6, "final") };
    // Home remounts with the stale v6 in the cache; the summary is at v8.
    const first = setup(cache, (id) => state(id, 8, "final"));
    first.feed.sync([], ["g"], { g: 8 });
    expect(first.fetchOnce).toHaveBeenCalledTimes(1);
    expect(first.feed.getSnapshot().fresh.has("g")).toBe(false);
    await vi.waitFor(() => expect(first.feed.getSnapshot().states.g.version).toBe(8));
    expect(first.feed.getSnapshot().fresh.has("g")).toBe(true);
    // No summary version to compare with: fetched rather than trusted.
    const second = setup(cache, (id) => state(id, 8, "final"));
    second.feed.sync([], ["g"]);
    expect(second.fetchOnce).toHaveBeenCalledTimes(1);
    expect(second.feed.getSnapshot().fresh.has("g")).toBe(false);
  });

  it("doesn't trust a cached state on a connection change, only once the board's own state arrives", () => {
    const { feed, follows } = setup({ a: state("a", 5) });
    feed.sync(["a"]);
    const a = follows.get("a")!;
    a.notify(); // socket open, or a fallback GET that failed: still the cached v5
    expect(feed.getSnapshot().states.a.version).toBe(5);
    expect(feed.getSnapshot().fresh.has("a")).toBe(false);
    a.receive(state("a", 9));
    expect(feed.getSnapshot().states.a.version).toBe(9);
    expect(feed.getSnapshot().fresh.has("a")).toBe(true);
  });

  it("keeps taking states while a followed board is on its polling fallback", () => {
    const { feed, follows } = setup();
    feed.sync(["a"]);
    const a = follows.get("a")!;
    a.receive(state("a", 2)); // socket
    a.receive(state("a", 3)); // socket dropped: the next state comes from a poll through the same store
    expect(feed.getSnapshot().states.a.version).toBe(3);
    expect(feed.getSnapshot().fresh.has("a")).toBe(true);
  });

  it("drops a board deleted while followed and doesn't follow it again", () => {
    const { feed, follows } = setup();
    feed.sync(["a", "b"]);
    follows.get("a")!.receive(state("a", 2));
    follows.get("a")!.delete();
    const snap = feed.getSnapshot();
    expect(snap.gone.has("a")).toBe(true);
    expect(snap.states.a).toBeUndefined();
    expect(snap.fresh.has("a")).toBe(false);
    expect(follows.get("a")!.stopped).toBe(true);
    expect(feed.following).toEqual(["b"]);
    // The summary list may still list it until its next refresh.
    feed.sync(["a", "b"]);
    expect(feed.following).toEqual(["b"]);
  });

  it("passes new activity on with the board it happened on", () => {
    const { feed, follows } = setup();
    const heard = vi.fn();
    feed.onActivity(heard);
    feed.sync(["a"]);
    follows.get("a")!.receive(state("a", 2));
    const a: Activity = { id: "x", type: "claimed", at: 1, actor: "m", data: { count: 1 } };
    follows.get("a")!.event(a);
    expect(heard).toHaveBeenCalledWith("a", a, expect.objectContaining({ version: 2 }));
  });
});

describe("statesNotOlder", () => {
  it("leaves out a state older than its board's summary, and keeps the rest (same object when nothing goes)", () => {
    const states = { a: state("a", 6, "final"), b: state("b", 3), c: state("c", 1) };
    expect(statesNotOlder(states, [{ id: "a", version: 6 }, { id: "b", version: 2 }, { id: "c" }])).toBe(states);
    const out = statesNotOlder(states, [{ id: "a", version: 8 }, { id: "b", version: 3 }]);
    expect(Object.keys(out).sort()).toEqual(["b", "c"]);
    expect(states.a.version).toBe(6);
  });
});

// The real LiveGame behind browserFeedDeps, with a fake socket.
describe("browserFeedDeps", () => {
  class FakeSocket implements SocketLike {
    readyState = 0;
    onopen: ((ev: Event) => void) | null = null;
    onmessage: ((ev: MessageEvent) => void) | null = null;
    onclose: ((ev: CloseEvent) => void) | null = null;
    onerror: ((ev: Event) => void) | null = null;
    send() {}
    close() {
      this.readyState = 3;
    }
    open() {
      this.readyState = 1;
      this.onopen?.(new Event("open"));
    }
    message(data: unknown) {
      this.onmessage?.({ data: JSON.stringify(data) } as MessageEvent);
    }
  }

  function liveDeps(sockets: FakeSocket[], fetchState: LiveDeps["fetchState"]): () => LiveDeps {
    return () => ({
      fetchState,
      openSocket: () => {
        const s = new FakeSocket();
        sockets.push(s);
        return s;
      },
      socketUrl: (id) => `wss://test/api/games/${id}/live?watch=0`,
      random: () => 0,
      now: () => Date.now(),
      isOnline: () => true,
      isVisible: () => true,
      onResume: () => () => {},
      onNetwork: () => () => {},
    });
  }

  it("marks a board fresh only when its state arrives, not when the socket opens over a cached one", () => {
    primeGame(state("feed-cached", 5)); // from a visit earlier in the session
    const sockets: FakeSocket[] = [];
    const feed = new HomeFeed(browserFeedDeps(liveDeps(sockets, () => new Promise(() => {}))));
    feed.sync(["feed-cached"]);
    expect(feed.getSnapshot().states["feed-cached"].version).toBe(5);
    sockets[0].open();
    expect(feed.getSnapshot().fresh.has("feed-cached")).toBe(false);
    sockets[0].message({ type: "state", state: state("feed-cached", 9) });
    expect(feed.getSnapshot().states["feed-cached"].version).toBe(9);
    expect(feed.getSnapshot().fresh.has("feed-cached")).toBe(true);
    feed.stop();
  });

  it("keeps a cached board un-fresh when the socket and the fallback GET both fail", async () => {
    primeGame(state("feed-failing", 5));
    const sockets: FakeSocket[] = [];
    const fetchState = vi.fn(() => Promise.reject(new Error("502")));
    const feed = new HomeFeed(browserFeedDeps(liveDeps(sockets, fetchState)));
    feed.sync(["feed-failing"]);
    sockets[0].onclose?.({ code: 1006 } as CloseEvent); // handshake failed: polling + a GET
    await vi.waitFor(() => expect(fetchState).toHaveBeenCalled());
    await new Promise((r) => setTimeout(r, 0)); // the GET's failure has been handled (status: error)
    expect(feed.getSnapshot().states["feed-failing"].version).toBe(5);
    expect(feed.getSnapshot().fresh.has("feed-failing")).toBe(false);
    feed.stop();
  });
});
