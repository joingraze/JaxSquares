// Deterministic mock pool used across videos: one "Sunday Squares" board that is
// claimed, locked and scored with the app's real logic from shared/squares.ts.

import { GRID_SIZE, cellKey, shuffledDigits, winningCell } from "../../../shared/squares";
import { PLAYER_COLORS } from "../../../src/lib/identity";
import type { Claim } from "../components/StudioGrid";
import { seeded } from "./anim";

export const PLAYERS: Claim[] = [
  { name: "Maya", color: PLAYER_COLORS[0] },
  { name: "Jordan", color: PLAYER_COLORS[1] },
  { name: "Dev Patel", color: PLAYER_COLORS[2] },
  { name: "Tasha", color: PLAYER_COLORS[3] },
  { name: "Marcus", color: PLAYER_COLORS[4] },
  { name: "Nina", color: PLAYER_COLORS[5] },
  { name: "Chris", color: PLAYER_COLORS[6] },
  { name: "Big Mike", color: PLAYER_COLORS[7] },
];

export interface ClaimEvent {
  key: string;
  row: number;
  col: number;
  player: Claim;
  /** 0..1 position in the claiming sequence, used to stagger pop-ins. */
  order: number;
}

/** All 100 squares in a shuffled claim order, each assigned to a player. */
export function claimSequence(seed = 42): ClaimEvent[] {
  const rnd = seeded(seed);
  const keys: [number, number][] = [];
  for (let r = 0; r < GRID_SIZE; r++) for (let c = 0; c < GRID_SIZE; c++) keys.push([r, c]);
  for (let i = keys.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [keys[i], keys[j]] = [keys[j], keys[i]];
  }
  return keys.map(([row, col], i) => ({
    key: cellKey(row, col),
    row,
    col,
    player: PLAYERS[Math.floor(rnd() * PLAYERS.length)],
    order: i / (keys.length - 1),
  }));
}

export function claimsMap(events: ClaimEvent[]): Map<string, Claim> {
  return new Map(events.map((e) => [e.key, e.player]));
}

/** The board's drawn numbers (same Fisher–Yates draw the Worker uses). */
export function drawNumbers(seed = 9): { x: number[]; y: number[] } {
  const rnd = seeded(seed);
  return { x: shuffledDigits(rnd), y: shuffledDigits(rnd) };
}

export interface PeriodScore {
  key: string;
  label: string;
  x: number;
  y: number;
  payout: number;
}

/**
 * Place a player on the square that a score lands on, so a scripted story
 * ("Maya hits Q1") holds no matter how the shuffle fell.
 */
export function forceWinner(
  claims: Map<string, Claim>,
  numbers: { x: number[]; y: number[] },
  score: { x: number; y: number },
  player: Claim,
): string {
  const cell = winningCell({ scoreX: score.x, scoreY: score.y }, numbers.x, numbers.y)!;
  const key = cellKey(cell.row, cell.col);
  claims.set(key, player);
  return key;
}
