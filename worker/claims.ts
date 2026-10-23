// Claim codes for a venue's board (shared/venue.ts, GET /api/games/:id/claims):
// a short code per winner that the staff check before handing over a prize.
// Derived, never stored: HMAC-SHA256 of the board, the moment, the side and the
// winner's public id, keyed with the board's admin token (only the server and
// the host hold it), so nobody can work one out from the public board. A
// corrected score that changes the winner changes the code.

import { resolveResults } from "../shared/squares";
import type { ClaimCode, GameState } from "../shared/types";
import { claimCodeFrom } from "../shared/venue";

const encoder = new TextEncoder();

export async function claimCodesFor(state: GameState, adminToken: string): Promise<ClaimCode[]> {
  const key = await crypto.subtle.importKey("raw", encoder.encode(adminToken), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const out: ClaimCode[] = [];
  for (const r of resolveResults(state)) {
    const sides = [
      { reverse: false, playerId: r.awardsSquare ? r.winnerPlayerId : null },
      { reverse: true, playerId: r.awardsReverse ? r.reverseWinnerPlayerId : null },
    ];
    for (const { reverse, playerId } of sides) {
      if (!playerId) continue;
      const message = `claim:${state.game.id}:${r.periodKey}:${reverse ? "reverse" : "square"}:${playerId}`;
      const mac = new Uint8Array(await crypto.subtle.sign("HMAC", key, encoder.encode(message)));
      out.push({ periodKey: r.periodKey, label: r.label, reverse, playerId, code: claimCodeFrom(mac) });
    }
  }
  return out;
}
