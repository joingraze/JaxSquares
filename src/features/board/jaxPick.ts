// "Let Jax pick": one random open square for me. Pure, so it's unit-tested;
// the board screen claims the result through the same path as a tap.

import { cellKey, gridSize, secureRandom, type Cell } from "../../../shared/squares";
import type { BoardSize, GameStatus, Square } from "../../../shared/types";

export interface JaxPickInput {
  status: GameStatus;
  boardSize: BoardSize;
  /** 0 = no limit. */
  maxPerPlayer: number;
  squares: readonly Pick<Square, "row" | "col" | "playerId">[];
  /** My public player id. */
  me: string;
  /** Cell keys to skip (squares already tried, or picked but not claimed yet). */
  exclude?: ReadonlySet<string>;
}

/** Why Jax can't pick, or null when he can. */
export function jaxPickBlocked(input: Omit<JaxPickInput, "exclude">): "closed" | "max" | "full" | null {
  if (input.status !== "open") return "closed";
  const mine = input.squares.reduce((n, sq) => n + (sq.playerId === input.me ? 1 : 0), 0);
  if (input.maxPerPlayer > 0 && mine >= input.maxPerPlayer) return "max";
  const n = gridSize(input.boardSize);
  return input.squares.length >= n * n ? "full" : null;
}

/**
 * A uniformly random open square (nobody's, not excluded), or null when the
 * board isn't open, I'm at the per-player max, or nothing is left.
 */
export function jaxPick(input: JaxPickInput, rng: () => number = secureRandom): Cell | null {
  if (jaxPickBlocked(input)) return null;
  const n = gridSize(input.boardSize);
  const taken = new Set(input.squares.map((sq) => cellKey(sq.row, sq.col)));
  const open: Cell[] = [];
  for (let row = 0; row < n; row++) {
    for (let col = 0; col < n; col++) {
      const key = cellKey(row, col);
      if (!taken.has(key) && !input.exclude?.has(key)) open.push({ row, col });
    }
  }
  if (open.length === 0) return null;
  // rng() is in [0, 1); the clamp guards a misbehaving source that returns 1.
  return open[Math.min(open.length - 1, Math.floor(rng() * open.length))];
}
