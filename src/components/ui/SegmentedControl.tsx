import { useId, useRef, type KeyboardEvent, type ReactNode } from "react";
import { haptic } from "../../lib/native";
import { cx } from "./cx";

export interface SegmentOption<T extends string | number> {
  value: T;
  label: ReactNode;
  icon?: ReactNode;
  disabled?: boolean;
}

export interface SegmentedControlProps<T extends string | number> {
  options: readonly SegmentOption<T>[];
  value: T;
  onChange: (value: T) => void;
  "aria-label": string;
  size?: "sm" | "md";
  className?: string;
}

/**
 * Equal-width segments with a sliding thumb. Arrow keys move the selection
 * (radio group semantics). Every segment is at least 44pt tall: `sm` only
 * tightens the type and the inset around the thumb.
 */
export function SegmentedControl<T extends string | number>({
  options,
  value,
  onChange,
  size = "md",
  className,
  ...aria
}: SegmentedControlProps<T>) {
  const name = useId();
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const index = Math.max(0, options.findIndex((o) => o.value === value));
  const n = options.length;

  const select = (i: number) => {
    const opt = options[i];
    if (!opt || opt.disabled) return;
    if (opt.value !== value) {
      void haptic("selection");
      onChange(opt.value);
    }
    refs.current[i]?.focus();
  };

  const onKeyDown = (e: KeyboardEvent) => {
    const step = e.key === "ArrowRight" || e.key === "ArrowDown" ? 1 : e.key === "ArrowLeft" || e.key === "ArrowUp" ? -1 : 0;
    if (!step) return;
    e.preventDefault();
    for (let k = 1; k <= n; k++) {
      const i = (index + step * k + n) % n;
      if (!options[i].disabled) return select(i);
    }
  };

  return (
    <div
      role="radiogroup"
      aria-label={aria["aria-label"]}
      onKeyDown={onKeyDown}
      className={cx(
        "relative grid rounded-2xl bg-surface-2 ring-1 ring-inset ring-line",
        // Segment = height - 2 x inset >= 44px.
        size === "sm" ? "h-12 p-0.5" : "h-13 p-1",
        className,
      )}
      style={{ gridTemplateColumns: `repeat(${n}, minmax(0, 1fr))` }}
    >
      <span
        aria-hidden
        className={cx(
          "absolute bg-surface-4 shadow-[inset_0_1px_0_rgb(255_255_255/0.08),0_4px_12px_-4px_rgb(0_0_0/0.6)] ring-1 ring-inset ring-line-strong transition-transform duration-300 ease-spring",
          size === "sm" ? "inset-y-0.5 left-0.5 rounded-[0.875rem]" : "inset-y-1 left-1 rounded-xl",
        )}
        style={{ width: `calc((100% - ${size === "sm" ? "0.25rem" : "0.5rem"}) / ${n})`, transform: `translateX(${index * 100}%)` }}
      />
      {options.map((opt, i) => {
        const selected = i === index;
        return (
          <button
            key={String(opt.value)}
            ref={(el) => {
              refs.current[i] = el;
            }}
            type="button"
            role="radio"
            name={name}
            aria-checked={selected}
            tabIndex={selected ? 0 : -1}
            disabled={opt.disabled}
            onClick={() => select(i)}
            className={cx(
              "relative z-10 inline-flex min-h-11 min-w-0 items-center justify-center gap-1.5 rounded-xl px-2 font-bold transition-colors",
              size === "sm" ? "text-footnote" : "text-subhead",
              selected ? "text-ink" : "text-ink-subtle hover:text-ink-muted",
              "disabled:opacity-40",
            )}
          >
            {opt.icon && <span className="inline-flex [&>svg]:h-4 [&>svg]:w-4">{opt.icon}</span>}
            <span className="truncate">{opt.label}</span>
          </button>
        );
      })}
    </div>
  );
}
