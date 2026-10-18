// The rules & prizes editor, shared by the create page and the host's edit
// sheet. It leads with the host's explicit choice of how prizes read (dollars,
// points or just for fun) and the square price, then one row per moment: on or
// off, which squares win (square, reverse or both), each with an optional
// amount, and an optional note behind "Add note". Rows that are off fold to one
// line, so it never becomes a wall of inputs.
//
// Once scoring has started (`locked`), which moments win and which squares are
// shown disabled with the reason; amounts and notes stay editable.

import { useEffect, useState, type ReactNode } from "react";
import { AMOUNTS_DISCLAIMER, MOMENT_INFO, PRIZE_MAX_LENGTH } from "../../../shared/formats";
import type { Moment, MomentRule } from "../../../shared/types";
import { CheckIcon, CopyIcon, FootballIcon, InfoIcon, LockIcon, PlusIcon } from "../../components/icons";
import { Badge, SegmentedControl, Switch, TextField, cx } from "../../components/ui";
import { haptic } from "../../lib/native";
import {
  SIDES,
  canCopyToFixed,
  copyToFixed,
  editorRows,
  noteInputId,
  noteProblems,
  parseAmount,
  parsePrice,
  amountText,
  presetOf,
  setMoment,
  setPrize,
  setSides,
  sidesOf,
  type PrizeChoice,
  type RulesDraft,
  type Side,
  type Sides,
} from "./rulesModel";

export interface RulesEditorProps {
  draft: RulesDraft;
  onChange: (draft: RulesDraft) => void;
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

export function RulesEditor({ draft, onChange, locked = null }: RulesEditorProps) {
  const set = (patch: Partial<RulesDraft>) => onChange({ ...draft, ...patch });
  const setRules = (rules: MomentRule[]) => set({ rules });
  const amounts = draft.choice === "$" || draft.choice === "pts";
  const unit = draft.choice === "pts" ? "pts" : "$";
  const problems = noteProblems(draft.rules);
  const custom = presetOf(draft.rules) === null;
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
        <div className="flex items-center justify-between gap-3 rounded-2xl bg-surface-3 px-3.5 py-3 ring-1 ring-inset ring-line">
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
            onChange={(squarePrice) => set({ squarePrice })}
            className="w-34 shrink-0"
          />
        </div>
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
            />
          ))}
        </ul>
      </section>
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
}: {
  moment: Moment;
  rule: MomentRule | null;
  rules: MomentRule[];
  onRules: (rules: MomentRule[]) => void;
  locked: boolean;
  amounts: boolean;
  unit: "$" | "pts";
  problems: Record<string, string>;
}) {
  const on = !!rule;
  const [notesOpen, setNotesOpen] = useState(false);
  const hasNote = !!(rule?.square?.note || rule?.reverse?.note);
  const showNotes = on && (notesOpen || hasNote || SIDES.some((s) => problems[`${moment}:${s}`]));
  const onlyRule = on && rules.length === 1;
  const sides = rule ? sidesOf(rule) : "square";
  const onSides = SIDES.filter((s) => !!rule?.[s]);
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
          {(amounts || !showNotes) && (
            // The amount(s), with "Note" alongside until a note is open.
            <div className="flex items-end gap-2">
              {amounts && (
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
                    amounts ? "bg-surface-2 px-3 ring-1 ring-inset ring-line" : "-ml-1 px-1",
                  )}
                >
                  <PlusIcon size={15} strokeWidth={2.6} />
                  {amounts ? "Note" : "Add note"}
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

// ---- Amounts ----

/**
 * A display-only amount: "$" before it or "pts" after it, a decimal keypad,
 * "" for none. Keeps what's typed while it's being typed; a value that isn't
 * a number (or is too big) shows why under it and isn't used.
 */
export function AmountField({
  value,
  onChange,
  unit,
  label,
  caption,
  parse,
  testId,
  data,
  className,
}: {
  value: number | null;
  onChange: (value: number | null) => void;
  unit: "$" | "pts";
  /** Accessible name. */
  label: string;
  /** Small label above the field ("Square", "Reverse"). */
  caption?: string;
  parse: (text: string) => { value: number | null; error: string | null };
  testId: string;
  data?: Record<string, string>;
  className?: string;
}) {
  const [text, setText] = useState(() => amountText(value));
  const parsed = parse(text);
  // Follow outside changes (a preset, "same for every quarter") without fighting the typing.
  useEffect(() => {
    if (parse(text).value !== value) setText(amountText(value));
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only when the value changes from outside
  }, [value]);
  return (
    <label className={cx("block", className)}>
      {caption && <span className="mb-1 block px-1 text-caption font-bold text-ink-muted">{caption}</span>}
      <span
        className={cx(
          "flex h-11 items-center gap-1 rounded-xl bg-surface-2 px-3 ring-1 ring-inset transition-shadow focus-within:ring-2",
          parsed.error ? "ring-danger-500 focus-within:ring-danger-500" : "ring-line-strong focus-within:ring-brand-line",
        )}
      >
        {unit === "$" && <span className="font-display text-body font-extrabold text-ink-muted">$</span>}
        <input
          data-testid={testId}
          {...data}
          aria-label={label}
          aria-invalid={parsed.error ? true : undefined}
          inputMode="decimal"
          enterKeyHint="done"
          autoComplete="off"
          placeholder="Amount"
          value={text}
          onChange={(e) => {
            const next = e.target.value;
            setText(next);
            const p = parse(next);
            if (!p.error) onChange(p.value);
          }}
          onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
          className="h-full min-w-0 flex-1 bg-transparent font-display text-body font-extrabold tabular-nums text-ink outline-none placeholder:font-sans placeholder:font-medium placeholder:text-ink-subtle"
        />
        {unit === "pts" && <span className="text-footnote font-bold text-ink-muted">pts</span>}
        {!parsed.error && parsed.value !== null && <CheckIcon size={14} strokeWidth={3} className="shrink-0 text-ink-brand" />}
      </span>
      {parsed.error && <span className="mt-1 block px-1 text-caption font-semibold text-ink-danger">{parsed.error}</span>}
    </label>
  );
}
