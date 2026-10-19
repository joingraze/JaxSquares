// "Add another board for this game": what the create flow starts from when a
// host makes a $5 board next to their $1 one (/new?from=<board id>). The same
// game (the linked event or the custom kickoff, the teams), the same rules,
// board size and max per player; the host picks this board's square price on
// the first step (the suggested amounts follow it) and confirms. Pure: no
// React, no IO.

import { withRules } from "../../../shared/formats";
import { gameKickoff } from "../../../shared/kickoff";
import { nextSiblingName, siblingCheckOf, siblingProblem } from "../../../shared/siblings";
import type { GameFormat, GameState } from "../../../shared/types";
import { choiceOf, priceLine, type PrizeChoice } from "../rules/rulesModel";
import type { Matchup } from "./model";

/** The create flow's starting point for another board for `state`'s game. */
export interface SiblingSeed {
  /** The board it's made from. */
  fromId: string;
  /** That board's name and its square price line ("$1 a square"), for the flow's header. In-app only. */
  source: { name: string; price: string | null };
  matchup: Extract<Matchup, { kind: "board" }>;
  /** The source's rules, board size and amounts (fresh numbers too). */
  format: GameFormat;
  prizeChoice: PrizeChoice;
  maxPerPlayer: number;
  /** "Office Squares · Board 2": never the price (the name is every push's title). */
  name: string;
}

export function siblingSeed(state: GameState): SiblingSeed {
  const { game } = state;
  return {
    fromId: game.id,
    source: { name: game.name, price: game.format.justForFun ? null : priceLine(game.format) },
    matchup: {
      kind: "board",
      from: {
        id: game.id,
        name: game.name,
        teamX: game.teamX,
        teamY: game.teamY,
        league: game.league,
        linkedEvent: game.linkedEvent,
        startsAt: game.linkedEvent ? null : gameKickoff(game),
      },
    },
    // An older board's notes are folded into its rules.
    format: withRules(game.format, game.prizes),
    prizeChoice: choiceOf(game.format),
    maxPerPlayer: game.maxPerPlayer,
    name: nextSiblingName(state),
  };
}

/** Why this device can't add a board to `state`'s game right now (it doesn't run the board as host or co-host, or the game can't take one), or null. */
export function siblingSeedProblem(state: GameState, runsIt: boolean, now: number): string | null {
  if (!runsIt) return "Only this board's host or a co-host can add another board for its game.";
  return siblingProblem(siblingCheckOf(state), now);
}

/** "/new?from=<id>&step=prizes": where "Add another board for this game" goes. */
export function siblingCreatePath(gameId: string): string {
  return `/new?from=${encodeURIComponent(gameId)}&step=prizes`;
}
