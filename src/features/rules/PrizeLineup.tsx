// What players should know before they pick a square, in one compact,
// tappable line: the square price and the prize lineup ("$10 a square ·
// Q1 $100 · Half $200 · Final $400"), a "Just for fun" badge, and the
// per-player cap. Tapping opens the rules sheet. Renders nothing when the
// host set none of it (no empty placeholders). In-app only.

import type { Game } from "../../../shared/types";
import { ChevronRightIcon, TrophyIcon } from "../../components/icons";
import { cx } from "../../components/ui";
import { haptic } from "../../lib/native";
import { capLine, prizeLineup } from "./rulesModel";

export interface PrizeLineupProps {
  game: Pick<Game, "format" | "maxPerPlayer">;
  onOpen: () => void;
  className?: string;
}

export function PrizeLineup({ game, onOpen, className }: PrizeLineupProps) {
  const lineup = prizeLineup(game.format);
  const cap = capLine(game.maxPerPlayer);
  if (!lineup && !cap) return null;
  const parts = [...(lineup?.parts ?? []), ...(cap ? [cap] : [])];
  return (
    <button
      type="button"
      data-testid="prize-lineup"
      onClick={() => {
        void haptic("selection");
        onOpen();
      }}
      aria-label={`Rules and prizes: ${[lineup?.fun ? "Just for fun" : null, ...parts].filter(Boolean).join(", ")}`}
      className={cx(
        "pressable flex min-h-11 w-full items-center gap-2.5 rounded-2xl bg-surface-2 py-1.5 pl-2 pr-2.5 text-left ring-1 ring-inset ring-gold-line/30",
        className,
      )}
    >
      <span aria-hidden className="grid h-8 w-8 shrink-0 place-items-center rounded-xl bg-gold-400/15 text-ink-gold">
        {lineup?.fun ? <span className="text-[1rem] leading-none">🎉</span> : <TrophyIcon size={16} filled />}
      </span>
      <span className="line-clamp-3 min-w-0 flex-1 text-footnote leading-snug">
        {lineup?.fun && (
          <span className="mr-1.5 inline-flex h-5 items-center rounded-md bg-accent-500/20 px-1.5 align-[1px] text-caption font-extrabold text-ink-accent">
            Just for fun
          </span>
        )}
        <span className="font-bold tabular-nums text-ink">
          {parts.map((p, i) => (
            <span key={p}>
              {i > 0 && <span aria-hidden className="mx-1 font-normal text-ink-subtle">·</span>}
              <span className={i === 0 && !lineup?.fun ? "text-ink-gold" : undefined}>{p}</span>
            </span>
          ))}
          {parts.length === 0 && <span className="font-semibold text-ink-muted">See the rules</span>}
        </span>
      </span>
      <span className="flex shrink-0 items-center gap-0.5 text-caption font-extrabold text-ink-brand">
        Rules
        <ChevronRightIcon size={14} strokeWidth={2.6} />
      </span>
    </button>
  );
}
