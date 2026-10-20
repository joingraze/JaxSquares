// "Share the recap" when a winner lands: a toast with the action, shown once
// the board's own alert for that moment has had its turn (the ticker sits in
// the same spot), and replaced in place by the next one, so a final whistle
// and its winner make one nudge.

import { useCallback, useEffect, useRef } from "react";
import type { Activity } from "../../../shared/types";
import { useToast } from "../../components/ui";

/** The toast's id: a newer nudge replaces the one showing. */
export const RECAP_NUDGE_ID = "recap-nudge";

/** Whether this live activity is a moment worth a recap: a winner who held the square, or the final whistle. */
export function nudgesRecap(a: Activity): boolean {
  if (a.type === "final") return true;
  if (a.type !== "winner") return false;
  const ids = (a.data as { playerIds?: unknown }).playerIds;
  return Array.isArray(ids) && ids.length > 0;
}

/** Returns `nudge(activity, afterMs)`: offers the recap after `afterMs` for an activity that's worth one. */
export function useRecapNudge(onOpen: () => void): (a: Activity, afterMs: number) => void {
  const toast = useToast();
  const openRef = useRef(onOpen);
  openRef.current = onOpen;
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );
  return useCallback(
    (a: Activity, afterMs: number) => {
      if (!nudgesRecap(a)) return;
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => {
        timer.current = null;
        toast.show({
          id: RECAP_NUDGE_ID,
          tone: "win",
          haptic: false,
          title: a.type === "final" ? "That's a wrap 🏁" : "A winner just landed",
          description: "Send the group the recap card.",
          duration: 8000,
          action: { label: "Share the recap", onClick: () => openRef.current() },
        });
      }, Math.max(0, afterMs));
    },
    [toast],
  );
}
