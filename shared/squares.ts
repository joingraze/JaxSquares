// Pure Super Bowl Squares logic. No I/O or framework dependencies so it can be
// reused by the Worker and the client and unit-tested in isolation.

import type { Game, Score, Square } from "./types";

export const GRID_SIZE = 10;

/** Stable string key for a grid coordinate, e.g. "1,4". */
export const cellKey = (row: number, col: number): string => `${row},${col}`;

/** Fisher–Yates shuffle of [0..9], returning a fresh array. */
export function shuffledDigits(rng: () => number = Math.random): number[] {
  const digits = Array.from({ length: GRID_SIZE }, (_, i) => i);
  for (let i = digits.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [digits[i], digits[j]] = [digits[j], digits[i]];
  }
  return digits;
}

/**
 * Given a final/period score, find the winning grid coordinate.
 * The winning digit is the last digit of each team's score; we map that digit
 * back to the row/column it was assigned to.
 */
export function winningCell(
  score: Pick<Score, "scoreX" | "scoreY">,
  xNumbers: number[],
  yNumbers: number[],
): { row: number; col: number } | null {
  const xDigit = lastDigit(score.scoreX);
  const yDigit = lastDigit(score.scoreY);
  const col = xNumbers.indexOf(xDigit);
  const row = yNumbers.indexOf(yDigit);
  if (col === -1 || row === -1) return null;
  return { row, col };
}

export function lastDigit(n: number): number {
  return ((Math.trunc(n) % 10) + 10) % 10;
}

/** Look up the square (if any) at a grid coordinate. */
export function squareAt(squares: Square[], row: number, col: number): Square | undefined {
  return squares.find((s) => s.row === row && s.col === col);
}

export interface PeriodResult {
  periodKey: string;
  cell: { row: number; col: number } | null;
  winner: Square | undefined;
  payout: number;
}

/** Resolve winners for every recorded score. Requires a locked game. */
export function resolveResults(game: Game, squares: Square[], scores: Score[]): PeriodResult[] {
  if (!game.xNumbers || !game.yNumbers) return [];
  const xNumbers = game.xNumbers;
  const yNumbers = game.yNumbers;
  return scores.map((score) => {
    const cell = winningCell(score, xNumbers, yNumbers);
    const winner = cell ? squareAt(squares, cell.row, cell.col) : undefined;
    return {
      periodKey: score.periodKey,
      cell,
      winner,
      payout: game.payouts[score.periodKey] ?? 0,
    };
  });
}

export function countClaimedBy(squares: Square[], clientId: string): number {
  return squares.reduce((n, s) => (s.clientId === clientId ? n + 1 : n), 0);
}

export const POT = (game: Game, squares: Square[]): number =>
  squares.length * game.pricePerSquare;
