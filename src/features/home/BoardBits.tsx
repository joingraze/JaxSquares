// Small pieces shared by the Home cards.

import type { ReactNode } from "react";
import type { Team } from "../../../shared/types";
import { Badge, cx, TeamMark } from "../../components/ui";

/** Both teams' marks on a diagonal, corners touching, so neither abbreviation is covered. */
export function Matchup({ teamX, teamY }: { teamX: Team; teamY: Team }) {
  return (
    <span className="relative block h-12 w-12 shrink-0">
      <TeamMark team={teamX} size="sm" className="absolute left-0 top-0 -rotate-6" />
      <TeamMark team={teamY} size="sm" className="absolute bottom-0 right-0 rotate-6 ring-2 ring-surface-2" />
    </span>
  );
}

export function RoleBadge({ isHost }: { isHost: boolean }) {
  return isHost ? (
    // Soft volt: the filled volt is saved for the screen's one primary action.
    <span className="eyebrow inline-flex h-5.5 shrink-0 items-center rounded-md bg-brand-400/14 px-1.5 text-brand-300 ring-1 ring-inset ring-brand-400/25">
      Host
    </span>
  ) : (
    <Badge tone="outline">Playing</Badge>
  );
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
