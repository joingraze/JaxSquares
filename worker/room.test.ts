// @vitest-environment node
// GameRoom: the polling rule, plus presence and deletion against a fake
// DurableObjectState (sockets are in-memory fakes; D1 and scores are mocked).
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { GameState, LiveMessage } from "../shared/types";
import type { Env } from "./env";
import { CLOSE_DELETED, GameRoom, POLL_LEAD_MS, countWatching, pollPlan } from "./room";
import { loadState } from "./service";

vi.mock("./service", () => ({ applyLiveUpdate: vi.fn(), loadState: vi.fn() }));
vi.mock("./scores", () => ({ fetchLiveForEvent: vi.fn() }));

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
  it("counts devices once, anonymous sockets each, passive sockets never", () => {
    expect(
      countWatching([
        { playerId: "p1", connectedAt: 0 },
        { playerId: "p1", connectedAt: 1 },
        { playerId: "p2", connectedAt: 0 },
        { playerId: null, connectedAt: 0 },
        null,
        { playerId: "p3", connectedAt: 0, passive: true },
        { playerId: null, connectedAt: 0, passive: true },
      ]),
    ).toBe(4);
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
    const a = await connect("?watch=1");
    const b = await connect("?watch=false");
    expect(b.watching()).toEqual([2]);
    expect(a.watching()).toEqual([1, 2]);
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
