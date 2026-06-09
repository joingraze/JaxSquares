import { useCallback, useEffect, useRef, useState } from "react";
import { api, ApiError } from "./api";
import type { GameState } from "../../shared/types";

/**
 * Loads a game and keeps it fresh by polling while the tab is visible.
 * Returns the state plus a setter so mutations can apply server responses
 * immediately without waiting for the next poll.
 */
export function useGameState(id: string | undefined, intervalMs = 5000) {
  const [state, setState] = useState<GameState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const idRef = useRef(id);
  idRef.current = id;

  const refresh = useCallback(async () => {
    if (!idRef.current) return;
    try {
      const next = await api.getGame(idRef.current);
      setState(next);
      setError(null);
    } catch (err) {
      if (err instanceof ApiError && err.status === 404) setError("notfound");
      else setError("network");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    setLoading(true);
    setState(null);
    setError(null);
    void refresh();
  }, [id, refresh]);

  useEffect(() => {
    const tick = () => {
      if (document.visibilityState === "visible") void refresh();
    };
    const timer = setInterval(tick, intervalMs);
    document.addEventListener("visibilitychange", tick);
    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", tick);
    };
  }, [refresh, intervalMs]);

  return { state, setState, error, loading, refresh };
}
