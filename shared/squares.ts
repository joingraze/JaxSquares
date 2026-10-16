// Pure squares logic: number drawing, winning cells, per-period results and
// dashboard helpers. No I/O or framework code, so the Worker and the client share
// it and it is unit-tested in isolation.

import {
  SHARED_DRAW_KEY,
  drawKeys,
  everyScoreIndex,
  everyScorePeriod,
  periodsFor,
  prizeFor,
} from "./formats";
import type {
  BoardSize,
  Game,
  GameFormat,
  GameState,
  LiveStatus,
  LiveUpdate,
  NumberDraw,
  Period,
  Score,
  Square,
} from "./types";

export interface Cell {
  row: number;
  col: number;
}

/** Classic grid dimension. Prefer gridSize(boardSize); kept for older callers. */
export const GRID_SIZE = 10;

/** Rows (= columns) on a board: 10 for 100 squares, 5 for 25. */
export function gridSize(boardSize: BoardSize): number {
  return boardSize === 25 ? 5 : 10;
}

export function totalSquares(boardSize: BoardSize): number {
  const n = gridSize(boardSize);
  return n * n;
}

/** Stable string key for a grid coordinate, e.g. "1,4". */
export const cellKey = (row: number, col: number): string => `${row},${col}`;

export function isValidCell(boardSize: BoardSize, row: number, col: number): boolean {
  const n = gridSize(boardSize);
  return Number.isInteger(row) && Number.isInteger(col) && row >= 0 && col >= 0 && row < n && col < n;
}

export function lastDigit(n: number): number {
  return ((Math.trunc(n) % 10) + 10) % 10;
}

/** Uniform [0, 1) from the platform CSPRNG (Workers, browsers and Node 22 all expose it). */
export function secureRandom(): number {
  return crypto.getRandomValues(new Uint32Array(1))[0] / 0x1_0000_0000;
}

/** Fisher–Yates shuffle into a new array. */
export function shuffle<T>(items: readonly T[], rng: () => number = secureRandom): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/** A shuffled permutation of 0..9. */
export function shuffledDigits(rng: () => number = secureRandom): number[] {
  return shuffle([0, 1, 2, 3, 4, 5, 6, 7, 8, 9], rng);
}

function drawAxis(perCell: number, rng: () => number): number[][] {
  const digits = shuffledDigits(rng);
  const out: number[][] = [];
  for (let i = 0; i < digits.length; i += perCell) out.push(digits.slice(i, i + perCell));
  return out;
}

/** One draw: every digit 0-9 appears exactly once per axis (pairs on 5x5 boards). */
export function drawOne(boardSize: BoardSize, rng: () => number = secureRandom): NumberDraw {
  const perCell = boardSize === 25 ? 2 : 1;
  return { x: drawAxis(perCell, rng), y: drawAxis(perCell, rng) };
}

/** All draws for a board being locked: one under "*", or one per quarter with fresh numbers. */
export function drawNumbers(format: GameFormat, rng: () => number = secureRandom): Record<string, NumberDraw> {
  const out: Record<string, NumberDraw> = {};
  for (const key of drawKeys(format)) out[key] = drawOne(format.boardSize, rng);
  return out;
}

/** The draw that decides a period (per-quarter draw when present, else the shared one). */
export function drawFor(game: Pick<Game, "numbers">, periodKey: string): NumberDraw | null {
  if (!game.numbers) return null;
  return game.numbers[periodKey] ?? game.numbers[SHARED_DRAW_KEY] ?? null;
}

/**
 * The square a score lands on: last digit of each team's score, mapped to the
 * column (team X) / row (team Y) whose digit list contains it.
 */
export function winningCell(score: Pick<Score, "scoreX" | "scoreY">, draw: NumberDraw): Cell | null {
  const xd = lastDigit(score.scoreX);
  const yd = lastDigit(score.scoreY);
  const col = draw.x.findIndex((digits) => digits.includes(xd));
  const row = draw.y.findIndex((digits) => digits.includes(yd));
  return col === -1 || row === -1 ? null : { row, col };
}

/**
 * The "reverse" square: the two digits swapped. It can be the same square as
 * the regular winner (e.g. 7-7, or on 5x5 when both digits share a pair); that
 * square then takes both.
 */
export function reverseCell(score: Pick<Score, "scoreX" | "scoreY">, draw: NumberDraw): Cell | null {
  return winningCell({ scoreX: score.scoreY, scoreY: score.scoreX }, draw);
}

/** Look up the square (if any) at a grid coordinate. */
export function squareAt(squares: Square[], row: number, col: number): Square | undefined {
  return squares.find((s) => s.row === row && s.col === col);
}

/** Squares owned by this player (public id). */
export function countClaimedBy(squares: Square[], playerId: string): number {
  return squares.reduce((n, s) => (s.playerId === playerId ? n + 1 : n), 0);
}

export function squaresLeft(state: Pick<GameState, "game" | "squares">): number {
  return Math.max(0, totalSquares(state.game.format.boardSize) - state.squares.length);
}

export function isBoardFull(state: Pick<GameState, "game" | "squares">): boolean {
  return squaresLeft(state) === 0;
}

// ---- Periods & results ----

/**
 * Periods shown on a board: the fixed ones, or for every-score boards one per
 * recorded score entry (s1..sN, in order).
 */
export function boardPeriods(game: Pick<Game, "format" | "periods">, scores: Score[]): Period[] {
  if (game.format.periods !== "every-score") {
    return game.periods.length > 0 ? game.periods : periodsFor(game.format.periods);
  }
  return scores
    .map((s) => ({ s, n: everyScoreIndex(s.periodKey) }))
    .filter((e): e is { s: Score; n: number } => e.n !== null)
    .sort((a, b) => a.n - b.n)
    .map(({ s, n }) => ({ key: s.periodKey, label: s.label || everyScorePeriod(n).label }));
}

export interface PeriodResult {
  periodKey: string;
  label: string;
  /** null only when the host picked a winner for a period with no recorded score. */
  score: Score | null;
  /** Winning square (the host's pick when overridden). */
  cell: Cell | null;
  /** Public player id owning `cell`, if claimed. */
  winnerPlayerId: string | null;
  /** Reverse square (reverse boards only); may equal `cell`. */
  reverseCell: Cell | null;
  reverseWinnerPlayerId: string | null;
  prize: string | null;
  /** "host" when the winner comes from a ManualWinner override. */
  source: "auto" | "host";
}

export type ResultsInput = Pick<GameState, "game" | "squares" | "scores" | "manualWinners">;

/**
 * Winners for every period that has a score or a host pick, in board order.
 * Empty until numbers are drawn. A ManualWinner replaces the computed square;
 * the reverse square still follows the recorded score.
 */
export function resolveResults(state: ResultsInput): PeriodResult[] {
  const { game, squares, scores, manualWinners } = state;
  if (!game.numbers) return [];

  const owner = new Map(squares.map((s) => [cellKey(s.row, s.col), s.playerId]));
  const ownerOf = (cell: Cell | null) => (cell ? (owner.get(cellKey(cell.row, cell.col)) ?? null) : null);
  const scoreBy = new Map(scores.map((s) => [s.periodKey, s]));
  const manualBy = new Map(manualWinners.map((m) => [m.periodKey, m]));

  let periods: Period[];
  if (game.format.periods === "every-score") {
    // A host pick may exist for an entry whose score was removed; keep it.
    const keys = new Set<string>();
    for (const k of [...scoreBy.keys(), ...manualBy.keys()]) if (everyScoreIndex(k) !== null) keys.add(k);
    periods = [...keys]
      .sort((a, b) => (everyScoreIndex(a) ?? 0) - (everyScoreIndex(b) ?? 0))
      .map((key) => ({ key, label: scoreBy.get(key)?.label || everyScorePeriod(everyScoreIndex(key) ?? 0).label }));
  } else {
    periods = boardPeriods(game, scores);
  }

  const out: PeriodResult[] = [];
  for (const p of periods) {
    const score = scoreBy.get(p.key) ?? null;
    const manual = manualBy.get(p.key);
    if (!score && !manual) continue;
    const draw = drawFor(game, p.key);
    const cell = manual ? { row: manual.row, col: manual.col } : score && draw ? winningCell(score, draw) : null;
    const rev = game.format.reverse && score && draw ? reverseCell(score, draw) : null;
    out.push({
      periodKey: p.key,
      label: p.label,
      score,
      cell,
      winnerPlayerId: ownerOf(cell),
      reverseCell: rev,
      reverseWinnerPlayerId: ownerOf(rev),
      prize: prizeFor(game.prizes, p.key),
      source: manual ? "host" : "auto",
    });
  }
  return out;
}

/** Public player ids that won a period (regular and reverse), deduplicated. */
export function winnersOf(result: PeriodResult): string[] {
  const ids = [result.winnerPlayerId, result.reverseWinnerPlayerId].filter((id): id is string => !!id);
  return [...new Set(ids)];
}

// ---- Live scores ----

/** A score to record for a completed fixed period. */
export interface PeriodScore {
  periodKey: string;
  label: string;
  scoreX: number;
  scoreY: number;
}

const PERIODS_COMPLETED_FOR: Record<string, number> = { q1: 1, q2: 2, q3: 3 };

function cumulative(linescores: number[], n: number): number {
  let total = 0;
  for (let i = 0; i < n; i++) {
    const v = Number(linescores[i]);
    if (Number.isFinite(v)) total += v;
  }
  return total;
}

/**
 * Cumulative scores for every fixed period a live update has completed.
 * Half = after 2 periods. Final only once the game is over and includes OT;
 * it uses the provider's game total, which is authoritative over linescores.
 * Every-score boards have no fixed periods (see nextEveryScoreEntry).
 */
export function periodScoresFromLinescores(format: GameFormat, update: LiveUpdate): PeriodScore[] {
  if (format.periods === "every-score") return [];
  const out: PeriodScore[] = [];
  for (const p of periodsFor(format.periods)) {
    if (p.key === "final") {
      if (!update.isFinal) continue;
      const x = Number.isFinite(update.live.scoreX) ? update.live.scoreX : cumulative(update.linescoresX, update.linescoresX.length);
      const y = Number.isFinite(update.live.scoreY) ? update.live.scoreY : cumulative(update.linescoresY, update.linescoresY.length);
      out.push({ periodKey: p.key, label: p.label, scoreX: x, scoreY: y });
      continue;
    }
    const n = PERIODS_COMPLETED_FOR[p.key];
    if (n === undefined || update.completedPeriods < n) continue;
    out.push({
      periodKey: p.key,
      label: p.label,
      scoreX: cumulative(update.linescoresX, n),
      scoreY: cumulative(update.linescoresY, n),
    });
  }
  return out;
}

/**
 * For every-score boards: the entry to append when the game score differs from
 * the latest recorded entry (0-0 before the first score). null when unchanged.
 */
export function nextEveryScoreEntry(scores: Score[], scoreX: number, scoreY: number): PeriodScore | null {
  let last: Score | null = null;
  let maxN = 0;
  for (const s of scores) {
    const n = everyScoreIndex(s.periodKey);
    if (n !== null && n > maxN) {
      maxN = n;
      last = s;
    }
  }
  if ((last?.scoreX ?? 0) === scoreX && (last?.scoreY ?? 0) === scoreY) return null;
  const p = everyScorePeriod(maxN + 1);
  return { periodKey: p.key, label: p.label, scoreX, scoreY };
}

/** The fixed period in play for a live period number (1-4, 5+ = OT counts toward Final). */
export function periodKeyForLive(format: GameFormat, livePeriod: number): string | null {
  const keys = periodsFor(format.periods).map((p) => p.key);
  if (keys.length === 0) return null;
  const order = ["q1", "q2", "q3", "final"];
  const idx = Math.min(Math.max(1, Math.trunc(livePeriod) || 1), 4) - 1;
  // First period of this board that ends at or after the live period.
  for (const key of order.slice(idx)) if (keys.includes(key)) return key;
  return "final";
}

/**
 * The square the current live score points at — "if it ended now". Uses the
 * draw for the period in play. null until locked or without live data.
 */
export function liveCell(
  state: Pick<GameState, "game" | "squares" | "live">,
): { periodKey: string | null; cell: Cell; playerId: string | null; reverseCell: Cell | null } | null {
  const { game, live } = state;
  if (!game.numbers || !live || live.state === "pre") return null;
  const periodKey = periodKeyForLive(game.format, live.period);
  const draw = drawFor(game, periodKey ?? SHARED_DRAW_KEY);
  if (!draw) return null;
  const cell = winningCell(live, draw);
  if (!cell) return null;
  const rev = game.format.reverse ? reverseCell(live, draw) : null;
  return { periodKey, cell, playerId: squareAt(state.squares, cell.row, cell.col)?.playerId ?? null, reverseCell: rev };
}

// ---- Dashboard / summary ----

/** Periods this player (public id) has won so far (regular and reverse). */
export function myWins(
  results: PeriodResult[],
  playerId: string,
): { periodKey: string; label: string; reverse: boolean }[] {
  const out: { periodKey: string; label: string; reverse: boolean }[] = [];
  for (const r of results) {
    if (r.winnerPlayerId === playerId) out.push({ periodKey: r.periodKey, label: r.label, reverse: false });
    if (r.reverseWinnerPlayerId === playerId) out.push({ periodKey: r.periodKey, label: r.label, reverse: true });
  }
  return out;
}

/** Public player id -> number of wins (a reverse win counts once). Handy for a leaderboard. */
export function winCounts(results: PeriodResult[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const r of results) {
    if (r.winnerPlayerId) counts[r.winnerPlayerId] = (counts[r.winnerPlayerId] ?? 0) + 1;
    if (r.reverseWinnerPlayerId) counts[r.reverseWinnerPlayerId] = (counts[r.reverseWinnerPlayerId] ?? 0) + 1;
  }
  return counts;
}

/** First fixed period still waiting for a result (null for every-score or when all are done). */
export function upcomingPeriod(state: ResultsInput): Period | null {
  if (state.game.format.periods === "every-score") return null;
  const done = new Set([...state.scores.map((s) => s.periodKey), ...state.manualWinners.map((m) => m.periodKey)]);
  return boardPeriods(state.game, state.scores).find((p) => !done.has(p.key)) ?? null;
}

/** True when the live status differs in anything the board shows (ignores updatedAt). */
export function liveChanged(a: LiveStatus | null, b: LiveStatus | null): boolean {
  if (!a || !b) return a !== b;
  return (
    a.state !== b.state ||
    a.period !== b.period ||
    a.clock !== b.clock ||
    a.detail !== b.detail ||
    a.scoreX !== b.scoreX ||
    a.scoreY !== b.scoreY
  );
}
