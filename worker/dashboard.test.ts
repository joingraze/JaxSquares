// @vitest-environment node
// GET /api/me/games (listGamesForClient in worker/db.ts) against real SQL:
// the per-device summary carries the latest score and who leads, so Home can
// render a board in play without fetching its full state.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { derivePlayerIdSync } from "../shared/playerId";
import type { CreateGameResponse, Game, GameState, GameSummary, LiveStatus } from "../shared/types";
import { latestScoreOf, listGamesForClient } from "./db";
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
  "migrations/0008_custom_kickoff.sql",
  "migrations/0009_pay_at_draw.sql",
  "migrations/0014_cohosts.sql",
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
    // A custom board (no linked game): the host draws, nothing draws at kickoff on its own.
    expect(s.linked).toBe(false);
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

describe("seen boards (invites opened without joining)", () => {
  const CARL = "carl-client-dash-0004";
  const SECRETS = [HOST, ANA, BEN, CARL];

  async function games(client: string, seen?: string): Promise<{ status: number; games: GameSummary[]; text: string }> {
    const res = await call<{ games: GameSummary[] }>("GET", seen === undefined ? "/me/games" : `/me/games?seen=${seen}`, { client });
    return { status: res.status, games: res.body.games ?? [], text: res.text };
  }

  /** A board with a square price that Carl only opened from an invite. */
  async function invite(): Promise<{ id: string; admin: string }> {
    const { id, admin } = await board();
    const res = await call("PATCH", `/games/${id}`, {
      admin,
      body: { format: { periods: "quarters", reverse: false, boardSize: 25, freshNumbers: false, unit: "$", squarePrice: 10 } },
    });
    expect(res.status).toBe(200);
    return { id, admin };
  }

  it("summarizes a board I only opened, with the host's public profile and the square price", async () => {
    const { id } = await invite();
    expect((await games(CARL)).games).toEqual([]);

    const { status, games: list, text } = await games(CARL, id);
    expect(status).toBe(200);
    expect(list).toHaveLength(1);
    const s = list[0];
    expect(s).toMatchObject({ id, status: "open", isHost: false, joined: false, mySquares: 0, claimed: 2, totalSquares: 25, playerCount: 3 });
    expect(s.host).toEqual({ id: pid(HOST), name: "Jordan", color: "#ff6b35", emoji: "🦊" });
    expect(s.format).toMatchObject({ unit: "$", squarePrice: 10 });
    for (const secret of SECRETS) expect(text).not.toContain(secret);
  });

  it("marks the boards I'm on as joined and never lists one twice", async () => {
    const { id } = await board();
    const ana = await games(ANA, `${id},${id.toUpperCase()}`);
    expect(ana.games.map((g) => g.id)).toEqual([id]);
    expect(ana.games[0]).toMatchObject({ joined: true, isHost: false, mySquares: 1 });
    const host = await games(HOST, id);
    expect(host.games).toHaveLength(1);
    expect(host.games[0]).toMatchObject({ joined: true, isHost: true, host: { id: pid(HOST), name: "Jordan" } });
  });

  it("ignores junk ids and leaves out boards that don't exist", async () => {
    const { id } = await invite();
    const junk = ["", "NOPE!!", "..%2Fx", "a b", "x".repeat(40), "abc", "zzzz9999", encodeURIComponent("<script>")].join(",");
    const { status, games: list } = await games(CARL, `${junk},${id},,`);
    expect(status).toBe(200);
    expect(list.map((g) => g.id)).toEqual([id]);
    // A deleted board simply drops out.
    const { id: gone, admin } = await board();
    expect((await call("DELETE", `/games/${gone}`, { admin })).status).toBe(200);
    expect((await games(CARL, `${gone},${id}`)).games.map((g) => g.id)).toEqual([id]);
  });

  it("never puts a clientId or a host token in the response", async () => {
    const { id, admin } = await invite();
    await call("POST", `/games/${id}/join`, { client: CARL, body: { name: "Carl", color: "#69db7c", emoji: "🦖" } });
    for (const client of SECRETS) {
      const { text } = await games(client, id);
      for (const secret of [...SECRETS, admin]) expect(text).not.toContain(secret);
      expect(text).not.toMatch(/client_?id|admin_?token/i);
    }
  });

  it("keeps every seen board that exists, whatever the cap on my own boards leaves out", async () => {
    const older = await board();
    const newer = await board();
    const { id: opened } = await invite();
    t.query(`UPDATE games SET updated_at = CASE id WHEN ? THEN 3 WHEN ? THEN 2 ELSE 1 END`, newer.id, older.id);
    const list = await listGamesForClient(t.d1, ANA, [opened], 1);
    expect(list.map((g) => g.id).sort()).toEqual([newer.id, opened].sort());
    expect(list.map((g) => g.id)).not.toContain(older.id);
  });

  it("summarizes at most 50 seen boards", async () => {
    const ids = Array.from({ length: 55 }, (_, i) => `seen${String(i).padStart(2, "0")}`);
    for (const [i, id] of ids.entries()) {
      t.query(
        `INSERT INTO games (id, name, team_x, team_y, format, periods, status, host_client_id, admin_token, created_at, updated_at)
         VALUES (?, ?, '{"name":"Chiefs"}', '{"name":"Eagles"}', '{"periods":"quarters","reverse":false,"boardSize":100,"freshNumbers":false}', '[]', 'open', ?, 'tok', 1, ?)`,
        id,
        `Board ${i}`,
        HOST,
        1000 + i,
      );
    }
    const { status, games: list } = await games(CARL, ids.join(","));
    expect(status).toBe(200);
    // The first 50 asked about (most recent first on the device), not the 5 after them.
    expect(list).toHaveLength(50);
    expect(new Set(list.map((g) => g.id))).toEqual(new Set(ids.slice(0, 50)));
    expect(list.every((g) => !g.joined && !g.isHost && g.host === null)).toBe(true);
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
