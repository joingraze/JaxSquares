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
  splitPrizes,
  splitStyles,
  tidyPrize,
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
import type { GameFormat, MomentRule } from "./types";

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
    expect(formatError(scoreRule({ byKind: { touchdown: 50, conversion: 10 } }))).toBeNull();
    const f = sanitizeFormat(scoreRule({ byKind: { safety: 20.005, conversion: 10, touchdown: 50, fieldGoal: null } }));
    expect(f.rules?.[0].square).toEqual({ amount: 30, note: "", byKind: { touchdown: 50, conversion: 10, safety: 20.01 } });
    expect(Object.keys(f.rules?.[0].square?.byKind ?? {})).toEqual(["touchdown", "conversion", "safety"]);
    // None set: no byKind at all, so older rules look exactly as before.
    expect(sanitizeFormat(scoreRule({ byKind: {} })).rules?.[0].square).toEqual({ amount: 30, note: "" });
    expect(sanitizeFormat(scoreRule({ byKind: null })).rules?.[0].square).toEqual({ amount: 30, note: "" });
    expect(formatError(scoreRule({ byKind: {} }))).toBeNull();
  });

  it("validates each like an amount, and only on every score change", () => {
    for (const bad of [0, -1, 1_000_001, "10", Number.NaN]) {
      expect(formatError(scoreRule({ byKind: { conversion: bad } })), String(bad)).toBe("The conversion amount must be a number above 0, up to 1,000,000");
    }
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

  it("read per kind, falling back to the default amount", () => {
    const p = { amount: 30, note: "", byKind: { touchdown: 50, conversion: 10 } };
    expect([prizeAmount(p, "touchdown"), prizeAmount(p, "conversion"), prizeAmount(p, "fieldGoal"), prizeAmount(p, null)]).toEqual([50, 10, 30, 30]);
    expect(kindAmounts(p)).toEqual([
      { kind: "touchdown", amount: 50 },
      { kind: "fieldGoal", amount: 30 },
      { kind: "conversion", amount: 10 },
      { kind: "safety", amount: 30 },
    ]);
    expect(prizeRange(p)).toEqual({ min: 10, max: 50 });
    // No default: kinds without their own show nothing.
    expect(kindAmounts({ amount: null, note: "", byKind: { touchdown: 50, conversion: 10 } }).map((k) => k.kind)).toEqual(["touchdown", "conversion"]);
    expect(prizeRange({ amount: 25, note: "" })).toEqual({ min: 25, max: 25 });
    expect(prizeRange({ amount: null, note: "" })).toBeNull();
    expect(formatRange({ min: 10, max: 50 })).toBe("$10–$50");
    expect(formatRange({ min: 10, max: 50 }, "pts")).toBe("10–50 pts");
    expect(formatRange({ min: 50, max: 50 })).toBe("$50");
    expect(tidyPrize({ amount: 5, note: "", byKind: {} })).toEqual({ amount: 5, note: "" });
    expect(tidyPrize({ amount: 5, note: "", byKind: { safety: 2, touchdown: 9 } })).toEqual({ amount: 5, note: "", byKind: { touchdown: 9, safety: 2 } });
  });

  it("labels plays short and in full, never with betting words", () => {
    expect(scorePlayLabel("touchdown", 6)).toBe("TD");
    expect(scorePlayLabel("conversion", 1)).toBe("XP");
    expect(scorePlayLabel("conversion", 2)).toBe("2-pt");
    expect(scorePlayLabel("conversion", 1, true)).toBe("Extra point");
    expect(scorePlayLabel("conversion", 2, true)).toBe("2-point try");
    expect(scorePlayLabel("fieldGoal", 3, true)).toBe("Field goal");
    expect(scorePlayLabel("safety", 2)).toBe("Safety");
    expect(JSON.stringify(SCORE_KIND_INFO)).not.toMatch(BETTING_WORDS);
  });
});

describe("splitting the board's total", () => {
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

  it("splits evenly, or with a bigger final, across whichever moments are on", () => {
    expect(amounts(splitPrizes(quarters, 1000, "even"))).toEqual([
      ["q1", 250, null],
      ["q2", 250, null],
      ["q3", 250, null],
      ["final", 250, null],
    ]);
    expect(amounts(splitPrizes(quarters, 1000, "bigger-final")).map((a) => a[1])).toEqual([200, 200, 200, 400]);
    expect(amounts(splitPrizes(rulesForPreset("halves", false), 1000, "bigger-final")).map((a) => a[1])).toEqual([333, 667]);
    expect(fixedPrizeTotal(splitPrizes(quarters, 2500, "bigger-final"))).toBe(2500);
  });

  it("fills reverse-only moments, shares a moment paying both evenly, and leaves every score alone", () => {
    const rules: MomentRule[] = [
      { moment: "score", square: { amount: 25, note: "", byKind: { conversion: 5 } }, reverse: null },
      { moment: "q1", square: null, reverse: { amount: null, note: "" } },
      { moment: "q2", square: { amount: 1, note: "Wings" }, reverse: { amount: null, note: "" } },
      { moment: "final", square: null, reverse: { amount: null, note: "Pride" } },
    ];
    const split = splitPrizes(rules, 1001, "even");
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

  it("offers the choices that make sense", () => {
    expect(splitStyles(quarters)).toEqual(["even", "bigger-final"]);
    expect(splitStyles(rulesForPreset("final", false))).toEqual(["even"]);
    expect(splitStyles(rulesForPreset("every-score", false))).toEqual([]);
    expect(splitStyles(quarters.filter((r) => r.moment !== "final"))).toEqual(["even"]);
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
