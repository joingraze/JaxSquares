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

/** True when the board shows any amount (a square price or a prize amount). */
export function hasAmounts(format: Pick<GameFormat, "periods" | "reverse" | "rules" | "squarePrice">): boolean {
  if (format.squarePrice) return true;
  return rulesOf(format).some((r) => !!r.square?.amount || !!r.reverse?.amount);
}

/** True when any prize (not counting the square price) has an amount. */
export function hasPrizeAmounts(format: Pick<GameFormat, "periods" | "reverse" | "rules">): boolean {
  return rulesOf(format).some((r) => !!r.square?.amount || !!r.reverse?.amount);
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

function checkPrize(v: unknown): Checked<Prize | null> {
  if (v === null || v === undefined) return { ok: true, value: null };
  if (typeof v !== "object" || Array.isArray(v)) return { ok: false, error: "Each prize needs an amount and a note" };
  const p = v as Record<string, unknown>;
  const amount = checkAmount(p.amount, AMOUNT_MAX, "A prize amount");
  if (!amount.ok) return amount;
  if (p.note !== undefined && typeof p.note !== "string") return { ok: false, error: "A prize note must be text" };
  const note = tidyNote(p.note);
  const problem = note ? validatePrizeNote(note) : null;
  if (problem) return { ok: false, error: problem };
  return { ok: true, value: { amount: amount.value, note } };
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
    const square = checkPrize(r.square);
    if (!square.ok) return square;
    const reverse = checkPrize(r.reverse);
    if (!reverse.ok) return reverse;
    if (!square.value && !reverse.value) return { ok: false, error: `${MOMENT_INFO[moment].label} needs a square or a reverse winner` };
    out.push({ moment, square: square.value, reverse: reverse.value });
  }
  return { ok: true, value: sortRules(out) };
}

/** Lenient: the valid rules in a list (bad amounts dropped, notes that mention money cleared), or null when none. */
function sanitizeRules(v: unknown): MomentRule[] | null {
  if (!Array.isArray(v)) return null;
  const prize = (x: unknown): Prize | null => {
    if (!x || typeof x !== "object" || Array.isArray(x)) return null;
    const p = x as Record<string, unknown>;
    const amount = checkAmount(p.amount, AMOUNT_MAX, "");
    const note = tidyNote(p.note);
    return { amount: amount.ok ? amount.value : null, note: note && !validatePrizeNote(note) ? note : "" };
  };
  const out: MomentRule[] = [];
  for (const item of v) {
    if (out.length >= MAX_RULES) break;
    if (!item || typeof item !== "object") continue;
    const r = item as Record<string, unknown>;
    if (typeof r.moment !== "string" || !(MOMENTS as readonly string[]).includes(r.moment)) continue;
    const moment = r.moment as Moment;
    if (out.some((x) => x.moment === moment)) continue;
    const square = prize(r.square);
    const reverse = prize(r.reverse);
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

/** Rules with every amount cleared (notes kept), for a just-for-fun board. */
function withoutAmounts(rules: readonly MomentRule[]): MomentRule[] {
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
    if (f.justForFun === true && rules.value.some((r) => r.square?.amount || r.reverse?.amount)) return JUST_FOR_FUN_ERROR;
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
      rules: fun ? withoutAmounts(rules) : rules,
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
    rules: fun ? withoutAmounts(rules) : rules,
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
