// Claim codes for a venue board (shared/venue.ts): the caller's own, and every
// winner's for the host or a co-host. Fetched only on a board with claim codes
// on, and again whenever who won what changes (a corrected score changes a
// code). Never part of the public board state.

import { useEffect, useState } from "react";
import { resolveResults } from "../../../shared/squares";
import type { ClaimsResponse, GameState } from "../../../shared/types";
import { api } from "../../lib/api";

/** Who won what: claim codes only change when this does. */
export function winnersKey(state: GameState): string {
  return resolveResults(state)
    .map((r) => `${r.periodKey}:${r.awardsSquare ? r.winnerPlayerId : ""}:${r.awardsReverse ? r.reverseWinnerPlayerId : ""}`)
    .join("|");
}

/** `active` false: don't ask (the host's sheet closed, say). */
export function useClaims(state: GameState | null, adminToken: string | null, active = true): ClaimsResponse | null {
  const id = state?.game.id ?? null;
  const on = active && !!state?.game.format.claimCodes;
  const key = on && state ? winnersKey(state) : "";
  const [claims, setClaims] = useState<{ for: string; value: ClaimsResponse } | null>(null);
  const want = on && id && key ? `${id}|${adminToken ?? ""}|${key}` : null;

  useEffect(() => {
    if (!want || !id) return;
    let alive = true;
    api.claims(id, adminToken).then(
      (value) => alive && setClaims({ for: want, value }),
      () => undefined, // offline: the codes come with the next change
    );
    return () => {
      alive = false;
    };
  }, [want, id, adminToken]);

  // While a change's codes are on their way, the board's last ones stay (a code only changes with its winner).
  return want && claims && claims.for.startsWith(`${id}|`) ? claims.value : null;
}
