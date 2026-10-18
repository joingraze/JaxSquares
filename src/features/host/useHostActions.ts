// Every host API call in one place: one request at a time, the response
// applied to the board straight away (the socket delivers it too), friendly
// toasts for failures (rate limits read as a gentle "slow down", not an error)
// and haptics on the moments that matter.

import { useCallback, useRef, useState } from "react";
import type { GameState, UpdateGameInput } from "../../../shared/types";
import { useToast } from "../../components/ui";
import { ApiError, api, errorMessage, isPaymentRequired } from "../../lib/api";

export type HostBusy =
  | "lock"
  | "score"
  | "remove-score"
  | "winner"
  | "clear-winner"
  | "finish"
  | "delete"
  | "edit"
  | "remove-player"
  | null;

/** What `lock` resolves to when the board's host fee isn't paid yet (the server's 402): open the checkout, then draw. */
export const PAY_FIRST = "pay-first" as const;

export interface HostActions {
  busy: HostBusy;
  /** Draws the numbers: the new state, PAY_FIRST while the host fee is due, or null after a failure (toasted). */
  lock: () => Promise<GameState | typeof PAY_FIRST | null>;
  saveScore: (input: { periodKey: string; scoreX: number; scoreY: number }) => Promise<GameState | null>;
  removeScore: (periodKey: string) => Promise<GameState | null>;
  setWinner: (periodKey: string, cell: { row: number; col: number }) => Promise<GameState | null>;
  clearWinner: (periodKey: string) => Promise<GameState | null>;
  finish: () => Promise<GameState | null>;
  update: (patch: UpdateGameInput) => Promise<GameState | null>;
  remove: () => Promise<boolean>;
  /** Take a player (public id) off the board and free their squares, while squares are being picked. */
  removePlayer: (playerId: string) => Promise<GameState | null>;
}

/** The API's refusals for removing a player, said for the host. */
function removePlayerError(err: unknown): unknown {
  if (!(err instanceof ApiError)) return err;
  if (err.status === 409) return new ApiError("Squares are locked now, so everyone stays on the board.", 409, err.body);
  if (err.status === 404 && err.message !== "Game not found") {
    return new ApiError("They're not on this board anymore.", 404, err.body);
  }
  return err;
}

export function useHostActions(gameId: string, apply: (state: GameState) => void): HostActions {
  const toast = useToast();
  const [busy, setBusy] = useState<HostBusy>(null);
  const inFlight = useRef(false);
  const applyRef = useRef(apply);
  applyRef.current = apply;

  const run = useCallback(
    async <T,>(name: Exclude<HostBusy, null>, request: () => Promise<T>): Promise<T | null> => {
      if (inFlight.current) return null;
      inFlight.current = true;
      setBusy(name);
      try {
        return await request();
      } catch (err) {
        if (err instanceof ApiError && err.status === 429) {
          toast.show({ id: "host-error", title: err.message, tone: "neutral", haptic: "warning" });
        } else {
          toast.show({ id: "host-error", title: errorMessage(err), tone: "error" });
        }
        return null;
      } finally {
        inFlight.current = false;
        setBusy(null);
      }
    },
    [toast],
  );

  const withState = useCallback(
    async (name: Exclude<HostBusy, null>, request: () => Promise<{ state: GameState } | null>): Promise<GameState | null> => {
      const res = await run(name, request);
      if (!res) return null;
      applyRef.current(res.state);
      return res.state;
    },
    [run],
  );

  return {
    busy,
    lock: useCallback(async () => {
      let payFirst = false;
      const next = await withState("lock", () =>
        api.lock(gameId).catch((err: unknown) => {
          // Not a failure to toast: the host pays, then draws.
          if (!isPaymentRequired(err)) throw err;
          payFirst = true;
          return null;
        }),
      );
      return payFirst ? PAY_FIRST : next;
    }, [withState, gameId]),
    saveScore: useCallback((input) => withState("score", () => api.setScore(gameId, input)), [withState, gameId]),
    removeScore: useCallback((key: string) => withState("remove-score", () => api.deleteScore(gameId, key)), [withState, gameId]),
    setWinner: useCallback(
      (periodKey: string, cell: { row: number; col: number }) =>
        withState("winner", () => api.setWinner(gameId, { periodKey, row: cell.row, col: cell.col })),
      [withState, gameId],
    ),
    clearWinner: useCallback((key: string) => withState("clear-winner", () => api.deleteWinner(gameId, key)), [withState, gameId]),
    finish: useCallback(() => withState("finish", () => api.finish(gameId)), [withState, gameId]),
    update: useCallback((patch: UpdateGameInput) => withState("edit", () => api.updateGame(gameId, patch)), [withState, gameId]),
    remove: useCallback(async () => (await run("delete", () => api.deleteGame(gameId))) !== null, [run, gameId]),
    removePlayer: useCallback(
      (playerId: string) =>
        withState("remove-player", () =>
          api.removePlayer(gameId, playerId).catch((err: unknown) => {
            throw removePlayerError(err);
          }),
        ),
      [withState, gameId],
    ),
  };
}
