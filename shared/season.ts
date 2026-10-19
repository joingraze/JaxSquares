// Season boards: one squares board for a whole season (docs/ARCHITECTURE.md
// "Season boards"). Pure and framework-free, shared by the Worker and the app,
// unit-tested in season.test.ts.
//
// The season board holds the players, the squares, the rules and prizes and
// the one host fee. At its draw every game of the season still to come gets a
// board of its own (a "game board": a normal board with `seasonId` pointing
// back), with the season's players and squares, its rules, and the season's
// numbers or a fresh draw of its own. Each game's board is linked to its game's
// live feed, so winners, pushes and the rest work exactly as on any board; the
// season board adds them up (standings) and lists them (schedule).

import { LEAGUE_INFO, type LinkedLeague } from "./sports";
import { boardPeriods, drawNumbers, liveLabel, prizeTotals, resolveResults, winCounts, winnersOf, type PeriodResult } from "./squares";
import type {
  Game,
  GameFormat,
  GameState,
  LinkedEvent,
  LiveStatus,
  ManualWinner,
  NumberDraw,
  Score,
  SeasonEvent,
  SeasonGame,
  SeasonNumbers,
  SeasonPosition,
  SeasonScope,
  SeasonSpec,
  SeasonStanding,
  SeasonState,
  SeasonSummary,
  SeasonTeam,
  Square,
  Team,
} from "./types";

/** Most games one season board covers (an NBA team's 82 plus every playoff round fits). */
export const MAX_SEASON_GAMES = 120;

/** `games.payment_provider` of a season's game board: paid through its season board (reference = the season board's id, amount 0). */
export const SEASON_PROVIDER = "season";

/** How often the cron reads a team's schedule again for new games (playoffs). */
export const SEASON_SYNC_MS = 12 * 60 * 60_000;
/** After a read that failed (the provider down), try again this soon. */
export const SEASON_RETRY_MS = 60 * 60_000;

/** Why a season board can't be made or changed this way (the API answers 400 or 409 with these). */
export const SEASON_ERRORS = {
  scope: "Pick a team's season or the games to play.",
  numbers: "Pick the same numbers all season or new numbers every game.",
  league: "A season board follows a league with live scores. Pick NFL, college or a basketball league.",
  team: "Pick the team whose season this board follows.",
  events: "Pick at least one game that hasn't started yet.",
  tooMany: `A season board covers up to ${MAX_SEASON_GAMES} games.`,
  noGames: "This season has no games left to play. Pick another team, or pick the games yourself.",
  childEdit: "This game follows its season board. Make changes on the season board.",
  childClaim: "Squares for this game come from the season board. Pick them there.",
  childJoin: "This game is part of a season board. Join the season board to play.",
  childDelete: "This game is part of a season board. Delete the season board instead.",
  childCohost: "Invite co-hosts from the season board. They run every game of the season.",
  sibling: "A season board covers its own games. Start a new board for another one.",
  seasonScores: "Scores go on each game's board. Open the game from the schedule.",
} as const;

// ---- What a board is ----

/** A season board (it has games of its own, never a feed). */
export function isSeasonBoard(game: Pick<Game, "kind"> | null | undefined): boolean {
  return game?.kind === "season";
}

/** One game of a season board. */
export function isSeasonGame(game: Pick<Game, "seasonId"> | null | undefined): boolean {
  return !!game?.seasonId;
}

export function isSeasonScope(v: unknown): v is SeasonScope {
  return v === "team" || v === "games";
}

export function isSeasonNumbers(v: unknown): v is SeasonNumbers {
  return v === "same" || v === "fresh";
}

// ---- Names ----

/** A season spanning two calendar years (NBA, college basketball): ESPN names it for the year it ends. */
function spansTwoYears(league: LinkedLeague): boolean {
  return league === "nba" || league === "ncaab" || league === "ncaaw";
}

/** "2026", or "2026-27" for a season that spans two years (ESPN's year 2027). */
export function seasonYearLabel(league: LinkedLeague, year: number): string {
  if (!spansTwoYears(league)) return String(year);
  return `${year - 1}-${String(year % 100).padStart(2, "0")}`;
}

/** The team's short name: "Jaguars", "Alabama", "Lakers". */
export function teamShortName(team: Pick<SeasonTeam, "shortName" | "name" | "abbr">): string {
  return team.shortName?.trim() || team.name.trim() || team.abbr?.trim() || "Team";
}

/** "Jaguars 2026 season", "Lakers 2026-27 season", "6 NFL games". */
export function seasonLabel(s: Pick<SeasonSpec, "scope" | "league" | "team" | "year">, games: number): string {
  if (s.scope === "team" && s.team) {
    const name = teamShortName(s.team);
    return s.year ? `${name} ${seasonYearLabel(s.league, s.year)} season` : `${name} season`;
  }
  const n = Math.max(0, Math.trunc(games));
  return `${n} ${LEAGUE_INFO[s.league].name} ${n === 1 ? "game" : "games"}`;
}

/** Review's line: "Jaguars 2026 season · 17 games so far" (a team's season grows with its playoffs), or "6 NFL games". */
export function seasonReviewLine(s: Pick<SeasonSpec, "scope" | "league" | "team" | "year">, games: number): string {
  const label = seasonLabel(s, games);
  if (s.scope !== "team") return label;
  return `${label} · ${games} ${games === 1 ? "game" : "games"} so far`;
}

/** "Same numbers all season" / "New numbers every game". */
export const SEASON_NUMBERS_INFO: Record<SeasonNumbers, { label: string; description: string }> = {
  same: { label: "Same numbers all season", description: "Drawn once at the draw. Your squares keep their numbers every game." },
  fresh: { label: "New numbers every game", description: "Each game draws its own numbers when its board is set up." },
};

/** A season board's axes: the team across the top and "Opponent" down the side, or away and home for picked games. */
export function seasonAxes(scope: SeasonScope, team: SeasonTeam | null): { teamX: Team; teamY: Team } {
  if (scope === "team" && team) {
    const teamX: Team = { name: team.name };
    if (team.abbr) teamX.abbr = team.abbr;
    if (team.color) teamX.color = team.color;
    return { teamX, teamY: { name: "Opponent", abbr: "OPP" } };
  }
  return { teamX: { name: "Away", abbr: "AWAY" }, teamY: { name: "Home", abbr: "HOME" } };
}

// ---- A game's board ----

const sameTeam = (a: Pick<Team, "name" | "abbr">, b: Pick<Team, "name" | "abbr">) =>
  (!!a.abbr && !!b.abbr && a.abbr.toUpperCase() === b.abbr.toUpperCase()) || a.name.trim().toLowerCase() === b.name.trim().toLowerCase();

/** Whether the season's team is the home side of this game (by the provider's ids, else by abbreviation or name). */
export function teamIsHome(team: Pick<SeasonTeam, "id" | "name" | "abbr">, event: Pick<SeasonEvent, "home" | "away" | "homeId" | "awayId">): boolean {
  if (event.homeId && event.homeId === team.id) return true;
  if (event.awayId && event.awayId === team.id) return false;
  return sameTeam(event.home, team) && !sameTeam(event.away, team);
}

/**
 * How a game's board puts its teams: on a team's season the team always goes
 * across the top (so "the same numbers all season" are always that team's
 * digits) and the opponent down the side; picked games put the away team
 * across the top and the home team down the side, like any linked board.
 */
export function seasonGameTeams(
  spec: Pick<SeasonSpec, "scope" | "team" | "league">,
  event: SeasonEvent,
): { teamX: Team; teamY: Team; linkedEvent: LinkedEvent } {
  const home = spec.scope === "team" && spec.team ? teamIsHome(spec.team, event) : false;
  return {
    teamX: { ...(home ? event.home : event.away) },
    teamY: { ...(home ? event.away : event.home) },
    linkedEvent: { provider: "espn", league: spec.league, eventId: event.eventId, startsAt: event.startsAt, xIsHome: home },
  };
}

/** The board name's limit (worker create handler). */
const NAME_MAX = 60;

const shortSide = (t: Team) => t.abbr?.trim() || t.name.trim();

/** "JAX @ MIA" (away @ home), for a game's board as its teams sit. */
export function matchupOf(teamX: Team, teamY: Team, xIsHome: boolean): string {
  return xIsHome ? `${shortSide(teamY)} @ ${shortSide(teamX)}` : `${shortSide(teamX)} @ ${shortSide(teamY)}`;
}

/**
 * A game's board name: "Office Season · JAX @ MIA" (the season board's name is
 * cut first when it doesn't fit). It's every push's title for that game.
 */
export function seasonGameName(seasonName: string, teamX: Team, teamY: Team, xIsHome: boolean): string {
  const suffix = ` · ${matchupOf(teamX, teamY, xIsHome)}`;
  const room = Math.max(1, NAME_MAX - suffix.length);
  const base = Array.from(seasonName.trim() || "Season").slice(0, room).join("").trim();
  return `${base}${suffix}`.slice(0, NAME_MAX);
}

// ---- Numbers ----

/** The season board's own numbers at its draw: the one draw every game uses, or none ({}) when each game draws its own. */
export function seasonNumbers(format: GameFormat, mode: SeasonNumbers, rng?: () => number): Record<string, NumberDraw> {
  return mode === "same" ? drawNumbers(format, rng) : {};
}

/**
 * A game board's numbers when it's set up: the season's (copied), or a fresh
 * draw of its own. Squares are locked by then, so a fresh draw is as fair as
 * the first one.
 */
export function gameNumbers(
  season: Record<string, NumberDraw> | null,
  format: GameFormat,
  mode: SeasonNumbers,
  rng?: () => number,
): Record<string, NumberDraw> {
  if (mode === "same" && season && Object.keys(season).length > 0) return JSON.parse(JSON.stringify(season)) as Record<string, NumberDraw>;
  return drawNumbers(format, rng);
}

// ---- Which games get a board ----

/**
 * The games that need a board now: on the schedule, not started, not given a
 * board yet (`have`: event ids), each once, soonest first, up to
 * MAX_SEASON_GAMES in all (`haveCount` boards so far).
 */
export function gamesToAdd(events: readonly SeasonEvent[], have: ReadonlySet<string>, haveCount: number, now: number): SeasonEvent[] {
  const seen = new Set<string>();
  const out: SeasonEvent[] = [];
  for (const e of [...events].sort((a, b) => a.startsAt - b.startsAt || a.eventId.localeCompare(b.eventId))) {
    if (!e.eventId || seen.has(e.eventId) || have.has(e.eventId) || !(e.startsAt > now)) continue;
    seen.add(e.eventId);
    out.push(e);
  }
  return out.slice(0, Math.max(0, MAX_SEASON_GAMES - haveCount));
}

/** Upcoming games among these (not started), deduplicated, soonest first. */
export function upcomingSeasonEvents(events: readonly SeasonEvent[], now: number): SeasonEvent[] {
  return gamesToAdd(events, new Set(), 0, now);
}

// ---- A game, as the season lists it ----

/** What the season needs from one game's board (read with the season board). */
export interface SeasonGameSource {
  game: Game;
  eventId: string;
  label?: string;
  playoff?: boolean;
  scores: Score[];
  manualWinners: ManualWinner[];
  live: LiveStatus | null;
}

/** The game's latest score: the feed's while it's on (or over), else the latest recorded moment's. */
function latestScore(src: SeasonGameSource): SeasonGame["score"] {
  const { live, game, scores } = src;
  if (live && live.state !== "pre") return { scoreX: live.scoreX, scoreY: live.scoreY, label: liveLabel(live, game.status, game) };
  const byKey = new Map(scores.map((s) => [s.periodKey, s]));
  const last = boardPeriods(game, scores)
    .filter((p) => byKey.has(p.key))
    .at(-1);
  const score = last ? byKey.get(last.key) : undefined;
  return last && score ? { scoreX: score.scoreX, scoreY: score.scoreY, label: last.label } : null;
}

/**
 * One game of the season with its results: who won each moment (decided by
 * that game's own board, so a host's fix there shows here) and the latest
 * score. `squares` are the season's (every game board holds the same ones).
 */
export function seasonGameOf(src: SeasonGameSource, squares: Square[], index: number): { game: SeasonGame; results: PeriodResult[] } {
  const results = resolveResults({ game: src.game, squares, scores: src.scores, manualWinners: src.manualWinners });
  const game: SeasonGame = {
    id: src.game.id,
    eventId: src.eventId,
    index,
    startsAt: src.game.linkedEvent?.startsAt ?? src.game.startsAt ?? 0,
    teamX: src.game.teamX,
    teamY: src.game.teamY,
    status: src.game.status,
    live: src.live?.state ?? null,
    score: latestScore(src),
    winners: results.map((r) => ({ periodKey: r.periodKey, label: r.label, playerIds: winnersOf(r) })),
  };
  if (src.label) game.label = src.label;
  if (src.playoff) game.playoff = true;
  return { game, results };
}

/** A game on the schedule before the draw: planned, no board yet. */
export function plannedGame(spec: Pick<SeasonSpec, "scope" | "team" | "league">, event: SeasonEvent, index: number): SeasonGame {
  const { teamX, teamY } = seasonGameTeams(spec, event);
  const game: SeasonGame = {
    id: null,
    eventId: event.eventId,
    index,
    startsAt: event.startsAt,
    teamX,
    teamY,
    status: "planned",
    live: null,
    score: null,
    winners: [],
  };
  if (event.label) game.label = event.label;
  if (event.playoff) game.playoff = true;
  return game;
}

// ---- Standings ----

/**
 * The season's leaderboard from every game's results: winning squares per
 * player (a square and its reverse count apart, like winCounts), how many
 * games they won something in, and their display-only prize total (in-app
 * only). Every square holder is listed, winless ones too. Most wins first,
 * then the larger total, then more games; players level on wins and total
 * share a rank (1, 2, 2, 4).
 */
export function seasonStandings(games: readonly (readonly PeriodResult[])[], holders: readonly string[]): SeasonStanding[] {
  const wins = new Map<string, number>();
  const gamesWon = new Map<string, number>();
  const amounts = new Map<string, number>();
  let anyAmount = false;
  for (const results of games) {
    for (const [id, n] of Object.entries(winCounts([...results]))) wins.set(id, (wins.get(id) ?? 0) + n);
    for (const id of new Set(results.flatMap((r) => winnersOf(r)))) gamesWon.set(id, (gamesWon.get(id) ?? 0) + 1);
    for (const [id, amount] of Object.entries(prizeTotals([...results]))) {
      anyAmount = true;
      amounts.set(id, Math.round(((amounts.get(id) ?? 0) + amount) * 100) / 100);
    }
    if (results.some((r) => (r.awardsSquare && r.amount !== null) || (r.awardsReverse && r.reverseAmount !== null))) anyAmount = true;
  }
  const order = new Map<string, number>();
  for (const id of [...holders, ...wins.keys()]) if (!order.has(id)) order.set(id, order.size);
  const rows = [...order.keys()].map((playerId) => ({
    playerId,
    wins: wins.get(playerId) ?? 0,
    games: gamesWon.get(playerId) ?? 0,
    amount: anyAmount ? (amounts.get(playerId) ?? 0) : null,
  }));
  rows.sort((a, b) => b.wins - a.wins || (b.amount ?? 0) - (a.amount ?? 0) || b.games - a.games || order.get(a.playerId)! - order.get(b.playerId)!);
  const out: SeasonStanding[] = [];
  rows.forEach((r, i) => {
    const prev = out[i - 1];
    const level = prev && prev.wins === r.wins && (prev.amount ?? 0) === (r.amount ?? 0);
    out.push({ ...r, rank: level ? prev.rank : i + 1 });
  });
  return out;
}

/**
 * The season board's public season: what it covers, every game (planned ones
 * before the draw; each game's board after it, by kickoff) and the standings.
 * Public ids only.
 */
export function seasonStateOf(
  spec: SeasonSpec,
  input: { planned: readonly SeasonEvent[]; games: readonly SeasonGameSource[]; squares: Square[] },
): SeasonState {
  const holders = [...new Set(input.squares.map((s) => s.playerId))];
  if (input.games.length === 0) {
    const planned = [...input.planned].sort((a, b) => a.startsAt - b.startsAt).map((e, i) => plannedGame(spec, e, i + 1));
    return { ...spec, games: planned, standings: seasonStandings([], holders) };
  }
  const sorted = [...input.games].sort((a, b) => kickoffOf(a) - kickoffOf(b) || a.game.id.localeCompare(b.game.id));
  const built = sorted.map((g, i) => seasonGameOf(g, input.squares, i + 1));
  return { ...spec, games: built.map((b) => b.game), standings: seasonStandings(built.map((b) => b.results), holders) };
}

const kickoffOf = (g: SeasonGameSource) => g.game.linkedEvent?.startsAt ?? g.game.startsAt ?? 0;

// ---- Now and next ----

/** A game that started this long ago without the feed saying so is stale, not "next". */
const STALE_MS = 6 * 60 * 60_000;

/** The game on right now, else the next one still to play; null once the season's done. */
export function currentSeasonGame(games: readonly SeasonGame[], now: number): SeasonGame | null {
  const live = games.find((g) => g.live === "in" && g.status !== "final");
  if (live) return live;
  return (
    games
      .filter((g) => g.status !== "final" && g.live !== "post" && g.startsAt > now - STALE_MS)
      .sort((a, b) => a.startsAt - b.startsAt)[0] ?? null
  );
}

/** The game whose board a season's TV, Home card and "next game" show: the one on, else the next, else the last one. */
export function featuredSeasonGame(games: readonly SeasonGame[], now: number): SeasonGame | null {
  return currentSeasonGame(games, now) ?? games.filter((g) => g.id).at(-1) ?? null;
}

/** A season board on Home: its name, how many games, how many played, and the game on now or next. */
export function seasonSummaryOf(season: Pick<SeasonState, "label" | "games">, now: number): SeasonSummary {
  return {
    label: season.label,
    games: season.games.length,
    played: season.games.filter((g) => g.status === "final").length,
    current: currentSeasonGame(season.games, now),
  };
}

/**
 * The season is over: every game has a board and is final, and nothing more
 * is coming on the schedule (`upcoming`: games not started that have no board
 * yet).
 */
export function seasonOver(games: readonly Pick<SeasonGame, "status">[], upcoming: number): boolean {
  return games.length > 0 && upcoming === 0 && games.every((g) => g.status === "final");
}

/** Where a game sits in its season: "Game 3 of 17", its neighbors. `ids` are the season's game boards by kickoff. */
export function seasonPositionOf(season: { id: string; name: string }, ids: readonly string[], id: string): SeasonPosition | null {
  const i = ids.indexOf(id);
  if (i < 0) return null;
  return { id: season.id, name: season.name, index: i + 1, count: ids.length, prevId: ids[i - 1] ?? null, nextId: ids[i + 1] ?? null };
}

/** "Game 3 of 17". */
export function seasonPositionLine(p: Pick<SeasonPosition, "index" | "count">): string {
  return `Game ${p.index} of ${p.count}`;
}

/** The season's numbers, when every game uses the same ones (the classic season grid), else null. */
export function sharedSeasonNumbers(state: Pick<GameState, "game" | "season">): Record<string, NumberDraw> | null {
  if (state.season?.numbers !== "same") return null;
  const n = state.game.numbers;
  return n && Object.keys(n).length > 0 ? n : null;
}
