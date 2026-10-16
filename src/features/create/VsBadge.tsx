// The one "VS" between two teams: the builder, the checkout ticket and anything
// else in the create flow use this so a matchup looks the same on every screen.

import { cx } from "../../components/ui";

export function VsBadge({ size = "md", className }: { size?: "sm" | "md"; className?: string }) {
  return (
    <span
      aria-hidden
      className={cx(
        "inline-grid shrink-0 place-items-center rounded-full bg-surface-4 font-display font-extrabold tracking-wide text-ink-muted ring-1 ring-inset ring-line-strong",
        size === "sm" ? "h-6 w-6 text-[0.5625rem]" : "h-8 w-8 text-caption",
        className,
      )}
    >
      VS
    </span>
  );
}
