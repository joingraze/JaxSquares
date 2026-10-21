// Pure helpers for the rules & prizes editor (create flow and the host's edit
// sheet) and the read-only rules sheet: editing moments, squares and amounts,
// what's locked when, the PATCH body, and the lines the sheet shows. No React,
// no IO, so it's unit-tested (rulesModel.test.ts).
//
// Amounts are display-only: the app never collects, holds or sends money.

import {
  AMOUNT_MAX,
  FIXED_MOMENTS,
  KIND_UNITS,
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
  hasRest,
  hasScoreMoment,
  freshNumbersAllowed,
  kindAmount,
  kindAmounts,
  kindUnit,
  matchingPreset,
  niceAmount,
  prizeRange,
  restAllowed,
  ruleFor,
  rulesOf,
  rulesShape,
  sortRules,
  splitEvenly,
  suggestPrizes,
  tidyPrize,
  typicalGameTotal,
  unitOf,
  upgradeFormat,
  validatePrizeNote,
  withRules,
  type FixedPreset,
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
  /** House rules and claim codes (shared/venue.ts). Absent: the base format's stay as they are. */
  houseRules?: string[];
  claimCodes?: boolean;
}

/** The choice a saved format shows: just for fun, else the unit once any amount is set, else not chosen. */
export function choiceOf(format: GameFormat): PrizeChoice {
  if (format.justForFun) return "fun";
  return hasAmounts(format) ? unitOf(format) : null;
}

/**
 * The editor's starting point for a format (an older board's notes folded
 * into its rules, a legacy "conversion" amount read as the extra point's and
 * the 2-point conversion's).
 */
export function draftOf(format: GameFormat, legacyPrizes?: Record<string, string>): RulesDraft {
  return {
    rules: sortRules(rulesOf(upgradeFormat(format), legacyPrizes)).map((r) => ({ ...r })),
    choice: choiceOf(format),
    squarePrice: format.squarePrice ?? null,
    freshNumbers: format.freshNumbers,
    houseRules: format.houseRules ?? [],
    claimCodes: format.claimCodes === true,
  };
}

/**
 * The format a draft makes (canonical: periods/reverse derived, fresh numbers
 * dropped where they can't apply, amounts cleared when just for fun or not
 * chosen, amounts by score type kept only when some are typed, the final's
 * "rest" only with a square price).
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
    houseRules: draft.houseRules ?? base.houseRules,
    claimCodes: draft.claimCodes ?? base.claimCodes,
  });
}

// ---- Editing ----

/** Every moment in game order (the game's own, `moments`: basketball has no every score, a game of halves only halftime and the final), with its rule (null = it doesn't win). */
export function editorRows(rules: readonly MomentRule[], moments: readonly Moment[] = MOMENTS): { moment: Moment; rule: MomentRule | null }[] {
  return moments.map((moment) => ({ moment, rule: rules.find((r) => r.moment === moment) ?? null }));
}

/** True when the reverse square wins at every moment these rules have. */
export function allReverse(rules: readonly MomentRule[]): boolean {
  return rules.length > 0 && rules.every((r) => !!r.reverse);
}

/**
 * A preset's moments, keeping what was typed for moments that remain: each
 * gets the square (its amount and note kept) and, with `reverse`, the reverse
 * square (kept too). `reverse` defaults to whether every moment has one now.
 * Every score comes with the final score's square, which takes the rest of
 * the board total once there's a square price (see suggestPrizes), and
 * starts with amounts by score type on.
 */
export function selectPreset(rules: readonly MomentRule[], preset: FixedPreset, reverse = allReverse(rules)): MomentRule[] {
  const moments: Moment[] =
    preset === "quarters" ? ["q1", "q2", "q3", "final"] : preset === "halves" ? ["q2", "final"] : preset === "final" ? ["final"] : ["score", "final"];
  // A new every-score rule starts with amounts by score type on.
  const fresh = (moment: Moment): Prize => (moment === "score" ? { ...emptyPrize(), byKind: {} } : emptyPrize());
  return moments.map((moment) => {
    const cur = rules.find((r) => r.moment === moment);
    return {
      moment,
      square: cur?.square ?? fresh(moment),
      reverse: reverse ? (cur?.reverse ?? fresh(moment)) : null,
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

/** The final's square takes the rest: it isn't a fixed amount to copy to or from (its reverse square still is). */
const restFinal = (r: MomentRule) => r.moment === "final" && !!r.square?.rest;
const withoutRestSquare = (r: MomentRule): MomentRule => (restFinal(r) ? { ...r, square: null } : r);

/**
 * The other quarter-ends, made like this one: which squares win and their
 * amounts (notes stay). With `shapeLocked` (scoring has started) only the
 * amounts of squares that already win there are copied. A final taking the
 * rest keeps it (only its reverse square follows), and copying from one
 * copies its reverse amount only.
 */
export function copyToFixed(rules: readonly MomentRule[], moment: Moment, shapeLocked = false): MomentRule[] {
  const found = rules.find((r) => r.moment === moment);
  if (!found || moment === "score") return [...rules];
  const locked = shapeLocked || restFinal(found);
  const src = withoutRestSquare(found);
  const amount = (from: Prize | null, to: Prize | null): Prize | null => (from ? { amount: from.amount, note: to?.note ?? "" } : null);
  return rules.map((r) => {
    if (r.moment === "score" || r.moment === moment) return r;
    const next: MomentRule = locked
      ? {
          ...r,
          square: r.square && src.square ? { ...r.square, amount: src.square.amount } : r.square,
          reverse: r.reverse && src.reverse ? { ...r.reverse, amount: src.reverse.amount } : r.reverse,
        }
      : { ...r, square: amount(src.square, r.square), reverse: amount(src.reverse, r.reverse) };
    return restFinal(r) ? { ...next, square: r.square } : next;
  });
}

/**
 * True when "same for the other quarter-ends" would help: another one is set
 * up differently (which squares win; not once scoring has started), or is
 * missing an amount this one has. Amounts set on purpose aren't second-guessed,
 * and a final taking the rest only counts for its reverse square.
 */
export function canCopyToFixed(rules: readonly MomentRule[], moment: Moment, shapeLocked = false): boolean {
  const found = rules.find((r) => r.moment === moment);
  if (!found || moment === "score") return false;
  const locked = shapeLocked || restFinal(found);
  const src = withoutRestSquare(found);
  return rules.some((r) => {
    if (r.moment === "score" || r.moment === moment) return false;
    const to = withoutRestSquare(r);
    if (!to.square && !to.reverse) return false;
    if (!locked && (!!to.reverse !== !!src.reverse || (!restFinal(r) && !!to.square !== !!src.square))) return true;
    return SIDES.some((side) => !!src[side]?.amount && !!to[side] && !to[side]!.amount);
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
  /** What the fixed moments give out (each square's and reverse square's amount once; the rest isn't one). */
  fixed: number;
  /** total - fixed: left to give when above 0, over when below. */
  left: number;
  /**
   * none: no fixed prize has an amount yet; rest: the final takes the rest
   * (what's left, when there is some); over: the fixed prizes come to more
   * than the total.
   */
  status: "none" | "under" | "exact" | "over" | "rest";
  /** Every score change wins: its prizes come out of the total during the game. */
  everyScore: boolean;
  /** The final's square takes the rest of the board total. */
  rest: boolean;
  /** Every-score boards: what a typical game would give out (typicalGameTotal), else null. */
  typical: number | null;
  /** A typical game would use most of the total (over 80%), leaving little for the final. */
  tight: boolean;
}

/** Above this share of the board total, a typical game leaves little for the final. */
export const TIGHT_SHARE = 0.8;

/** How the prizes compare with the board's total ("Prizes: $800 of $1,000", or every score's typical game). */
export function prizeBudget(rules: readonly MomentRule[], total: number): PrizeBudget {
  const fixed = fixedPrizeTotal(rules);
  const left = Math.round((total - fixed) * 100) / 100;
  const everyScore = hasScoreMoment(rules);
  const rest = hasRest(rules);
  const typical = everyScore ? typicalGameTotal(rules) : null;
  const status = left < 0 ? "over" : rest ? "rest" : fixed === 0 ? "none" : left > 0 ? "under" : "exact";
  return { total, fixed, left, status, everyScore, rest, typical, tight: typical !== null && typical > total * TIGHT_SHARE };
}

/** The budget in words: "$800 of $1,000" and "$200 left" / "$200 over" / "Adds up" / "$400 to the final" (null with no prizes yet). */
export function budgetText(b: PrizeBudget, unit: AmountUnit): { main: string; detail: string | null } {
  if (b.status === "none") return { main: "None yet", detail: null };
  const main = `${formatAmount(b.fixed, unit)} of ${formatAmount(b.total, unit)}`;
  if (b.status === "exact") return { main, detail: "Adds up" };
  if (b.status === "rest") return { main, detail: b.left > 0 ? `The rest, ${formatAmount(b.left, unit)}, to the final` : "Nothing left for the final" };
  return { main, detail: `${formatAmount(Math.abs(b.left), unit)} ${b.left > 0 ? "left" : "over"}` };
}

/**
 * Every-score boards, in plain words: where the score prizes come from, a
 * typical game's estimate, and a warning when that would use most of the
 * total. null on fixed-moment boards (budgetText says it there).
 */
export function everyScoreBudgetText(b: PrizeBudget, unit: AmountUnit): { lead: string; estimate: string | null; warning: string | null } | null {
  if (!b.everyScore) return null;
  const total = formatAmount(b.total, unit);
  const lead = b.rest
    ? `Score prizes come out of the ${total} board total during the game; the final gets the rest.`
    : `Score prizes come out of the ${total} board total during the game.`;
  if (!b.typical) return { lead, estimate: null, warning: null };
  const about = formatAmount(Math.round(b.typical), unit);
  if (b.tight) {
    const warning = b.rest
      ? `A typical game would use about ${about} of the ${total} board total, leaving little for the final.`
      : `A typical game would use about ${about} of the ${total} board total.`;
    return { lead, estimate: null, warning };
  }
  const left = b.rest ? `, leaving about ${formatAmount(Math.round(b.total - b.typical), unit)} for the final` : "";
  return { lead, estimate: `A typical game uses about ${about}${left}.`, warning: null };
}

/** One prize's amounts as they read on a suggestion card: { label: "Q1", amount: "$170 + $40" }. */
export interface PrizePart {
  label: string;
  amount: string;
  /** An amount by score type (a suggestion card lays these out two by two). */
  kind?: true;
}

/**
 * The amounts in a rules list, as a key: who gets what (squares, reverse
 * squares, amounts by score type, the rest), notes left out. A flat amount
 * hidden behind amounts by score type doesn't count.
 */
export function amountsKey(rules: readonly MomentRule[]): string {
  const prize = (p: Prize | null) => {
    if (!p) return null;
    if (p.rest) return "rest";
    if (p.byKind !== undefined) return SCORE_KINDS.map((k) => kindAmount(p, k) ?? 0).join("/");
    return p.amount ?? 0;
  };
  return JSON.stringify(sortRules(rules).map((r) => [r.moment, prize(r.square), prize(r.reverse)]));
}

/** What each prize gets in these rules, for a suggestion card. */
export function prizeParts(rules: readonly MomentRule[], unit: AmountUnit): PrizePart[] {
  const sorted = sortRules(rules);
  const money = (n: number | null | undefined) => (n ? formatAmount(n, unit) : "–");
  const parts: PrizePart[] = [];
  const score = sorted.find((r) => r.moment === "score");
  if (score?.square) {
    if (score.square.byKind !== undefined) {
      for (const k of SCORE_KINDS) parts.push({ label: SCORE_KIND_INFO[k].short, amount: money(kindAmount(score.square, k) ?? score.square.amount), kind: true });
    } else parts.push({ label: "Every score", amount: money(score.square.amount) });
    if (score.reverse) parts.push({ label: "Reverse", amount: amountsKey([{ ...score, reverse: score.square }]) === amountsKey([score]) ? "Same" : money(score.reverse.amount) });
  }
  const fixed = sorted.filter((r) => r.moment !== "score");
  const revs = fixed.map((r) => r.reverse?.amount ?? null);
  // Every quarter-end's reverse the same: one line for all four (beside every score, where they're extras).
  const reverseEach = !!score && fixed.length === 4 && revs.every((a) => a !== null && a === revs[0]);
  if (reverseEach) parts.push({ label: "Reverse each quarter", amount: money(revs[0]) });
  for (const r of fixed) {
    const label = MOMENT_INFO[r.moment].short;
    const sq = r.square ? (r.square.rest ? "The rest" : money(r.square.amount)) : null;
    const rev = r.reverse && !reverseEach ? money(r.reverse.amount) : null;
    if (sq && rev) parts.push({ label, amount: `${sq} + ${rev}` });
    else if (sq) parts.push({ label, amount: sq });
    else if (rev) parts.push({ label: `${label} reverse`, amount: rev });
  }
  return parts;
}

export interface SuggestedPrizes {
  /** The rules with the suggested amounts. */
  rules: MomentRule[];
  /** The amounts already are these. */
  selected: boolean;
  /** "From the $1,000 board total". */
  basis: string;
  parts: PrizePart[];
}

/**
 * The suggested amounts for these rules at this square price, over `squares`
 * squares (all of them in the create flow and before the draw, the claimed
 * ones after; see suggestPrizes), or null without a price.
 */
export function suggestedPrizes(rules: readonly MomentRule[], price: number | null | undefined, squares: number, unit: AmountUnit): SuggestedPrizes | null {
  if (!price || squares <= 0) return null;
  const next = suggestPrizes(rules, price, squares, unit);
  const total = Math.round(price * squares * 100) / 100;
  return { rules: next, selected: amountsKey(next) === amountsKey(rules), basis: `From the ${formatAmount(total, unit)} board total`, parts: prizeParts(next, unit) };
}

export interface SplitOption {
  /** "Even". */
  label: string;
  /** Each moment's share: "Q1 $250 · Half $250 · Q3 $250 · Final $250". */
  preview: string;
  /** The same, one row per moment: { label: "Q1", amount: "$250" }. */
  parts: PrizePart[];
  /** The rules with those amounts filled in. */
  rules: MomentRule[];
  /** The prizes already read this way. */
  selected: boolean;
}

/**
 * "Even", the suggestion's alternative on a board where only fixed moments
 * win: the total shared evenly (see splitEvenly). null with every score
 * change, without a total, or when it's the same as the suggestion.
 */
export function evenSplit(rules: readonly MomentRule[], total: number | null, unit: AmountUnit, suggested: MomentRule[] | null): SplitOption | null {
  if (!total || total < 1 || hasScoreMoment(rules) || fixedMoments(rules).length === 0) return null;
  const next = splitEvenly(rules, total);
  if (suggested && amountsKey(next) === amountsKey(suggested)) return null;
  const parts = sortRules(next).map((r) => ({ label: MOMENT_INFO[r.moment].short, amount: formatAmount((r.square?.amount ?? 0) + (r.reverse?.amount ?? 0), unit) }));
  return {
    label: "Even",
    preview: parts.map((p) => `${p.label} ${p.amount}`).join(" · "),
    parts,
    rules: next,
    selected: fixedPrizeTotal(rules) > 0 && amountsKey(next) === amountsKey(rules),
  };
}

/** True when some fixed moment awards both squares (the even split shares it evenly between them). */
export function splitSharesBoth(rules: readonly MomentRule[]): boolean {
  return rules.some((r) => r.moment !== "score" && !!r.square && !!r.reverse);
}

// ---- The final: a fixed amount or the rest of the board total ----

/** The final's square shows the rest of the board total. */
export function finalRestOn(rules: readonly MomentRule[]): boolean {
  return hasRest(rules);
}

/**
 * About what the rest would come to: the total less the fixed prizes and,
 * with every score, a typical game's score prizes; "nice", rounded down. null
 * when nothing would be left.
 */
export function restEstimate(rules: readonly MomentRule[], total: number): number | null {
  const left = total - (typicalGameTotal(rules) ?? fixedPrizeTotal(rules));
  return left >= 1 ? niceAmount(left, true) : null;
}

/**
 * The final's square between "the rest of the board total" (`on`) and a
 * fixed amount: switching to a fixed amount starts it at about what the rest
 * would be (restEstimate, with the board's total), its note kept.
 */
export function setFinalRest(rules: readonly MomentRule[], on: boolean, total: number | null): MomentRule[] {
  if (!restAllowed(rules)) return [...rules];
  return rules.map((r) => {
    if (r.moment !== "final" || !r.square) return r;
    if (on) return { ...r, square: { amount: null, note: r.square.note, rest: true } };
    if (!r.square.rest) return r;
    const others = rules.map((x) => (x.moment === "final" ? { ...x, square: null } : x));
    return { ...r, square: { amount: total ? restEstimate(others, total) : null, note: r.square.note } };
  });
}

// ---- Auto-filling the suggested amounts (the create flow) ----

/** What the create flow's prizes look like: the format (rules, price, size) and how prizes read. */
export interface PrizeSetup {
  format: GameFormat;
  choice: PrizeChoice;
}

/** What the suggestion depends on: the square price, board size, who wins, amounts by score type on or off, the unit. */
export function setupKey({ format, choice }: PrizeSetup): string {
  const rules = rulesOf(format);
  return JSON.stringify([format.squarePrice ?? null, format.boardSize, rulesShape(rules), byKindOn(rules), choice]);
}

/** The setup's rules with the suggested amounts (all the board's squares), or as they are without a price or amounts. */
export function withSuggested({ format, choice }: PrizeSetup): GameFormat {
  if (choice !== "$" && choice !== "pts") return format;
  return withRules({ ...format, rules: suggestPrizes(rulesOf(format), format.squarePrice, totalSquares(format.boardSize), choice) });
}

/** Every amount taken off (notes kept, amounts by score type still on but empty). */
export function clearAmounts(rules: readonly MomentRule[]): MomentRule[] {
  const clear = (p: Prize | null): Prize | null => (p ? (p.byKind !== undefined ? { amount: null, note: p.note, byKind: {} } : { amount: null, note: p.note }) : null);
  return rules.map((r) => ({ ...r, square: clear(r.square), reverse: clear(r.reverse) }));
}

/**
 * The create flow's auto-fill: while `auto` (the host hasn't typed an
 * amount), a change to the setup (setupKey: the square price, the game type,
 * reverse, the every-score options, the board size or the unit) fills the
 * suggested amounts in (withSuggested); with the price taken away, the
 * suggested amounts go too. A change to the amounts alone is the host's own:
 * auto stops, and nothing changes by itself after that, until the amounts
 * match the suggestion again ("Use suggested amounts").
 */
export function autoFill(prev: PrizeSetup, next: PrizeSetup, auto: boolean): { format: GameFormat; auto: boolean } {
  const amounts = next.choice === "$" || next.choice === "pts";
  const suggested = amounts && next.format.squarePrice ? withSuggested(next) : null;
  const matches = !!suggested && amountsKey(rulesOf(suggested)) === amountsKey(rulesOf(next.format));
  if (!auto) return { format: next.format, auto: matches };
  if (setupKey(prev) !== setupKey(next)) {
    if (suggested) return { format: suggested, auto: true };
    if (amounts && !next.format.squarePrice) return { format: withRules({ ...next.format, rules: clearAmounts(rulesOf(next.format)) }), auto: true };
    return { format: next.format, auto: true };
  }
  if (amountsKey(rulesOf(prev.format)) !== amountsKey(rulesOf(next.format))) return { format: next.format, auto: matches };
  return { format: next.format, auto: true };
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
 * final (the final's square may win too: it takes the rest): still the
 * Every score card (a variant of it), not "Custom".
 */
export function isEveryScoreWithReverseQuarters(rules: readonly MomentRule[]): boolean {
  const score = ruleFor(rules, "score");
  if (!score?.square) return false;
  const fixed = rules.filter((r) => r.moment !== "score");
  return fixed.length === FIXED_MOMENTS.length && fixed.every((r) => !!r.reverse && (r.moment === "final" || !r.square));
}

/**
 * The Every score card's setups: every score change alone (older boards),
 * with the final score's square (what the card makes: the final takes the
 * rest), or with the reverse at each quarter-end and the final too.
 */
export function isEveryScoreSetup(rules: readonly MomentRule[]): boolean {
  if (!ruleFor(rules, "score")?.square) return false;
  const fixed = rules.filter((r) => r.moment !== "score");
  if (fixed.length === 0) return true;
  if (fixed.length === 1) return fixed[0].moment === "final" && !!fixed[0].square;
  return isEveryScoreWithReverseQuarters(rules);
}

/**
 * The preset card (or chip) that reads as picked: the rules' exact preset,
 * or Every score for its setups (isEveryScoreSetup). null: "Custom".
 */
export function presetChoice(rules: readonly MomentRule[]): FixedPreset | null {
  return presetOf(rules) ?? (isEveryScoreSetup(rules) ? "every-score" : null);
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

/** Sets one kind's amount on a side of the every-score rule (null = empty). */
export function setKindAmount(rules: readonly MomentRule[], side: Side, kind: ScoreKind, amount: number | null): MomentRule[] {
  return rules.map((r) => {
    const p = r[side];
    if (r.moment !== "score" || !p) return r;
    const next: Partial<Record<ScoreKind, number>> = {};
    for (const k of SCORE_KINDS) {
      const v = k === kind ? amount : kindAmount(p, k);
      if (v) next[k] = v;
    }
    return { ...r, [side]: { ...p, byKind: next } };
  });
}

/**
 * Sets the touchdown's amount on a side of the every-score rule, and the
 * kinds the host hasn't set by hand follow it as clean multiples of one base
 * unit (a quarter of the touchdown, rounded like kindUnit: TD $100 makes a
 * field goal, 2-point conversion and safety $50, an extra point $25). A kind
 * follows while it's empty or still the multiple of `from`, the touchdown it
 * followed before (the last one the field had); one set to anything else
 * stays as it is.
 */
export function setTouchdownAmount(rules: readonly MomentRule[], side: Side, amount: number | null, unit: AmountUnit, from: number | null): MomentRule[] {
  const set = setKindAmount(rules, side, "touchdown", amount);
  if (!amount) return set;
  const before = from ? kindUnit(from / 4, unit) : null;
  const base = kindUnit(amount / 4, unit);
  const at = (b: number, k: ScoreKind) => Math.round(KIND_UNITS[k] * b * 100) / 100;
  return set.map((r) => {
    const p = r[side];
    if (r.moment !== "score" || !p) return r;
    const next: Partial<Record<ScoreKind, number>> = { ...p.byKind };
    for (const k of SCORE_KINDS) {
      if (k === "touchdown") continue;
      const cur = kindAmount(p, k);
      if (!cur || (before !== null && cur === at(before, k))) next[k] = at(base, k);
    }
    return { ...r, [side]: { ...p, byKind: Object.fromEntries(SCORE_KINDS.filter((k) => next[k]).map((k) => [k, next[k]])) } };
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
  /** "$200", "50 pts", or null when no amount (and for the rest). */
  amount: string | null;
  /** The final's square takes the rest of the board total. */
  rest: boolean;
  note: string | null;
  /**
   * Every score change with amounts by score type: each kind with what it
   * shows ("Touchdown $50", "Extra point $10"), kinds with no amount left out.
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
  return sortRules(rulesOf(upgradeFormat(format), legacyPrizes)).map((r) => ({
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
      return [{ side, amount: !p.rest && p.amount ? formatAmount(p.amount, unit) : null, rest: !!p.rest, note: p.note || null, kinds }];
    }),
  }));
}

/** "$10 a square", "5 pts a square", or null without a price. */
export function priceLine(format: Pick<GameFormat, "squarePrice" | "unit">): string | null {
  return format.squarePrice ? `${formatAmount(format.squarePrice, unitOf(format))} a square` : null;
}

/** A prize's amounts in a few characters: "$50", "$10–$50" (by score type), "the rest"; null without any. */
function prizeText(p: Prize | null, unit: AmountUnit): string | null {
  if (p?.rest) return "the rest";
  const span = prizeRange(p);
  return span ? formatRange(span, unit) : null;
}

/** "$50", "$10–$50" (by score type), "$200 reverse", "$100 + $50 reverse", "the rest + $40 reverse", or null when the moment has no amount. */
function momentAmounts(r: MomentRule, unit: AmountUnit, withReverse = true): string | null {
  const sq = prizeText(r.square, unit);
  const rev = withReverse ? prizeText(r.reverse, unit) : null;
  if (sq && rev) return `${sq} + ${rev} reverse`;
  return sq ?? (rev ? `${rev} reverse` : null);
}

/**
 * What players see before they pick squares, in one compact line: the square
 * price, then each moment's amounts ("$10 a square · Q1 $100 · Half $200 ·
 * Q3 $100 · Final $400", "$50 every score", "$5–$20 every score" by score
 * type, "$200 each quarter" when all four match, "$40 reverse each quarter"
 * when their reverse squares do, "Final: the rest" when the final takes the
 * rest of the board total). `fun` for a just-for-fun board. null when the
 * host set nothing (players see nothing). In-app only: never in a push, a
 * link preview or share text.
 */
export function prizeLineup(format: GameFormat): { fun: boolean; parts: string[] } | null {
  if (format.justForFun) return { fun: true, parts: [] };
  const unit = unitOf(format);
  const rules = sortRules(rulesOf(upgradeFormat(format)));
  const parts: string[] = [];
  const price = priceLine(format);
  if (price) parts.push(price);
  const score = rules.find((r) => r.moment === "score");
  const scoreAmounts = score ? momentAmounts(score, unit) : null;
  if (scoreAmounts) parts.push(`${scoreAmounts} every score`);
  const fixed = rules.filter((r) => r.moment !== "score");
  const all = fixed.map((r) => momentAmounts(r, unit));
  if (fixed.length === 4 && all.every((a) => a && a === all[0]) && !hasRest(rules)) {
    parts.push(`${all[0]} each quarter`);
    return { fun: false, parts };
  }
  const revs = fixed.map((r) => prizeText(r.reverse, unit));
  const reverseEach = fixed.length === 4 && revs.every((a) => a && a === revs[0]);
  if (reverseEach) parts.push(`${revs[0]} reverse each quarter`);
  for (const r of fixed) {
    const a = momentAmounts(r, unit, !reverseEach);
    if (a) parts.push(r.square?.rest ? `${MOMENT_INFO[r.moment].short}: ${a}` : `${MOMENT_INFO[r.moment].short} ${a}`);
  }
  return parts.length > 0 ? { fun: false, parts } : null;
}

export interface MomentPrize {
  moment: Moment;
  /** "Q1", "Half", "Q3", "Final", "Every score". */
  label: string;
  /** "$100", "$5–$20" (by score type), "the rest"; null without an amount (always on a just-for-fun board). */
  amount: string | null;
  note: string | null;
  /** The reverse square's, when it shows an amount or a note. */
  reverse: { amount: string | null; note: string | null } | null;
}

/**
 * Each moment's prize in a few words, in game order: its amount and the
 * host's note ("Q1 · $100 · Free wings"), the reverse square's beside it.
 * Moments with neither an amount nor a note are left out. The TV's prize
 * list; in-app only, like prizeLineup.
 */
export function momentPrizes(format: GameFormat): MomentPrize[] {
  const unit = unitOf(format);
  const side = (p: Prize | null) => {
    const amount = format.justForFun ? null : prizeText(p, unit);
    const note = p?.note?.trim() || null;
    return amount || note ? { amount, note } : null;
  };
  return sortRules(rulesOf(upgradeFormat(format))).flatMap((r) => {
    const square = side(r.square);
    const reverse = side(r.reverse);
    if (!square && !reverse) return [];
    const label = r.moment === "score" ? "Every score" : MOMENT_INFO[r.moment].short;
    return [{ moment: r.moment, label, amount: square?.amount ?? null, note: square?.note ?? null, reverse }];
  });
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
