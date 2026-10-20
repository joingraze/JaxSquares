// Ticking clock for countdowns on Home.

import { useEffect, useState } from "react";

/** Re-renders every `ms` (countdowns). Pauses its work while the tab is hidden. */
export function useNow(ms = 30_000): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const tick = () => {
      if (document.visibilityState !== "hidden") setNow(Date.now());
    };
    const t = setInterval(tick, ms);
    document.addEventListener("visibilitychange", tick);
    return () => {
      clearInterval(t);
      document.removeEventListener("visibilitychange", tick);
    };
  }, [ms]);
  return now;
}
