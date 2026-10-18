// The two every-score setups, offered right where every score change is
// turned on (the create page's Every score card and the editor's every-score
// row): "Also pay the reverse at each quarter and the final" (one switch that
// turns on Q1, Half, Q3 and Final for the reverse square) and "Amount by
// score type" (a touchdown, field goal, extra point, 2-point conversion and
// safety can each show their own amount, so an extra point can show less than
// a touchdown). The kinds the host hasn't set by hand follow the touchdown as
// clean multiples (TD $100: FG, 2-PT and Safety $50, XP $25).
//
// Amounts are display-only: the app never collects or sends money.

import { useEffect, useRef } from "react";
import { SCORE_KIND_INFO, SCORE_KINDS, kindAmount, ruleFor } from "../../../shared/formats";
import type { MomentRule, ScoreKind } from "../../../shared/types";
import { Switch, cx } from "../../components/ui";
import { AmountField } from "./AmountField";
import {
  SIDES,
  byKindOn,
  parseAmount,
  reverseQuartersAmount,
  reverseQuartersOn,
  setByKind,
  setKindAmount,
  setReverseQuarters,
  setReverseQuartersAmount,
  setTouchdownAmount,
  type Side,
} from "./rulesModel";

export interface EveryScoreOptionsProps {
  rules: MomentRule[];
  onRules: (rules: MomentRule[]) => void;
  /** The board's unit while amounts are on; null when they aren't (not chosen yet, or just for fun). */
  unit: "$" | "pts" | null;
  /** Just for fun: no amounts at all, so no amount by score type. */
  fun?: boolean;
  /**
   * "Amount by score type" turned on before dollars or points were chosen:
   * choose dollars and take these rules, in one change (instead of onRules).
   */
  onNeedAmounts?: (rules: MomentRule[]) => void;
  /** Scoring has started: which moments win can't change (the reverse switch is shown locked). */
  locked?: boolean;
  /** Also show one amount for every quarter-end's reverse square (where the per-moment rows aren't on screen). */
  reverseAmount?: boolean;
  className?: string;
}

const SIDE_LABEL: Record<Side, string> = { square: "Square", reverse: "Reverse" };

export function EveryScoreOptions({ rules, onRules, unit, fun = false, onNeedAmounts, locked = false, reverseAmount = false, className }: EveryScoreOptionsProps) {
  const score = ruleFor(rules, "score");
  if (!score) return null;
  const reverseOn = reverseQuartersOn(rules);
  const kindsOn = byKindOn(rules);
  const each = reverseQuartersAmount(rules);
  return (
    <div
      data-testid="every-score-options"
      className={cx("divide-y divide-line overflow-hidden rounded-2xl bg-surface-3 ring-1 ring-inset ring-line", className)}
    >
      <div className="flex flex-col gap-3 px-3.5 py-3">
        <Switch
          data-testid="every-score-reverse"
          label="Also pay the reverse at each quarter and the final"
          description="Flip the digits: that square wins at Q1, Half, Q3 and the Final."
          checked={reverseOn}
          disabled={locked}
          onChange={(on) => onRules(setReverseQuarters(rules, on))}
        />
        {reverseOn && reverseAmount && unit && (
          <div className="flex items-center justify-between gap-3 animate-fade-in">
            <p className="min-w-0 text-subhead font-semibold text-ink-muted">Each reverse prize</p>
            <AmountField
              testId="every-score-reverse-amount"
              label="Reverse prize at each quarter and the final"
              value={each === "mixed" ? null : each}
              placeholder={each === "mixed" ? "Mixed" : "Amount"}
              unit={unit}
              parse={parseAmount}
              onChange={(amount) => onRules(setReverseQuartersAmount(rules, amount))}
              className="w-34 shrink-0"
            />
          </div>
        )}
      </div>
      {!fun && (
        <div className="flex flex-col gap-3 px-3.5 py-3">
          <Switch
            data-testid="every-score-by-kind"
            label="Amount by score type"
            description="An extra point can show less than a touchdown."
            checked={kindsOn && !!unit}
            onChange={(on) => {
              const next = setByKind(rules, on);
              if (on && !unit && onNeedAmounts) onNeedAmounts(next);
              else onRules(next);
            }}
          />
          {kindsOn && unit && <KindAmounts rule={score} rules={rules} onRules={onRules} unit={unit} />}
        </div>
      )}
    </div>
  );
}

/**
 * One amount per kind of score, for each square the every-score rule awards
 * (two by two for one, a row per kind with Square / Reverse columns for
 * both). Typing the touchdown moves the kinds not set by hand along with it
 * (setTouchdownAmount); a kind left empty falls back to the flat amount.
 */
function KindAmounts({ rule, rules, onRules, unit }: { rule: MomentRule; rules: MomentRule[]; onRules: (rules: MomentRule[]) => void; unit: "$" | "pts" }) {
  const sides = SIDES.filter((s) => !!rule[s]);
  // The last touchdown each side had: the others follow it, even after the field was cleared mid-typing.
  const touchdownOf = (side: Side) => kindAmount(rule[side], "touchdown") ?? null;
  const lastTouchdown = useRef<Record<Side, number | null>>({ square: touchdownOf("square"), reverse: touchdownOf("reverse") });
  useEffect(() => {
    for (const side of SIDES) {
      const td = touchdownOf(side);
      if (td) lastTouchdown.current[side] = td;
    }
  });
  const field = (side: Side, kind: ScoreKind, caption?: string) => {
    const prize = rule[side]!;
    return (
      <AmountField
        key={`${side}-${kind}`}
        testId="score-kind-amount"
        data={{ "data-kind": kind, "data-side": side }}
        label={`${SCORE_KIND_INFO[kind].label}: ${SIDE_LABEL[side].toLowerCase()} amount`}
        caption={caption}
        value={kindAmount(prize, kind) ?? null}
        unit={unit}
        parse={parseAmount}
        onChange={(amount) =>
          onRules(
            kind === "touchdown"
              ? setTouchdownAmount(rules, side, amount, unit, lastTouchdown.current[side])
              : setKindAmount(rules, side, kind, amount),
          )
        }
      />
    );
  };
  return (
    <div className="flex flex-col gap-2.5 animate-fade-in">
      {sides.length === 1 ? (
        <div className="grid grid-cols-2 gap-x-2 gap-y-2.5">{SCORE_KINDS.map((kind) => field(sides[0], kind, SCORE_KIND_INFO[kind].label))}</div>
      ) : (
        <div className="grid grid-cols-[minmax(0,6.5rem)_1fr_1fr] items-center gap-x-2 gap-y-2">
          <span />
          {sides.map((s) => (
            <span key={s} className="px-1 text-caption font-bold text-ink-muted">
              {SIDE_LABEL[s]}
            </span>
          ))}
          {SCORE_KINDS.map((kind) => (
            <div key={kind} className="contents">
              <span className="text-footnote font-bold leading-tight text-ink-muted">{SCORE_KIND_INFO[kind].label}</span>
              {sides.map((s) => field(s, kind))}
            </div>
          ))}
        </div>
      )}
      <p className="px-1 text-caption leading-snug text-ink-subtle">Amounts you haven't changed follow the touchdown.</p>
    </div>
  );
}
