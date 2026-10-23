// The host fee's free tier, shared so the Worker and the app agree on it.
// Pure: no IO. A board whose squares are held by FREE_PLAYER_LIMIT or fewer
// distinct players when the numbers are drawn costs nothing to draw; bigger
// boards pay the host fee (or an Annual Pass covers it). Only players holding at
// least one square count: someone who joined but picked nothing doesn't, and
// the host counts like anyone else once they hold a square.
//
// The Worker re-counts in SQL inside the draw's own batch (worker/db.ts
// markFreeDraw), so a 6th player who claims while the host taps "Draw" can't
// slip in for free; this module is for deciding what to show and try.

import type { GameState, Square } from "./types";

/** Most players who may hold squares on a board that draws for free. */
export const FREE_PLAYER_LIMIT = 5;

/** How many different players hold at least one square. */
export function squareHolders(squares: readonly Pick<Square, "playerId">[]): number {
  return new Set(squares.map((s) => s.playerId)).size;
}

/** A board with this many square holders draws for free. */
export function isFreeHolderCount(holders: number): boolean {
  return holders <= FREE_PLAYER_LIMIT;
}

/** Drawing this board's numbers right now would be free: FREE_PLAYER_LIMIT or fewer players hold squares. */
export function isFreeDraw(state: Pick<GameState, "squares">): boolean {
  return isFreeHolderCount(squareHolders(state.squares));
}
