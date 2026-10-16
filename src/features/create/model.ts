// Pure helpers for the create-board flow: team names, the auto board name,
// plain-language format copy and the request body. No React, no IO.

import { BOARD_SIZE_INFO, periodsFor, PRESET_INFO, PRIZE_MAX_LENGTH, SHARED_DRAW_KEY, validatePrizeNote } from "../../../shared/formats";
import { NFL_TEAMS, nflTeamToTeam, type NflTeam } from "../../../shared/teams";
import { pluralize, shortTeamName } from "../../lib/format";
import type {
  CreateGameInput,
  GameFormat,
  League,
  LinkedEvent,
  Period,
  PeriodsPreset,
  ScheduleEvent,
  Team,
} from "../../../shared/types";

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

function nflByAbbr(abbr: string | undefined): NflTeam | undefined {
  if (!abbr) return undefined;
  const a = abbr.toUpperCase();
  return NFL_TEAMS.find((t) => t.abbr === a);
}

/** Team colors from live data, keyed by NFL abbreviation ("GB" -> "#204e32"). */
export type TeamColors = Readonly<Record<string, string>>;

/**
 * What a typed custom team becomes: an exact NFL match (abbreviation, nickname,
 * full name, or an unambiguous city) is upgraded to the full team with its
 * abbreviation, and its color when this week's live schedule has it; anything
 * else is kept as typed. Null when blank.
 */
export function resolveCustomTeam(text: string, colors: TeamColors = {}): { team: Team; nfl: NflTeam | null } | null {
  const typed = text.trim().replace(/\s+/g, " ").slice(0, TEAM_NAME_MAX);
  if (!typed) return null;
  const nfl = matchNflTeam(typed);
  if (nfl) {
    const color = colors[nfl.abbr];
    return { team: color ? { ...nflTeamToTeam(nfl), color } : nflTeamToTeam(nfl), nfl };
  }
  return { team: { name: typed }, nfl: null };
}

/**
 * NFL team colors from the live schedule (the only place team colors come
 * from), so a typed "Packers" gets the same green as the linked GB @ CHI game.
 */
export function teamColorsFrom(events: readonly ScheduleEvent[]): TeamColors {
  const out: Record<string, string> = {};
  for (const e of events) {
    if (e.league !== "nfl") continue;
    for (const t of [e.home, e.away]) {
      const abbr = t.abbr?.toUpperCase();
      if (abbr && t.color && nflByAbbr(abbr)) out[abbr] = t.color;
    }
  }
  return out;
}

/** One-tap teams for a custom board, before anything is typed. */
export const POPULAR_TEAMS: readonly NflTeam[] = ["KC", "PHI", "DAL", "GB", "BUF", "SF", "DET", "BAL"]
  .map((abbr) => nflByAbbr(abbr))
  .filter((t): t is NflTeam => Boolean(t));

export function matchNflTeam(text: string): NflTeam | null {
  const q = text.trim().toLowerCase().replace(/\s+/g, " ");
  if (!q) return null;
  const exact = NFL_TEAMS.find(
    (t) => t.abbr.toLowerCase() === q || t.nickname.toLowerCase() === q || `${t.location} ${t.nickname}`.toLowerCase() === q,
  );
  if (exact) return exact;
  const byCity = NFL_TEAMS.filter((t) => t.location.toLowerCase() === q);
  return byCity.length === 1 ? byCity[0] : null;
}

/** The label a custom team shows on the board name: the nickname for an NFL match, else what was typed. */
export function customShortName(text: string): string {
  const resolved = resolveCustomTeam(text);
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
export function winnerCount(preset: PeriodsPreset): number | null {
  return preset === "every-score" ? null : periodsFor(preset).length;
}

/**
 * Short, stable tag for a format card: "4 winners", "1 winner", "1 winner per
 * score". Modifiers (reverse) don't change it; the summary shows their effect once.
 */
export function winnersTag(preset: PeriodsPreset): string {
  const n = winnerCount(preset);
  if (n === null) return "1 winner per score";
  return `${n} ${n === 1 ? "winner" : "winners"}`;
}

const WHEN: Record<PeriodsPreset, string> = {
  quarters: "after Q1, at halftime, after Q3 and at the final",
  halves: "at halftime and at the final",
  final: "at the final (overtime counts)",
  "every-score": "every time the score changes",
};

/**
 * The summary headline as two phrases that are each kept on one line:
 * { winners: "8 winners", size: "100 squares" }, or "2 winners every score".
 */
export function boardHeadlineParts(format: GameFormat): { winners: string; size: string } {
  const size = `${format.boardSize} squares`;
  const n = winnerCount(format.periods);
  if (n === null) return { winners: format.reverse ? "2 winners every score" : "A winner every score", size };
  const total = format.reverse ? n * 2 : n;
  return { winners: `${total} ${total === 1 ? "winner" : "winners"}`, size };
}

/** "4 winners · 100 squares", "8 winners · 25 squares", "A winner every score · 100 squares". */
export function boardHeadline(format: GameFormat): string {
  const { winners, size } = boardHeadlineParts(format);
  return `${winners} · ${size}`;
}

/**
 * Plain-language rules that follow every choice, e.g. "The square matching the
 * last digit of each team's score wins after Q1, at halftime, after Q3 and at
 * the final."
 */
export function describeBoard(format: GameFormat): string {
  let text = `The square matching the last digit of each team's score wins ${WHEN[format.periods]}.`;
  if (format.reverse) text += " Flip the digits and that square wins too.";
  if (format.boardSize === 25) text += " Two numbers per row and column.";
  if (format.freshNumbers && format.periods === "quarters") text += " New numbers every quarter.";
  return text;
}

/** One line for the details row and the checkout ticket: "Every quarter · 10×10 · Reverse". */
export function formatLine(format: GameFormat): string {
  const parts = [PRESET_INFO[format.periods].label, BOARD_SIZE_INFO[format.boardSize].short];
  if (format.reverse) parts.push("Reverse");
  if (format.freshNumbers && format.periods === "quarters") parts.push("New numbers each Q");
  return parts.join(" · ");
}

/** Prize-note slots for a format; every-score boards get one note for every score ("*"). */
export function prizeSlots(format: GameFormat): Period[] {
  if (format.periods === "every-score") return [{ key: SHARED_DRAW_KEY, label: "Every score" }];
  return periodsFor(format.periods);
}

/** Notes worth sending: trimmed, non-empty, only for this format's slots. */
export function cleanPrizes(format: GameFormat, notes: Record<string, string>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const slot of prizeSlots(format)) {
    const note = (notes[slot.key] ?? "").replace(/\s+/g, " ").trim().slice(0, PRIZE_MAX_LENGTH);
    if (note) out[slot.key] = note;
  }
  return out;
}

/** DOM id of a prize slot's input (the create page focuses it on a blocked submit). */
export const prizeInputId = (key: string) => `prize-${key === "*" ? "all" : key}`;

/** The details row's second line: "No square limit · No prizes yet". */
export function detailsSummary(format: GameFormat, maxPerPlayer: number, prizes: Record<string, string>): string {
  const prizeCount = Object.keys(cleanPrizes(format, prizes)).length;
  return [
    maxPerPlayer > 0 ? `Max ${pluralize(maxPerPlayer, "square")} each` : "No square limit",
    prizeCount > 0 ? pluralize(prizeCount, "prize") : "No prizes yet",
  ].join(" · ");
}

/** First prize slot whose note mentions money, with the message to show. */
export function firstPrizeProblem(format: GameFormat, notes: Record<string, string>): { key: string; message: string } | null {
  for (const slot of prizeSlots(format)) {
    const note = notes[slot.key] ?? "";
    const message = note.trim() ? validatePrizeNote(note) : null;
    if (message) return { key: slot.key, message };
  }
  return null;
}

// ---- Request body ----

export type Matchup =
  | { kind: "linked"; event: ScheduleEvent }
  | { kind: "custom"; x: string; y: string };

/** The two teams (and link) a matchup puts on the board, or null while incomplete. */
export function matchupTeams(
  m: Matchup | null,
  colors: TeamColors = {},
): { teamX: Team; teamY: Team; league: League; linkedEvent: LinkedEvent | null } | null {
  if (!m) return null;
  if (m.kind === "linked") {
    const o = orientEvent(m.event);
    return { ...withSideColors(o.teamX, o.teamY), league: m.event.league, linkedEvent: o.linkedEvent };
  }
  const x = resolveCustomTeam(m.x, colors);
  const y = resolveCustomTeam(m.y, colors);
  if (!x || !y) return null;
  return { ...withSideColors(x.team, y.team), league: "custom", linkedEvent: null };
}

/** Teams as the board will show them: a team without a color gets its side's color. */
export function withSideColors(teamX: Team, teamY: Team): { teamX: Team; teamY: Team } {
  return { teamX: { ...teamX, color: teamX.color ?? CUSTOM_X_COLOR }, teamY: { ...teamY, color: teamY.color ?? CUSTOM_Y_COLOR } };
}

/** Short names for the auto board name. */
export function matchupShortNames(m: Matchup | null): [string, string] | null {
  if (!m) return null;
  if (m.kind === "linked") {
    return [shortTeamName(m.event.away, m.event.league), shortTeamName(m.event.home, m.event.league)];
  }
  const x = customShortName(m.x);
  const y = customShortName(m.y);
  return x && y ? [x, y] : null;
}

export interface CreateDraft {
  matchup: Matchup | null;
  /** Live team colors for typed NFL teams (teamColorsFrom). */
  colors?: TeamColors;
  format: GameFormat;
  name: string;
  maxPerPlayer: number;
  prizes: Record<string, string>;
  host: { name: string; color: string; emoji: string };
}

/** The POST /api/games body, or null while the matchup is incomplete. */
export function buildCreateInput(d: CreateDraft): CreateGameInput | null {
  const teams = matchupTeams(d.matchup, d.colors);
  if (!teams) return null;
  const short = matchupShortNames(d.matchup);
  const name = d.name.trim().slice(0, BOARD_NAME_MAX) || (short ? boardNameFor(short[0], short[1]) : "") || "Squares";
  const format: GameFormat = { ...d.format, freshNumbers: d.format.freshNumbers && d.format.periods === "quarters" };
  const total = format.boardSize;
  return {
    name,
    sport: "football",
    league: teams.league,
    teamX: teams.teamX,
    teamY: teams.teamY,
    format,
    prizes: cleanPrizes(format, d.prizes),
    maxPerPlayer: Math.max(0, Math.min(total, Math.round(d.maxPerPlayer))),
    linkedEvent: teams.linkedEvent,
    host: { ...d.host, name: d.host.name.trim() },
  };
}

/** The first thing stopping Create, in page order, with the button's one-line ask. */
export type CreateBlocker =
  | { field: "game"; label: string }
  | { field: "team-x" | "team-y"; label: string }
  | { field: "host"; label: string }
  | { field: "prize"; key: string; label: string };

export function firstBlocker(d: {
  matchup: Matchup | null;
  /** Null when this device already has a name (the field isn't shown). */
  hostName: string | null;
  format: GameFormat;
  prizes: Record<string, string>;
}): CreateBlocker | null {
  const m = d.matchup;
  if (!m) return { field: "game", label: "Pick a game to continue" };
  if (m.kind === "custom") {
    const x = Boolean(m.x.trim());
    const y = Boolean(m.y.trim());
    if (!x && !y) return { field: "team-x", label: "Add both teams to continue" };
    if (!x) return { field: "team-x", label: "Add the away team to continue" };
    if (!y) return { field: "team-y", label: "Add the home team to continue" };
  }
  if (d.hostName !== null && !d.hostName.trim()) return { field: "host", label: "Add your name to continue" };
  const prize = firstPrizeProblem(d.format, d.prizes);
  if (prize) return { field: "prize", key: prize.key, label: "Fix the prize note to continue" };
  return null;
}

/** Stable key for a request body, so re-tapping Create reuses the same unpaid draft. */
export function inputSignature(input: CreateGameInput): string {
  const sortObj = (o: Record<string, string>) => Object.fromEntries(Object.entries(o).sort(([a], [b]) => a.localeCompare(b)));
  return JSON.stringify({ ...input, prizes: sortObj(input.prizes) });
}
