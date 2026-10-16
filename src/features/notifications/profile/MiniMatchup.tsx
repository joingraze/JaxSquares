import type { Team } from "../../../../shared/types";
import { contrastText, initialsOf, readableTeamColor } from "../../../lib/format";

function Chip({ team, className }: { team: Team; className: string }) {
  const color = readableTeamColor(team.color, "#45594c");
  return (
    <span
      style={{ backgroundColor: color, color: contrastText(color) }}
      className={`absolute grid h-6 w-6 place-items-center rounded-md font-display text-[0.5625rem] font-extrabold tracking-tight shadow-[inset_0_-2px_0_rgb(0_0_0/0.2),inset_0_1px_0_rgb(255_255_255/0.3)] ${className}`}
    >
      {(team.abbr || initialsOf(team.name)).slice(0, 3).toUpperCase()}
    </span>
  );
}

/** Both teams' marks on a diagonal, corners just touching so both abbreviations stay readable. */
export function MiniMatchup({ teamX, teamY }: { teamX: Team; teamY: Team }) {
  return (
    <span aria-hidden className="relative block h-11 w-11 shrink-0">
      <Chip team={teamX} className="left-0 top-0" />
      <Chip team={teamY} className="bottom-0 right-0 ring-2 ring-surface-2" />
    </span>
  );
}
