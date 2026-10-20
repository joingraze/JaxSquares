import { useEffect, useRef, useState } from "react";
import type { Player } from "../../../shared/types";
import { haptic } from "../../lib/native";
import { newArrivals } from "./inviteModel";

const SHOW_MS = 4500;

/**
 * The newest player who joined while `active` (e.g. while the invite sheet is
 * open), for a few seconds, so the screen can say "Maya just joined!". People
 * already on the board when it became active are never announced.
 */
export function useNewArrival(players: readonly Player[], active: boolean): Player | null {
  const known = useRef<Set<string> | null>(null);
  const [arrival, setArrival] = useState<Player | null>(null);

  useEffect(() => {
    if (!active) {
      known.current = null;
      setArrival(null);
      return;
    }
    if (!known.current) {
      known.current = new Set(players.map((p) => p.id));
      return;
    }
    const fresh = newArrivals(known.current, players);
    if (fresh.length === 0) return;
    for (const p of fresh) known.current.add(p.id);
    setArrival(fresh[0]);
    void haptic("light");
  }, [players, active]);

  useEffect(() => {
    if (!arrival) return;
    const t = setTimeout(() => setArrival(null), SHOW_MS);
    return () => clearTimeout(t);
  }, [arrival]);

  return arrival;
}
