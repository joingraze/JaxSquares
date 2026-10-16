// Board formats: which scoring moments win a square, board size, reverse and
// fresh-number options. Pure and framework-free (used by worker + client).

import type { BoardSize, GameFormat, Period, PeriodsPreset } from "./types";

export const PERIOD_PRESETS: readonly PeriodsPreset[] = ["quarters", "halves", "final", "every-score"];
export const BOARD_SIZES: readonly BoardSize[] = [100, 25];

/** Key of the single number draw used unless fresh numbers are drawn per quarter. */
export const SHARED_DRAW_KEY = "*";

/** Max length of a host's free-text prize note. */
export const PRIZE_MAX_LENGTH = 60;

const FIXED_PERIODS: Record<Exclude<PeriodsPreset, "every-score">, Period[]> = {
  quarters: [
    { key: "q1", label: "Q1" },
    { key: "q2", label: "Half" },
    { key: "q3", label: "Q3" },
    { key: "final", label: "Final" },
  ],
  halves: [
    { key: "q2", label: "Half" },
    { key: "final", label: "Final" },
  ],
  final: [{ key: "final", label: "Final" }],
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

export function defaultFormat(): GameFormat {
  return { periods: "quarters", reverse: false, boardSize: 100, freshNumbers: false };
}

/** Fixed periods for a preset; every-score has none (its periods come from scores). */
export function periodsFor(preset: PeriodsPreset): Period[] {
  if (preset === "every-score") return [];
  return FIXED_PERIODS[preset].map((p) => ({ ...p }));
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

/** Keys of the number draws a locked board holds. */
export function drawKeys(format: GameFormat): string[] {
  return format.freshNumbers && format.periods === "quarters"
    ? FIXED_PERIODS.quarters.map((p) => p.key)
    : [SHARED_DRAW_KEY];
}

function isPreset(v: unknown): v is PeriodsPreset {
  return typeof v === "string" && (PERIOD_PRESETS as readonly string[]).includes(v);
}

function isBoardSize(v: unknown): v is BoardSize {
  return typeof v === "number" && (BOARD_SIZES as readonly number[]).includes(v);
}

/**
 * Strict check for API input: returns an error message, or null when valid.
 * freshNumbers only makes sense with quarters.
 */
export function formatError(input: unknown): string | null {
  if (!input || typeof input !== "object") return "Format is required";
  const f = input as Record<string, unknown>;
  if (!isPreset(f.periods)) return "Unknown scoring format";
  if (!isBoardSize(f.boardSize)) return "Board size must be 100 or 25";
  if (typeof f.reverse !== "boolean") return "reverse must be true or false";
  if (typeof f.freshNumbers !== "boolean") return "freshNumbers must be true or false";
  if (f.freshNumbers && f.periods !== "quarters") return "New numbers each quarter needs the quarters format";
  return null;
}

/** Lenient coercion: anything invalid falls back to the default for that field. */
export function sanitizeFormat(input: unknown): GameFormat {
  const base = defaultFormat();
  if (!input || typeof input !== "object") return base;
  const f = input as Record<string, unknown>;
  const periods = isPreset(f.periods) ? f.periods : base.periods;
  return {
    periods,
    boardSize: isBoardSize(f.boardSize) ? f.boardSize : base.boardSize,
    reverse: f.reverse === true,
    freshNumbers: f.freshNumbers === true && periods === "quarters",
  };
}

/** True when a prize/score key is valid for this format. */
export function isPeriodKeyFor(format: GameFormat, key: string): boolean {
  if (format.periods === "every-score") return everyScoreIndex(key) !== null;
  return FIXED_PERIODS[format.periods].some((p) => p.key === key);
}

// ---- Prize notes: fun stakes only, never money ----
//
// JaxSquares never moves money between players (our rule, and App Store
// guideline 5.3 on gambling). A prize note is for things like "Loser buys
// wings", so notes that mention money, payment apps or betting are rejected.

export const PRIZE_MONEY_ERROR = "Prize notes can't include money. Try something like 'Loser buys wings'.";

const MONEY_PATTERNS: readonly RegExp[] = [
  // Any currency symbol ($ € £ ¥ ₹ ¢ ...), e.g. "$20" or "5€".
  /\p{Sc}/u,
  // Amounts with a currency code, e.g. "20 usd".
  /\b(?:usd|eur|gbp)\b/,
  // Money words, payment apps and betting language.
  /\b(?:dollars?|bucks?|cash|cash[\s-]?(?:app|out)|money|venmo\w*|paypal\w*|zelle\w*|payouts?|pay[\s-]outs?|pots?|jackpots?|buy[\s-]?ins?|bets?|betting|bettors?|wager\w*|gambl\w*)\b/,
];

/**
 * Why a prize note isn't allowed, or null when it's fine. Shared so the create
 * form can validate inline with the exact rule the server enforces.
 */
export function validatePrizeNote(note: string): string | null {
  const text = note
    .normalize("NFKC")
    .replace(/[\u200b-\u200d\u2060\ufeff\u00ad]/g, "")
    .toLowerCase();
  return MONEY_PATTERNS.some((re) => re.test(text)) ? PRIZE_MONEY_ERROR : null;
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
 * Keeps prize notes for this format's periods, trimmed to PRIZE_MAX_LENGTH.
 * "*" is a note that applies to every period without its own (handy for
 * every-score boards). Empty notes are dropped. Throws PrizeNoteError when a
 * kept note mentions money (see validatePrizeNote); the API answers 400.
 */
export function sanitizePrizes(format: GameFormat, input: unknown): Record<string, string> {
  const out: Record<string, string> = {};
  if (!input || typeof input !== "object" || Array.isArray(input)) return out;
  let count = 0;
  for (const [key, value] of Object.entries(input as Record<string, unknown>)) {
    if (count >= 50) break;
    if (typeof value !== "string") continue;
    if (key !== SHARED_DRAW_KEY && !isPeriodKeyFor(format, key)) continue;
    const note = value.replace(/\s+/g, " ").trim().slice(0, PRIZE_MAX_LENGTH).trim();
    if (!note) continue;
    const problem = validatePrizeNote(note);
    if (problem) throw new PrizeNoteError(problem, key);
    out[key] = note;
    count++;
  }
  return out;
}

/** The prize note for a period, falling back to the "*" note. */
export function prizeFor(prizes: Record<string, string>, periodKey: string): string | null {
  return prizes[periodKey] ?? prizes[SHARED_DRAW_KEY] ?? null;
}

/** One-line summary, e.g. "Quarters · 10×10 · Reverse · New numbers each quarter". */
export function formatSummary(format: GameFormat): string {
  const parts = [PRESET_INFO[format.periods].short, BOARD_SIZE_INFO[format.boardSize].short];
  if (format.reverse) parts.push("Reverse");
  if (format.freshNumbers && format.periods === "quarters") parts.push("New numbers each quarter");
  return parts.join(" · ");
}
