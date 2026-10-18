// Turns live board activity into short in-app announcements (the board's
// activity feed, and the raw material for live alerts in alerts.ts). Pure:
// everything comes from the activity and the board state, so it is unit-tested
// in activity.test.ts.
//
// Rules of thumb:
// - Never announce my own actions (I just did it; the UI already reacted).
//   Winners are the exception: a win is news even when I typed the score.
// - Be specific: names, counts, labels, "only 6 left".
// - One vocabulary for periods, the app's (periodPhrase in shared/formats.ts):
//   chips say "Q1", "Half", "Final"; sentences say "at the end of Q1",
//   "at halftime", "at the final whistle", "on score 3".
// - Group bursts: a run of claims by one person reads "Maya grabbed 2 more · 5 total".
// - Skip noise: releases only matter when the board is nearly full, and a score
//   that produced a winner is announced by the winner line instead.
// - Say whose news it is (`subject`): mine for "You…", the winner's for
//   "Dre wins at the end of Q3", the board's for system news. Never the host who typed it.

import { drawFor, myWins, resolveResults, squaresLeft, winCounts } from "../../../shared/squares";
import { SHARED_DRAW_KEY, drawKeys, periodPhrase } from "../../../shared/formats";
import type { Activity, ActivityType, GameState, Team } from "../../../shared/types";

/** Who the news is about, which decides the avatar an alert wears. */
export type AlertSubject =
  | { kind: "me" }
  | { kind: "player"; id: string }
  /** The game itself (numbers drawn, a score, the final whistle): wears the board's glyph. */
  | { kind: "system"; glyph: "numbers" | "score" | "winner" | "final" | "board" };

/** Rich detail an alert can show as a chip next to its text. */
export type AlertChip =
  /** The score at that moment, team-colored: "DAL 28 – 20 NYG". */
  | { kind: "score"; scoreX: number; scoreY: number; label: string }
  /** My squares' numbers as team-labeled pairs, like the board's Your numbers. */
  | { kind: "numbers"; pairs: NumberPair[]; more: number };

export interface NumberPair {
  /** Digit(s) for the column team (X) and the row team (Y). */
  x: string;
  y: string;
  row: number;
  col: number;
}

export interface ActivityAnnouncement {
  /** The full sentence (the feed, and anything that shows one line of text). */
  text: string;
  tone: "info" | "live" | "win";
  haptic?: "light" | "medium" | "heavy" | "success" | "warning" | "selection";
  /** Fire confetti (e.g. my square won). */
  celebrate?: boolean;
  /** Whose news this is. */
  subject?: AlertSubject;
  /** Score or numbers to show as a chip. */
  chip?: AlertChip;
  /** The square this is about (a win, my first square); a tap can jump there. */
  cell?: { row: number; col: number };
}

/** Claims by the same person this close together read as one burst. */
export const BURST_WINDOW_MS = 2 * 60_000;
/** At or below this many open squares, claims and releases mention what's left. */
export const SCARCE_LEFT = 10;
/** Player counts worth a shout when someone joins. */
const PLAYER_MILESTONES = new Set([5, 10, 15, 20, 25, 30, 40, 50]);

type Data = Record<string, unknown>;

// ---- small readers (activity data is loosely typed; legacy rows may be missing fields) ----

export const str = (v: unknown): string | null => (typeof v === "string" && v.trim() ? v.trim() : null);
export const int = (v: unknown, fallback: number): number => (typeof v === "number" && Number.isFinite(v) ? Math.trunc(v) : fallback);
export const ids = (v: unknown): string[] =>
  Array.isArray(v) ? [...new Set(v.filter((x): x is string => typeof x === "string" && x.length > 0))] : [];

export function cellOf(v: unknown): { row: number; col: number } | undefined {
  if (!v || typeof v !== "object") return undefined;
  const { row, col } = v as Data;
  return typeof row === "number" && typeof col === "number" ? { row, col } : undefined;
}

export function nameOf(state: GameState, id: string | null): string {
  if (!id) return "Someone";
  return state.players.find((p) => p.id === id)?.name.trim() || "Someone";
}

/** "Maya", "Maya & Sam", "Maya, Sam & Lee". */
export function joinNames(names: string[]): string {
  if (names.length <= 1) return names[0] ?? "";
  return `${names.slice(0, -1).join(", ")} & ${names[names.length - 1]}`;
}

export const teamShort = (t: Team): string => t.abbr?.trim() || t.name;

/** A period mid-sentence with a leading space (" at halftime", " on score 3"), or "" when there's nothing to say. */
export function atMoment(periodKey: string, label: string): string {
  const { moment } = periodPhrase(periodKey, label);
  return moment ? ` ${moment}` : "";
}

/** "at halftime" -> "At halftime", for a moment that starts a line. */
export function capitalize(text: string): string {
  return text ? text[0].toUpperCase() + text.slice(1) : text;
}

/** Stable pick between phrasings, so the same activity always reads the same. */
function variant<T>(seed: string, options: readonly T[]): T {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (Math.imul(h, 31) + seed.charCodeAt(i)) | 0;
  return options[Math.abs(h) % options.length];
}

/** True when no activity of these types happened after `a` (so "right now" facts apply to it). */
export function isLatest(a: Activity, state: GameState, types: ActivityType[]): boolean {
  return !state.activity.some((x) => x.id !== a.id && types.includes(x.type) && x.at > a.at);
}

/** Another activity written in the same request (same timestamp), e.g. the winner that came with a score. */
export function sibling(a: Activity, state: GameState, type: ActivityType, match: (d: Data) => boolean = () => true): Activity | undefined {
  return state.activity.find((x) => x.id !== a.id && x.type === type && x.at === a.at && match(x.data as Data));
}

/** The recorded score for a period, if any. */
export function scoreChipFor(state: GameState, periodKey: string, label: string): AlertChip | undefined {
  const s = state.scores.find((x) => x.periodKey === periodKey);
  if (!s) return undefined;
  return { kind: "score", scoreX: s.scoreX, scoreY: s.scoreY, label: periodPhrase(periodKey, s.label ?? label).short };
}

// ---- per type ----

function joined(a: Activity, state: GameState): ActivityAnnouncement {
  const name = str((a.data as Data).name) ?? nameOf(state, a.actor);
  const count = state.players.length;
  const subject: AlertSubject | undefined = a.actor ? { kind: "player", id: a.actor } : undefined;
  if (isLatest(a, state, ["joined"]) && PLAYER_MILESTONES.has(count)) {
    return { text: `${name} joined. That's ${count} players! 🔥`, tone: "info", subject };
  }
  return { text: variant(a.id, [`${name} joined the board 👋`, `${name} pulled up 👋`, `${name} is in 👋`]), tone: "info", subject };
}

function claimed(a: Activity, state: GameState): ActivityAnnouncement {
  const who = nameOf(state, a.actor);
  const count = Math.max(1, int((a.data as Data).count, 1));
  const latest = isLatest(a, state, ["claimed", "released"]);
  const left = squaresLeft(state);
  const subject: AlertSubject | undefined = a.actor ? { kind: "player", id: a.actor } : undefined;
  // Scarcity is news only while people can still pick.
  const picking = state.game.status === "open";

  if (latest && left === 0) {
    const what = count === 1 ? "the last square" : `the last ${count} squares`;
    return { text: `${who} grabbed ${what}. Board's full! 🔥`, tone: "live", haptic: "medium", subject };
  }

  // Earlier claims by the same person in this burst.
  const before = state.activity
    .filter((x) => x.id !== a.id && x.type === "claimed" && x.actor === a.actor && x.at <= a.at && a.at - x.at <= BURST_WINDOW_MS)
    .reduce((n, x) => n + Math.max(1, int((x.data as Data).count, 1)), 0);

  let text: string;
  if (before > 0) text = count === 1 ? `${who} grabbed another square` : `${who} grabbed ${count} more squares`;
  else text = count === 1 ? `${who} grabbed a square` : `${who} grabbed ${count} squares`;

  if (latest && picking && left <= SCARCE_LEFT) text += ` · only ${left} left`;
  else if (before > 0) text += ` · ${before + count} total`;
  return { text, tone: "info", subject };
}

function released(a: Activity, state: GameState): ActivityAnnouncement | null {
  const left = squaresLeft(state);
  // Only news when squares are scarce and still up for grabs; otherwise it's noise.
  if (state.game.status !== "open" || !isLatest(a, state, ["claimed", "released"]) || left === 0 || left > SCARCE_LEFT) return null;
  const count = Math.max(1, int((a.data as Data).count, 1));
  const what = count === 1 ? "a square" : `${count} squares`;
  return {
    text: `${nameOf(state, a.actor)} freed up ${what} 👀 Grab it fast`,
    tone: "info",
    subject: a.actor ? { kind: "player", id: a.actor } : undefined,
  };
}

/** My squares' numbers for the first draw, in board order; [] before the draw, null on 5x5 boards (two digits per line). */
export function myNumbers(state: GameState, me: string): NumberPair[] | null {
  const draw = drawFor(state.game, drawKeys(state.game.format)[0] ?? SHARED_DRAW_KEY);
  if (!draw) return [];
  if (state.game.format.boardSize === 25) return null;
  return state.squares
    .filter((s) => s.playerId === me)
    .sort((x, y) => x.row - y.row || x.col - y.col)
    .map((s) => ({ x: String(draw.x[s.col]?.[0] ?? "?"), y: String(draw.y[s.row]?.[0] ?? "?"), row: s.row, col: s.col }));
}

/** My squares as team-labeled pairs, e.g. ["KC 7 · BUF 0"]; null on 5x5 boards. */
export function myNumberPairs(state: GameState, me: string): string[] | null {
  const pairs = myNumbers(state, me);
  if (!pairs) return null;
  const x = teamShort(state.game.teamX);
  const y = teamShort(state.game.teamY);
  return pairs.map((p) => `${x} ${p.x} · ${y} ${p.y}`);
}

/** How many number pairs an alert chip spells out before "+N". */
export const NUMBERS_IN_CHIP = 2;

function locked(a: Activity, state: GameState, me: string): ActivityAnnouncement {
  const kickoff = (a.data as Data).auto === true;
  const mineSquares = state.squares.filter((s) => s.playerId === me);
  const mine = mineSquares.length;
  const numbers = myNumbers(state, me);
  const labeled = myNumberPairs(state, me);
  const head = kickoff ? "Kickoff! Numbers are in" : "Numbers are in";
  if (mine > 0 && numbers && labeled && numbers.length > 0) {
    // Short enough for one line ("Your numbers: GB 3 · CHI 0 +2 more"); the alert's chip spells out the rest.
    const text = `${kickoff ? "Kickoff! " : ""}Your numbers: ${labeled[0]}${labeled.length > 1 ? ` +${labeled.length - 1} more` : ""}`;
    return {
      text,
      tone: "live",
      haptic: "medium",
      subject: { kind: "me" },
      chip: { kind: "numbers", pairs: numbers.slice(0, NUMBERS_IN_CHIP), more: Math.max(0, numbers.length - NUMBERS_IN_CHIP) },
      cell: { row: numbers[0].row, col: numbers[0].col },
    };
  }
  const tail = mine === 0 ? "" : mine === 1 ? " Find your square" : ` Find your ${mine} squares`;
  const first = [...mineSquares].sort((x, y) => x.row - y.row || x.col - y.col)[0];
  return {
    text: `${head} 🔢${tail}`,
    tone: "live",
    haptic: "medium",
    subject: mine > 0 ? { kind: "me" } : { kind: "system", glyph: "numbers" },
    cell: first ? { row: first.row, col: first.col } : undefined,
  };
}

function score(a: Activity, state: GameState): ActivityAnnouncement | null {
  const d = a.data as Data;
  const periodKey = str(d.periodKey) ?? "";
  // The winner line covers this moment (and names the person, which is the news).
  if (sibling(a, state, "winner", (w) => w.periodKey === periodKey)) return null;
  const { teamX, teamY } = state.game;
  const scoreX = int(d.scoreX, 0);
  const scoreY = int(d.scoreY, 0);
  const line = `${teamShort(teamX)} ${scoreX}–${scoreY} ${teamShort(teamY)}`;
  const label = str(d.label) ?? periodKey;
  const phrase = periodPhrase(periodKey, label);
  let lead: string;
  if (/^s\d+$/.test(periodKey)) lead = "Score!";
  else if (periodKey === "final") lead = "Final:";
  else lead = phrase.moment ? `${capitalize(phrase.moment)}:` : "Score:";
  return {
    text: `${lead} ${line}`,
    tone: "live",
    haptic: "light",
    subject: { kind: "system", glyph: "score" },
    chip: { kind: "score", scoreX, scoreY, label: phrase.short },
  };
}

function winner(a: Activity, state: GameState, me: string): ActivityAnnouncement {
  const d = a.data as Data;
  const periodKey = str(d.periodKey) ?? "";
  const label = str(d.label) ?? periodKey;
  const when = atMoment(periodKey, label);
  const winners = ids(d.playerIds);
  const cell = cellOf(d.cell);
  const chip = scoreChipFor(state, periodKey, label);

  if (winners.includes(me)) {
    const others = winners.filter((id) => id !== me).map((id) => nameOf(state, id));
    const prize = str(d.prize);
    const text = others.length
      ? `You and ${joinNames(others)} both hit${when}! 🎉`
      : `Your square hit${when}! 🎉${prize ? ` ${prize}` : ""}`;
    return { text, tone: "win", haptic: "success", celebrate: true, subject: { kind: "me" }, chip, cell };
  }
  if (winners.length === 0) {
    return { text: `Nobody had the winning square${when}`, tone: "info", subject: { kind: "system", glyph: "winner" }, chip, cell };
  }
  const names = joinNames(winners.map((id) => nameOf(state, id)));
  return {
    text: `${names} ${winners.length > 1 ? "win" : "wins"}${when} 🎉`,
    tone: "win",
    haptic: "light",
    subject: { kind: "player", id: winners[0] },
    chip,
    cell,
  };
}

/** "Q1, Half & Q3" for the periods I won (or "4 times" when it's a lot). */
export function myWinsPhrase(state: GameState, me: string): string | null {
  const wins = [...new Set(myWins(resolveResults(state), me).map((w) => periodPhrase(w.periodKey, w.label).short))];
  if (wins.length === 0) return null;
  return wins.length > 3 ? `${wins.length} times` : joinNames(wins);
}

function final(state: GameState, me: string): ActivityAnnouncement {
  const results = resolveResults(state);
  const what = myWinsPhrase(state, me);
  const finalScore = scoreChipFor(state, "final", "Final");
  if (what) {
    return { text: `That's a wrap! 🏁 You won ${what}`, tone: "win", haptic: "success", celebrate: true, subject: { kind: "me" }, chip: finalScore };
  }
  const counts = Object.entries(winCounts(results)).sort((x, y) => y[1] - x[1]);
  const [top, next] = counts;
  if (top && top[1] >= 2 && (!next || next[1] < top[1])) {
    return {
      text: `That's a wrap! 🏁 ${nameOf(state, top[0])} won ${top[1]} times`,
      tone: "live",
      haptic: "medium",
      subject: { kind: "player", id: top[0] },
      chip: finalScore,
    };
  }
  return { text: "That's a wrap! 🏁 See who won each round", tone: "live", haptic: "medium", subject: { kind: "system", glyph: "final" }, chip: finalScore };
}

/** null = don't announce (e.g. my own action, or noise). */
export function describeActivity(activity: Activity, state: GameState, myPlayerId: string): ActivityAnnouncement | null {
  const mine = !!activity.actor && activity.actor === myPlayerId;
  if (mine && activity.type !== "winner") return null;
  switch (activity.type) {
    case "created":
      return { text: `${nameOf(state, activity.actor)} opened the board 🏈`, tone: "info", subject: { kind: "system", glyph: "board" } };
    case "joined":
      return joined(activity, state);
    case "claimed":
      return claimed(activity, state);
    case "released":
      return released(activity, state);
    case "locked":
      return locked(activity, state, myPlayerId);
    case "score":
      return score(activity, state);
    case "winner":
      return winner(activity, state, myPlayerId);
    case "final":
      return final(state, myPlayerId);
    case "rules":
      // The host changed who wins or the prizes: worth a look before (and during) the game. Never pushed.
      return {
        text: (activity.data as Data).scoring === true ? `${nameOf(state, activity.actor)} changed the rules` : `${nameOf(state, activity.actor)} updated the prizes`,
        tone: "info",
        subject: activity.actor ? { kind: "player", id: activity.actor } : { kind: "system", glyph: "board" },
      };
    default:
      return null;
  }
}
