import { useEffect, useState } from "react";

/**
 * Height of the on-screen keyboard overlapping the layout viewport (iOS Safari
 * and WKWebView don't resize fixed elements for it). Fixed bottom UI adds this
 * to its bottom offset so inputs stay above the keyboard.
 */
export function useKeyboardInset(active = true): number {
  const [inset, setInset] = useState(0);
  useEffect(() => {
    const vv = typeof window === "undefined" ? undefined : window.visualViewport;
    if (!vv || !active) {
      setInset(0);
      return;
    }
    const update = () => setInset(Math.max(0, Math.round(window.innerHeight - vv.height - vv.offsetTop)));
    update();
    vv.addEventListener("resize", update);
    vv.addEventListener("scroll", update);
    return () => {
      vv.removeEventListener("resize", update);
      vv.removeEventListener("scroll", update);
    };
  }, [active]);
  return inset;
}
