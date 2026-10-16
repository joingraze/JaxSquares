import type { ReactNode } from "react";
import { cx } from "./cx";

export interface ProgressRingProps {
  /** 0..1 */
  value: number;
  size?: number;
  stroke?: number;
  tone?: "brand" | "gold" | "accent";
  /** Centered content, e.g. "64". */
  children?: ReactNode;
  /** Accessible description, e.g. "64 of 100 squares claimed". */
  label: string;
  className?: string;
}

const STROKE = { brand: "stroke-brand-400", gold: "stroke-gold-400", accent: "stroke-accent-500" } as const;

export function ProgressRing({ value, size = 56, stroke = 6, tone = "brand", children, label, className }: ProgressRingProps) {
  const v = Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0));
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  return (
    <span
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(v * 100)}
      className={cx("relative inline-grid shrink-0 place-items-center", className)}
      style={{ width: size, height: size }}
    >
      <svg width={size} height={size} className="-rotate-90" aria-hidden>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" strokeWidth={stroke} className="stroke-white/10" />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={c * (1 - v)}
          className={cx(STROKE[tone], "transition-[stroke-dashoffset] duration-700 ease-out-quint")}
        />
      </svg>
      {children !== undefined && (
        <span className="absolute inset-0 grid place-items-center font-display text-subhead font-extrabold tabular-nums">{children}</span>
      )}
    </span>
  );
}
