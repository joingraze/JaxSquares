// Sports and leagues: which leagues a board can link to and the sport each
// plays, how its game splits (four quarters, or two halves for men's college
// basketball), which winning moments and preset cards it offers, and how a
// live period number maps onto those moments. Pure and framework-free (worker
// + client), unit-tested in sports.test.ts.
//
// Football and basketball share the moments of GameFormat.rules (q1, q2 =
// halftime, q3, final): a quarter league uses all four, men's college
// basketball only halftime (the end of the 1st half) and the final. Every
// score change is football's and soccer's: a basketball game has far too
// many scores, and the score kinds (touchdown, field goal...) are football's
// alone. A soccer board's squares are the match's minutes (shared/soccer.ts):
// it wins on the first goal ("first"), every goal ("score") and the last goal
// ("final"), with one draw for the whole match.

import { FIXED_MOMENTS, hasByKind, PERIOD_PRESETS, rulesForPreset, rulesOf, sortRules, type FixedPreset } from "./formats";
import { SPORT_WORDS, sportWords, type SportWords } from "./sportWords";
import type { GameFormat, League, Moment, MomentRule, Sport } from "./types";

export { SPORT_WORDS, sportWords, type SportWords };

export type FootballLeague = "nfl" | "ncaaf";
export type BasketballLeague = "nba" | "wnba" | "ncaab" | "ncaaw";
export type SoccerLeague = "mls" | "nwsl" | "epl" | "laliga" | "ligamx" | "ucl";
/** A league whose games are picked by day (basketball, soccer). */
export type DayLeague = BasketballLeague | SoccerLeague;
/** A league with a live feed (everything but a typed-in "custom" matchup). */
export type LinkedLeague = Exclude<League, "custom">;
/** The sports a board can be made for. */
export type BoardSport = "football" | "basketball" | "soccer";

export const BOARD_SPORTS: readonly BoardSport[] = ["football", "basketball", "soccer"];
export const FOOTBALL_LEAGUES: readonly FootballLeague[] = ["nfl", "ncaaf"];
export const BASKETBALL_LEAGUES: readonly BasketballLeague[] = ["nba", "wnba", "ncaab", "ncaaw"];
export const SOCCER_LEAGUES: readonly SoccerLeague[] = ["mls", "nwsl", "epl", "laliga", "ligamx", "ucl"];
export const LINKED_LEAGUES: readonly LinkedLeague[] = [...FOOTBALL_LEAGUES, ...BASKETBALL_LEAGUES, ...SOCCER_LEAGUES];
export const LEAGUES: readonly League[] = [...LINKED_LEAGUES, "custom"];

export interface LeagueInfo {
  sport: BoardSport;
  /** The game picker's chip: "NFL", "College", "Men's college", "MLS". */
  label: string;
  /** In a sentence: "NFL", "college football", "men's college basketball", "the Premier League". */
  name: string;
  /** How its games are picked: by week of the season (football) or by day (basketball, soccer). */
  schedule: "week" | "day";
  /** Two halves (men's college basketball) instead of four quarters. */
  halves: boolean;
}

export const LEAGUE_INFO: Record<LinkedLeague, LeagueInfo> = {
  nfl: { sport: "football", label: "NFL", name: "NFL", schedule: "week", halves: false },
  ncaaf: { sport: "football", label: "College", name: "college football", schedule: "week", halves: false },
  nba: { sport: "basketball", label: "NBA", name: "NBA", schedule: "day", halves: false },
  wnba: { sport: "basketball", label: "WNBA", name: "WNBA", schedule: "day", halves: false },
  ncaab: { sport: "basketball", label: "Men's college", name: "men's college basketball", schedule: "day", halves: true },
  ncaaw: { sport: "basketball", label: "Women's college", name: "women's college basketball", schedule: "day", halves: false },
  // Soccer's halves aren't periods a square wins at: it wins on goals (momentsFor).
  mls: { sport: "soccer", label: "MLS", name: "MLS", schedule: "day", halves: false },
  nwsl: { sport: "soccer", label: "NWSL", name: "NWSL", schedule: "day", halves: false },
  epl: { sport: "soccer", label: "Premier League", name: "the Premier League", schedule: "day", halves: false },
  laliga: { sport: "soccer", label: "LaLiga", name: "LaLiga", schedule: "day", halves: false },
  ligamx: { sport: "soccer", label: "Liga MX", name: "Liga MX", schedule: "day", halves: false },
  ucl: { sport: "soccer", label: "Champions League", name: "the Champions League", schedule: "day", halves: false },
};

export const SPORT_LEAGUES: Record<BoardSport, readonly LinkedLeague[]> = { football: FOOTBALL_LEAGUES, basketball: BASKETBALL_LEAGUES, soccer: SOCCER_LEAGUES };
export const SPORT_LABEL: Record<BoardSport, string> = { football: "Football", basketball: "Basketball", soccer: "Soccer" };

export function isLinkedLeague(v: unknown): v is LinkedLeague {
  return typeof v === "string" && (LINKED_LEAGUES as readonly string[]).includes(v);
}

export function isLeague(v: unknown): v is League {
  return v === "custom" || isLinkedLeague(v);
}

export function isBoardSport(v: unknown): v is BoardSport {
  return typeof v === "string" && (BOARD_SPORTS as readonly string[]).includes(v);
}

/** The sport a league plays; null for a custom board (its host picks). */
export function leagueSport(league: League | null | undefined): BoardSport | null {
  return isLinkedLeague(league) ? LEAGUE_INFO[league].sport : null;
}

/** A sport the API doesn't make boards for (it answers 400). */
export const SPORT_ERROR = "Pick football, basketball or soccer.";

/**
 * Why a new board can't be this sport in this league (the API answers 400),
 * or null: a league plays one sport; a custom board is football, basketball
 * or soccer. No sport at all (older clients) is fine: see boardSportFor.
 */
export function leagueSportProblem(sport: unknown, league: League): string | null {
  if (sport === undefined || sport === null) return null;
  if (!isBoardSport(sport)) return SPORT_ERROR;
  const plays = leagueSport(league);
  return plays && plays !== sport ? `That league plays ${plays}, not ${sport}.` : null;
}

/** The sport a new board is made for: its league's; a custom board's the one asked for, else football. */
export function boardSportFor(sport: unknown, league: League): BoardSport {
  return leagueSport(league) ?? (isBoardSport(sport) ? sport : "football");
}

/** Its games are picked by day (basketball, soccer), not by week of the season. */
export function isDayLeague(league: League | null | undefined): league is DayLeague {
  return isLinkedLeague(league) && LEAGUE_INFO[league].schedule === "day";
}

/** What a board is played as: its sport and league (moments, presets, periods, words). */
export interface GameKind {
  sport?: Sport | null;
  league?: League | null;
}

/** A board's sport; football when absent (older data and fixtures). */
export function sportOf(kind: GameKind | null | undefined): Sport {
  return kind?.sport ?? leagueSport(kind?.league) ?? "football";
}

export function isFootball(kind: GameKind | null | undefined): boolean {
  return sportOf(kind) === "football";
}

export function isBasketball(kind: GameKind | null | undefined): boolean {
  return sportOf(kind) === "basketball";
}

/** A goal-minute board: its squares are the match's minutes (shared/soccer.ts). */
export function isSoccer(kind: GameKind | null | undefined): boolean {
  return sportOf(kind) === "soccer";
}

/** The board's words ("Tip-off", "the final buzzer"). */
export function wordsFor(kind: GameKind | null | undefined): SportWords {
  return sportWords(sportOf(kind));
}

/** Two halves instead of four quarters: men's college basketball. */
export function playsHalves(kind: GameKind | null | undefined): boolean {
  return isLinkedLeague(kind?.league) && LEAGUE_INFO[kind.league].halves;
}

/** Periods in regulation: 4 quarters, or 2 halves (a game of halves, and soccer's). */
export function regulationPeriods(kind: GameKind | null | undefined): number {
  return playsHalves(kind) || isSoccer(kind) ? 2 : 4;
}

// ---- Moments and presets ----

/**
 * The moments a board's game offers, in canonical order: football every
 * score and the quarter-ends, halftime and the final; basketball the
 * quarter-ends, halftime and the final, and a game played in halves only
 * halftime and the final; soccer the first goal, every goal and the last goal.
 */
export function momentsFor(kind: GameKind | null | undefined): Moment[] {
  if (isSoccer(kind)) return ["first", "score", "final"];
  if (isFootball(kind)) return ["score", ...FIXED_MOMENTS];
  return playsHalves(kind) ? ["q2", "final"] : [...FIXED_MOMENTS];
}

const presetMoments = (preset: FixedPreset): Moment[] => rulesForPreset(preset, false).map((r) => r.moment);

/** Soccer's preset cards, in the order the create flow offers them. */
const SOCCER_PRESETS: readonly FixedPreset[] = ["every-score", "first-last", "final"];

/**
 * The preset cards the create flow offers: football's four; basketball's
 * every quarter, halftime + final and the final (no every score); men's
 * college basketball halftime + final and the final; soccer's every goal,
 * first & last goal and the last goal.
 */
export function presetsFor(kind: GameKind | null | undefined): FixedPreset[] {
  if (isSoccer(kind)) return [...SOCCER_PRESETS];
  const moments = momentsFor(kind);
  return PERIOD_PRESETS.filter((p) => presetMoments(p).every((m) => moments.includes(m)));
}

/** The preset a new board of this kind starts on: every quarter, halftime + final for a game of halves, every goal in soccer. */
export function defaultPresetFor(kind: GameKind | null | undefined): FixedPreset {
  return presetsFor(kind)[0] ?? "final";
}

/** Every score change on a basketball board (the API answers 400). */
export const EVERY_SCORE_SPORT_ERROR = "Every score isn't offered for basketball: there are too many scores. Pick another way to win.";
/** A quarter-end on a game played in halves (the API answers 400). */
export const HALVES_MOMENT_ERROR = "Men's college basketball plays two halves: squares win at halftime and the final.";
/** A quarter-end or halftime on a soccer board (the API answers 400). */
export const SOCCER_MOMENT_ERROR = "Soccer squares win on goals: the first goal, every goal and the last goal.";
/** Any other moment the game doesn't have. */
export const MOMENT_SPORT_ERROR = "That moment isn't part of this game.";
/** Amounts by score type off football (the API answers 400): touchdowns and field goals are football's. */
export const BY_KIND_SPORT_ERROR = "Amounts by score type are for football boards.";
/** Fresh numbers on a soccer board (the API answers 400): its minutes keep one draw all match. */
export const SOCCER_FRESH_ERROR = "A soccer board keeps one set of numbers all match.";

/** Why these rules can't go on this game (the API answers 400 with it), or null. */
export function rulesProblemFor(rules: readonly Pick<MomentRule, "moment" | "square" | "reverse">[], kind: GameKind | null | undefined): string | null {
  const allowed = momentsFor(kind);
  for (const r of rules) {
    if (allowed.includes(r.moment)) continue;
    if (isSoccer(kind)) return SOCCER_MOMENT_ERROR;
    if (r.moment === "score") return EVERY_SCORE_SPORT_ERROR;
    return playsHalves(kind) ? HALVES_MOMENT_ERROR : MOMENT_SPORT_ERROR;
  }
  if (!isFootball(kind) && rules.some((r) => hasByKind(r.square) || hasByKind(r.reverse))) return BY_KIND_SPORT_ERROR;
  return null;
}

/** Why this format can't go on this game (the API answers 400 with it), or null: its rules, and a soccer board's one draw. */
export function formatProblemFor(format: GameFormat, kind: GameKind | null | undefined): string | null {
  const rules = rulesProblemFor(rulesOf(format), kind);
  if (rules) return rules;
  return isSoccer(kind) && format.freshNumbers ? SOCCER_FRESH_ERROR : null;
}

/**
 * Rules fitted to a game: the same array when every moment is one it offers
 * (amounts by score type dropped off football); else the moments it does
 * offer (prizes and notes kept), or its default preset when none are left,
 * every score was among them or the board turns to or from soccer (the
 * reverse square kept when every moment had one). What the create flow does
 * when the host switches to a game that can't take the rules picked so far.
 */
export function fitRules(rules: readonly MomentRule[], kind: GameKind | null | undefined): MomentRule[] {
  const allowed = momentsFor(kind);
  if (rules.every((r) => allowed.includes(r.moment))) {
    // Amounts by score type are football's: another sport's every score keeps its flat amount.
    if (isFootball(kind) || !rules.some((r) => hasByKind(r.square) || hasByKind(r.reverse))) return rules as MomentRule[];
    return rules.map((r) => ({ ...r, square: withoutByKind(r.square), reverse: withoutByKind(r.reverse) }));
  }
  const kept = rules.filter((r) => allowed.includes(r.moment));
  // Quarters don't become goals (nor a first goal a quarter): a board turning
  // to or from soccer starts on its game's default.
  const crossesSoccer = isSoccer(kind) || rules.some((r) => r.moment === "first");
  if (kept.length > 0 && !rules.some((r) => r.moment === "score") && !crossesSoccer) return sortRules(kept);
  const reverse = rules.length > 0 && rules.every((r) => !!r.reverse);
  return defaultRulesFor(kind, reverse);
}

/**
 * A new board's rules for its game: its default preset's, and on a soccer
 * board every goal with the last goal too (as its Every goal card makes it:
 * the last goal can take the rest of the board total).
 */
export function defaultRulesFor(kind: GameKind | null | undefined, reverse = false): MomentRule[] {
  const rules = rulesForPreset(defaultPresetFor(kind), reverse);
  if (!isSoccer(kind)) return rules;
  return sortRules([...rules, { moment: "final", square: { amount: null, note: "" }, reverse: reverse ? { amount: null, note: "" } : null }]);
}

function withoutByKind(prize: MomentRule["square"]): MomentRule["square"] {
  if (!prize?.byKind) return prize;
  const { byKind: _byKind, ...rest } = prize;
  void _byKind;
  return rest;
}

/** The fresh-numbers option in this game's words: a new draw each quarter, or each half. */
export function freshNumbersInfo(kind: GameKind | null | undefined): { label: string; description: string; each: "quarter" | "half" } {
  return playsHalves(kind)
    ? { label: "New numbers each half", description: "A fresh draw for each half.", each: "half" }
    : { label: "New numbers each quarter", description: "A fresh draw before every quarter.", each: "quarter" };
}

// ---- Live periods ----

/**
 * How many of the game's periods (as the live feed counts them) are over when
 * a fixed moment is decided: Q1 1, halftime 2, Q3 3; in a game of halves,
 * halftime 1 (it has no Q1 or Q3). null for the final, which waits for the
 * game to end (overtime included), and for anything else.
 */
export function periodsBefore(moment: string, kind: GameKind | null | undefined): number | null {
  if (playsHalves(kind)) return moment === "q2" ? 1 : null;
  return moment === "q1" ? 1 : moment === "q2" ? 2 : moment === "q3" ? 3 : null;
}

/**
 * The fixed moment a live period number is playing toward, as an index into
 * q1, q2, q3, final: quarter n is n - 1 (overtime counts toward the final);
 * in a game of halves the 1st half plays toward halftime, the 2nd half and
 * overtime toward the final.
 */
export function liveMomentIndex(livePeriod: number, kind: GameKind | null | undefined): number {
  const p = Math.max(1, Math.trunc(livePeriod) || 1);
  if (playsHalves(kind)) return p <= 1 ? 1 : 3;
  return Math.min(p, 4) - 1;
}

/** A live period's short name for a clock line: "Q3", "H2", "OT"; soccer's "ET" and "Pens" (when the feed sends no text of its own). */
export function periodName(livePeriod: number, kind: GameKind | null | undefined): string {
  const p = Math.max(1, Math.trunc(livePeriod) || 1);
  if (isSoccer(kind) && p > 2) return p >= 5 ? "Pens" : "ET";
  if (p > regulationPeriods(kind)) return "OT";
  return playsHalves(kind) || isSoccer(kind) ? `H${p}` : `Q${p}`;
}
