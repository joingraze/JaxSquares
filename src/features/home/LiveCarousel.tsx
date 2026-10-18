// Several boards live at once: a swipeable row of live cards (the next one
// peeks in from the right) with page dots, so the rest of the dashboard stays
// above the fold.

import { Children, useEffect, useRef, useState, type ReactNode } from "react";
import { cx } from "../../components/ui";
import { haptic } from "../../lib/native";

export function LiveCarousel({ children, label }: { children: ReactNode; label: string }) {
  const items = Children.toArray(children);
  const ref = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState(0);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    let frame = 0;
    const onScroll = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const first = el.firstElementChild as HTMLElement | null;
        if (!first) return;
        const step = first.offsetWidth + 12;
        const i = Math.max(0, Math.min(items.length - 1, Math.round(el.scrollLeft / step)));
        setActive((prev) => {
          if (prev !== i) void haptic("selection");
          return i;
        });
      });
    };
    el.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      cancelAnimationFrame(frame);
      el.removeEventListener("scroll", onScroll);
    };
  }, [items.length]);

  const go = (i: number) => {
    const el = ref.current;
    const first = el?.firstElementChild as HTMLElement | null;
    if (!el || !first) return;
    el.scrollTo({ left: i * (first.offsetWidth + 12), behavior: "smooth" });
  };

  return (
    <div>
      <div
        ref={ref}
        role="region"
        aria-roledescription="carousel"
        aria-label={label}
        className="scrollbar-none -mx-4 flex snap-x snap-mandatory gap-3 overflow-x-auto overscroll-x-contain scroll-px-4 px-4 pb-1"
      >
        {items.map((child, i) => (
          <div
            key={i}
            role="group"
            aria-roledescription="slide"
            aria-label={`${i + 1} of ${items.length}`}
            className="w-[86%] shrink-0 snap-start"
          >
            {child}
          </div>
        ))}
      </div>
      <div className="mt-2.5 flex justify-center gap-1.5" aria-hidden>
        {items.map((_, i) => (
          <button
            key={i}
            type="button"
            tabIndex={-1}
            onClick={() => go(i)}
            className={cx(
              "h-1.5 rounded-full transition-[width,background-color] duration-300 ease-out-quint",
              i === active ? "w-5 bg-live-400" : "w-1.5 bg-ink/20",
            )}
          />
        ))}
      </div>
    </div>
  );
}
