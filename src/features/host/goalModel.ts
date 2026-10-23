// A soccer board's score entry for the host (shared/soccer.ts): each goal is
// an entry with the team that scored and the minute the match showed, and
// full time ends the match (the last goal, or square 00 with no goals). Pure,
// unit-tested in goalModel.test.ts; GoalEntry.tsx draws it.

import { everyScoreIndex, ruleFor, rulesOf } from "../../../shared/formats";
import { ADDED_MAX, boardMinute, goalLabel, goalsOf, minuteCell, minuteText, MINUTE_MAX, parseMinute, reverseMinuteCell } from "../../../shared/soccer";
import { drawFor, resolveResults, squareAt, type Cell } from "../../../shared/squares";
import type { GameState, Score, ScoreInput } from "../../../shared/types";
import { NEXT_ENTRY } from "./hostModel";

export type GoalSide = "x" | "y";

/** What the host is typing: who scored, the minute and its stoppage time (blank: none). */
export interface GoalDraft {
  team: GoalSide | null;
  minute: string;
  added: string;
}

/** A recorded goal as the host's list shows it. */
export interface GoalRow {
  key: string;
  label: string;
  /** "43'", "45+2'". */
  minute: string;
  team: GoalSide;
  scoreX: number;
  scoreY: number;
}

/** The team a goal went to: the side whose score went up from the goal before it (team X on a tie, a correction). */
function teamOf(goal: Pick<Score, "scoreX" | "scoreY">, before: Pick<Score, "scoreX" | "scoreY"> | null): GoalSide {
  const dx = goal.scoreX - (before?.scoreX ?? 0);
  const dy = goal.scoreY - (before?.scoreY ?? 0);
  return dy > dx ? "y" : "x";
}

/** The board's goals in order, each with its team and minute. */
export function goalRows(state: Pick<GameState, "scores">): GoalRow[] {
  const goals = goalsOf(state.scores);
  return goals.map((g, i) => ({
    key: g.periodKey,
    label: g.label || goalLabel(everyScoreIndex(g.periodKey) ?? i + 1),
    minute: minuteText(g.minute ?? 0, g.added ?? 0),
    team: teamOf(g, goals[i - 1] ?? null),
    scoreX: g.scoreX,
    scoreY: g.scoreY,
  }));
}

/** A whole number from a field, within 0..max; null when blank or not one. */
function wholeIn(text: string, max: number): number | null {
  const t = text.trim();
  if (!/^\d{1,3}$/.test(t)) return null;
  const n = Number(t);
  return n <= max ? n : null;
}

/**
 * What the form starts with: an existing goal's team and minute when fixing
 * one; a new goal blank, its minute from the match clock on a linked board
 * whose game is on (the host can still change it).
 */
export function initialGoalDraft(state: Pick<GameState, "scores" | "live">, key: string): GoalDraft {
  const rows = goalRows(state);
  const row = rows.find((r) => r.key === key);
  if (row) {
    const goal = state.scores.find((s) => s.periodKey === key);
    return { team: row.team, minute: String(goal?.minute ?? ""), added: goal?.added ? String(goal.added) : "" };
  }
  const clock = state.live?.state === "in" ? parseMinute(state.live.clock) : null;
  return { team: null, minute: clock ? String(clock.minute) : "", added: clock?.added ? String(clock.added) : "" };
}

/** The draft's minute and stoppage time, or null while the minute is missing or out of range. */
export function draftMinute(draft: GoalDraft): { minute: number; added: number } | null {
  const minute = wholeIn(draft.minute, MINUTE_MAX);
  if (minute === null) return null;
  const added = draft.added.trim() === "" ? 0 : wholeIn(draft.added, ADDED_MAX);
  return added === null ? null : { minute, added };
}

/** Why the minute fields can't be saved yet (shown under them), or null. */
export function minuteProblem(draft: GoalDraft): string | null {
  if (draft.minute.trim() !== "" && wholeIn(draft.minute, MINUTE_MAX) === null) return `Minutes go from 0 to ${MINUTE_MAX}.`;
  if (draft.added.trim() !== "" && wholeIn(draft.added, ADDED_MAX) === null) return `Stoppage time goes up to ${ADDED_MAX}.`;
  return null;
}

/**
 * The score input this goal saves: the goal before it plus one for the team
 * that scored, with its minute. null until the team and a valid minute are in.
 */
export function goalInput(state: Pick<GameState, "scores">, key: string, draft: GoalDraft): ScoreInput | null {
  const at = draftMinute(draft);
  if (!draft.team || !at) return null;
  const goals = goalsOf(state.scores);
  const idx = key === NEXT_ENTRY ? goals.length : goals.findIndex((g) => g.periodKey === key);
  const before = idx > 0 ? goals[idx - 1] : null;
  const scoreX = (before?.scoreX ?? 0) + (draft.team === "x" ? 1 : 0);
  const scoreY = (before?.scoreY ?? 0) + (draft.team === "y" ? 1 : 0);
  return { periodKey: key, scoreX, scoreY, minute: at.minute, added: at.added };
}

/** Save turns on once a team and a minute are in, and (fixing a goal) something changed. */
export function canSaveGoal(state: Pick<GameState, "scores">, key: string, draft: GoalDraft): boolean {
  const input = goalInput(state, key, draft);
  if (!input) return false;
  const cur = state.scores.find((s) => s.periodKey === key);
  return !cur || cur.minute !== input.minute || (cur.added ?? 0) !== input.added || cur.scoreX !== input.scoreX || cur.scoreY !== input.scoreY;
}

/** Who a goal at the draft's minute would hand which moments to, before it's saved. */
export interface GoalPreview {
  /** As the match shows it: "43'", "45+2'". */
  text: string;
  /** The minute on the board (0-99). */
  minute: number;
  cell: Cell;
  ownerId: string | null;
  /** The moments it would decide ("1st goal", "Goal 2"), in game order. */
  wins: string[];
}

export function previewGoal(state: GameState, key: string, draft: GoalDraft): GoalPreview | null {
  const input = goalInput(state, key, draft);
  const draw = drawFor(state.game, "*");
  if (!input || !draw || input.minute === undefined) return null;
  const real = key === NEXT_ENTRY ? `s${goalsOf(state.scores).length + 1}` : key;
  const scores = [...state.scores.filter((s) => s.periodKey !== real), { ...input, periodKey: real, label: goalLabel(everyScoreIndex(real) ?? 1), source: "host" as const, updatedAt: 0 }];
  const after = resolveResults({ ...state, scores });
  const before = new Map(resolveResults(state).map((r) => [r.periodKey, r]));
  const minute = boardMinute(input.minute, input.added ?? 0);
  const rules = rulesOf(state.game.format);
  const reverseOnly = (k: string) => {
    const rule = k === "first" ? ruleFor(rules, "first") : ruleFor(rules, "score");
    return !!rule && !rule.square && !!rule.reverse;
  };
  const cell = (reverseOnly(real) ? reverseMinuteCell : minuteCell)(minute, draw);
  if (!cell) return null;
  // The moments this goal decides now: its own entry, and the first goal when it's goal 1.
  const wins = after
    .filter((r) => (r.periodKey === real || r.periodKey === "first") && r.goalMinute === minute && before.get(r.periodKey)?.goalMinute !== minute)
    .map((r) => r.label);
  return { text: minuteText(input.minute, input.added ?? 0), minute, cell, ownerId: squareAt(state.squares, cell.row, cell.col)?.playerId ?? null, wins };
}

/**
 * Full time on a board where the last goal wins: its final score (the latest
 * goal's, or the feed's when it's further on), which ends a typed-in board.
 * null where the last goal doesn't win: the host ends the board instead
 * (square 00 takes the goal moments when there were none).
 */
export function fullTimeInput(state: Pick<GameState, "game" | "scores" | "live">): ScoreInput | null {
  if (!ruleFor(rulesOf(state.game.format), "final")) return null;
  const last = goalsOf(state.scores).at(-1);
  return { periodKey: "final", scoreX: last?.scoreX ?? 0, scoreY: last?.scoreY ?? 0 };
}
