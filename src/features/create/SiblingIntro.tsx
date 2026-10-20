// The top of the price step when a host adds another board for a game: which
// game it is and what carries over from the board it's made from (the game,
// the rules, that board's price for reference), so the one thing left to pick
// is this board's square price. In-app only, like every amount.

import type { Team } from "../../../shared/types";
import { TeamMark } from "../../components/ui";
import type { SiblingSeed } from "./sibling";

export function SiblingIntro({ seed, teamX, teamY, matchup }: { seed: SiblingSeed; teamX: Team; teamY: Team; matchup: string }) {
  return (
    <section
      data-testid="sibling-intro"
      aria-label="Another board for this game"
      className="flex items-center gap-3 rounded-card bg-surface-2 p-3.5 ring-1 ring-inset ring-line"
    >
      <span aria-hidden className="flex shrink-0 gap-1">
        <TeamMark team={teamX} size="sm" />
        <TeamMark team={teamY} size="sm" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="eyebrow block text-ink-subtle">Another board for this game</span>
        <span className="block truncate font-display text-headline font-extrabold leading-tight text-ink">{matchup}</span>
        <span className="mt-0.5 block text-footnote leading-snug text-ink-muted">
          Same game and rules as <b className="font-bold text-ink">{seed.source.name}</b>
          {seed.source.price ? ` (${seed.source.price})` : ""}.
        </span>
      </span>
    </section>
  );
}
