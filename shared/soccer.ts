// Goal-minute soccer squares: each square is a minute of the match. A row is
// the minute's tens digit and a column its ones digit, both drawn like any
// board's numbers (each digit once per axis), so the 43rd minute's square is
// where row 4's number meets column 3's. Squares win at the first goal's
// minute, every goal's and the last goal's (shared/sports.ts `momentsFor`);
// the team that scores doesn't matter, only the minute.
//
// The minute on the board (`boardMinute`):
//   - 1st-half stoppage time counts as the 45th minute (45+2' is 45), so the
//     40s row is 40'-44', the 45th minute with its stoppage time, then 46'-49';
//   - 2nd-half stoppage time runs on (90+3' is 93), filling the 90s row;
//   - extra time keeps its last two digits (105' is 05, 118' is 18), its
//     1st-half stoppage time counting as the 105th (105+1' is 05);
//   - no goals by the final whistle: square 00 wins each goal moment once.
// Penalty-shootout kicks aren't goals. A goal's minute is stored with it
// (Score.minute / Score.added); the square is derived on read. Pure, shared
// by the Worker and the app, unit-tested in soccer.test.ts.

import { everyScoreIndex } from "./formats";
import type { LiveGoal, NumberDraw, Score } from "./types";

/** Highest minute a goal can be typed at (extra time, its stoppage time included). */
export const MINUTE_MAX = 130;
/** Most stoppage time a goal can be typed with. */
export const ADDED_MAX = 30;
/** The square that wins a goal moment when the match ends without a goal. */
export const NO_GOALS_MINUTE = 0;
/** How a goal moment won by square 00 (a match without goals) reads. */
export const NO_GOALS_LABEL = "No goals";

/** Minutes whose stoppage time counts as the minute itself: the end of each first half. */
const HALF_ENDS = new Set([45, 105]);

/** The nth goal's period label ("Goal 2"). */
export function goalLabel(n: number): string {
  return `Goal ${n}`;
}

/**
 * The minute's square on the board, 0-99: 45+2' is 45, 90+3' is 93, 105' is
 * 05, 105+1' is 05 and 120+2' is 22 (the last two digits).
 */
export function boardMinute(minute: number, added = 0): number {
  const m = Math.max(0, Math.trunc(minute) || 0);
  const a = Math.max(0, Math.trunc(added) || 0);
  return (HALF_ENDS.has(m) ? m : m + a) % 100;
}

/** A board minute as its square reads: "05", "43", "00". */
export function squareMinute(minute: number): string {
  return String(((Math.trunc(minute) % 100) + 100) % 100).padStart(2, "0");
}

/** A goal's minute as a match shows it: "43'", "45+2'", "90+4'". */
export function minuteText(minute: number, added = 0): string {
  const a = Math.max(0, Math.trunc(added) || 0);
  return a > 0 ? `${minute}+${a}'` : `${minute}'`;
}

/** A recorded goal's minute as a match shows it, or null when it has none. */
export function goalMinuteText(score: Pick<Score, "minute" | "added"> | null | undefined): string | null {
  return typeof score?.minute === "number" ? minuteText(score.minute, score.added ?? 0) : null;
}

/** "45'+2'", "45+2'", "34'", "90'+4" -> the minute and its stoppage time; null for anything else ("HT", "FT"). */
export function parseMinute(text: string | null | undefined): { minute: number; added: number } | null {
  const m = /^\s*(\d{1,3})\s*'?\s*(?:\+\s*(\d{1,2})\s*'?)?\s*$/.exec(text ?? "");
  if (!m) return null;
  const minute = Number(m[1]);
  const added = m[2] ? Number(m[2]) : 0;
  return minute <= MINUTE_MAX && added <= ADDED_MAX ? { minute, added } : null;
}

/** The tens digit (the row's number) and the ones digit (the column's) of a board minute. */
export function minuteDigits(minute: number): { tens: number; ones: number } {
  const m = ((Math.trunc(minute) % 100) + 100) % 100;
  return { tens: Math.floor(m / 10), ones: m % 10 };
}

/** The square for a board minute: the row holding its tens digit, the column holding its ones digit. */
export function minuteCell(minute: number, draw: NumberDraw): { row: number; col: number } | null {
  const { tens, ones } = minuteDigits(minute);
  const col = draw.x.findIndex((digits) => digits.includes(ones));
  const row = draw.y.findIndex((digits) => digits.includes(tens));
  return col === -1 || row === -1 ? null : { row, col };
}

/** The reverse square: the minute's digits swapped (43' -> the 34th minute's square). */
export function reverseMinuteCell(minute: number, draw: NumberDraw): { row: number; col: number } | null {
  const { tens, ones } = minuteDigits(minute);
  return minuteCell(ones * 10 + tens, draw);
}

/** A recorded goal's board minute (a goal saved without one reads as 00). */
export function goalBoardMinute(score: Pick<Score, "minute" | "added">): number {
  return boardMinute(score.minute ?? NO_GOALS_MINUTE, score.added ?? 0);
}

/** The goals (entries s1..sN) in order, whatever order they're stored in. */
export function goalsOf<T extends Pick<Score, "periodKey">>(scores: readonly T[]): T[] {
  return scores
    .filter((s) => everyScoreIndex(s.periodKey) !== null)
    .sort((a, b) => (everyScoreIndex(a.periodKey) ?? 0) - (everyScoreIndex(b.periodKey) ?? 0));
}

/** One goal to record: its entry key and label, the score after it, and its minute. */
export interface GoalEntry {
  periodKey: string;
  label: string;
  scoreX: number;
  scoreY: number;
  minute: number;
  added: number;
}

/**
 * What the feed's goals change on a board: goal n is entry s<n>, with the
 * score after it. An entry the feed doesn't have yet, or has at another
 * minute or score, is (re)written; a host-entered one is never touched. Only
 * once the feed's goals add up to its score (`settled`) are the feed's own
 * entries past its last goal taken back (a goal ruled out): a goal can show
 * in the score before it shows in the list, and the other way round.
 */
export function goalsFromFeed(
  scores: readonly Score[],
  goals: readonly LiveGoal[],
  live: { scoreX: number; scoreY: number },
): { entries: GoalEntry[]; retracted: string[] } {
  const by = new Map(scores.map((s) => [s.periodKey, s]));
  const entries: GoalEntry[] = [];
  let x = 0;
  let y = 0;
  goals.forEach((g, i) => {
    if (g.team === "x") x++;
    else y++;
    const periodKey = `s${i + 1}`;
    const cur = by.get(periodKey);
    if (cur?.source === "host") return;
    if (cur && cur.minute === g.minute && (cur.added ?? 0) === g.added && cur.scoreX === x && cur.scoreY === y) return;
    entries.push({ periodKey, label: goalLabel(i + 1), scoreX: x, scoreY: y, minute: g.minute, added: g.added });
  });
  const settled = goals.length === live.scoreX + live.scoreY;
  const retracted = settled
    ? goalsOf(scores)
        .filter((s) => s.source === "live" && (everyScoreIndex(s.periodKey) ?? 0) > goals.length)
        .map((s) => s.periodKey)
        .reverse()
    : [];
  return { entries, retracted };
}

/**
 * The periods a soccer board's new or changed scores decide: a goal its own
 * entry, the first goal also the "first" moment; the full-time score the
 * last goal ("final"), and, with no goals, the first goal and goal 1 (square
 * 00 takes them).
 */
export function periodsDecidedBy(changedKeys: readonly string[], scores: readonly Pick<Score, "periodKey">[]): string[] {
  const out = new Set<string>();
  const noGoals = goalsOf(scores).length === 0;
  for (const key of changedKeys) {
    out.add(key);
    if (key === "s1") out.add("first");
    if (key === "final" && noGoals) {
      out.add("first");
      out.add("s1");
    }
  }
  return [...out];
}
