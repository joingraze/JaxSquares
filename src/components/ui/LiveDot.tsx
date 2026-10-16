import { cx } from "./cx";

export interface LiveDotProps {
  tone?: "live" | "brand" | "gold" | "muted";
  /** Pulse ring (off for "nothing happening" states). */
  pulse?: boolean;
  size?: "sm" | "md";
  /** Screen-reader text, e.g. "Live". */
  label?: string;
  className?: string;
}

const TONE = { live: "bg-live-500", brand: "bg-brand-400", gold: "bg-gold-400", muted: "bg-pitch-400" } as const;

export function LiveDot({ tone = "live", pulse = true, size = "sm", label, className }: LiveDotProps) {
  const dim = size === "sm" ? "h-2 w-2" : "h-2.5 w-2.5";
  return (
    <span className={cx("relative inline-flex shrink-0", dim, className)}>
      {pulse && <span aria-hidden className={cx("absolute inset-0 animate-live rounded-full", TONE[tone])} />}
      <span aria-hidden className={cx("relative inline-flex rounded-full", dim, TONE[tone])} />
      {label && <span className="sr-only">{label}</span>}
    </span>
  );
}
