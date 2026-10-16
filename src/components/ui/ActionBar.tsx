import { useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { useShell } from "../shell";
import { cx } from "./cx";
import { useKeyboardInset } from "./useKeyboardInset";

export interface ActionBarProps {
  children: ReactNode;
  className?: string;
}

/**
 * Bottom-pinned actions (e.g. "Claim 3 squares", "Create board"). Sits above
 * the tab dock when it's showing, above the keyboard when it's open, and leaves
 * a spacer in the page so content can scroll clear of it.
 */
export function ActionBar({ children, className }: ActionBarProps) {
  const { tabBarVisible, overlayRoot } = useShell();
  const keyboard = useKeyboardInset();
  const ref = useRef<HTMLDivElement>(null);
  const [height, setHeight] = useState(0);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const update = () => setHeight(el.offsetHeight);
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, [overlayRoot]);

  const bottom = keyboard ? keyboard : tabBarVisible ? "calc(var(--tabbar-h) + max(var(--safe-bottom), 0.5rem))" : 0;
  const bar = (
    <div ref={ref} className="pointer-events-none fixed inset-x-0 z-30" style={{ bottom }}>
      <div
        className={cx(
          "pointer-events-auto mx-auto max-w-md bg-linear-to-t from-canvas from-60% to-transparent px-4 pt-5",
          tabBarVisible || keyboard ? "pb-3" : "pb-[max(var(--safe-bottom),0.75rem)]",
          className,
        )}
      >
        {children}
      </div>
    </div>
  );

  return (
    <>
      <div aria-hidden style={{ height }} />
      {createPortal(bar, overlayRoot ?? document.body)}
    </>
  );
}
