// How the Annual Pass reads in the UI: dates, the yearly price, when it pays
// for itself and Profile's status line.

import type { HostPass } from "../../../shared/types";
import type { PriceAmount } from "../../lib/checkout";

/** "Oct 19, 2027". */
export function passDate(ms: number): string {
  return new Date(ms).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

/** "$19.99/year", or "Yearly" when the price can't be said. */
export function perYear(price: string | null): string {
  return price ? `${price}/year` : "Yearly";
}

/**
 * The board on which the Annual Pass pays for itself: the first board count whose
 * fees reach the pass's price, ceil(pass ÷ board) in whole cents, so $19.99
 * against $4.99 is the fifth board (4 boards are $19.96). Both prices as this
 * device shows them (the App Store's in the iOS app). Null when either is
 * unknown, they're in different currencies, or the pass costs about one board
 * or less: then the line isn't shown.
 */
export function passPaysOffAt(pass: PriceAmount | null, board: PriceAmount | null): number | null {
  if (!pass || !board || pass.currency !== board.currency || !(pass.amount > 0) || !(board.amount > 0)) return null;
  const n = Math.ceil(Math.round(pass.amount * 100) / Math.round(board.amount * 100));
  return n >= 2 ? n : null;
}

const ORDINALS = ["", "first", "second", "third", "fourth", "fifth", "sixth", "seventh", "eighth", "ninth", "tenth"];

/** "fourth", "12th", "21st". */
export function ordinal(n: number): string {
  if (ORDINALS[n]) return ORDINALS[n];
  const teen = n % 100 >= 11 && n % 100 <= 13;
  const suffix = teen ? "th" : ({ 1: "st", 2: "nd", 3: "rd" } as Record<number, string>)[n % 10] ?? "th";
  return `${n}${suffix}`;
}

/** "Pays for itself by your fifth board" (see passPaysOffAt). */
export function paysForItself(board: number): string {
  return `Pays for itself by your ${ordinal(board)} board`;
}

/** The pass's dates as Profile says them: "Active · renews Oct 19, 2027" or "Ends Oct 19, 2027". */
export function passStatusLine(pass: Pick<HostPass, "active" | "status" | "renewsAt" | "endsAt">): string {
  if (pass.status === "past_due") return "Payment didn't go through · update it in Manage";
  if (pass.status === "revoked") return "Refunded";
  if (!pass.active) return pass.endsAt ? `Ended ${passDate(pass.endsAt)}` : "Ended";
  if (pass.renewsAt) return `Active · renews ${passDate(pass.renewsAt)}`;
  return pass.endsAt ? `Ends ${passDate(pass.endsAt)}` : "Active";
}
