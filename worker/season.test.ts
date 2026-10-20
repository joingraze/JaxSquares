// @vitest-environment node
// Season boards end to end against real SQL (node:sqlite, every migration
// through 0017): making one (a team's season, picked games), its draw (the
// free tier, the 402, a pass) giving every game still to come a board of its
// own with the season's players, squares and numbers, paid through the season
// board; those game boards refusing claims and edits and staying off Home; the
// cron adding a playoff game once it's scheduled; a game's live feed deciding
// its winners like any board and the season adding them up; one "numbers
// drawn" push; a co-host running the games; never a clientId in sight. ESPN,
// the GameRoom and pushes are faked.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { derivePlayerIdSync } from "../shared/playerId";
import { SEASON_ERRORS, SEASON_PROVIDER } from "../shared/season";
import { drawFor, winningCell } from "../shared/squares";
import { PAYMENT_REQUIRED_CODE, type CreateGameResponse, type GameState, type GameSummary, type LiveUpdate, type MeResponse } from "../shared/types";
import type { Env } from "./env";
import worker from "./index";
import { inviteMeta } from "./og";
import { getPaymentConfig } from "./payments";
import { createTestD1, type TestD1 } from "./payments/testD1";
import { notify } from "./push";
import { clearMemoryCache } from "./scores/cache";
import { NFL, teamSchedule, teamsList, type FixtureTeam, type ScheduleGame } from "./scores/season.fixtures";
import { applyLiveUpdate } from "./service";

vi.mock("./push", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./push")>()),
  notify: vi.fn(async () => {}),
}));

const HOST = "host-client-seas-0001";
const ANA = "ana-client-seas-0002";
const BEN = "ben-client-seas-0003";
const CAL = "cal-client-seas-0004";
const CLIENTS = [HOST, ANA, BEN, CAL, "dee-client-seas-0005", "eve-client-seas-0006", "fay-client-seas-0007"];
const pid = (client: string) => derivePlayerIdSync(client);

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
];

const DAY = 86_400_000;
// Whole minutes: ESPN writes kickoffs to the minute.
const NOW = Math.floor(Date.now() / 60_000) * 60_000;

let t: TestD1;
let env: Env;
let roomCalls: { url: string; game: string | null; body: string | null }[];
let pending: Promise<unknown>[];
/** What ESPN answers for the Jaguars' postseason (empty until the playoffs are scheduled). */
let playoffs: ScheduleGame[];
let espnDown: boolean;

const regular: ScheduleGame[] = [
  { id: "401800101", date: NOW - 30 * DAY, home: NFL.mia, away: NFL.jax, week: { number: 1, text: "Week 1" }, state: "post", score: { home: 17, away: 24 } },
  { id: "401800107", date: NOW + 2 * DAY, home: NFL.jax, away: NFL.hou, week: { number: 8, text: "Week 8" } },
  { id: "401800108", date: NOW + 9 * DAY, home: NFL.ten, away: NFL.jax, week: { number: 9, text: "Week 9" } },
  { id: "401800109", date: NOW + 16 * DAY, home: NFL.jax, away: NFL.ind, week: { number: 10, text: "Week 10" } },
];

function espn(url: URL): Response {
  const json = (body: unknown) => new Response(JSON.stringify(body), { headers: { "content-type": "application/json" } });
  if (espnDown || url.hostname !== "site.api.espn.com") return new Response("down", { status: 503 });
  if (url.pathname.endsWith("/teams")) return json(teamsList(Object.values(NFL)));
  if (url.pathname.endsWith("/teams/30/schedule")) {
    const type = url.searchParams.get("seasontype");
    return json(teamSchedule(NFL.jax, 2026, type === "3" ? playoffs : regular, type === "3" ? 3 : 2));
  }
  return new Response("not found", { status: 404 });
}

beforeEach(async () => {
  t = await createTestD1(MIGRATIONS);
  roomCalls = [];
  pending = [];
  playoffs = [];
  espnDown = false;
  const stub = {
    fetch: async (input: string, init?: RequestInit) => {
      const game = (init?.headers as Record<string, string> | undefined)?.["x-game-id"] ?? null;
      roomCalls.push({ url: String(input), game, body: typeof init?.body === "string" ? init.body : null });
      return new Response(null, { status: 204 });
    },
  };
  env = {
    DB: t.d1,
    GAME_ROOM: { idFromName: (n: string) => n, get: () => stub } as unknown as DurableObjectNamespace,
    ASSETS: { fetch: async () => new Response("<html><head><title>JaxSquares</title></head><body></body></html>") } as unknown as Fetcher,
  } as Env;
  vi.mocked(notify).mockClear();
  vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => espn(new URL(String(input)))));
  vi.spyOn(console, "warn").mockImplementation(() => {});
  vi.spyOn(console, "log").mockImplementation(() => {});
  clearMemoryCache();
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

async function call<T = Record<string, unknown>>(
  method: string,
  path: string,
  opts: { client?: string | null; admin?: string; body?: unknown } = {},
): Promise<{ status: number; body: T; text: string }> {
  const headers: Record<string, string> = {};
  if (opts.client !== null) headers["x-client-id"] = opts.client ?? HOST;
  if (opts.admin) headers["x-admin-token"] = opts.admin;
  if (opts.body !== undefined) headers["content-type"] = "application/json";
  const res = await worker.fetch(
    new Request(`https://jaxsquares.test/api${path}`, { method, headers, body: opts.body === undefined ? undefined : JSON.stringify(opts.body) }),
    env,
    { waitUntil: (p: Promise<unknown>) => void pending.push(p), passThroughOnException: () => {} } as unknown as ExecutionContext,
  );
  const text = await res.text();
  return { status: res.status, body: (text ? JSON.parse(text) : {}) as T, text };
}

async function settle(): Promise<void> {
  while (pending.length) await Promise.all(pending.splice(0));
}

const plain = (t: FixtureTeam) => ({ name: t.displayName, abbr: t.abbreviation, color: `#${t.color}` });
const eventOf = (g: ScheduleGame) => ({
  eventId: g.id,
  startsAt: g.date,
  home: plain(g.home),
  away: plain(g.away),
  homeId: g.home.id,
  awayId: g.away.id,
  ...(g.week ? { label: g.week.text } : {}),
});
// An older app still sends the team's logo; it's never kept (team logos are the leagues' trademarks).
const JAX = { id: "30", name: "Jacksonville Jaguars", shortName: "Jaguars", abbr: "JAX", color: "#007487", logo: "https://a.espncdn.com/i/teamlogos/nfl/500/jax.png" };

const quarters = { periods: "quarters", reverse: false, boardSize: 100, freshNumbers: false, unit: "$", squarePrice: 1 };

function seasonInput(over: Record<string, unknown> = {}, season: Record<string, unknown> = {}) {
  return {
    name: "Office Season",
    sport: "football",
    league: "nfl",
    teamX: { name: "ignored" },
    teamY: { name: "ignored" },
    format: quarters,
    prizes: {},
    maxPerPlayer: 0,
    linkedEvent: null,
    host: { name: "Jordan", color: "#ff6b35", emoji: "🦊" },
    season: { scope: "team", numbers: "same", team: JAX, year: 2026, events: regular.map(eventOf), ...season },
    ...over,
  };
}

async function createSeason(over: Record<string, unknown> = {}, season: Record<string, unknown> = {}) {
  const res = await call<CreateGameResponse & { error?: string }>("POST", "/games", { body: seasonInput(over, season) });
  return res;
}

async function stateOf(id: string): Promise<GameState> {
  const res = await call<GameState>("GET", `/games/${id}`, { client: null });
  expect(res.status).toBe(200);
  return res.body;
}

/** Players join and split the whole board between them (every square owned, so every moment has a winner). */
async function fill(id: string, clients: string[]): Promise<void> {
  const cells: { row: number; col: number }[] = [];
  for (let row = 0; row < 10; row++) for (let col = 0; col < 10; col++) cells.push({ row, col });
  for (const [i, client] of clients.entries()) {
    expect((await call("POST", `/games/${id}/join`, { client, body: { name: `P${i}`, color: "#38bdf8", emoji: "" } })).status).toBe(200);
    const mine = cells.filter((_, k) => k % clients.length === i);
    expect((await call("POST", `/games/${id}/claim`, { client, body: { cells: mine } })).status).toBe(200);
  }
}

const children = (id: string) =>
  t.query<{ id: string; season_event: string; status: string; numbers: string; paid_at: number | null; payment_provider: string; payment_reference: string; payment_amount_cents: number; admin_token: string; host_client_id: string; locked_at: number | null }>(
    `SELECT id, season_event, status, numbers, paid_at, payment_provider, payment_reference, payment_amount_cents, admin_token, host_client_id, locked_at FROM games WHERE season_id = ? ORDER BY starts_at`,
    id,
  );

async function drawnSeason(opts: { numbers?: "same" | "fresh"; players?: string[] } = {}) {
  const made = await createSeason({}, { numbers: opts.numbers ?? "same" });
  expect(made.status).toBe(201);
  const { id } = made.body.game;
  await fill(id, opts.players ?? [HOST, ANA, BEN]);
  vi.mocked(notify).mockClear();
  const lock = await call<{ state: GameState }>("POST", `/games/${id}/lock`, { admin: made.body.adminToken });
  expect(lock.status).toBe(200);
  await settle();
  return { id, admin: made.body.adminToken, state: lock.body.state };
}

describe("making a season board", () => {
  it("makes a team's season: a season board with the team across the top, its games planned, no game boards yet", async () => {
    const res = await createSeason();
    expect(res.status).toBe(201);
    const { game } = res.body;
    expect(game).toMatchObject({ kind: "season", league: "nfl", sport: "football", status: "open", paid: false, linkedEvent: null });
    expect(game.teamX).toEqual({ name: "Jacksonville Jaguars", abbr: "JAX", color: "#007487" });
    expect(game.teamY).toEqual({ name: "Opponent", abbr: "OPP" });
    const state = await stateOf(game.id);
    expect(state.season).toMatchObject({ scope: "team", numbers: "same", league: "nfl", year: 2026, label: "Jaguars 2026 season" });
    expect(state.season?.team).toMatchObject({ id: "30", shortName: "Jaguars" });
    expect(state.season?.team).not.toHaveProperty("logo");
    // The game that's already over isn't covered; the three to come are, planned.
    expect(state.season?.games.map((g) => [g.eventId, g.status, g.id, g.label])).toEqual([
      ["401800107", "planned", null, "Week 8"],
      ["401800108", "planned", null, "Week 9"],
      ["401800109", "planned", null, "Week 10"],
    ]);
    // The team keeps its side: home in week 8, away in week 9.
    expect(state.season?.games.map((g) => [g.teamX.abbr, g.teamY.abbr])).toEqual([
      ["JAX", "HOU"],
      ["JAX", "TEN"],
      ["JAX", "IND"],
    ]);
    expect(children(game.id)).toEqual([]);
    expect(game.startsAt).toBe(regular[1].date);
  });

  it("makes a season of picked games, away across the top", async () => {
    const picked = [regular[2], regular[3]].map(eventOf);
    const res = await createSeason({}, { scope: "games", team: undefined, year: undefined, numbers: "fresh", events: picked });
    expect(res.status).toBe(201);
    const state = await stateOf(res.body.game.id);
    expect(state.game.teamX).toEqual({ name: "Away", abbr: "AWAY" });
    expect(state.season).toMatchObject({ scope: "games", numbers: "fresh", team: null, label: "2 NFL games" });
    expect(state.season?.games.map((g) => [g.teamX.abbr, g.teamY.abbr])).toEqual([
      ["JAX", "TEN"],
      ["IND", "JAX"],
    ]);
  });

  it("refuses a season without a live league, a game to come, a team, or with money in a team's name", async () => {
    expect((await createSeason({ league: "custom" })).body.error).toBe(SEASON_ERRORS.league);
    expect((await createSeason({}, { scope: "decade" })).body.error).toBe(SEASON_ERRORS.scope);
    expect((await createSeason({}, { numbers: "lucky" })).body.error).toBe(SEASON_ERRORS.numbers);
    expect((await createSeason({}, { team: { name: "No id" } })).body.error).toBe(SEASON_ERRORS.team);
    expect((await createSeason({}, { events: [eventOf(regular[0])] })).body.error).toBe(SEASON_ERRORS.noGames);
    expect((await createSeason({}, { scope: "games", events: [] })).body.error).toBe(SEASON_ERRORS.events);
    const pricey = { ...eventOf(regular[1]), away: { name: "Win $500 Club", abbr: "WIN" } };
    expect((await createSeason({}, { events: [pricey] })).status).toBe(400);
    expect((await createSeason({ fromGameId: "abcdef" })).body.error).toBe(SEASON_ERRORS.sibling);
    // Every score isn't offered for basketball here either.
    const res = await createSeason({ league: "nba", sport: "basketball", format: { ...quarters, periods: "every-score" } });
    expect(res.status).toBe(400);
  });
});

describe("the draw", () => {
  it("draws a small season for free and gives every game still to come its own board: the season's players, squares and numbers, paid through the season", async () => {
    const { id, admin, state } = await drawnSeason();
    expect(state.game).toMatchObject({ status: "locked", paid: true });
    const kids = children(id);
    expect(kids.map((k) => k.season_event)).toEqual(["401800107", "401800108", "401800109"]);
    const parentRow = t.query<{ admin_token: string; host_client_id: string; payment_provider: string }>(`SELECT admin_token, host_client_id, payment_provider FROM games WHERE id = ?`, id)[0];
    expect(parentRow.payment_provider).toBe("free");
    for (const k of kids) {
      expect(k).toMatchObject({ status: "locked", payment_provider: SEASON_PROVIDER, payment_reference: id, payment_amount_cents: 0 });
      expect(k.paid_at).not.toBeNull();
      expect(k.locked_at).not.toBeNull();
      // The season's host and admin token: the host's device runs every game.
      expect(k.admin_token).toBe(parentRow.admin_token);
      expect(k.host_client_id).toBe(HOST);
      // Same numbers all season.
      expect(JSON.parse(k.numbers)).toEqual(state.game.numbers);
    }
    const parent = await stateOf(id);
    const kid = await stateOf(kids[0].id);
    expect(kid.game).toMatchObject({ seasonId: id, status: "locked", paid: true, league: "nfl", name: "Office Season · HOU @ JAX" });
    expect(kid.game.linkedEvent).toMatchObject({ eventId: "401800107", xIsHome: true });
    expect(kid.game.teamX.abbr).toBe("JAX");
    // Copied players and squares, the season's rules and prizes.
    expect(kid.players.map((p) => p.id).sort()).toEqual(parent.players.map((p) => p.id).sort());
    expect(kid.squares.map((s) => `${s.row},${s.col},${s.playerId}`).sort()).toEqual(parent.squares.map((s) => `${s.row},${s.col},${s.playerId}`).sort());
    expect(kid.game.format).toEqual(parent.game.format);
    expect(kid.seasonGame).toEqual({ id, name: "Office Season", index: 1, count: 3, prevId: null, nextId: kids[1].id });
    expect((await stateOf(kids[2].id)).seasonGame).toMatchObject({ index: 3, prevId: kids[1].id, nextId: null });
    // The season board lists them now, by kickoff.
    expect(parent.season?.games.map((g) => [g.id, g.status, g.index])).toEqual(kids.map((k, i) => [k.id, "locked", i + 1]));
    // Drawing again is a 409.
    expect((await call("POST", `/games/${id}/lock`, { admin })).status).toBe(409);
  });

  it("draws fresh numbers for each game, and none for the season board", async () => {
    const { id, state } = await drawnSeason({ numbers: "fresh" });
    expect(state.game.numbers).toEqual({});
    const draws = children(id).map((k) => JSON.parse(k.numbers) as Record<string, { x: number[][] }>);
    expect(draws).toHaveLength(3);
    for (const d of draws) expect(d["*"].x.flat().sort()).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
    // Three separate draws (10! orders each: never all the same).
    expect(new Set(draws.map((d) => JSON.stringify(d))).size).toBeGreaterThan(1);
  });

  it("answers 402 on a bigger season until it's paid for; a Host Pass covers it", async () => {
    const made = await createSeason();
    const { id } = made.body.game;
    await fill(id, CLIENTS.slice(0, 6));
    const res = await call<{ error: string; code: string }>("POST", `/games/${id}/lock`, { admin: made.body.adminToken });
    expect(res.status).toBe(402);
    expect(res.body.code).toBe(PAYMENT_REQUIRED_CODE);
    expect(children(id)).toEqual([]);
    const now = Date.now();
    t.query(
      `INSERT INTO host_passes (id, client_id, provider, external_id, status, current_period_end, auto_renew, livemode, event_at, created_at, updated_at)
       VALUES ('hp_season', ?, 'iap', 'ext-1', 'active', ?, 1, 0, ?, ?, ?)`,
      HOST,
      now + 300 * DAY,
      now,
      now,
      now,
    );
    expect((await call("POST", `/games/${id}/lock`, { admin: made.body.adminToken })).status).toBe(200);
    expect(t.query<{ payment_provider: string; payment_reference: string }>(`SELECT payment_provider, payment_reference FROM games WHERE id = ?`, id)[0]).toEqual({
      payment_provider: "pass",
      payment_reference: "hp_season",
    });
    expect(children(id)).toHaveLength(3);
  });

  it("takes the season fee in test mode, then draws; the season's price is its own", async () => {
    const made = await createSeason();
    const { id } = made.body.game;
    await fill(id, CLIENTS.slice(0, 6));
    expect(getPaymentConfig(env).season).toEqual({ priceCents: 1499, iapProductId: "com.jaxsquares.app.seasonboard" });
    expect(getPaymentConfig({ ...env, SEASON_BOARD_PRICE_CENTS: "1999" } as Env).season?.priceCents).toBe(1999);
    expect(getPaymentConfig(env).priceCents).toBe(499);
    expect((await call("POST", `/games/${id}/pay/test`, { admin: made.body.adminToken })).status).toBe(200);
    expect((await call("POST", `/games/${id}/lock`, { admin: made.body.adminToken })).status).toBe(200);
    expect(children(id)).toHaveLength(3);
  });

  it("won't draw a season with no game left to play", async () => {
    const made = await createSeason();
    await fill(made.body.game.id, [HOST]);
    // Every game kicked off since (ESPN's schedule now says so).
    for (const g of regular) g.date -= 40 * DAY;
    try {
      const res = await call<{ error: string }>("POST", `/games/${made.body.game.id}/lock`, { admin: made.body.adminToken });
      expect(res.status).toBe(409);
      expect(res.body.error).toBe(SEASON_ERRORS.noGames);
      expect((await stateOf(made.body.game.id)).game).toMatchObject({ status: "open", paid: false });
    } finally {
      for (const g of regular) g.date += 40 * DAY;
    }
  });

  it("falls back to the games it knows when ESPN is down at the draw", async () => {
    const made = await createSeason();
    await fill(made.body.game.id, [HOST, ANA]);
    espnDown = true;
    expect((await call("POST", `/games/${made.body.game.id}/lock`, { admin: made.body.adminToken })).status).toBe(200);
    expect(children(made.body.game.id)).toHaveLength(3);
  });

  it("sends one push for the whole season at the draw, and none for its games", async () => {
    const { id } = await drawnSeason();
    const calls = vi.mocked(notify).mock.calls.map(([, game, event]) => [game, event.kind]);
    expect(calls).toEqual([[id, "numbers-drawn"]]);
  });
});

describe("a season's game boards", () => {
  it("refuse claims, joins, edits, co-host invites and deleting on their own", async () => {
    const { id, admin } = await drawnSeason();
    const kid = children(id)[0].id;
    const claim = await call<{ error: string }>("POST", `/games/${kid}/claim`, { client: ANA, body: { cells: [{ row: 0, col: 0 }] } });
    expect([claim.status, claim.body.error]).toEqual([409, SEASON_ERRORS.childClaim]);
    expect((await call("POST", `/games/${kid}/release`, { client: ANA, body: { cells: [{ row: 0, col: 1 }] } })).status).toBe(409);
    const join = await call<{ error: string }>("POST", `/games/${kid}/join`, { client: CAL, body: { name: "Cal", color: "#38bdf8", emoji: "" } });
    expect([join.status, join.body.error]).toEqual([409, SEASON_ERRORS.childJoin]);
    const edit = await call<{ error: string }>("PATCH", `/games/${kid}`, { admin, body: { name: "Mine now" } });
    expect([edit.status, edit.body.error]).toEqual([409, SEASON_ERRORS.childEdit]);
    expect((await call("POST", `/games/${kid}/cohost-invites`, { admin })).status).toBe(409);
    expect((await call("DELETE", `/games/${kid}`, { admin })).status).toBe(409);
    expect((await call("POST", `/games/${kid}/lock`, { admin })).status).toBe(409);
    expect((await call("POST", "/games", { body: { ...seasonInput(), season: undefined, linkedEvent: null, fromGameId: kid } }, )).status).toBe(409);
    // The season board takes no scores of its own.
    expect((await call("POST", `/games/${id}/scores`, { admin, body: { periodKey: "q1", scoreX: 7, scoreY: 0 } })).status).toBe(409);
  });

  it("stay off Home: the season board shows, with its next game", async () => {
    const { id } = await drawnSeason();
    const kids = children(id).map((k) => k.id);
    const res = await call<{ games: GameSummary[] }>("GET", `/me/games?seen=${kids[0]}`, { client: ANA });
    expect(res.body.games.map((g) => g.id)).toEqual([id]);
    const summary = res.body.games[0];
    expect(summary).toMatchObject({ kind: "season", status: "locked", mySquares: 33, startsAt: regular[1].date });
    expect(summary.season).toMatchObject({ label: "Jaguars 2026 season", games: 3, played: 0, current: { id: kids[0], index: 1 } });
    // The host's tokens list the season board, not its games (they share its token).
    const me = await call<MeResponse>("GET", "/me");
    expect(Object.keys(me.body.hostTokens)).toEqual([id]);
  });

  it("decide winners from their own live feed like any board, and the season adds them up", async () => {
    const { id } = await drawnSeason();
    const kid = children(id)[0].id;
    const before = await stateOf(id);
    const feed: LiveUpdate = {
      live: { state: "in", period: 2, clock: "15:00", detail: "Q2 15:00", scoreX: 7, scoreY: 3, updatedAt: 1 },
      linescoresX: [7, 0],
      linescoresY: [3, 0],
      completedPeriods: 1,
      isFinal: false,
    };
    vi.mocked(notify).mockClear();
    roomCalls = [];
    await applyLiveUpdate(env, kid, feed, async () => {});
    const game = await stateOf(kid);
    const cell = winningCell({ scoreX: 7, scoreY: 3 }, drawFor(game.game, "q1")!)!;
    const owner = game.squares.find((s) => s.row === cell.row && s.col === cell.col)!.playerId;
    expect(vi.mocked(notify)).toHaveBeenCalledWith(env, kid, { kind: "winner", periodKey: "q1", label: "Q1", playerIds: [owner] });
    // The season board moved (its standings), and its open boards got it; never a push of its own.
    const after = await stateOf(id);
    expect(after.version).toBeGreaterThan(before.version);
    expect(roomCalls.some((r) => r.game === id && r.url.endsWith("/broadcast"))).toBe(true);
    expect(vi.mocked(notify).mock.calls.every(([, gameId]) => gameId === kid)).toBe(true);
    expect(after.season?.games[0]).toMatchObject({ id: kid, live: "in", score: { scoreX: 7, scoreY: 3 }, winners: [{ periodKey: "q1", label: "Q1", playerIds: [owner] }] });
    expect(after.season?.standings[0]).toMatchObject({ playerId: owner, wins: 1, games: 1, rank: 1, amount: null });
  });

  it("are run by the season board's co-hosts", async () => {
    const made = await createSeason();
    const { id } = made.body.game;
    await fill(id, [HOST, ANA, BEN]);
    const invite = await call<{ url: string }>("POST", `/games/${id}/cohost-invites`, { admin: made.body.adminToken });
    const token = new URL(invite.body.url).searchParams.get("cohost");
    expect((await call("POST", `/games/${id}/cohosts/accept`, { client: ANA, body: { token } })).status).toBe(200);
    // A co-host draws the season too.
    expect((await call("POST", `/games/${id}/lock`, { client: ANA })).status).toBe(200);
    const kid = children(id)[0].id;
    expect((await stateOf(kid)).game.cohostIds).toEqual([pid(ANA)]);
    const fix = await call<{ state: GameState }>("POST", `/games/${kid}/scores`, { client: ANA, body: { periodKey: "q1", scoreX: 14, scoreY: 7 } });
    expect(fix.status).toBe(200);
    expect(fix.body.state.scores.map((s) => [s.periodKey, s.scoreX, s.scoreY])).toEqual([["q1", 14, 7]]);
    expect((await call("POST", `/games/${kid}/winners`, { client: ANA, body: { periodKey: "q1", row: 0, col: 0 } })).status).toBe(200);
    expect((await call("POST", `/games/${kid}/scores`, { client: BEN, body: { periodKey: "q2", scoreX: 1, scoreY: 1 } })).status).toBe(403);
    // The host's own token works on every game.
    expect((await call("DELETE", `/games/${kid}/winners/q1`, { admin: made.body.adminToken })).status).toBe(200);
  });

  it("take the season board's new rules and prizes until their first score, and its new name", async () => {
    const { id, admin } = await drawnSeason();
    const [first, second] = children(id).map((k) => k.id);
    expect((await call("POST", `/games/${first}/scores`, { admin, body: { periodKey: "q1", scoreX: 7, scoreY: 0 } })).status).toBe(200);
    const halves = { ...quarters, periods: "halves", squarePrice: 2 };
    const res = await call<{ state: GameState }>("PATCH", `/games/${id}`, { admin, body: { format: halves, name: "Work Season" } });
    expect(res.status).toBe(200);
    await settle();
    const scored = await stateOf(first);
    const fresh = await stateOf(second);
    expect(scored.game.periods.map((p) => p.key)).toEqual(["q1", "q2", "q3", "final"]);
    expect(fresh.game.periods.map((p) => p.key)).toEqual(["q2", "final"]);
    expect(fresh.game.format.squarePrice).toBe(2);
    expect(scored.game.name).toBe("Work Season · HOU @ JAX");
    expect(fresh.game.name).toBe("Work Season · JAX @ TEN");
    // A season board's kickoff is its games'.
    expect((await call("PATCH", `/games/${id}`, { admin, body: { startsAt: Date.now() + DAY } })).status).toBe(400);
  });

  it("go when the season board is deleted", async () => {
    const { id, admin } = await drawnSeason();
    const kids = children(id).map((k) => k.id);
    expect((await call("DELETE", `/games/${id}`, { admin })).status).toBe(200);
    await settle();
    expect(t.query(`SELECT id FROM games`)).toEqual([]);
    expect(t.query(`SELECT * FROM squares`)).toEqual([]);
    expect(t.query(`SELECT * FROM players`)).toEqual([]);
    for (const kid of kids) expect(roomCalls.some((r) => r.game === kid && r.url.endsWith("/close"))).toBe(true);
  });
});

describe("the cron", () => {
  const tick = () => worker.scheduled({ scheduledTime: Date.now(), cron: "* * * * *", noRetry: () => {} } as ScheduledController, env);

  it("adds a playoff game once it's on the team's schedule, and leaves a fresh season alone", async () => {
    const { id } = await drawnSeason();
    expect(children(id)).toHaveLength(3);
    playoffs = [{ id: "401800901", date: NOW + 90 * DAY, home: NFL.jax, away: NFL.kc, seasonType: 3, week: { number: 1, text: "Wild Card" } }];
    // Read just now at the draw: not due yet.
    await tick();
    expect(children(id)).toHaveLength(3);
    // Half a day later it's due (and the half-hour-old schedule read has expired).
    t.query(`UPDATE games SET season_synced_at = ? WHERE id = ?`, Date.now() - 13 * 3_600_000, id);
    clearMemoryCache();
    vi.mocked(notify).mockClear();
    roomCalls = [];
    await tick();
    const kids = children(id);
    expect(kids.map((k) => k.season_event)).toEqual(["401800107", "401800108", "401800109", "401800901"]);
    const playoff = await stateOf(kids[3].id);
    expect(playoff.game).toMatchObject({ seasonId: id, status: "locked", paid: true, name: "Office Season · KC @ JAX" });
    expect(playoff.squares).toHaveLength(100);
    const season = await stateOf(id);
    expect(season.season?.games.at(-1)).toMatchObject({ id: kids[3].id, label: "Wild Card", playoff: true });
    // Its open boards heard; nobody was pushed.
    expect(roomCalls.some((r) => r.game === id && r.url.endsWith("/broadcast"))).toBe(true);
    expect(vi.mocked(notify)).not.toHaveBeenCalled();
    // Again right away: nothing new.
    t.query(`UPDATE games SET season_synced_at = ? WHERE id = ?`, Date.now() - 13 * 3_600_000, id);
    await tick();
    expect(children(id)).toHaveLength(4);
  });

  it("follows a flexed kickoff, and tries again within the hour when ESPN is down", async () => {
    const { id } = await drawnSeason();
    regular[2].date += 7 * 3_600_000;
    try {
      t.query(`UPDATE games SET season_synced_at = ? WHERE id = ?`, Date.now() - 13 * 3_600_000, id);
      clearMemoryCache();
      await tick();
      const moved = await stateOf(children(id)[1].id);
      expect(moved.game.startsAt).toBe(regular[2].date);
      expect(moved.game.linkedEvent?.startsAt).toBe(regular[2].date);
    } finally {
      regular[2].date -= 7 * 3_600_000;
    }
    espnDown = true;
    clearMemoryCache();
    t.query(`UPDATE games SET season_synced_at = ? WHERE id = ?`, Date.now() - 13 * 3_600_000, id);
    await tick();
    const synced = t.query<{ season_synced_at: number }>(`SELECT season_synced_at FROM games WHERE id = ?`, id)[0].season_synced_at;
    // Due again in about an hour, not half a day.
    expect(synced).toBeLessThan(Date.now() - 10 * 3_600_000);
  });
});

describe("privacy", () => {
  it("never puts a clientId in a season board's state, its games', Home or the invite page", async () => {
    const { id } = await drawnSeason();
    const kid = children(id)[0].id;
    const state = await stateOf(id);
    const preview = inviteMeta(state, "https://jaxsquares.test");
    const texts = [
      (await call("GET", `/games/${id}`, { client: null })).text,
      (await call("GET", `/games/${kid}`, { client: null })).text,
      (await call("GET", "/me/games", { client: ANA })).text,
      JSON.stringify(preview),
    ];
    for (const text of texts) for (const client of CLIENTS) expect(text).not.toContain(client);
    // The preview names the season, never an amount.
    expect(preview).toMatchObject({ title: "Join Office Season on JaxSquares", description: "Jaguars 2026 season · 3 games · Follow the season live" });
    expect(texts[3]).not.toMatch(/\$\d/);
  });
});
