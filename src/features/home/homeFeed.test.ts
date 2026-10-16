import { describe, expect, it, vi } from "vitest";
import type { Activity, GameState } from "../../../shared/types";
import { HomeFeed, MAX_FOLLOWED, type FeedDeps, type Follow } from "./homeFeed";

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
  private subs = new Set<() => void>();
  private acts = new Set<(a: Activity, s: GameState) => void>();
  constructor(initial: GameState | null) {
    this.state = initial;
  }
  getState = () => this.state;
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

function setup(cache: Record<string, GameState> = {}) {
  const follows = new Map<string, FakeFollow>();
  const fetchOnce = vi.fn(async (id: string) => state(id, 9, "final"));
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

  it("fetches finished boards once, or not at all when a final one is cached", async () => {
    const { feed, fetchOnce } = setup({ done: state("done", 7, "final") });
    feed.sync([], ["done", "old"]);
    feed.sync([], ["done", "old"]);
    expect(fetchOnce).toHaveBeenCalledTimes(1);
    expect(fetchOnce.mock.calls[0][0]).toBe("old");
    await vi.waitFor(() => expect(feed.getSnapshot().fresh.has("old")).toBe(true));
    expect(feed.getSnapshot().fresh.has("done")).toBe(true);
    feed.sync([], ["old"]);
    expect(fetchOnce).toHaveBeenCalledTimes(1);
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
