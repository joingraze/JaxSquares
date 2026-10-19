import { describe, expect, it } from "vitest";
import { mentionsMoney, rulesForPreset, withRules } from "./formats";
import {
  MAX_SEASON_GAMES,
  currentSeasonGame,
  featuredSeasonGame,
  gameNumbers,
  gamesToAdd,
  isSeasonBoard,
  isSeasonGame,
  matchupOf,
  plannedGame,
  seasonAxes,
  seasonGameName,
  seasonGameOf,
  seasonGameTeams,
  seasonLabel,
  seasonNumbers,
  seasonOver,
  seasonPositionLine,
  seasonPositionOf,
  seasonReviewLine,
  seasonStandings,
  seasonStateOf,
  seasonSummaryOf,
  seasonYearLabel,
  sharedSeasonNumbers,
  teamIsHome,
  upcomingSeasonEvents,
  type SeasonGameSource,
} from "./season";
import { resolveResults } from "./squares";
import type { Game, GameFormat, NumberDraw, Score, SeasonEvent, SeasonGame, SeasonSpec, SeasonTeam, Square } from "./types";

const NOW = Date.UTC(2026, 9, 19, 12);
const DAY = 86_400_000;

const JAX: SeasonTeam = { id: "30", name: "Jacksonville Jaguars", shortName: "Jaguars", abbr: "JAX", color: "#007487" };
const team = (name: string, abbr: string): { name: string; abbr: string } => ({ name, abbr });

const ev = (eventId: string, days: number, over: Partial<SeasonEvent> = {}): SeasonEvent => ({
  eventId,
  startsAt: NOW + days * DAY,
  home: team("Miami Dolphins", "MIA"),
  away: team("Jacksonville Jaguars", "JAX"),
  homeId: "15",
  awayId: "30",
  ...over,
});

const teamSpec: SeasonSpec = { scope: "team", numbers: "same", league: "nfl", team: JAX, year: 2026, label: "Jaguars 2026 season" };
const gamesSpec: SeasonSpec = { scope: "games", numbers: "fresh", league: "nfl", team: null, year: null, label: "3 NFL games" };

const IDENTITY: NumberDraw = { x: [[0], [1], [2], [3], [4], [5], [6], [7], [8], [9]], y: [[0], [1], [2], [3], [4], [5], [6], [7], [8], [9]] };
const quarters: GameFormat = withRules({ periods: "quarters", reverse: false, boardSize: 100, freshNumbers: false, rules: rulesForPreset("quarters", false) });

describe("what a board is", () => {
  it("tells a season board from one of its games and from any other board", () => {
    expect(isSeasonBoard({ kind: "season" })).toBe(true);
    expect(isSeasonBoard({ kind: "board" })).toBe(false);
    expect(isSeasonBoard({})).toBe(false);
    expect(isSeasonGame({ seasonId: "abc123" })).toBe(true);
    expect(isSeasonGame({ seasonId: null })).toBe(false);
    expect(isSeasonGame({})).toBe(false);
  });
});

describe("names", () => {
  it("names a team's season by its year, two years for a season that spans them", () => {
    expect(seasonYearLabel("nfl", 2026)).toBe("2026");
    expect(seasonYearLabel("wnba", 2026)).toBe("2026");
    expect(seasonYearLabel("nba", 2027)).toBe("2026-27");
    expect(seasonYearLabel("ncaab", 2030)).toBe("2029-30");
    expect(seasonLabel(teamSpec, 17)).toBe("Jaguars 2026 season");
    expect(seasonLabel({ ...teamSpec, league: "nba", team: { id: "13", name: "Los Angeles Lakers", shortName: "Lakers" }, year: 2027 }, 82)).toBe(
      "Lakers 2026-27 season",
    );
    expect(seasonLabel({ ...teamSpec, year: null }, 3)).toBe("Jaguars season");
  });

  it("names picked games by how many and the league", () => {
    expect(seasonLabel(gamesSpec, 6)).toBe("6 NFL games");
    expect(seasonLabel({ ...gamesSpec, league: "ncaab" }, 1)).toBe("1 men's college basketball game");
  });

  it("says how many games so far on Review", () => {
    expect(seasonReviewLine(teamSpec, 17)).toBe("Jaguars 2026 season · 17 games so far");
    expect(seasonReviewLine(gamesSpec, 6)).toBe("6 NFL games");
  });

  it("names a game's board after the season board and the matchup, within 60 characters and never about money", () => {
    const name = seasonGameName("Office Season", { name: "Jacksonville Jaguars", abbr: "JAX" }, { name: "Miami Dolphins", abbr: "MIA" }, false);
    expect(name).toBe("Office Season · JAX @ MIA");
    expect(seasonGameName("Office Season", { name: "Jacksonville Jaguars", abbr: "JAX" }, { name: "Houston Texans", abbr: "HOU" }, true)).toBe(
      "Office Season · HOU @ JAX",
    );
    const long = seasonGameName("A".repeat(70), { name: "X", abbr: "JAX" }, { name: "Y", abbr: "MIA" }, false);
    expect(long.length).toBeLessThanOrEqual(60);
    expect(long.endsWith(" · JAX @ MIA")).toBe(true);
    expect(mentionsMoney(name)).toBe(false);
    expect(matchupOf({ name: "Away team" }, { name: "Home team" }, false)).toBe("Away team @ Home team");
  });

  it("puts the team across the top and the opponent down the side, or away and home for picked games", () => {
    expect(seasonAxes("team", JAX)).toEqual({ teamX: { name: "Jacksonville Jaguars", abbr: "JAX", color: "#007487" }, teamY: { name: "Opponent", abbr: "OPP" } });
    expect(seasonAxes("games", null)).toEqual({ teamX: { name: "Away", abbr: "AWAY" }, teamY: { name: "Home", abbr: "HOME" } });
    expect(seasonPositionLine({ index: 3, count: 17 })).toBe("Game 3 of 17");
  });
});

describe("a game's board (child creation rules)", () => {
  it("keeps the season's team across the top, home or away", () => {
    const away = seasonGameTeams(teamSpec, ev("e1", 1));
    expect(away.teamX.abbr).toBe("JAX");
    expect(away.teamY.abbr).toBe("MIA");
    expect(away.linkedEvent).toEqual({ provider: "espn", league: "nfl", eventId: "e1", startsAt: NOW + DAY, xIsHome: false });

    const home = seasonGameTeams(teamSpec, ev("e2", 8, { home: team("Jacksonville Jaguars", "JAX"), away: team("Houston Texans", "HOU"), homeId: "30", awayId: "34" }));
    expect([home.teamX.abbr, home.teamY.abbr, home.linkedEvent.xIsHome]).toEqual(["JAX", "HOU", true]);
  });

  it("finds the team's side by id, else by abbreviation or name", () => {
    const noIds = { home: team("Jacksonville Jaguars", "JAX"), away: team("Tennessee Titans", "TEN") };
    expect(teamIsHome(JAX, noIds)).toBe(true);
    expect(teamIsHome(JAX, { home: team("Tennessee Titans", "TEN"), away: team("Jacksonville Jaguars", "JAX") })).toBe(false);
    // The id wins over a misleading name.
    expect(teamIsHome(JAX, { ...noIds, homeId: "10", awayId: "30" })).toBe(false);
  });

  it("puts picked games away across the top, home down the side", () => {
    const g = seasonGameTeams(gamesSpec, ev("e1", 1));
    expect([g.teamX.abbr, g.teamY.abbr, g.linkedEvent.xIsHome]).toEqual(["JAX", "MIA", false]);
  });

  it("gives a board to every game still to come, once, soonest first, up to the cap", () => {
    const events = [ev("late", 9), ev("past", -1), ev("soon", 2), ev("soon", 2), ev("kicking-off", 0), ev("have", 3)];
    expect(gamesToAdd(events, new Set(["have"]), 1, NOW).map((e) => e.eventId)).toEqual(["soon", "late"]);
    expect(upcomingSeasonEvents(events, NOW).map((e) => e.eventId)).toEqual(["soon", "have", "late"]);
    // The cap counts the boards already made.
    const many = Array.from({ length: MAX_SEASON_GAMES + 5 }, (_, i) => ev(`g${i}`, i + 1));
    expect(gamesToAdd(many, new Set(), 0, NOW)).toHaveLength(MAX_SEASON_GAMES);
    expect(gamesToAdd(many, new Set(), MAX_SEASON_GAMES - 2, NOW)).toHaveLength(2);
    expect(gamesToAdd(many, new Set(), MAX_SEASON_GAMES, NOW)).toEqual([]);
  });

  it("lists a planned game before the draw, oriented like its board will be", () => {
    const g = plannedGame(teamSpec, ev("e1", 1, { label: "Week 8" }), 1);
    expect(g).toMatchObject({ id: null, eventId: "e1", index: 1, status: "planned", label: "Week 8", winners: [], score: null });
    expect(g.teamX.abbr).toBe("JAX");
    expect(plannedGame(teamSpec, ev("p", 90, { playoff: true }), 18).playoff).toBe(true);
  });
});

describe("numbers: the same all season, or fresh for each game", () => {
  let i = 0;
  const rng = () => ((i = (i * 7 + 3) % 97), i / 97);

  it("draws once for the season with the same numbers, and copies that draw to every game", () => {
    const season = seasonNumbers(quarters, "same", rng);
    expect(Object.keys(season)).toEqual(["*"]);
    const a = gameNumbers(season, quarters, "same", rng);
    const b = gameNumbers(season, quarters, "same", rng);
    expect(a).toEqual(season);
    expect(b).toEqual(season);
    // A copy, not the same object.
    expect(a).not.toBe(season);
  });

  it("draws nothing for the season with fresh numbers, and a new draw for each game", () => {
    const season = seasonNumbers(quarters, "fresh", rng);
    expect(season).toEqual({});
    const a = gameNumbers(season, quarters, "fresh", rng);
    const b = gameNumbers(season, quarters, "fresh", rng);
    expect(Object.keys(a)).toEqual(["*"]);
    expect(a).not.toEqual(b);
    for (const draw of [a["*"], b["*"]]) {
      expect(draw.x.flat().sort()).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
      expect(draw.y.flat().sort()).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
    }
  });

  it("keeps a draw per quarter when the rules draw new numbers each quarter", () => {
    const fresh = withRules({ ...quarters, freshNumbers: true });
    const season = seasonNumbers(fresh, "same", rng);
    expect(Object.keys(season).sort()).toEqual(["final", "q1", "q2", "q3"]);
    expect(gameNumbers(season, fresh, "same", rng)).toEqual(season);
    expect(Object.keys(gameNumbers({}, fresh, "fresh", rng)).sort()).toEqual(["final", "q1", "q2", "q3"]);
  });

  it("falls back to a draw of its own when the season has none to copy", () => {
    expect(Object.keys(gameNumbers(null, quarters, "same", rng))).toEqual(["*"]);
    expect(Object.keys(gameNumbers({}, quarters, "same", rng))).toEqual(["*"]);
  });

  it("shows the season's numbers on its page only when every game uses them", () => {
    const state = { game: { numbers: { "*": IDENTITY } }, season: { numbers: "same" } } as unknown as Parameters<typeof sharedSeasonNumbers>[0];
    expect(sharedSeasonNumbers(state)).toEqual({ "*": IDENTITY });
    expect(sharedSeasonNumbers({ ...state, season: { ...state.season!, numbers: "fresh" } })).toBeNull();
    expect(sharedSeasonNumbers({ ...state, game: { ...state.game, numbers: {} } })).toBeNull();
  });
});

// ---- Standings ----

const sq = (row: number, col: number, playerId: string): Square => ({ row, col, playerId, claimedAt: 0 });
const score = (periodKey: string, scoreX: number, scoreY: number): Score => ({ periodKey, scoreX, scoreY, source: "live", updatedAt: 0 });

function childGame(id: string, over: Partial<Game> = {}): Game {
  return {
    id,
    name: `Office Season · ${id}`,
    maxPerPlayer: 0,
    hostPlayerId: "host",
    createdAt: 0,
    lockedAt: 0,
    status: "locked",
    teamX: { name: "Jacksonville Jaguars", abbr: "JAX" },
    teamY: { name: "Miami Dolphins", abbr: "MIA" },
    numbers: { "*": IDENTITY },
    format: { ...quarters, unit: "$", squarePrice: 1 },
    periods: [
      { key: "q1", label: "Q1" },
      { key: "q2", label: "Half" },
      { key: "q3", label: "Q3" },
      { key: "final", label: "Final" },
    ],
    prizes: {},
    sport: "football",
    league: "nfl",
    linkedEvent: { provider: "espn", league: "nfl", eventId: `ev-${id}`, startsAt: NOW, xIsHome: false },
    startsAt: NOW,
    ...over,
  };
}

const src = (id: string, scores: Score[], over: Partial<SeasonGameSource> = {}): SeasonGameSource => ({
  game: childGame(id),
  eventId: `ev-${id}`,
  scores,
  manualWinners: [],
  live: null,
  ...over,
});

// Row = the home team's last digit, col = the team's last digit (identity draw).
const squares = [sq(0, 7, "ana"), sq(3, 7, "ben"), sq(0, 0, "cal"), sq(7, 3, "ana"), sq(4, 4, "dee")];

describe("standings", () => {
  it("counts every winning square across the season, with games won and the prize total", () => {
    const g1 = resolveResults({ ...src("g1", [score("q1", 7, 0), score("q2", 7, 3), score("q3", 0, 0), score("final", 17, 3)]), squares });
    const g2 = resolveResults({ ...src("g2", [score("q1", 3, 7), score("q2", 10, 10)]), squares });
    const table = seasonStandings([g1, g2], ["ana", "ben", "cal", "dee", "eve"]);
    // Level on wins: more games won lists first, and they share the rank.
    expect(table.map((r) => [r.playerId, r.wins, r.games, r.rank])).toEqual([
      ["ana", 2, 2, 1],
      ["cal", 2, 2, 1],
      ["ben", 2, 1, 1],
      ["dee", 0, 0, 4],
      ["eve", 0, 0, 4],
    ]);
  });

  it("breaks ties on wins by the prize total, and leaves amounts null without any", () => {
    const priced = { ...quarters, unit: "$" as const, squarePrice: 1, rules: quarters.rules!.map((r) => ({ ...r, square: { amount: r.moment === "final" ? 40 : 20, note: "" } })) };
    const g1 = resolveResults({ game: childGame("g1", { format: priced }), squares, scores: [score("q1", 7, 0), score("final", 0, 0)], manualWinners: [] });
    const table = seasonStandings([g1], ["ana", "cal"]);
    expect(table.map((r) => [r.playerId, r.wins, r.amount, r.rank])).toEqual([
      ["cal", 1, 40, 1],
      ["ana", 1, 20, 2],
    ]);
    const plain = resolveResults({ game: childGame("g1", { format: quarters }), squares, scores: [score("q1", 7, 0)], manualWinners: [] });
    expect(seasonStandings([plain], ["ana"])[0]).toMatchObject({ playerId: "ana", wins: 1, amount: null });
    // A reverse square counts as a win of its own.
    const reverse = withRules({ ...quarters, rules: rulesForPreset("quarters", true) });
    const both = resolveResults({ game: childGame("g1", { format: reverse }), squares, scores: [score("q1", 7, 3)], manualWinners: [] });
    expect(seasonStandings([both], []).map((r) => [r.playerId, r.wins])).toEqual([
      ["ben", 1],
      ["ana", 1],
    ]);
  });

  it("lists a winner who isn't a holder any more after the holders, and an empty season ranks everyone first", () => {
    expect(seasonStandings([], ["ana", "ben"]).map((r) => [r.playerId, r.rank])).toEqual([
      ["ana", 1],
      ["ben", 1],
    ]);
  });
});

describe("the season board's state", () => {
  it("lists planned games before the draw, by kickoff", () => {
    const s = seasonStateOf(teamSpec, { planned: [ev("b", 8), ev("a", 1)], games: [], squares });
    expect(s.games.map((g) => [g.eventId, g.index, g.status, g.id])).toEqual([
      ["a", 1, "planned", null],
      ["b", 2, "planned", null],
    ]);
    expect(s.standings.every((r) => r.wins === 0 && r.rank === 1)).toBe(true);
    expect(s).toMatchObject({ scope: "team", numbers: "same", label: "Jaguars 2026 season" });
  });

  it("lists each game's board with its winners and score after the draw, and adds them up", () => {
    const later = src("g2", [], {
      game: childGame("g2", { linkedEvent: { provider: "espn", league: "nfl", eventId: "ev-g2", startsAt: NOW + 7 * DAY, xIsHome: true }, startsAt: NOW + 7 * DAY }),
      label: "Week 9",
    });
    const done = src("g1", [score("q1", 7, 0), score("q2", 7, 3), score("q3", 7, 3), score("final", 17, 13)], {
      game: childGame("g1", { status: "final" }),
      live: { state: "post", period: 4, clock: "0:00", detail: "Final", scoreX: 17, scoreY: 13, updatedAt: 0 },
    });
    const s = seasonStateOf(teamSpec, { planned: [], games: [later, done], squares });
    expect(s.games.map((g) => [g.id, g.index, g.status])).toEqual([
      ["g1", 1, "final"],
      ["g2", 2, "locked"],
    ]);
    expect(s.games[0].score).toEqual({ scoreX: 17, scoreY: 13, label: "Final" });
    expect(s.games[0].winners.map((w) => [w.label, w.playerIds])).toEqual([
      ["Q1", ["ana"]],
      ["Half", ["ben"]],
      ["Q3", ["ben"]],
      ["Final", ["ben"]],
    ]);
    expect(s.games[1]).toMatchObject({ label: "Week 9", winners: [], score: null });
    expect(s.standings[0]).toMatchObject({ playerId: "ben", wins: 3, games: 1, rank: 1 });
    // Public ids only: nothing that looks like a clientId or a token.
    expect(JSON.stringify(s)).not.toMatch(/client|admin/i);
  });

  it("reads a host's pick on a game's board", () => {
    const picked = seasonGameOf(src("g1", [score("q1", 7, 0)], { manualWinners: [{ periodKey: "q1", row: 4, col: 4, updatedAt: 0 }] }), squares, 1);
    expect(picked.game.winners).toEqual([{ periodKey: "q1", label: "Q1", playerIds: ["dee"] }]);
  });
});

describe("now and next", () => {
  const g = (over: Partial<SeasonGame>): SeasonGame => ({
    id: "x",
    eventId: "e",
    index: 1,
    startsAt: NOW,
    teamX: { name: "A" },
    teamY: { name: "B" },
    status: "locked",
    live: null,
    score: null,
    winners: [],
    ...over,
  });

  it("features the game on now, else the next one, else the last", () => {
    const done = g({ id: "a", status: "final", live: "post", startsAt: NOW - 7 * DAY });
    const next = g({ id: "b", startsAt: NOW + DAY });
    const after = g({ id: "c", startsAt: NOW + 8 * DAY });
    expect(currentSeasonGame([done, next, after], NOW)?.id).toBe("b");
    const on = g({ id: "c", live: "in", startsAt: NOW - 3_600_000 });
    expect(currentSeasonGame([done, next, on], NOW)?.id).toBe("c");
    expect(currentSeasonGame([done], NOW)).toBeNull();
    expect(featuredSeasonGame([done], NOW)?.id).toBe("a");
    // A game long past that the feed never ended isn't "next".
    expect(currentSeasonGame([g({ id: "stale", startsAt: NOW - DAY })], NOW)).toBeNull();
  });

  it("sums a season up for Home", () => {
    const games = [g({ id: "a", status: "final" }), g({ id: "b", startsAt: NOW + DAY }), g({ id: "c", startsAt: NOW + 2 * DAY })];
    expect(seasonSummaryOf({ label: "Jaguars 2026 season", games }, NOW)).toMatchObject({ label: "Jaguars 2026 season", games: 3, played: 1, current: { id: "b" } });
  });

  it("is over once every game is final and nothing's left to schedule", () => {
    expect(seasonOver([{ status: "final" }, { status: "final" }], 0)).toBe(true);
    expect(seasonOver([{ status: "final" }, { status: "locked" }], 0)).toBe(false);
    expect(seasonOver([{ status: "final" }], 1)).toBe(false);
    expect(seasonOver([], 0)).toBe(false);
  });

  it("places a game in its season with its neighbors", () => {
    expect(seasonPositionOf({ id: "s", name: "Office" }, ["a", "b", "c"], "b")).toEqual({ id: "s", name: "Office", index: 2, count: 3, prevId: "a", nextId: "c" });
    expect(seasonPositionOf({ id: "s", name: "Office" }, ["a"], "a")).toMatchObject({ index: 1, count: 1, prevId: null, nextId: null });
    expect(seasonPositionOf({ id: "s", name: "Office" }, ["a"], "z")).toBeNull();
  });
});
