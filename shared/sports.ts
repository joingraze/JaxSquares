// Sports and leagues: which leagues a board can link to and the sport each
// plays, how its game splits (four quarters, or two halves for men's college
// basketball), which winning moments and preset cards it offers, and how a
// live period number maps onto those moments. Pure and framework-free (worker
// + client), unit-tested in sports.test.ts.
//
// Football and basketball share the moments of GameFormat.rules (q1, q2 =
// halftime, q3, final): a quarter league uses all four, men's college
// basketball only halftime (the end of the 1st half) and the final. Every
// score change (and with it the score kinds: touchdown, field goal...) is
// football only: a basketball game has far too many scores.

import { FIXED_MOMENTS, MOMENTS, PERIOD_PRESETS, rulesForPreset, sortRules, type FixedPreset } from "./formats";
import { SPORT_WORDS, sportWords, type SportWords } from "./sportWords";
import type { League, Moment, MomentRule, Sport } from "./types";

export { SPORT_WORDS, sportWords, type SportWords };

export type FootballLeague = "nfl" | "ncaaf";
export type BasketballLeague = "nba" | "wnba" | "ncaab" | "ncaaw";
/** A league with a live feed (everything but a typed-in "custom" matchup). */
export type LinkedLeague = Exclude<League, "custom">;
/** The sports a board can be made for. */
export type BoardSport = "football" | "basketball";

export const BOARD_SPORTS: readonly BoardSport[] = ["football", "basketball"];
export const FOOTBALL_LEAGUES: readonly FootballLeague[] = ["nfl", "ncaaf"];
export const BASKETBALL_LEAGUES: readonly BasketballLeague[] = ["nba", "wnba", "ncaab", "ncaaw"];
export const LINKED_LEAGUES: readonly LinkedLeague[] = [...FOOTBALL_LEAGUES, ...BASKETBALL_LEAGUES];
export const LEAGUES: readonly League[] = [...LINKED_LEAGUES, "custom"];

export interface LeagueInfo {
  sport: BoardSport;
  /** The game picker's chip: "NFL", "College", "Men's college". */
  label: string;
  /** In a sentence: "NFL", "college football", "men's college basketball". */
  name: string;
  /** How its games are picked: by week of the season (football) or by day (basketball). */
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
};

export const SPORT_LEAGUES: Record<BoardSport, readonly LinkedLeague[]> = { football: FOOTBALL_LEAGUES, basketball: BASKETBALL_LEAGUES };
export const SPORT_LABEL: Record<BoardSport, string> = { football: "Football", basketball: "Basketball" };

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
export const SPORT_ERROR = "Pick football or basketball.";

/**
 * Why a new board can't be this sport in this league (the API answers 400),
 * or null: a league plays one sport; a custom board is football or
 * basketball. No sport at all (older clients) is fine: see boardSportFor.
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

/** Its games are picked by day (basketball), not by week of the season. */
export function isDayLeague(league: League | null | undefined): league is BasketballLeague {
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

/** The board's words ("Tip-off", "the final buzzer"). */
export function wordsFor(kind: GameKind | null | undefined): SportWords {
  return sportWords(sportOf(kind));
}

/** Two halves instead of four quarters: men's college basketball. */
export function playsHalves(kind: GameKind | null | undefined): boolean {
  return isLinkedLeague(kind?.league) && LEAGUE_INFO[kind.league].halves;
}

/** Periods in regulation: 4 quarters, or 2 halves. */
export function regulationPeriods(kind: GameKind | null | undefined): number {
  return playsHalves(kind) ? 2 : 4;
}

// ---- Moments and presets ----

/**
 * The moments a board's game offers, in canonical order: football all of
 * them (every score included), basketball the quarter-ends, halftime and the
 * final, and a game played in halves only halftime and the final.
 */
export function momentsFor(kind: GameKind | null | undefined): Moment[] {
  if (isFootball(kind)) return [...MOMENTS];
  return playsHalves(kind) ? ["q2", "final"] : [...FIXED_MOMENTS];
}

const presetMoments = (preset: FixedPreset): Moment[] => rulesForPreset(preset, false).map((r) => r.moment);

/**
 * The preset cards the create flow offers: football's four; basketball's
 * every quarter, halftime + final and the final (no every score); men's
 * college basketball halftime + final and the final.
 */
export function presetsFor(kind: GameKind | null | undefined): FixedPreset[] {
  const moments = momentsFor(kind);
  return PERIOD_PRESETS.filter((p) => presetMoments(p).every((m) => moments.includes(m)));
}

/** The preset a new board of this kind starts on: every quarter, or halftime + final for a game of halves. */
export function defaultPresetFor(kind: GameKind | null | undefined): FixedPreset {
  return presetsFor(kind)[0] ?? "final";
}

/** Every score change on a basketball board (the API answers 400). */
export const EVERY_SCORE_SPORT_ERROR = "Every score isn't offered for basketball: there are too many scores. Pick another way to win.";
/** A quarter-end on a game played in halves (the API answers 400). */
export const HALVES_MOMENT_ERROR = "Men's college basketball plays two halves: squares win at halftime and the final.";
/** Any other moment the game doesn't have. */
export const MOMENT_SPORT_ERROR = "That moment isn't part of this game.";

/** Why these rules can't go on this game (the API answers 400 with it), or null. */
export function rulesProblemFor(rules: readonly Pick<MomentRule, "moment">[], kind: GameKind | null | undefined): string | null {
  const allowed = momentsFor(kind);
  for (const r of rules) {
    if (allowed.includes(r.moment)) continue;
    if (r.moment === "score") return EVERY_SCORE_SPORT_ERROR;
    return playsHalves(kind) ? HALVES_MOMENT_ERROR : MOMENT_SPORT_ERROR;
  }
  return null;
}

/**
 * Rules fitted to a game: the same array when every moment is one it offers;
 * else the moments it does offer (prizes and notes kept), or its default
 * preset when none are left or every score was among them (the reverse
 * square kept when every moment had one). What the create flow does when the
 * host switches to a game that can't take the rules picked so far.
 */
export function fitRules(rules: readonly MomentRule[], kind: GameKind | null | undefined): MomentRule[] {
  const allowed = momentsFor(kind);
  if (rules.every((r) => allowed.includes(r.moment))) return rules as MomentRule[];
  const kept = rules.filter((r) => allowed.includes(r.moment));
  if (kept.length > 0 && !rules.some((r) => r.moment === "score")) return sortRules(kept);
  const reverse = rules.length > 0 && rules.every((r) => !!r.reverse);
  return rulesForPreset(defaultPresetFor(kind), reverse);
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

/** A live period's short name for a clock line: "Q3", "H2", "OT" (when the feed sends no text of its own). */
export function periodName(livePeriod: number, kind: GameKind | null | undefined): string {
  const p = Math.max(1, Math.trunc(livePeriod) || 1);
  if (p > regulationPeriods(kind)) return "OT";
  return playsHalves(kind) ? `H${p}` : `Q${p}`;
}
