// Pure helpers for the rules & prizes editor (create flow and the host's edit
// sheet) and the read-only rules sheet: editing moments, squares and amounts,
// what's locked when, the PATCH body, and the lines the sheet shows. No React,
// no IO, so it's unit-tested (rulesModel.test.ts).
//
// Amounts are display-only: the app never collects, holds or sends money.

import {
  AMOUNT_MAX,
  FIXED_MOMENTS,
  MOMENT_INFO,
  MOMENTS,
  SQUARE_PRICE_MAX,
  emptyPrize,
  formatAmount,
  hasAmounts,
  freshNumbersAllowed,
  matchingPreset,
  rulesOf,
  rulesShape,
  sortRules,
  unitOf,
  validatePrizeNote,
  withRules,
  type FixedPreset,
} from "../../../shared/formats";
import type { AmountUnit, Game, GameFormat, GameState, Moment, MomentRule, Prize, UpdateGameInput } from "../../../shared/types";

export type Side = "square" | "reverse";
export const SIDES: readonly Side[] = ["square", "reverse"];

/**
 * What the host tells players the prizes are: amounts in dollars or points,
 * or just for fun (no amounts; players see a badge). null = not chosen yet,
 * and players see nothing about prizes.
 */
export type PrizeChoice = AmountUnit | "fun" | null;

/** What the editor edits: who wins when, plus the board's prize settings. */
export interface RulesDraft {
  rules: MomentRule[];
  choice: PrizeChoice;
  /** Kept while "Just for fun" is picked (so switching back restores it); cleared on save. */
  squarePrice: number | null;
  freshNumbers: boolean;
}

/** The choice a saved format shows: just for fun, else the unit once any amount is set, else not chosen. */
export function choiceOf(format: GameFormat): PrizeChoice {
  if (format.justForFun) return "fun";
  return hasAmounts(format) ? unitOf(format) : null;
}

/** The editor's starting point for a format (an older board's notes folded into its rules). */
export function draftOf(format: GameFormat, legacyPrizes?: Record<string, string>): RulesDraft {
  return {
    rules: sortRules(rulesOf(format, legacyPrizes)).map((r) => ({ ...r })),
    choice: choiceOf(format),
    squarePrice: format.squarePrice ?? null,
    freshNumbers: format.freshNumbers,
  };
}

/**
 * The format a draft makes (canonical: periods/reverse derived, fresh numbers
 * dropped where they can't apply, amounts cleared when just for fun or not chosen).
 */
export function formatOf(base: GameFormat, draft: RulesDraft): GameFormat {
  const amounts = draft.choice === "$" || draft.choice === "pts";
  const rules = amounts
    ? draft.rules
    : draft.rules.map((r) => ({
        ...r,
        square: r.square ? { ...r.square, amount: null } : null,
        reverse: r.reverse ? { ...r.reverse, amount: null } : null,
      }));
  return withRules({
    ...base,
    rules,
    unit: draft.choice === "pts" ? "pts" : "$",
    squarePrice: amounts ? draft.squarePrice : null,
    justForFun: draft.choice === "fun",
    freshNumbers: draft.freshNumbers,
  });
}

// ---- Editing ----

/** Every moment in game order, with its rule (null = it doesn't win). */
export function editorRows(rules: readonly MomentRule[]): { moment: Moment; rule: MomentRule | null }[] {
  return MOMENTS.map((moment) => ({ moment, rule: rules.find((r) => r.moment === moment) ?? null }));
}

/** True when the reverse square wins at every moment these rules have. */
export function allReverse(rules: readonly MomentRule[]): boolean {
  return rules.length > 0 && rules.every((r) => !!r.reverse);
}

/**
 * A preset's moments, keeping what was typed for moments that remain: each
 * gets the square (its amount and note kept) and, with `reverse`, the reverse
 * square (kept too). `reverse` defaults to whether every moment has one now.
 */
export function selectPreset(rules: readonly MomentRule[], preset: FixedPreset, reverse = allReverse(rules)): MomentRule[] {
  const moments: Moment[] =
    preset === "quarters" ? ["q1", "q2", "q3", "final"] : preset === "halves" ? ["q2", "final"] : preset === "final" ? ["final"] : ["score"];
  return moments.map((moment) => {
    const cur = rules.find((r) => r.moment === moment);
    return {
      moment,
      square: cur?.square ?? emptyPrize(),
      reverse: reverse ? (cur?.reverse ?? emptyPrize()) : null,
    };
  });
}

/** Turns the reverse square on (or off) at every moment; a moment left with nothing gets its square back. */
export function setReverseEverywhere(rules: readonly MomentRule[], on: boolean): MomentRule[] {
  return rules.map((r) =>
    on ? { ...r, reverse: r.reverse ?? emptyPrize() } : { ...r, reverse: null, square: r.square ?? { ...emptyPrize(), amount: r.reverse?.amount ?? null } },
  );
}

/**
 * Turns a moment on or off. A quarter-end turned on copies the setup of the
 * closest quarter-end that's on (which squares win and their amounts, not
 * notes), so "the reverse square, $200, every quarter" takes one tap per
 * quarter; otherwise it starts with the square. The last moment can't go.
 */
export function setMoment(rules: readonly MomentRule[], moment: Moment, on: boolean): MomentRule[] {
  const has = rules.some((r) => r.moment === moment);
  if (!on) return has && rules.length > 1 ? rules.filter((r) => r.moment !== moment) : [...rules];
  if (has) return [...rules];
  let rule: MomentRule = { moment, square: emptyPrize(), reverse: null };
  if (moment !== "score") {
    const idx = FIXED_MOMENTS.indexOf(moment);
    const near = rules
      .filter((r) => r.moment !== "score")
      .sort((a, b) => Math.abs(FIXED_MOMENTS.indexOf(a.moment as Exclude<Moment, "score">) - idx) - Math.abs(FIXED_MOMENTS.indexOf(b.moment as Exclude<Moment, "score">) - idx))[0];
    if (near) {
      const copy = (p: Prize | null): Prize | null => (p ? { amount: p.amount, note: "" } : null);
      rule = { moment, square: copy(near.square), reverse: copy(near.reverse) };
    }
  }
  return sortRules([...rules, rule]);
}

/** Which squares win at a moment: the square, the reverse square, or both. */
export type Sides = "square" | "reverse" | "both";

export function sidesOf(rule: Pick<MomentRule, "square" | "reverse">): Sides {
  return rule.square && rule.reverse ? "both" : rule.reverse ? "reverse" : "square";
}

/**
 * Sets which squares win at a moment. A side keeps what was typed for it;
 * switching from one side to the other carries the amount and note across
 * ("$200 to the square" becomes "$200 to the reverse square").
 */
export function setSides(rules: readonly MomentRule[], moment: Moment, sides: Sides): MomentRule[] {
  return rules.map((r) => {
    if (r.moment !== moment) return r;
    const carry = (r.square ?? r.reverse ?? emptyPrize()) as Prize;
    const square = sides === "reverse" ? null : (r.square ?? (sides === "square" ? { ...carry } : emptyPrize()));
    const reverse = sides === "square" ? null : (r.reverse ?? (sides === "reverse" ? { ...carry } : emptyPrize()));
    return { ...r, square, reverse };
  });
}

/** Updates the amount or note of a moment's square or reverse square (no-op when that side is off). */
export function setPrize(rules: readonly MomentRule[], moment: Moment, side: Side, patch: Partial<Prize>): MomentRule[] {
  return rules.map((r) => (r.moment === moment && r[side] ? { ...r, [side]: { ...r[side]!, ...patch } } : r));
}

/**
 * The other quarter-ends, made like this one: which squares win and their
 * amounts (notes stay). With `shapeLocked` (scoring has started) only the
 * amounts of squares that already win there are copied.
 */
export function copyToFixed(rules: readonly MomentRule[], moment: Moment, shapeLocked = false): MomentRule[] {
  const src = rules.find((r) => r.moment === moment);
  if (!src || moment === "score") return [...rules];
  const amount = (from: Prize | null, to: Prize | null): Prize | null => (from ? { amount: from.amount, note: to?.note ?? "" } : null);
  return rules.map((r) => {
    if (r.moment === "score" || r.moment === moment) return r;
    if (shapeLocked) {
      return {
        ...r,
        square: r.square && src.square ? { ...r.square, amount: src.square.amount } : r.square,
        reverse: r.reverse && src.reverse ? { ...r.reverse, amount: src.reverse.amount } : r.reverse,
      };
    }
    return { ...r, square: amount(src.square, r.square), reverse: amount(src.reverse, r.reverse) };
  });
}

/**
 * True when "same for the other quarter-ends" would help: another one is set
 * up differently (which squares win; not once scoring has started), or is
 * missing an amount this one has. Amounts set on purpose aren't second-guessed.
 */
export function canCopyToFixed(rules: readonly MomentRule[], moment: Moment, shapeLocked = false): boolean {
  const src = rules.find((r) => r.moment === moment);
  if (!src || moment === "score") return false;
  return rules.some((r) => {
    if (r.moment === "score" || r.moment === moment) return false;
    if (!shapeLocked && sidesOf(r) !== sidesOf(src)) return true;
    return SIDES.some((side) => !!src[side]?.amount && !!r[side] && !r[side]!.amount);
  });
}

// ---- Amount inputs ----

/** What an amount field shows for a value ("50", "2.5", "" for none). */
export function amountText(n: number | null | undefined): string {
  return n == null ? "" : String(n);
}

/**
 * Reads an amount field: "" (or 0) = no amount; "$1,250.50" -> 1250.5. An
 * error (to show under the field) for anything that isn't a number or is over `max`.
 */
export function parseAmount(text: string, max = AMOUNT_MAX): { value: number | null; error: string | null } {
  const t = text.replace(/[$,\s]/g, "").replace(/pts?$/i, "");
  if (!t) return { value: null, error: null };
  if (!/^\d*\.?\d*$/.test(t) || t === ".") return { value: null, error: "Numbers only" };
  const n = Math.round(Number(t) * 100) / 100;
  if (!Number.isFinite(n)) return { value: null, error: "Numbers only" };
  if (n === 0) return { value: null, error: null };
  if (n > max) return { value: null, error: `Up to ${max.toLocaleString("en-US")}` };
  return { value: n, error: null };
}

/** Same, for the square price (up to 100,000). */
export function parsePrice(text: string): { value: number | null; error: string | null } {
  return parseAmount(text, SQUARE_PRICE_MAX);
}

// ---- Notes ----

/** DOM id of a rule's note input (the create page focuses it on a blocked submit). */
export const noteInputId = (moment: Moment, side: Side) => `rule-note-${moment}-${side}`;

/** Notes that can't go out, keyed "moment:side", with the message to show. */
export function noteProblems(rules: readonly MomentRule[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (const r of rules) {
    for (const side of SIDES) {
      const note = r[side]?.note.trim();
      const problem = note ? validatePrizeNote(note) : null;
      if (problem) out[`${r.moment}:${side}`] = problem;
    }
  }
  return out;
}

/** The first note (in game order) that mentions money, or null. */
export function firstNoteProblem(rules: readonly MomentRule[]): { moment: Moment; side: Side; message: string } | null {
  for (const r of sortRules(rules)) {
    for (const side of SIDES) {
      const note = r[side]?.note.trim();
      const message = note ? validatePrizeNote(note) : null;
      if (message) return { moment: r.moment, side, message };
    }
  }
  return null;
}

// ---- What's locked when (the API enforces the same; see worker rulesEditProblem) ----

export const SCORING_LOCKED = "Scoring rules lock once the first score is in. You can still change amounts and notes.";
export const FRESH_LOCKED = "New numbers each quarter locks once the numbers are drawn.";

export interface RulesLock {
  /** Why who wins when can't change any more (null while it can). */
  scoring: string | null;
  /** Why fresh numbers can't change any more. */
  fresh: string | null;
}

export function rulesLock(state: Pick<GameState, "game" | "scores" | "manualWinners">): RulesLock {
  return {
    scoring: state.scores.length > 0 || state.manualWinners.length > 0 ? SCORING_LOCKED : null,
    fresh: state.game.numbers ? FRESH_LOCKED : null,
  };
}

/** Is the draft allowed under the lock (who wins unchanged once scoring locked, fresh numbers unchanged once drawn)? */
export function lockViolation(game: Pick<Game, "format">, draft: RulesDraft, lock: RulesLock): string | null {
  if (lock.scoring && rulesShape(draft.rules) !== rulesShape(rulesOf(game.format))) return lock.scoring;
  if (lock.fresh && draft.freshNumbers !== game.format.freshNumbers) return lock.fresh;
  return null;
}

/** The host's PATCH for a rules edit, or null when nothing changed. */
export function rulesPatch(game: Pick<Game, "format" | "prizes">, draft: RulesDraft): UpdateGameInput | null {
  const next = formatOf(game.format, draft);
  const cur = withRules(game.format, game.prizes);
  return JSON.stringify(next) === JSON.stringify(cur) ? null : { format: next };
}

// ---- Reading the rules (the sheet everyone sees) ----

export interface SideLine {
  side: Side;
  /** "$200", "50 pts", or null when no amount. */
  amount: string | null;
  note: string | null;
}

export interface RuleLine {
  moment: Moment;
  /** "Every score change", "End of Q1"... */
  label: string;
  /** Chip text: "Q1", "Half"... and "+" for every score. */
  short: string;
  /** When it's decided, in plain words. */
  when: string;
  sides: SideLine[];
}

const WHEN: Record<Moment, string> = {
  score: "Each time either team scores",
  q1: "The score when the 1st quarter ends",
  q2: "The score at halftime",
  q3: "The score when the 3rd quarter ends",
  final: "The final score (overtime counts)",
};

/** One line per moment that wins, in game order. */
export function ruleLines(format: GameFormat, legacyPrizes?: Record<string, string>): RuleLine[] {
  const unit = unitOf(format);
  return sortRules(rulesOf(format, legacyPrizes)).map((r) => ({
    moment: r.moment,
    label: MOMENT_INFO[r.moment].label,
    short: MOMENT_INFO[r.moment].short,
    when: WHEN[r.moment],
    sides: SIDES.flatMap((side) => {
      const p = r[side];
      return p ? [{ side, amount: p.amount ? formatAmount(p.amount, unit) : null, note: p.note || null }] : [];
    }),
  }));
}

/** "$10 a square", "5 pts a square", or null without a price. */
export function priceLine(format: Pick<GameFormat, "squarePrice" | "unit">): string | null {
  return format.squarePrice ? `${formatAmount(format.squarePrice, unitOf(format))} a square` : null;
}

/** "$50", "$200 reverse", "$100 + $50 reverse", or null when the moment has no amount. */
function momentAmounts(r: MomentRule, unit: AmountUnit): string | null {
  const sq = r.square?.amount ? formatAmount(r.square.amount, unit) : null;
  const rev = r.reverse?.amount ? formatAmount(r.reverse.amount, unit) : null;
  if (sq && rev) return `${sq} + ${rev} reverse`;
  return sq ?? (rev ? `${rev} reverse` : null);
}

/**
 * What players see before they pick squares, in one compact line: the square
 * price, then each moment's amounts ("$10 a square · Q1 $100 · Half $200 ·
 * Q3 $100 · Final $400", "$50 every score", "Each quarter $200 reverse" when
 * all four match). `fun` for a just-for-fun board. null when the host set
 * nothing (players see nothing). In-app only: never in a push, a link preview
 * or share text.
 */
export function prizeLineup(format: GameFormat): { fun: boolean; parts: string[] } | null {
  if (format.justForFun) return { fun: true, parts: [] };
  const unit = unitOf(format);
  const rules = sortRules(rulesOf(format));
  const parts: string[] = [];
  const price = priceLine(format);
  if (price) parts.push(price);
  const score = rules.find((r) => r.moment === "score");
  const scoreAmounts = score ? momentAmounts(score, unit) : null;
  if (scoreAmounts) parts.push(`${scoreAmounts} every score`);
  const fixed = rules.filter((r) => r.moment !== "score").map((r) => ({ r, a: momentAmounts(r, unit) }));
  const quarters = fixed.length === 4 && fixed.every((f) => f.a && f.a === fixed[0].a);
  if (quarters) parts.push(`Each quarter ${fixed[0].a}`);
  else for (const f of fixed) if (f.a) parts.push(`${MOMENT_INFO[f.r.moment].short} ${f.a}`);
  return parts.length > 0 ? { fun: false, parts } : null;
}

/** The create page's collapsed "Square price & prizes" row: what players will see, or "Square price: not set". */
export function prizesSummary(format: GameFormat): string {
  const lineup = prizeLineup(format);
  if (!lineup) return "Square price: not set";
  if (lineup.fun) return "Just for fun";
  return lineup.parts.join(" · ");
}

// ---- The per-player cap (how players see it) ----

/** The cap control's value: "No max" or "Up to 5". */
export function maxValueText(max: number): string {
  return max > 0 ? `Up to ${max}` : "No max";
}

/** What players see when there's a cap ("Up to 5 squares each"), else null. */
export function capLine(max: number): string | null {
  return max > 0 ? `Up to ${max} ${max === 1 ? "square" : "squares"} each` : null;
}

/** True when these rules are exactly a preset (the editor shows "Custom" otherwise). */
export function presetOf(rules: readonly MomentRule[]): FixedPreset | null {
  return matchingPreset(rules)?.preset ?? null;
}

/** Can the draft use fresh numbers (no every-score winner, a fixed moment)? */
export function canUseFreshNumbers(rules: readonly MomentRule[]): boolean {
  return freshNumbersAllowed(rules);
}
