import { describe, expect, it } from "vitest";
import {
  AMOUNTS_DISCLAIMER,
  BY_KIND_MOMENT_ERROR,
  MONEY_ERRORS,
  SCORE_KIND_INFO,
  fixedPrizeTotal,
  formatRange,
  kindAmounts,
  prizeAmount,
  prizeRange,
  scorePlayLabel,
  splitEvenly,
  tidyPrize,
  SCORE_KINDS,
  TYPICAL_GAME,
  REST_MOMENT_ERROR,
  REST_PRICE_ERROR,
  hasRest,
  kindUnit,
  niceAmount,
  prizeHasAmount,
  restAllowed,
  ruleFor,
  sortRules,
  suggestPrizes,
  suggestedKindAmounts,
  typicalGameTotal,
  upgradeFormat,
  withoutAmounts,
  withoutRest,
  type FixedPreset,
  wholeShares,
  periodPhrase,
  PERIOD_PRESETS,
  PRESET_INFO,
  JUST_FOR_FUN_ERROR,
  PRIZE_AMOUNT_ERROR,
  PRIZE_MONEY_ERROR,
  PrizeNoteError,
  defaultFormat,
  drawKeys,
  everyScoreIndex,
  everyScorePeriod,
  fixedPeriods,
  foldNotes,
  formatAmount,
  formatError,
  formatSummary,
  hasAmounts,
  hasScoreMoment,
  isPeriodKeyFor,
  isPrizeNoteError,
  matchingPreset,
  momentOfKey,
  periodNote,
  periodsFor,
  presetFor,
  prizeFor,
  ruleForPeriodKey,
  rulesForPreset,
  rulesOf,
  rulesShape,
  rulesSummary,
  sanitizeFormat,
  sanitizePrizes,
  validatePrizeNote,
  withRules,
} from "./formats";
import type { GameFormat, Moment, MomentRule, Prize } from "./types";

const fmt = (over: Partial<GameFormat> = {}): GameFormat => ({ ...defaultFormat(), ...over });

/** Words that must never appear in the app's own copy (amounts are display-only, never wagering). */
const BETTING_WORDS = /\b(bet|bets|betting|wager\w*|pot|payouts?|buy-?ins?|jackpots?|odds|stakes|gambl\w*)\b/i;

/** The owner's example: every score -> the square, $50; each quarter-end -> the reverse square, $200. */
const OWNER_RULES: MomentRule[] = [
  { moment: "score", square: { amount: 50, note: "" }, reverse: null },
  { moment: "q1", square: null, reverse: { amount: 200, note: "" } },
  { moment: "q2", square: null, reverse: { amount: 200, note: "" } },
  { moment: "q3", square: null, reverse: { amount: 200, note: "" } },
  { moment: "final", square: null, reverse: { amount: 200, note: "Loser buys wings" } },
];

describe("periodsFor", () => {
  it("maps quarters to Q1 / Half / Q3 / Final", () => {
    expect(periodsFor("quarters")).toEqual([
      { key: "q1", label: "Q1" },
      { key: "q2", label: "Half" },
      { key: "q3", label: "Q3" },
      { key: "final", label: "Final" },
    ]);
  });

  it("maps halves and final", () => {
    expect(periodsFor("halves")).toEqual([
      { key: "q2", label: "Half" },
      { key: "final", label: "Final" },
    ]);
    expect(periodsFor("final")).toEqual([{ key: "final", label: "Final" }]);
  });

  it("has no fixed periods for every-score", () => {
    expect(periodsFor("every-score")).toEqual([]);
  });

  it("returns copies callers can mutate safely", () => {
    periodsFor("final")[0].label = "changed";
    expect(periodsFor("final")[0].label).toBe("Final");
  });
});

describe("every-score keys", () => {
  it("builds and parses s1..sN", () => {
    expect(everyScorePeriod(3)).toEqual({ key: "s3", label: "Score 3" });
    expect(everyScoreIndex("s12")).toBe(12);
    expect(everyScoreIndex("s0")).toBeNull();
    expect(everyScoreIndex("q1")).toBeNull();
    expect(everyScoreIndex("s1x")).toBeNull();
  });
});

describe("defaultFormat / labels", () => {
  it("defaults to a classic quarters board", () => {
    expect(defaultFormat()).toEqual({ periods: "quarters", reverse: false, boardSize: 100, freshNumbers: false });
  });

  it("has a label and explanation for every preset, with no money language", () => {
    for (const p of PERIOD_PRESETS) {
      const info = PRESET_INFO[p];
      expect(info.label.length).toBeGreaterThan(0);
      expect(info.short.length).toBeGreaterThan(0);
      expect(info.description).not.toMatch(/\$|bet|wager|gamble|pot|payout|buy-in/i);
    }
  });

  it("summarizes a format in one line", () => {
    expect(formatSummary(fmt({ reverse: true, freshNumbers: true }))).toBe(
      "Quarters · 10×10 · Reverse · New numbers each quarter",
    );
    expect(formatSummary(fmt({ periods: "every-score", boardSize: 25 }))).toBe("Every score · 5×5");
  });
});

describe("formatError", () => {
  it("accepts valid formats", () => {
    expect(formatError(fmt())).toBeNull();
    expect(formatError(fmt({ boardSize: 25, periods: "every-score", reverse: true }))).toBeNull();
    expect(formatError(fmt({ freshNumbers: true }))).toBeNull();
  });

  it("rejects fresh numbers outside quarters", () => {
    expect(formatError(fmt({ periods: "halves", freshNumbers: true }))).toMatch(/quarters/);
  });

  it("rejects bad fields", () => {
    expect(formatError(null)).not.toBeNull();
    expect(formatError({ ...fmt(), periods: "innings" })).not.toBeNull();
    expect(formatError({ ...fmt(), boardSize: 64 })).not.toBeNull();
    expect(formatError({ ...fmt(), reverse: "yes" })).not.toBeNull();
  });
});

describe("sanitizeFormat", () => {
  it("falls back field by field", () => {
    expect(sanitizeFormat({ periods: "halves", boardSize: 7, reverse: true })).toEqual({
      periods: "halves",
      boardSize: 100,
      reverse: true,
      freshNumbers: false,
    });
    expect(sanitizeFormat("nope")).toEqual(defaultFormat());
  });

  it("drops freshNumbers unless quarters", () => {
    expect(sanitizeFormat({ periods: "final", freshNumbers: true }).freshNumbers).toBe(false);
    expect(sanitizeFormat({ periods: "quarters", freshNumbers: true }).freshNumbers).toBe(true);
  });
});

describe("drawKeys", () => {
  it("uses one shared draw by default", () => {
    expect(drawKeys(fmt())).toEqual(["*"]);
    expect(drawKeys(fmt({ periods: "every-score" }))).toEqual(["*"]);
  });

  it("uses one draw per quarter with fresh numbers", () => {
    expect(drawKeys(fmt({ freshNumbers: true }))).toEqual(["q1", "q2", "q3", "final"]);
  });
});

describe("prizes", () => {
  it("keeps notes for this format's periods, trimmed to 60 chars", () => {
    const long = "x".repeat(80);
    expect(
      sanitizePrizes(fmt({ periods: "halves" }), {
        q1: "not a period here",
        q2: "  Loser   buys wings ",
        final: long,
        "*": "Bragging rights",
        bogus: "nope",
        empty: "",
      }),
    ).toEqual({ q2: "Loser buys wings", final: "x".repeat(60), "*": "Bragging rights" });
  });

  it("accepts every-score keys and ignores non-string values", () => {
    expect(sanitizePrizes(fmt({ periods: "every-score" }), { s1: "First!", s2: 5, q1: "no" })).toEqual({ s1: "First!" });
    expect(sanitizePrizes(fmt(), ["a"])).toEqual({});
  });

  it("falls back to the * note", () => {
    expect(prizeFor({ q1: "Wings", "*": "Pride" }, "q1")).toBe("Wings");
    expect(prizeFor({ "*": "Pride" }, "s4")).toBe("Pride");
    expect(prizeFor({}, "final")).toBeNull();
  });

  it("rejects notes that mention money, with a message the UI can show", () => {
    expect(() => sanitizePrizes(fmt(), { q1: "Loser buys wings", final: "$20 to the winner" })).toThrow(PrizeNoteError);
    try {
      sanitizePrizes(fmt(), { final: "Winner takes the pot" });
    } catch (err) {
      expect(err).toBeInstanceOf(PrizeNoteError);
      expect((err as PrizeNoteError).message).toBe(PRIZE_MONEY_ERROR);
      expect((err as PrizeNoteError).key).toBe("final");
    }
    // Notes for keys this format doesn't have are dropped before they're checked.
    expect(sanitizePrizes(fmt({ periods: "final" }), { q1: "$5", final: "Bragging rights" })).toEqual({ final: "Bragging rights" });
  });

  it("validates period keys per format", () => {
    expect(isPeriodKeyFor(fmt({ periods: "final" }), "final")).toBe(true);
    expect(isPeriodKeyFor(fmt({ periods: "final" }), "q1")).toBe(false);
    expect(isPeriodKeyFor(fmt({ periods: "every-score" }), "s9")).toBe(true);
  });
});

describe("validatePrizeNote", () => {
  it("allows fun, money-free stakes", () => {
    for (const ok of [
      "Loser buys wings",
      "Winner picks the next movie",
      "Bragging rights",
      "Loser does the dishes 🍽️",
      "Potluck host gets a pass",
      "Better luck next time",
      "Alphabet soup for the loser",
      "Spot on the couch",
      "Cashews for the table",
      "Pizza on me",
      "2 pounds of wings",
    ]) {
      expect(validatePrizeNote(ok), ok).toBeNull();
    }
  });

  it("rejects currency amounts and symbols", () => {
    for (const bad of ["$20", "Winner gets 20$", "€10 each", "£5", "¥1000", "₹500", "50¢", "20 USD", "Ten dollars", "A dollar a square", "5 bucks"]) {
      expect(validatePrizeNote(bad), bad).toBe(PRIZE_AMOUNT_ERROR);
    }
  });

  it("rejects payment apps, pots, payouts and betting words", () => {
    for (const bad of [
      "Venmo the winner",
      "Loser venmos me",
      "PayPal me",
      "Zelle it over",
      "Cash prize",
      "CashApp $winner",
      "cash app",
      "Big payout",
      "Winner takes the pot",
      "Jackpot!",
      "Buy-in is lunch",
      "buy in",
      "Friendly bet",
      "No betting",
      "Wager: pushups",
      "Money on the line",
      "Gambling night",
    ]) {
      expect(validatePrizeNote(bad), bad).toBe(PRIZE_MONEY_ERROR);
    }
  });

  it("catches amounts stuck to a currency word, other currencies, and paying someone an amount", () => {
    for (const bad of [
      "Winner gets 20usd",
      "Winner gets 20dollars",
      "Loser owes 5bucks",
      "Loser pays winner 25",
      "Loser owes 20 each",
      "Winner gets 50 quid",
      "20 CAD",
      "Ten bucks a square",
      "A buck a square",
    ]) {
      expect(validatePrizeNote(bad), bad).toBe(PRIZE_AMOUNT_ERROR);
    }
    for (const bad of ["Apple Pay me 20", "Google Pay the winner", "Winner gets cash", "Cash for the winner", "Split the pot"]) {
      expect(validatePrizeNote(bad), bad).toBe(PRIZE_MONEY_ERROR);
    }
  });

  it("says cash and payment-app talk first when a note has both", () => {
    expect(validatePrizeNote("Venmo me $20")).toBe(PRIZE_MONEY_ERROR);
    expect(validatePrizeNote("CashApp $winner")).toBe(PRIZE_MONEY_ERROR);
    expect(isPrizeNoteError(PRIZE_AMOUNT_ERROR) && isPrizeNoteError(PRIZE_MONEY_ERROR)).toBe(true);
    expect(isPrizeNoteError(MONEY_ERRORS.name)).toBe(false);
  });

  it("never uses gambling words in its own messages", () => {
    for (const m of [PRIZE_AMOUNT_ERROR, PRIZE_MONEY_ERROR, AMOUNTS_DISCLAIMER]) expect(m).not.toMatch(BETTING_WORDS);
  });

  it("doesn't mistake ordinary words for money", () => {
    for (const ok of [
      "Loser brings a pot of chili",
      "Pot luck at Jim's",
      "Loser wears a Bucks jersey",
      "Loser takes a Cash cab",
      "Loser pays for 2 pizzas",
      "Loser owes the winner 3 beers",
    ]) {
      expect(validatePrizeNote(ok), ok).toBeNull();
    }
  });

  it("sees through case, full-width characters and zero-width tricks", () => {
    expect(validatePrizeNote("VENMO")).toBe(PRIZE_MONEY_ERROR);
    expect(validatePrizeNote("ｂｅｔ")).toBe(PRIZE_MONEY_ERROR);
    expect(validatePrizeNote("＄20")).toBe(PRIZE_AMOUNT_ERROR);
    expect(validatePrizeNote("ven\u200bmo")).toBe(PRIZE_MONEY_ERROR);
  });
});

describe("periodPhrase", () => {
  it("gives a chip label and an in-sentence moment for fixed periods", () => {
    expect(periodPhrase("q2")).toEqual({ short: "Half", moment: "at halftime" });
    expect(periodPhrase("final").moment).toBe("at the final whistle");
  });
  it("handles every-score entries", () => {
    expect(periodPhrase("s3")).toEqual({ short: "Score 3", moment: "on score 3" });
  });
});

describe("rules", () => {
  it("presets make their rules: the square at each moment, plus the reverse square when asked", () => {
    expect(rulesForPreset("halves", false)).toEqual([
      { moment: "q2", square: { amount: null, note: "" }, reverse: null },
      { moment: "final", square: { amount: null, note: "" }, reverse: null },
    ]);
    expect(rulesForPreset("every-score", true)).toEqual([
      { moment: "score", square: { amount: null, note: "" }, reverse: { amount: null, note: "" } },
    ]);
    expect(rulesForPreset("quarters", false).map((r) => r.moment)).toEqual(["q1", "q2", "q3", "final"]);
  });

  it("derives a legacy board's rules from its preset, folding its old notes into the squares", () => {
    const legacy = fmt({ periods: "quarters", reverse: true });
    const rules = rulesOf(legacy, { q1: "Wings", "*": "Pride" });
    expect(rules.map((r) => [r.moment, r.square?.note, r.reverse?.note])).toEqual([
      ["q1", "Wings", ""],
      ["q2", "Pride", ""],
      ["q3", "Pride", ""],
      ["final", "Pride", ""],
    ]);
    expect(rulesOf(fmt({ periods: "every-score" }), { "*": "Pushups" })[0].square?.note).toBe("Pushups");
    // Rules on the format are the source of truth.
    expect(rulesOf({ ...fmt(), rules: OWNER_RULES }, { q1: "ignored" })).toBe(OWNER_RULES);
  });

  it("maps period keys to moments and rules", () => {
    expect(momentOfKey("s12")).toBe("score");
    expect(momentOfKey("q2")).toBe("q2");
    expect(momentOfKey("*")).toBeNull();
    expect(ruleForPeriodKey(OWNER_RULES, "s3")?.square?.amount).toBe(50);
    expect(ruleForPeriodKey(OWNER_RULES, "final")?.reverse?.note).toBe("Loser buys wings");
    expect(ruleForPeriodKey(rulesForPreset("halves", false), "q1")).toBeNull();
    expect(hasScoreMoment(OWNER_RULES)).toBe(true);
    expect(fixedPeriods(OWNER_RULES).map((p) => p.label)).toEqual(["Q1", "Half", "Q3", "Final"]);
  });

  it("names the preset a set of moments matches, else custom", () => {
    expect(presetFor(rulesForPreset("quarters", true))).toBe("quarters");
    expect(presetFor(rulesForPreset("every-score", false))).toBe("every-score");
    expect(presetFor(OWNER_RULES)).toBe("custom");
    expect(presetFor([{ moment: "q1", square: { amount: null, note: "" }, reverse: null }])).toBe("custom");
    // Only an exact preset (square everywhere, reverse at all moments or none) counts in the editor.
    expect(matchingPreset(rulesForPreset("halves", true))).toEqual({ preset: "halves", reverse: true });
    const mixed = rulesForPreset("quarters", false).map((r) => (r.moment === "final" ? { ...r, reverse: { amount: null, note: "" } } : r));
    expect(presetFor(mixed)).toBe("quarters");
    expect(matchingPreset(mixed)).toBeNull();
    expect(matchingPreset(OWNER_RULES)).toBeNull();
  });

  it("compares who wins when, ignoring amounts and notes", () => {
    const priced = OWNER_RULES.map((r) => (r.reverse ? { ...r, reverse: { amount: 999, note: "x" } } : r));
    expect(rulesShape(priced)).toBe(rulesShape(OWNER_RULES));
    expect(rulesShape([...OWNER_RULES].reverse())).toBe(rulesShape(OWNER_RULES));
    expect(rulesShape(OWNER_RULES.slice(1))).not.toBe(rulesShape(OWNER_RULES));
  });

  it("allows fresh numbers only without an every-score winner", () => {
    expect(drawKeys({ ...fmt(), freshNumbers: true, rules: rulesForPreset("halves", false) })).toEqual(["q1", "q2", "q3", "final"]);
    expect(drawKeys({ ...fmt(), freshNumbers: true, rules: OWNER_RULES })).toEqual(["*"]);
  });
});

describe("rules validation", () => {
  const withOwner = (over: Record<string, unknown> = {}) => ({ ...fmt(), rules: OWNER_RULES, ...over });

  it("accepts the owner's example and canonicalizes it", () => {
    expect(formatError(withOwner({ unit: "$", squarePrice: 10 }))).toBeNull();
    const shuffled = [...OWNER_RULES].reverse();
    const f = sanitizeFormat(withOwner({ rules: shuffled, periods: "quarters", reverse: false, squarePrice: 10.005 }));
    expect(f.rules?.map((r) => r.moment)).toEqual(["score", "q1", "q2", "q3", "final"]);
    expect(f.periods).toBe("custom");
    expect(f.reverse).toBe(true);
    expect(f.unit).toBe("$");
    expect(f.squarePrice).toBe(10.01);
  });

  it("needs 1-5 unique, known moments, each with a square or a reverse winner", () => {
    expect(formatError(withOwner({ rules: [] }))).toMatch(/at least one/);
    expect(formatError(withOwner({ rules: [...OWNER_RULES, OWNER_RULES[0]] }))).toMatch(/Too many/);
    expect(formatError(withOwner({ rules: [OWNER_RULES[1], OWNER_RULES[1]] }))).toMatch(/once/);
    expect(formatError(withOwner({ rules: [{ moment: "q5", square: null, reverse: { amount: null, note: "" } }] }))).toMatch(/Unknown/);
    expect(formatError(withOwner({ rules: [{ moment: "q1", square: null, reverse: null }] }))).toBe("End of Q1 needs a square or a reverse winner");
  });

  it("takes amounts above 0 up to 1,000,000 and square prices up to 100,000", () => {
    const one = (amount: unknown) => withOwner({ rules: [{ moment: "final", square: { amount, note: "" }, reverse: null }] });
    expect(formatError(one(1_000_000))).toBeNull();
    expect(formatError(one(2.5))).toBeNull();
    for (const bad of [0, -5, 1_000_001, Number.NaN, "50", Number.POSITIVE_INFINITY]) expect(formatError(one(bad)), String(bad)).toMatch(/amount/);
    expect(formatError(withOwner({ squarePrice: 100_001 }))).toMatch(/square price/);
    expect(formatError(withOwner({ squarePrice: 0 }))).toMatch(/square price/);
    expect(formatError(withOwner({ squarePrice: null }))).toBeNull();
    expect(formatError(withOwner({ unit: "€" }))).toMatch(/\$ or points/);
    const rounded = sanitizeFormat({ ...fmt(), rules: [{ moment: "final", square: { amount: 12.345, note: "" }, reverse: null }] });
    expect(rounded.rules?.[0].square?.amount).toBe(12.35);
  });

  it("checks notes inside rules like any prize note, with split messages", () => {
    const noted = (note: string) => withOwner({ rules: [{ moment: "final", square: { amount: 20, note }, reverse: null }] });
    expect(formatError(noted("Loser buys wings"))).toBeNull();
    expect(formatError(noted("Winner gets $20"))).toBe(PRIZE_AMOUNT_ERROR);
    expect(formatError(noted("Venmo the winner"))).toBe(PRIZE_MONEY_ERROR);
    // Lenient: a bad note is cleared, the rule stays.
    expect(sanitizeFormat(noted("Venmo the winner")).rules?.[0].square).toEqual({ amount: 20, note: "" });
    expect(sanitizeFormat(noted("  Loser   buys wings " + "x".repeat(80))).rules?.[0].square?.note).toHaveLength(60);
  });

  it("refuses fresh numbers next to an every-score winner", () => {
    expect(formatError(withOwner({ freshNumbers: true }))).toMatch(/every score/);
    expect(formatError({ ...fmt(), freshNumbers: true, rules: rulesForPreset("final", true) })).toBeNull();
    expect(sanitizeFormat(withOwner({ freshNumbers: true })).freshNumbers).toBe(false);
  });

  it("turns a preset into canonical rules (what new boards store)", () => {
    expect(withRules(fmt({ periods: "halves", reverse: true }), { final: "Wings" })).toEqual({
      periods: "halves",
      reverse: true,
      boardSize: 100,
      freshNumbers: false,
      rules: [
        { moment: "q2", square: { amount: null, note: "" }, reverse: { amount: null, note: "" } },
        { moment: "final", square: { amount: null, note: "Wings" }, reverse: { amount: null, note: "" } },
      ],
      unit: "$",
      squarePrice: null,
      justForFun: false,
    });
    expect(withRules({ ...fmt(), rules: OWNER_RULES, unit: "pts" }).periods).toBe("custom");
  });

  it("keeps a just-for-fun board free of amounts (notes stay)", () => {
    expect(formatError(withOwner({ justForFun: true, squarePrice: null }))).toBe(JUST_FOR_FUN_ERROR);
    expect(formatError(withOwner({ justForFun: true, squarePrice: 5, rules: [{ moment: "final", square: { amount: null, note: "" }, reverse: null }] }))).toBe(JUST_FOR_FUN_ERROR);
    const fun = { ...fmt(), justForFun: true, rules: [{ moment: "final", square: { amount: null, note: "Loser buys wings" }, reverse: null }] };
    expect(formatError(fun)).toBeNull();
    expect(formatError({ ...fun, justForFun: "yes" })).toMatch(/justForFun/);
    // Lenient forms clear any amount that slipped in.
    const cleared = withRules({ ...fmt(), justForFun: true, squarePrice: 10, rules: OWNER_RULES });
    expect(cleared.squarePrice).toBeNull();
    expect(cleared.rules?.every((r) => !r.square?.amount && !r.reverse?.amount)).toBe(true);
    expect(cleared.rules?.at(-1)?.reverse?.note).toBe("Loser buys wings");
    expect(hasAmounts(cleared)).toBe(false);
    expect(sanitizeFormat({ ...fun, squarePrice: 3 }).squarePrice).toBeNull();
  });
});

describe("amounts", () => {
  it("formats dollars and points", () => {
    expect(formatAmount(50)).toBe("$50");
    expect(formatAmount(2.5)).toBe("$2.50");
    expect(formatAmount(1000)).toBe("$1,000");
    expect(formatAmount(1_000_000)).toBe("$1,000,000");
    expect(formatAmount(50, "pts")).toBe("50 pts");
    expect(formatAmount(1, "pts")).toBe("1 pt");
    expect(formatAmount(2.5, "pts")).toBe("2.5 pts");
  });

  it("knows when a board shows any amount", () => {
    expect(hasAmounts(fmt())).toBe(false);
    expect(hasAmounts(withRules(fmt()))).toBe(false);
    expect(hasAmounts({ ...fmt(), squarePrice: 5 })).toBe(true);
    expect(hasAmounts({ ...fmt(), rules: OWNER_RULES })).toBe(true);
  });
});

describe("amounts by score type", () => {
  const scoreRule = (square: Record<string, unknown>, moment = "score") => ({ ...fmt(), rules: [{ moment, square: { amount: 30, note: "", ...square }, reverse: null }] });

  it("accepts them on every score change, rounded to cents, in a fixed order", () => {
    expect(formatError(scoreRule({ byKind: { touchdown: 50, extraPoint: 10, twoPoint: 20 } }))).toBeNull();
    const f = sanitizeFormat(scoreRule({ byKind: { safety: 20.005, extraPoint: 10, touchdown: 50, fieldGoal: null } }));
    expect(f.rules?.[0].square).toEqual({ amount: 30, note: "", byKind: { touchdown: 50, extraPoint: 10, safety: 20.01 } });
    expect(Object.keys(f.rules?.[0].square?.byKind ?? {})).toEqual(["touchdown", "extraPoint", "safety"]);
    // None set: no byKind at all, so older rules look exactly as before.
    expect(sanitizeFormat(scoreRule({ byKind: {} })).rules?.[0].square).toEqual({ amount: 30, note: "" });
    expect(sanitizeFormat(scoreRule({ byKind: null })).rules?.[0].square).toEqual({ amount: 30, note: "" });
    expect(formatError(scoreRule({ byKind: {} }))).toBeNull();
  });

  it("validates each like an amount, and only on every score change", () => {
    for (const bad of [0, -1, 1_000_001, "10", Number.NaN]) {
      expect(formatError(scoreRule({ byKind: { twoPoint: bad } })), String(bad)).toBe("The 2-point conversion amount must be a number above 0, up to 1,000,000");
    }
    expect(formatError(scoreRule({ byKind: { extraPoint: 0 } }))).toBe("The extra point amount must be a number above 0, up to 1,000,000");
    expect(formatError(scoreRule({ byKind: { touchdown: 50, pick6: 70 } }))).toBe("Unknown score type");
    expect(formatError(scoreRule({ byKind: [50] }))).toMatch(/score type/);
    expect(formatError(scoreRule({ byKind: { touchdown: 50 } }, "q1"))).toBe(BY_KIND_MOMENT_ERROR);
    // An empty one on a quarter is just nothing.
    expect(formatError(scoreRule({ byKind: {} }, "q1"))).toBeNull();
    // Lenient: dropped from fixed moments, bad values dropped.
    expect(sanitizeFormat(scoreRule({ byKind: { touchdown: 50 } }, "final")).rules?.[0].square).toEqual({ amount: 30, note: "" });
    expect(sanitizeFormat(scoreRule({ byKind: { touchdown: -5, safety: 20, pick6: 9 } })).rules?.[0].square?.byKind).toEqual({ safety: 20 });
  });

  it("aren't allowed on a just-for-fun board, and clear with the amounts", () => {
    const fun = { ...scoreRule({ amount: null, byKind: { touchdown: 50 } }), justForFun: true };
    expect(formatError(fun)).toBe(JUST_FOR_FUN_ERROR);
    expect(withRules(fun as unknown as GameFormat).rules?.[0].square).toEqual({ amount: null, note: "" });
    expect(sanitizeFormat(fun).rules?.[0].square).toEqual({ amount: null, note: "" });
  });

  it("count as amounts, and don't change who wins when", () => {
    const f = scoreRule({ amount: null, byKind: { touchdown: 50 } }) as GameFormat;
    expect(hasAmounts(f)).toBe(true);
    expect(rulesShape(f.rules!)).toBe(rulesShape([{ moment: "score", square: { amount: null, note: "" }, reverse: null }]));
  });

  it("read per kind, the flat amount a quiet fallback for a kind without its own", () => {
    const p = { amount: 30, note: "", byKind: { touchdown: 50, extraPoint: 10 } };
    expect([prizeAmount(p, "touchdown"), prizeAmount(p, "extraPoint"), prizeAmount(p, "fieldGoal"), prizeAmount(p, null)]).toEqual([50, 10, 30, 30]);
    expect(kindAmounts(p)).toEqual([
      { kind: "touchdown", amount: 50 },
      { kind: "fieldGoal", amount: 30 },
      { kind: "extraPoint", amount: 10 },
      { kind: "twoPoint", amount: 30 },
      { kind: "safety", amount: 30 },
    ]);
    expect(prizeRange(p)).toEqual({ min: 10, max: 50 });
    // No flat amount: kinds without their own show nothing.
    expect(kindAmounts({ amount: null, note: "", byKind: { touchdown: 50, twoPoint: 10 } }).map((k) => k.kind)).toEqual(["touchdown", "twoPoint"]);
    expect(prizeRange({ amount: 25, note: "" })).toEqual({ min: 25, max: 25 });
    expect(prizeRange({ amount: null, note: "" })).toBeNull();
    expect(formatRange({ min: 10, max: 50 })).toBe("$10–$50");
    expect(formatRange({ min: 10, max: 50 }, "pts")).toBe("10–50 pts");
    expect(formatRange({ min: 50, max: 50 })).toBe("$50");
    expect(tidyPrize({ amount: 5, note: "", byKind: {} })).toEqual({ amount: 5, note: "" });
    expect(tidyPrize({ amount: 5, note: "", byKind: { safety: 2, touchdown: 9 } })).toEqual({ amount: 5, note: "", byKind: { touchdown: 9, safety: 2 } });
  });

  it("names five kinds plainly, short and in full, never with betting words", () => {
    expect(SCORE_KINDS).toEqual(["touchdown", "fieldGoal", "extraPoint", "twoPoint", "safety"]);
    expect(SCORE_KINDS.map((k) => scorePlayLabel(k))).toEqual(["TD", "FG", "XP", "2-PT", "Safety"]);
    expect(SCORE_KINDS.map((k) => scorePlayLabel(k, true))).toEqual(["Touchdown", "Field goal", "Extra point", "2-point conversion", "Safety"]);
    expect(JSON.stringify(SCORE_KIND_INFO)).not.toMatch(BETTING_WORDS);
  });
});

describe("boards saved with one conversion amount", () => {
  // Stored before the extra point and the 2-point conversion were told apart.
  const legacy = { amount: 30, note: "", byKind: { touchdown: 50, conversion: 10 } } as unknown as Prize;
  const legacyFormat = (): GameFormat => ({ ...fmt(), rules: [{ moment: "score", square: legacy, reverse: null }] });

  it("read the conversion amount as both the extra point's and the 2-point conversion's", () => {
    expect([prizeAmount(legacy, "extraPoint"), prizeAmount(legacy, "twoPoint"), prizeAmount(legacy, "fieldGoal")]).toEqual([10, 10, 30]);
    expect(kindAmounts(legacy).map((k) => [k.kind, k.amount])).toEqual([
      ["touchdown", 50],
      ["fieldGoal", 30],
      ["extraPoint", 10],
      ["twoPoint", 10],
      ["safety", 30],
    ]);
    expect(prizeRange(legacy)).toEqual({ min: 10, max: 50 });
    // A kind's own value wins over the old shared one.
    const mixed = { amount: null, note: "", byKind: { conversion: 10, twoPoint: 20 } } as unknown as Prize;
    expect([prizeAmount(mixed, "extraPoint"), prizeAmount(mixed, "twoPoint")]).toEqual([10, 20]);
  });

  it("upgrade on read and when sanitized, and leave newer boards untouched", () => {
    const upgraded = upgradeFormat(legacyFormat());
    expect(upgraded.rules?.[0].square).toEqual({ amount: 30, note: "", byKind: { touchdown: 50, extraPoint: 10, twoPoint: 10 } });
    expect(sanitizeFormat(legacyFormat()).rules?.[0].square?.byKind).toEqual({ touchdown: 50, extraPoint: 10, twoPoint: 10 });
    expect(tidyPrize(legacy).byKind).toEqual({ touchdown: 50, extraPoint: 10, twoPoint: 10 });
    const current = withRules({ ...fmt(), rules: OWNER_RULES });
    expect(upgradeFormat(current)).toBe(current);
  });

  it("can't be sent again: the API takes the extra point and the 2-point conversion", () => {
    expect(formatError(legacyFormat())).toBe("Unknown score type");
    expect(formatError(upgradeFormat(legacyFormat()))).toBeNull();
  });
});

describe("the rest of the board total", () => {
  const restRules = (extra: Partial<Prize> = {}, moment: Moment = "final", side: "square" | "reverse" = "square"): MomentRule[] => [
    { moment: "score", square: { amount: 10, note: "" }, reverse: null },
    ...(moment === "final" ? [] : [{ moment, square: { amount: 40, note: "" }, reverse: null } as MomentRule]),
    {
      moment: "final",
      square: side === "square" ? { amount: null, note: "Wings", ...extra } : { amount: 40, note: "" },
      reverse: side === "reverse" ? { amount: null, note: "", ...extra } : null,
    },
  ];
  const withPrice = (rules: MomentRule[], squarePrice: number | null = 10) => ({ ...fmt(), rules, squarePrice });

  it("goes on the final's square with a square price; its amount is ignored", () => {
    expect(formatError(withPrice(restRules({ rest: true })))).toBeNull();
    const f = sanitizeFormat(withPrice(restRules({ rest: true, amount: 300 } as Partial<Prize>)));
    expect(ruleFor(f.rules!, "final")?.square).toEqual({ amount: null, note: "Wings", rest: true });
    expect(hasRest(f.rules!)).toBe(true);
    expect(prizeHasAmount(ruleFor(f.rules!, "final")?.square)).toBe(true);
    expect(hasAmounts({ ...f, squarePrice: null })).toBe(true);
    // Not who wins when: it can change any time.
    expect(rulesShape(f.rules!)).toBe(rulesShape(restRules()));
    // `rest: false` is just no rest.
    expect(formatError(withPrice(restRules({ rest: false } as unknown as Partial<Prize>)))).toBeNull();
  });

  it("is refused anywhere else, without a square price, on a just-for-fun board, or when it isn't true/false", () => {
    expect(formatError(withPrice(restRules({ rest: true }, "final", "reverse")))).toBe(REST_MOMENT_ERROR);
    const onQ1: MomentRule[] = [{ moment: "q1", square: { amount: null, note: "", rest: true }, reverse: null }];
    expect(formatError(withPrice(onQ1))).toBe(REST_MOMENT_ERROR);
    const onScore: MomentRule[] = [{ moment: "score", square: { amount: null, note: "", rest: true }, reverse: null }];
    expect(formatError(withPrice(onScore))).toBe(REST_MOMENT_ERROR);
    expect(formatError(withPrice(restRules({ rest: true }), null))).toBe(REST_PRICE_ERROR);
    expect(formatError({ ...withPrice(restRules({ rest: true }), null), justForFun: true })).toBe(JUST_FOR_FUN_ERROR);
    expect(formatError(withPrice(restRules({ rest: "yes" } as unknown as Partial<Prize>)))).toBe("rest must be true or false");
  });

  it("is dropped leniently where it can't go, and by the canonical form without a price", () => {
    expect(ruleFor(sanitizeFormat(withPrice(restRules({ rest: true }, "final", "reverse"))).rules!, "final")?.reverse).toEqual({ amount: null, note: "" });
    expect(ruleFor(sanitizeFormat(withPrice(restRules({ rest: true }), null)).rules!, "final")?.square).toEqual({ amount: null, note: "Wings" });
    expect(ruleFor(withRules(withPrice(restRules({ rest: true }), null)).rules!, "final")?.square).toEqual({ amount: null, note: "Wings" });
    expect(ruleFor(withRules(withPrice(restRules({ rest: true }))).rules!, "final")?.square?.rest).toBe(true);
    expect(ruleFor(withoutAmounts(restRules({ rest: true })), "final")?.square).toEqual({ amount: null, note: "Wings" });
    expect(withoutRest(restRules({ rest: true }))[1].square).toEqual({ amount: null, note: "Wings" });
    expect(restAllowed(restRules())).toBe(true);
    expect(restAllowed(rulesForPreset("every-score", false))).toBe(false);
  });

  it("isn't a fixed amount", () => {
    expect(prizeAmount({ amount: 500, note: "", rest: true })).toBeNull();
    expect(fixedPrizeTotal(restRules({ rest: true }, "q2"))).toBe(40);
  });
});

describe("suggested amounts", () => {
  const amounts = (rules: MomentRule[]) => sortRules(rules).map((r) => [r.moment, r.square?.rest ? "rest" : (r.square?.amount ?? null), r.reverse?.amount ?? null]);
  const preset = (p: FixedPreset, reverse = false) => rulesForPreset(p, reverse);
  const everyScore = (opts: { kinds?: boolean; reverseQuarters?: boolean; scoreReverse?: boolean } = {}): MomentRule[] => {
    const prize = (): Prize => (opts.kinds ? { amount: null, note: "", byKind: {} } : { amount: null, note: "" });
    const rules: MomentRule[] = [
      { moment: "score", square: prize(), reverse: opts.scoreReverse ? prize() : null },
      { moment: "final", square: { amount: null, note: "Wings" }, reverse: opts.reverseQuarters ? { amount: null, note: "" } : null },
    ];
    if (opts.reverseQuarters) for (const m of ["q1", "q2", "q3"] as const) rules.push({ moment: m, square: null, reverse: { amount: null, note: "" } });
    return sortRules(rules);
  };

  it("rounds to nice amounts: whole under 10, fives under 100, tens from 100, never below 1", () => {
    expect([0.2, 3.4, 9.6, 12, 167.5, 168, 333, 0].map((x) => niceAmount(x))).toEqual([1, 3, 10, 10, 170, 170, 330, 1]);
    expect([27.8, 31.25, 9.9].map((x) => niceAmount(x, true))).toEqual([25, 30, 9]);
  });

  it("$10 squares, quarters: 20 · 20 · 20 · 40 of the $1,000", () => {
    expect(amounts(suggestPrizes(preset("quarters"), 10, 100))).toEqual([
      ["q1", 200, null],
      ["q2", 200, null],
      ["q3", 200, null],
      ["final", 400, null],
    ]);
  });

  it("$10 squares, quarters with reverse: $40 reverse each, then the rest 20 · 20 · 20 · 40, the final taking up the rounding", () => {
    const rules = suggestPrizes(preset("quarters", true), 10, 100);
    expect(amounts(rules)).toEqual([
      ["q1", 170, 40],
      ["q2", 170, 40],
      ["q3", 170, 40],
      ["final", 330, 40],
    ]);
    expect(fixedPrizeTotal(rules)).toBe(1000);
  });

  it("halves 40 · 60, the final alone all of it, with or without reverse", () => {
    expect(amounts(suggestPrizes(preset("halves"), 10, 100))).toEqual([
      ["q2", 400, null],
      ["final", 600, null],
    ]);
    expect(amounts(suggestPrizes(preset("halves", true), 10, 100))).toEqual([
      ["q2", 370, 40],
      ["final", 550, 40],
    ]);
    expect(amounts(suggestPrizes(preset("final"), 10, 100))).toEqual([["final", 1000, null]]);
    expect(amounts(suggestPrizes(preset("final", true), 10, 100))).toEqual([["final", 960, 40]]);
  });

  it("normalizes the weights for other sets of moments, and adds up exactly at awkward prices", () => {
    const q1Final = preset("quarters").filter((r) => r.moment === "q1" || r.moment === "final");
    expect(amounts(suggestPrizes(q1Final, 10, 100))).toEqual([
      ["q1", 330, null],
      ["final", 670, null],
    ]);
    for (const [price, squares] of [
      [3, 100],
      [7, 100],
      [2.5, 25],
      [1, 25],
      [25, 25],
      [13, 100],
    ] as const) {
      for (const p of ["quarters", "halves", "final"] as const) {
        for (const reverse of [false, true]) {
          const rules = suggestPrizes(preset(p, reverse), price, squares);
          expect(fixedPrizeTotal(rules), `${p} ${reverse} $${price}×${squares}`).toBe(Math.round(price * squares * 100) / 100);
          expect(rules.every((r) => (!r.square || (r.square.amount ?? 0) > 0) && (!r.reverse || (r.reverse.amount ?? 0) > 0)), `${p} ${reverse} $${price}`).toBe(true);
        }
      }
    }
  });

  it("caps reverse prizes at 40% of a small total (a 5×5 board, or few squares claimed)", () => {
    // $10 on 5×5: four $40 reverses would be $160 of $250; capped to $25 each.
    expect(amounts(suggestPrizes(preset("quarters", true), 10, 25))).toEqual([
      ["q1", 30, 25],
      ["q2", 30, 25],
      ["q3", 30, 25],
      ["final", 60, 25],
    ]);
    // Halves on 5×5 stay at four square prices.
    expect(amounts(suggestPrizes(preset("halves", true), 10, 25)).map((a) => a[2])).toEqual([40, 40]);
  });

  it("gives a reverse-only moment its share, and keeps notes and who wins", () => {
    const rules: MomentRule[] = [
      { moment: "q2", square: null, reverse: { amount: 5, note: "Pushups" } },
      { moment: "final", square: { amount: 5, note: "Wings" }, reverse: null },
    ];
    const next = suggestPrizes(rules, 10, 100);
    expect(amounts(next)).toEqual([
      ["q2", null, 400],
      ["final", 600, null],
    ]);
    expect(next.map((r) => (r.square ?? r.reverse)?.note)).toEqual(["Pushups", "Wings"]);
    expect(rulesShape(next)).toBe(rulesShape(rules));
  });

  it("every score: amounts by score type as multiples of half the square price, the final the rest", () => {
    const rules = suggestPrizes(everyScore({ kinds: true }), 10, 100);
    expect(rules[0].square).toEqual({ amount: 10, note: "", byKind: { touchdown: 20, fieldGoal: 10, extraPoint: 5, twoPoint: 10, safety: 10 } });
    expect(ruleFor(rules, "final")?.square).toEqual({ amount: null, note: "Wings", rest: true });
    // Score types off: one square price for every score.
    expect(suggestPrizes(everyScore(), 10, 100)[0].square).toEqual({ amount: 10, note: "" });
  });

  it("every score: one base unit, rounded once (dollars to $0.50, points to a whole point)", () => {
    const table = (price: number, unit: "$" | "pts" = "$") => SCORE_KINDS.map((k) => suggestedKindAmounts(price, unit)[k]);
    // TD, FG, XP, 2-PT, Safety
    expect(table(1)).toEqual([2, 1, 0.5, 1, 1]);
    expect(table(5)).toEqual([10, 5, 2.5, 5, 5]);
    expect(table(10)).toEqual([20, 10, 5, 10, 10]);
    expect(table(25)).toEqual([50, 25, 12.5, 25, 25]);
    expect(table(100)).toEqual([200, 100, 50, 100, 100]);
    expect(table(3)).toEqual([6, 3, 1.5, 3, 3]);
    expect(table(1, "pts")).toEqual([4, 2, 1, 2, 2]);
    expect(table(5, "pts")).toEqual([12, 6, 3, 6, 6]);
    expect(table(10, "pts")).toEqual([20, 10, 5, 10, 10]);
    for (const price of [1, 2, 3, 5, 7, 10, 20, 25, 50, 100]) {
      const t = suggestedKindAmounts(price);
      const u = t.extraPoint;
      expect([t.touchdown / u, t.fieldGoal / u, t.twoPoint / u, t.safety / u], `$${price}`).toEqual([4, 2, 2, 2]);
    }
    expect(kindUnit(25 / 4)).toBe(6.5);
    expect(kindUnit(0.1)).toBe(0.5);
    expect(kindUnit(0.1, "pts")).toBe(1);
  });

  it("every score with the reverse at each quarter and the final: four square prices each; other squares beside it too", () => {
    const rules = suggestPrizes(everyScore({ kinds: true, reverseQuarters: true }), 10, 100);
    expect(amounts(rules)).toEqual([
      ["score", 10, null],
      ["q1", null, 40],
      ["q2", null, 40],
      ["q3", null, 40],
      ["final", "rest", 40],
    ]);
    const withQ1: MomentRule[] = [...everyScore(), { moment: "q1", square: { amount: null, note: "" }, reverse: null }];
    expect(amounts(suggestPrizes(withQ1, 10, 100))).toEqual([
      ["score", 10, null],
      ["q1", 40, null],
      ["final", "rest", null],
    ]);
  });

  it("every score paying the reverse too: the same table for both squares", () => {
    const rules = suggestPrizes(everyScore({ kinds: true, scoreReverse: true }), 10, 100);
    expect(rules[0].reverse).toEqual(rules[0].square);
  });

  it("in points too", () => {
    expect(amounts(suggestPrizes(preset("quarters"), 10, 100, "pts")).map((a) => a[1])).toEqual([200, 200, 200, 400]);
    expect(suggestPrizes(everyScore({ kinds: true }), 10, 100, "pts")[0].square?.byKind).toEqual({ touchdown: 20, fieldGoal: 10, extraPoint: 5, twoPoint: 10, safety: 10 });
  });

  it("changes nothing without a price or a square", () => {
    const rules = preset("quarters");
    expect(suggestPrizes(rules, null, 100)).toEqual(rules);
    expect(suggestPrizes(rules, 10, 0)).toEqual(rules);
  });

  it("estimates a typical game on every-score boards", () => {
    // $10 squares: 9 TD × $20 + 8 XP × $5 + 4 FG × $10 + 1 2-PT × $10 = $270, plus 4 × $40 reverse.
    expect(typicalGameTotal(suggestPrizes(everyScore({ kinds: true }), 10, 100))).toBe(270);
    expect(typicalGameTotal(suggestPrizes(everyScore({ kinds: true, reverseQuarters: true }), 10, 100))).toBe(430);
    // Score types off: 22 scores at $10.
    expect(typicalGameTotal(suggestPrizes(everyScore(), 10, 100))).toBe(220);
    expect(typicalGameTotal(preset("quarters"))).toBeNull();
    expect(Object.values(TYPICAL_GAME).reduce((n, v) => n + v, 0)).toBe(22);
  });
});

describe("splitting the board's total evenly", () => {
  const quarters = rulesForPreset("quarters", false);
  const amounts = (rules: MomentRule[]) => rules.map((r) => [r.moment, r.square?.amount ?? null, r.reverse?.amount ?? null]);

  it("shares whole units that add up to the total, the leftover to the later shares", () => {
    expect(wholeShares(1000, [1, 1, 1, 1])).toEqual([250, 250, 250, 250]);
    expect(wholeShares(1000, [1, 1, 1, 2])).toEqual([200, 200, 200, 400]);
    expect(wholeShares(1000, [1, 2])).toEqual([333, 667]);
    expect(wholeShares(250, [1, 1, 1, 1])).toEqual([62, 62, 63, 63]);
    expect(wholeShares(62.5, [1, 1])).toEqual([31, 31]);
    expect(wholeShares(0, [1, 1])).toEqual([0, 0]);
  });

  it("splits evenly across whichever moments are on, the final's rest becoming its share", () => {
    expect(amounts(splitEvenly(quarters, 1000))).toEqual([
      ["q1", 250, null],
      ["q2", 250, null],
      ["q3", 250, null],
      ["final", 250, null],
    ]);
    const rest = quarters.map((r) => (r.moment === "final" ? { ...r, square: { amount: null, note: "", rest: true as const } } : r));
    expect(splitEvenly(rest, 1000)[3].square).toEqual({ amount: 250, note: "" });
    expect(fixedPrizeTotal(splitEvenly(quarters, 2500))).toBe(2500);
  });

  it("fills reverse-only moments, shares a moment paying both evenly, and leaves every score alone", () => {
    const rules: MomentRule[] = [
      { moment: "score", square: { amount: 25, note: "", byKind: { extraPoint: 5 } }, reverse: null },
      { moment: "q1", square: null, reverse: { amount: null, note: "" } },
      { moment: "q2", square: { amount: 1, note: "Wings" }, reverse: { amount: null, note: "" } },
      { moment: "final", square: null, reverse: { amount: null, note: "Pride" } },
    ];
    const split = splitEvenly(rules, 1001);
    expect(amounts(split)).toEqual([
      ["score", 25, null],
      ["q1", null, 333],
      ["q2", 167, 167],
      ["final", null, 334],
    ]);
    expect(split[0]).toBe(rules[0]);
    expect(split[2].square?.note).toBe("Wings");
    expect(split[3].reverse?.note).toBe("Pride");
    expect(fixedPrizeTotal(split)).toBe(1001);
  });

  it("totals the fixed moments only", () => {
    expect(fixedPrizeTotal(OWNER_RULES)).toBe(800);
    expect(fixedPrizeTotal(rulesForPreset("every-score", false))).toBe(0);
  });
});

describe("notes on boards with rules", () => {
  it("folds an older client's notes into the rules (the reverse note on a reverse-only moment)", () => {
    const folded = foldNotes(OWNER_RULES, { q1: "Pushups", final: "", "*": "Pride" });
    expect(folded.map((r) => (r.square ?? r.reverse)?.note)).toEqual(["Pride", "Pushups", "Pride", "Pride", ""]);
  });

  it("gives a push-safe note per period (never an amount)", () => {
    const f = { ...fmt(), rules: OWNER_RULES };
    expect(periodNote(f, {}, "final")).toBe("Loser buys wings");
    expect(periodNote(f, {}, "s2")).toBeNull();
    expect(periodNote(fmt(), { q1: "Wings", "*": "Pride" }, "q3")).toBe("Pride");
    expect(periodNote(fmt({ periods: "final" }), { "*": "Pride" }, "q1")).toBeNull();
  });
});

describe("summaries", () => {
  it("describes presets as before and custom rules in a few words", () => {
    expect(formatSummary(withRules(fmt({ reverse: true, freshNumbers: true })))).toBe("Quarters · 10×10 · Reverse · New numbers each quarter");
    expect(formatSummary({ ...fmt(), rules: OWNER_RULES })).toBe("Every score + quarters · 10×10 · Reverse on quarters");
    expect(rulesSummary(OWNER_RULES)).toBe("Every score + quarters · Reverse on quarters");
    expect(rulesSummary(rulesForPreset("halves", false))).toBe("Halftime + Final");
    const q1q3: MomentRule[] = [
      { moment: "q1", square: { amount: null, note: "" }, reverse: null },
      { moment: "q3", square: { amount: null, note: "" }, reverse: null },
    ];
    expect(rulesSummary(q1q3)).toBe("Q1 + Q3");
    const scoreAndFinal: MomentRule[] = [
      { moment: "score", square: { amount: null, note: "" }, reverse: null },
      { moment: "final", square: { amount: null, note: "" }, reverse: { amount: null, note: "" } },
    ];
    expect(rulesSummary(scoreAndFinal)).toBe("Every score + Final · Reverse on Final");
    expect(PRESET_INFO.custom.description).not.toMatch(BETTING_WORDS);
  });
});
