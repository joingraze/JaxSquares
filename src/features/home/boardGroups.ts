// Home shows a player's boards from one game together: a host's $1, $5 and
// $20 boards on the big game (GameSummary.group, the board group from
// migration 0012) sit next to each other in their section, under one
// "Chiefs vs Bills · 3 boards" label. Pure: no React, no IO.

import { shortSiblingName } from "../../../shared/siblings";
import type { GameSummary } from "../../../shared/types";
import { shortTeam } from "../../lib/format";
import { priceLine } from "../rules/rulesModel";

type Grouped = Pick<GameSummary, "id" | "group" | "createdAt">;

/**
 * Boards of one group moved up to where the group's first board is in the
 * list, in the order they were made (the $1 board, then Board 2, Board 3);
 * every other board keeps its place. Boards on their own (no group) never move.
 */
export function clusterGroups<T extends Grouped>(list: readonly T[]): T[] {
  const out: T[] = [];
  const placed = new Set<string>();
  for (const g of list) {
    if (placed.has(g.id)) continue;
    if (!g.group) {
      out.push(g);
      placed.add(g.id);
      continue;
    }
    const members = list.filter((m) => m.group === g.group && !placed.has(m.id)).sort((a, b) => a.createdAt - b.createdAt);
    for (const m of members) {
      out.push(m);
      placed.add(m.id);
    }
  }
  return out;
}

export interface BoardRun<T> {
  /** A React key: the group, or the board's id for one on its own. */
  key: string;
  boards: T[];
}

/** Consecutive boards of one group as one run (cluster first); a board on its own is a run of one. */
export function groupRuns<T extends Grouped>(list: readonly T[]): BoardRun<T>[] {
  const runs: BoardRun<T>[] = [];
  for (const g of list) {
    const last = runs.at(-1);
    if (g.group && last && last.boards[0].group === g.group) last.boards.push(g);
    else runs.push({ key: g.group ? `group:${g.group}:${g.id}` : g.id, boards: [g] });
  }
  return runs;
}

/**
 * "Chiefs vs Bills · 3 boards" (and when it kicks off, which they share):
 * what a group of boards on Home says over them.
 */
export function groupLabel(boards: readonly Pick<GameSummary, "teamX" | "teamY">[], when: string | null = null): string {
  const first = boards[0];
  if (!first) return "";
  const x = shortTeam(first.teamX, "custom") || first.teamX.name;
  const y = shortTeam(first.teamY, "custom") || first.teamY.name;
  return [`${x} vs ${y}`, `${boards.length} boards`, when].filter(Boolean).join(" · ");
}

/**
 * A board's title inside its group: "Board 2" for "Office Squares · Board 2"
 * when another board in the group carries the same name before it (the
 * group's label says the game), else the board's own name.
 */
export const groupCardTitle = shortSiblingName;

/** What tells a group's boards apart besides the name: "$5 a square", "Just for fun", or null (in-app only). */
export function groupCardDetail(format: GameSummary["format"]): string | null {
  if (format.justForFun) return "Just for fun";
  return priceLine(format);
}
