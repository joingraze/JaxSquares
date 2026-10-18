import type { ReactNode } from "react";
import { cx } from "./cx";

export interface MeterProps {
  value: number;
  max: number;
  /** Left label, e.g. "Squares claimed". */
  label?: ReactNode;
  /** Show "64/100" on the right. */
  showCount?: boolean;
  tone?: "brand" | "gold" | "accent";
  size?: "sm" | "md";
  className?: string;
}

const FILL = {
  brand: "bg-brand-400 shadow-[0_0_12px_rgb(198_249_31/0.5)]",
  gold: "bg-gold-400 shadow-[0_0_12px_rgb(255_194_51/0.5)]",
  accent: "bg-accent-500",
} as const;

/** Horizontal fill bar, e.g. squares filled on a board. Full = gold. */
export function Meter({ value, max, label, showCount = true, tone = "brand", size = "md", className }: MeterProps) {
  const pct = max > 0 ? Math.max(0, Math.min(100, (value / max) * 100)) : 0;
  const full = pct >= 100;
  return (
    <div className={className}>
      {(label || showCount) && (
        <div className="mb-1.5 flex items-baseline justify-between gap-2 text-footnote">
          {label && <span className="font-semibold text-ink-muted">{label}</span>}
          {showCount && (
            <span className="ml-auto font-bold tabular-nums text-ink">
              {value}
              <span className="text-ink-subtle">/{max}</span>
            </span>
          )}
        </div>
      )}
      <div
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={max}
        aria-valuenow={value}
        aria-label={typeof label === "string" ? label : undefined}
        className={cx("overflow-hidden rounded-full bg-ink/8", size === "sm" ? "h-1.5" : "h-2.5")}
      >
        <div
          className={cx("h-full rounded-full transition-[width] duration-700 ease-out-quint", FILL[full ? "gold" : tone])}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}
