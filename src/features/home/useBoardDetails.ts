// Full board states behind the dashboard rows: who's playing, the live score,
// who holds the winning square. Fetched over HTTP (not the live socket, so
// Home never counts as "watching" a board), re-fetched whenever the summary
// list refreshes and every few seconds for boards in play. Every state also
// warms the board cache, so tapping a row opens it instantly.

import { useEffect, useRef, useState } from "react";
import type { GameState, GameSummary } from "../../../shared/types";
import { api } from "../../lib/api";
import { peekGame, primeGame } from "../../lib/live";

/** Boards in play refresh this often while Home is on screen. */
export const LIVE_DETAIL_MS = 10_000;
/** Don't fan out to more boards than a phone screen can show. */
const MAX_DETAILS = 16;
const CONCURRENCY = 4;

export type Details = Record<string, GameState>;

async function fetchAll(ids: string[], signal: AbortSignal): Promise<GameState[]> {
  const out: GameState[] = [];
  let i = 0;
  const worker = async () => {
    while (i < ids.length && !signal.aborted) {
      const id = ids[i++];
      try {
        out.push(await api.getGame(id, signal));
      } catch {
        // A row without details still renders from its summary.
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, ids.length) }, worker));
  return out;
}

const isLive = (g: GameSummary) => g.status === "locked" || g.live?.state === "in";

export function useBoardDetails(games: GameSummary[] | null): Details {
  const [details, setDetails] = useState<Details>(() => {
    const seed: Details = {};
    for (const g of games ?? []) {
      const s = peekGame(g.id);
      if (s) seed[g.id] = s;
    }
    return seed;
  });
  const gamesRef = useRef(games);
  gamesRef.current = games;
  const detailsRef = useRef(details);
  detailsRef.current = details;

  const merge = (states: GameState[]) => {
    if (states.length === 0) return;
    for (const s of states) primeGame(s);
    setDetails((prev) => {
      const next = { ...prev };
      for (const s of states) {
        const cur = next[s.game.id];
        if (!cur || s.version >= cur.version) next[s.game.id] = s;
      }
      return next;
    });
  };

  // Every new summary list: refresh the details of every board shown.
  useEffect(() => {
    if (!games?.length) return;
    const ids = games
      .filter((g) => g.status !== "draft")
      .slice(0, MAX_DETAILS)
      // A finished board never changes: one fetch is enough.
      .filter((g) => !(g.status === "final" && detailsRef.current[g.id]?.game.status === "final"))
      .map((g) => g.id);
    if (ids.length === 0) return;
    const ctrl = new AbortController();
    void fetchAll(ids, ctrl.signal).then((states) => {
      if (!ctrl.signal.aborted) merge(states);
    });
    return () => ctrl.abort();
  }, [games]);

  // Boards in play tick faster.
  useEffect(() => {
    const ctrl = new AbortController();
    const timer = setInterval(() => {
      if (document.visibilityState === "hidden") return;
      const ids = (gamesRef.current ?? []).filter(isLive).slice(0, MAX_DETAILS).map((g) => g.id);
      if (ids.length) void fetchAll(ids, ctrl.signal).then((states) => !ctrl.signal.aborted && merge(states));
    }, LIVE_DETAIL_MS);
    return () => {
      clearInterval(timer);
      ctrl.abort();
    };
  }, []);

  return details;
}
