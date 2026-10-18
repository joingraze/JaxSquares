// The per-player cap, worded as a cap everywhere: "Max squares per player",
// "No max" / "Up to 5". Shared by the create page and the host's edit sheet.

import type { ReactNode } from "react";
import { LockIcon } from "../../components/icons";
import { Stepper, cx } from "../../components/ui";
import { maxValueText } from "./rulesModel";

export interface MaxSquaresProps {
  value: number;
  onChange: (value: number) => void;
  /** Squares on the board (the highest cap). */
  total: number;
  /** Locked with the board (squares are frozen): shown, not editable. */
  locked?: boolean;
  className?: string;
}

export const MAX_SQUARES_LABEL = "Max squares per player";
export const MAX_SQUARES_HELP = "Cap how many squares one person can claim.";

export function MaxSquares({ value, onChange, total, locked = false, className }: MaxSquaresProps) {
  let help: ReactNode = MAX_SQUARES_HELP;
  if (locked) {
    help = (
      <>
        <LockIcon size={13} /> Locked with the board
      </>
    );
  }
  return (
    <div className={cx("flex items-center justify-between gap-3", className)}>
      <div className="min-w-0">
        <p className="text-callout font-bold text-ink">{MAX_SQUARES_LABEL}</p>
        <p className="mt-0.5 flex items-center gap-1 text-footnote text-ink-muted">{help}</p>
      </div>
      <Stepper
        label={MAX_SQUARES_LABEL}
        value={Math.min(value, total)}
        min={0}
        max={total}
        disabled={locked}
        onChange={onChange}
        className="shrink-0"
        format={(v) =>
          v === 0 ? (
            <span className="text-callout">No max</span>
          ) : (
            <span className="flex items-baseline gap-1">
              <span className="text-footnote font-bold text-ink-muted">Up to</span>
              {v}
            </span>
          )
        }
        valueText={maxValueText}
      />
    </div>
  );
}
