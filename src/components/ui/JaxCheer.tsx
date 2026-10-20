// The win moment's mascot: Jax pops up from the bottom edge, hops, and ducks
// back down, alongside the confetti. Never blocks a tap (pointer-events: none),
// hidden from screen readers (the win banner or toast says it in words), and
// with reduced motion he just appears for a moment, still.

import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { useBottomChromeOffset } from "./bottomChrome";
import { prefersReducedMotion } from "./confetti";
import { Jax } from "./Jax";

export interface JaxCheerProps {
  /** Bump to play it (0 = never played). */
  play: number;
  /** Rendered width in px. */
  size?: number;
}

const PLAY_MS = 2700;
const STILL_MS = 1800;

export function JaxCheer({ play, size = 132 }: JaxCheerProps) {
  const reduced = useMemo(() => prefersReducedMotion(), []);
  const [shown, setShown] = useState(0);
  const bottom = useBottomChromeOffset();

  useEffect(() => {
    if (play <= 0) return;
    setShown(play);
    const t = setTimeout(() => setShown(0), reduced ? STILL_MS : PLAY_MS);
    return () => clearTimeout(t);
  }, [play, reduced]);

  if (!shown || typeof document === "undefined") return null;
  return createPortal(
    <div
      aria-hidden
      data-testid="jax-cheer"
      // Under toasts (z-70) and the confetti (z-80): he cheers from behind them.
      className="pointer-events-none fixed inset-x-0 z-[65] flex justify-center overflow-hidden"
      style={{ bottom: `calc(${bottom} - 0.5rem)`, height: Math.round(size * 1.2) }}
    >
      <div key={shown} className={reduced ? "relative self-end" : "jx-cheer relative self-end"}>
        <div className="jx-cheer-glow absolute -inset-6 rounded-full" />
        <Jax pose="cheer" size={size} className="relative" />
      </div>
    </div>,
    document.body,
  );
}
