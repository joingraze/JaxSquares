// Pure helpers for the host tools: what the host should do next, score entry
// (keypad, quick adds, who would win before saving), the edit form diff and the
// number-draw reveal. No React and no IO so the rules are unit-tested.

import {
  PRIZE_MAX_LENGTH,
  SHARED_DRAW_KEY,
  everyScoreIndex,
  everyScorePeriod,
  periodsFor,
  prizeFor,
  validatePrizeNote,
} from "../../../shared/formats";
import {
  boardPeriods,
  cellKey,
  drawFor,
  resolveResults,
  reverseCell,
  totalSquares,
  upcomingPeriod,
  winningCell,
  type Cell,
  type PeriodResult,
} from "../../../shared/squares";
import type { Game, GameState, ManualWinner, NumberDraw, Score, UpdateGameInput } from "../../../shared/types";

/** Highest score the API accepts. */
export const MAX_SCORE = 999;

/** periodKey that appends a new entry on every-score boards. */
export const NEXT_ENTRY = "next";

// ---- What the host should do next ----

export type HostActionKind = "setup" | "invite" | "lock" | "score" | "auto" | "final";

export interface HostAction {
  kind: HostActionKind;
  /** Short label for the host bar's pill, e.g. "Lock & draw". */
  label: string;
}

export interface HostSummary {
  /** One-line status for the host bar, e.g. "58 of 100 taken · 6 players". */
  status: string;
  /** 0..1 fill for the bar's meter (squares taken while open, periods decided after). */
  progress: number;
  action: HostAction;
}

export function claimedOf(state: Pick<GameState, "game" | "squares">): { claimed: number; total: number } {
  return { claimed: state.squares.length, total: totalSquares(state.game.format.boardSize) };
}

/** True when scores come from the live feed (the host can still override). */
export function isLinked(game: Pick<Game, "linkedEvent">): boolean {
  return game.linkedEvent !== null;
}

export function hostSummary(state: GameState): HostSummary {
  const { game } = state;
  const { claimed, total } = claimedOf(state);
  const players = state.players.length;
  const playersText = `${players} ${players === 1 ? "player" : "players"}`;

  if (game.status === "draft") {
    return { status: "Edit details while it opens", progress: 0, action: { kind: "setup", label: "Manage" } };
  }
  if (game.status === "open") {
    const full = claimed >= total;
    // Half full or more: locking is the move. Before that, getting people in is.
    const ready = full || claimed / total >= 0.5;
    return {
      status: full ? "Board's full. Draw time!" : ready ? `Ready to lock · ${playersText}` : `${playersText} · keep inviting`,
      progress: claimed / total,
      action: ready ? { kind: "lock", label: "Lock & draw" } : { kind: "invite", label: "Invite" },
    };
  }
  if (game.status === "final") {
    const results = resolveResults(state);
    return {
      status: `Final · ${results.length} ${results.length === 1 ? "prize" : "prizes"} decided`,
      progress: 1,
      action: { kind: "final", label: "Results" },
    };
  }

  // Locked.
  const everyScore = game.format.periods === "every-score";
  const recorded = everyScore ? state.scores.length : decidedCount(state);
  const periods = everyScore ? 0 : boardPeriods(game, state.scores).length;
  const status = everyScore
    ? `${recorded} ${recorded === 1 ? "score" : "scores"} so far`
    : `${recorded} of ${periods} ${isLinked(game) ? "decided" : "prizes decided"}`;
  const progress = everyScore ? 0 : periods ? recorded / periods : 0;
  if (isLinked(game)) {
    return {
      status: recorded === 0 ? "Scores update automatically" : `${status} · auto-scored`,
      progress,
      action: { kind: "auto", label: "Scores" },
    };
  }
  if (everyScore) return { status, progress, action: { kind: "score", label: "Add score" } };
  const next = upcomingPeriod(state);
  return { status, progress, action: { kind: "score", label: next ? `${next.label} score` : "Scores" } };
}

function decidedCount(state: Pick<GameState, "game" | "scores" | "manualWinners">): number {
  const done = new Set([...state.scores.map((s) => s.periodKey), ...state.manualWinners.map((m) => m.periodKey)]);
  return boardPeriods(state.game, state.scores).filter((p) => done.has(p.key)).length;
}

// ---- Locking ----

export interface LockFacts {
  claimed: number;
  total: number;
  empty: number;
  players: number;
  /** Players who joined but haven't picked a square yet. */
  idle: number;
}

export function lockFacts(state: GameState): LockFacts {
  const { claimed, total } = claimedOf(state);
  const owners = new Set(state.squares.map((s) => s.playerId));
  return {
    claimed,
    total,
    empty: total - claimed,
    players: state.players.length,
    idle: state.players.filter((p) => !owners.has(p.id)).length,
  };
}

// ---- Score entry ----

export interface ScoreTarget {
  /** Period key to send ("q1", "s3", or NEXT_ENTRY for a new every-score entry). */
  key: string;
  label: string;
  existing: Score | null;
}

/** Periods the host can type a score for, in board order (every-score: entries, then a new one). */
export function scoreTargets(state: Pick<GameState, "game" | "scores">): ScoreTarget[] {
  const { game, scores } = state;
  const by = new Map(scores.map((s) => [s.periodKey, s]));
  if (game.format.periods !== "every-score") {
    return boardPeriods(game, scores).map((p) => ({ key: p.key, label: p.label, existing: by.get(p.key) ?? null }));
  }
  const entries = boardPeriods(game, scores).map((p) => ({ key: p.key, label: p.label, existing: by.get(p.key) ?? null }));
  const n = entries.reduce((m, e) => Math.max(m, everyScoreIndex(e.key) ?? 0), 0);
  return [...entries, { key: NEXT_ENTRY, label: everyScorePeriod(n + 1).label, existing: null }];
}

/** The period the keypad should open on: the next one without a result (every-score: a new entry). */
export function defaultTargetKey(state: Pick<GameState, "game" | "squares" | "scores" | "manualWinners">): string {
  const { game } = state;
  if (game.format.periods === "every-score") return NEXT_ENTRY;
  const next = upcomingPeriod(state);
  if (next) return next.key;
  const periods = boardPeriods(game, state.scores);
  return periods[periods.length - 1]?.key ?? "final";
}

/** The real period key a target writes to (NEXT_ENTRY -> "sN"). */
export function resolvedKey(state: Pick<GameState, "game" | "scores">, key: string): string {
  if (key !== NEXT_ENTRY) return key;
  const n = state.scores.reduce((m, s) => Math.max(m, everyScoreIndex(s.periodKey) ?? 0), 0);
  return everyScorePeriod(n + 1).key;
}

/** Latest score recorded before `key` (scores only go up, so it's a good starting point). */
function previousScore(state: Pick<GameState, "game" | "scores">, key: string): Score | null {
  const targets = scoreTargets(state);
  const idx = targets.findIndex((t) => t.key === key);
  for (let i = (idx === -1 ? targets.length : idx) - 1; i >= 0; i--) {
    const s = targets[i].existing;
    if (s) return s;
  }
  return null;
}

export interface ScoreDraft {
  x: string;
  y: string;
}

/**
 * What the keypad starts with: the recorded score when editing; otherwise the
 * live score (linked boards) or the last recorded one, since the game total
 * only climbs. Blank when there's nothing to go on.
 */
export function initialDraft(state: GameState, key: string): ScoreDraft {
  const existing = state.scores.find((s) => s.periodKey === key);
  if (existing) return { x: String(existing.scoreX), y: String(existing.scoreY) };
  if (state.live && state.live.state !== "pre") return { x: String(state.live.scoreX), y: String(state.live.scoreY) };
  const prev = previousScore(state, key);
  if (prev) return { x: String(prev.scoreX), y: String(prev.scoreY) };
  if (state.game.format.periods === "every-score") return { x: "0", y: "0" };
  return { x: "", y: "" };
}

export function parseScore(value: string): number | null {
  if (!/^\d{1,3}$/.test(value)) return null;
  const n = Number(value);
  return n <= MAX_SCORE ? n : null;
}

export type PadKey = "0" | "1" | "2" | "3" | "4" | "5" | "6" | "7" | "8" | "9" | "back" | "clear";

/**
 * Keypad press. `fresh` = the field was just focused, so the first digit
 * replaces what's there (like a calculator). Max three digits, no leading zeros.
 */
export function pressKey(value: string, key: PadKey, fresh: boolean): string {
  if (key === "clear") return "";
  if (key === "back") return fresh ? "" : value.slice(0, -1);
  if (fresh || value === "0" || value === "") return key;
  if (value.length >= 3) return value;
  return value + key;
}

/** Keeps only digits from typed/pasted text, without leading zeros, capped at three. */
export function cleanTyped(raw: string): string {
  const digits = raw.replace(/\D/g, "").replace(/^0+(?=\d)/, "");
  return digits.slice(0, 3);
}

/** Quick add (+7 touchdown, +3 field goal...) on top of the current value. */
export function addPoints(value: string, points: number): string {
  return String(Math.min(MAX_SCORE, (parseScore(value) ?? 0) + points));
}

/** Football scoring plays for every-score boards. */
export const QUICK_ADDS: readonly { points: number; label: string }[] = [
  { points: 7, label: "TD" },
  { points: 3, label: "FG" },
  { points: 2, label: "2PT" },
  { points: 1, label: "XP" },
];

export interface WinnerPreview {
  periodKey: string;
  cell: Cell;
  ownerId: string | null;
  reverse: { cell: Cell; ownerId: string | null } | null;
  /** Last digits that decide it. */
  digitX: number;
  digitY: number;
  prize: string | null;
  /** A host pick that will keep overriding the computed square. */
  manual: ManualWinner | null;
}

/** Who wins `key` if the host saves this score. null until numbers are drawn or the score is incomplete. */
export function previewWinner(state: GameState, key: string, draft: ScoreDraft): WinnerPreview | null {
  const scoreX = parseScore(draft.x);
  const scoreY = parseScore(draft.y);
  if (scoreX === null || scoreY === null) return null;
  const real = resolvedKey(state, key);
  const draw = drawFor(state.game, real === NEXT_ENTRY ? SHARED_DRAW_KEY : real);
  if (!draw) return null;
  const cell = winningCell({ scoreX, scoreY }, draw);
  if (!cell) return null;
  const owner = new Map(state.squares.map((s) => [cellKey(s.row, s.col), s.playerId]));
  const ownerOf = (c: Cell) => owner.get(cellKey(c.row, c.col)) ?? null;
  const rev = state.game.format.reverse ? reverseCell({ scoreX, scoreY }, draw) : null;
  return {
    periodKey: real,
    cell,
    ownerId: ownerOf(cell),
    reverse: rev && (rev.row !== cell.row || rev.col !== cell.col) ? { cell: rev, ownerId: ownerOf(rev) } : null,
    digitX: scoreX % 10,
    digitY: scoreY % 10,
    prize: prizeFor(state.game.prizes, real),
    manual: state.manualWinners.find((m) => m.periodKey === real) ?? null,
  };
}

/** Saving is allowed once both scores are valid and something changed. */
export function canSaveScore(state: GameState, key: string, draft: ScoreDraft): boolean {
  const x = parseScore(draft.x);
  const y = parseScore(draft.y);
  if (x === null || y === null) return false;
  if (key === NEXT_ENTRY) {
    // A new every-score entry must differ from the latest one (0-0 before the first score).
    const last = latestEntry(state.scores);
    return !(x === (last?.scoreX ?? 0) && y === (last?.scoreY ?? 0));
  }
  const existing = state.scores.find((s) => s.periodKey === key);
  return !existing || existing.scoreX !== x || existing.scoreY !== y;
}

export function latestEntry(scores: Score[]): Score | null {
  let best: Score | null = null;
  let max = 0;
  for (const s of scores) {
    const n = everyScoreIndex(s.periodKey);
    if (n !== null && n > max) {
      max = n;
      best = s;
    }
  }
  return best;
}

/** A new every-score entry that still equals the latest score (nothing to add yet). */
export function isUnchangedEntry(state: Pick<GameState, "scores">, key: string, draft: ScoreDraft): boolean {
  if (key !== NEXT_ENTRY) return false;
  const last = latestEntry(state.scores);
  return parseScore(draft.x) === (last?.scoreX ?? 0) && parseScore(draft.y) === (last?.scoreY ?? 0);
}

/** Saving the Final score of a typed-in board ends the game (server rule). */
export function saveEndsGame(game: Pick<Game, "status" | "linkedEvent">, key: string): boolean {
  return key === "final" && game.status === "locked" && game.linkedEvent === null;
}

// ---- Winners list ----

export interface WinnerRow {
  key: string;
  label: string;
  score: Score | null;
  result: PeriodResult | null;
  manual: boolean;
}

/**
 * Rows for the host's winners list: every decided period (fixed boards) or
 * entry (every-score), then the next undecided period, if any.
 */
export function winnerRows(state: GameState): WinnerRow[] {
  const results = resolveResults(state);
  const byKey = new Map(results.map((r) => [r.periodKey, r]));
  const manual = new Set(state.manualWinners.map((m) => m.periodKey));
  const scores = new Map(state.scores.map((s) => [s.periodKey, s]));
  const keys =
    state.game.format.periods === "every-score"
      ? results.map((r) => ({ key: r.periodKey, label: r.label }))
      : boardPeriods(state.game, state.scores).map((p) => ({ key: p.key, label: p.label }));
  const all = keys.map(({ key, label }) => ({
    key,
    label,
    score: scores.get(key) ?? null,
    result: byKey.get(key) ?? null,
    manual: manual.has(key),
  }));
  // Decided periods, plus the first one still open (so the host can always crown it by hand).
  const firstOpen = all.find((r) => !r.result);
  return all.filter((r) => r.result || r === firstOpen);
}

// ---- Edit board ----

export interface PrizeField {
  key: string;
  label: string;
}

/** Which prize notes the edit form shows: one per period, or one for every score. */
export function prizeFields(game: Pick<Game, "format" | "periods">): PrizeField[] {
  if (game.format.periods === "every-score") return [{ key: SHARED_DRAW_KEY, label: "Every score" }];
  const periods = game.periods.length ? game.periods : periodsFor(game.format.periods);
  return periods.map((p) => ({ key: p.key, label: p.label }));
}

export interface EditDraft {
  name: string;
  prizes: Record<string, string>;
  maxPerPlayer: number;
}

export function editDraftOf(game: Game): EditDraft {
  const prizes: Record<string, string> = {};
  for (const f of prizeFields(game)) prizes[f.key] = game.prizes[f.key] ?? "";
  return { name: game.name, prizes, maxPerPlayer: game.maxPerPlayer };
}

const tidy = (s: string) => s.replace(/\s+/g, " ").trim();

/** Inline error for a prize note (money is never allowed), or null. */
export function prizeError(note: string): string | null {
  const t = tidy(note);
  return t ? validatePrizeNote(t) : null;
}

export function editErrors(draft: EditDraft): { name: string | null; prizes: Record<string, string> } {
  const prizes: Record<string, string> = {};
  for (const [k, v] of Object.entries(draft.prizes)) {
    const e = prizeError(v);
    if (e) prizes[k] = e;
  }
  return { name: tidy(draft.name) ? null : "Give your board a name", prizes };
}

/** True when max squares per person can still change (the API refuses once locked). */
export function canEditMax(game: Pick<Game, "status">): boolean {
  return game.status === "draft" || game.status === "open";
}

/** The PATCH body for what changed, or null when nothing did. Keeps notes the form doesn't show. */
export function editPatch(game: Game, draft: EditDraft): UpdateGameInput | null {
  const out: UpdateGameInput = {};
  const name = tidy(draft.name);
  if (name && name !== game.name) out.name = name;

  const fields = prizeFields(game);
  let prizesChanged = false;
  const prizes: Record<string, string> = {};
  for (const [k, v] of Object.entries(game.prizes)) if (!fields.some((f) => f.key === k)) prizes[k] = v;
  for (const f of fields) {
    const note = tidy(draft.prizes[f.key] ?? "").slice(0, PRIZE_MAX_LENGTH).trim();
    if (note !== (game.prizes[f.key] ?? "")) prizesChanged = true;
    if (note) prizes[f.key] = note;
  }
  if (prizesChanged) out.prizes = prizes;

  if (canEditMax(game) && draft.maxPerPlayer !== game.maxPerPlayer) out.maxPerPlayer = draft.maxPerPlayer;
  return Object.keys(out).length ? out : null;
}

// ---- Number reveal ----

/** The draw the reveal shows: the shared one, or Q1's when numbers are fresh each quarter. */
export function revealDraw(game: Pick<Game, "numbers" | "format">): { key: string; draw: NumberDraw | null } {
  if (!game.numbers) return { key: SHARED_DRAW_KEY, draw: null };
  if (game.numbers[SHARED_DRAW_KEY]) return { key: SHARED_DRAW_KEY, draw: game.numbers[SHARED_DRAW_KEY] };
  const key = Object.keys(game.numbers).sort((a, b) => order(a) - order(b))[0];
  return { key, draw: game.numbers[key] ?? null };
}

const ORDER = ["q1", "q2", "q3", "final"];
const order = (k: string) => (ORDER.includes(k) ? ORDER.indexOf(k) : 99);

/** "7–3" style pairs for a player's squares under a draw (x digit(s), y digit(s)). */
export function numbersFor(
  state: Pick<GameState, "squares">,
  draw: NumberDraw,
  playerId: string,
): { x: string; y: string; key: string }[] {
  return state.squares
    .filter((s) => s.playerId === playerId)
    .sort((a, b) => a.row - b.row || a.col - b.col)
    .map((s) => ({ key: cellKey(s.row, s.col), x: (draw.x[s.col] ?? []).join("·"), y: (draw.y[s.row] ?? []).join("·") }));
}

/** Order the reels land in: across the top left to right, then down the side. */
export function landingOrder(n: number): { axis: "x" | "y"; index: number }[] {
  const out: { axis: "x" | "y"; index: number }[] = [];
  for (let i = 0; i < n; i++) out.push({ axis: "x", index: i });
  for (let i = 0; i < n; i++) out.push({ axis: "y", index: i });
  return out;
}
