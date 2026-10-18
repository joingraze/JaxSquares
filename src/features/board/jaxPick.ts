// "Let Jax pick": random open squares for me, as many as I ask for (within the
// squares left and my per-player max). Pure, so it's unit-tested; the board
// screen claims the result through the same path as a tap.

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

function openCells(input: JaxPickInput): Cell[] {
  const n = gridSize(input.boardSize);
  const taken = new Set(input.squares.map((sq) => cellKey(sq.row, sq.col)));
  const open: Cell[] = [];
  for (let row = 0; row < n; row++) {
    for (let col = 0; col < n; col++) {
      const key = cellKey(row, col);
      if (!taken.has(key) && !input.exclude?.has(key)) open.push({ row, col });
    }
  }
  return open;
}

/**
 * How many squares Jax may pick right now: the open squares (not excluded),
 * capped by what I have left under the per-player max. 0 when he can't pick.
 */
export function jaxPickLimit(input: JaxPickInput): number {
  if (jaxPickBlocked(input)) return 0;
  const open = openCells(input).length;
  if (input.maxPerPlayer <= 0) return open;
  const mine = input.squares.reduce((n, sq) => n + (sq.playerId === input.me ? 1 : 0), 0);
  return Math.min(open, input.maxPerPlayer - mine);
}

/**
 * `count` different open squares picked uniformly at random (fewer when
 * fewer are allowed, see jaxPickLimit), in the order they were drawn.
 */
export function jaxPickMany(input: JaxPickInput, count: number, rng: () => number = secureRandom): Cell[] {
  const want = Math.min(Math.max(0, Math.floor(count)), jaxPickLimit(input));
  const open = openCells(input);
  // Partial Fisher–Yates: the first `want` slots end up a uniform random sample.
  for (let i = 0; i < want; i++) {
    // rng() is in [0, 1); the clamp guards a misbehaving source that returns 1.
    const j = i + Math.min(open.length - i - 1, Math.floor(rng() * (open.length - i)));
    [open[i], open[j]] = [open[j], open[i]];
  }
  return open.slice(0, want);
}

/** One random open square, or null when the board isn't open, I'm at my max, or nothing is left. */
export function jaxPick(input: JaxPickInput, rng: () => number = secureRandom): Cell | null {
  return jaxPickMany(input, 1, rng)[0] ?? null;
}

const QUICK_COUNTS = [1, 2, 3, 5, 10];

/** "How many squares?" quick counts under the limit, plus "Max" when my per-player max is what caps it. */
export function jaxQuickCounts(limit: number, capped: boolean): { count: number; label: string }[] {
  const out = QUICK_COUNTS.filter((n) => n <= limit).map((n) => ({ count: n, label: String(n) }));
  if (capped && limit > 1 && !QUICK_COUNTS.includes(limit)) out.push({ count: limit, label: `Max ${limit}` });
  return out;
}
