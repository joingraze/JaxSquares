// @vitest-environment node
// The core API end to end against real SQL (node:sqlite, every migration
// applied): the identity model (no clientId in anything a client can read),
// notify actors, money-free prize notes, rate limits and cron housekeeping.
// Only the GameRoom (sockets) and push delivery are faked.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PRIZE_MONEY_ERROR } from "../shared/formats";
import { derivePlayerIdSync } from "../shared/playerId";
import type { CreateGameResponse, GameState, GameSummary } from "../shared/types";
import type { Env } from "./env";
import { ACTIVITY_KEEP, DRAFT_TTL_MS, HOUSEKEEPING_MINUTE, housekeeping, isHousekeepingTick } from "./housekeeping";
import worker from "./index";
import { createTestD1, type TestD1 } from "./payments/testD1";
import { notify } from "./push";
import { RATE_LIMITS } from "./rateLimit";

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
];

let t: TestD1;
let env: Env;
let roomCalls: { url: string; body: string | null }[];

beforeEach(async () => {
  t = await createTestD1(MIGRATIONS);
  roomCalls = [];
  const stub = {
    fetch: async (input: string, init?: RequestInit) => {
      roomCalls.push({ url: String(input), body: typeof init?.body === "string" ? init.body : null });
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

/** Created, paid (test checkout), with Ana and Ben joined and holding squares. */
async function openBoard(): Promise<{ id: string; admin: string }> {
  const created = await call<CreateGameResponse>("POST", "/games", { body: createInput() });
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

  it("knowing someone's public id doesn't let you act as them", async () => {
    const { id } = await openBoard();
    // Ben sends Ana's public id as his x-client-id: that's just a different (new) device.
    const res = await call("POST", `/games/${id}/release`, { client: pid(ANA), body: { cells: [{ row: 0, col: 0 }] } });
    expect(res.status).toBe(200);
    const state = (await call<GameState>("GET", `/games/${id}`, { client: null })).body;
    expect(state.squares.find((s) => s.row === 0 && s.col === 0)?.playerId).toBe(pid(ANA));
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

  it("housekeeping closes the rooms of the stale drafts it deletes", async () => {
    const stale = (await call<CreateGameResponse>("POST", "/games", { body: createInput() })).body.game.id;
    t.query(`UPDATE games SET created_at = ? WHERE id = ?`, Date.now() - DRAFT_TTL_MS - 1000, stale);
    const tick = Date.UTC(2026, 9, 16, 3, HOUSEKEEPING_MINUTE);
    await worker.scheduled({ scheduledTime: tick, cron: "* * * * *", noRetry: () => {} } as ScheduledController, env);
    expect(roomCalls.filter((r) => r.url === "https://room/close")).toHaveLength(1);
    expect(t.query(`SELECT 1 FROM games WHERE id = ?`, stale)).toEqual([]);
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

describe("prize notes", () => {
  it("rejects money on create and edit with a friendly 400", async () => {
    const bad = await call("POST", "/games", { body: createInput({ prizes: { final: "$20 to the winner" } }) });
    expect(bad.status).toBe(400);
    expect(bad.body).toEqual({ error: PRIZE_MONEY_ERROR });

    const { id, admin } = await openBoard();
    const edit = await call("PATCH", `/games/${id}`, { admin, body: { prizes: { q1: "Venmo me" } } });
    expect(edit.status).toBe(400);
    expect(edit.body).toEqual({ error: PRIZE_MONEY_ERROR });
    const ok = await call<{ state: GameState }>("PATCH", `/games/${id}`, { admin, body: { prizes: { q1: "Winner picks the music" } } });
    expect(ok.body.state.game.prizes).toEqual({ q1: "Winner picks the music" });
  });
});

describe("rate limits", () => {
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

describe("housekeeping", () => {
  it("runs once an hour", () => {
    expect(isHousekeepingTick(Date.UTC(2026, 9, 16, 3, HOUSEKEEPING_MINUTE))).toBe(true);
    expect(isHousekeepingTick(Date.UTC(2026, 9, 16, 3, HOUSEKEEPING_MINUTE + 1))).toBe(false);
  });

  it("deletes unpaid drafts after 7 days and keeps the newest activity per game", async () => {
    const now = Date.now();
    const { id: open } = await openBoard();
    const fresh = (await call<CreateGameResponse>("POST", "/games", { body: createInput() })).body.game.id;
    const stale = (await call<CreateGameResponse>("POST", "/games", { body: createInput() })).body.game.id;
    t.query(`UPDATE games SET created_at = ? WHERE id IN (?, ?)`, now - DRAFT_TTL_MS - 1000, stale, open);
    for (let i = 0; i < ACTIVITY_KEEP + 30; i++) {
      t.query(`INSERT INTO activity (id, game_id, type, at, actor, data) VALUES (?, ?, 'score', ?, NULL, '{}')`, `bulk-${i}`, open, now + i);
    }
    t.query(`INSERT INTO rate_limits (key, window_start, count) VALUES ('old', 0, 1)`);

    const out = await housekeeping(env, now);
    expect(out.drafts).toEqual([stale]);
    const games = t.query<{ id: string }>(`SELECT id FROM games ORDER BY id`).map((r) => r.id);
    expect(games).toEqual([open, fresh].sort());
    expect(t.query(`SELECT 1 FROM players WHERE game_id = ?`, stale)).toEqual([]);
    expect(t.query<{ n: number }>(`SELECT COUNT(*) AS n FROM activity WHERE game_id = ?`, open)[0].n).toBe(ACTIVITY_KEEP);
    // The newest rows survive.
    expect(t.query(`SELECT 1 FROM activity WHERE id = ?`, `bulk-${ACTIVITY_KEEP + 29}`)).toHaveLength(1);
    expect(t.query(`SELECT 1 FROM rate_limits WHERE key = 'old'`)).toEqual([]);
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
