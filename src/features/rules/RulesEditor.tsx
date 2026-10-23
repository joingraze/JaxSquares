// The rules & prizes editor, shared by the create page and the host's edit
// sheet. It leads with the host's explicit choice of how prizes read (dollars,
// points or just for fun) and the square price (one-tap picks or any amount,
// what the whole board adds up to, how the prizes compare with it, and the
// suggested amounts: "Use suggested amounts", with "Even" as the alternative
// on fixed-moment boards), then one row per moment: on or off, which squares
// win (square, reverse or both), each with an optional amount (the final's
// square: "The rest" of the board total or a fixed amount), and an optional
// note behind "Add note". The every-score row also offers the reverse at each
// quarter and amounts by score type. Rows that are off fold to one line, so it
// never becomes a wall of inputs. It never changes amounts by itself: the
// create page fills the suggestion in (autoFill) until the host types one.
//
// Once scoring has started (`locked`), which moments win and which squares are
// shown disabled with the reason; amounts and notes stay editable.

import { useState, type ReactNode } from "react";
import { AMOUNTS_DISCLAIMER, MOMENT_INFO, PRIZE_MAX_LENGTH, formatAmount, withoutRest } from "../../../shared/formats";
import { momentsFor, type GameKind } from "../../../shared/sports";
import { totalSquares } from "../../../shared/squares";
import type { BoardSize, Moment, MomentRule } from "../../../shared/types";
import { AlertIcon, CheckIcon, CopyIcon, FootballIcon, InfoIcon, LockIcon, PlusIcon, SparklesIcon } from "../../components/icons";
import { Badge, SegmentedControl, Switch, TextField, cx } from "../../components/ui";
import { haptic } from "../../lib/native";
import { AmountField } from "./AmountField";
import { HouseRules, VenueMode } from "./HouseRules";
import { EveryScoreOptions } from "./EveryScoreOptions";
import {
  PRICE_CHIPS,
  SIDES,
  boardTotalLabel,
  byKindOn,
  budgetText,
  canCopyToFixed,
  copyToFixed,
  editorRows,
  evenSplit,
  everyScoreBudgetText,
  finalRestOn,
  noteInputId,
  noteProblems,
  parseAmount,
  parsePrice,
  presetChoice,
  prizeBudget,
  setFinalRest,
  setMoment,
  setPrize,
  setSides,
  setVenue,
  sidesOf,
  splitSharesBoth,
  suggestedPrizes,
  type PrizeChoice,
  type PrizePart,
  type RulesDraft,
  type Side,
  type Sides,
} from "./rulesModel";

export interface RulesEditorProps {
  draft: RulesDraft;
  onChange: (draft: RulesDraft) => void;
  /** Squares on the board, for what the whole board adds up to at the square price. */
  boardSize: BoardSize;
  /**
   * Squares the board's total counts: every square (the default, and before
   * the numbers are drawn), or the claimed ones once they are (the host's
   * editor), like "the rest" does.
   */
  squares?: number;
  /** Why which moments win can't change any more (shown, with those controls disabled). */
  locked?: string | null;
  /** The board's sport and league: only the moments its game has (no every score for basketball, halftime and the final in a game of halves). Football by default. */
  kind?: GameKind;
  /** The "Venue mode" switch at the top (the create flow asks who's playing on its first step instead). */
  venueSwitch?: boolean;
  /** Why venue mode can't change any more (the board is paid for or drawn): the switch is shown off-limits. */
  venueLocked?: string | null;
}

/** Fun ideas for notes, one per moment; none of them are money. */
const NOTE_IDEAS: Record<Moment, string> = {
  score: "Loser does a pushup",
  q1: "Loser buys wings",
  q2: "Winner picks the music",
  q3: "Loser does the dishes",
  final: "Bragging rights till next season",
};

/** A venue's prizes, one per moment (venue mode leads with these). */
const VENUE_PRIZE_IDEAS: Record<Moment, string> = {
  score: "Free appetizer",
  q1: "Free appetizer",
  q2: "Free wings",
  q3: "Free dessert",
  final: "Team jersey",
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

export function RulesEditor({ draft, onChange, boardSize, squares = totalSquares(boardSize), locked = null, kind, venueSwitch = true, venueLocked = null }: RulesEditorProps) {
  const set = (patch: Partial<RulesDraft>) => onChange({ ...draft, ...patch });
  const setRules = (rules: MomentRule[]) => set({ rules });
  const amounts = draft.choice === "$" || draft.choice === "pts";
  const unit = draft.choice === "pts" ? "pts" : "$";
  const problems = noteProblems(draft.rules);
  const custom = presetChoice(draft.rules) === null;
  const rows = editorRows(draft.rules, momentsFor(kind));
  const total = draft.squarePrice ? Math.round(draft.squarePrice * squares * 100) / 100 : null;

  return (
    <div data-testid="rules-editor" data-venue={draft.venue ? "true" : undefined} className="flex flex-col gap-5">
      {venueSwitch && <VenueMode on={!!draft.venue} onChange={(on) => onChange(setVenue(draft, on))} locked={venueLocked} />}

      {draft.venue ? (
        // A venue leads with its prizes; what each is worth is optional, in dollars.
        <section aria-label="Prize values" className="rounded-2xl bg-surface-3 px-3.5 py-3 ring-1 ring-inset ring-line">
          <Switch
            checked={amounts}
            onChange={(on) => set({ choice: on ? "$" : "fun" })}
            label="Prize values"
            description={`Optional: show what each prize is worth, like $25. ${AMOUNTS_DISCLAIMER}`}
            data-testid="venue-prize-values"
          />
        </section>
      ) : (
        <section aria-label="Show prizes as" className="flex flex-col gap-2.5">
          <ChoicePicker value={draft.choice} onChange={(choice) => set({ choice })} />
          <p className="flex items-start gap-2 px-1 text-footnote leading-snug text-ink-subtle">
            <InfoIcon size={15} className="mt-px shrink-0" />
            {AMOUNTS_DISCLAIMER}
          </p>
        </section>
      )}

      {amounts && !draft.venue && (
        <SquarePrice
          draft={draft}
          unit={unit}
          boardSize={boardSize}
          squares={squares}
          // No price, no total: the final can't take "the rest" of one.
          onPrice={(squarePrice) => set({ squarePrice, rules: squarePrice ? draft.rules : withoutRest(draft.rules) })}
          onRules={setRules}
        />
      )}

      {draft.choice === "fun" && !draft.venue && (
        <p className="flex items-center gap-2.5 rounded-2xl bg-accent-500/10 px-3.5 py-3 text-subhead text-ink-muted ring-1 ring-inset ring-accent-500/30">
          <span aria-hidden className="text-[1.15rem] leading-none">🎉</span>
          <span>
            Players see a <b className="font-bold text-ink">Just for fun</b> badge. Add notes like "Loser buys wings" below.
          </span>
        </p>
      )}

      <section aria-label="Who wins what" className="flex flex-col gap-2">
        <div className="flex min-h-6 items-center justify-between gap-2 px-1">
          <p className="eyebrow text-ink-subtle">{draft.venue ? "What winners get" : "Who wins what"}</p>
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
              total={amounts ? total : null}
              venue={!!draft.venue}
            />
          ))}
        </ul>
      </section>

      <HouseRules
        rules={draft.houseRules ?? []}
        claimCodes={draft.claimCodes ?? false}
        claimMinutes={draft.claimMinutes ?? null}
        venue={!!draft.venue}
        onRules={(houseRules) => set({ houseRules })}
        onClaimCodes={(claimCodes) => set({ claimCodes })}
        onClaimMinutes={(claimMinutes) => set({ claimMinutes })}
      />
    </div>
  );
}

// ---- Square price: quick picks, the board's total, and the suggested amounts ----

function SquarePrice({
  draft,
  unit,
  boardSize,
  squares,
  onPrice,
  onRules,
}: {
  draft: RulesDraft;
  unit: "$" | "pts";
  boardSize: BoardSize;
  squares: number;
  onPrice: (price: number | null) => void;
  onRules: (rules: MomentRule[]) => void;
}) {
  const total = draft.squarePrice ? Math.round(draft.squarePrice * squares * 100) / 100 : null;
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
      {total !== null && draft.squarePrice !== null && (
        <BoardTotal
          rules={draft.rules}
          price={draft.squarePrice}
          squares={squares}
          total={total}
          label={squares === totalSquares(boardSize) ? boardTotalLabel(boardSize) : `${squares} claimed ${squares === 1 ? "square" : "squares"}`}
          unit={unit}
          onRules={onRules}
        />
      )}
    </section>
  );
}

/**
 * "All 100 squares: $1,000", how the prizes compare with it (fixed moments:
 * "$800 of $1,000 · $200 left"; every score: where its prizes come from and
 * a typical game's estimate, with a warning when that would use most of the
 * total), and the suggested amounts ("Use suggested amounts", with "Even" as
 * the alternative where only fixed moments win).
 */
function BoardTotal({
  rules,
  price,
  squares,
  total,
  label,
  unit,
  onRules,
}: {
  rules: MomentRule[];
  price: number;
  squares: number;
  total: number;
  label: string;
  unit: "$" | "pts";
  onRules: (rules: MomentRule[]) => void;
}) {
  const budget = prizeBudget(rules, total);
  const text = budgetText(budget, unit);
  const scoreText = everyScoreBudgetText(budget, unit);
  const suggested = suggestedPrizes(rules, price, squares, unit);
  const even = evenSplit(rules, total, unit, suggested?.rules ?? null);
  const totalText = formatAmount(total, unit);
  const detailTone = budget.status === "over" ? "text-ink-danger" : budget.status === "exact" || budget.status === "rest" ? "text-ink-brand" : "text-ink-gold";
  const pick = (next: MomentRule[]) => {
    void haptic("selection");
    onRules(next);
  };
  return (
    <div className="flex flex-col gap-3 border-t border-line bg-ink/3 px-3.5 py-3">
      <div className="flex items-baseline justify-between gap-3">
        <span className="text-subhead font-semibold text-ink-muted">{label}</span>
        <span data-testid="board-total" className="font-display text-headline font-extrabold tabular-nums text-ink">
          {totalText}
        </span>
      </div>
      {scoreText ? (
        <div data-testid="prize-budget" data-status={budget.tight ? "tight" : "ok"} className="flex flex-col gap-2">
          <p className="text-footnote leading-snug text-ink-muted">{scoreText.lead}</p>
          {scoreText.estimate && (
            <p data-testid="prize-estimate" className="flex items-start gap-1.5 text-footnote font-semibold leading-snug text-ink">
              <FootballIcon size={14} className="mt-0.5 shrink-0 text-ink-brand" />
              {scoreText.estimate}
            </p>
          )}
          {scoreText.warning && (
            <p
              data-testid="prize-warning"
              role="status"
              className="flex items-start gap-2 rounded-xl bg-gold-400/12 px-3 py-2 text-footnote font-semibold leading-snug text-ink-gold ring-1 ring-inset ring-gold-line/40"
            >
              <AlertIcon size={15} className="mt-px shrink-0" />
              {scoreText.warning}
            </p>
          )}
        </div>
      ) : (
        <div data-testid="prize-budget" data-status={budget.status} className="flex items-start justify-between gap-3">
          <span className="text-subhead font-semibold text-ink-muted">Prizes</span>
          <span className="flex min-w-0 flex-col items-end text-right">
            <span className={cx("font-display text-callout font-extrabold tabular-nums", budget.status === "none" ? "text-ink-subtle" : "text-ink")}>
              {text.main}
            </span>
            {text.detail && (
              <span className={cx("inline-flex items-center gap-0.5 text-caption font-bold tabular-nums", detailTone)}>
                {budget.status === "exact" && <CheckIcon size={12} strokeWidth={3} />}
                {text.detail}
              </span>
            )}
          </span>
        </div>
      )}
      {suggested && (
        <div className="flex flex-col gap-2">
          <p className="eyebrow px-0.5 text-ink-subtle">{even || !budget.everyScore ? `Split the ${totalText}` : "Suggested amounts"}</p>
          <div className={cx("grid gap-2", even ? "grid-cols-2" : "grid-cols-1")}>
            <SplitCard
              testId="prizes-suggest"
              title="Suggested"
              action="Use suggested amounts"
              parts={suggested.parts}
              selected={suggested.selected}
              wide={!even}
              cta
              onPick={() => pick(suggested.rules)}
            />
            {even && (
              <SplitCard testId="prize-split" split="even" title={even.label} action="Fill in" parts={even.parts} selected={even.selected} onPick={() => pick(even.rules)} />
            )}
          </div>
          <p data-testid="prizes-basis" className="px-0.5 text-caption leading-snug text-ink-subtle">
            {suggested.basis}. {even && splitSharesBoth(rules) ? "Even shares a moment's part between its square and reverse. " : ""}
            You can change any amount after.
          </p>
        </div>
      )}
    </div>
  );
}

/** One way to fill the prizes in: what each prize gets, picked when the amounts already read this way. */
function SplitCard({
  testId,
  split,
  title,
  action,
  parts,
  selected,
  wide = false,
  cta = false,
  onPick,
}: {
  testId: string;
  split?: string;
  title: string;
  /** What tapping it does, while it isn't picked ("Use suggested amounts"). */
  action: string;
  parts: PrizePart[];
  selected: boolean;
  /** Full width: the parts go two by two. */
  wide?: boolean;
  /** Its action is a button-like bar under the parts (the suggestion), not a word in the corner. */
  cta?: boolean;
  onPick: () => void;
}) {
  const summary = parts.map((p) => `${p.label} ${p.amount}`).join(" · ");
  return (
    <button
      type="button"
      data-testid={testId}
      data-split={split}
      aria-pressed={selected}
      aria-label={selected ? `${title}: ${summary}, in use` : `${action}: ${summary}`}
      onClick={onPick}
      className={cx(
        "pressable flex flex-col gap-2 rounded-xl p-2.5 text-left ring-inset transition-[background-color,box-shadow]",
        selected ? "bg-brand-400/10 ring-2 ring-brand-line" : "bg-surface-2 ring-1 ring-line-strong hover:bg-surface-4",
      )}
    >
      <span className="flex items-center justify-between gap-2">
        <span className="flex items-center gap-1.5 text-subhead font-extrabold text-ink">
          {cta && <SparklesIcon size={14} className="shrink-0 text-ink-brand" />}
          {title}
        </span>
        {selected ? (
          <span className="flex shrink-0 items-center gap-1 text-caption font-extrabold text-ink-brand">
            <CheckIcon size={14} strokeWidth={3} />
            {wide ? "In use" : <span className="sr-only">In use</span>}
          </span>
        ) : (
          !cta && <span className="shrink-0 text-caption font-extrabold text-ink-brand">{action}</span>
        )}
      </span>
      <span className={cx("grid gap-x-3 gap-y-0.5", wide ? "grid-cols-2" : "grid-cols-1")}>
        {parts.map((part) => (
          <span
            key={part.label}
            // Two by two for amounts by score type; a line of its own for anything longer.
            className={cx("flex min-w-0 items-baseline justify-between gap-2 text-caption tabular-nums", wide && !part.kind && "col-span-2")}
          >
            <span className="truncate font-semibold text-ink-muted">{part.label}</span>
            <span className="shrink-0 font-bold text-ink">{part.amount}</span>
          </span>
        ))}
      </span>
      {!selected && cta && (
        <span className="mt-auto flex min-h-9 items-center justify-center rounded-lg bg-brand-400 px-2 py-1 text-center text-footnote font-extrabold leading-tight text-ink-inverse shadow-[inset_0_1px_0_rgb(255_255_255/0.35)]">
          {action}
        </span>
      )}
    </button>
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
  total,
  venue,
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
  /** The board's total while amounts are on and there's a square price (the final can take the rest of it), else null. */
  total: number | null;
  /** A venue's board: the prize itself leads, always open ("Prize", venue ideas). */
  venue: boolean;
}) {
  const on = !!rule;
  const [notesOpen, setNotesOpen] = useState(false);
  const hasNote = !!(rule?.square?.note || rule?.reverse?.note);
  const showNotes = on && (venue || notesOpen || hasNote || SIDES.some((s) => problems[`${moment}:${s}`]));
  const noteWord = venue ? "prize" : "note";
  const onlyRule = on && rules.length === 1;
  const sides = rule ? sidesOf(rule) : "square";
  const onSides = SIDES.filter((s) => !!rule?.[s]);
  // Amounts by score type replace the one amount.
  const sideAmounts = amounts && !(moment === "score" && byKindOn(rules));
  // The final's square: the rest of the board total or a fixed amount (only with a total to take the rest of).
  const restChoice = moment === "final" && !!rule?.square && sideAmounts && total !== null;
  const rest = restChoice && finalRestOn(rules);
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
          {restChoice && (
            <SegmentedControl<"rest" | "fixed">
              size="sm"
              aria-label={onSides.length > 1 ? "The final's square prize" : "The final's prize"}
              data-testid="final-rest"
              value={rest ? "rest" : "fixed"}
              onChange={(next) => onRules(setFinalRest(rules, next === "rest", total))}
              options={[
                { value: "rest", label: "The rest", testId: "final-rest-on" },
                { value: "fixed", label: "Fixed amount", testId: "final-rest-off" },
              ]}
            />
          )}
          {(sideAmounts || !showNotes) && (
            // The amount(s), with "Note" alongside until a note is open.
            <div className="flex items-end gap-2">
              {sideAmounts && (
                <div className={cx("grid min-w-0 flex-1 gap-2", onSides.length > 1 ? "grid-cols-2" : "grid-cols-1")}>
                  {onSides.map((side) =>
                    rest && side === "square" ? (
                      <RestField key={side} caption={onSides.length > 1 ? SIDE_LABEL[side] : undefined} compact={onSides.length > 1} />
                    ) : (
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
                    ),
                  )}
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
                label={onSides.length > 1 ? `${SIDE_LABEL[side]} ${noteWord}` : noteWord === "prize" ? "Prize" : "Note"}
                value={rule[side]?.note ?? ""}
                placeholder={venue ? VENUE_PRIZE_IDEAS[moment] : NOTE_IDEAS[moment]}
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

/** Where an amount field would be: the final's square takes the rest of the board total. */
function RestField({ caption, compact = false }: { caption?: string; compact?: boolean }) {
  return (
    <span data-testid="final-rest-field" className="block min-w-0">
      {caption && <span className="mb-1 block truncate px-1 text-caption font-bold text-ink-muted">{caption}</span>}
      <span className="flex h-11 min-w-0 flex-col justify-center rounded-xl bg-gold-400/10 px-3 ring-1 ring-inset ring-gold-line/40">
        <span className="truncate font-display text-subhead font-extrabold leading-tight text-ink-gold">The rest</span>
        <span className="truncate text-caption leading-tight text-ink-muted">{compact ? "of the total" : "Everything not won during the game"}</span>
      </span>
    </span>
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
