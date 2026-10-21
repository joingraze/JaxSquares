// A winner's prizes on a venue board (claim codes on, shared/venue.ts), on
// their own phone only (GET /api/games/:id/claims): what they won, the code
// staff check against Host tools, how long they have left to collect, and
// "Show my winning pass" (WinningPass), where staff mark it collected. Once
// it's collected (here or in Host tools) the row says so.

import { useState } from "react";
import { formatAmount, unitOf } from "../../../shared/formats";
import { resolveResults } from "../../../shared/squares";
import type { ClaimCode, ClaimsResponse, GameState } from "../../../shared/types";
import { claimDeadline, collectedFor, countdownText } from "../../../shared/venue";
import { CheckIcon, TrophyIcon } from "../../components/icons";
import { Button } from "../../components/ui";
import { useNow } from "../board/useNow";
import { WinningPass } from "./WinningPass";

export interface ClaimCardProps {
  state: GameState;
  claims: ClaimsResponse | null;
  /** Marks a prize collected from this phone; rejects with a message to show. */
  onCollect: (code: ClaimCode) => Promise<void>;
}

const keyOf = (c: Pick<ClaimCode, "periodKey" | "reverse">) => `${c.periodKey}-${c.reverse ? "r" : "s"}`;

export function ClaimCard({ state, claims, onCollect }: ClaimCardProps) {
  const [open, setOpen] = useState<string | null>(null);
  const mine = claims?.enabled ? claims.mine : [];
  const ticking = mine.some((c) => claimDeadline(state, c.periodKey) !== null && !collectedFor(state, c.periodKey, c.reverse, c.playerId));
  const now = useNow(ticking ? 1000 : 60_000);
  if (mine.length === 0) return null;

  const results = resolveResults(state);
  const unit = unitOf(state.game.format);
  const rows = mine.map((c) => {
    const r = results.find((x) => x.periodKey === c.periodKey);
    const note = (c.reverse ? r?.reversePrize : r?.prize) || null;
    const amount = c.reverse ? r?.reverseAmount : r?.amount;
    return {
      code: c,
      label: `${c.label}${c.reverse ? " · reverse" : ""}`,
      prize: [amount ? formatAmount(amount, unit) : null, note].filter(Boolean).join(" · ") || null,
      deadline: claimDeadline(state, c.periodKey),
      collected: collectedFor(state, c.periodKey, c.reverse, c.playerId),
    };
  });
  const waiting = rows.some((r) => !r.collected);
  const shown = rows.find((r) => keyOf(r.code) === open) ?? null;
  const me = state.players.find((p) => p.id === mine[0].playerId) ?? null;

  return (
    <section aria-label="Your prizes" data-testid="claim-card" className="rounded-card bg-gold-400/12 p-3.5 ring-1 ring-inset ring-gold-line/45">
      <p className="flex items-center gap-2 font-display text-headline font-extrabold text-ink">
        <TrophyIcon size={18} filled className="text-ink-gold" />
        {waiting ? "You won! Show staff your winning pass" : "Prize collected"}
      </p>
      <ul className="mt-2.5 flex flex-col gap-2">
        {rows.map((r) => {
          const left = r.deadline !== null ? r.deadline - now : null;
          const expired = left !== null && left <= 0;
          return (
            <li key={keyOf(r.code)} className="rounded-2xl bg-surface-2 px-3.5 py-3 ring-1 ring-inset ring-line" data-testid="claim-row">
              <div className="flex items-center gap-3">
                <span className="min-w-0 flex-1">
                  <span className="block text-callout font-bold text-ink">{r.label}</span>
                  {r.prize && <span className="block truncate text-footnote text-ink-muted">{r.prize}</span>}
                </span>
                <span
                  data-testid="claim-code"
                  aria-label={`Claim code ${[...r.code.code].join(" ")}`}
                  className="font-display text-title-2 font-extrabold tracking-[0.18em] text-ink-gold tabular-nums"
                >
                  {r.code.code}
                </span>
              </div>
              {r.collected ? (
                <p className="mt-2 flex items-center gap-1.5 text-footnote font-bold text-ink-brand" data-testid="claim-collected">
                  <CheckIcon size={15} strokeWidth={3} />
                  Collected at {new Date(r.collected.at).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}
                </p>
              ) : (
                <div className="mt-2.5 flex flex-wrap items-center gap-x-3 gap-y-2">
                  <Button size="sm" variant="gold" onClick={() => setOpen(keyOf(r.code))} data-testid="claim-show">
                    Show my winning pass
                  </Button>
                  {left !== null && (
                    <span className={expired ? "text-footnote font-semibold text-ink-muted" : "text-footnote font-bold tabular-nums text-ink-gold"} data-testid="claim-countdown">
                      {expired ? "Time's up. Ask staff." : `${countdownText(left)} left to collect`}
                    </span>
                  )}
                </div>
              )}
            </li>
          );
        })}
      </ul>
      {shown && (
        <WinningPass
          boardName={state.game.name}
          player={me}
          label={shown.label}
          prize={shown.prize}
          code={shown.code.code}
          deadline={shown.deadline}
          collectedAt={shown.collected?.at ?? null}
          onCollect={() => onCollect(shown.code)}
          onClose={() => setOpen(null)}
        />
      )}
    </section>
  );
}
