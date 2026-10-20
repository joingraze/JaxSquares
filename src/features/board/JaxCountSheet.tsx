// "Let Jax pick": how many squares should he pick? Quick counts, a stepper for
// anything else, capped at what I'm allowed (squares open, my per-player max).
// Remembers the last count on this device.

import { useEffect, useState } from "react";
import { formatAmount } from "../../../shared/formats";
import type { AmountUnit } from "../../../shared/types";
import { BottomSheet, Button, Jax, Stepper, cx } from "../../components/ui";
import { haptic } from "../../lib/native";
import { jaxQuickCounts } from "./jaxPick";

const LAST_COUNT_KEY = "jaxsquares.jaxCount";

function lastCount(): number {
  try {
    const n = Number(localStorage.getItem(LAST_COUNT_KEY));
    return Number.isInteger(n) && n > 0 ? n : 1;
  } catch {
    return 1;
  }
}

function rememberCount(n: number): void {
  try {
    localStorage.setItem(LAST_COUNT_KEY, String(n));
  } catch {
    // Private mode or storage off: next time starts at 1.
  }
}

export interface JaxCountSheetProps {
  open: boolean;
  onClose: () => void;
  /** Most Jax may pick (jaxPickLimit), at least 2 when the sheet opens. */
  limit: number;
  /** Open squares on the board. */
  openSquares: number;
  /** Squares I can still take under the per-player max; null when there's no max. */
  capLeft: number | null;
  /** The host's square price, to show what the pick adds up to (display only). */
  price: number | null;
  unit: AmountUnit;
  onPick: (count: number) => void;
}

export function JaxCountSheet({ open, onClose, limit, openSquares, capLeft, price, unit, onPick }: JaxCountSheetProps) {
  const [count, setCount] = useState(1);
  useEffect(() => {
    if (open) setCount(Math.min(Math.max(1, lastCount()), Math.max(1, limit)));
  }, [open, limit]);

  const capped = capLeft !== null && capLeft <= openSquares;
  const choices = jaxQuickCounts(limit, capped);
  const plural = count === 1 ? "square" : "squares";

  const pick = () => {
    rememberCount(count);
    onPick(count);
  };

  return (
    <BottomSheet
      open={open}
      onClose={onClose}
      title="How many squares?"
      description="Jax picks them at random from the open squares."
      footer={
        <Button data-testid="jax-count-confirm" size="lg" className="w-full" onClick={pick}>
          Pick {count} {plural}
        </Button>
      }
    >
      <div data-testid="jax-count-sheet" className="flex flex-col items-center gap-4 pb-1">
        <div className="flex items-center gap-4">
          <Jax pose="face" size={56} />
          <Stepper
            label="Squares for Jax to pick"
            value={count}
            min={1}
            max={Math.max(1, limit)}
            onChange={setCount}
            format={(n) => <span className="font-display text-title-2 font-extrabold tabular-nums">{n}</span>}
            valueText={(n) => `${n} ${n === 1 ? "square" : "squares"}`}
          />
        </div>

        <div role="group" aria-label="Quick counts" className="flex flex-wrap justify-center gap-2">
          {choices.map((c) => (
            <button
              key={c.count}
              type="button"
              data-testid="jax-count-chip"
              data-count={c.count}
              aria-pressed={count === c.count}
              onClick={() => {
                void haptic("selection");
                setCount(c.count);
              }}
              className={cx(
                "pressable h-11 min-w-12 rounded-full px-4 text-callout font-extrabold tabular-nums ring-1 ring-inset transition-colors",
                count === c.count ? "bg-brand-400 text-ink-inverse ring-brand-line" : "bg-surface-3 text-ink ring-line-strong",
              )}
            >
              {c.label}
            </button>
          ))}
        </div>

        <p className="text-center text-footnote text-ink-muted">
          {openSquares} {openSquares === 1 ? "square" : "squares"} open
          {capLeft !== null && <> · you can take {capLeft} more</>}
          {price !== null && price > 0 && (
            <>
              {" · "}
              <span className="font-bold text-ink-gold">
                {count} × {formatAmount(price, unit)} = {formatAmount(price * count, unit)}
              </span>
            </>
          )}
        </p>
      </div>
    </BottomSheet>
  );
}
