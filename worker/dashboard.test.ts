// @vitest-environment node
// GET /api/me/games (listGamesForClient in worker/db.ts) against real SQL:
// the per-device summary carries the latest score and who leads, so Home can
// render a board in play without fetching its full state.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { derivePlayerIdSync } from "../shared/playerId";
import type { CreateGameResponse, Game, GameState, GameSummary, LiveStatus } from "../shared/types";
import { latestScoreOf } from "./db";
import type { Env } from "./env";
import worker from "./index";
import { createTestD1, type TestD1 } from "./payments/testD1";

vi.mock("./push", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./push")>()),
  notify: vi.fn(async () => {}),
}));

const HOST = "host-client-dash-0001";
const ANA = "ana-client-dash-0002";
const BEN = "ben-client-dash-0003";
const pid = derivePlayerIdSync;

const MIGRATIONS = [
  "migrations/0001_init.sql",
  "migrations/0002_core_model.sql",
  "migrations/0003_purchases.sql",
  "migrations/0004_push.sql",
  "migrations/0005_housekeeping.sql",
  "migrations/0006_purchases_unused.sql",
  "migrations/0007_board_full_announced.sql",
];

let t: TestD1;
let env: Env;

beforeEach(async () => {
  t = await createTestD1(MIGRATIONS);
  const stub = { fetch: async () => new Response(null, { status: 204 }) };
  env = {
    DB: t.d1,
    GAME_ROOM: { idFromName: (n: string) => n, get: () => stub } as unknown as DurableObjectNamespace,
    ASSETS: { fetch: async () => new Response("<html></html>") } as unknown as Fetcher,
  } as Env;
});

async function call<T = Record<string, unknown>>(
  method: string,
  path: string,
  opts: { client?: string; admin?: string; body?: unknown } = {},
): Promise<{ status: number; body: T; text: string }> {
  const headers: Record<string, string> = { "x-client-id": opts.client ?? HOST };
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
  return { status: res.status, body: (text ? JSON.parse(text) : {}) as T, text };
}

/** A paid 5x5 board with Ana and Ben holding squares. */
async function board(): Promise<{ id: string; admin: string }> {
  const created = await call<CreateGameResponse>("POST", "/games", {
    body: {
      name: "Dashboard Board",
      sport: "football",
      league: "custom",
      teamX: { name: "Chiefs", abbr: "KC" },
      teamY: { name: "Eagles", abbr: "PHI" },
      format: { periods: "quarters", reverse: false, boardSize: 25, freshNumbers: false },
      prizes: {},
      maxPerPlayer: 0,
      linkedEvent: null,
      host: { name: "Jordan", color: "#ff6b35", emoji: "🦊" },
    },
  });
  const { game, adminToken } = created.body;
  await call("POST", `/games/${game.id}/pay/test`, { admin: adminToken });
  for (const [client, name] of [
    [ANA, "Ana"],
    [BEN, "Ben"],
  ]) {
    await call("POST", `/games/${game.id}/join`, { client, body: { name, color: "#38b6ff", emoji: "🐐" } });
  }
  await call("POST", `/games/${game.id}/claim`, { client: ANA, body: { cells: [{ row: 0, col: 0 }] } });
  await call("POST", `/games/${game.id}/claim`, { client: BEN, body: { cells: [{ row: 1, col: 1 }] } });
  return { id: game.id, admin: adminToken };
}

async function summaryFor(client: string, id: string): Promise<GameSummary> {
  const res = await call<{ games: GameSummary[] }>("GET", "/me/games", { client });
  expect(res.status).toBe(200);
  for (const secret of [HOST, ANA, BEN]) expect(res.text).not.toContain(secret);
  return res.body.games.find((g) => g.id === id)!;
}

/** A score whose winning square on the shared draw is (row, col). */
function scoreFor(state: GameState, row: number, col: number): { scoreX: number; scoreY: number } {
  const draw = state.game.numbers!["*"];
  return { scoreX: draw.x[col][0], scoreY: draw.y[row][0] };
}

describe("dashboard summary: latest score and leader", () => {
  it("is null on a board that hasn't drawn numbers", async () => {
    const { id } = await board();
    const s = await summaryFor(HOST, id);
    expect(s.latestScore).toBeNull();
    expect(s.leaderPlayerId).toBeNull();
  });

  it("names the last period's winner (another player) and its score", async () => {
    const { id, admin } = await board();
    await call("POST", `/games/${id}/lock`, { admin });
    const state = (await call<GameState>("GET", `/games/${id}`)).body;

    await call("POST", `/games/${id}/scores`, { admin, body: { periodKey: "q1", ...scoreFor(state, 0, 0) } });
    let s = await summaryFor(HOST, id);
    expect(s.latestScore).toEqual({ ...scoreFor(state, 0, 0), label: "Q1" });
    expect(s.leaderPlayerId).toBe(pid(ANA));
    expect(s.myWins).toEqual([]);

    // Half goes to Ben: the leader follows the latest period, and Ben sees it as his win.
    const half = scoreFor(state, 1, 1);
    await call("POST", `/games/${id}/scores`, { admin, body: { periodKey: "q2", scoreX: half.scoreX + 10, scoreY: half.scoreY + 20 } });
    s = await summaryFor(HOST, id);
    expect(s.latestScore).toEqual({ scoreX: half.scoreX + 10, scoreY: half.scoreY + 20, label: "Half" });
    expect(s.leaderPlayerId).toBe(pid(BEN));
    expect((await summaryFor(BEN, id)).myWins).toEqual([{ periodKey: "q2", label: "Half" }]);
  });

  it("prefers the live square's owner while a live game is on", async () => {
    const { id, admin } = await board();
    await call("POST", `/games/${id}/lock`, { admin });
    const state = (await call<GameState>("GET", `/games/${id}`)).body;
    await call("POST", `/games/${id}/scores`, { admin, body: { periodKey: "q1", ...scoreFor(state, 0, 0) } });
    const live = scoreFor(state, 1, 1);
    t.query(
      `INSERT INTO live_status (game_id, state, period, clock, detail, score_x, score_y, updated_at) VALUES (?, 'in', 2, '4:12', 'Q2 4:12', ?, ?, 1)`,
      id,
      live.scoreX,
      live.scoreY,
    );
    const s = await summaryFor(ANA, id);
    expect(s.latestScore).toEqual({ ...live, label: "Q2 4:12" });
    expect(s.leaderPlayerId).toBe(pid(BEN));
    // Ana's Q1 win still counts for her.
    expect(s.myWins).toEqual([{ periodKey: "q1", label: "Q1" }]);
  });

  it("carries the board's version, which moves on when the host corrects a final", async () => {
    const { id, admin } = await board();
    await call("POST", `/games/${id}/lock`, { admin });
    const locked = (await call<GameState>("GET", `/games/${id}`)).body;
    expect((await summaryFor(ANA, id)).version).toBe(locked.version);

    // A wrong final, then the host takes it back and types the right one.
    await call("POST", `/games/${id}/scores`, { admin, body: { periodKey: "final", ...scoreFor(locked, 0, 0) } });
    const wrong = (await call<GameState>("GET", `/games/${id}`)).body;
    expect(wrong.game.status).toBe("final");
    expect((await summaryFor(ANA, id)).version).toBe(wrong.version);
    expect((await call("DELETE", `/games/${id}/scores/final`, { admin })).status).toBe(200);
    await call("POST", `/games/${id}/scores`, { admin, body: { periodKey: "final", ...scoreFor(locked, 1, 1) } });
    const fixed = (await call<GameState>("GET", `/games/${id}`)).body;
    const s = await summaryFor(ANA, id);
    expect(s.status).toBe("final");
    expect(s.version).toBe(fixed.version);
    expect(s.version).toBeGreaterThan(wrong.version);
    expect(s.myWins).toEqual([]);
  });
});

describe("latestScoreOf", () => {
  const game: Pick<Game, "format" | "periods" | "status"> = {
    status: "locked",
    format: { periods: "quarters", reverse: false, boardSize: 100, freshNumbers: false },
    periods: [
      { key: "q1", label: "Q1" },
      { key: "q2", label: "Half" },
      { key: "q3", label: "Q3" },
      { key: "final", label: "Final" },
    ],
  };
  const score = (periodKey: string, scoreX: number, scoreY: number) => ({ periodKey, scoreX, scoreY, source: "host" as const, updatedAt: 1 });
  const live = (over: Partial<LiveStatus>): LiveStatus => ({ state: "in", period: 3, clock: "4:12", detail: "", scoreX: 17, scoreY: 13, updatedAt: 1, ...over });

  it("takes the latest period in board order, not insertion order", () => {
    expect(latestScoreOf(game, [score("q2", 14, 10), score("q1", 7, 3)], null)).toEqual({ scoreX: 14, scoreY: 10, label: "Half" });
  });

  it("uses the live clock, Final once the game is over, and ignores a pregame feed", () => {
    expect(latestScoreOf(game, [score("q1", 7, 3)], live({}))).toEqual({ scoreX: 17, scoreY: 13, label: "Q3 4:12" });
    expect(latestScoreOf({ ...game, status: "final" }, [], live({ state: "post", scoreX: 27, scoreY: 24 }))).toEqual({ scoreX: 27, scoreY: 24, label: "Final" });
    expect(latestScoreOf(game, [], live({ state: "post", detail: "Final/OT", scoreX: 27, scoreY: 24 }))).toEqual({ scoreX: 27, scoreY: 24, label: "Final" });
    expect(latestScoreOf(game, [score("q1", 7, 3)], live({ state: "pre" }))).toEqual({ scoreX: 7, scoreY: 3, label: "Q1" });
  });

  it("doesn't call a postponed or canceled game Final", () => {
    // ESPN reports these as "post" without completing them; the board stays open or locked.
    const postponed = live({ state: "post", period: 0, clock: "0:00", detail: "Postponed", scoreX: 0, scoreY: 0 });
    expect(latestScoreOf(game, [], postponed)).toEqual({ scoreX: 0, scoreY: 0, label: "Postponed" });
    expect(latestScoreOf({ ...game, status: "open" }, [], { ...postponed, detail: "Canceled" })?.label).toBe("Canceled");
  });
});
