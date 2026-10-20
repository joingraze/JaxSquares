// Pull-to-refresh for the dashboard: drag down from the top of the page, let
// go past the line, and the boards reload. Touch only; desktop has focus/poll.

import { useEffect, useRef, useState } from "react";
import { haptic } from "../../lib/native";

/** Visible pull (px) needed to trigger a refresh. */
export const PULL_THRESHOLD = 72;
/** The indicator never travels further than this. */
export const PULL_MAX = 120;
/** Keep the spinner up at least this long so a fast refresh still reads as one. */
const MIN_SPIN_MS = 650;

/** Rubber-band resistance: finger distance -> visible pull, easing toward PULL_MAX. */
export function resist(distance: number, max = PULL_MAX): number {
  if (distance <= 0) return 0;
  return max * (1 - Math.exp(-distance / (max * 1.6)));
}

export interface PullState {
  /** Current visible pull in px (0 when idle). */
  pull: number;
  refreshing: boolean;
  /** Past the threshold: letting go will refresh. */
  armed: boolean;
}

export function usePullToRefresh(onRefresh: () => Promise<unknown>, enabled = true): PullState {
  const [pull, setPull] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const onRefreshRef = useRef(onRefresh);
  onRefreshRef.current = onRefresh;
  const busy = useRef(false);

  useEffect(() => {
    if (!enabled) return;
    let startY: number | null = null;
    let startX = 0;
    /** Decided on the first real movement: only a mostly-vertical drag is a pull. */
    let axis: "y" | "x" | null = null;
    let current = 0;
    let armed = false;
    let frame = 0;

    const set = (v: number) => {
      current = v;
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => setPull(v));
    };

    const onStart = (e: TouchEvent) => {
      if (busy.current || e.touches.length !== 1 || window.scrollY > 0) return;
      startY = e.touches[0].clientY;
      startX = e.touches[0].clientX;
      axis = null;
      armed = false;
    };
    const onMove = (e: TouchEvent) => {
      if (startY === null) return;
      const dy = e.touches[0].clientY - startY;
      const dx = e.touches[0].clientX - startX;
      if (axis === null && Math.hypot(dx, dy) > 6) axis = Math.abs(dy) > Math.abs(dx) ? "y" : "x";
      if (axis === "x") {
        // A sideways swipe (e.g. the live carousel): not ours.
        startY = null;
        return;
      }
      // Not sure yet: don't cancel anything until the drag shows its direction.
      if (axis === null) return;
      if (dy <= 0 || window.scrollY > 0) {
        if (current > 0) set(0);
        if (dy < 0) startY = null;
        return;
      }
      // We own this gesture now: no page bounce / browser reload underneath.
      if (e.cancelable) e.preventDefault();
      const v = resist(dy);
      const nowArmed = v >= PULL_THRESHOLD;
      if (nowArmed && !armed) void haptic("selection");
      armed = nowArmed;
      set(v);
    };
    const onEnd = () => {
      if (startY === null) return;
      startY = null;
      if (!armed) {
        set(0);
        return;
      }
      armed = false;
      busy.current = true;
      setRefreshing(true);
      set(PULL_THRESHOLD * 0.8);
      void haptic("medium");
      const started = Date.now();
      void Promise.resolve()
        .then(() => onRefreshRef.current())
        .catch(() => {})
        .then(() => new Promise((r) => setTimeout(r, Math.max(0, MIN_SPIN_MS - (Date.now() - started)))))
        .then(() => {
          busy.current = false;
          setRefreshing(false);
          set(0);
        });
    };

    window.addEventListener("touchstart", onStart, { passive: true });
    window.addEventListener("touchmove", onMove, { passive: false });
    window.addEventListener("touchend", onEnd);
    window.addEventListener("touchcancel", onEnd);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("touchstart", onStart);
      window.removeEventListener("touchmove", onMove);
      window.removeEventListener("touchend", onEnd);
      window.removeEventListener("touchcancel", onEnd);
    };
  }, [enabled]);

  return { pull, refreshing, armed: pull >= PULL_THRESHOLD };
}
