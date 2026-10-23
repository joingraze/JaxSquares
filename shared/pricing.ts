// What a host pays, shared so the Worker and the app agree (docs/payments.md
// "Pricing"). Pure: no IO. Two products, each with a Venue add-on:
//
//   Per game     – one board's host fee, due when the host draws its numbers
//                  (BOARD_PRICE_CENTS, $4.99). A venue board (format.venue)
//                  adds the Venue add-on for that board (VENUE_PRICE_CENTS, $10).
//   Annual Pass  – every board the holder hosts for a year from the day it's
//                  bought (HOST_PASS_PRICE_CENTS, $19.99/year). With the Venue
//                  add-on (plan "club": CLUB_PASS_PRICE_CENTS, $99.99/year) it
//                  covers venue boards too, and adds the venue's branding and
//                  TV link.
//
// A board held by 5 or fewer players still draws for free (shared/hostFee.ts),
// venue or not. A season board runs all season, so it comes with the Annual
// Pass (no per-game fee): without one its draw asks for the pass. Nothing here
// moves money between players: it's what the host pays JaxSquares.

import type { BoardKind, GameFormat } from "./types";

/** The yearly pass, as the app names it. */
export const PASS_NAME = "Annual Pass";
/** What a venue board adds, per board or on the pass. */
export const VENUE_ADDON_NAME = "Venue add-on";
/** The yearly pass with the Venue add-on. */
export const VENUE_PASS_NAME = "Annual Pass + Venue";

/**
 * What an active pass covers: nothing ("none"), every board's host fee
 * ("pass", the Annual Pass), or that and every venue board's add-on too
 * ("venue", the Annual Pass with the Venue add-on).
 */
export type PassCover = "none" | "pass" | "venue";

/** One board's prices, in minor units of the currency. */
export interface BoardPrices {
  /** The host fee for one board (499 = $4.99). */
  boardCents: number;
  /** The Venue add-on for one venue board (1000 = $10). */
  venueCents: number;
}

/** What drawing a board costs its host now. */
export interface FeeDue {
  /** What's due: the host fee and the Venue add-on that the pass doesn't cover. 0 = covered by the pass. */
  cents: number;
  /** The host fee part of `cents`. */
  boardCents: number;
  /** The Venue add-on part of `cents`. */
  venueCents: number;
  /** A season board without an Annual Pass: the pass is the only way to draw it (`cents` is 0 then). */
  needsPass: boolean;
}

/** `code` of a 402 (POST /lock, or paying a season board's fee) when only the Annual Pass can pay for the board. */
export const PASS_REQUIRED_CODE = "pass_required";

/** Why a season board's draw asks for the Annual Pass. */
export const SEASON_NEEDS_PASS = "Season boards come with the Annual Pass. Get it to draw the numbers.";

/** A venue board's mode can't change once its fee is settled (paid, covered or free): the add-on was charged or not. */
export const VENUE_LOCKED_ERROR = "Venue mode is set before the numbers are drawn, while the board isn't paid for yet.";

/** The board as pricing reads it: a season board or one board, a venue's or not. */
export interface PricedBoard {
  kind?: BoardKind;
  format: Pick<GameFormat, "venue">;
}

/**
 * What a board costs to draw with this pass cover (the free tier aside: the
 * caller checks that first). A season board needs the Annual Pass; any board
 * pays its host fee unless a pass covers it, plus the Venue add-on on a venue
 * board unless the pass has it.
 */
export function feeDue(board: PricedBoard, prices: BoardPrices, cover: PassCover): FeeDue {
  const season = board.kind === "season";
  if (season && cover === "none") return { cents: 0, boardCents: 0, venueCents: 0, needsPass: true };
  const boardCents = cover === "none" ? prices.boardCents : 0;
  const venueCents = board.format.venue === true && cover !== "venue" ? prices.venueCents : 0;
  return { cents: boardCents + venueCents, boardCents, venueCents, needsPass: false };
}

/** The pass covers everything this board costs to draw: no checkout needed, whatever the prices. */
export function coversBoard(board: PricedBoard, cover: PassCover): boolean {
  if (cover === "none") return false;
  return board.format.venue !== true || cover === "venue";
}

/** The pass a board's checkout offers: with the Venue add-on for a venue board. */
export function passPlanFor(board: PricedBoard): "host" | "club" {
  return board.format.venue === true ? "club" : "host";
}

/** What an identity's passes cover, from whether each is active right now. */
export function coverOf(pass: { active: boolean } | null | undefined, venuePass: { active: boolean } | null | undefined): PassCover {
  if (venuePass?.active) return "venue";
  return pass?.active ? "pass" : "none";
}
