import type { ReactNode } from "react";
import { cx } from "./cx";

export type BadgeTone = "neutral" | "brand" | "gold" | "live" | "accent" | "danger" | "outline";

const TONE: Record<BadgeTone, string> = {
  neutral: "bg-surface-4 text-ink-muted",
  brand: "bg-brand-400 text-ink-inverse",
  gold: "bg-gold-400 text-ink-inverse",
  live: "bg-live-500 text-white",
  accent: "bg-accent-500 text-white",
  danger: "bg-danger-500/15 text-ink-danger ring-1 ring-inset ring-danger-500/40",
  outline: "text-ink-muted ring-1 ring-inset ring-line-strong",
};

export interface BadgeProps {
  tone?: BadgeTone;
  icon?: ReactNode;
  children: ReactNode;
  className?: string;
}

/** Small uppercase status pill: "LIVE", "HOST", "FINAL", "Q3". */
export function Badge({ tone = "neutral", icon, children, className }: BadgeProps) {
  return (
    <span
      className={cx(
        "eyebrow inline-flex h-5.5 shrink-0 items-center gap-1 whitespace-nowrap rounded-md px-1.5 tabular-nums",
        TONE[tone],
        className,
      )}
    >
      {icon && <span className="inline-flex [&>svg]:h-3 [&>svg]:w-3">{icon}</span>}
      {children}
    </span>
  );
}
