// Small pieces shared by the Home cards.

import { useEffect, useRef, useState, type ReactNode } from "react";
import type { Team } from "../../../shared/types";
import { cx, prefersReducedMotion, TeamMark } from "../../components/ui";
import { withTeamColors } from "./sections";

/** Both teams' marks on a diagonal, corners touching, so neither abbreviation is covered. */
export function Matchup({ teamX, teamY }: { teamX: Team; teamY: Team }) {
  const [x, y] = withTeamColors(teamX, teamY);
  return (
    <span className="relative block h-12 w-12 shrink-0">
      <TeamMark team={x} size="sm" className="absolute left-0 top-0 -rotate-6" />
      <TeamMark team={y} size="sm" className="absolute bottom-0 right-0 rotate-6 ring-2 ring-surface-2" />
    </span>
  );
}

/** Quiet role label: "Your board" or "You're in". Game state lives elsewhere on the card. */
export function RoleLabel({ isHost, className }: { isHost: boolean; className?: string }) {
  return <span className={cx("shrink-0 text-caption font-semibold text-ink-subtle", className)}>{isHost ? "Your board" : "You're in"}</span>;
}

/** Section heading: tracked caps, optional live dot / count, optional trailing control. */
export function SectionHeader({
  id,
  icon,
  title,
  count,
  tone = "muted",
  trailing,
}: {
  id: string;
  icon?: ReactNode;
  title: string;
  count?: number;
  tone?: "muted" | "live" | "brand" | "gold";
  trailing?: ReactNode;
}) {
  const color = { muted: "text-ink-subtle", live: "text-live-400", brand: "text-brand-400", gold: "text-gold-400" }[tone];
  return (
    <div className="mb-2.5 flex items-center gap-2 px-1">
      {icon}
      <h2 id={id} className={cx("eyebrow", color)}>
        {title}
      </h2>
      {count !== undefined && count > 1 && (
        <span className="grid h-4.5 min-w-4.5 place-items-center rounded-full bg-surface-4 px-1 text-[0.625rem] font-extrabold tabular-nums text-ink-muted">
          {count}
        </span>
      )}
      {trailing && <div className="ml-auto">{trailing}</div>}
    </div>
  );
}

/** Number that replays a small tick-up animation whenever it changes. */
export function TickNumber({ value, className }: { value: number; className?: string }) {
  return (
    <span className={cx("inline-block overflow-hidden align-bottom", className)}>
      <span key={value} className="inline-block animate-tick">
        {value}
      </span>
    </span>
  );
}

/**
 * A count that rolls to its new value when it changes (100 → 95 counts down
 * through 99, 98...) and gives a little bump, so a change made by someone
 * else is noticed. Jumps straight there under reduced motion.
 */
export function CountUp({ value, className }: { value: number; className?: string }) {
  const [shown, setShown] = useState(value);
  const [bumps, setBumps] = useState(0);
  const shownRef = useRef(value);

  useEffect(() => {
    const from = shownRef.current;
    if (from === value) return;
    setBumps((b) => b + 1);
    if (prefersReducedMotion()) {
      shownRef.current = value;
      setShown(value);
      return;
    }
    const start = performance.now();
    const duration = Math.min(900, 300 + Math.abs(value - from) * 70);
    let frame = 0;
    const step = (t: number) => {
      const p = Math.min(1, (t - start) / duration);
      const eased = 1 - (1 - p) ** 3;
      const next = Math.round(from + (value - from) * eased);
      shownRef.current = next;
      setShown(next);
      if (p < 1) frame = requestAnimationFrame(step);
    };
    frame = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frame);
  }, [value]);

  return (
    <span key={bumps} className={cx("inline-block tabular-nums", bumps > 0 && "home-bump", className)}>
      {shown}
    </span>
  );
}

/**
 * Squares claimed, as a slim meter under the card's count (the count itself
 * is said once, in words: "42 left"). The fill never shrinks to an invisible
 * sliver; full boards (and ones ready to draw, `gold`) go gold.
 */
export function FillMeter({ value, max, gold = false, className }: { value: number; max: number; gold?: boolean; className?: string }) {
  const pct = max > 0 ? Math.max(0, Math.min(100, (value / max) * 100)) : 0;
  const full = gold || pct >= 100;
  return (
    <div
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={max}
      aria-valuenow={value}
      aria-label={`${value} of ${max} squares claimed`}
      className={cx("relative h-1.5 min-w-0 overflow-hidden rounded-full bg-white/8 ring-1 ring-inset ring-white/4", className)}
    >
      <div
        className={cx("h-full rounded-full transition-[width] duration-700 ease-out-quint", full ? "bg-gold-400" : "bg-brand-400")}
        style={{ width: `${pct}%`, minWidth: value > 0 ? "0.375rem" : 0 }}
      />
    </div>
  );
}
