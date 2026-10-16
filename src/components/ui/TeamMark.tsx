import type { Team } from "../../../shared/types";
import { contrastText, initialsOf, readableTeamColor } from "../../lib/format";
import { cx } from "./cx";

export interface TeamMarkProps {
  team: Team;
  size?: "sm" | "md" | "lg";
  className?: string;
}

const DIM = { sm: "h-7 w-7 text-[0.625rem] rounded-lg", md: "h-10 w-10 text-caption rounded-xl", lg: "h-14 w-14 text-subhead rounded-2xl" } as const;

/** Team abbreviation on the team's color: the team-color moment for cards and score rows. */
export function TeamMark({ team, size = "md", className }: TeamMarkProps) {
  const color = readableTeamColor(team.color, "#45594c");
  const abbr = (team.abbr || initialsOf(team.name)).slice(0, 4).toUpperCase();
  return (
    <span
      role="img"
      aria-label={team.name}
      style={{ backgroundColor: color, color: contrastText(color) }}
      className={cx(
        "inline-grid shrink-0 place-items-center font-display font-extrabold tracking-tight",
        "shadow-[inset_0_-3px_0_rgb(0_0_0/0.2),inset_0_1px_0_rgb(255_255_255/0.3)]",
        DIM[size],
        className,
      )}
    >
      <span aria-hidden>{abbr}</span>
    </span>
  );
}
