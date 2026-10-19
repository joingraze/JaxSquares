// Pure helpers for the create-board flow: team names, the auto board name,
// plain-language format copy and the request body. No React, no IO.

import { FREE_PLAYER_LIMIT } from "../../../shared/hostFee";
import { kickoffProblem } from "../../../shared/kickoff";
import {
  BOARD_SIZE_INFO,
  freshNumbersAllowed,
  mentionsMoney,
  matchingPreset,
  periodsFor,
  PRESET_INFO,
  ruleFor,
  rulesOf,
  rulesSummary,
  tidyNote,
  type FixedPreset,
} from "../../../shared/formats";
import { leagueSport, playsHalves, wordsFor, type BoardSport, type GameKind } from "../../../shared/sports";
import { nflTeamToTeam, teamsForSport, type NflTeam, type ProTeam } from "../../../shared/teams";
import { shortTeam, shortTeamName } from "../../lib/format";
import type { CreateGameInput, GameFormat, League, LinkedEvent, Moment, ScheduleEvent, Sport, Team } from "../../../shared/types";
import { capLine, firstNoteProblem, formatOf, isEveryScoreSetup, isEveryScoreWithReverseQuarters, noteInputId, type PrizeChoice } from "../rules/rulesModel";

/**
 * Side colors for a team with no live color (the board's own fallbacks, see
 * teamVars). A custom board stores them on its teams so the board, invite,
 * home cards and checkout all show the same two colors.
 */
export const CUSTOM_X_COLOR = "#3ab7ff";
export const CUSTOM_Y_COLOR = "#ff66a6";

/** Server limits (worker cleanTeam / create handler). */
export const TEAM_NAME_MAX = 40;
export const BOARD_NAME_MAX = 60;

// ---- Team names ----
//
// A custom board's typed teams match the NFL's on a football board and the
// NBA's on a basketball board (shared/teams.ts `teamsForSport`).

function teamByAbbr(abbr: string | undefined, sport: BoardSport = "football"): ProTeam | undefined {
  if (!abbr) return undefined;
  const a = abbr.toUpperCase();
  return teamsForSport(sport).find((t) => t.abbr === a);
}

/** Team colors from live data, keyed by abbreviation ("GB" -> "#204e32"); one map per sport. */
export type TeamColors = Readonly<Record<string, string>>;

/**
 * What a typed custom team becomes: an exact match among the sport's pro teams
 * (abbreviation, nickname, full name, or an unambiguous city) is upgraded to
 * the full team with its abbreviation, and its color when the live schedule
 * has it; anything else is kept as typed. Null when blank. `nfl` is the
 * matched pro team (the NBA's on a basketball board).
 */
export function resolveCustomTeam(text: string, colors: TeamColors = {}, sport: BoardSport = "football"): { team: Team; nfl: ProTeam | null } | null {
  const typed = text.trim().replace(/\s+/g, " ").slice(0, TEAM_NAME_MAX);
  if (!typed) return null;
  const pro = matchTeam(typed, sport);
  if (pro) {
    const color = colors[pro.abbr];
    return { team: color ? { ...nflTeamToTeam(pro), color } : nflTeamToTeam(pro), nfl: pro };
  }
  return { team: { name: typed }, nfl: null };
}

/**
 * Pro team colors from the live schedule (the only place team colors come
 * from), so a typed "Packers" gets the same green as the linked GB @ CHI game
 * (and a typed "Lakers" the NBA schedule's purple, with `league` "nba").
 */
export function teamColorsFrom(events: readonly ScheduleEvent[], league: "nfl" | "nba" = "nfl"): TeamColors {
  const sport: BoardSport = league === "nba" ? "basketball" : "football";
  const out: Record<string, string> = {};
  for (const e of events) {
    if (e.league !== league) continue;
    for (const t of [e.home, e.away]) {
      const abbr = t.abbr?.toUpperCase();
      if (abbr && t.color && teamByAbbr(abbr, sport)) out[abbr] = t.color;
    }
  }
  return out;
}

const popular = (abbrs: string[], sport: BoardSport) => abbrs.map((abbr) => teamByAbbr(abbr, sport)).filter((t): t is ProTeam => Boolean(t));

/** One-tap teams for a custom board, before anything is typed. */
export const POPULAR_TEAMS: readonly NflTeam[] = popular(["KC", "PHI", "DAL", "GB", "BUF", "SF", "DET", "BAL"], "football");
/** The same for a custom basketball board. */
export const POPULAR_NBA_TEAMS: readonly ProTeam[] = popular(["LAL", "BOS", "GS", "NY", "MIA", "CHI", "DEN", "OKC"], "basketball");

/** The one-tap teams for a custom board of this sport. */
export function popularTeams(sport: BoardSport = "football"): readonly ProTeam[] {
  return sport === "basketball" ? POPULAR_NBA_TEAMS : POPULAR_TEAMS;
}

export function matchNflTeam(text: string): NflTeam | null {
  return matchTeam(text, "football");
}

/** The sport's pro team a typed name means (abbreviation, nickname, full name or an unambiguous city), or null. */
export function matchTeam(text: string, sport: BoardSport = "football"): ProTeam | null {
  const q = text.trim().toLowerCase().replace(/\s+/g, " ");
  if (!q) return null;
  const teams = teamsForSport(sport);
  const exact = teams.find(
    (t) => t.abbr.toLowerCase() === q || t.nickname.toLowerCase() === q || `${t.location} ${t.nickname}`.toLowerCase() === q,
  );
  if (exact) return exact;
  const byCity = teams.filter((t) => t.location.toLowerCase() === q);
  return byCity.length === 1 ? byCity[0] : null;
}

/** The label a custom team shows on the board name: the nickname for a pro team match, else what was typed. */
export function customShortName(text: string, sport: BoardSport = "football"): string {
  const resolved = resolveCustomTeam(text, {}, sport);
  if (!resolved) return "";
  return resolved.nfl ? resolved.nfl.nickname : resolved.team.name;
}

/** "Bills vs Chiefs Squares", kept under the server's 60-character limit. */
export function boardNameFor(x: string, y: string): string {
  const a = x.trim();
  const b = y.trim();
  if (!a || !b) return "";
  const full = `${a} vs ${b} Squares`;
  if (full.length <= BOARD_NAME_MAX) return full;
  const plain = `${a} vs ${b}`;
  if (plain.length <= BOARD_NAME_MAX) return plain;
  return plain.slice(0, BOARD_NAME_MAX).trim();
}

// ---- Linked games ----

/**
 * Orients a real game for the board: the away team goes across the top (X),
 * the home team down the side (Y), matching how the matchup reads ("BUF @ KC").
 */
export function orientEvent(event: ScheduleEvent): { teamX: Team; teamY: Team; linkedEvent: LinkedEvent } {
  return {
    teamX: { ...event.away },
    teamY: { ...event.home },
    linkedEvent: {
      provider: "espn",
      league: event.league,
      eventId: event.eventId,
      startsAt: event.startsAt,
      xIsHome: false,
    },
  };
}

/** Upcoming games a board can still be linked to, soonest first. */
export function upcomingEvents(events: ScheduleEvent[], now = Date.now()): ScheduleEvent[] {
  return events.filter((e) => e.state === "pre" && e.startsAt > now - 5 * 60_000).sort((a, b) => a.startsAt - b.startsAt);
}

/** Kickoff split for a two-line label: { day: "Today" | "Tomorrow" | "Sun" | "Oct 26", time: "1:00 PM" }. */
export function kickoffParts(ts: number, now = Date.now()): { day: string; time: string } {
  const time = new Date(ts).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
  const startOfDay = (t: number) => new Date(t).setHours(0, 0, 0, 0);
  const days = Math.round((startOfDay(ts) - startOfDay(now)) / 86_400_000);
  const day =
    days === 0
      ? "Today"
      : days === 1
        ? "Tomorrow"
        : days > 1 && days < 7
          ? new Date(ts).toLocaleDateString("en-US", { weekday: "short" })
          : new Date(ts).toLocaleDateString("en-US", { month: "short", day: "numeric" });
  return { day, time };
}

/**
 * Countdown for a kickoff that's close: "in 45m", "in 3h", "in 2h 30m". Null
 * when it's more than six hours out (the day and time say enough) or started.
 */
export function startsIn(ts: number, now = Date.now()): string | null {
  const ms = ts - now;
  if (ms <= 0 || ms >= 6 * 3_600_000) return null;
  const totalMin = Math.max(1, Math.round(ms / 60_000));
  if (totalMin < 60) return `in ${totalMin}m`;
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  return m < 5 ? `in ${h}h` : `in ${h}h ${m}m`;
}

// ---- Format copy ----

/** How many winning moments a preset has (null = one per score change). */
export function winnerCount(preset: FixedPreset): number | null {
  return preset === "every-score" ? null : periodsFor(preset).length;
}

/**
 * Short, stable tag for a format card: "4 winners", "1 winner", "1 winner per
 * score". Modifiers (reverse) don't change it; the summary shows their effect once.
 */
export function winnersTag(preset: FixedPreset): string {
  const n = winnerCount(preset);
  if (n === null) return "1 winner per score";
  return `${n} ${n === 1 ? "winner" : "winners"}`;
}

const WHEN: Record<FixedPreset, string> = {
  quarters: "after Q1, at halftime, after Q3 and at the final",
  halves: "at halftime and at the final",
  final: "at the final (overtime counts)",
  "every-score": "every time the score changes",
};

const MOMENT_WHEN: Record<Moment, string> = {
  score: "every time the score changes",
  q1: "after Q1",
  q2: "at halftime",
  q3: "after Q3",
  final: "at the final",
};

/** "after Q1, at halftime and at the final". */
function whenList(moments: Moment[]): string {
  const words = moments.map((m) => MOMENT_WHEN[m]);
  return words.length <= 1 ? (words[0] ?? "") : `${words.slice(0, -1).join(", ")} and ${words[words.length - 1]}`;
}

const winnersWord = (n: number) => `${n} ${n === 1 ? "winner" : "winners"}`;

/** Fresh numbers apply: the rules allow them (a board without rules: the quarters preset). */
function freshApplies(format: GameFormat): boolean {
  return format.freshNumbers && (format.rules?.length ? freshNumbersAllowed(format.rules) : format.periods === "quarters");
}

/**
 * The summary headline as two phrases that are each kept on one line:
 * { winners: "8 winners", size: "100 squares" }, "2 winners every score", or
 * "Every score + 4 winners" when both win.
 */
export function boardHeadlineParts(format: GameFormat): { winners: string; size: string } {
  const size = `${format.boardSize} squares`;
  const rules = rulesOf(format);
  const fixed = rules.filter((r) => r.moment !== "score").reduce((n, r) => n + (r.square ? 1 : 0) + (r.reverse ? 1 : 0), 0);
  const score = ruleFor(rules, "score");
  if (!score) return { winners: winnersWord(fixed), size };
  if (fixed === 0) return { winners: score.square && score.reverse ? "2 winners every score" : "A winner every score", size };
  return { winners: `Every score + ${winnersWord(fixed)}`, size };
}

/** "4 winners · 100 squares", "8 winners · 25 squares", "A winner every score · 100 squares". */
export function boardHeadline(format: GameFormat): string {
  const { winners, size } = boardHeadlineParts(format);
  return `${winners} · ${size}`;
}

/**
 * Plain-language rules that follow every choice, e.g. "The square matching the
 * last digit of each team's score wins after Q1, at halftime, after Q3 and at
 * the final." Custom rules say where the square and the reverse square win.
 * `kind` words fresh numbers: every quarter, or every half in a game of halves.
 */
export function describeBoard(format: GameFormat, kind?: GameKind): string {
  const rules = rulesOf(format);
  const exact = matchingPreset(rules);
  let text: string;
  if (exact) {
    text = `The square matching the last digit of each team's score wins ${WHEN[exact.preset]}.`;
    if (exact.reverse) text += " Flip the digits and that square wins too.";
  } else {
    const square = rules.filter((r) => r.square).map((r) => r.moment);
    const reverse = rules.filter((r) => r.reverse).map((r) => r.moment);
    text = square.length ? `The square matching the last digit of each team's score wins ${whenList(square)}.` : "";
    if (reverse.length && reverse.join() === square.join()) text += " Flip the digits and that square wins too.";
    else if (reverse.length) {
      text += square.length
        ? ` Flip the digits and that square wins ${whenList(reverse)}.`
        : `Flip the last digits of the two scores: that square wins ${whenList(reverse)}.`;
    }
    text = text.trim();
  }
  if (format.boardSize === 25) text += " Two numbers per row and column.";
  if (freshApplies(format)) text += playsHalves(kind) ? " New numbers every half." : " New numbers every quarter.";
  return text;
}

/** One line for the rules row and the checkout ticket: "Every quarter · 10×10 · Reverse". */
export function formatLine(format: GameFormat, kind?: GameKind): string {
  const rules = rulesOf(format);
  const exact = matchingPreset(rules);
  const size = BOARD_SIZE_INFO[format.boardSize].short;
  const parts = exact ? [PRESET_INFO[exact.preset].label, size] : [rulesSummary(rules), size];
  if (exact?.reverse) parts.push("Reverse");
  if (freshApplies(format)) parts.push(playsHalves(kind) ? "New numbers each half" : "New numbers each Q");
  return parts.join(" · ");
}

/** The rules row's title: the preset's name, "Every score + reverse" for that setup, or "Custom rules". */
export function rulesTitle(format: GameFormat): string {
  const rules = rulesOf(format);
  const exact = matchingPreset(rules);
  if (exact) return PRESET_INFO[exact.preset].label;
  if (isEveryScoreWithReverseQuarters(rules)) return `${PRESET_INFO["every-score"].label} + reverse`;
  return isEveryScoreSetup(rules) ? PRESET_INFO["every-score"].label : PRESET_INFO.custom.label;
}

/** The details row's second line: "No max per player" or "Up to 5 squares each". */
export function detailsSummary(maxPerPlayer: number): string {
  return capLine(maxPerPlayer) ?? "No max per player";
}

/**
 * The line under Review's Create button: what the host pays, and when.
 * `price` is the host fee as this device shows it (the App Store's in the iOS
 * app, never the web price there); null leaves the amount out.
 */
export function createFeeLine(price: string | null): string {
  const free = `Free to set up and invite. Free to draw with up to ${FREE_PLAYER_LIMIT} players`;
  return price ? `${free}, ${price} for bigger boards.` : `${free}; bigger boards have a host fee when you draw.`;
}

/** The first rule note (in game order) that mentions money, with the message to show. */
export function firstPrizeProblem(format: GameFormat): { key: string; message: string } | null {
  const problem = firstNoteProblem(rulesOf(format));
  return problem ? { key: noteInputId(problem.moment, problem.side), message: problem.message } : null;
}

// ---- Request body ----

/**
 * "Add another board for this game": the board the new one is made from, and
 * its game (the server takes the game from that board too).
 */
export interface BoardMatchup {
  id: string;
  /** That board's name ("Office Squares"). */
  name: string;
  teamX: Team;
  teamY: Team;
  league: League;
  /** That board's sport (absent on older cached boards: its league's, else football). */
  sport?: Sport;
  linkedEvent: LinkedEvent | null;
  /** A custom board's kickoff (null = no set time); a linked board's is its event's. */
  startsAt: number | null;
}

export type Matchup =
  | { kind: "linked"; event: ScheduleEvent }
  /** Two typed teams the host scores by hand, as football (the default) or basketball. */
  | { kind: "custom"; x: string; y: string; sport?: BoardSport }
  | { kind: "board"; from: BoardMatchup };

/** The sport and league a matchup's board is played as (its moments, presets, words). */
export function matchupKind(m: Matchup | null): { sport: Sport; league: League } {
  if (!m) return { sport: "football", league: "custom" };
  if (m.kind === "board") return { sport: m.from.sport ?? leagueSport(m.from.league) ?? "football", league: m.from.league };
  if (m.kind === "linked") return { sport: leagueSport(m.event.league) ?? "football", league: m.event.league };
  return { sport: m.sport ?? "football", league: "custom" };
}

/** The two teams (and link) a matchup puts on the board, or null while incomplete. */
export function matchupTeams(
  m: Matchup | null,
  colors: TeamColors = {},
): { teamX: Team; teamY: Team; league: League; sport: Sport; linkedEvent: LinkedEvent | null } | null {
  if (!m) return null;
  const { sport } = matchupKind(m);
  if (m.kind === "board") return { ...withSideColors(m.from.teamX, m.from.teamY), league: m.from.league, sport, linkedEvent: m.from.linkedEvent };
  if (m.kind === "linked") {
    const o = orientEvent(m.event);
    return { ...withSideColors(o.teamX, o.teamY), league: m.event.league, sport, linkedEvent: o.linkedEvent };
  }
  const x = resolveCustomTeam(m.x, colors, m.sport);
  const y = resolveCustomTeam(m.y, colors, m.sport);
  if (!x || !y) return null;
  return { ...withSideColors(x.team, y.team), league: "custom", sport, linkedEvent: null };
}

/** Teams as the board will show them: a team without a color gets its side's color. */
export function withSideColors(teamX: Team, teamY: Team): { teamX: Team; teamY: Team } {
  return { teamX: { ...teamX, color: teamX.color ?? CUSTOM_X_COLOR }, teamY: { ...teamY, color: teamY.color ?? CUSTOM_Y_COLOR } };
}

/** Short names for the auto board name. */
export function matchupShortNames(m: Matchup | null): [string, string] | null {
  if (!m) return null;
  if (m.kind === "board") return [shortTeam(m.from.teamX, m.from.league), shortTeam(m.from.teamY, m.from.league)];
  if (m.kind === "linked") {
    return [shortTeamName(m.event.away, m.event.league), shortTeamName(m.event.home, m.event.league)];
  }
  const x = customShortName(m.x, m.sport);
  const y = customShortName(m.y, m.sport);
  return x && y ? [x, y] : null;
}

export interface CreateDraft {
  matchup: Matchup | null;
  /** Custom boards: the kickoff (epoch ms), null for no set time. A linked board's is its event's. */
  kickoff?: number | null;
  /** Live team colors for typed NFL teams (teamColorsFrom). */
  colors?: TeamColors;
  /** The rules (notes inside them), board size, fresh numbers, square price. */
  format: GameFormat;
  /** How prizes read (null: not chosen, and no amounts go out). */
  prizeChoice?: PrizeChoice;
  name: string;
  maxPerPlayer: number;
  host: { name: string; color: string; emoji: string };
}

/** The format a create draft sends: canonical rules, amounts only with "$" or points, notes trimmed. */
export function createFormat(format: GameFormat, choice: PrizeChoice = null): GameFormat {
  const rules = rulesOf(format).map((r) => ({
    ...r,
    square: r.square ? { ...r.square, note: tidyNote(r.square.note) } : null,
    reverse: r.reverse ? { ...r.reverse, note: tidyNote(r.reverse.note) } : null,
  }));
  return formatOf(format, { rules, choice, squarePrice: format.squarePrice ?? null, freshNumbers: format.freshNumbers });
}

/** The POST /api/games body, or null while the matchup is incomplete. Notes travel inside the rules. */
export function buildCreateInput(d: CreateDraft): CreateGameInput | null {
  const teams = matchupTeams(d.matchup, d.colors);
  if (!teams) return null;
  const short = matchupShortNames(d.matchup);
  const name = d.name.trim().slice(0, BOARD_NAME_MAX) || (short ? boardNameFor(short[0], short[1]) : "") || "Squares";
  const format = createFormat(d.format, d.prizeChoice ?? null);
  const total = format.boardSize;
  return {
    name,
    sport: teams.sport,
    league: teams.league,
    teamX: teams.teamX,
    teamY: teams.teamY,
    format,
    prizes: {},
    maxPerPlayer: Math.max(0, Math.min(total, Math.round(d.maxPerPlayer))),
    linkedEvent: teams.linkedEvent,
    ...(teams.linkedEvent ? {} : { startsAt: d.kickoff ?? null }),
    host: { ...d.host, name: d.host.name.trim() },
    // Another board for this game: it joins that board's group (the server checks this device hosts it).
    ...(d.matchup?.kind === "board" ? { fromGameId: d.matchup.from.id } : {}),
  };
}

/** Something stopping Create (or a step's Next), with the one-line ask shown next to the button. */
export type CreateBlocker =
  | { field: "game"; label: string }
  | { field: "team-x" | "team-y"; label: string }
  | { field: "kickoff"; label: string }
  | { field: "prize"; key: string; label: string }
  | { field: "host"; label: string }
  | { field: "name"; label: string };

export interface BlockerInput {
  matchup: Matchup | null;
  /** Null when this device already has a name (the field isn't shown). */
  hostName: string | null;
  format: GameFormat;
  /** Custom boards: the kickoff (null = no set time). */
  kickoff?: number | null;
  /** The board name as typed ("" = the matchup's). */
  name?: string;
  now?: number;
}

/** Everything stopping Create, in the flow's order: the game, the prizes, the final touches. */
export function blockersOf(d: BlockerInput): CreateBlocker[] {
  const out: CreateBlocker[] = [];
  const m = d.matchup;
  if (!m) out.push({ field: "game", label: "Pick a game to continue" });
  else if (m.kind === "custom") {
    const x = Boolean(m.x.trim());
    const y = Boolean(m.y.trim());
    if (!x && !y) out.push({ field: "team-x", label: "Add both teams to continue" });
    else if (!x) out.push({ field: "team-x", label: "Add the away team to continue" });
    else if (!y) out.push({ field: "team-y", label: "Add the home team to continue" });
    if (d.kickoff != null && kickoffProblem(d.kickoff, d.now ?? Date.now())) {
      out.push({ field: "kickoff", label: `Pick another ${wordsFor(matchupKind(m)).startLower} to continue` });
    }
  }
  const prize = firstPrizeProblem(d.format);
  if (prize) out.push({ field: "prize", key: prize.key, label: "Fix the prize note to continue" });
  if (d.hostName !== null && !d.hostName.trim()) out.push({ field: "host", label: "Add your name to continue" });
  if (d.name && mentionsMoney(d.name)) out.push({ field: "name", label: "Change the board name to continue" });
  return out;
}

/** The first thing stopping Create, in the flow's order. */
export function firstBlocker(d: BlockerInput): CreateBlocker | null {
  return blockersOf(d)[0] ?? null;
}

