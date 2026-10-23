// @vitest-environment node
// Basketball boards through the API against real SQL (node:sqlite, every
// migration applied): league/sport pairs on create, the 400 for every score
// (and for quarter-ends in men's college basketball's halves), and live
// updates landing on the board's moments. Only the GameRoom and pushes are faked.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { rulesForPreset } from "../shared/formats";
import { EVERY_SCORE_SPORT_ERROR, HALVES_MOMENT_ERROR, SPORT_ERROR } from "../shared/sports";
import type { CreateGameResponse, GameState, GameSummary, LiveUpdate } from "../shared/types";
import type { Env } from "./env";
import worker from "./index";
import { createTestD1, type TestD1 } from "./payments/testD1";
import { notify } from "./push";
import { applyLiveUpdate } from "./service";

vi.mock("./push", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./push")>()),
  notify: vi.fn(async () => {}),
}));

const HOST = "host-client-bbal-0001";

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
  "migrations/0022_goal_minutes.sql",
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
  vi.mocked(notify).mockClear();
});

afterEach(() => {
  vi.useRealTimers();
});

async function call<T = Record<string, unknown>>(
  method: string,
  path: string,
  opts: { client?: string | null; admin?: string; body?: unknown } = {},
): Promise<{ status: number; body: T }> {
  const headers: Record<string, string> = {};
  if (opts.client !== null) headers["x-client-id"] = opts.client ?? HOST;
  if (opts.admin) headers["x-admin-token"] = opts.admin;
  if (opts.body !== undefined) headers["content-type"] = "application/json";
  const res = await worker.fetch(
    new Request(`https://jaxsquares.test/api${path}`, { method, headers, body: opts.body === undefined ? undefined : JSON.stringify(opts.body) }),
    env,
    { waitUntil: () => {}, passThroughOnException: () => {} } as unknown as ExecutionContext,
  );
  const text = await res.text();
  return { status: res.status, body: (text ? JSON.parse(text) : {}) as T };
}

const DAY = 24 * 60 * 60 * 1000;
const linkedTo = (league: string, eventId = "401705001") => ({ provider: "espn", league, eventId, startsAt: Date.now() + DAY, xIsHome: false });
const formatFor = (preset: "quarters" | "halves" | "final" | "every-score") => ({
  periods: preset,
  reverse: false,
  boardSize: 100,
  freshNumbers: false,
  rules: rulesForPreset(preset, false),
});

const input = (over: Record<string, unknown> = {}) => ({
  name: "March Squares",
  sport: "basketball",
  league: "nba",
  teamX: { name: "Boston Celtics", abbr: "BOS" },
  teamY: { name: "Los Angeles Lakers", abbr: "LAL" },
  format: formatFor("quarters"),
  prizes: {},
  maxPerPlayer: 0,
  linkedEvent: linkedTo("nba"),
  host: { name: "Jordan", color: "#ff6b35", emoji: "🦊" },
  ...over,
});

const create = (over: Record<string, unknown> = {}) => call<CreateGameResponse & { error?: string }>("POST", "/games", { body: input(over) });

describe("creating a basketball board", () => {
  it("links an NBA game as a basketball board", async () => {
    const res = await create();
    expect(res.status).toBe(201);
    expect(res.body.game).toMatchObject({ sport: "basketball", league: "nba", linkedEvent: { league: "nba", eventId: "401705001" } });
    expect(res.body.game.periods.map((p) => p.key)).toEqual(["q1", "q2", "q3", "final"]);
  });

  it.each(["wnba", "ncaab", "ncaaw"])("links a %s game", async (league) => {
    const res = await create({ league, linkedEvent: linkedTo(league), format: formatFor(league === "ncaab" ? "halves" : "final") });
    expect(res.status).toBe(201);
    expect(res.body.game).toMatchObject({ sport: "basketball", league });
  });

  it("takes its sport from the linked league when the client sends none", async () => {
    const res = await create({ sport: undefined });
    expect(res.status).toBe(201);
    expect(res.body.game.sport).toBe("basketball");
  });

  it("refuses every score on basketball with a 400 the app can show", async () => {
    for (const over of [{}, { league: "custom", linkedEvent: null }, { league: "ncaaw", linkedEvent: linkedTo("ncaaw") }]) {
      const res = await create({ ...over, format: formatFor("every-score") });
      expect(res.status).toBe(400);
      expect(res.body.error).toBe(EVERY_SCORE_SPORT_ERROR);
    }
    // A mixed setup (every score plus the quarters) too.
    const mixed = { ...formatFor("quarters"), rules: [...rulesForPreset("every-score", false), ...rulesForPreset("quarters", false)] };
    expect((await create({ format: mixed })).body.error).toBe(EVERY_SCORE_SPORT_ERROR);
  });

  it("refuses quarter-ends in men's college basketball (two halves)", async () => {
    const res = await create({ league: "ncaab", linkedEvent: linkedTo("ncaab"), format: formatFor("quarters") });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe(HALVES_MOMENT_ERROR);
    const halves = await create({ league: "ncaab", linkedEvent: linkedTo("ncaab"), format: formatFor("halves") });
    expect(halves.status).toBe(201);
    expect(halves.body.game.periods.map((p) => p.label)).toEqual(["Half", "Final"]);
  });

  it("refuses a league with the other sport's name on it, and sports it doesn't make boards for", async () => {
    const wrong = await create({ sport: "football" });
    expect(wrong.status).toBe(400);
    expect(wrong.body.error).toBe("That league plays basketball, not football.");
    const nfl = await create({ league: "nfl", linkedEvent: linkedTo("nfl") });
    expect(nfl.body.error).toBe("That league plays football, not basketball.");
    const hockey = await create({ sport: "hockey", league: "custom", linkedEvent: null });
    expect(hockey.body.error).toBe(SPORT_ERROR);
  });

  it("makes a custom basketball board for scoring by hand (any fixed moment, no every score)", async () => {
    const res = await create({ league: "custom", linkedEvent: null, format: formatFor("quarters") });
    expect(res.status).toBe(201);
    expect(res.body.game).toMatchObject({ sport: "basketball", league: "custom", linkedEvent: null });
  });

  it("keeps football as it was: a custom board without a sport is football, every score allowed", async () => {
    const res = await create({ sport: undefined, league: "custom", linkedEvent: null, format: formatFor("every-score") });
    expect(res.status).toBe(201);
    expect(res.body.game.sport).toBe("football");
  });

  it("refuses a linked event from an unknown league", async () => {
    const res = await create({ linkedEvent: { ...linkedTo("nba"), league: "nhl" } });
    expect(res.status).toBe(400);
  });
});

describe("editing a basketball board's rules", () => {
  it("refuses every score (400) and a quarter-end on a game of halves, and takes the rest", async () => {
    const nba = (await create()).body;
    const patch = (id: string, admin: string, format: unknown) => call<{ error?: string }>("PATCH", `/games/${id}`, { admin, body: { format } });
    const every = await patch(nba.game.id, nba.adminToken, formatFor("every-score"));
    expect(every.status).toBe(400);
    expect(every.body.error).toBe(EVERY_SCORE_SPORT_ERROR);
    expect((await patch(nba.game.id, nba.adminToken, formatFor("halves"))).status).toBe(200);

    const college = (await create({ league: "ncaab", linkedEvent: linkedTo("ncaab"), format: formatFor("halves") })).body;
    const quarters = await patch(college.game.id, college.adminToken, formatFor("quarters"));
    expect(quarters.status).toBe(400);
    expect(quarters.body.error).toBe(HALVES_MOMENT_ERROR);
    expect((await patch(college.game.id, college.adminToken, formatFor("final"))).status).toBe(200);
  });
});

describe("live basketball scores", () => {
  const update = (period: number, x: number[], y: number[], completed: number, detail: string, isFinal = false): LiveUpdate => ({
    live: { state: isFinal ? "post" : "in", period, clock: "", detail, scoreX: x.reduce((s, v) => s + v, 0), scoreY: y.reduce((s, v) => s + v, 0), updatedAt: 1 },
    linescoresX: x,
    linescoresY: y,
    completedPeriods: completed,
    isFinal,
  });

  async function lockedBoard(over: Record<string, unknown>): Promise<string> {
    const { game, adminToken } = (await create(over)).body;
    expect((await call("POST", `/games/${game.id}/lock`, { admin: adminToken })).status).toBe(200);
    return game.id;
  }

  it("decides a men's college board's half at halftime (period 1) and its final with overtime", async () => {
    const id = await lockedBoard({ league: "ncaab", linkedEvent: linkedTo("ncaab"), format: formatFor("halves") });
    await applyLiveUpdate(env, id, update(1, [22], [17], 0, "8:14 - 1st Half"), async () => {});
    let state = (await call<GameState>("GET", `/games/${id}`, { client: null })).body;
    expect(state.scores).toEqual([]);
    await applyLiveUpdate(env, id, update(1, [41], [33], 1, "Halftime"), async () => {});
    await applyLiveUpdate(env, id, update(2, [41, 20], [33, 18], 1, "12:41 - 2nd Half"), async () => {});
    state = (await call<GameState>("GET", `/games/${id}`, { client: null })).body;
    expect(state.scores.map((s) => [s.periodKey, s.scoreX, s.scoreY])).toEqual([["q2", 41, 33]]);
    await applyLiveUpdate(env, id, update(3, [41, 30, 9], [33, 38, 5], 3, "Final/OT", true), async () => {});
    state = (await call<GameState>("GET", `/games/${id}`, { client: null })).body;
    expect(state.game.status).toBe("final");
    expect(state.scores.map((s) => [s.periodKey, s.scoreX, s.scoreY]).sort()).toEqual([
      ["final", 80, 76],
      ["q2", 41, 33],
    ]);
  });

  it("decides an NBA board's quarters and a three-digit final", async () => {
    const id = await lockedBoard({});
    await applyLiveUpdate(env, id, update(2, [30, 26], [28, 31], 2, "Halftime"), async () => {});
    await applyLiveUpdate(env, id, update(5, [30, 26, 29, 25, 7], [28, 31, 24, 27, 11], 5, "Final/OT", true), async () => {});
    const state = (await call<GameState>("GET", `/games/${id}`, { client: null })).body;
    expect(state.scores.map((s) => [s.periodKey, s.scoreX, s.scoreY]).sort()).toEqual([
      ["final", 117, 121],
      ["q1", 30, 28],
      ["q2", 56, 59],
      ["q3", 85, 83],
    ]);
  });

  it("sends the league with the dashboard summary", async () => {
    await create({ league: "ncaab", linkedEvent: linkedTo("ncaab"), format: formatFor("halves") });
    const { games } = (await call<{ games: GameSummary[] }>("GET", "/me/games")).body;
    expect(games[0]).toMatchObject({ sport: "basketball", league: "ncaab" });
  });
});
