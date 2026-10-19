// How the Club Pass reads in the app (docs/payments.md "Club Pass"): its
// status line, the club's boards, the club TV's rotation. Pure, apart from
// the API origin in logoSrc.

import { clubLogoUrl } from "../../../shared/clubs";
import type { Activity, ClubBoard, ClubBrand, GameState, HostPass } from "../../../shared/types";
import { API_BASE } from "../../lib/api";
import { passDate } from "../pass/passText";

/** The club's logo URL on this device (the API's origin in the native app), null with no logo. */
export function logoSrc(club: ClubBrand): string | null {
  return clubLogoUrl(club, API_BASE);
}

/** "Club Pass · Active", with its date when it has one: "Active · renews Oct 19, 2027", "Ends Oct 19, 2027". */
export function clubStatusLine(pass: Pick<HostPass, "active" | "status" | "renewsAt" | "endsAt">): string {
  if (pass.status === "past_due") return "Payment didn't go through · update it in Manage";
  if (pass.status === "revoked") return "Refunded";
  if (!pass.active) return pass.endsAt ? `Ended ${passDate(pass.endsAt)}` : "Ended";
  if (pass.renewsAt) return `Active · renews ${passDate(pass.renewsAt)}`;
  return pass.endsAt ? `Active · ends ${passDate(pass.endsAt)}` : "Active";
}

/** One of the club's boards as its settings list it: "42 squares left", "Numbers drawn". */
export function clubBoardLine(board: Pick<ClubBoard, "status" | "squaresLeft">): string {
  if (board.status !== "open" && board.status !== "draft") return "Numbers drawn";
  return board.squaresLeft === 0 ? "Every square taken" : `${board.squaresLeft} ${board.squaresLeft === 1 ? "square" : "squares"} left`;
}

// ---- The club TV's rotation ----

/** The newest winner on a board, or null: a new one sends the TV straight to that board. */
export function latestWinner(state: Pick<GameState, "activity">): Activity | null {
  let best: Activity | null = null;
  for (const a of state.activity) if (a.type === "winner" && (!best || a.at > best.at)) best = a;
  return best;
}

/** A game on right now (the feed says it's in play): it shows before the boards still being picked. */
export function isLiveBoard(state: Pick<GameState, "live" | "game">): boolean {
  return state.game.status === "locked" && state.live?.state === "in";
}

/**
 * The boards a club TV goes round, in order: live games first, then the
 * rest as the server listed them (drawn boards, then boards being picked, by
 * kickoff).
 */
export function rotationOrder(boards: readonly GameState[]): GameState[] {
  return [...boards.filter(isLiveBoard), ...boards.filter((b) => !isLiveBoard(b))];
}

/**
 * Which board comes next on a club TV. A winner landed since the TV last
 * looked (`seenWinners`: board id -> the newest winner it had shown or
 * skipped) takes the screen first; otherwise the one after `current` in
 * order, round to the start.
 */
export function nextBoard(
  order: readonly GameState[],
  current: string | null,
  seenWinners: ReadonlyMap<string, string>,
): { id: string; winner: Activity | null } | null {
  if (order.length === 0) return null;
  for (const b of order) {
    const w = latestWinner(b);
    if (w && seenWinners.has(b.game.id) && seenWinners.get(b.game.id) !== w.id) return { id: b.game.id, winner: w };
  }
  const at = current ? order.findIndex((b) => b.game.id === current) : -1;
  return { id: order[(at + 1) % order.length].game.id, winner: null };
}
