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
  SCORE_KIND_INFO,
  SCORE_KINDS,
  SQUARE_PRICE_MAX,
  emptyPrize,
  fixedMoments,
  fixedPrizeTotal,
  formatAmount,
  formatRange,
  hasAmounts,
  hasByKind,
  freshNumbersAllowed,
  kindAmounts,
  matchingPreset,
  prizeHasAmount,
  prizeRange,
  ruleFor,
  rulesOf,
  rulesShape,
  sortRules,
  splitPrizes,
  splitStyles,
  tidyPrize,
  unitOf,
  validatePrizeNote,
  withRules,
  type FixedPreset,
  type SplitStyle,
} from "../../../shared/formats";
import { totalSquares } from "../../../shared/squares";
import type { AmountUnit, BoardSize, Game, GameFormat, GameState, Moment, MomentRule, Prize, ScoreKind, UpdateGameInput } from "../../../shared/types";

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
 * dropped where they can't apply, amounts cleared when just for fun or not
 * chosen, amounts by score type kept only when some are typed).
 */
export function formatOf(base: GameFormat, draft: RulesDraft): GameFormat {
  const amounts = draft.choice === "$" || draft.choice === "pts";
  const prize = (p: Prize | null): Prize | null => (p ? (amounts ? tidyPrize(p) : { amount: null, note: p.note }) : null);
  const rules = draft.rules.map((r) => ({ ...r, square: prize(r.square), reverse: prize(r.reverse) }));
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

// ---- Square price: quick picks, the board's total, and what the prizes add up to ----

/** One-tap square prices: dollars, and points for a points board. The amount field next to them takes anything else. */
export const PRICE_CHIPS: Record<AmountUnit, readonly number[]> = {
  $: [1, 2, 5, 10, 20, 25, 50, 100],
  pts: [1, 5, 10, 25, 50, 100, 250, 500],
};

/** What every square on the board comes to at this price (display-only), or null without a price. */
export function boardTotal(price: number | null | undefined, boardSize: BoardSize): number | null {
  return price ? Math.round(price * totalSquares(boardSize) * 100) / 100 : null;
}

/** "All 100 squares", "All 25 squares": the label for the board's total. */
export function boardTotalLabel(boardSize: BoardSize): string {
  return `All ${totalSquares(boardSize)} squares`;
}

export interface PrizeBudget {
  /** The board's total at its square price. */
  total: number;
  /** What the fixed moments give out (each square's and reverse square's amount once). */
  fixed: number;
  /** total - fixed: left to give when above 0, over when below. */
  left: number;
  /** none: no fixed prize has an amount yet. */
  status: "none" | "under" | "exact" | "over";
  /** Every score change shows amounts too: on top, since its total depends on the game. */
  everyScore: boolean;
}

/** How the fixed prizes compare with the board's total ("Prizes: $800 of $1,000"). */
export function prizeBudget(rules: readonly MomentRule[], total: number): PrizeBudget {
  const fixed = fixedPrizeTotal(rules);
  const left = Math.round((total - fixed) * 100) / 100;
  const score = ruleFor(rules, "score");
  const everyScore = !!score && (prizeHasAmount(score.square) || prizeHasAmount(score.reverse));
  const status = fixed === 0 ? "none" : left > 0 ? "under" : left < 0 ? "over" : "exact";
  return { total, fixed, left, status, everyScore };
}

/** The budget in words: "$800 of $1,000" and "$200 left" / "$200 over" / "Adds up" (null with no prizes yet). */
export function budgetText(b: PrizeBudget, unit: AmountUnit): { main: string; detail: string | null } {
  if (b.status === "none") return { main: b.everyScore ? "Every score only" : "None yet", detail: null };
  const main = `${formatAmount(b.fixed, unit)} of ${formatAmount(b.total, unit)}`;
  if (b.status === "exact") return { main, detail: "Adds up" };
  return { main, detail: `${formatAmount(Math.abs(b.left), unit)} ${b.left > 0 ? "left" : "over"}` };
}

export interface SplitOption {
  style: SplitStyle;
  /** "Even", "Bigger final", or "All of it" with one fixed moment. */
  label: string;
  /** Each moment's share: "Q1 $250 · Half $250 · Q3 $250 · Final $250". */
  preview: string;
  /** The same, one row per moment: { label: "Q1", amount: "$250" }. */
  parts: { label: string; amount: string }[];
  /** The rules with those amounts filled in. */
  rules: MomentRule[];
  /** The prizes already read this way. */
  selected: boolean;
}

const fixedAmounts = (rules: readonly MomentRule[]) =>
  sortRules(rules)
    .filter((r) => r.moment !== "score")
    .map((r) => `${r.square?.amount ?? 0}/${r.reverse?.amount ?? 0}`)
    .join(",");

/**
 * "Split the $1,000": the ways to fill the fixed moments' amounts from the
 * board's total (see splitPrizes), each with what every moment gets. Empty
 * without a total or a fixed moment.
 */
export function splitOptions(rules: readonly MomentRule[], total: number | null, unit: AmountUnit): SplitOption[] {
  if (!total || total < 1) return [];
  const styles = splitStyles(rules);
  const current = fixedAmounts(rules);
  return styles.map((style) => {
    const next = splitPrizes(rules, total, style);
    const parts = sortRules(next)
      .filter((r) => r.moment !== "score")
      .map((r) => ({ label: MOMENT_INFO[r.moment].short, amount: formatAmount((r.square?.amount ?? 0) + (r.reverse?.amount ?? 0), unit) }));
    const preview = parts.map((p) => `${p.label} ${p.amount}`).join(" · ");
    const label = styles.length === 1 && fixedMoments(rules).length === 1 ? "All of it" : style === "even" ? "Even" : "Bigger final";
    return { style, label, preview, parts, rules: next, selected: fixedPrizeTotal(rules) > 0 && fixedAmounts(next) === current };
  });
}

/** True when some fixed moment awards both squares (the split shares it evenly between them). */
export function splitSharesBoth(rules: readonly MomentRule[]): boolean {
  return rules.some((r) => r.moment !== "score" && !!r.square && !!r.reverse);
}

// ---- Every score change: reverse at the quarters, amounts by score type ----

/** "Also pay the reverse at each quarter and the final" is on: every quarter-end awards the reverse square. */
export function reverseQuartersOn(rules: readonly MomentRule[]): boolean {
  return FIXED_MOMENTS.every((m) => !!ruleFor(rules, m)?.reverse);
}

/**
 * Turns "Also pay the reverse at each quarter and the final" on: every
 * quarter-end awards the reverse square (added where it's missing, with the
 * reverse amount another quarter-end already has; a quarter-end paying the
 * square keeps it). Off takes the reverse square away again, and the
 * quarter-ends left with nothing go. Every score change stays.
 */
export function setReverseQuarters(rules: readonly MomentRule[], on: boolean): MomentRule[] {
  if (!on) {
    const out = rules.flatMap((r) => (r.moment === "score" ? [r] : r.square ? [{ ...r, reverse: null }] : []));
    return out.length > 0 ? out : [...rules];
  }
  const known = rules.find((r) => r.moment !== "score" && r.reverse?.amount)?.reverse?.amount ?? null;
  const reverse = (): Prize => ({ amount: known, note: "" });
  const fixed = FIXED_MOMENTS.map((moment): MomentRule => {
    const cur = ruleFor(rules, moment);
    if (!cur) return { moment, square: null, reverse: reverse() };
    return cur.reverse ? cur : { ...cur, reverse: reverse() };
  });
  return sortRules([...rules.filter((r) => r.moment === "score"), ...fixed]);
}

/** The reverse amount every quarter-end shares, null when none is set, "mixed" when they differ. */
export function reverseQuartersAmount(rules: readonly MomentRule[]): number | null | "mixed" {
  const amounts = rules.filter((r) => r.moment !== "score" && r.reverse).map((r) => r.reverse!.amount ?? null);
  if (amounts.length === 0) return null;
  return amounts.every((a) => a === amounts[0]) ? amounts[0] : "mixed";
}

/** Sets the reverse amount at every quarter-end that awards the reverse square. */
export function setReverseQuartersAmount(rules: readonly MomentRule[], amount: number | null): MomentRule[] {
  return rules.map((r) => (r.moment !== "score" && r.reverse ? { ...r, reverse: { ...r.reverse, amount } } : r));
}

/**
 * Every score change plus the reverse square at each quarter-end and the
 * final: still the Every score card (a variant of it), not "Custom".
 */
export function isEveryScoreWithReverseQuarters(rules: readonly MomentRule[]): boolean {
  const score = ruleFor(rules, "score");
  if (!score?.square) return false;
  const fixed = rules.filter((r) => r.moment !== "score");
  return fixed.length === FIXED_MOMENTS.length && fixed.every((r) => !r.square && !!r.reverse);
}

/**
 * The preset card (or chip) that reads as picked: the rules' exact preset,
 * or Every score for every score change plus the reverse square at each
 * quarter-end (its built-in setup). null: "Custom".
 */
export function presetChoice(rules: readonly MomentRule[]): FixedPreset | null {
  return presetOf(rules) ?? (isEveryScoreWithReverseQuarters(rules) ? "every-score" : null);
}

/** "Amount by score type" is on: a side of the every-score rule carries amounts by kind (even before any is typed). */
export function byKindOn(rules: readonly MomentRule[]): boolean {
  const score = ruleFor(rules, "score");
  return !!score && SIDES.some((side) => score[side]?.byKind !== undefined);
}

/** Turns "Amount by score type" on (each side of the every-score rule gets them, starting empty) or off (gone; the one amount applies again). */
export function setByKind(rules: readonly MomentRule[], on: boolean): MomentRule[] {
  const toggle = (p: Prize | null): Prize | null => {
    if (!p) return null;
    if (on) return p.byKind ? p : { ...p, byKind: {} };
    const { byKind: _drop, ...rest } = p;
    void _drop;
    return rest;
  };
  return rules.map((r) => (r.moment === "score" ? { ...r, square: toggle(r.square), reverse: toggle(r.reverse) } : r));
}

/** Sets one kind's amount on a side of the every-score rule (null = it uses the side's one amount). */
export function setKindAmount(rules: readonly MomentRule[], side: Side, kind: ScoreKind, amount: number | null): MomentRule[] {
  return rules.map((r) => {
    const p = r[side];
    if (r.moment !== "score" || !p) return r;
    const next: Partial<Record<ScoreKind, number>> = {};
    for (const k of SCORE_KINDS) {
      const v = k === kind ? amount : p.byKind?.[k];
      if (v) next[k] = v;
    }
    return { ...r, [side]: { ...p, byKind: next } };
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
  /**
   * Every score change with amounts by score type: each kind with what it
   * shows ("Touchdown $50", "Conversion $10"), kinds with no amount left out.
   * null otherwise.
   */
  kinds: { kind: ScoreKind; label: string; short: string; amount: string }[] | null;
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
      if (!p) return [];
      const kinds =
        r.moment === "score" && hasByKind(p)
          ? kindAmounts(p).map((k) => ({ kind: k.kind, label: SCORE_KIND_INFO[k.kind].label, short: SCORE_KIND_INFO[k.kind].short, amount: formatAmount(k.amount, unit) }))
          : null;
      return [{ side, amount: p.amount ? formatAmount(p.amount, unit) : null, note: p.note || null, kinds }];
    }),
  }));
}

/** "$10 a square", "5 pts a square", or null without a price. */
export function priceLine(format: Pick<GameFormat, "squarePrice" | "unit">): string | null {
  return format.squarePrice ? `${formatAmount(format.squarePrice, unitOf(format))} a square` : null;
}

/** "$50", "$10–$50" (by score type), "$200 reverse", "$100 + $50 reverse", or null when the moment has no amount. */
function momentAmounts(r: MomentRule, unit: AmountUnit): string | null {
  const range = (p: Prize | null) => {
    const span = prizeRange(p);
    return span ? formatRange(span, unit) : null;
  };
  const sq = range(r.square);
  const rev = range(r.reverse);
  if (sq && rev) return `${sq} + ${rev} reverse`;
  return sq ?? (rev ? `${rev} reverse` : null);
}

/**
 * What players see before they pick squares, in one compact line: the square
 * price, then each moment's amounts ("$10 a square · Q1 $100 · Half $200 ·
 * Q3 $100 · Final $400", "$50 every score", "$10–$50 every score" by score
 * type, "$200 reverse each quarter" when all four match). `fun` for a
 * just-for-fun board. null when the host set nothing (players see nothing).
 * In-app only: never in a push, a link preview or share text.
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
  if (quarters) parts.push(`${fixed[0].a} each quarter`);
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
