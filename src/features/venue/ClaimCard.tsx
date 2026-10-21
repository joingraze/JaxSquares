// A winner's claim codes on a venue board (shared/venue.ts): what they won and
// the code to show the staff, who check it against Host tools. Only the
// winner's own phone gets these (GET /api/games/:id/claims).

import { formatAmount, unitOf } from "../../../shared/formats";
import { resolveResults } from "../../../shared/squares";
import type { ClaimsResponse, GameState } from "../../../shared/types";
import { TrophyIcon } from "../../components/icons";

export function ClaimCard({ state, claims }: { state: GameState; claims: ClaimsResponse | null }) {
  if (!claims?.enabled || claims.mine.length === 0) return null;
  const results = resolveResults(state);
  const unit = unitOf(state.game.format);
  return (
    <section
      aria-label="Your claim codes"
      data-testid="claim-card"
      className="rounded-card bg-gold-400/12 p-3.5 ring-1 ring-inset ring-gold-line/45"
    >
      <p className="flex items-center gap-2 font-display text-headline font-extrabold text-ink">
        <TrophyIcon size={18} filled className="text-ink-gold" />
        You won! Show staff your code
      </p>
      <ul className="mt-2.5 flex flex-col gap-2">
        {claims.mine.map((c) => {
          const r = results.find((x) => x.periodKey === c.periodKey);
          const note = (c.reverse ? r?.reversePrize : r?.prize) || null;
          const amount = c.reverse ? r?.reverseAmount : r?.amount;
          const prize = [amount ? formatAmount(amount, unit) : null, note].filter(Boolean).join(" · ");
          return (
            <li key={`${c.periodKey}-${c.reverse}`} className="flex items-center gap-3 rounded-2xl bg-surface-2 px-3.5 py-2.5 ring-1 ring-inset ring-line">
              <span className="min-w-0 flex-1">
                <span className="block text-callout font-bold text-ink">
                  {c.label}
                  {c.reverse ? " · reverse" : ""}
                </span>
                {prize && <span className="block truncate text-footnote text-ink-muted">{prize}</span>}
              </span>
              <span
                data-testid="claim-code"
                aria-label={`Claim code ${[...c.code].join(" ")}`}
                className="font-display text-title-2 font-extrabold tracking-[0.18em] text-ink-gold tabular-nums"
              >
                {c.code}
              </span>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
