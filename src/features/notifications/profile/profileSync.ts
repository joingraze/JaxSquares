// Keeping my look in sync on the boards I'm already on: joining again with the
// new profile renames/recolors me there (POST /join is an upsert). Finished
// boards keep their history, so only open/locked boards are updated.

import type { GameSummary, JoinInput } from "../../../../shared/types";
import { PLAYER_COLORS, type Profile } from "../../../lib/identity";

export function boardsToSync(games: readonly GameSummary[]): string[] {
  return games.filter((g) => g.status === "open" || g.status === "locked").map((g) => g.id);
}

export function lookChanged(a: Profile, b: Profile): boolean {
  return a.name.trim() !== b.name.trim() || a.color.toLowerCase() !== b.color.toLowerCase() || a.emoji !== b.emoji;
}

export async function syncLook(
  ids: readonly string[],
  profile: Profile,
  join: (id: string, input: JoinInput) => Promise<unknown>,
): Promise<{ updated: number; failed: number }> {
  const input: JoinInput = { name: profile.name.trim(), color: profile.color, emoji: profile.emoji };
  if (!input.name || ids.length === 0) return { updated: 0, failed: 0 };
  const results = await Promise.allSettled(ids.map((id) => join(id, input)));
  const updated = results.filter((r) => r.status === "fulfilled").length;
  return { updated, failed: results.length - updated };
}

/** "Sunny" for a palette color; null for anything custom. */
export function colorName(color: string): string | null {
  return PLAYER_COLORS.find((c) => c.value.toLowerCase() === color.toLowerCase())?.name ?? null;
}

export interface MyStats {
  boards: number;
  squares: number;
  wins: number;
  /** Boards with my squares whose game is on right now. */
  live: number;
  /** Boards with my squares and numbers drawn, still to finish. */
  drawn: number;
}

export function statsOf(games: readonly GameSummary[]): MyStats {
  return games.reduce<MyStats>(
    (s, g) => ({
      boards: s.boards + 1,
      squares: s.squares + g.mySquares,
      wins: s.wins + g.myWins.length,
      live: s.live + (g.mySquares > 0 && g.status !== "final" && g.live?.state === "in" ? 1 : 0),
      drawn: s.drawn + (g.mySquares > 0 && g.status === "locked" ? 1 : 0),
    }),
    { boards: 0, squares: 0, wins: 0, live: 0, drawn: 0 },
  );
}

/** A fun one-liner for the profile hero. */
export function tagline(stats: MyStats | null, hasName: boolean): string {
  if (!hasName) return "Pick a name, a sticker and a color. That's you on every board.";
  if (!stats || stats.boards === 0) return "This is you on every board. Go grab some squares.";
  if (stats.live > 0) return "Game's on. Eyes on your squares.";
  if (stats.wins >= 3) return "Certified closer. The squares fear you.";
  if (stats.wins > 0) return "Already on the scoreboard. Who's next?";
  if (stats.drawn > 0) return "Numbers are in. Fingers crossed.";
  if (stats.squares > 0) return "Squares are set. Now we wait for the numbers.";
  return "This is you on every board. Go grab some squares.";
}
