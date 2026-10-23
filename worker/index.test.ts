// @vitest-environment node
// The core API end to end against real SQL (node:sqlite, every migration
// applied): the identity model (no clientId in anything a client can read),
// notify actors, money-free prize notes, rate limits and cron housekeeping.
// Only the GameRoom (sockets) and push delivery are faked.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MONEY_ERRORS, PRIZE_AMOUNT_ERROR, PRIZE_MONEY_ERROR, REST_MOMENT_ERROR, REST_PRICE_ERROR } from "../shared/formats";
import { FREE_PLAYER_LIMIT } from "../shared/hostFee";
import { KICKOFF_ERRORS } from "../shared/kickoff";
import { derivePlayerIdSync } from "../shared/playerId";
import { MAX_PLAYERS, resolveResults } from "../shared/squares";
import { PAYMENT_REQUIRED_CODE, type ClaimsResponse, type CreateGameResponse, type GameState, type GameSummary, type LiveUpdate } from "../shared/types";
import type { Env } from "./env";
import { ACTIVITY_KEEP, HOUSEKEEPING_MINUTE, housekeeping, isHousekeepingTick } from "./housekeeping";
import worker from "./index";
import { boardAccountToken } from "./payments/boardToken";
import { createTestD1, type TestD1 } from "./payments/testD1";
import { notify } from "./push";
import { RATE_LIMITS } from "./rateLimit";
import { CLAIM_EXPIRED_ERROR, VENUE_PRICE_ERROR } from "../shared/venue";
import { applyLiveUpdate } from "./service";

vi.mock("./push", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./push")>()),
  notify: vi.fn(async () => {}),
}));

const HOST = "host-client-aaaa-0001";
const ANA = "ana-client-bbbb-0002";
const BEN = "ben-client-cccc-0003";
const pid = derivePlayerIdSync;

const MIGRATIONS = [
  "migrations/0001_init.sql",
  "migrations/0002_core_model.sql",
  "migrations/0003_purchases.sql",
  "migrations/0004_push.sql",
  "migrations/0005_housekeeping.sql",
  "migrations/0006_purchases_unused.sql",
  "migrations/0007_board_full_announced.sql",
  "migrations/0008_custom_kickoff.sql",
  "migrations/0009_pay_at_draw.sql",
  "migrations/0010_accounts.sql",
  "migrations/0011_host_pass.sql",
  "migrations/0012_board_groups.sql",
  "migrations/0013_email.sql",
  "migrations/0014_cohosts.sql",
  "migrations/0016_club.sql",
  "migrations/0017_season.sql",
  "migrations/0019_prize_claims.sql",
  "migrations/0020_tv_display.sql",
  "migrations/0021_tv_pairings.sql",
];

let t: TestD1;
let env: Env;
let roomCalls: { url: string; body: string | null; game?: string | null }[];

beforeEach(async () => {
  t = await createTestD1(MIGRATIONS);
  roomCalls = [];
  const stub = {
    fetch: async (input: string, init?: RequestInit) => {
      const game = (init?.headers as Record<string, string> | undefined)?.["x-game-id"] ?? null;
      roomCalls.push({ url: String(input), body: typeof init?.body === "string" ? init.body : null, game });
      return new Response(null, { status: 204 });
    },
  };
  env = {
    DB: t.d1,
    GAME_ROOM: { idFromName: (n: string) => n, get: () => stub } as unknown as DurableObjectNamespace,
    ASSETS: { fetch: async () => new Response("<html></html>") } as unknown as Fetcher,
  } as Env;
  vi.mocked(notify).mockClear();
});

afterEach(() => {
  vi.useRealTimers();
});

/**
 * Rate limits count in fixed windows that reset on the minute (or hour), so a
 * test that fills one must not straddle a reset: pin the clock just after one.
 */
function pinClock(): void {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(Date.UTC(2026, 9, 18, 17, 0, 1));
}

async function call<T = Record<string, unknown>>(
  method: string,
  path: string,
  opts: { client?: string | null; admin?: string; body?: unknown; headers?: Record<string, string> } = {},
): Promise<{ status: number; body: T; text: string; headers: Headers }> {
  const headers: Record<string, string> = { ...opts.headers };
  if (opts.client !== null) headers["x-client-id"] = opts.client ?? HOST;
  if (opts.admin) headers["x-admin-token"] = opts.admin;
  if (opts.body !== undefined) headers["content-type"] = "application/json";
  const res = await worker.fetch(
    new Request(`https://jaxsquares.test/api${path}`, {
      method,
      headers,
      body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
    }),
    env,
    { waitUntil: () => {}, passThroughOnException: () => {} } as unknown as ExecutionContext,
  );
  const text = await res.text();
  return { status: res.status, body: (text ? JSON.parse(text) : {}) as T, text, headers: res.headers };
}

const createInput = (over: Record<string, unknown> = {}) => ({
  name: "Smith Family Squares",
  sport: "football",
  league: "custom",
  teamX: { name: "Chiefs", abbr: "KC" },
  teamY: { name: "Eagles", abbr: "PHI" },
  format: { periods: "quarters", reverse: false, boardSize: 25, freshNumbers: false },
  prizes: { final: "Loser buys wings" },
  maxPerPlayer: 0,
  linkedEvent: null,
  host: { name: "Jordan", color: "#ff6b35", emoji: "🦊" },
  ...over,
});

/** Created, host fee paid (test checkout), with Ana and Ben joined and holding squares. */
async function openBoard(over: Record<string, unknown> = {}): Promise<{ id: string; admin: string }> {
  const created = await call<CreateGameResponse>("POST", "/games", { body: createInput(over) });
  expect(created.status).toBe(201);
  const { game, adminToken } = created.body;
  expect((await call("POST", `/games/${game.id}/pay/test`, { admin: adminToken })).status).toBe(200);
  for (const [client, name] of [
    [ANA, "Ana"],
    [BEN, "Ben"],
  ]) {
    expect((await call("POST", `/games/${game.id}/join`, { client, body: { name, color: "#38b6ff", emoji: "🐐" } })).status).toBe(200);
  }
  expect((await call("POST", `/games/${game.id}/claim`, { client: ANA, body: { cells: [{ row: 0, col: 0 }, { row: 0, col: 1 }] } })).status).toBe(200);
  expect((await call("POST", `/games/${game.id}/claim`, { client: BEN, body: { cells: [{ row: 1, col: 1 }] } })).status).toBe(200);
  return { id: game.id, admin: adminToken };
}

describe("claim codes (venue boards)", () => {
  /** A board with claim codes on, drawn, Ana winning Q1. */
  async function wonByAna(claimCodes = true) {
    const { id, admin } = await openBoard({ format: { periods: "quarters", reverse: false, boardSize: 25, freshNumbers: false, claimCodes, houseRules: ["Must be present to win"] } });
    await call("POST", `/games/${id}/lock`, { admin });
    const locked = (await call<GameState>("GET", `/games/${id}`, { client: null })).body;
    const anaCell = locked.squares.find((s) => s.playerId === pid(ANA))!;
    const draw = locked.game.numbers!["*"];
    await call("POST", `/games/${id}/scores`, { admin, body: { periodKey: "q1", scoreX: draw.x[anaCell.col][0], scoreY: draw.y[anaCell.row][0] } });
    return { id, admin };
  }

  it("give the winner their code and the host every code, never the public board or anyone else", async () => {
    const { id, admin } = await wonByAna();
    const state = await call<GameState>("GET", `/games/${id}`, { client: null });
    expect(state.body.game.format).toMatchObject({ claimCodes: true, houseRules: ["Must be present to win"] });

    const ana = await call<ClaimsResponse>("GET", `/games/${id}/claims`, { client: ANA });
    expect(ana.status).toBe(200);
    expect(ana.body.all).toBeNull();
    expect(ana.body.mine).toEqual([{ periodKey: "q1", label: "Q1", reverse: false, playerId: pid(ANA), code: expect.stringMatching(/^[ACDEFHJKMNPRTUVWXY34679]{4}$/) }]);
    const code = ana.body.mine[0].code;
    expect(state.text).not.toContain(code);

    const ben = await call<ClaimsResponse>("GET", `/games/${id}/claims`, { client: BEN });
    expect(ben.body).toEqual({ enabled: true, mine: [], all: null });
    // The admin token proves the host; without it the host's device is just a player.
    const host = await call<ClaimsResponse>("GET", `/games/${id}/claims`, { admin });
    expect(host.body.all).toEqual(ana.body.mine);
    expect((await call<ClaimsResponse>("GET", `/games/${id}/claims`, {})).body.all).toBeNull();
    // Stable: the same code every time it's asked.
    expect((await call<ClaimsResponse>("GET", `/games/${id}/claims`, { client: ANA })).body.mine[0].code).toBe(code);
  });

  it("are off unless the host turned them on", async () => {
    const { id, admin } = await wonByAna(false);
    expect((await call<ClaimsResponse>("GET", `/games/${id}/claims`, { admin })).body).toEqual({ enabled: false, mine: [], all: null });
    expect((await call("POST", `/games/${id}/claims/collect`, { admin, body: { periodKey: "q1", reverse: false, collected: true } })).status).toBe(409);
  });

  it("let the host or the winner's own phone mark a prize collected, for everyone to see; only the host takes it back", async () => {
    const { id, admin } = await wonByAna();
    const collect = (who: { client?: string; admin?: string }, collected = true, periodKey = "q1") =>
      call<{ state: GameState }>("POST", `/games/${id}/claims/collect`, { ...who, body: { periodKey, reverse: false, collected } });

    expect((await collect({ client: BEN })).status).toBe(403);
    expect((await collect({ client: ANA }, true, "q2")).status).toBe(404);
    const byAna = await collect({ client: ANA });
    expect(byAna.status).toBe(200);
    expect(byAna.body.state.collected).toEqual([{ periodKey: "q1", reverse: false, playerId: pid(ANA), at: expect.any(Number), by: "winner" }]);
    expect(byAna.text).not.toContain(ANA);
    expect((await call<GameState>("GET", `/games/${id}`, { client: null })).body.collected).toHaveLength(1);

    expect((await collect({ client: ANA }, false)).status).toBe(403);
    expect((await collect({ admin }, false)).body.state.collected).toEqual([]);
    expect((await collect({ admin })).body.state.collected).toEqual([expect.objectContaining({ playerId: pid(ANA), by: "host" })]);
  });

  it("stop the winner's phone once their time to collect is up, never the host", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    try {
      const { id, admin } = await openBoard({ format: { periods: "quarters", reverse: false, boardSize: 25, freshNumbers: false, claimCodes: true, claimMinutes: 5 } });
      await call("POST", `/games/${id}/lock`, { admin });
      const locked = (await call<GameState>("GET", `/games/${id}`, { client: null })).body;
      expect(locked.game.format.claimMinutes).toBe(5);
      const anaCell = locked.squares.find((s) => s.playerId === pid(ANA))!;
      const draw = locked.game.numbers!["*"];
      await call("POST", `/games/${id}/scores`, { admin, body: { periodKey: "q1", scoreX: draw.x[anaCell.col][0], scoreY: draw.y[anaCell.row][0] } });
      vi.setSystemTime(Date.now() + 7 * 60_000);
      const late = await call<{ error: string }>("POST", `/games/${id}/claims/collect`, { client: ANA, body: { periodKey: "q1", reverse: false, collected: true } });
      expect(late.status).toBe(409);
      expect(late.body.error).toBe(CLAIM_EXPIRED_ERROR);
      expect((await call("POST", `/games/${id}/claims/collect`, { admin, body: { periodKey: "q1", reverse: false, collected: true } })).status).toBe(200);
    } finally {
      vi.useRealTimers();
    }
  });
});

describe("TV display (PATCH tv)", () => {
  it("lets the host pick what TV mode shows, for everyone to follow, with no activity", async () => {
    const { id, admin } = await openBoard();
    const before = (await call<GameState>("GET", `/games/${id}`, { client: null })).body;
    expect(before.game).not.toHaveProperty("tv");

    const res = await call<{ state: GameState }>("PATCH", `/games/${id}`, { admin, body: { tv: { amounts: false, freeToPlay: true } } });
    expect(res.status).toBe(200);
    expect(res.body.state.game.tv).toEqual({ amounts: false, freeToPlay: true });
    expect(res.body.state.activity.length).toBe(before.activity.length);
    expect((await call<GameState>("GET", `/games/${id}`, { client: null })).body.game.tv).toEqual({ amounts: false, freeToPlay: true });
  });

  it("is the host's (or a co-host's) to change, with known parts only", async () => {
    const { id, admin } = await openBoard();
    expect((await call("PATCH", `/games/${id}`, { client: ANA, body: { tv: { prizes: false } } })).status).toBe(403);
    const bad = await call<{ error: string }>("PATCH", `/games/${id}`, { admin, body: { tv: { logos: true } } });
    expect(bad.status).toBe(400);
    expect(bad.body.error).toBe("Unknown TV part: logos");
    expect((await call("PATCH", `/games/${id}`, { admin, body: { tv: { prizes: "no" } } })).status).toBe(400);
    expect((await call("PATCH", `/games/${id}`, { admin, body: { tv: [] } })).status).toBe(400);
  });
});

describe("venue boards", () => {
  it("are free to play: never a square price", async () => {
    const venue = { periods: "quarters", reverse: false, boardSize: 100, freshNumbers: false, venue: true, justForFun: true } as const;
    const priced = await call<{ error: string }>("POST", "/games", { body: createInput({ format: { ...venue, justForFun: false, unit: "$", squarePrice: 5 } }) });
    expect(priced.status).toBe(400);
    expect(priced.body.error).toBe(VENUE_PRICE_ERROR);
    const created = await call<CreateGameResponse>("POST", "/games", { body: createInput({ format: venue, maxPerPlayer: 1 }) });
    expect(created.status).toBe(201);
    expect(created.body.game.format).toMatchObject({ venue: true, justForFun: true, squarePrice: null });
    expect(created.body.game.maxPerPlayer).toBe(1);
  });
});

describe("public payloads never contain a clientId", () => {
  it("names everyone by public player id in GameState, activity and summaries", async () => {
    const created = await call<CreateGameResponse>("POST", "/games", { body: createInput() });
    expect(created.text).not.toContain(HOST);
    expect(created.body.game.hostPlayerId).toBe(pid(HOST));

    const { id, admin } = await openBoard();
    const res = await call<GameState>("GET", `/games/${id}`, { client: null });
    for (const secret of [HOST, ANA, BEN]) expect(res.text).not.toContain(secret);
    expect(res.text).not.toMatch(/clientId|client_id/);

    const state = res.body;
    expect(state.game.hostPlayerId).toBe(pid(HOST));
    expect(state.players.map((p) => [p.name, p.id, p.isHost])).toEqual([
      ["Jordan", pid(HOST), true],
      ["Ana", pid(ANA), false],
      ["Ben", pid(BEN), false],
    ]);
    expect(state.squares.filter((s) => s.playerId === pid(ANA))).toHaveLength(2);
    expect(state.squares.filter((s) => s.playerId === pid(BEN))).toHaveLength(1);
    const actors = new Set(state.activity.map((a) => a.actor));
    expect(actors).toEqual(new Set([pid(HOST), pid(ANA), pid(BEN)]));

    // Mutation responses and what the room broadcasts are the same public state.
    const claim = await call("POST", `/games/${id}/claim`, { client: ANA, body: { cells: [{ row: 2, col: 2 }] } });
    expect(claim.text).not.toContain(ANA);
    const broadcasts = roomCalls.filter((r) => r.url.endsWith("/broadcast")).map((r) => r.body ?? "");
    expect(broadcasts.length).toBeGreaterThan(0);
    for (const b of broadcasts) for (const secret of [HOST, ANA, BEN]) expect(b).not.toContain(secret);

    // Winner activity carries playerIds, not clientIds.
    await call("POST", `/games/${id}/lock`, { admin });
    const locked = (await call<GameState>("GET", `/games/${id}`, { client: null })).body;
    const anaCell = locked.squares.find((s) => s.playerId === pid(ANA))!;
    const draw = locked.game.numbers!["*"];
    const scoreX = draw.x[anaCell.col][0];
    const scoreY = draw.y[anaCell.row][0];
    const scored = await call<{ state: GameState }>("POST", `/games/${id}/scores`, { admin, body: { periodKey: "q1", scoreX, scoreY } });
    expect(scored.text).not.toContain(ANA);
    const winner = scored.body.state.activity.find((a) => a.type === "winner")!;
    expect(winner.data.playerIds).toEqual([pid(ANA)]);
    expect(winner.data).not.toHaveProperty("clientIds");
    expect(vi.mocked(notify)).toHaveBeenCalledWith(env, id, { kind: "winner", periodKey: "q1", label: "Q1", playerIds: [pid(ANA)] });

    // Dashboard: computed per device, still only public ids.
    const mine = await call<{ games: GameSummary[] }>("GET", "/me/games", { client: ANA });
    expect(mine.text).not.toContain(ANA);
    expect(mine.body.games[0]).toMatchObject({ id, isHost: false, mySquares: 3, myWins: [{ periodKey: "q1", label: "Q1" }] });
    expect((await call<{ games: GameSummary[] }>("GET", "/me/games", { client: HOST })).body.games[0].isHost).toBe(true);
  });

  it("knowing someone's public id doesn't let you act as them, or take over their feed entries", async () => {
    const { id } = await openBoard();
    const actors = async () => {
      const state = (await call<GameState>("GET", `/games/${id}`, { client: null })).body;
      return { created: state.activity.find((a) => a.type === "created")?.actor, all: new Set(state.activity.map((a) => a.actor)) };
    };
    expect(await actors()).toEqual({ created: pid(HOST), all: new Set([pid(HOST), pid(ANA), pid(BEN)]) });

    // A public id is in every GameState; sent as an x-client-id it is refused everywhere.
    const asAna = { client: pid(ANA) };
    expect((await call("POST", `/games/${id}/release`, { ...asAna, body: { cells: [{ row: 0, col: 0 }] } })).status).toBe(401);
    expect((await call("POST", `/games/${id}/join`, { client: pid(HOST), body: { name: "Mallory" } })).status).toBe(401);
    expect((await call("POST", "/push/test", asAna)).status).toBe(401);
    expect((await call("POST", "/push/test", { client: ANA })).status).toBe(200);
    const state = (await call<GameState>("GET", `/games/${id}`, { client: null })).body;
    expect(state.squares.find((s) => s.row === 0 && s.col === 0)?.playerId).toBe(pid(ANA));
    expect(state.players.map((p) => p.name)).toEqual(["Jordan", "Ana", "Ben"]);

    // A player row from before that check (its clientId is the host's or Ana's public id) still can't
    // turn their entries into its own: they'd otherwise read as pid(pid(...)), the impostor's id.
    for (const victim of [HOST, ANA]) {
      t.query(`INSERT INTO players (game_id, client_id, name, color, emoji, joined_at) VALUES (?, ?, 'Mallory', '#38bdf8', '', 9)`, id, pid(victim));
    }
    expect(await actors()).toEqual({ created: pid(HOST), all: new Set([pid(HOST), pid(ANA), pid(BEN)]) });
  });

  it("host-check answers whether x-admin-token is the board's host token, and nothing more", async () => {
    const { id, admin } = await openBoard();
    const check = (token?: string, board = id) => call("GET", `/games/${board}/host-check`, { client: BEN, admin: token });
    const ok = await check(admin);
    expect([ok.status, ok.body]).toEqual([200, { ok: true }]);
    expect((await check("x")).status).toBe(403);
    expect((await check()).status).toBe(403);
    expect((await check(admin, "zzzz9")).status).toBe(404);
    expect((await call("GET", `/games/${id}/host-check`, { client: null, admin })).status).toBe(401);
  });

  it("translates legacy activity rows that stored clientIds", async () => {
    const { id } = await openBoard();
    t.query(
      `INSERT INTO activity (id, game_id, type, at, actor, data) VALUES ('legacy-1', ?, 'winner', 1, ?, ?)`,
      id,
      ANA,
      JSON.stringify({ periodKey: "q1", label: "Q1", clientIds: [ANA, "someone-who-left-0000000000"] }),
    );
    t.query(`INSERT INTO activity (id, game_id, type, at, actor, data) VALUES ('legacy-2', ?, 'joined', 2, ?, '{}')`, id, "not-a-player-device-0000-0000");
    const res = await call<GameState>("GET", `/games/${id}`, { client: null });
    expect(res.text).not.toContain(ANA);
    expect(res.text).not.toContain("someone-who-left");
    expect(res.text).not.toContain("not-a-player-device");
    const legacy = res.body.activity.find((a) => a.id === "legacy-1")!;
    expect(legacy.actor).toBe(pid(ANA));
    expect(legacy.data).toEqual({ periodKey: "q1", label: "Q1", playerIds: [pid(ANA)] });
    expect(res.body.activity.find((a) => a.id === "legacy-2")!.actor).toBeNull();
  });

  it("forwards only a well-formed public id to the live room (never ?clientId)", async () => {
    const { id } = await openBoard();
    const headers = { upgrade: "websocket" };
    await call("GET", `/games/${id}/live?clientId=${ANA}&player=${pid(ANA)}`, { client: null, headers });
    await call("GET", `/games/${id}/live?player=${ANA}`, { client: null, headers });
    const live = roomCalls.filter((r) => r.url.includes("/live"));
    expect(live.map((r) => r.url)).toEqual([`https://room/live?player=${pid(ANA)}`, "https://room/live"]);
  });

  it("forwards ?watch=0 (passive: not counted as watching) and nothing else", async () => {
    const { id } = await openBoard();
    const headers = { upgrade: "websocket" };
    await call("GET", `/games/${id}/live?player=${pid(ANA)}&watch=0&x=1`, { client: null, headers });
    await call("GET", `/games/${id}/live?watch=yes`, { client: null, headers });
    const live = roomCalls.filter((r) => r.url.includes("/live"));
    expect(live.map((r) => r.url)).toEqual([`https://room/live?player=${pid(ANA)}&watch=0`, "https://room/live"]);
  });
});

describe("deleting a board", () => {
  it("tells the room to close (deleted message + 4404) once the host deletes it", async () => {
    const { id, admin } = await openBoard();
    expect((await call("DELETE", `/games/${id}`, { client: ANA, admin: "nope" })).status).toBe(403);
    expect(roomCalls.some((r) => r.url === "https://room/close")).toBe(false);
    expect((await call("DELETE", `/games/${id}`, { admin })).body).toEqual({ ok: true });
    expect(roomCalls.filter((r) => r.url === "https://room/close")).toHaveLength(1);
    expect((await call("GET", `/games/${id}`, { client: null })).status).toBe(404);
  });

  it("housekeeping opens a draft left from the pay-to-open flow and pushes its new state", async () => {
    const id = (await call<CreateGameResponse>("POST", "/games", { body: createInput() })).body.game.id;
    // A draft the previous Worker made between migration 0009 and the deploy.
    t.query(`UPDATE games SET status = 'draft' WHERE id = ?`, id);
    const tick = Date.UTC(2026, 9, 16, 3, HOUSEKEEPING_MINUTE);
    await worker.scheduled({ scheduledTime: tick, cron: "* * * * *", noRetry: () => {} } as ScheduledController, env);
    expect(t.query(`SELECT status, paid_at FROM games WHERE id = ?`, id)).toEqual([{ status: "open", paid_at: null }]);
    expect(roomCalls.filter((r) => r.url === "https://room/broadcast").map((r) => r.game)).toEqual([id]);
    expect(roomCalls.some((r) => r.url === "https://room/close")).toBe(false);
  });
});

describe("every-score entries", () => {
  it("removing an entry drops its host pick, so the next entry is decided by its own score", async () => {
    const { id, admin } = await openBoard({ format: { periods: "every-score", reverse: false, boardSize: 25, freshNumbers: false }, prizes: {} });
    await call("POST", `/games/${id}/lock`, { admin });
    const draw = (await call<GameState>("GET", `/games/${id}`, { client: null })).body.game.numbers!["*"];
    // Ana holds (0,0), Ben holds (1,1).
    expect((await call("POST", `/games/${id}/scores`, { admin, body: { periodKey: "next", scoreX: 3, scoreY: 0 } })).status).toBe(200);
    expect((await call("POST", `/games/${id}/scores`, { admin, body: { periodKey: "next", scoreX: 10, scoreY: 0 } })).status).toBe(200);
    expect((await call("POST", `/games/${id}/winners`, { admin, body: { periodKey: "s2", row: 1, col: 1 } })).status).toBe(200);
    // The host removes Score 2 (a typo): its pick for Ben goes with it.
    const removed = await call<{ state: GameState }>("DELETE", `/games/${id}/scores/s2`, { admin });
    expect(removed.body.state.scores.map((s) => s.periodKey)).toEqual(["s1"]);
    expect(removed.body.state.manualWinners).toEqual([]);

    vi.mocked(notify).mockClear();
    const next = await call<{ state: GameState }>("POST", `/games/${id}/scores`, {
      admin,
      body: { periodKey: "next", scoreX: draw.x[0][0], scoreY: draw.y[0][0] },
    });
    expect(next.status).toBe(200);
    const winner = next.body.state.activity.find((a) => a.type === "winner" && a.data.periodKey === "s2")!;
    expect(winner.data.playerIds).toEqual([pid(ANA)]);
    expect(vi.mocked(notify)).toHaveBeenCalledWith(env, id, { kind: "winner", periodKey: "s2", label: "Score 2", playerIds: [pid(ANA)] });
  });

  it("a score the feed takes back is dropped (with its pick), not announced as a new entry", async () => {
    const { id, admin } = await openBoard({ format: { periods: "every-score", reverse: false, boardSize: 25, freshNumbers: false }, prizes: {} });
    // Ana takes every other square, so whatever square a score lands on has a winner to push.
    const rest: { row: number; col: number }[] = [];
    for (let row = 0; row < 5; row++) for (let col = 0; col < 5; col++) if (row > 1 || (row === 1 && col !== 1) || (row === 0 && col > 1)) rest.push({ row, col });
    expect((await call("POST", `/games/${id}/claim`, { client: ANA, body: { cells: rest } })).status).toBe(200);
    const linked = { provider: "espn", league: "nfl", eventId: "401", startsAt: Date.now(), xIsHome: true };
    await t.d1.prepare(`UPDATE games SET linked_event = ?, starts_at = ? WHERE id = ?`).bind(JSON.stringify(linked), linked.startsAt, id).run();
    const feed = (scoreX: number, scoreY: number): LiveUpdate => ({
      live: { state: "in", period: 1, clock: "5:00", detail: "Q1 5:00", scoreX, scoreY, updatedAt: 1 },
      linescoresX: [scoreX],
      linescoresY: [scoreY],
      completedPeriods: 0,
      isFinal: false,
    });
    const poll = (x: number, y: number) => applyLiveUpdate(env, id, feed(x, y), async () => {});
    const load = async () => (await call<GameState>("GET", `/games/${id}`, { client: null })).body;
    const entries = async () => (await load()).scores.map((s) => [s.periodKey, s.scoreX, s.scoreY]);
    const winnerPushes = () => vi.mocked(notify).mock.calls.map((c) => c[2]).filter((e) => e.kind === "winner");

    await poll(0, 0); // kickoff: the board locks
    vi.mocked(notify).mockClear();
    await poll(7, 0);
    // A touchdown and its kick in one poll: two entries, so the touchdown's square still wins its turn.
    expect(await entries()).toEqual([
      ["s1", 6, 0],
      ["s2", 7, 0],
    ]);
    expect(winnerPushes().map((e) => e.kind === "winner" && e.periodKey)).toEqual(["s1", "s2"]);
    expect((await call("POST", `/games/${id}/winners`, { admin, body: { periodKey: "s1", row: 1, col: 1 } })).status).toBe(200);

    // The touchdown is overturned on review: back to 0-0. 0-0 is never a winning
    // score, so both of its entries go (Score 1's pick too) and nothing new is
    // announced, on this poll or the next.
    vi.mocked(notify).mockClear();
    await poll(0, 0);
    await poll(0, 0);
    const after = await load();
    expect(after.scores).toEqual([]);
    expect(after.manualWinners).toEqual([]);
    expect(winnerPushes()).toEqual([]);

    // Scoring carries on from the corrected score.
    await poll(3, 0);
    await poll(10, 0);
    expect(await entries()).toEqual([
      ["s1", 3, 0],
      ["s2", 9, 0],
      ["s3", 10, 0],
    ]);
    // Just the kick is taken back (10-0 -> 9-0): only its entry goes.
    await poll(9, 0);
    expect(await entries()).toEqual([
      ["s1", 3, 0],
      ["s2", 9, 0],
    ]);
    await poll(10, 0);
    // A touchdown corrected to a field goal (10-0 -> 6-0): both of its entries
    // go, and Score 2 is that corrected score.
    vi.mocked(notify).mockClear();
    await poll(6, 0);
    expect(await entries()).toEqual([
      ["s1", 3, 0],
      ["s2", 6, 0],
    ]);
    expect(winnerPushes().map((e) => e.kind === "winner" && e.periodKey)).toEqual(["s2"]);
  });
});

describe("re-saving a score", () => {
  it("doesn't record or announce an unchanged score again", async () => {
    const { id, admin } = await openBoard();
    await call("POST", `/games/${id}/lock`, { admin });
    const draw = (await call<GameState>("GET", `/games/${id}`, { client: null })).body.game.numbers!["*"];
    const onAna = { scoreX: draw.x[0][0], scoreY: draw.y[0][0] }; // Ana holds (0,0)
    vi.mocked(notify).mockClear();
    const kinds = () => vi.mocked(notify).mock.calls.map((c) => c[2].kind);
    const feed = async (type: string, periodKey: string) =>
      (await call<GameState>("GET", `/games/${id}`, { client: null })).body.activity.filter((a) => a.type === type && a.data.periodKey === periodKey);

    // A double tap, a retry after a lost response, a second host phone.
    for (let i = 0; i < 3; i++) expect((await call("POST", `/games/${id}/scores`, { admin, body: { periodKey: "q1", ...onAna } })).status).toBe(200);
    expect(kinds()).toEqual(["winner"]);
    expect(await feed("score", "q1")).toHaveLength(1);
    expect(await feed("winner", "q1")).toHaveLength(1);

    // A real correction is still news.
    await call("POST", `/games/${id}/scores`, { admin, body: { periodKey: "q1", scoreX: onAna.scoreX + 10, scoreY: onAna.scoreY } });
    expect(await feed("score", "q1")).toHaveLength(2);

    // The Final of a typed-in board: announced (and the game ended) once.
    vi.mocked(notify).mockClear();
    for (let i = 0; i < 3; i++) expect((await call("POST", `/games/${id}/scores`, { admin, body: { periodKey: "final", ...onAna } })).status).toBe(200);
    expect(kinds().sort()).toEqual(["final", "winner"]);
    expect(await feed("score", "final")).toHaveLength(1);
    expect(await feed("winner", "final")).toHaveLength(1);
  });
});

describe("players", () => {
  const joinAs = (id: string, client: string, name = "Bot") => call("POST", `/games/${id}/join`, { client, body: { name } });

  it(`caps a board at ${MAX_PLAYERS} players; players already on it can still rename`, async () => {
    const { id } = await openBoard(); // Jordan, Ana, Ben
    for (let i = 3; i < MAX_PLAYERS; i++) {
      t.query(
        `INSERT INTO players (game_id, client_id, name, color, emoji, joined_at) VALUES (?, ?, 'Bot', '#38bdf8', '', ?)`,
        id,
        `filler-client-${String(i).padStart(6, "0")}`,
        i,
      );
    }
    const late = await joinAs(id, "late-friend-0000-0001", "Late");
    expect(late.status).toBe(409);
    expect(t.query(`SELECT 1 FROM players WHERE game_id = ?`, id)).toHaveLength(MAX_PLAYERS);
    expect((await joinAs(id, ANA, "Ana B")).status).toBe(200);
  });

  it(`lets ${RATE_LIMITS.joinBoard.limit} new players join one board per minute`, async () => {
    pinClock();
    const { id } = await openBoard(); // Ana and Ben joined already
    for (let i = 2; i < RATE_LIMITS.joinBoard.limit; i++) expect((await joinAs(id, `bot-client-${String(i).padStart(8, "0")}`)).status).toBe(200);
    const limited = await joinAs(id, "bot-client-one-too-many");
    expect(limited.status).toBe(429);
    expect(limited.body).toEqual({ error: RATE_LIMITS.joinBoard.message });
    expect(Number(limited.headers.get("retry-after"))).toBeGreaterThan(0);
    // Renames aren't new players; other boards are unaffected; no clientId in the counters.
    expect((await joinAs(id, ANA, "Ana B")).status).toBe(200);
    expect((await openBoard()).id).toBeTruthy();
    const rows = t.query<{ key: string }>(`SELECT key FROM rate_limits`);
    expect(rows.every((r) => !r.key.includes("bot-client") && !r.key.includes(ANA))).toBe(true);
  });

  it(`allows ${RATE_LIMITS.join.limit} joins/renames per device per minute`, async () => {
    pinClock();
    const { id } = await openBoard(); // Ana has used 1 already
    for (let i = 1; i < RATE_LIMITS.join.limit; i++) expect((await joinAs(id, ANA, `Ana ${i}`)).status).toBe(200);
    const limited = await joinAs(id, ANA, "Ana again");
    expect(limited.status).toBe(429);
    expect(limited.body).toEqual({ error: RATE_LIMITS.join.message });
    expect((await joinAs(id, BEN, "Ben B")).status).toBe(200);
  });

  it("lets the host remove a player and free their squares while the board is open", async () => {
    const { id, admin } = await openBoard(); // Ana holds (0,0) and (0,1), Ben (1,1)
    const rest: { row: number; col: number }[] = [];
    for (let row = 0; row < 5; row++) for (let col = 0; col < 5; col++) if (row > 1 || (row === 1 && col !== 1) || (row === 0 && col > 1)) rest.push({ row, col });
    const grab = await call<{ state: GameState }>("POST", `/games/${id}/claim`, { client: BEN, body: { cells: rest } });
    expect(grab.body.state.squares).toHaveLength(25);

    const path = (playerId: string) => `/games/${id}/players/${encodeURIComponent(playerId)}`;
    expect((await call("DELETE", path(pid(BEN)), { client: ANA, admin: "nope" })).status).toBe(403);
    expect((await call("DELETE", path(pid(HOST)), { admin })).status).toBe(400);
    expect((await call("DELETE", path(pid("nobody-on-this-board")), { admin })).status).toBe(404);

    roomCalls = [];
    const res = await call<{ state: GameState }>("DELETE", path(pid(BEN)), { admin });
    expect(res.status).toBe(200);
    for (const secret of [HOST, ANA, BEN]) expect(res.text).not.toContain(secret);
    expect(res.body.state.players.map((p) => p.id)).toEqual([pid(HOST), pid(ANA)]);
    expect(res.body.state.squares.map((s) => s.playerId)).toEqual([pid(ANA), pid(ANA)]);
    expect(roomCalls.filter((r) => r.url.endsWith("/broadcast"))).toHaveLength(1);

    // Once the numbers are drawn, who holds what is settled.
    await call("POST", `/games/${id}/lock`, { admin });
    expect((await call("DELETE", path(pid(ANA)), { admin })).status).toBe(409);
  });
});

describe("notify actors", () => {
  it("the host isn't pushed about drawing the numbers or ending the game", async () => {
    const { id, admin } = await openBoard();
    await call("POST", `/games/${id}/lock`, { admin });
    expect(vi.mocked(notify)).toHaveBeenCalledWith(env, id, { kind: "numbers-drawn", actor: pid(HOST) });
    await call("POST", `/games/${id}/final`, { admin });
    expect(vi.mocked(notify)).toHaveBeenCalledWith(env, id, { kind: "final", actor: pid(HOST) });
  });
});

describe("board-full push", () => {
  const cells = (from: number, to: number) => Array.from({ length: to - from }, (_, i) => ({ row: Math.floor((from + i) / 5), col: (from + i) % 5 }));

  it("isn't sent to the host for filling their own board", async () => {
    const { id } = await openBoard(); // 5x5, rows 0-1 partly taken by Ana and Ben
    vi.mocked(notify).mockClear();
    const res = await call<{ claimed: number }>("POST", `/games/${id}/claim`, { body: { cells: cells(0, 25) } });
    expect(res.body.claimed).toBe(22);
    expect(vi.mocked(notify)).toHaveBeenCalledWith(env, id, { kind: "board-full", actor: pid(HOST) });
  });

  it("names whoever claimed the last square, so the host still hears about a player filling it", async () => {
    const { id } = await openBoard();
    await call("POST", `/games/${id}/claim`, { body: { cells: cells(0, 24) } });
    vi.mocked(notify).mockClear();
    await call("POST", `/games/${id}/claim`, { client: ANA, body: { cells: cells(24, 25) } });
    expect(vi.mocked(notify)).toHaveBeenCalledWith(env, id, { kind: "board-full", actor: pid(ANA) });
  });

  const boardFullPushes = () => vi.mocked(notify).mock.calls.filter(([, , e]) => e.kind === "board-full").length;

  it("is announced once per board: giving a square back and taking one again doesn't push again", async () => {
    const { id, admin } = await openBoard(); // Ana holds (0,0) and (0,1), Ben (1,1)
    await call("POST", `/games/${id}/claim`, { body: { cells: cells(0, 24) } });
    vi.mocked(notify).mockClear();
    await call("POST", `/games/${id}/claim`, { client: ANA, body: { cells: cells(24, 25) } });
    expect(boardFullPushes()).toBe(1);
    expect(t.query<{ board_full_at: number | null }>(`SELECT board_full_at FROM games WHERE id = ?`, id)[0].board_full_at).toBeGreaterThan(0);

    for (let i = 0; i < 3; i++) {
      const release = await call("POST", `/games/${id}/release`, { client: ANA, body: { cells: cells(24, 25) } });
      expect(release.status).toBe(200);
      const again = await call<{ claimed: number }>("POST", `/games/${id}/claim`, { client: ANA, body: { cells: cells(24, 25) } });
      expect(again.body.claimed).toBe(1);
    }
    // Someone else taking the freed square doesn't either.
    await call("POST", `/games/${id}/release`, { client: ANA, body: { cells: cells(24, 25) } });
    await call("POST", `/games/${id}/claim`, { client: BEN, body: { cells: cells(24, 25) } });
    // Nor does the host removing a player and the board filling up again.
    await call("DELETE", `/games/${id}/players/${encodeURIComponent(pid(BEN))}`, { admin });
    await call("POST", `/games/${id}/claim`, { body: { cells: cells(0, 25) } });
    expect(t.query(`SELECT COUNT(*) AS n FROM squares WHERE game_id = ?`, id)).toEqual([{ n: 25 }]);
    expect(boardFullPushes()).toBe(1);
  });

  it("goes out once when the last squares are claimed at the same moment", async () => {
    const { id } = await openBoard();
    await call("POST", `/games/${id}/claim`, { body: { cells: cells(0, 23) } });
    vi.mocked(notify).mockClear();
    await Promise.all([
      call("POST", `/games/${id}/claim`, { client: ANA, body: { cells: cells(23, 25) } }),
      call("POST", `/games/${id}/claim`, { client: BEN, body: { cells: cells(23, 25) } }),
    ]);
    expect(t.query(`SELECT COUNT(*) AS n FROM squares WHERE game_id = ?`, id)).toEqual([{ n: 25 }]);
    expect(boardFullPushes()).toBe(1);
  });

  it("migration 0007 marks boards that were already full as announced", async () => {
    const legacy = await createTestD1(MIGRATIONS.filter((m) => !m.includes("0007")));
    legacy.query(
      `INSERT INTO games (id, name, team_x, team_y, format, periods, status, host_client_id, admin_token, created_at, updated_at)
       VALUES ('full25', 'Full', '{}', '{}', '{"boardSize":25}', '[]', 'open', 'h', 't', 1, 50),
              ('half25', 'Half', '{}', '{}', '{"boardSize":25}', '[]', 'open', 'h', 't', 1, 60)`,
    );
    for (let i = 0; i < 25; i++) legacy.query(`INSERT INTO squares (game_id, row, col, client_id, claimed_at) VALUES ('full25', ?, ?, 'c', 1)`, Math.floor(i / 5), i % 5);
    legacy.query(`INSERT INTO squares (game_id, row, col, client_id, claimed_at) VALUES ('half25', 0, 0, 'c', 1)`);
    legacy.migrate("migrations/0007_board_full_announced.sql");
    expect(legacy.query(`SELECT id, board_full_at FROM games ORDER BY id`)).toEqual([
      { id: "full25", board_full_at: 50 },
      { id: "half25", board_full_at: null },
    ]);
  });
});

describe("prize notes", () => {
  it("rejects money on create and edit with a friendly 400", async () => {
    const bad = await call("POST", "/games", { body: createInput({ prizes: { final: "$20 to the winner" } }) });
    expect(bad.status).toBe(400);
    // Amounts have their own box now; the note says so.
    expect(bad.body).toEqual({ error: PRIZE_AMOUNT_ERROR });

    const { id, admin } = await openBoard();
    const edit = await call("PATCH", `/games/${id}`, { admin, body: { prizes: { q1: "Venmo me" } } });
    expect(edit.status).toBe(400);
    expect(edit.body).toEqual({ error: PRIZE_MONEY_ERROR });
    // An older client's note edit lands in the rules (new boards keep notes there, prizes stay {}).
    const ok = await call<{ state: GameState }>("PATCH", `/games/${id}`, { admin, body: { prizes: { q1: "Winner picks the music" } } });
    expect(ok.body.state.game.prizes).toEqual({});
    expect(ok.body.state.game.format.rules?.map((r) => [r.moment, r.square?.note])).toEqual([
      ["q1", "Winner picks the music"],
      ["q2", ""],
      ["q3", ""],
      ["final", "Loser buys wings"],
    ]);
  });

  it("keeps a board made before rules existed on its old notes", async () => {
    t.query(
      `INSERT INTO games (id, name, sport, league, team_x, team_y, format, periods, prizes, max_per_player, status, host_client_id, admin_token, created_at, updated_at, version)
       VALUES ('old1', 'Old board', 'football', 'custom', '{"name":"A"}', '{"name":"B"}', ?, ?, '{"final":"Wings"}', 0, 'open', ?, 'tok', 1, 1, 1)`,
      JSON.stringify({ periods: "halves", reverse: false, boardSize: 100, freshNumbers: false }),
      JSON.stringify([{ key: "q2", label: "Half" }, { key: "final", label: "Final" }]),
      HOST,
    );
    const ok = await call<{ state: GameState }>("PATCH", "/games/old1", { admin: "tok", body: { prizes: { q2: "Pushups", final: "Wings" } } });
    expect(ok.status).toBe(200);
    expect(ok.body.state.game.prizes).toEqual({ q2: "Pushups", final: "Wings" });
    expect(ok.body.state.game.format.rules).toBeUndefined();
  });

  it("holds board names, team names and score labels to the same rule (the name is every push's title)", async () => {
    const badName = await call("POST", "/games", { body: createInput({ name: "$20 Squares Pool" }) });
    expect(badName.status).toBe(400);
    expect(badName.body).toEqual({ error: MONEY_ERRORS.name });
    const badTeam = await call("POST", "/games", { body: createInput({ teamX: { name: "Winner gets 20usd" } }) });
    expect(badTeam.status).toBe(400);
    expect(badTeam.body).toEqual({ error: MONEY_ERRORS.team });

    const { id, admin } = await openBoard({ format: { periods: "every-score", reverse: false, boardSize: 25, freshNumbers: false }, prizes: {} });
    const rename = await call("PATCH", `/games/${id}`, { admin, body: { name: "Winner takes the pot" } });
    expect(rename.status).toBe(400);
    expect(rename.body).toEqual({ error: MONEY_ERRORS.name });
    const renamed = await call<{ state: GameState }>("PATCH", `/games/${id}`, { admin, body: { name: "Bucks vs Packers" } });
    expect(renamed.body.state.game.name).toBe("Bucks vs Packers");

    await call("POST", `/games/${id}/lock`, { admin });
    const label = await call("POST", `/games/${id}/scores`, { admin, body: { periodKey: "next", scoreX: 7, scoreY: 0, label: "Pay me 20" } });
    expect(label.status).toBe(400);
    expect(label.body).toEqual({ error: MONEY_ERRORS.label });
    const plain = await call<{ state: GameState }>("POST", `/games/${id}/scores`, { admin, body: { periodKey: "next", scoreX: 7, scoreY: 0, label: "Pick six" } });
    expect(plain.body.state.scores.map((s) => s.label)).toEqual(["Pick six"]);
  });
});

describe("rules and prizes", () => {
  const p = (amount: number | null, note = "") => ({ amount, note });
  /** The owner's example: every score -> the square, $50; each quarter-end -> the reverse square, $200. */
  const ownerRules = [
    { moment: "score", square: p(50), reverse: null },
    { moment: "q1", square: null, reverse: p(200) },
    { moment: "q2", square: null, reverse: p(200) },
    { moment: "q3", square: null, reverse: p(200) },
    { moment: "final", square: null, reverse: p(200, "Loser buys wings") },
  ];
  const ownerFormat = (over: Record<string, unknown> = {}) => ({
    periods: "custom",
    reverse: true,
    boardSize: 25,
    freshNumbers: false,
    rules: ownerRules,
    unit: "$",
    squarePrice: 10,
    ...over,
  });

  it("creates a board with custom rules, a unit and a square price (notes inside the rules, prizes {})", async () => {
    const res = await call<CreateGameResponse>("POST", "/games", { body: createInput({ format: ownerFormat({ rules: [...ownerRules].reverse() }), prizes: {} }) });
    expect(res.status).toBe(201);
    const { game } = res.body;
    expect(game.format).toMatchObject({ periods: "custom", reverse: true, boardSize: 25, unit: "$", squarePrice: 10 });
    expect(game.format.rules?.map((r) => r.moment)).toEqual(["score", "q1", "q2", "q3", "final"]);
    expect(game.periods.map((x) => x.key)).toEqual(["q1", "q2", "q3", "final"]);
    expect(game.prizes).toEqual({});
  });

  it("turns an older client's preset and notes into rules", async () => {
    const res = await call<CreateGameResponse>("POST", "/games", { body: createInput() });
    expect(res.body.game.format).toEqual({
      periods: "quarters",
      reverse: false,
      boardSize: 25,
      freshNumbers: false,
      rules: ["q1", "q2", "q3", "final"].map((moment) => ({ moment, square: p(null, moment === "final" ? "Loser buys wings" : ""), reverse: null })),
      unit: "$",
      squarePrice: null,
      justForFun: false,
    });
    expect(res.body.game.prizes).toEqual({});
  });

  it("rejects bad rules with a message the app can show", async () => {
    const bad = async (format: Record<string, unknown>) => (await call<{ error: string }>("POST", "/games", { body: createInput({ format, prizes: {} }) })).body.error;
    expect(await bad(ownerFormat({ rules: [{ moment: "final", square: p(20, "Winner gets $20"), reverse: null }] }))).toBe(PRIZE_AMOUNT_ERROR);
    expect(await bad(ownerFormat({ rules: [{ moment: "final", square: p(20, "Zelle the winner"), reverse: null }] }))).toBe(PRIZE_MONEY_ERROR);
    expect(await bad(ownerFormat({ rules: [{ moment: "final", square: p(0), reverse: null }] }))).toMatch(/amount/);
    expect(await bad(ownerFormat({ squarePrice: 250_000 }))).toMatch(/square price/);
    expect(await bad(ownerFormat({ freshNumbers: true }))).toMatch(/every score/);
    expect(await bad(ownerFormat({ rules: [{ moment: "q1", square: null, reverse: null }] }))).toMatch(/square or a reverse/);
  });

  it("takes amounts by score type on every score change, and only there", async () => {
    const byKind = { touchdown: 50, extraPoint: 10, twoPoint: 20 };
    const rules = ownerRules.map((r) => (r.moment === "score" ? { ...r, square: { amount: 30, note: "", byKind: { ...byKind, safety: null } } } : r));
    const res = await call<CreateGameResponse>("POST", "/games", { body: createInput({ format: ownerFormat({ rules }), prizes: {} }) });
    expect(res.status).toBe(201);
    expect(res.body.game.format.rules?.[0].square).toEqual({ amount: 30, note: "", byKind });
    // Rules without it are stored exactly as before (no byKind key at all).
    const plain = await call<CreateGameResponse>("POST", "/games", { body: createInput({ format: ownerFormat(), prizes: {} }) });
    expect(plain.body.game.format.rules?.every((r) => !("byKind" in (r.square ?? {})) && !("byKind" in (r.reverse ?? {})))).toBe(true);

    const bad = async (format: Record<string, unknown>) => {
      const out = await call<{ error: string }>("POST", "/games", { body: createInput({ format, prizes: {} }) });
      return [out.status, out.body.error];
    };
    const onQ1 = ownerRules.map((r) => (r.moment === "q1" ? { ...r, reverse: { amount: 200, note: "", byKind: { touchdown: 5 } } } : r));
    expect(await bad(ownerFormat({ rules: onQ1 }))).toEqual([400, "Amounts by score type only go with every score change."]);
    const zero = ownerRules.map((r) => (r.moment === "score" ? { ...r, square: { amount: 30, note: "", byKind: { twoPoint: 0 } } } : r));
    expect(await bad(ownerFormat({ rules: zero }))).toEqual([400, "The 2-point conversion amount must be a number above 0, up to 1,000,000"]);
    const unknown = ownerRules.map((r) => (r.moment === "score" ? { ...r, square: { amount: 30, note: "", byKind: { pick6: 70 } } } : r));
    expect(await bad(ownerFormat({ rules: unknown }))).toEqual([400, "Unknown score type"]);
    // The old shared "conversion" kind isn't taken from new input: the extra point and the 2-point conversion are.
    const legacy = ownerRules.map((r) => (r.moment === "score" ? { ...r, square: { amount: 30, note: "", byKind: { conversion: 10 } } } : r));
    expect(await bad(ownerFormat({ rules: legacy }))).toEqual([400, "Unknown score type"]);
    const fun = ownerRules.map((r) => ({ ...r, square: r.square ? { amount: null, note: "", byKind } : null, reverse: r.reverse ? { ...r.reverse, amount: null } : null }));
    expect(await bad(ownerFormat({ rules: fun, justForFun: true, squarePrice: null }))).toEqual([400, "A just-for-fun board doesn't show a square price or amounts."]);
  });

  it("lets the host change amounts by score type any time (they don't change who wins)", async () => {
    const { id, admin } = await openBoard({ format: ownerFormat(), prizes: {} });
    const withKinds = (byKind: Record<string, number> | undefined) => ownerRules.map((r) => (r.moment === "score" ? { ...r, square: { amount: 30, note: "", byKind } } : r));
    await call("POST", `/games/${id}/lock`, { admin });
    expect((await call("POST", `/games/${id}/scores`, { admin, body: { periodKey: "next", scoreX: 6, scoreY: 0 } })).status).toBe(200);
    // Scoring has started: who wins is locked, amounts by kind still change.
    const edited = await call<{ state: GameState }>("PATCH", `/games/${id}`, { admin, body: { format: ownerFormat({ rules: withKinds({ touchdown: 50, extraPoint: 10 }) }) } });
    expect(edited.status).toBe(200);
    const { state } = edited.body;
    expect(state.game.format.rules?.[0].square?.byKind).toEqual({ touchdown: 50, extraPoint: 10 });
    expect(state.activity[0]).toMatchObject({ type: "rules", data: { scoring: false } });
    // Score 1 (a touchdown) now shows the touchdown amount; the next score (the kick), the extra point's.
    expect((await call("POST", `/games/${id}/scores`, { admin, body: { periodKey: "next", scoreX: 7, scoreY: 0 } })).status).toBe(200);
    const after = (await call<GameState>("GET", `/games/${id}`, { client: null })).body;
    const results = resolveResults(after);
    expect(results.filter((r) => r.periodKey.startsWith("s")).map((r) => [r.periodKey, r.scoreKind, r.amount])).toEqual([
      ["s1", "touchdown", 50],
      ["s2", "extraPoint", 10],
    ]);
    // Activity carries no amounts.
    expect(after.activity.every((a) => !JSON.stringify(a.data).match(/amount|byKind|"\$/i))).toBe(true);
    // Back to one amount for every score.
    const cleared = await call<{ state: GameState }>("PATCH", `/games/${id}`, { admin, body: { format: ownerFormat({ rules: withKinds(undefined) }) } });
    expect(cleared.body.state.game.format.rules?.[0].square).toEqual({ amount: 30, note: "" });
  });

  it("reads a board saved with one conversion amount as the extra point's and the 2-point conversion's", async () => {
    const { id, admin } = await openBoard({ format: ownerFormat(), prizes: {} });
    const stored = ownerRules.map((r) => (r.moment === "score" ? { ...r, square: { amount: 30, note: "", byKind: { touchdown: 50, conversion: 10 } } } : r));
    await t.d1.prepare(`UPDATE games SET format = ? WHERE id = ?`).bind(JSON.stringify({ ...ownerFormat(), rules: stored }), id).run();
    const state = (await call<GameState>("GET", `/games/${id}`, { client: null })).body;
    expect(state.game.format.rules?.[0].square?.byKind).toEqual({ touchdown: 50, extraPoint: 10, twoPoint: 10 });
    await call("POST", `/games/${id}/lock`, { admin });
    for (const [x, y] of [
      [6, 0],
      [7, 0],
      [7, 6],
      [7, 8],
    ]) {
      expect((await call("POST", `/games/${id}/scores`, { admin, body: { periodKey: "next", scoreX: x, scoreY: y } })).status).toBe(200);
    }
    const after = (await call<GameState>("GET", `/games/${id}`, { client: null })).body;
    expect(resolveResults(after).filter((r) => r.periodKey.startsWith("s")).map((r) => [r.scoreKind, r.amount])).toEqual([
      ["touchdown", 50],
      ["extraPoint", 10],
      ["touchdown", 50],
      ["twoPoint", 10],
    ]);
    // The host's editor sends it back in the current kinds; an amount-only edit, any time.
    const resaved = await call<{ state: GameState }>("PATCH", `/games/${id}`, { admin, body: { format: { ...ownerFormat(), rules: after.game.format.rules } } });
    expect(resaved.status).toBe(200);
  });

  it("lets the final take the rest of the board total (with a square price), and changes it any time", async () => {
    const rules = [
      { moment: "score", square: { amount: 10, note: "", byKind: { touchdown: 20, fieldGoal: 10, extraPoint: 5, twoPoint: 10, safety: 10 } }, reverse: null },
      { moment: "final", square: { amount: 300, note: "Wings", rest: true }, reverse: { amount: 40, note: "" } },
    ];
    const format = (over: Record<string, unknown> = {}) => ({ periods: "custom", reverse: true, boardSize: 25, freshNumbers: false, rules, unit: "$", squarePrice: 10, ...over });
    const { id, admin } = await openBoard({ format: format(), prizes: {} });
    const state = (await call<GameState>("GET", `/games/${id}`, { client: null })).body;
    // Its amount is ignored: the rest is worked out from the board.
    expect(state.game.format.rules?.[1].square).toEqual({ amount: null, note: "Wings", rest: true });

    const bad = async (body: Record<string, unknown>) => {
      const out = await call<{ error: string }>("POST", "/games", { body: createInput({ format: body, prizes: {} }) });
      return [out.status, out.body.error];
    };
    expect(await bad(format({ squarePrice: null }))).toEqual([400, REST_PRICE_ERROR]);
    const onReverse = [rules[0], { ...rules[1], square: { amount: 300, note: "" }, reverse: { amount: null, note: "", rest: true } }];
    expect(await bad(format({ rules: onReverse }))).toEqual([400, REST_MOMENT_ERROR]);
    const onScore = [{ ...rules[0], square: { amount: null, note: "", rest: true } }, rules[1]];
    expect(await bad(format({ rules: onScore }))).toEqual([400, REST_MOMENT_ERROR]);

    // The host can switch it to a fixed amount and back after scoring starts (it's an amount, not who wins).
    await call("POST", `/games/${id}/lock`, { admin });
    expect((await call("POST", `/games/${id}/scores`, { admin, body: { periodKey: "next", scoreX: 6, scoreY: 0 } })).status).toBe(200);
    const fixed = [rules[0], { ...rules[1], square: { amount: 150, note: "Wings" } }];
    const toFixed = await call<{ state: GameState }>("PATCH", `/games/${id}`, { admin, body: { format: format({ rules: fixed }) } });
    expect(toFixed.status).toBe(200);
    expect(toFixed.body.state.game.format.rules?.[1].square).toEqual({ amount: 150, note: "Wings" });
    expect((await call("PATCH", `/games/${id}`, { admin, body: { format: format() } })).status).toBe(200);
    // Taking the price away while the final takes the rest: refused.
    const noPrice = await call<{ error: string }>("PATCH", `/games/${id}`, { admin, body: { format: format({ squarePrice: null }) } });
    expect([noPrice.status, noPrice.body.error]).toEqual([400, REST_PRICE_ERROR]);

    // The final: the claimed squares' total less what was won.
    expect((await call("POST", `/games/${id}/scores`, { admin, body: { periodKey: "final", scoreX: 6, scoreY: 0 } })).status).toBe(200);
    const done = (await call<GameState>("GET", `/games/${id}`, { client: null })).body;
    const results = resolveResults(done);
    const final = results.find((r) => r.periodKey === "final")!;
    expect(final.amountIsRest).toBe(true);
    const total = done.squares.length * 10;
    const won = results.reduce((n, r) => n + (r.winnerPlayerId && !r.amountIsRest ? (r.amount ?? 0) : 0) + (r.reverseWinnerPlayerId ? (r.reverseAmount ?? 0) : 0), 0);
    expect(final.amount).toBe(Math.max(0, total - won));
    // Activity and the board's state carry no amount for the rest.
    expect(done.activity.every((a) => !JSON.stringify(a.data).match(/amount|byKind|rest|"\$/i))).toBe(true);
  });

  it("lets the host change who wins until the first score, then only amounts and notes", async () => {
    const { id, admin } = await openBoard({ format: ownerFormat(), prizes: {} });
    const patch = (format: Record<string, unknown>, opts: { client?: string; admin?: string } = {}) =>
      call<{ state: GameState; error?: string }>("PATCH", `/games/${id}`, { admin, ...opts, body: { format } });

    // Not the host.
    expect((await patch(ownerFormat(), { client: ANA, admin: "nope" })).status).toBe(403);
    // Before any score: the moments can change. Logged as a "rules" activity by the host, broadcast, never pushed.
    vi.mocked(notify).mockClear();
    roomCalls = [];
    const quarters = ["q1", "q2", "q3", "final"].map((moment) => ({ moment, square: p(25), reverse: p(100) }));
    const changed = await patch(ownerFormat({ rules: quarters }));
    expect(changed.status).toBe(200);
    expect(changed.body.state.game.format.periods).toBe("quarters");
    expect(changed.body.state.game.periods.map((x) => x.key)).toEqual(["q1", "q2", "q3", "final"]);
    const logged = changed.body.state.activity[0];
    expect(logged).toMatchObject({ type: "rules", actor: pid(HOST), data: { scoring: true } });
    expect(vi.mocked(notify)).not.toHaveBeenCalled();
    const broadcast = roomCalls.find((r) => r.url.endsWith("/broadcast"))!;
    expect(JSON.parse(broadcast.body!).activities.map((a: { type: string }) => a.type)).toEqual(["rules"]);
    // The board size never changes.
    expect((await patch(ownerFormat({ rules: quarters, boardSize: 100 }))).status).toBe(409);

    await call("POST", `/games/${id}/lock`, { admin });
    // Fresh numbers lock with the draw.
    const fresh = await patch(ownerFormat({ rules: quarters, freshNumbers: true }));
    expect([fresh.status, fresh.body.error]).toEqual([409, "New numbers each quarter locks once the numbers are drawn. You can still change amounts and notes."]);
    // Locked but no score yet: who wins can still change.
    expect((await patch(ownerFormat())).status).toBe(200);

    const draw = (await call<GameState>("GET", `/games/${id}`, { client: null })).body.game.numbers!["*"];
    expect((await call("POST", `/games/${id}/scores`, { admin, body: { periodKey: "next", scoreX: 7, scoreY: 0 } })).status).toBe(200);
    // After the first score: the moments are locked...
    const locked = await patch(ownerFormat({ rules: quarters }));
    expect([locked.status, locked.body.error]).toEqual([409, "Scoring rules lock once the first score is in. You can still change amounts and notes."]);
    const noReverse = ownerRules.map((r) => (r.moment === "q1" ? { ...r, square: p(10), reverse: null } : r));
    expect((await patch(ownerFormat({ rules: noReverse }))).status).toBe(409);
    // ...but amounts, notes, the unit and the square price still change.
    const bigger = ownerRules.map((r) => (r.reverse ? { ...r, reverse: p(500, "Winner picks the music") } : r));
    const edited = await patch(ownerFormat({ rules: bigger, unit: "pts", squarePrice: null }));
    expect(edited.status).toBe(200);
    expect(edited.body.state.game.format).toMatchObject({ unit: "pts", squarePrice: null });
    expect(edited.body.state.activity[0]).toMatchObject({ type: "rules", data: { scoring: false } });
    // Ana's square (0,0) for the Q1 reverse: X's digit on the rows, Y's on the columns.
    const scoreX = draw.y[0][0];
    const scoreY = draw.x[0][0];
    const q1 = await call<{ state: GameState }>("POST", `/games/${id}/scores`, { admin, body: { periodKey: "q1", scoreX: Math.max(scoreX, 7), scoreY } });
    expect(q1.status).toBe(200);
    // Even after the final (corrections).
    expect((await call("POST", `/games/${id}/final`, { admin })).status).toBe(200);
    expect((await patch(ownerFormat({ rules: ownerRules, unit: "$", squarePrice: 5 }))).status).toBe(200);
    expect((await patch(ownerFormat({ rules: quarters }))).status).toBe(409);
  });

  it("scores a board that awards every score and the quarters (host-typed)", async () => {
    const { id, admin } = await openBoard({ format: ownerFormat(), prizes: {} });
    // Ana takes every open square, so every winning square has a winner to announce.
    const rest: { row: number; col: number }[] = [];
    for (let row = 0; row < 5; row++) for (let col = 0; col < 5; col++) if (!(row === 0 && col < 2) && !(row === 1 && col === 1)) rest.push({ row, col });
    expect((await call("POST", `/games/${id}/claim`, { client: ANA, body: { cells: rest } })).status).toBe(200);
    await call("POST", `/games/${id}/lock`, { admin });
    const score = (periodKey: string, scoreX: number, scoreY: number) =>
      call<{ state: GameState }>("POST", `/games/${id}/scores`, { admin, body: { periodKey, scoreX, scoreY } });
    expect((await score("next", 7, 0)).status).toBe(200);
    expect((await score("next", 7, 3)).status).toBe(200);
    expect((await score("q1", 7, 3)).status).toBe(200);
    const last = await score("next", 14, 3);
    expect(last.status).toBe(200);
    const state = last.body.state;
    expect(state.scores.map((s) => [s.periodKey, s.label ?? null]).sort()).toEqual([
      ["q1", null],
      ["s1", "Score 1"],
      ["s2", "Score 2"],
      ["s3", "Score 3"],
    ]);
    // The Q1 winner is the reverse square only; its activity points at it.
    const q1Winner = state.activity.find((a) => a.type === "winner" && a.data.periodKey === "q1");
    const draw = state.game.numbers!["*"];
    const rev = { row: draw.y.findIndex((d) => d.includes(7)), col: draw.x.findIndex((d) => d.includes(3)) };
    expect(q1Winner?.data).toMatchObject({ cell: rev, reverseCell: null, prize: null });
    // Activity carries notes only, never an amount (so nothing built from it can leak one).
    expect(state.activity.every((a) => !JSON.stringify(a.data).match(/amount|squarePrice|"\$/i))).toBe(true);
    expect((await score("q5", 1, 1)).status).toBe(400);
    // Removing an entry keeps the quarter.
    const removed = await call<{ state: GameState }>("DELETE", `/games/${id}/scores/s3`, { admin });
    expect(removed.body.state.scores.map((s) => s.periodKey).sort()).toEqual(["q1", "s1", "s2"]);
  });

  it("records every score and the quarter-ends from the live feed on a mixed board", async () => {
    const { id, admin } = await openBoard({ format: ownerFormat(), prizes: {} });
    await call("POST", `/games/${id}/lock`, { admin });
    const linked = { provider: "espn", league: "nfl", eventId: "402", startsAt: Date.now(), xIsHome: true };
    await t.d1.prepare(`UPDATE games SET linked_event = ?, starts_at = ? WHERE id = ?`).bind(JSON.stringify(linked), linked.startsAt, id).run();
    const update = (period: number, x: number[], y: number[], completed: number, isFinal = false): LiveUpdate => ({
      live: {
        state: isFinal ? "post" : "in",
        period,
        clock: "",
        detail: isFinal ? "Final" : `Q${period}`,
        scoreX: x.reduce((s, v) => s + v, 0),
        scoreY: y.reduce((s, v) => s + v, 0),
        updatedAt: 1,
      },
      linescoresX: x,
      linescoresY: y,
      completedPeriods: completed,
      isFinal,
    });
    await applyLiveUpdate(env, id, update(1, [7], [0], 0), async () => {});
    await applyLiveUpdate(env, id, update(1, [7], [3], 0), async () => {});
    // Q1 ends at 7-3: no new entry (same score), but the quarter is recorded.
    await applyLiveUpdate(env, id, update(2, [7, 0], [3, 0], 1), async () => {});
    await applyLiveUpdate(env, id, update(2, [7, 7], [3, 0], 1), async () => {});
    const state = (await call<GameState>("GET", `/games/${id}`, { client: null })).body;
    // Each touchdown and its kick seen in one poll are two entries.
    expect(state.scores.map((s) => [s.periodKey, s.scoreX, s.scoreY, s.source]).sort()).toEqual([
      ["q1", 7, 3, "live"],
      ["s1", 6, 0, "live"],
      ["s2", 7, 0, "live"],
      ["s3", 7, 3, "live"],
      ["s4", 13, 3, "live"],
      ["s5", 14, 3, "live"],
    ]);
    const kinds = resolveResults(state)
      .filter((r) => r.periodKey.startsWith("s"))
      .map((r) => [r.periodKey, r.scoreKind, r.scorePoints]);
    expect(kinds).toEqual([
      ["s1", "touchdown", 6],
      ["s2", "extraPoint", 1],
      ["s3", "fieldGoal", 3],
      ["s4", "touchdown", 6],
      ["s5", "extraPoint", 1],
    ]);
    // The game ends: the Final is recorded with the last entry, and the board goes final.
    await applyLiveUpdate(env, id, update(4, [7, 7, 0, 3], [3, 0, 0, 0], 4, true), async () => {});
    const done = (await call<GameState>("GET", `/games/${id}`, { client: null })).body;
    expect(done.game.status).toBe("final");
    expect(done.scores.map((s) => s.periodKey).sort()).toEqual(["final", "q1", "q2", "q3", "s1", "s2", "s3", "s4", "s5", "s6"]);
  });
});

describe("custom kickoff", () => {
  const HOUR = 3_600_000;
  const DAY = 24 * HOUR;
  const linked = (startsAt: number) => ({ provider: "espn", league: "nfl", eventId: "401", startsAt, xIsHome: false });

  it("creates a custom board with the host's kickoff, on the board and in the summary", async () => {
    const at = Date.now() + 3 * DAY;
    const res = await call<CreateGameResponse>("POST", "/games", { body: createInput({ startsAt: at + 0.7 }) });
    expect(res.status).toBe(201);
    expect(res.body.game.startsAt).toBe(at);
    expect(res.body.game.linkedEvent).toBeNull();
    const { game } = (await call<GameState>("GET", `/games/${res.body.game.id}`, { client: null })).body;
    expect(game.startsAt).toBe(at);
    const { games } = (await call<{ games: GameSummary[] }>("GET", "/me/games")).body;
    expect(games.find((g) => g.id === game.id)?.startsAt).toBe(at);
  });

  it("is optional: no set time is null", async () => {
    for (const startsAt of [undefined, null]) {
      const res = await call<CreateGameResponse>("POST", "/games", { body: createInput({ startsAt }) });
      expect(res.status).toBe(201);
      expect(res.body.game.startsAt).toBeNull();
    }
  });

  it("takes a kickoff from about a day ago to a year ahead, and says why otherwise", async () => {
    const now = Date.now();
    const status = async (startsAt: unknown) => (await call<{ error?: string }>("POST", "/games", { body: createInput({ startsAt }) })).body;
    expect((await status(now - 2 * HOUR)).error).toBeUndefined();
    expect((await status(now + 360 * DAY)).error).toBeUndefined();
    expect((await status(now - 2 * DAY)).error).toBe(KICKOFF_ERRORS.past);
    expect((await status(now + 400 * DAY)).error).toBe(KICKOFF_ERRORS.future);
    expect((await status("tomorrow")).error).toBe(KICKOFF_ERRORS.invalid);
    expect((await status({ at: now })).error).toBe(KICKOFF_ERRORS.invalid);
  });

  it("uses a linked board's event time and ignores a kickoff sent with it", async () => {
    const at = Date.now() + 2 * DAY;
    const res = await call<CreateGameResponse>("POST", "/games", {
      body: createInput({ league: "nfl", linkedEvent: linked(at), startsAt: Date.now() + 5 * DAY }),
    });
    expect(res.status).toBe(201);
    expect(res.body.game.startsAt).toBe(at);
    expect(t.query(`SELECT starts_at FROM games WHERE id = ?`, res.body.game.id)).toEqual([{ starts_at: at }]);
  });

  it("lets the host change or clear it (host only, custom only, same checks), and pushes the new state", async () => {
    const { id, admin } = await openBoard();
    const at = Date.now() + 4 * DAY;
    expect((await call("PATCH", `/games/${id}`, { client: ANA, admin: "nope", body: { startsAt: at } })).status).toBe(403);
    roomCalls = [];
    const set = await call<{ state: GameState }>("PATCH", `/games/${id}`, { admin, body: { startsAt: at } });
    expect(set.status).toBe(200);
    expect(set.body.state.game.startsAt).toBe(at);
    expect(roomCalls.some((r) => r.url === "https://room/broadcast")).toBe(true);
    // Display only: no activity, so nobody is pushed about it.
    expect(set.body.state.activity.some((a) => a.type === "rules")).toBe(false);

    const bad = await call<{ error: string }>("PATCH", `/games/${id}`, { admin, body: { startsAt: Date.now() + 500 * DAY } });
    expect(bad.status).toBe(400);
    expect(bad.body.error).toBe(KICKOFF_ERRORS.future);

    const cleared = await call<{ state: GameState }>("PATCH", `/games/${id}`, { admin, body: { startsAt: null } });
    expect(cleared.body.state.game.startsAt).toBeNull();

    const other = (await call<CreateGameResponse>("POST", "/games", { body: createInput({ league: "nfl", linkedEvent: linked(Date.now() + DAY) }) })).body;
    const refused = await call<{ error: string }>("PATCH", `/games/${other.game.id}`, { admin: other.adminToken, body: { startsAt: at } });
    expect(refused.status).toBe(400);
    expect(refused.body.error).toBe(KICKOFF_ERRORS.linked);
  });

  it("never wakes a custom board's room: it has no feed to poll and never locks itself", async () => {
    const custom = await openBoard({ startsAt: Date.now() + 5 * 60_000 });
    const real = (await call<CreateGameResponse>("POST", "/games", { body: createInput({ league: "nfl", linkedEvent: linked(Date.now() + 5 * 60_000) }) })).body;
    await call("POST", `/games/${real.game.id}/pay/test`, { admin: real.adminToken });
    roomCalls = [];
    await worker.scheduled({ scheduledTime: Date.UTC(2026, 9, 16, 3, 1), cron: "* * * * *", noRetry: () => {} } as ScheduledController, env);
    expect(roomCalls.filter((r) => r.url === "https://room/wake").map((r) => r.game)).toEqual([real.game.id]);
    expect((await call<GameState>("GET", `/games/${custom.id}`, { client: null })).body.game.status).toBe("open");
  });
});

describe("rate limits", () => {
  beforeEach(pinClock);
  it(`allows ${RATE_LIMITS.createGame.limit} new boards per device per hour`, async () => {
    for (let i = 0; i < RATE_LIMITS.createGame.limit; i++) expect((await call("POST", "/games", { body: createInput() })).status).toBe(201);
    const res = await call("POST", "/games", { body: createInput() });
    expect(res.status).toBe(429);
    expect(res.body).toEqual({ error: RATE_LIMITS.createGame.message });
    expect(Number(res.headers.get("retry-after"))).toBeGreaterThan(0);
    // Another device is unaffected; invalid requests don't use up tries.
    expect((await call("POST", "/games", { client: ANA, body: createInput() })).status).toBe(201);
    expect((await call("POST", "/games", { client: BEN, body: createInput({ name: "" }) })).status).toBe(400);
  });

  it(`allows ${RATE_LIMITS.squares.limit} claims/releases per device per minute`, async () => {
    const { id } = await openBoard(); // Ana has used 1 already
    const cells = { cells: [{ row: 4, col: 4 }] };
    for (let i = 1; i < RATE_LIMITS.squares.limit; i++) {
      const res = await call("POST", `/games/${id}/${i % 2 ? "claim" : "release"}`, { client: ANA, body: cells });
      expect(res.status).toBe(200);
    }
    const limited = await call("POST", `/games/${id}/claim`, { client: ANA, body: cells });
    expect(limited.status).toBe(429);
    expect(limited.body).toEqual({ error: RATE_LIMITS.squares.message });
    expect((await call("POST", `/games/${id}/claim`, { client: BEN, body: cells })).status).toBe(200);
    // Counters are keyed by public id, never by clientId.
    const rows = t.query<{ key: string }>(`SELECT key FROM rate_limits`);
    expect(rows.every((r) => !r.key.includes(ANA) && !r.key.includes(BEN))).toBe(true);
  });
});

describe("rate limits per network address", () => {
  // CF-Connecting-IP is set by Cloudflare; a clientId is free to mint, so one address rotating made-up ids
  // has to run into a limit too.
  const ip = "203.0.113.7";
  const device = (i: number) => `rotating-device-id-${String(i).padStart(6, "0")}`;
  beforeEach(pinClock);

  it(`allows ${RATE_LIMITS.createGameIp.limit} new boards per address per hour, however many device ids it uses`, async () => {
    const create = (client: string, from = ip) => call("POST", "/games", { client, body: createInput(), headers: { "cf-connecting-ip": from } });
    for (let i = 0; i < RATE_LIMITS.createGameIp.limit; i++) expect((await create(device(i))).status).toBe(201);
    const limited = await create(device(999));
    expect(limited.status).toBe(429);
    expect(limited.body).toEqual({ error: RATE_LIMITS.createGameIp.message });
    expect(Number(limited.headers.get("retry-after"))).toBeGreaterThan(0);
    // Another address is unaffected, and the counters never hold the address itself.
    expect((await create(device(1000), "198.51.100.4")).status).toBe(201);
    const keys = t.query<{ key: string }>(`SELECT key FROM rate_limits`).map((r) => r.key);
    expect(keys.filter((k) => k.startsWith("create-ip:"))).toHaveLength(2);
    expect(keys.some((k) => k.includes(ip) || k.includes("198.51.100.4"))).toBe(false);
  });

  it(`allows ${RATE_LIMITS.squaresIp.limit} claims/releases per address per minute across devices`, async () => {
    const { id } = await openBoard();
    const devices = Array.from({ length: 6 }, (_, k) => device(k));
    for (const client of devices) expect((await call("POST", `/games/${id}/join`, { client, body: { name: "Bot" } })).status).toBe(200);
    const holding = new Map<string, boolean>();
    const tap = (k: number) => {
      const client = devices[k];
      const held = holding.get(client) ?? false;
      holding.set(client, !held);
      const cells = [{ row: 2 + Math.floor(k / 5), col: k % 5 }];
      return call("POST", `/games/${id}/${held ? "release" : "claim"}`, { client, body: { cells }, headers: { "cf-connecting-ip": ip } });
    };
    // Each device stays under its own limit (50 of 60).
    for (let i = 0; i < RATE_LIMITS.squaresIp.limit; i++) expect((await tap(i % devices.length)).status).toBe(200);
    const limited = await tap(0);
    expect(limited.status).toBe(429);
    expect(limited.body).toEqual({ error: RATE_LIMITS.squaresIp.message });
  });

  it(`allows ${RATE_LIMITS.joinIp.limit} joins/renames per address per minute across devices`, async () => {
    const { id } = await openBoard(); // Jordan, Ana and Ben are players
    const rename = (client: string, name: string) => call("POST", `/games/${id}/join`, { client, body: { name }, headers: { "cf-connecting-ip": ip } });
    const players = [HOST, ANA, BEN];
    for (let i = 0; i < RATE_LIMITS.joinIp.limit; i++) expect((await rename(players[i % 3], `Name ${i}`)).status).toBe(200);
    const limited = await rename(ANA, "Ana again");
    expect(limited.status).toBe(429);
    expect(limited.body).toEqual({ error: RATE_LIMITS.joinIp.message });
  });
});

describe("housekeeping", () => {
  it("runs once an hour", () => {
    expect(isHousekeepingTick(Date.UTC(2026, 9, 16, 3, HOUSEKEEPING_MINUTE))).toBe(true);
    expect(isHousekeepingTick(Date.UTC(2026, 9, 16, 3, HOUSEKEEPING_MINUTE + 1))).toBe(false);
  });

  it("keeps the newest activity per game and settles boards left from the pay-to-open flow", async () => {
    const now = Date.now();
    const { id: open } = await openBoard();
    const draft = (await call<CreateGameResponse>("POST", "/games", { body: createInput() })).body.game.id;
    const opened = (await call<CreateGameResponse>("POST", "/games", { body: createInput() })).body.game.id;
    const unpaid = (await call<CreateGameResponse>("POST", "/games", { body: createInput() })).body.game.id;
    // The previous Worker, between migration 0009 and the deploy: one draft made, one opened by its payment.
    t.query(`UPDATE games SET status = 'draft' WHERE id = ?`, draft);
    t.query(`UPDATE games SET activated_at = 5, payment_provider = 'test', payment_reference = ? WHERE id = ?`, `test:${opened}`, opened);
    for (let i = 0; i < ACTIVITY_KEEP + 30; i++) {
      t.query(`INSERT INTO activity (id, game_id, type, at, actor, data) VALUES (?, ?, 'score', ?, NULL, '{}')`, `bulk-${i}`, open, now + i);
    }
    t.query(`INSERT INTO rate_limits (key, window_start, count) VALUES ('old', 0, 1)`);

    const out = await housekeeping(env, now);
    expect(out.opened).toEqual([draft]);
    const rows = t.query<{ id: string; status: string; paid: number }>(`SELECT id, status, paid_at IS NOT NULL AS paid FROM games`);
    const byId = Object.fromEntries(rows.map((r) => [r.id, [r.status, r.paid]]));
    expect(byId).toEqual({ [open]: ["open", 1], [draft]: ["open", 0], [opened]: ["open", 1], [unpaid]: ["open", 0] });
    expect(t.query(`SELECT paid_at FROM games WHERE id = ?`, opened)).toEqual([{ paid_at: 5 }]);
    expect(t.query<{ n: number }>(`SELECT COUNT(*) AS n FROM activity WHERE game_id = ?`, open)[0].n).toBe(ACTIVITY_KEEP);
    // The newest rows survive.
    expect(t.query(`SELECT 1 FROM activity WHERE id = ?`, `bulk-${ACTIVITY_KEEP + 29}`)).toHaveLength(1);
    expect(t.query(`SELECT 1 FROM rate_limits WHERE key = 'old'`)).toEqual([]);
  });
});

describe("a charged App Store purchase for a board deleted before it was confirmed", () => {
  const TX = "2000000123456789";

  async function testPem(): Promise<string> {
    const pair = (await crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, ["sign"])) as CryptoKeyPair;
    const der = new Uint8Array((await crypto.subtle.exportKey("pkcs8", pair.privateKey)) as ArrayBuffer);
    return `-----BEGIN PRIVATE KEY-----\n${btoa(String.fromCharCode(...der))}\n-----END PRIVATE KEY-----`;
  }

  afterEach(() => vi.unstubAllGlobals());

  it("is kept in the ledger (not finished as a 404 with no record), and the host is told", async () => {
    Object.assign(env, {
      IAP_PRODUCT_ID: "com.jaxsquares.app.board",
      APPLE_IAP_KEY_ID: "KEYID",
      APPLE_IAP_ISSUER_ID: "issuer",
      APPLE_IAP_PRIVATE_KEY: await testPem(),
      APPLE_BUNDLE_ID: "com.jaxsquares.app",
    });
    const created = await call<CreateGameResponse>("POST", "/games", { body: createInput() });
    const { game, adminToken } = created.body;
    // The host deleted the board while the App Store was still confirming its draw's purchase.
    expect((await call("DELETE", `/games/${game.id}`, { admin: adminToken })).status).toBe(200);

    const part = (v: unknown) => btoa(JSON.stringify(v)).replace(/=+$/, "").replace(/\+/g, "-").replace(/\//g, "_");
    const tx = {
      transactionId: TX,
      bundleId: "com.jaxsquares.app",
      productId: "com.jaxsquares.app.board",
      price: 4990,
      currency: "USD",
      environment: "Production",
      appAccountToken: boardAccountToken(game.id),
    };
    const fetchMock = vi.fn(async () => Response.json({ signedTransactionInfo: `${part({ alg: "ES256" })}.${part(tx)}.sig` }));
    vi.stubGlobal("fetch", fetchMock);

    const res = await call<{ error: string; unused: boolean }>("POST", `/games/${game.id}/pay/iap`, { admin: adminToken, body: { transactionId: TX } });
    expect(res.status).toBe(410);
    expect(res.body.unused).toBe(true);
    expect(res.body.error).toMatch(/reportaproblem\.apple\.com/);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(t.query(`SELECT reference, game_id, status, amount_cents FROM purchases`)).toEqual([
      { reference: TX, game_id: game.id, status: "unused", amount_cents: 499 },
    ]);
    expect(t.query(`SELECT 1 FROM games WHERE id = ?`, game.id)).toEqual([]);
  });
});

describe("the host fee is due at the draw", () => {
  const MIN = 60_000;
  const linkedEvent = (startsAt: number) => ({ provider: "espn", league: "nfl", eventId: "401", startsAt, xIsHome: false });
  const profile = (name: string) => ({ name, color: "#38b6ff", emoji: "🐐" });
  const feed = (state: "in" | "post"): LiveUpdate =>
    state === "in"
      ? {
          live: { state, period: 1, clock: "12:00", detail: "Q1 12:00", scoreX: 0, scoreY: 0, updatedAt: 1 },
          linescoresX: [0],
          linescoresY: [0],
          completedPeriods: 0,
          isFinal: false,
        }
      : {
          live: { state, period: 4, clock: "", detail: "Final", scoreX: 17, scoreY: 13, updatedAt: 2 },
          linescoresX: [7, 0, 7, 3],
          linescoresY: [3, 10, 0, 0],
          completedPeriods: 4,
          isFinal: true,
        };

  async function create(over: Record<string, unknown> = {}): Promise<{ id: string; admin: string; res: CreateGameResponse }> {
    const created = await call<CreateGameResponse>("POST", "/games", { body: createInput(over) });
    expect(created.status).toBe(201);
    return { id: created.body.game.id, admin: created.body.adminToken, res: created.body };
  }
  const stateOf = async (id: string) => (await call<GameState>("GET", `/games/${id}`, { client: null })).body;
  const notified = (id: string, kind: string) => vi.mocked(notify).mock.calls.filter(([, g, e]) => g === id && e.kind === kind);
  const everySquare = Array.from({ length: 25 }, (_, i) => ({ row: Math.floor(i / 5), col: i % 5 }));
  /** Six friends pick a square each (row 0 and the start of row 1): past the free tier, so the draw needs the fee. */
  async function crowd(id: string, n = FREE_PLAYER_LIMIT + 1): Promise<void> {
    for (let i = 0; i < n; i++) {
      const client = `crowd-player-${i}-of-${id}`;
      expect((await call("POST", `/games/${id}/join`, { client, body: profile(`Friend ${i}`) })).status).toBe(200);
      const claim = await call<{ claimed: number }>("POST", `/games/${id}/claim`, { client, body: { cells: [everySquare[i]] } });
      expect(claim.body.claimed).toBe(1);
    }
  }

  it("opens a new board right away: friends join and pick squares before anything is paid", async () => {
    const { id, res } = await create();
    expect(res.paymentRequired).toBe(false);
    expect(res.game).toMatchObject({ status: "open", paid: false });
    expect((await call("POST", `/games/${id}/join`, { client: ANA, body: profile("Ana") })).status).toBe(200);
    const claim = await call<{ claimed: number }>("POST", `/games/${id}/claim`, { client: ANA, body: { cells: [{ row: 0, col: 0 }] } });
    expect(claim.body.claimed).toBe(1);
    expect((await stateOf(id)).game).toMatchObject({ status: "open", paid: false, numbers: null });
    const { games } = (await call<{ games: GameSummary[] }>("GET", "/me/games")).body;
    expect(games.find((g) => g.id === id)).toMatchObject({ status: "open", paid: false });
    expect(t.query(`SELECT COUNT(*) AS n FROM purchases`)).toEqual([{ n: 0 }]);
  });

  it("refuses to draw an unpaid board of 6 players with a 402 the app recognizes", async () => {
    const { id, admin } = await create();
    await crowd(id);
    const res = await call<{ error: string; code: string }>("POST", `/games/${id}/lock`, { admin });
    expect(res.status).toBe(402);
    expect(res.body).toEqual({ error: "Draw the numbers once the board's paid for.", code: PAYMENT_REQUIRED_CODE });
    expect((await stateOf(id)).game).toMatchObject({ status: "open", numbers: null, lockedAt: null });
    expect(notified(id, "numbers-drawn")).toEqual([]);
  });

  it("draws once the test checkout has paid for the board", async () => {
    const { id, admin } = await create();
    const paid = await call<{ state: GameState }>("POST", `/games/${id}/pay/test`, { admin });
    expect(paid.status).toBe(200);
    // Paying doesn't draw by itself: the host draws (a linked board can wait for kickoff).
    expect(paid.body.state.game).toMatchObject({ status: "open", paid: true, numbers: null });
    expect(t.query(`SELECT reference, game_id, provider, status FROM purchases`)).toEqual([
      { reference: `test:${id}`, game_id: id, provider: "test", status: "paid" },
    ]);
    const drawn = await call<{ state: GameState }>("POST", `/games/${id}/lock`, { admin });
    expect(drawn.status).toBe(200);
    expect(drawn.body.state.game.status).toBe("locked");
    expect(drawn.body.state.game.numbers).not.toBeNull();
    expect(vi.mocked(notify)).toHaveBeenCalledWith(env, id, { kind: "numbers-drawn", actor: pid(HOST) });
    // Paying again is a no-op, and a drawn board says so.
    expect((await call<{ state: GameState }>("POST", `/games/${id}/pay/test`, { admin })).body.state.game.status).toBe("locked");
    expect((await call("POST", `/games/${id}/lock`, { admin })).status).toBe(409);
  });

  it("only the host can pay for the board or draw it", async () => {
    const { id, admin } = await create();
    await call("POST", `/games/${id}/join`, { client: ANA, body: profile("Ana") });
    expect((await call("POST", `/games/${id}/pay/test`, { client: ANA })).status).toBe(403);
    expect((await call("POST", `/games/${id}/pay/test`, { client: ANA, admin: "not-the-token" })).status).toBe(403);
    expect((await call("POST", `/games/${id}/lock`, { client: ANA })).status).toBe(403);
    expect((await call("POST", `/games/${id}/lock`, { client: ANA, admin: "not-the-token" })).status).toBe(403);
    expect((await stateOf(id)).game.paid).toBe(false);
    expect((await call("POST", `/games/${id}/pay/test`, { admin })).status).toBe(200);
    expect((await call("POST", `/games/${id}/lock`, { client: ANA })).status).toBe(403);
    expect((await stateOf(id)).game.status).toBe("open");
  });

  it("migration 0009 counts every board past draft as paid, and opens drafts that never paid", async () => {
    const legacy = await createTestD1(MIGRATIONS.filter((m) => !m.includes("0009")));
    const row = (id: string, status: string, createdAt: number, activatedAt: number | null) =>
      legacy.query(
        `INSERT INTO games (id, name, team_x, team_y, format, periods, status, host_client_id, admin_token, created_at, activated_at, updated_at)
         VALUES (?, 'B', '{}', '{}', '{"boardSize":25}', '[]', ?, 'h', 't', ?, ?, ?)`,
        id,
        status,
        createdAt,
        activatedAt,
        createdAt,
      );
    row("opened", "open", 10, 40);
    row("drawn", "locked", 3, null);
    row("done", "final", 4, 44);
    row("draft1", "draft", 20, null);
    row("draft2", "draft", 30, null);
    row("draft3", "draft", 50, null);
    // draft2 was charged but the old opening step never ran; draft3 reuses a deleted board's id (its purchase is older).
    legacy.query(`INSERT INTO purchases (reference, game_id, provider, status, created_at, paid_at) VALUES ('pi_2', 'draft2', 'stripe', 'paid', 31, 32)`);
    legacy.query(`INSERT INTO purchases (reference, game_id, provider, status, created_at, paid_at) VALUES ('pi_3', 'draft3', 'stripe', 'paid', 49, 49)`);
    legacy.migrate("migrations/0009_pay_at_draw.sql");
    expect(legacy.query(`SELECT id, status, paid_at FROM games ORDER BY id`)).toEqual([
      { id: "done", status: "final", paid_at: 44 },
      { id: "draft1", status: "open", paid_at: null },
      { id: "draft2", status: "open", paid_at: 32 },
      { id: "draft3", status: "open", paid_at: null },
      { id: "drawn", status: "locked", paid_at: 3 },
      { id: "opened", status: "open", paid_at: 40 },
    ]);
  });

  it("draws a grandfathered board without asking for a payment", async () => {
    const legacy = await createTestD1(MIGRATIONS.filter((m) => !m.includes("0009")));
    legacy.query(
      `INSERT INTO games (id, name, team_x, team_y, format, periods, status, host_client_id, admin_token, created_at,
                          activated_at, payment_provider, payment_reference, payment_amount_cents, updated_at)
       VALUES ('old1', 'Old board', '{"name":"Chiefs"}', '{"name":"Eagles"}',
               '{"periods":"quarters","reverse":false,"boardSize":25,"freshNumbers":false}', '[]', 'open', ?, 'adm-old', 1,
               2, 'stripe', 'pi_old', 499, 2)`,
      HOST,
    );
    legacy.migrate("migrations/0009_pay_at_draw.sql");
    env.DB = legacy.d1;
    expect((await stateOf("old1")).game.paid).toBe(true);
    const drawn = await call<{ state: GameState }>("POST", "/games/old1/lock", { admin: "adm-old" });
    expect(drawn.status).toBe(200);
    expect(drawn.body.state.game.status).toBe("locked");
    expect(legacy.query(`SELECT COUNT(*) AS n FROM purchases`)).toEqual([{ n: 0 }]);
  });

  it("a 6-player linked board left unpaid doesn't draw itself at kickoff; the host can pay and draw any time", async () => {
    const { id, admin } = await create({ league: "nfl", linkedEvent: linkedEvent(Date.now() + 5 * MIN) });
    await crowd(id);
    await call("POST", `/games/${id}/join`, { client: ANA, body: profile("Ana") });
    await applyLiveUpdate(env, id, feed("in"), async () => {});
    const kicked = await stateOf(id);
    expect(kicked.game).toMatchObject({ status: "open", numbers: null, paid: false });
    expect(kicked.live?.state).toBe("in");
    expect(kicked.activity.some((a) => a.type === "locked")).toBe(false);
    expect(notified(id, "game-starting")).toHaveLength(1);
    expect(notified(id, "numbers-drawn")).toEqual([]);
    // Squares stay open meanwhile.
    expect((await call<{ claimed: number }>("POST", `/games/${id}/claim`, { client: ANA, body: { cells: [{ row: 2, col: 2 }] } })).body.claimed).toBe(1);
    expect((await call("POST", `/games/${id}/pay/test`, { admin })).status).toBe(200);
    const drawn = await call<{ state: GameState }>("POST", `/games/${id}/lock`, { admin });
    expect(drawn.body.state.game.status).toBe("locked");
  });

  it("a linked board paid ahead draws itself at kickoff", async () => {
    const { id, admin } = await create({ league: "nfl", linkedEvent: linkedEvent(Date.now() + 5 * MIN) });
    expect((await call("POST", `/games/${id}/pay/test`, { admin })).status).toBe(200);
    expect((await stateOf(id)).game.status).toBe("open");
    await applyLiveUpdate(env, id, feed("in"), async () => {});
    const kicked = await stateOf(id);
    expect(kicked.game.status).toBe("locked");
    expect(kicked.game.numbers).not.toBeNull();
    expect(kicked.activity.find((a) => a.type === "locked")).toMatchObject({ actor: null, data: { auto: true } });
    expect(notified(id, "numbers-drawn")).toHaveLength(1);
  });

  it("drawing after the linked game ended ends the board too, with the scores the feed recorded", async () => {
    const { id, admin } = await create({ league: "nfl", linkedEvent: linkedEvent(Date.now() + 5 * MIN) });
    // Ana holds every square the six friends don't, so the board is full and needs the fee.
    await crowd(id);
    await call("POST", `/games/${id}/join`, { client: ANA, body: profile("Ana") });
    await call("POST", `/games/${id}/claim`, { client: ANA, body: { cells: everySquare } });
    await applyLiveUpdate(env, id, feed("in"), async () => {});
    await applyLiveUpdate(env, id, feed("post"), async () => {});
    const over = await stateOf(id);
    expect(over.game.status).toBe("open");
    expect(over.scores.map((s) => s.periodKey).sort()).toEqual(["final", "q1", "q2", "q3"]);
    vi.mocked(notify).mockClear();
    await call("POST", `/games/${id}/pay/test`, { admin });
    const drawn = await call<{ state: GameState }>("POST", `/games/${id}/lock`, { admin });
    expect(drawn.status).toBe(200);
    expect(drawn.body.state.game.status).toBe("final");
    expect(drawn.body.state.game.numbers).not.toBeNull();
    // Every square is taken, so all four periods have a winner.
    const winners = resolveResults(drawn.body.state).map((r) => r.winnerPlayerId);
    expect(winners).toHaveLength(4);
    expect(winners.every((w) => w !== null)).toBe(true);
    // One wrap-up push instead of "numbers are in" and "that's a wrap" back to back.
    expect(vi.mocked(notify).mock.calls.map(([, , e]) => e)).toEqual([{ kind: "final", actor: pid(HOST) }]);
  });

  it("reminds the host of an unpaid 6-player linked board within the hour before kickoff, once", async () => {
    const now = Date.now();
    const soon = now + 50 * MIN;
    const due = await create({ league: "nfl", linkedEvent: linkedEvent(soon) });
    await crowd(due.id);
    const paid = await create({ league: "nfl", linkedEvent: linkedEvent(soon) });
    await crowd(paid.id);
    await call("POST", `/games/${paid.id}/pay/test`, { admin: paid.admin });
    const later = await create({ league: "nfl", linkedEvent: linkedEvent(now + 3 * 60 * MIN) }); // kicks off later
    await crowd(later.id);
    await create({ startsAt: soon }); // custom: draws when the host says, no reminder
    const fresh = await create({ league: "nfl", linkedEvent: linkedEvent(soon) });
    await crowd(fresh.id);
    // All but `fresh` were made a while ago (a host setting up right now doesn't need a nudge).
    t.query(`UPDATE games SET created_at = ? WHERE id <> ?`, now - 30 * MIN, fresh.id);
    const tick = () => worker.scheduled({ scheduledTime: Date.UTC(2026, 9, 16, 3, 1), cron: "* * * * *", noRetry: () => {} } as ScheduledController, env);
    const reminders = () => vi.mocked(notify).mock.calls.filter(([, , e]) => e.kind === "draw-reminder").map(([, g]) => g);
    await tick();
    expect(reminders()).toEqual([due.id]);
    await tick();
    expect(reminders()).toEqual([due.id]);
    expect(t.query<{ id: string }>(`SELECT id FROM games WHERE draw_reminder_at IS NOT NULL`).map((r) => r.id)).toEqual([due.id]);
  });
});

describe("app config", () => {
  it("isn't cached, so a switch to live checkout reaches every client right away", async () => {
    const res = await call("GET", "/config", { client: null });
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toBe("no-store");
  });
});

describe("the big game page's old address", () => {
  it("redirects to /big-game-squares for good, keeping the query", async () => {
    for (const path of ["/super-bowl-squares?utm_source=x", "/super-bowl-squares/?utm_source=x"]) {
      const res = await worker.fetch(new Request(`https://jaxsquares.test${path}`), env, {} as ExecutionContext);
      expect(res.status).toBe(301);
      expect(res.headers.get("location")).toBe("https://jaxsquares.test/big-game-squares?utm_source=x");
    }
  });
});

describe("search engines", () => {
  const get = (path: string) => worker.fetch(new Request(`https://jaxsquares.test${path}`), env, {} as ExecutionContext);

  it("keeps boards, clubs and the app's own screens out of search results", async () => {
    for (const path of ["/g/abc234", "/g/abc234/tv", "/club/c1/tv", "/new", "/me", "/tv"]) {
      expect({ path, robots: (await get(path)).headers.get("x-robots-tag") }).toEqual({ path, robots: "noindex" });
    }
    for (const path of ["/", "/terms", "/football-squares"]) {
      expect({ path, robots: (await get(path)).headers.get("x-robots-tag") }).toEqual({ path, robots: null });
    }
  });

  it("serves the homepage from home.html, falling back to the app shell", async () => {
    const asked: string[] = [];
    env.ASSETS = {
      fetch: async (req: Request) => {
        const path = new URL(req.url).pathname;
        asked.push(path);
        return path === "/home" ? new Response("<html>home</html>") : new Response("<html>shell</html>");
      },
    } as unknown as Fetcher;
    expect(await (await get("/?ref=ig")).text()).toBe("<html>home</html>");
    expect(asked).toEqual(["/home"]);

    env.ASSETS = { fetch: async (req: Request) => new Response("shell", { status: new URL(req.url).pathname === "/home" ? 404 : 200 }) } as unknown as Fetcher;
    expect(await (await get("/")).text()).toBe("shell");
  });

  it("sends home.html's own address to the homepage", async () => {
    const res = await get("/home?ref=ig");
    expect(res.status).toBe(301);
    expect(res.headers.get("location")).toBe("https://jaxsquares.test/?ref=ig");
  });
});

describe("well-known files", () => {
  it("serves assetlinks.json from the Android env vars", async () => {
    env.ANDROID_PACKAGE = "com.example.squares";
    env.ANDROID_SHA256_CERT_FINGERPRINTS = "AA:BB, CC:DD ,";
    const res = await worker.fetch(new Request("https://jaxsquares.test/.well-known/assetlinks.json"), env, {} as ExecutionContext);
    const [link] = (await res.json()) as { target: { package_name: string; sha256_cert_fingerprints: string[] } }[];
    expect(link.target).toMatchObject({ package_name: "com.example.squares", sha256_cert_fingerprints: ["AA:BB", "CC:DD"] });
  });
});
