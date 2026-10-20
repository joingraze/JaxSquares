import { cx } from "./cx";

export interface LiveDotProps {
  /**
   * "live" (default): the one live indicator app-wide, red-zone red with a
   * pulse. "brand" is an alias of "live" (live is never the volt CTA color).
   * "gold" / "muted": a waiting or idle state (connecting, drawing numbers).
   */
  tone?: "live" | "brand" | "gold" | "muted";
  /** Pulse ring (off for "nothing happening" states). */
  pulse?: boolean;
  size?: "sm" | "md";
  /** Screen-reader text, e.g. "Live". */
  label?: string;
  className?: string;
}

const TONE = { live: "bg-live-500", brand: "bg-live-500", gold: "bg-gold-400", muted: "bg-pitch-400" } as const;
/** A faint halo so the dot reads as a light, not a bullet, even when it isn't pulsing. */
const HALO = {
  live: "shadow-[0_0_0_2px_rgb(255_64_64/0.22)]",
  brand: "shadow-[0_0_0_2px_rgb(255_64_64/0.22)]",
  gold: "shadow-[0_0_0_2px_rgb(255_194_51/0.2)]",
  muted: "",
} as const;

export function LiveDot({ tone = "live", pulse = true, size = "sm", label, className }: LiveDotProps) {
  const dim = size === "sm" ? "h-2 w-2" : "h-2.5 w-2.5";
  return (
    <span className={cx("relative inline-flex shrink-0", dim, className)}>
      {pulse && <span aria-hidden className={cx("absolute inset-0 animate-live rounded-full", TONE[tone])} />}
      <span aria-hidden className={cx("relative inline-flex rounded-full", dim, TONE[tone], HALO[tone])} />
      {label && <span className="sr-only">{label}</span>}
    </span>
  );
}
