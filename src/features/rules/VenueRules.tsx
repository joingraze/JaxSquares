// A board's house rules (shared/venue.ts), with the venue lines a club's free
// board shows ("Free to play · No purchase necessary", "Prizes from The Rusty
// Anchor") and, with claim codes on, how a winner collects. Nothing when the
// board has none of them. On the rules sheet; the TV draws its own.

import type { Game } from "../../../shared/types";
import { CLAIM_LINE, shownHouseRules, venueLines } from "../../../shared/venue";
import { CheckIcon, GiftIcon } from "../../components/icons";

export function VenueRules({ game }: { game: Pick<Game, "format"> & Partial<Pick<Game, "club">> }) {
  const rules = shownHouseRules(game.format);
  const lines = venueLines(game);
  const claim = game.format.claimCodes === true;
  if (rules.length === 0 && lines.length === 0 && !claim) return null;
  return (
    <section aria-label="House rules" data-testid="venue-rules" className="rounded-card bg-surface-3/60 px-3.5 py-3 ring-1 ring-inset ring-line">
      <h3 className="eyebrow mb-2 text-ink-subtle">House rules</h3>
      <ul className="flex flex-col gap-1.5 text-callout text-ink">
        {[...rules, ...(claim ? [CLAIM_LINE] : [])].map((rule) => (
          <li key={rule} className="flex items-start gap-2">
            <CheckIcon size={15} strokeWidth={3} className="mt-[0.2em] shrink-0 text-ink-brand" />
            <span>{rule}</span>
          </li>
        ))}
      </ul>
      {lines.length > 0 && (
        <p data-testid="venue-lines" className="mt-2.5 flex items-start gap-2 text-footnote font-semibold text-ink-gold">
          <GiftIcon size={15} className="mt-px shrink-0" />
          {lines.join(" · ")}
        </p>
      )}
    </section>
  );
}
