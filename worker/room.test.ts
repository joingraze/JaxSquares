// @vitest-environment node
// GameRoom: the polling rule, plus presence and deletion against a fake
// DurableObjectState (sockets are in-memory fakes; D1 and scores are mocked).
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { GameState, LiveMessage } from "../shared/types";
import type { Env } from "./env";
import { CLOSE_DELETED, GameRoom, MAX_SOCKETS, POLL_LEAD_MS, countWatching, pollPlan } from "./room";
import { loadState } from "./service";

vi.mock("./service", () => ({ applyLiveUpdate: vi.fn(), loadState: vi.fn() }));
vi.mock("./scores", () => ({ liveVia: vi.fn() }));

const KICKOFF = 1_800_000_000_000;

function state(over: { status?: GameState["game"]["status"]; linked?: boolean; live?: "pre" | "in" | "post" } = {}): GameState {
  return {
    game: {
      id: "g1",
      name: "Board",
      sport: "football",
      league: "nfl",
      teamX: { name: "A" },
      teamY: { name: "B" },
      format: { periods: "quarters", reverse: false, boardSize: 100, freshNumbers: false },
      periods: [],
      prizes: {},
      maxPerPlayer: 0,
      numbers: null,
      status: over.status ?? "locked",
      linkedEvent:
        over.linked === false ? null : { provider: "espn", league: "nfl", eventId: "1", startsAt: KICKOFF, xIsHome: true },
      hostPlayerId: "h",
      createdAt: 0,
      lockedAt: null,
    },
    players: [],
    squares: [],
    scores: [],
    manualWinners: [],
    live: over.live
      ? { state: over.live, period: 1, clock: "", detail: "", scoreX: 0, scoreY: 0, updatedAt: 0 }
      : null,
    activity: [],
    version: 1,
  };
}

describe("pollPlan", () => {
  it("never polls unlinked, draft, final or missing games", () => {
    expect(pollPlan(null, KICKOFF)).toEqual({ kind: "stop" });
    expect(pollPlan(state({ linked: false }), KICKOFF)).toEqual({ kind: "stop" });
    expect(pollPlan(state({ status: "draft" }), KICKOFF)).toEqual({ kind: "stop" });
    expect(pollPlan(state({ status: "final" }), KICKOFF)).toEqual({ kind: "stop" });
  });

  it("waits until 15 minutes before kickoff", () => {
    expect(pollPlan(state({ status: "open" }), KICKOFF - 60 * 60_000)).toEqual({ kind: "at", at: KICKOFF - POLL_LEAD_MS });
    expect(pollPlan(state({ status: "open" }), KICKOFF - 10 * 60_000)).toEqual({ kind: "now" });
  });

  it("polls during the game and stops once the provider says it's over", () => {
    expect(pollPlan(state({ live: "in" }), KICKOFF + 60 * 60_000)).toEqual({ kind: "now" });
    expect(pollPlan(state({ live: "post" }), KICKOFF + 3 * 60 * 60_000)).toEqual({ kind: "stop" });
  });

  it("gives up on a game that never went final", () => {
    expect(pollPlan(state({ live: "in" }), KICKOFF + 13 * 60 * 60_000)).toEqual({ kind: "stop" });
  });
});

describe("countWatching", () => {
  it("counts devices once, passive sockets never", () => {
    expect(
      countWatching([
        { playerId: "p1", connectedAt: 0 },
        { playerId: "p1", connectedAt: 1 },
        { playerId: "p2", connectedAt: 0 },
        { playerId: "p3", connectedAt: 0, passive: true },
      ]),
    ).toBe(2);
  });

  it("never counts sockets without a player id (the app always sends one), however many", () => {
    const anonymous = Array.from({ length: 3000 }, (_, i) => ({ playerId: null, connectedAt: i }));
    expect(countWatching([...anonymous, null, { playerId: null, connectedAt: 0, passive: true }])).toBe(0);
    expect(countWatching([{ playerId: "p1", connectedAt: 0 }, ...anonymous])).toBe(1);
  });

  it("a device with both a passive and an active socket counts once", () => {
    expect(countWatching([{ playerId: "p1", connectedAt: 0, passive: true }, { playerId: "p1", connectedAt: 0 }])).toBe(1);
    expect(countWatching([{ playerId: "p1", connectedAt: 0, passive: true }])).toBe(0);
  });
});

// ---- GameRoom with fakes ----

const OPEN = 1;
const CLOSING = 2;
const CLOSED = 3;

class FakeSocket {
  readyState = OPEN;
  sent: string[] = [];
  closedWith: { code: number; reason: string } | null = null;
  private attachment: unknown = null;
  send(m: string): void {
    if (this.readyState !== OPEN) throw new Error("socket not open");
    this.sent.push(m);
  }
  close(code: number, reason: string): void {
    if (this.readyState >= CLOSING) throw new Error("already closing");
    this.readyState = CLOSING;
    this.closedWith = { code, reason };
  }
  serializeAttachment(a: unknown): void {
    this.attachment = structuredClone(a);
  }
  deserializeAttachment(): unknown {
    return this.attachment;
  }
  /** Parsed JSON messages, in order. */
  messages(): LiveMessage[] {
    return this.sent.map((m) => JSON.parse(m) as LiveMessage);
  }
  watching(): number[] {
    return this.messages().flatMap((m) => (m.type === "presence" ? [m.watching] : []));
  }
}

function fakeCtx() {
  const sockets: FakeSocket[] = [];
  const storage = new Map<string, unknown>();
  let alarm: number | null = null;
  const ctx = {
    sockets,
    storage: {
      get: async (k: string) => storage.get(k),
      put: async (k: string, v: unknown) => void storage.set(k, v),
      deleteAll: async () => storage.clear(),
      getAlarm: async () => alarm,
      setAlarm: async (at: number) => void (alarm = at),
      deleteAlarm: async () => void (alarm = null),
    },
    stored: storage,
    acceptWebSocket: (ws: FakeSocket) => void sockets.push(ws),
    // Like the runtime: sockets stay listed until they are fully closed.
    getWebSockets: () => sockets.filter((ws) => ws.readyState !== CLOSED),
    setWebSocketAutoResponse: () => {},
  };
  return ctx;
}

describe("GameRoom", () => {
  let ctx: ReturnType<typeof fakeCtx>;
  let room: GameRoom;

  beforeEach(() => {
    // Workers runtime globals the room uses; Node's Response also refuses status 101.
    vi.stubGlobal("WebSocketRequestResponsePair", class {});
    vi.stubGlobal(
      "WebSocketPair",
      class {
        0 = new FakeSocket();
        1 = new FakeSocket();
      },
    );
    vi.stubGlobal(
      "Response",
      class {
        constructor(
          readonly body: unknown,
          readonly init: { status?: number; webSocket?: FakeSocket } = {},
        ) {}
        get status() {
          return this.init.status ?? 200;
        }
      },
    );
    vi.mocked(loadState).mockResolvedValue(state({ status: "open", linked: false }));
    ctx = fakeCtx();
    room = new GameRoom(ctx as unknown as DurableObjectState, {} as Env);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  async function connect(query: string): Promise<FakeSocket> {
    const res = (await room.fetch(
      new Request(`https://room/live${query}`, { headers: { upgrade: "websocket", "x-game-id": "g1" } }),
    )) as unknown as { status: number };
    expect(res.status).toBe(101);
    return ctx.sockets[ctx.sockets.length - 1];
  }

  async function disconnect(ws: FakeSocket): Promise<void> {
    ws.readyState = CLOSED;
    await room.webSocketClose(ws as unknown as WebSocket, 1000, "");
  }

  it("passive sockets get state and the count but aren't counted", async () => {
    const ana = await connect("?player=AAAAAAAAAAAAAAAAAAAAAA");
    expect(ana.messages()[0]).toMatchObject({ type: "state" });
    expect(ana.watching()).toEqual([1]);

    // Home following the board: hears the current count, nobody else hears anything.
    const home = await connect("?player=BBBBBBBBBBBBBBBBBBBBBB&watch=0");
    expect(home.messages().map((m) => m.type)).toEqual(["state", "presence"]);
    expect(home.watching()).toEqual([1]);
    expect(ana.watching()).toEqual([1]);

    const ben = await connect("?player=BBBBBBBBBBBBBBBBBBBBBB");
    expect(ben.watching()).toEqual([2]);
    expect(ana.watching()).toEqual([1, 2]);
    expect(home.watching()).toEqual([1, 2]);

    // Leaving: the passive socket changes nothing; an active one updates everyone left.
    await disconnect(home);
    expect(ana.watching()).toEqual([1, 2]);
    await disconnect(ben);
    expect(ana.watching()).toEqual([1, 2, 1]);
  });

  it("passive sockets still receive every broadcast", async () => {
    const home = await connect("?watch=0");
    const next = { ...state({ status: "open", linked: false }), version: 2 };
    const activity = { id: "a1", type: "joined" as const, at: 1, actor: null, data: { name: "Ana" } };
    await room.fetch(
      new Request("https://room/broadcast", {
        method: "POST",
        headers: { "x-game-id": "g1" },
        body: JSON.stringify({ state: next, activities: [activity] }),
      }),
    );
    expect(home.messages().slice(-2)).toEqual([
      { type: "state", state: next },
      { type: "event", activity },
    ]);
    expect(home.watching()).toEqual([0]);
  });

  it("only watch=0 is passive", async () => {
    const a = await connect("?player=AAAAAAAAAAAAAAAAAAAAAA&watch=1");
    const b = await connect("?player=BBBBBBBBBBBBBBBBBBBBBB&watch=false");
    expect(b.watching()).toEqual([2]);
    expect(a.watching()).toEqual([1, 2]);
  });

  it("sockets without a player id get every message but don't add to the count", async () => {
    const ana = await connect("?player=AAAAAAAAAAAAAAAAAAAAAA");
    for (let i = 0; i < 5; i++) await connect("");
    const last = ctx.sockets[ctx.sockets.length - 1];
    expect(last.messages()[0]).toMatchObject({ type: "state" });
    expect(ana.watching()).toEqual([1, 1, 1, 1, 1, 1]);
  });

  it("refuses sockets past the room's cap without loading the board", async () => {
    for (let i = 0; i < MAX_SOCKETS; i++) ctx.sockets.push(new FakeSocket());
    vi.mocked(loadState).mockClear();
    const res = (await room.fetch(
      new Request("https://room/live?player=AAAAAAAAAAAAAAAAAAAAAA", { headers: { upgrade: "websocket", "x-game-id": "g1" } }),
    )) as unknown as { status: number };
    expect(res.status).toBe(503);
    expect(ctx.sockets).toHaveLength(MAX_SOCKETS);
    expect(loadState).not.toHaveBeenCalled();
    // Room again once one leaves.
    ctx.sockets[0].readyState = CLOSED;
    expect((await connect("?player=AAAAAAAAAAAAAAAAAAAAAA")).messages()[0]).toMatchObject({ type: "state" });
  });

  /** An upgrade whose D1 read is held until the test releases it (D1 isn't behind the DO's input gate). */
  function slowUpgrade(query: string) {
    let release!: (s: GameState | null) => void;
    vi.mocked(loadState).mockImplementationOnce(() => new Promise((r) => (release = r)));
    const res = room.fetch(
      new Request(`https://room/live${query}`, { headers: { upgrade: "websocket", "x-game-id": "g1" } }),
    ) as unknown as Promise<{ status: number }>;
    return { res, release: (s: GameState | null) => release(s) };
  }

  async function broadcast(next: GameState): Promise<void> {
    await room.fetch(
      new Request("https://room/broadcast", { method: "POST", headers: { "x-game-id": "g1" }, body: JSON.stringify({ state: next }) }),
    );
  }

  it("a socket opened while a broadcast is in flight starts from the newer state", async () => {
    const v1 = state({ status: "open", linked: false });
    const v2 = { ...v1, version: 2 };
    const existing = await connect("?player=AAAAAAAAAAAAAAAAAAAAAA");
    const slow = slowUpgrade("?player=BBBBBBBBBBBBBBBBBBBBBB&watch=0");
    await broadcast(v2); // reaches only the sockets accepted so far
    slow.release(v1); // the read made before the change committed
    expect((await slow.res).status).toBe(101);
    const fresh = ctx.sockets[ctx.sockets.length - 1];
    const versions = (ws: FakeSocket) => ws.messages().flatMap((m) => (m.type === "state" ? [m.state.version] : []));
    expect(versions(existing)).toEqual([1, 2]);
    expect(versions(fresh)).toEqual([2]);
    // A late, older push is still dropped.
    await broadcast(v1);
    expect(versions(fresh)).toEqual([2]);
  });

  it("a socket whose board is deleted while it opens is refused, and nothing comes back", async () => {
    const existing = await connect("?player=AAAAAAAAAAAAAAAAAAAAAA");
    // A linked board before kickoff: opening a socket would arm the alarm.
    const before = state({ status: "open" });
    const slow = slowUpgrade("?player=BBBBBBBBBBBBBBBBBBBBBB&watch=0");
    await room.fetch(new Request("https://room/close", { method: "POST", headers: { "x-game-id": "g1" } }));
    expect(existing.closedWith?.code).toBe(CLOSE_DELETED);
    slow.release(before); // read before the delete committed
    expect((await slow.res).status).toBe(404);
    expect(ctx.sockets).toHaveLength(1);
    // A change committed just before the delete, arriving late, doesn't bring the room back either.
    await broadcast({ ...before, version: 2 });
    expect(existing.messages().at(-1)).toEqual({ type: "deleted" });
    expect(ctx.stored.size).toBe(0);
    expect(await ctx.storage.getAlarm()).toBeNull();
  });

  it("a deleted board sends { type: 'deleted' } to every socket, then closes with 4404", async () => {
    const ana = await connect("?player=AAAAAAAAAAAAAAAAAAAAAA");
    const home = await connect("?player=AAAAAAAAAAAAAAAAAAAAAA&watch=0");
    await ctx.storage.setAlarm(123);
    await room.fetch(new Request("https://room/close", { method: "POST", headers: { "x-game-id": "g1" } }));
    for (const ws of [ana, home]) {
      expect(ws.messages().at(-1)).toEqual({ type: "deleted" });
      expect(ws.closedWith).toEqual({ code: CLOSE_DELETED, reason: "Game not found" });
    }
    expect(CLOSE_DELETED).toBe(4404);
    expect(await ctx.storage.getAlarm()).toBeNull();
    expect(ctx.stored.size).toBe(0);
  });

  it("refuses sockets for a board that doesn't exist", async () => {
    vi.mocked(loadState).mockResolvedValue(null);
    const res = (await room.fetch(
      new Request("https://room/live", { headers: { upgrade: "websocket", "x-game-id": "g1" } }),
    )) as unknown as { status: number };
    expect(res.status).toBe(404);
    expect(ctx.sockets).toHaveLength(0);
  });
});
