// @vitest-environment node
// Goal-minute soccer boards (shared/soccer.ts) through the API against real
// SQL (node:sqlite, every migration applied): create and edit checks, the
// host's goals with their minutes, the feed's goals landing as entries (a
// goal ruled out taken back), the first, every and last goal's winners and
// pushes, and square 00 when the match ends without a goal. Only the
// GameRoom and pushes are faked.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { rulesForPreset } from "../shared/formats";
import { BY_KIND_SPORT_ERROR, SOCCER_FRESH_ERROR, SOCCER_MOMENT_ERROR } from "../shared/sports";
import { resolveResults } from "../shared/squares";
import type { CreateGameResponse, GameState, LiveGoal, LiveUpdate, MomentRule } from "../shared/types";
import type { Env } from "./env";
import worker from "./index";
import { createTestD1, type TestD1 } from "./payments/testD1";
import { notify } from "./push";
import { applyLiveUpdate } from "./service";

vi.mock("./push", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./push")>()),
  notify: vi.fn(async () => {}),
}));

const HOST = "host-client-socc-0001";

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
const linkedTo = (league: string, eventId = "740700") => ({ provider: "espn", league, eventId, startsAt: Date.now() + DAY, xIsHome: true });
const prize = { amount: null, note: "" };
const ALL: MomentRule[] = [
  { moment: "first", square: prize, reverse: null },
  { moment: "score", square: prize, reverse: null },
  { moment: "final", square: prize, reverse: null },
];
const formatOf = (rules: MomentRule[], over: Record<string, unknown> = {}) => ({ periods: "custom", reverse: false, boardSize: 100, freshNumbers: false, rules, ...over });

const input = (over: Record<string, unknown> = {}) => ({
  name: "Derby Squares",
  sport: "soccer",
  league: "epl",
  teamX: { name: "Arsenal", abbr: "ARS" },
  teamY: { name: "Chelsea", abbr: "CHE" },
  format: formatOf(ALL),
  prizes: {},
  maxPerPlayer: 0,
  linkedEvent: linkedTo("epl"),
  host: { name: "Sam", color: "#ff6b35", emoji: "🦊" },
  ...over,
});

const create = (over: Record<string, unknown> = {}) => call<CreateGameResponse & { error?: string }>("POST", "/games", { body: input(over) });
const stateOf = async (id: string) => (await call<GameState>("GET", `/games/${id}`, { client: null })).body;

const EVERY_SQUARE = Array.from({ length: 100 }, (_, i) => ({ row: Math.floor(i / 10), col: i % 10 }));

/** A drawn board whose every square the host holds (so each minute's square has a winner, whatever the draw). */
async function lockedBoard(over: Record<string, unknown> = {}): Promise<{ id: string; admin: string }> {
  const { game, adminToken } = (await create(over)).body;
  expect((await call("POST", `/games/${game.id}/claim`, { body: { cells: EVERY_SQUARE } })).status).toBe(200);
  expect((await call("POST", `/games/${game.id}/lock`, { admin: adminToken })).status).toBe(200);
  return { id: game.id, admin: adminToken };
}

describe("creating a soccer board", () => {
  it("links a Premier League match as a soccer board that wins on goals", async () => {
    const res = await create();
    expect(res.status).toBe(201);
    expect(res.body.game).toMatchObject({ sport: "soccer", league: "epl", linkedEvent: { league: "epl", eventId: "740700" } });
    expect(res.body.game.periods).toEqual([
      { key: "first", label: "1st goal" },
      { key: "final", label: "Last goal" },
    ]);
  });

  it.each(["mls", "nwsl", "laliga", "ligamx", "ucl"])("links a %s match", async (league) => {
    const res = await create({ league, linkedEvent: linkedTo(league) });
    expect(res.status).toBe(201);
    expect(res.body.game).toMatchObject({ sport: "soccer", league });
  });

  it("makes a custom soccer board, and refuses quarters, score types and fresh numbers", async () => {
    expect((await create({ league: "custom", linkedEvent: null })).status).toBe(201);
    const quarters = await create({ format: formatOf(rulesForPreset("quarters", false)) });
    expect(quarters.status).toBe(400);
    expect(quarters.body.error).toBe(SOCCER_MOMENT_ERROR);
    const byKind = await create({ format: formatOf([{ moment: "score", square: { amount: 5, note: "", byKind: { touchdown: 10 } }, reverse: null }]) });
    expect(byKind.body.error).toBe(BY_KIND_SPORT_ERROR);
    const fresh = await create({ format: formatOf(rulesForPreset("final", false), { freshNumbers: true }) });
    expect(fresh.body.error).toBe(SOCCER_FRESH_ERROR);
    // Football never takes the first goal.
    const football = await create({ sport: "football", league: "custom", linkedEvent: null });
    expect(football.status).toBe(400);
    expect(football.body.error).toBe("That moment isn't part of this game.");
  });

  it("keeps season boards to football and basketball", async () => {
    const res = await create({ linkedEvent: null, season: { scope: "games", numbers: "same", events: [] } });
    expect(res.status).toBe(400);
  });
});

describe("the host's goals", () => {
  it("records a goal with its minute and decides the first goal and goal 1 by it", async () => {
    const { id, admin } = await lockedBoard({ league: "custom", linkedEvent: null });
    const res = await call<{ state: GameState; error?: string }>("POST", `/games/${id}/scores`, {
      admin,
      body: { periodKey: "next", scoreX: 1, scoreY: 0, minute: 43 },
    });
    expect(res.status).toBe(200);
    expect(res.body.state.scores).toMatchObject([{ periodKey: "s1", label: "Goal 1", minute: 43, added: 0, source: "host" }]);
    const results = resolveResults(res.body.state);
    expect(results.map((r) => [r.periodKey, r.goalMinute])).toEqual([
      ["first", 43],
      ["s1", 43],
    ]);
    expect(results.every((r) => r.winnerPlayerId === res.body.state.game.hostPlayerId)).toBe(true);
    const winners = res.body.state.activity.filter((a) => a.type === "winner").map((a) => a.data.periodKey as string);
    expect(winners.sort()).toEqual(["first", "s1"]);
    const pushed = vi.mocked(notify).mock.calls.filter(([, , e]) => e.kind === "winner");
    expect(pushed.map(([, , e]) => (e as { periodKey: string }).periodKey).sort()).toEqual(["first", "s1"]);
  });

  it("needs the minute for a goal, and refuses one anywhere else", async () => {
    const { id, admin } = await lockedBoard({ league: "custom", linkedEvent: null });
    const missing = await call<{ error?: string }>("POST", `/games/${id}/scores`, { admin, body: { periodKey: "next", scoreX: 1, scoreY: 0 } });
    expect(missing.status).toBe(400);
    expect(missing.body.error).toMatch(/minute/);
    const tooLate = await call("POST", `/games/${id}/scores`, { admin, body: { periodKey: "next", scoreX: 1, scoreY: 0, minute: 45, added: 31 } });
    expect(tooLate.status).toBe(400);
    const stoppage = await call<{ state: GameState }>("POST", `/games/${id}/scores`, { admin, body: { periodKey: "next", scoreX: 1, scoreY: 0, minute: 45, added: 2 } });
    expect(stoppage.body.state.scores[0]).toMatchObject({ minute: 45, added: 2 });
    const final = await call<{ error?: string }>("POST", `/games/${id}/scores`, { admin, body: { periodKey: "final", scoreX: 1, scoreY: 0, minute: 90 } });
    expect(final.status).toBe(400);
  });

  it("takes goals on a board where only the first and last goal win", async () => {
    const { id, admin } = await lockedBoard({ league: "custom", linkedEvent: null, format: formatOf(rulesForPreset("first-last", false)) });
    const res = await call<{ state: GameState }>("POST", `/games/${id}/scores`, { admin, body: { periodKey: "next", scoreX: 0, scoreY: 1, minute: 71 } });
    expect(res.status).toBe(200);
    expect(resolveResults(res.body.state).map((r) => r.periodKey)).toEqual(["first"]);
    // A host pick goes on the board's own moments only.
    expect((await call("POST", `/games/${id}/winners`, { admin, body: { periodKey: "s1", row: 0, col: 0 } })).status).toBe(400);
  });

  it("gives square 00 every goal moment when the host ends a match without a goal", async () => {
    const { id, admin } = await lockedBoard({ league: "custom", linkedEvent: null, format: formatOf(rulesForPreset("every-score", false)) });
    vi.mocked(notify).mockClear();
    const ended = await call<{ state: GameState }>("POST", `/games/${id}/final`, { admin });
    expect(ended.status).toBe(200);
    const results = resolveResults(ended.body.state);
    expect(results.map((r) => [r.periodKey, r.label, r.goalMinute])).toEqual([["s1", "No goals", 0]]);
    expect(results[0].winnerPlayerId).not.toBeNull();
    expect(ended.body.state.activity.some((a) => a.type === "winner" && a.data.periodKey === "s1")).toBe(true);
    // Square 00's winner push, then the final's.
    expect(vi.mocked(notify).mock.calls.map(([, , e]) => e.kind)).toEqual(["winner", "final"]);
  });
});

describe("live soccer goals", () => {
  const goal = (minute: number, added: number, team: "x" | "y"): LiveGoal => ({ minute, added, team });
  const update = (goals: LiveGoal[], clock: string, isFinal = false, score?: [number, number]): LiveUpdate => {
    const scoreX = score?.[0] ?? goals.filter((g) => g.team === "x").length;
    const scoreY = score?.[1] ?? goals.filter((g) => g.team === "y").length;
    return {
      live: { state: isFinal ? "post" : "in", period: 2, clock, detail: isFinal ? "FT" : clock, scoreX, scoreY, updatedAt: 1 },
      linescoresX: [],
      linescoresY: [],
      completedPeriods: isFinal ? 2 : 1,
      isFinal,
      goals,
    };
  };

  it("records the feed's goals with their minutes, takes back one ruled out and decides the last goal at full time", async () => {
    const { id } = await lockedBoard();
    await applyLiveUpdate(env, id, update([goal(12, 0, "x")], "13'"), async () => {});
    await applyLiveUpdate(env, id, update([goal(12, 0, "x"), goal(45, 2, "y")], "45'+3'"), async () => {});
    let state = await stateOf(id);
    expect(state.scores.map((s) => [s.periodKey, s.minute, s.added, s.scoreX, s.scoreY])).toEqual([
      ["s1", 12, 0, 1, 0],
      ["s2", 45, 2, 1, 1],
    ]);
    // A third goal, then ruled out: the score and the list agree again without it.
    await applyLiveUpdate(env, id, update([goal(12, 0, "x"), goal(45, 2, "y"), goal(78, 0, "x")], "79'"), async () => {});
    await applyLiveUpdate(env, id, update([goal(12, 0, "x"), goal(45, 2, "y")], "81'"), async () => {});
    state = await stateOf(id);
    expect(state.scores.map((s) => s.periodKey)).toEqual(["s1", "s2"]);
    // Stoppage time: 90+4' is the 94th minute's square.
    await applyLiveUpdate(env, id, update([goal(12, 0, "x"), goal(45, 2, "y"), goal(90, 4, "y")], "90'+5'"), async () => {});
    await applyLiveUpdate(env, id, update([goal(12, 0, "x"), goal(45, 2, "y"), goal(90, 4, "y")], "90'+6'", true), async () => {});
    state = await stateOf(id);
    expect(state.game.status).toBe("final");
    const results = resolveResults(state);
    expect(results.map((r) => [r.periodKey, r.goalMinute])).toEqual([
      ["first", 12],
      ["s1", 12],
      ["s2", 45],
      ["s3", 94],
      ["final", 94],
    ]);
    expect(results.at(-1)?.score).toMatchObject({ periodKey: "final", scoreX: 1, scoreY: 2 });
  });

  it("waits while the list lags the score, and never touches a host's goal", async () => {
    const { id, admin } = await lockedBoard();
    await call("POST", `/games/${id}/scores`, { admin, body: { periodKey: "next", scoreX: 1, scoreY: 0, minute: 10 } });
    // The score shows two goals, the list one: goal 1 stays the host's, nothing is taken back.
    await applyLiveUpdate(env, id, update([goal(11, 0, "x")], "30'", false, [2, 0]), async () => {});
    const state = await stateOf(id);
    expect(state.scores.map((s) => [s.periodKey, s.minute, s.source])).toEqual([["s1", 10, "host"]]);
  });

  it("gives the 00 square a match's goal moments at a goalless full time", async () => {
    const { id } = await lockedBoard({ format: formatOf(rulesForPreset("first-last", false)) });
    await applyLiveUpdate(env, id, update([], "90'+4'", true), async () => {});
    const state = await stateOf(id);
    expect(resolveResults(state).map((r) => [r.periodKey, r.goalMinute])).toEqual([
      ["first", 0],
      ["final", 0],
    ]);
  });
});
