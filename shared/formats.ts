// Board formats: which scoring moments win a square (the rules), board size,
// reverse and fresh-number options, and the display-only prize amounts.
// Pure and framework-free (used by worker + client).
//
// Rules are the source of truth for who wins when (GameFormat.rules). Boards
// made before rules existed only have a preset + reverse; rulesOf() derives
// their rules (folding their old prize notes in), so every engine and UI path
// reads rules and never the preset.

import type {
  AmountUnit,
  BoardSize,
  GameFormat,
  Moment,
  MomentRule,
  Period,
  PeriodsPreset,
  Prize,
  ScoreKind,
} from "./types";

/** A preset a host can pick (every board's rules either match one or are "custom"). */
export type FixedPreset = Exclude<PeriodsPreset, "custom">;

export const PERIOD_PRESETS: readonly FixedPreset[] = ["quarters", "halves", "final", "every-score"];
export const BOARD_SIZES: readonly BoardSize[] = [100, 25];

/** Key of the single number draw used unless fresh numbers are drawn per quarter. */
export const SHARED_DRAW_KEY = "*";

/** Max length of a host's free-text prize note. */
export const PRIZE_MAX_LENGTH = 60;

/** Every moment, in canonical (game) order. */
export const MOMENTS: readonly Moment[] = ["score", "q1", "q2", "q3", "final"];
/** The moments decided by the score at a fixed point of the game. */
export const FIXED_MOMENTS: readonly Exclude<Moment, "score">[] = ["q1", "q2", "q3", "final"];
/** Keys of the per-quarter draws on a fresh-numbers board. */
const QUARTER_DRAW_KEYS = ["q1", "q2", "q3", "final"];

/** Most rules a board can have (one per moment). */
export const MAX_RULES = MOMENTS.length;
/** Largest prize amount, in the board's unit. */
export const AMOUNT_MAX = 1_000_000;
/** Largest square price, in the board's unit. */
export const SQUARE_PRICE_MAX = 100_000;
export const AMOUNT_UNITS: readonly AmountUnit[] = ["$", "pts"];

/** How each moment reads: `label` in the rules editor and sheet, `short` on chips. */
export const MOMENT_INFO: Record<Moment, { label: string; short: string }> = {
  score: { label: "Every score change", short: "Every score" },
  q1: { label: "End of Q1", short: "Q1" },
  q2: { label: "Halftime", short: "Half" },
  q3: { label: "End of Q3", short: "Q3" },
  final: { label: "Final score", short: "Final" },
};

const PRESET_MOMENTS: Record<FixedPreset, Moment[]> = {
  quarters: ["q1", "q2", "q3", "final"],
  halves: ["q2", "final"],
  final: ["final"],
  "every-score": ["score"],
};

/** Copy the UI can show when choosing a format. Never mentions money. */
export const PRESET_INFO: Record<PeriodsPreset, { label: string; short: string; description: string }> = {
  quarters: {
    label: "Every quarter",
    short: "Quarters",
    description: "A winner at the end of Q1, halftime, Q3 and the final score.",
  },
  halves: {
    label: "Halftime + Final",
    short: "Halves",
    description: "One winner at halftime and one at the final score.",
  },
  final: {
    label: "Final score",
    short: "Final",
    description: "One winner, decided by the final score (overtime counts).",
  },
  "every-score": {
    label: "Every score",
    short: "Every score",
    description: "Each time the score changes, the matching square wins.",
  },
  custom: {
    label: "Custom rules",
    short: "Custom",
    description: "Your own mix of moments, squares and reverse squares.",
  },
};

export const BOARD_SIZE_INFO: Record<BoardSize, { label: string; short: string; description: string }> = {
  100: { label: "Classic 10×10", short: "10×10", description: "100 squares, one number per row and column." },
  25: { label: "Quick 5×5", short: "5×5", description: "25 squares, two numbers per row and column." },
};

export const REVERSE_INFO = {
  label: "Reverse winners",
  description: "The square with the two numbers swapped wins too.",
};

export const FRESH_NUMBERS_INFO = {
  label: "New numbers each quarter",
  description: "Numbers are reshuffled for every quarter.",
};

/** Kinds of score, in the order the editor, the rules sheet and the host's score pad list them. */
export const SCORE_KINDS: readonly ScoreKind[] = ["touchdown", "fieldGoal", "extraPoint", "twoPoint", "safety"];

/** How each kind of score reads: `label` in sheets and the editor, `short` on chips and cards. */
export const SCORE_KIND_INFO: Record<ScoreKind, { label: string; short: string }> = {
  touchdown: { label: "Touchdown", short: "TD" },
  fieldGoal: { label: "Field goal", short: "FG" },
  extraPoint: { label: "Extra point", short: "XP" },
  twoPoint: { label: "2-point conversion", short: "2-PT" },
  safety: { label: "Safety", short: "Safety" },
};

/**
 * The kind a stored `byKind` key from before the extra point and the 2-point
 * conversion were told apart stands for: "conversion" reads as both.
 */
const LEGACY_CONVERSION = "conversion";
const CONVERSION_KINDS: readonly ScoreKind[] = ["extraPoint", "twoPoint"];

/** One scoring play as it reads: "TD" / "Touchdown", "XP" / "Extra point", "2-PT" / "2-point conversion"... `full` for sheets, short for chips and cards. */
export function scorePlayLabel(kind: ScoreKind, full = false): string {
  return full ? SCORE_KIND_INFO[kind].label : SCORE_KIND_INFO[kind].short;
}

/** The line every price/amount input carries: amounts are for show, never moved by the app. */
export const AMOUNTS_DISCLAIMER = "Shown to everyone before they pick squares. JaxSquares never collects or sends money.";

export function defaultFormat(): GameFormat {
  return { periods: "quarters", reverse: false, boardSize: 100, freshNumbers: false };
}

/** Fixed periods for a preset; every-score (and custom, whose periods come from its rules) has none. */
export function periodsFor(preset: PeriodsPreset): Period[] {
  if (preset === "every-score" || preset === "custom") return [];
  return PRESET_MOMENTS[preset].map((m) => periodOfMoment(m as Exclude<Moment, "score">));
}

/** Key/label of the nth (1-based) score entry on an every-score board. */
export function everyScorePeriod(n: number): Period {
  return { key: `s${n}`, label: `Score ${n}` };
}

/** Parses "s12" -> 12; null for anything that is not an every-score key. */
export function everyScoreIndex(key: string): number | null {
  const m = /^s([1-9]\d{0,3})$/.exec(key);
  return m ? Number(m[1]) : null;
}

// ---- Rules ----

export function emptyPrize(): Prize {
  return { amount: null, note: "" };
}

function periodOfMoment(m: Exclude<Moment, "score">): Period {
  return { key: m, label: MOMENT_INFO[m].short };
}

const momentOrder = (m: Moment) => MOMENTS.indexOf(m);

/** Rules in canonical order (score, q1, q2, q3, final). */
export function sortRules(rules: readonly MomentRule[]): MomentRule[] {
  return [...rules].sort((a, b) => momentOrder(a.moment) - momentOrder(b.moment));
}

/** The rules a preset makes: the square wins at each of its moments, plus the reverse square when `reverse`. */
export function rulesForPreset(preset: PeriodsPreset, reverse: boolean): MomentRule[] {
  const moments = PRESET_MOMENTS[preset === "custom" ? "quarters" : preset];
  return moments.map((moment) => ({ moment, square: emptyPrize(), reverse: reverse ? emptyPrize() : null }));
}

/**
 * The effective rules of a format: `format.rules` when present, else derived
 * from the preset + reverse of a board made before rules existed, with its
 * old prize notes (`legacyPrizes`, the period's own note or the "*" one)
 * folded into the square notes.
 */
export function rulesOf(format: Pick<GameFormat, "periods" | "reverse" | "rules">, legacyPrizes?: Record<string, string>): MomentRule[] {
  if (format.rules && format.rules.length > 0) return format.rules;
  const rules = rulesForPreset(format.periods, format.reverse);
  if (!legacyPrizes) return rules;
  return rules.map((r) => {
    const note = (r.moment === "score" ? undefined : legacyPrizes[r.moment]) ?? legacyPrizes[SHARED_DRAW_KEY];
    return note && r.square ? { ...r, square: { ...r.square, note } } : r;
  });
}

/** The moment a period key belongs to: "s3" -> "score", "q2" -> "q2"; null for anything else. */
export function momentOfKey(key: string): Moment | null {
  if (everyScoreIndex(key) !== null) return "score";
  return (FIXED_MOMENTS as readonly string[]).includes(key) ? (key as Moment) : null;
}

export function ruleFor(rules: readonly MomentRule[], moment: Moment): MomentRule | null {
  return rules.find((r) => r.moment === moment) ?? null;
}

/** The rule deciding a period ("s3" -> the every-score rule), or null when nothing wins then. */
export function ruleForPeriodKey(rules: readonly MomentRule[], key: string): MomentRule | null {
  const moment = momentOfKey(key);
  return moment ? ruleFor(rules, moment) : null;
}

/** True when every score change wins (the board records score entries s1..sN). */
export function hasScoreMoment(rules: readonly MomentRule[]): boolean {
  return rules.some((r) => r.moment === "score");
}

/** The fixed moments that win, in game order. */
export function fixedMoments(rules: readonly MomentRule[]): Exclude<Moment, "score">[] {
  return FIXED_MOMENTS.filter((m) => rules.some((r) => r.moment === m));
}

/** Fixed periods (Q1 / Half / Q3 / Final) the rules award, in game order. */
export function fixedPeriods(rules: readonly MomentRule[]): Period[] {
  return fixedMoments(rules).map(periodOfMoment);
}

/** The preset whose moments these rules use, else "custom" (what GameFormat.periods holds). */
export function presetFor(rules: readonly MomentRule[]): PeriodsPreset {
  const set = MOMENTS.filter((m) => rules.some((r) => r.moment === m)).join(",");
  for (const p of PERIOD_PRESETS) if (PRESET_MOMENTS[p].join(",") === set) return p;
  return "custom";
}

/**
 * The preset these rules are exactly (its moments, the square at each, and
 * the reverse square at all of them or none), or null: the editor's "Custom".
 */
export function matchingPreset(rules: readonly MomentRule[]): { preset: FixedPreset; reverse: boolean } | null {
  const preset = presetFor(rules);
  if (preset === "custom") return null;
  if (!rules.every((r) => r.square)) return null;
  const reverse = rules.some((r) => r.reverse);
  if (reverse && !rules.every((r) => r.reverse)) return null;
  return { preset, reverse };
}

/** Who wins when, without amounts or notes: what locks once the first score is in. */
export function rulesShape(rules: readonly MomentRule[]): string {
  return sortRules(rules)
    .map((r) => `${r.moment}:${r.square ? "s" : "-"}${r.reverse ? "r" : "-"}`)
    .join(",");
}

/** Keys of the number draws a locked board holds. */
export function drawKeys(format: GameFormat): string[] {
  const rules = rulesOf(format);
  return format.freshNumbers && !hasScoreMoment(rules) && fixedMoments(rules).length > 0 ? [...QUARTER_DRAW_KEYS] : [SHARED_DRAW_KEY];
}

/** True when fresh numbers each quarter can go with these rules (no every-score winner, at least one fixed moment). */
export function freshNumbersAllowed(rules: readonly MomentRule[]): boolean {
  return !hasScoreMoment(rules) && fixedMoments(rules).length > 0;
}

// ---- Amounts ----

const round2 = (n: number) => Math.round(n * 100) / 100;

/** The board's unit ("$" unless it says points). */
export function unitOf(format: Pick<GameFormat, "unit">): AmountUnit {
  return format.unit === "pts" ? "pts" : "$";
}

/**
 * "$50", "$2.50", "$1,000", "50 pts", "1 pt". Whole dollars drop the cents;
 * anything else shows two decimals.
 */
export function formatAmount(amount: number, unit: AmountUnit = "$"): string {
  const whole = Number.isInteger(amount);
  if (unit === "pts") {
    const n = amount.toLocaleString("en-US", { maximumFractionDigits: 2 });
    return `${n} ${amount === 1 ? "pt" : "pts"}`;
  }
  const n = amount.toLocaleString("en-US", { minimumFractionDigits: whole ? 0 : 2, maximumFractionDigits: whole ? 0 : 2 });
  return `$${n}`;
}

/** True when a prize shows an amount: its own, one for a kind of score, or the rest of the board total. */
export function prizeHasAmount(prize: Prize | null | undefined): boolean {
  if (!prize) return false;
  return !!prize.amount || !!prize.rest || hasByKind(prize);
}

/** True when the board shows any amount (a square price or a prize amount). */
export function hasAmounts(format: Pick<GameFormat, "periods" | "reverse" | "rules" | "squarePrice">): boolean {
  if (format.squarePrice) return true;
  return hasPrizeAmounts(format);
}

/** True when any prize (not counting the square price) has an amount. */
export function hasPrizeAmounts(format: Pick<GameFormat, "periods" | "reverse" | "rules">): boolean {
  return rulesOf(format).some((r) => prizeHasAmount(r.square) || prizeHasAmount(r.reverse));
}

/** True when a prize has an amount for some kind of score (every score change only). */
export function hasByKind(prize: Prize | null | undefined): boolean {
  return SCORE_KINDS.some((k) => !!kindAmount(prize, k));
}

/**
 * A prize's own amount for a kind of score, or undefined. A board saved
 * before the extra point and the 2-point conversion were told apart holds
 * one "conversion" amount: it counts for both.
 */
export function kindAmount(prize: Prize | null | undefined, kind: ScoreKind): number | undefined {
  const by = prize?.byKind as Record<string, number | null | undefined> | undefined;
  if (!by) return undefined;
  const own = by[kind] ?? (CONVERSION_KINDS.includes(kind) ? by[LEGACY_CONVERSION] : undefined);
  return own || undefined;
}

/**
 * The amount a prize shows for a score of this kind: its own `byKind` value,
 * else the flat `amount` (a quiet fallback for a kind missing from older
 * data). The rest of the board total isn't a fixed amount: null here, see
 * resolveResults / restSoFar in shared/squares.ts.
 */
export function prizeAmount(prize: Prize | null | undefined, kind?: ScoreKind | null): number | null {
  if (!prize || prize.rest) return null;
  const own = kind ? kindAmount(prize, kind) : undefined;
  return own || prize.amount || null;
}

/** True when the final score's square shows the rest of the board total. */
export function hasRest(rules: readonly MomentRule[]): boolean {
  return !!ruleFor(rules, "final")?.square?.rest;
}

/** True when the rest of the board total can go on these rules: the final score's square wins. */
export function restAllowed(rules: readonly MomentRule[]): boolean {
  return !!ruleFor(rules, "final")?.square;
}

/** The rules with "the rest" taken off the final (its amount stays empty). */
export function withoutRest(rules: readonly MomentRule[]): MomentRule[] {
  return rules.map((r) => {
    if (!r.square?.rest) return r;
    const { rest: _rest, ...square } = r.square;
    void _rest;
    return { ...r, square };
  });
}

/** A legacy `byKind.conversion` read into the extra point and the 2-point conversion (each keeps its own when it has one). */
function upgradePrize(p: Prize | null): Prize | null {
  const by = p?.byKind as Record<string, number | null | undefined> | undefined;
  if (!p || !by || !(LEGACY_CONVERSION in by)) return p;
  const next: Partial<Record<ScoreKind, number>> = {};
  for (const kind of SCORE_KINDS) {
    const v = kindAmount(p, kind);
    if (v) next[kind] = v;
  }
  return { ...p, byKind: next };
}

/**
 * A stored format as the current kinds read it: a board saved with one
 * "conversion" amount by score type gets it as both the extra point's and the
 * 2-point conversion's. Everything else is returned as is (the same object
 * when nothing needs it), so newer boards read byte for byte.
 */
export function upgradeFormat<T extends Pick<GameFormat, "rules">>(format: T): T {
  const legacy = (p: Prize | null) => !!p?.byKind && LEGACY_CONVERSION in p.byKind;
  if (!format.rules?.some((r) => legacy(r.square) || legacy(r.reverse))) return format;
  return { ...format, rules: format.rules.map((r) => ({ ...r, square: upgradePrize(r.square), reverse: upgradePrize(r.reverse) })) };
}

/**
 * Each kind of score with the amount it shows (its own, else the default),
 * in SCORE_KINDS order; kinds with neither are left out.
 */
export function kindAmounts(prize: Prize | null | undefined): { kind: ScoreKind; amount: number }[] {
  if (!prize) return [];
  return SCORE_KINDS.flatMap((kind) => {
    const amount = prizeAmount(prize, kind);
    return amount ? [{ kind, amount }] : [];
  });
}

/**
 * Lowest and highest amount a prize can show: with amounts by score type,
 * across the kinds (the default counts for kinds without their own), else
 * its one amount. null without any.
 */
export function prizeRange(prize: Prize | null | undefined): { min: number; max: number } | null {
  if (!prize) return null;
  const amounts = hasByKind(prize) ? kindAmounts(prize).map((k) => k.amount) : prize.amount ? [prize.amount] : [];
  if (amounts.length === 0) return null;
  return { min: Math.min(...amounts), max: Math.max(...amounts) };
}

/** "$50", "$10–$50", "10–50 pts". */
export function formatRange(range: { min: number; max: number }, unit: AmountUnit = "$"): string {
  if (range.min === range.max) return formatAmount(range.min, unit);
  if (unit === "pts") return `${range.min.toLocaleString("en-US", { maximumFractionDigits: 2 })}–${formatAmount(range.max, unit)}`;
  return `${formatAmount(range.min, unit)}–${formatAmount(range.max, unit)}`;
}

/**
 * What the fixed moments (quarter-ends, halftime, final) give out in all, in
 * the board's unit: each square's and reverse square's amount once. Every
 * score change isn't in it: its total depends on the game.
 */
export function fixedPrizeTotal(rules: readonly MomentRule[]): number {
  const sum = rules
    .filter((r) => r.moment !== "score")
    .reduce((n, r) => n + (r.square?.amount ?? 0) + (r.reverse?.amount ?? 0), 0);
  return round2(sum);
}

// ---- Suggested amounts, from the square price and the board's total ----
//
// Every amount stays display-only. The suggestion is what the create flow
// fills in (and the editor's "Use suggested amounts" puts back); the host can
// change any amount after.

/**
 * A "nice" display amount near `x`: whole units under 10, the nearest 5
 * under 100, the nearest 10 from 100 (`down` rounds down instead); never below 1.
 */
export function niceAmount(x: number, down = false): number {
  if (!Number.isFinite(x) || x <= 0) return 1;
  const step = x < 10 ? 1 : x < 100 ? 5 : 10;
  const n = (down ? Math.floor(x / step + 1e-9) : Math.round(x / step)) * step;
  return Math.max(1, n);
}

/** How the suggestion weighs the fixed moments: Q1 20 · Half 20 · Q3 20 · Final 40 (Halftime + Final alone: 40 · 60). */
const SUGGESTED_WEIGHTS: Record<Exclude<Moment, "score">, number> = { q1: 20, q2: 20, q3: 20, final: 40 };

/** The suggestion's weights for these fixed moments (in game order). */
export function suggestedWeights(moments: readonly Exclude<Moment, "score">[]): number[] {
  if (moments.join(",") === "q2,final") return [40, 60];
  return moments.map((m) => SUGGESTED_WEIGHTS[m]);
}

/**
 * Every score change, by kind, as multiples of one base unit (the extra
 * point's amount), so the amounts are clean multiples of each other: a
 * touchdown 4, a field goal, a 2-point conversion or a safety 2, an extra
 * point 1.
 */
export const KIND_UNITS: Record<ScoreKind, number> = { touchdown: 4, fieldGoal: 2, extraPoint: 1, twoPoint: 2, safety: 2 };
/** A reverse prize, and a fixed moment's square beside every score change: four square prices. */
const SUGGESTED_SIDE_SQUARES = 4;
/** Reverse prizes on a fixed-moment board never take more than this share of the board's total. */
const REVERSE_MAX_SHARE = 0.4;

/**
 * The base unit for amounts by score type, from about half of `x` (half the
 * square price: a touchdown is then about two square prices): in dollars the
 * nearest $0.50 (at least $0.50), in points a whole point (at least 1).
 */
export function kindUnit(half: number, unit: AmountUnit = "$"): number {
  if (!Number.isFinite(half) || half <= 0) return unit === "pts" ? 1 : 0.5;
  return unit === "pts" ? Math.max(1, Math.round(half)) : Math.max(0.5, Math.round(half * 2) / 2);
}

/** Each kind of score's amount for one base unit (KIND_UNITS × unit). */
export function kindAmountsForUnit(base: number): Record<ScoreKind, number> {
  const out = {} as Record<ScoreKind, number>;
  for (const kind of SCORE_KINDS) out[kind] = round2(KIND_UNITS[kind] * base);
  return out;
}

/**
 * The suggested amount for each kind of score at this square price: the base
 * unit is half the price (kindUnit), never rounded per kind. $1 squares: TD
 * $2, FG / 2-PT / Safety $1, XP $0.50; $10: $20 / $10 / $5; $25: $50 / $25 / $12.50.
 */
export function suggestedKindAmounts(price: number, unit: AmountUnit = "$"): Record<ScoreKind, number> {
  return kindAmountsForUnit(kindUnit(price / 2, unit));
}

/**
 * The rules with suggested amounts at this square price, for a board total of
 * `price × squares` (all squares before the draw, the claimed ones after).
 * Who wins, notes and whether every score shows amounts by score type stay.
 *
 * - Fixed moments only: the main prize at each moment (its square, else its
 *   reverse square) splits the total Q1 20 · Half 20 · Q3 20 · Final 40
 *   (Halftime + Final: 40 · 60; other sets normalize those weights). A
 *   reverse square beside a moment's square gets four square prices first
 *   (at most 40% of the total in all), and the main prizes split the rest.
 *   The last moment (the Final) takes up the rounding, so they add up to
 *   exactly the total.
 * - Every score change: by score type, multiples of one base unit of half
 *   the square price (suggestedKindAmounts: a touchdown 4 units, a field
 *   goal, 2-point conversion or safety 2, an extra point 1); the square price
 *   as the flat amount (with score types off, and the quiet fallback with
 *   them on); the reverse square gets the same. The final score's square
 *   gets the rest of the board total; any other fixed moment's square, and
 *   every reverse square there, four square prices.
 *
 * Fixed amounts are "nice" (niceAmount). Without a price or a square, the
 * rules come back unchanged.
 */
export function suggestPrizes(rules: readonly MomentRule[], price: number | null | undefined, squares: number, unit: AmountUnit = "$"): MomentRule[] {
  if (!price || !(price > 0) || !(squares > 0)) return [...rules];
  return hasScoreMoment(rules) ? suggestEveryScore(rules, price, unit) : suggestFixed(rules, price, round2(price * squares));
}

/** A prize with this amount (null for none), its note kept, "the rest" and amounts by score type dropped. */
const fixedPrize = (p: Prize, amount: number | null): Prize => ({ amount: amount && amount > 0 ? amount : null, note: p.note });

function suggestEveryScore(rules: readonly MomentRule[], price: number, unit: AmountUnit): MomentRule[] {
  const score = ruleFor(rules, "score");
  const kindsOn = !!(score?.square?.byKind || score?.reverse?.byKind);
  const flat = round2(price);
  const side = niceAmount(SUGGESTED_SIDE_SQUARES * price);
  const table = suggestedKindAmounts(price, unit);
  const scorePrize = (p: Prize | null): Prize | null => (p ? (kindsOn ? { amount: flat, note: p.note, byKind: { ...table } } : fixedPrize(p, flat)) : null);
  return rules.map((r) => {
    if (r.moment === "score") return { ...r, square: scorePrize(r.square), reverse: scorePrize(r.reverse) };
    const square = r.square ? (r.moment === "final" ? { amount: null, note: r.square.note, rest: true as const } : fixedPrize(r.square, side)) : null;
    return { ...r, square, reverse: r.reverse ? fixedPrize(r.reverse, side) : null };
  });
}

function suggestFixed(rules: readonly MomentRule[], price: number, total: number): MomentRule[] {
  const fixed = sortRules(rules);
  const extras = fixed.filter((r) => r.square && r.reverse).length;
  let reverse = niceAmount(SUGGESTED_SIDE_SQUARES * price);
  const cap = total * REVERSE_MAX_SHARE;
  if (extras > 0 && reverse * extras > cap) reverse = niceAmount(cap / extras, true);
  const pool = round2(total - reverse * extras);
  const weights = suggestedWeights(fixed.map((r) => r.moment as Exclude<Moment, "score">));
  const sum = weights.reduce((n, w) => n + w, 0);
  const last = fixed.length - 1;
  let mains = weights.map((w, i) => (i === last ? 0 : niceAmount((pool * w) / sum)));
  mains[last] = round2(pool - mains.reduce((n, a) => n + a, 0));
  // A total too small for nice amounts: exact whole shares instead.
  if (mains[last] < 1) mains = wholeShares(pool, weights);
  return fixed.map((r, i) => {
    if (!r.square) return { ...r, reverse: r.reverse ? fixedPrize(r.reverse, mains[i]) : null };
    return { ...r, square: fixedPrize(r.square, mains[i]), reverse: r.reverse ? fixedPrize(r.reverse, reverse) : null };
  });
}

/**
 * About what a typical game brings, for the every-score estimate: 9
 * touchdowns, 8 extra points, 4 field goals and one 2-point conversion.
 */
export const TYPICAL_GAME: Record<ScoreKind, number> = { touchdown: 9, fieldGoal: 4, extraPoint: 8, twoPoint: 1, safety: 0 };

/**
 * What the prizes would give out in a typical game (TYPICAL_GAME): every
 * score change's amounts (square and reverse), plus each fixed moment's
 * amounts other than the rest. null without an every-score rule.
 */
export function typicalGameTotal(rules: readonly MomentRule[]): number | null {
  const score = ruleFor(rules, "score");
  if (!score) return null;
  let sum = fixedPrizeTotal(rules);
  for (const kind of SCORE_KINDS) sum += TYPICAL_GAME[kind] * ((prizeAmount(score.square, kind) ?? 0) + (prizeAmount(score.reverse, kind) ?? 0));
  return round2(sum);
}

// ---- Splitting the board's total evenly ----

/**
 * Whole amounts (dollars or points) in proportion to `weights` that add up
 * to exactly `total` (floored to a whole number): the largest remainders get
 * the leftover units, ties going to the later share (the Final).
 */
export function wholeShares(total: number, weights: readonly number[]): number[] {
  const whole = Number.isFinite(total) ? Math.max(0, Math.floor(total)) : 0;
  const sum = weights.reduce((n, w) => n + w, 0);
  if (sum <= 0) return weights.map(() => 0);
  const exact = weights.map((w) => (whole * w) / sum);
  const out = exact.map((v) => Math.floor(v));
  let left = whole - out.reduce((n, v) => n + v, 0);
  const order = exact.map((v, i) => ({ i, rem: v - Math.floor(v) })).sort((a, b) => b.rem - a.rem || b.i - a.i);
  for (const { i } of order) {
    if (left <= 0) break;
    out[i] += 1;
    left -= 1;
  }
  return out;
}

/**
 * The rules with the fixed moments' amounts filled evenly from the board's
 * total ("Even", the suggestion's alternative), in whole units that add up to
 * it. A moment where both the square and the reverse square win shares its
 * part evenly between them (the square gets an odd unit). The final's "rest"
 * becomes its share. Every score change, notes and who wins stay as they are.
 */
export function splitEvenly(rules: readonly MomentRule[], total: number): MomentRule[] {
  const fixed = fixedMoments(rules);
  const shares = wholeShares(total, fixed.map(() => 1));
  const shareOf = new Map<Moment, number>(fixed.map((m, i) => [m, shares[i]]));
  const set = (p: Prize | null, amount: number): Prize | null => (p ? fixedPrize(p, amount) : null);
  return rules.map((r) => {
    const share = shareOf.get(r.moment);
    if (share === undefined) return r;
    if (r.square && r.reverse) {
      const rev = Math.floor(share / 2);
      return { ...r, square: set(r.square, share - rev), reverse: set(r.reverse, rev) };
    }
    return { ...r, square: set(r.square, share), reverse: set(r.reverse, share) };
  });
}

type Checked<T> = { ok: true; value: T } | { ok: false; error: string };

/** An amount from API input: null when absent, else a number above 0 up to `max`, rounded to cents. */
function checkAmount(v: unknown, max: number, what: string): Checked<number | null> {
  if (v === null || v === undefined) return { ok: true, value: null };
  if (typeof v !== "number" || !Number.isFinite(v) || v <= 0 || v > max) {
    return { ok: false, error: `${what} must be a number above 0, up to ${max.toLocaleString("en-US")}` };
  }
  const value = round2(v);
  return value > 0 ? { ok: true, value } : { ok: false, error: `${what} must be a number above 0, up to ${max.toLocaleString("en-US")}` };
}

/** A prize note as stored: whitespace collapsed, trimmed to PRIZE_MAX_LENGTH. */
export function tidyNote(v: unknown): string {
  if (typeof v !== "string") return "";
  return v.replace(/\s+/g, " ").trim().slice(0, PRIZE_MAX_LENGTH).trim();
}

/** Amounts by score type on a moment other than every score change (the API answers 400). */
export const BY_KIND_MOMENT_ERROR = "Amounts by score type only go with every score change.";

/**
 * Amounts by score type from API input: undefined when there are none; each
 * a number above 0 up to AMOUNT_MAX, rounded to cents, in SCORE_KINDS order.
 * A null value leaves that kind on the default amount.
 */
function checkByKind(v: unknown): Checked<Partial<Record<ScoreKind, number>> | undefined> {
  if (v === null || v === undefined) return { ok: true, value: undefined };
  if (typeof v !== "object" || Array.isArray(v)) return { ok: false, error: "Amounts by score type need a number for each type" };
  const input = v as Record<string, unknown>;
  if (Object.keys(input).some((key) => !(SCORE_KINDS as readonly string[]).includes(key))) return { ok: false, error: "Unknown score type" };
  const out: Partial<Record<ScoreKind, number>> = {};
  for (const kind of SCORE_KINDS) {
    const amount = checkAmount(input[kind], AMOUNT_MAX, `The ${SCORE_KIND_INFO[kind].label.toLowerCase()} amount`);
    if (!amount.ok) return amount;
    if (amount.value !== null) out[kind] = amount.value;
  }
  return { ok: true, value: Object.keys(out).length > 0 ? out : undefined };
}

/**
 * Lenient: the valid amounts by score type in an input (unknown kinds and bad
 * amounts dropped), or undefined. A legacy "conversion" amount fills the
 * extra point and the 2-point conversion where they have none of their own.
 */
function lenientByKind(v: unknown): Partial<Record<ScoreKind, number>> | undefined {
  if (!v || typeof v !== "object" || Array.isArray(v)) return undefined;
  const input = v as Record<string, unknown>;
  const out: Partial<Record<ScoreKind, number>> = {};
  for (const kind of SCORE_KINDS) {
    const own = input[kind] ?? (CONVERSION_KINDS.includes(kind) ? input[LEGACY_CONVERSION] : undefined);
    const amount = checkAmount(own, AMOUNT_MAX, "");
    if (amount.ok && amount.value !== null) out[kind] = amount.value;
  }
  return Object.keys(out).length > 0 ? out : undefined;
}

/** A prize as stored: `byKind` only when it has a value; with `rest`, no amount of its own. */
function prizeOf(amount: number | null, note: string, byKind: Partial<Record<ScoreKind, number>> | undefined, rest = false): Prize {
  if (rest) return { amount: null, note, rest: true };
  return byKind ? { amount, note, byKind } : { amount, note };
}

/**
 * A prize's amounts by score type the way they're stored: only kinds with an
 * amount, in SCORE_KINDS order (a legacy "conversion" read into the extra
 * point and the 2-point conversion), and no `byKind` at all when there are
 * none. With `rest`, its amount is null.
 */
export function tidyPrize(prize: Prize): Prize {
  const { byKind, rest, ...others } = prize;
  if (rest) return { ...others, amount: null, rest: true };
  const kinds = lenientByKind(byKind);
  return kinds ? { ...others, byKind: kinds } : others;
}

/** "The rest of the board total" anywhere but the final score's square (the API answers 400). */
export const REST_MOMENT_ERROR = "Only the final score's square can take the rest of the board total.";
/** "The rest of the board total" without a square price (the API answers 400): there's no total to take the rest of. */
export const REST_PRICE_ERROR = "The rest of the board total needs a square price.";

function checkPrize(v: unknown, moment: Moment, side: "square" | "reverse"): Checked<Prize | null> {
  if (v === null || v === undefined) return { ok: true, value: null };
  if (typeof v !== "object" || Array.isArray(v)) return { ok: false, error: "Each prize needs an amount and a note" };
  const p = v as Record<string, unknown>;
  const amount = checkAmount(p.amount, AMOUNT_MAX, "A prize amount");
  if (!amount.ok) return amount;
  if (p.note !== undefined && typeof p.note !== "string") return { ok: false, error: "A prize note must be text" };
  const note = tidyNote(p.note);
  const problem = note ? validatePrizeNote(note) : null;
  if (problem) return { ok: false, error: problem };
  const byKind = checkByKind(p.byKind);
  if (!byKind.ok) return byKind;
  if (byKind.value && moment !== "score") return { ok: false, error: BY_KIND_MOMENT_ERROR };
  if (p.rest !== undefined && typeof p.rest !== "boolean") return { ok: false, error: "rest must be true or false" };
  if (p.rest === true && (moment !== "final" || side !== "square")) return { ok: false, error: REST_MOMENT_ERROR };
  return { ok: true, value: prizeOf(amount.value, note, byKind.value, p.rest === true) };
}

/** Strict check of a rules list; the canonical rules, or the message the API answers 400 with. */
function checkRules(v: unknown): Checked<MomentRule[]> {
  if (!Array.isArray(v) || v.length === 0) return { ok: false, error: "Pick at least one moment that wins" };
  if (v.length > MAX_RULES) return { ok: false, error: "Too many winning moments" };
  const out: MomentRule[] = [];
  for (const item of v) {
    if (!item || typeof item !== "object" || Array.isArray(item)) return { ok: false, error: "Unknown winning moment" };
    const r = item as Record<string, unknown>;
    if (typeof r.moment !== "string" || !(MOMENTS as readonly string[]).includes(r.moment)) return { ok: false, error: "Unknown winning moment" };
    const moment = r.moment as Moment;
    if (out.some((x) => x.moment === moment)) return { ok: false, error: "Each moment can only be listed once" };
    const square = checkPrize(r.square, moment, "square");
    if (!square.ok) return square;
    const reverse = checkPrize(r.reverse, moment, "reverse");
    if (!reverse.ok) return reverse;
    if (!square.value && !reverse.value) return { ok: false, error: `${MOMENT_INFO[moment].label} needs a square or a reverse winner` };
    out.push({ moment, square: square.value, reverse: reverse.value });
  }
  return { ok: true, value: sortRules(out) };
}

/** Lenient: the valid rules in a list (bad amounts dropped, notes that mention money cleared), or null when none. */
function sanitizeRules(v: unknown): MomentRule[] | null {
  if (!Array.isArray(v)) return null;
  const prize = (x: unknown, moment: Moment, side: "square" | "reverse"): Prize | null => {
    if (!x || typeof x !== "object" || Array.isArray(x)) return null;
    const p = x as Record<string, unknown>;
    const amount = checkAmount(p.amount, AMOUNT_MAX, "");
    const note = tidyNote(p.note);
    const byKind = moment === "score" ? lenientByKind(p.byKind) : undefined;
    const rest = p.rest === true && moment === "final" && side === "square";
    return prizeOf(amount.ok ? amount.value : null, note && !validatePrizeNote(note) ? note : "", byKind, rest);
  };
  const out: MomentRule[] = [];
  for (const item of v) {
    if (out.length >= MAX_RULES) break;
    if (!item || typeof item !== "object") continue;
    const r = item as Record<string, unknown>;
    if (typeof r.moment !== "string" || !(MOMENTS as readonly string[]).includes(r.moment)) continue;
    const moment = r.moment as Moment;
    if (out.some((x) => x.moment === moment)) continue;
    const square = prize(r.square, moment, "square");
    const reverse = prize(r.reverse, moment, "reverse");
    if (!square && !reverse) continue;
    out.push({ moment, square, reverse });
  }
  return out.length > 0 ? sortRules(out) : null;
}

function isPreset(v: unknown): v is FixedPreset {
  return typeof v === "string" && (PERIOD_PRESETS as readonly string[]).includes(v);
}

function isBoardSize(v: unknown): v is BoardSize {
  return typeof v === "number" && (BOARD_SIZES as readonly number[]).includes(v);
}

/** A just-for-fun board with a square price or an amount (the API answers 400). */
export const JUST_FOR_FUN_ERROR = "A just-for-fun board doesn't show a square price or amounts.";

/** Rules with every amount cleared (amounts by score type and the rest too; notes kept), for a just-for-fun board. */
export function withoutAmounts(rules: readonly MomentRule[]): MomentRule[] {
  const clear = (p: Prize | null): Prize | null => (p ? { amount: null, note: p.note } : null);
  return rules.map((r) => ({ ...r, square: clear(r.square), reverse: clear(r.reverse) }));
}

/**
 * Strict check for API input: returns an error message, or null when valid.
 * With `rules`, `periods` and `reverse` are derived (and ignored here); a
 * note inside is checked like any prize note. Without rules (older clients)
 * it's a preset + reverse, and fresh numbers need the quarters preset.
 */
export function formatError(input: unknown): string | null {
  if (!input || typeof input !== "object") return "Format is required";
  const f = input as Record<string, unknown>;
  if (!isBoardSize(f.boardSize)) return "Board size must be 100 or 25";
  if (typeof f.freshNumbers !== "boolean") return "freshNumbers must be true or false";
  if (f.unit !== undefined && !(AMOUNT_UNITS as readonly unknown[]).includes(f.unit)) return "Amounts are in $ or points";
  if (f.justForFun !== undefined && typeof f.justForFun !== "boolean") return "justForFun must be true or false";
  const price = checkAmount(f.squarePrice, SQUARE_PRICE_MAX, "The square price");
  if (!price.ok) return price.error;
  if (f.justForFun === true && price.value !== null) return JUST_FOR_FUN_ERROR;
  if (f.rules !== undefined) {
    const rules = checkRules(f.rules);
    if (!rules.ok) return rules.error;
    if (f.freshNumbers && !freshNumbersAllowed(rules.value)) return "New numbers each quarter can't go with a winner on every score";
    if (f.justForFun === true && rules.value.some((r) => prizeHasAmount(r.square) || prizeHasAmount(r.reverse))) return JUST_FOR_FUN_ERROR;
    if (hasRest(rules.value) && price.value === null) return REST_PRICE_ERROR;
    return null;
  }
  if (!isPreset(f.periods)) return "Unknown scoring format";
  if (typeof f.reverse !== "boolean") return "reverse must be true or false";
  if (f.freshNumbers && f.periods !== "quarters") return "New numbers each quarter needs the quarters format";
  return null;
}

/**
 * Lenient coercion: anything invalid falls back to the default for that
 * field. A format with rules comes back canonical (periods/reverse derived
 * from the rules, unit and square price filled in); one without stays a
 * preset (see withRules).
 */
export function sanitizeFormat(input: unknown): GameFormat {
  const base = defaultFormat();
  if (!input || typeof input !== "object") return base;
  const f = input as Record<string, unknown>;
  const boardSize = isBoardSize(f.boardSize) ? f.boardSize : base.boardSize;
  const rules = sanitizeRules(f.rules);
  const price = checkAmount(f.squarePrice, SQUARE_PRICE_MAX, "");
  const squarePrice = price.ok ? price.value : null;
  const unit: AmountUnit = f.unit === "pts" ? "pts" : "$";
  const fun = f.justForFun === true;
  if (rules) {
    return {
      periods: presetFor(rules),
      reverse: rules.some((r) => !!r.reverse),
      boardSize,
      freshNumbers: f.freshNumbers === true && freshNumbersAllowed(rules),
      rules: fun ? withoutAmounts(rules) : squarePrice ? rules : withoutRest(rules),
      unit,
      squarePrice: fun ? null : squarePrice,
      justForFun: fun,
    };
  }
  const periods = isPreset(f.periods) ? f.periods : base.periods;
  const out: GameFormat = {
    periods,
    boardSize,
    reverse: f.reverse === true,
    freshNumbers: f.freshNumbers === true && periods === "quarters",
  };
  if (f.unit !== undefined) out.unit = unit;
  if (f.squarePrice !== undefined) out.squarePrice = fun ? null : squarePrice;
  if (f.justForFun !== undefined) out.justForFun = fun;
  return out;
}

/**
 * The canonical stored form of a format: rules always present (a preset's
 * derived ones, with `legacyPrizes` notes folded in), periods/reverse derived
 * from them, unit and square price filled in. What new boards store.
 */
export function withRules(format: GameFormat, legacyPrizes?: Record<string, string>): GameFormat {
  const fun = format.justForFun === true;
  const rules = sortRules(rulesOf(format, legacyPrizes));
  return {
    periods: presetFor(rules),
    reverse: rules.some((r) => !!r.reverse),
    boardSize: format.boardSize,
    freshNumbers: format.freshNumbers && freshNumbersAllowed(rules),
    rules: fun ? withoutAmounts(rules) : format.squarePrice ? rules : withoutRest(rules),
    unit: unitOf(format),
    squarePrice: fun ? null : (format.squarePrice ?? null),
    justForFun: fun,
  };
}

/** True when a prize/score key is valid for this format. */
export function isPeriodKeyFor(format: GameFormat, key: string): boolean {
  return ruleForPeriodKey(rulesOf(format), key) !== null;
}

// ---- Prize notes: fun extras only, never money ----
//
// JaxSquares never moves money between players (our rule, and App Store
// guideline 5.3 on gambling). Amounts have their own display-only fields; a
// prize note is for extras like "Loser buys wings", so notes that put an
// amount in words or talk about cash, payment apps or betting are rejected.

/** A note with a currency amount in it: amounts go in the amount box. */
export const PRIZE_AMOUNT_ERROR = "Put amounts in the amount box. Notes are for extras, like 'Loser buys wings'.";

/** A note about cash, payment apps or betting (never allowed). */
export const PRIZE_MONEY_ERROR = "Notes can't mention cash or payment apps. Keep it fun, like 'Loser buys wings'.";

/**
 * The same rule for the other text a board shows everyone (the API answers 400
 * with these). The board name is also every push's title.
 */
export const MONEY_ERRORS = {
  name: "Board names can't mention money. Try something like 'Sunday Squares'.",
  team: "Team names can't mention money.",
  label: "Score labels can't mention money.",
} as const;

/** An amount: digits ("20", "1,000") or a number word, not inside a longer word. */
const AMOUNT = String.raw`(?<![a-z])(?:\d[\d,.]*|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|fifteen|twenty|thirty|forty|fifty|hundred|thousand|few|couple(?:\s+of)?|big)`;

/** A currency amount written out. */
const AMOUNT_PATTERNS: readonly RegExp[] = [
  // Any currency symbol ($ € £ ¥ ₹ ¢ ...), e.g. "$20" or "5€".
  /\p{Sc}/u,
  // Currency codes and words, also stuck to a number ("20usd", "20dollars", "50 quid").
  /(?<![a-z])(?:usd|cad|aud|nzd|eur|gbp|dollars?|quid(?!\s+pro\b))\b/,
  // "Bucks" and "euros" as an amount ("5 bucks", "5bucks", "a buck"), never the team.
  new RegExp(String.raw`${AMOUNT}\s*(?:bucks?|euros?)\b|\ba\s+buck\b`),
  // Paying or owing an amount ("Loser pays winner 25", "owes 20 each"), but
  // not paying for things ("Loser pays for 2 pizzas").
  /\b(?:pay|pays|paid|paying|owe|owes|owed|owing)\b(?:\s+[a-z']+){0,2}\s+\d[\d,.]*(?=\s*(?:$|[^\sa-z]|(?:each|apiece|to|per|a|an|total|for|if|and|or)\b))/,
];

/** Cash, payment apps and betting talk. */
const TALK_PATTERNS: readonly RegExp[] = [
  // Cash as the prize ("winner gets cash", "cash prize", "cash for the winner"),
  // not a name that starts with it ("Cash cab") or a cashew.
  /\bcash(?:[\s-]?(?:app|out)\b|\b(?=\s*(?:$|[^\sa-z]|(?:prizes?|money|rewards?|bonus\w*|payouts?|pool|to|for|from|in|or|and|each|only|back|up)\b)))/,
  // The money pool ("winner takes the pot"), not a pot of chili or a pot luck.
  /\b(?:the|whole|split)\s+pot\b(?!\s+(?:of|luck|roast|pie)\b)/,
  // Money words, payment apps and betting language.
  /\b(?:money|venmo\w*|paypal\w*|zelle\w*|(?:apple|google|samsung)\s*pay|gpay|payouts?|pay[\s-]outs?|jackpots?|buy[\s-]?ins?|bets?|betting|bettors?|wager\w*|gambl\w*)\b/,
];

function normalized(text: string): string {
  return text
    .normalize("NFKC")
    .replace(/[\u200b-\u200d\u2060\ufeff\u00ad]/g, "")
    .toLowerCase();
}

/**
 * True when free text talks about money: currencies, amounts, paying someone,
 * payment apps, betting. Best effort; case, full-width letters and zero-width
 * characters don't get around it.
 */
export function mentionsMoney(text: string): boolean {
  const t = normalized(text);
  return TALK_PATTERNS.some((re) => re.test(t)) || AMOUNT_PATTERNS.some((re) => re.test(t));
}

/**
 * Why a prize note isn't allowed, or null when it's fine: cash, payment-app
 * and betting talk first (PRIZE_MONEY_ERROR), then a currency amount
 * (PRIZE_AMOUNT_ERROR: it belongs in the amount box). Shared so the forms
 * validate inline with the exact rule the server enforces.
 */
export function validatePrizeNote(note: string): string | null {
  const t = normalized(note);
  if (TALK_PATTERNS.some((re) => re.test(t))) return PRIZE_MONEY_ERROR;
  if (AMOUNT_PATTERNS.some((re) => re.test(t))) return PRIZE_AMOUNT_ERROR;
  return null;
}

/** True for either prize-note refusal (the create page reopens its rules on one). */
export function isPrizeNoteError(message: string): boolean {
  return message === PRIZE_MONEY_ERROR || message === PRIZE_AMOUNT_ERROR;
}

/** Thrown by sanitizePrizes for a note that mentions money; `message` is safe to show. */
export class PrizeNoteError extends Error {
  constructor(
    message: string,
    /** The period key ("q1", "*", ...) of the offending note. */
    readonly key: string,
  ) {
    super(message);
    this.name = "PrizeNoteError";
  }
}

/**
 * Keeps legacy prize notes for this format's periods, trimmed to
 * PRIZE_MAX_LENGTH. "*" is a note that applies to every period without its own
 * (handy for every-score boards). Empty notes are dropped. Throws
 * PrizeNoteError when a kept note mentions money (see validatePrizeNote); the
 * API answers 400.
 */
export function sanitizePrizes(format: GameFormat, input: unknown): Record<string, string> {
  const out: Record<string, string> = {};
  if (!input || typeof input !== "object" || Array.isArray(input)) return out;
  let count = 0;
  for (const [key, value] of Object.entries(input as Record<string, unknown>)) {
    if (count >= 50) break;
    if (typeof value !== "string") continue;
    if (key !== SHARED_DRAW_KEY && !isPeriodKeyFor(format, key)) continue;
    const note = tidyNote(value);
    if (!note) continue;
    const problem = validatePrizeNote(note);
    if (problem) throw new PrizeNoteError(problem, key);
    out[key] = note;
    count++;
  }
  return out;
}

/**
 * Legacy notes (period key -> note, "" clears) written into rules: each
 * goes to its moment's square note (the reverse note when the square doesn't
 * win then); "*" fills every moment not given its own. How an older client's
 * edit lands on a board that has rules.
 */
export function foldNotes(rules: readonly MomentRule[], notes: Record<string, string>): MomentRule[] {
  return rules.map((r) => {
    const key = r.moment === "score" ? SHARED_DRAW_KEY : r.moment;
    const note = notes[key] ?? (r.moment === "score" ? undefined : notes[SHARED_DRAW_KEY]);
    if (note === undefined) return r;
    if (r.square) return { ...r, square: { ...r.square, note } };
    return r.reverse ? { ...r, reverse: { ...r.reverse, note } } : r;
  });
}

/** The legacy prize note for a period, falling back to the "*" note. */
export function prizeFor(prizes: Record<string, string>, periodKey: string): string | null {
  return prizes[periodKey] ?? prizes[SHARED_DRAW_KEY] ?? null;
}

/**
 * The note shown for a period (its square's, else its reverse square's),
 * never an amount: safe for pushes. Older boards read their legacy notes.
 */
export function periodNote(format: GameFormat, prizes: Record<string, string>, periodKey: string): string | null {
  if (!format.rules?.length) return ruleForPeriodKey(rulesOf(format), periodKey) ? prizeFor(prizes, periodKey) : null;
  const rule = ruleForPeriodKey(format.rules, periodKey);
  return rule?.square?.note || rule?.reverse?.note || null;
}

// ---- Summaries ----

/** "Quarters", "Halves", "Final", "Every score", or the moments' chips ("Q1 + Q3"). */
function fixedLabel(moments: readonly Moment[]): string {
  const set = moments.join(",");
  if (set === "q1,q2,q3,final") return "Quarters";
  if (set === "q2,final") return "Halves";
  if (set === "final") return "Final";
  return moments.map((m) => MOMENT_INFO[m].short).join(" + ");
}

/** The moments that win, in a few words: "Quarters", "Every score + quarters", "Every score + Final". */
export function momentsLabel(rules: readonly MomentRule[]): string {
  const fixed = fixedMoments(rules);
  if (!hasScoreMoment(rules)) return fixed.length ? fixedLabel(fixed) : "No winners";
  if (fixed.length === 0) return "Every score";
  const rest = fixedLabel(fixed);
  return `Every score + ${rest === "Quarters" || rest === "Halves" ? rest.toLowerCase() : rest}`;
}

/** Where reverse squares win, when it isn't every moment: "Reverse on quarters", "Reverse on Final". Null without any. */
function reverseLabel(rules: readonly MomentRule[]): string | null {
  const rev = rules.filter((r) => r.reverse).map((r) => r.moment);
  if (rev.length === 0) return null;
  if (rev.length === rules.length) return "Reverse";
  const label = momentsLabel(rules.filter((r) => r.reverse));
  return `Reverse on ${label === "Quarters" || label === "Halves" || label === "Every score" ? label.toLowerCase() : label}`;
}

/** One-line summary, e.g. "Quarters · 10×10 · Reverse · New numbers each quarter" or "Every score + quarters · 10×10 · Reverse on quarters". */
export function formatSummary(format: GameFormat): string {
  const rules = rulesOf(format);
  const exact = matchingPreset(rules);
  const parts = [exact ? PRESET_INFO[exact.preset].short : momentsLabel(rules), BOARD_SIZE_INFO[format.boardSize].short];
  const rev = reverseLabel(rules);
  if (rev) parts.push(rev);
  if (format.freshNumbers && freshNumbersAllowed(rules)) parts.push("New numbers each quarter");
  return parts.join(" · ");
}

/** The rules as one line with no board size: "Every score + quarters · Reverse on quarters". */
export function rulesSummary(rules: readonly MomentRule[]): string {
  const exact = matchingPreset(rules);
  const parts = [exact ? PRESET_INFO[exact.preset].label : momentsLabel(rules)];
  const rev = reverseLabel(rules);
  if (rev) parts.push(rev);
  return parts.join(" · ");
}

/**
 * How to talk about a period. `short` is the chip/card label ("Q1", "Half",
 * "Final", "Score 3"); `moment` reads naturally inside a sentence
 * ("Your square hit at halftime", "Maya wins at the end of Q1").
 * Every screen uses this so the app speaks one vocabulary.
 */
export function periodPhrase(periodKey: string, label?: string): { short: string; moment: string } {
  switch (periodKey) {
    case "q1":
      return { short: "Q1", moment: "at the end of Q1" };
    case "q2":
      return { short: "Half", moment: "at halftime" };
    case "q3":
      return { short: "Q3", moment: "at the end of Q3" };
    case "final":
      return { short: "Final", moment: "at the final whistle" };
  }
  const n = everyScoreIndex(periodKey);
  if (n !== null) return { short: label || `Score ${n}`, moment: `on score ${n}` };
  return { short: label || periodKey, moment: label ? `at ${label}` : "" };
}
