// The rules & prizes editor, shared by the create page and the host's edit
// sheet. It leads with the host's explicit choice of how prizes read (dollars,
// points or just for fun) and the square price (one-tap picks or any amount,
// what the whole board adds up to, how the prizes compare, and "Split the
// $1,000" to fill the prizes in one tap), then one row per moment: on or off,
// which squares win (square, reverse or both), each with an optional amount,
// and an optional note behind "Add note". The every-score row also offers the
// reverse at each quarter and amounts by score type. Rows that are off fold
// to one line, so it never becomes a wall of inputs.
//
// Once scoring has started (`locked`), which moments win and which squares are
// shown disabled with the reason; amounts and notes stay editable.

import { useState, type ReactNode } from "react";
import { AMOUNTS_DISCLAIMER, MOMENT_INFO, PRIZE_MAX_LENGTH, formatAmount } from "../../../shared/formats";
import type { BoardSize, Moment, MomentRule } from "../../../shared/types";
import { CheckIcon, CopyIcon, FootballIcon, InfoIcon, LockIcon, PlusIcon } from "../../components/icons";
import { Badge, SegmentedControl, Switch, TextField, cx } from "../../components/ui";
import { haptic } from "../../lib/native";
import { AmountField } from "./AmountField";
import { EveryScoreOptions } from "./EveryScoreOptions";
import {
  PRICE_CHIPS,
  SIDES,
  boardTotal,
  byKindOn,
  boardTotalLabel,
  budgetText,
  canCopyToFixed,
  copyToFixed,
  editorRows,
  noteInputId,
  noteProblems,
  parseAmount,
  parsePrice,
  presetChoice,
  prizeBudget,
  setMoment,
  setPrize,
  setSides,
  sidesOf,
  splitOptions,
  splitSharesBoth,
  type PrizeChoice,
  type RulesDraft,
  type Side,
  type Sides,
} from "./rulesModel";

export interface RulesEditorProps {
  draft: RulesDraft;
  onChange: (draft: RulesDraft) => void;
  /** Squares on the board, for what the whole board adds up to at the square price. */
  boardSize: BoardSize;
  /** Why which moments win can't change any more (shown, with those controls disabled). */
  locked?: string | null;
}

/** Fun ideas for notes, one per moment; none of them are money. */
const NOTE_IDEAS: Record<Moment, string> = {
  score: "Loser does a pushup",
  q1: "Loser buys wings",
  q2: "Winner picks the music",
  q3: "Loser does the dishes",
  final: "Bragging rights till next season",
};

/** When each moment is decided, short enough for one line under its name. */
const WHEN: Record<Moment, string> = {
  score: "Each time either team scores",
  q1: "Score after the 1st quarter",
  q2: "Score at halftime",
  q3: "Score after the 3rd quarter",
  final: "Overtime counts",
};

const SIDE_LABEL: Record<Side, string> = { square: "Square", reverse: "Reverse" };

export function RulesEditor({ draft, onChange, boardSize, locked = null }: RulesEditorProps) {
  const set = (patch: Partial<RulesDraft>) => onChange({ ...draft, ...patch });
  const setRules = (rules: MomentRule[]) => set({ rules });
  const amounts = draft.choice === "$" || draft.choice === "pts";
  const unit = draft.choice === "pts" ? "pts" : "$";
  const problems = noteProblems(draft.rules);
  const custom = presetChoice(draft.rules) === null;
  const rows = editorRows(draft.rules);

  return (
    <div data-testid="rules-editor" className="flex flex-col gap-5">
      <section aria-label="Show prizes as" className="flex flex-col gap-2.5">
        <ChoicePicker value={draft.choice} onChange={(choice) => set({ choice })} />
        <p className="flex items-start gap-2 px-1 text-footnote leading-snug text-ink-subtle">
          <InfoIcon size={15} className="mt-px shrink-0" />
          {AMOUNTS_DISCLAIMER}
        </p>
      </section>

      {amounts && (
        <SquarePrice
          draft={draft}
          unit={unit}
          boardSize={boardSize}
          onPrice={(squarePrice) => set({ squarePrice })}
          onRules={setRules}
        />
      )}

      {draft.choice === "fun" && (
        <p className="flex items-center gap-2.5 rounded-2xl bg-accent-500/10 px-3.5 py-3 text-subhead text-ink-muted ring-1 ring-inset ring-accent-500/30">
          <span aria-hidden className="text-[1.15rem] leading-none">🎉</span>
          <span>
            Players see a <b className="font-bold text-ink">Just for fun</b> badge. Add notes like "Loser buys wings" below.
          </span>
        </p>
      )}

      <section aria-label="Who wins what" className="flex flex-col gap-2">
        <div className="flex min-h-6 items-center justify-between gap-2 px-1">
          <p className="eyebrow text-ink-subtle">Who wins what</p>
          {custom && <Badge tone="brand">Custom</Badge>}
        </div>
        {locked && (
          <p className="flex items-start gap-2 rounded-2xl bg-gold-400/10 px-3.5 py-2.5 text-footnote font-semibold leading-snug text-ink-gold ring-1 ring-inset ring-gold-line/30">
            <LockIcon size={14} className="mt-px shrink-0" />
            {locked}
          </p>
        )}
        <ul className="overflow-hidden rounded-2xl bg-surface-3 ring-1 ring-inset ring-line [&>li+li]:border-t [&>li+li]:border-line">
          {rows.map(({ moment, rule }) => (
            <MomentRow
              key={moment}
              moment={moment}
              rule={rule}
              rules={draft.rules}
              onRules={setRules}
              locked={!!locked}
              amounts={amounts}
              unit={unit}
              problems={problems}
              fun={draft.choice === "fun"}
              onNeedAmounts={(rules) => set({ choice: "$", rules })}
            />
          ))}
        </ul>
      </section>
    </div>
  );
}

// ---- Square price: quick picks, the board's total, and splitting it ----

function SquarePrice({
  draft,
  unit,
  boardSize,
  onPrice,
  onRules,
}: {
  draft: RulesDraft;
  unit: "$" | "pts";
  boardSize: BoardSize;
  onPrice: (price: number | null) => void;
  onRules: (rules: MomentRule[]) => void;
}) {
  const total = boardTotal(draft.squarePrice, boardSize);
  return (
    <section aria-label="Square price" data-testid="square-price" className="overflow-hidden rounded-2xl bg-surface-3 ring-1 ring-inset ring-line">
      <div className="flex items-center justify-between gap-3 px-3.5 pt-3">
        <div className="min-w-0">
          <p className="text-callout font-bold text-ink">Square price</p>
          <p className="mt-0.5 text-footnote text-ink-subtle">What one square costs</p>
        </div>
        <AmountField
          testId="rules-square-price"
          label="Square price"
          value={draft.squarePrice}
          unit={unit}
          parse={parsePrice}
          onChange={onPrice}
          className="w-34 shrink-0"
        />
      </div>
      <div role="group" aria-label="Quick square prices" className="grid grid-cols-4 gap-2 px-3.5 pb-3.5 pt-3">
        {PRICE_CHIPS[unit].map((value) => {
          const selected = draft.squarePrice === value;
          return (
            <button
              key={value}
              type="button"
              data-testid="price-chip"
              data-price={value}
              aria-pressed={selected}
              onClick={() => {
                void haptic("selection");
                onPrice(selected ? null : value);
              }}
              className={cx(
                "pressable h-10 rounded-xl font-display text-subhead font-extrabold tabular-nums transition-colors",
                selected
                  ? "bg-brand-400 text-ink-inverse shadow-[inset_0_1px_0_rgb(255_255_255/0.35)]"
                  : "bg-surface-2 text-ink ring-1 ring-inset ring-line hover:bg-surface-4",
              )}
            >
              {unit === "$" ? formatAmount(value, unit) : value.toLocaleString("en-US")}
            </button>
          );
        })}
      </div>
      {total !== null && <BoardTotal rules={draft.rules} total={total} unit={unit} boardSize={boardSize} onRules={onRules} />}
    </section>
  );
}

/**
 * "All 100 squares: $1,000", how the fixed prizes compare ("$800 of $1,000 ·
 * $200 left", "+ every score" when every score change shows amounts too:
 * their total depends on the game), and "Split the $1,000".
 */
function BoardTotal({
  rules,
  total,
  unit,
  boardSize,
  onRules,
}: {
  rules: MomentRule[];
  total: number;
  unit: "$" | "pts";
  boardSize: BoardSize;
  onRules: (rules: MomentRule[]) => void;
}) {
  const budget = prizeBudget(rules, total);
  const text = budgetText(budget, unit);
  const options = splitOptions(rules, total, unit);
  const totalText = formatAmount(total, unit);
  const detailTone =
    budget.status === "over" ? "text-ink-danger" : budget.status === "exact" ? "text-ink-brand" : "text-ink-gold";
  const extra = budget.everyScore ? (budget.status === "none" ? "Total depends on the game" : "+ every score") : null;
  return (
    <div className="flex flex-col gap-3 border-t border-line bg-ink/3 px-3.5 py-3">
      <div className="flex items-baseline justify-between gap-3">
        <span className="text-subhead font-semibold text-ink-muted">{boardTotalLabel(boardSize)}</span>
        <span data-testid="board-total" className="font-display text-headline font-extrabold tabular-nums text-ink">
          {totalText}
        </span>
      </div>
      <div data-testid="prize-budget" data-status={budget.status} className="flex items-start justify-between gap-3">
        <span className="text-subhead font-semibold text-ink-muted">Prizes</span>
        <span className="flex min-w-0 flex-col items-end text-right">
          <span className={cx("font-display text-callout font-extrabold tabular-nums", budget.status === "none" ? "text-ink-subtle" : "text-ink")}>
            {text.main}
          </span>
          {(text.detail || extra) && (
            <span className="flex items-center gap-1 text-caption font-bold tabular-nums">
              {text.detail && (
                <span className={cx("inline-flex items-center gap-0.5", detailTone)}>
                  {budget.status === "exact" && <CheckIcon size={12} strokeWidth={3} />}
                  {text.detail}
                </span>
              )}
              {text.detail && extra && <span aria-hidden className="text-ink-subtle">·</span>}
              {extra && <span className="text-ink-subtle">{extra}</span>}
            </span>
          )}
        </span>
      </div>
      {options.length > 0 && (
        <div className="flex flex-col gap-2">
          <p className="eyebrow px-0.5 text-ink-subtle">Split the {totalText}</p>
          <div className={cx("grid gap-2", options.length > 1 ? "grid-cols-2" : "grid-cols-1")}>
            {options.map((o) => (
              <button
                key={o.style}
                type="button"
                data-testid="prize-split"
                data-split={o.style}
                aria-pressed={o.selected}
                aria-label={`${o.label}: ${o.preview}`}
                onClick={() => {
                  void haptic("selection");
                  onRules(o.rules);
                }}
                className={cx(
                  "pressable flex flex-col gap-1.5 rounded-xl p-2.5 text-left ring-inset transition-[background-color,box-shadow]",
                  o.selected ? "bg-brand-400/10 ring-2 ring-brand-line" : "bg-surface-2 ring-1 ring-line-strong hover:bg-surface-4",
                )}
              >
                <span className="flex items-center justify-between gap-2">
                  <span className="text-subhead font-extrabold text-ink">{o.label}</span>
                  {o.selected ? (
                    <CheckIcon size={15} strokeWidth={3} className="shrink-0 text-ink-brand" />
                  ) : (
                    <span className="shrink-0 text-caption font-extrabold text-ink-brand">Fill in</span>
                  )}
                </span>
                <span className="flex flex-col gap-0.5">
                  {o.parts.map((part) => (
                    <span key={part.label} className="flex items-baseline justify-between gap-2 text-caption tabular-nums">
                      <span className="font-semibold text-ink-muted">{part.label}</span>
                      <span className="font-bold text-ink">{part.amount}</span>
                    </span>
                  ))}
                </span>
              </button>
            ))}
          </div>
          <p className="px-0.5 text-caption leading-snug text-ink-subtle">
            {splitSharesBoth(rules) ? "Where both squares win, the square and the reverse share it evenly. " : ""}
            {budget.everyScore ? "Every-score prizes come on top. " : ""}
            You can change any amount after.
          </p>
        </div>
      )}
    </div>
  );
}

// ---- How prizes read ----

const CHOICES: { value: Exclude<PrizeChoice, null>; label: string; glyph: ReactNode }[] = [
  { value: "$", label: "Dollars", glyph: <span className="font-display text-title-3 font-extrabold leading-none">$</span> },
  { value: "pts", label: "Points", glyph: <span className="font-display text-subhead font-extrabold leading-none tracking-tight">pts</span> },
  { value: "fun", label: "Just for fun", glyph: <span className="text-[1.15rem] leading-none">🎉</span> },
];

function ChoicePicker({ value, onChange }: { value: PrizeChoice; onChange: (choice: PrizeChoice) => void }) {
  return (
    <div role="radiogroup" aria-label="Show prizes as" data-testid="rules-choice" className="grid grid-cols-3 gap-2">
      {CHOICES.map((c) => {
        const selected = value === c.value;
        return (
          <button
            key={c.value}
            type="button"
            role="radio"
            aria-checked={selected}
            data-testid="rules-choice-option"
            data-choice={c.value}
            onClick={() => {
              if (!selected) void haptic("selection");
              onChange(c.value);
            }}
            className={cx(
              "pressable flex min-h-18 flex-col items-center justify-center gap-1.5 rounded-2xl px-1.5 py-2.5 text-center ring-inset transition-[background-color,box-shadow]",
              selected
                ? "bg-[linear-gradient(160deg,rgb(198_249_31/0.18),rgb(198_249_31/0.03)_65%)] bg-surface-3 text-ink ring-2 ring-brand-line"
                : "bg-surface-3 text-ink-muted ring-1 ring-line hover:bg-surface-4",
            )}
          >
            <span aria-hidden className={cx("grid h-7 place-items-center", selected ? "text-ink-brand" : "text-ink-muted")}>
              {c.glyph}
            </span>
            <span className="text-footnote font-bold leading-tight">{c.label}</span>
          </button>
        );
      })}
    </div>
  );
}

// ---- A moment ----

function MomentRow({
  moment,
  rule,
  rules,
  onRules,
  locked,
  amounts,
  unit,
  problems,
  fun,
  onNeedAmounts,
}: {
  moment: Moment;
  rule: MomentRule | null;
  rules: MomentRule[];
  onRules: (rules: MomentRule[]) => void;
  locked: boolean;
  amounts: boolean;
  unit: "$" | "pts";
  problems: Record<string, string>;
  fun: boolean;
  onNeedAmounts: (rules: MomentRule[]) => void;
}) {
  const on = !!rule;
  const [notesOpen, setNotesOpen] = useState(false);
  const hasNote = !!(rule?.square?.note || rule?.reverse?.note);
  const showNotes = on && (notesOpen || hasNote || SIDES.some((s) => problems[`${moment}:${s}`]));
  const onlyRule = on && rules.length === 1;
  const sides = rule ? sidesOf(rule) : "square";
  const onSides = SIDES.filter((s) => !!rule?.[s]);
  // Amounts by score type replace the one amount (it moves into their grid as "Other scores").
  const sideAmounts = amounts && !(moment === "score" && byKindOn(rules));
  const others = rules.filter((r) => r.moment !== "score" && r.moment !== moment);
  const copyLabel = others.length === 1 ? `Same for ${MOMENT_INFO[others[0].moment].short}` : "Same for every quarter";

  return (
    <li data-testid="rule-row" data-moment={moment} data-on={on} className={cx("px-3.5 py-3 transition-colors", on ? "" : "bg-ink/4")}>
      <div className="flex items-center gap-3">
        <MomentChip moment={moment} on={on} />
        <div className="min-w-0 flex-1">
          <p className={cx("truncate text-callout font-bold", on ? "text-ink" : "text-ink-muted")}>{MOMENT_INFO[moment].label}</p>
          <p className="truncate text-caption text-ink-subtle">{WHEN[moment]}</p>
        </div>
        <Switch
          data-testid="rule-toggle"
          aria-label={`${MOMENT_INFO[moment].label} wins`}
          checked={on}
          disabled={locked || onlyRule}
          onChange={(next) => onRules(setMoment(rules, moment, next))}
        />
      </div>

      {rule && (
        <div className="mt-3 flex flex-col gap-2.5 animate-fade-in">
          <SegmentedControl<Sides>
            size="sm"
            aria-label={`Which squares win: ${MOMENT_INFO[moment].label}`}
            data-testid="rule-sides"
            value={sides}
            onChange={(next) => onRules(setSides(rules, moment, next))}
            options={[
              { value: "square", label: "Square", disabled: locked && sides !== "square" },
              { value: "reverse", label: "Reverse", disabled: locked && sides !== "reverse" },
              { value: "both", label: "Both", disabled: locked && sides !== "both" },
            ]}
          />
          {(sideAmounts || !showNotes) && (
            // The amount(s), with "Note" alongside until a note is open.
            <div className="flex items-end gap-2">
              {sideAmounts && (
                <div className={cx("grid min-w-0 flex-1 gap-2", onSides.length > 1 ? "grid-cols-2" : "grid-cols-1")}>
                  {onSides.map((side) => (
                    <AmountField
                      key={side}
                      testId="rule-amount"
                      data={{ "data-moment": moment, "data-side": side }}
                      label={`${MOMENT_INFO[moment].label}: ${SIDE_LABEL[side].toLowerCase()} amount`}
                      caption={onSides.length > 1 ? SIDE_LABEL[side] : undefined}
                      value={rule[side]?.amount ?? null}
                      unit={unit}
                      parse={parseAmount}
                      onChange={(amount) => onRules(setPrize(rules, moment, side, { amount }))}
                    />
                  ))}
                </div>
              )}
              {!showNotes && (
                <button
                  type="button"
                  data-testid="rule-note-add"
                  data-moment={moment}
                  onClick={() => {
                    void haptic("selection");
                    setNotesOpen(true);
                  }}
                  className={cx(
                    "pressable tap-target flex h-11 shrink-0 items-center gap-1 rounded-xl text-footnote font-bold text-ink-brand",
                    sideAmounts ? "bg-surface-2 px-3 ring-1 ring-inset ring-line" : "-ml-1 px-1",
                  )}
                >
                  <PlusIcon size={15} strokeWidth={2.6} />
                  {sideAmounts ? "Note" : "Add note"}
                </button>
              )}
            </div>
          )}
          {(amounts || !locked) && canCopyToFixed(rules, moment, locked) && (
            <button
              type="button"
              data-testid="rules-copy"
              data-moment={moment}
              onClick={() => {
                void haptic("selection");
                onRules(copyToFixed(rules, moment, locked));
              }}
              className="pressable tap-target flex h-9 items-center gap-1.5 self-start rounded-full bg-surface-4 px-3 text-footnote font-bold text-ink ring-1 ring-inset ring-line"
            >
              <CopyIcon size={14} />
              {copyLabel}
            </button>
          )}
          {moment === "score" && (
            <EveryScoreOptions
              rules={rules}
              onRules={onRules}
              unit={amounts ? unit : null}
              fun={fun}
              onNeedAmounts={onNeedAmounts}
              locked={locked}
              className="mt-0.5 bg-surface-2"
            />
          )}
          {showNotes &&
            onSides.map((side) => (
              <TextField
                key={side}
                id={noteInputId(moment, side)}
                data-testid="rule-note"
                data-moment={moment}
                data-side={side}
                label={onSides.length > 1 ? `${SIDE_LABEL[side]} note` : "Note"}
                value={rule[side]?.note ?? ""}
                placeholder={NOTE_IDEAS[moment]}
                maxLength={PRIZE_MAX_LENGTH}
                autoComplete="off"
                enterKeyHint="done"
                error={problems[`${moment}:${side}`]}
                onChange={(e) => onRules(setPrize(rules, moment, side, { note: e.target.value }))}
              />
            ))}
        </div>
      )}
    </li>
  );
}

function MomentChip({ moment, on }: { moment: Moment; on: boolean }) {
  return (
    <span
      aria-hidden
      className={cx(
        "grid h-9 min-w-10 shrink-0 place-items-center rounded-xl px-1.5 font-display text-footnote font-extrabold transition-colors",
        on ? "bg-gold-400 text-ink-inverse shadow-[inset_0_1px_0_rgb(255_255_255/0.35)]" : "bg-surface-4 text-ink-subtle",
      )}
    >
      {moment === "score" ? <FootballIcon size={18} /> : MOMENT_INFO[moment].short}
    </span>
  );
}
