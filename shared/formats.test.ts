import { describe, expect, it } from "vitest";
import {
  periodPhrase,
  PERIOD_PRESETS,
  PRESET_INFO,
  PRIZE_MONEY_ERROR,
  PrizeNoteError,
  defaultFormat,
  drawKeys,
  everyScoreIndex,
  everyScorePeriod,
  formatError,
  formatSummary,
  isPeriodKeyFor,
  periodsFor,
  prizeFor,
  sanitizeFormat,
  sanitizePrizes,
  validatePrizeNote,
} from "./formats";
import type { GameFormat } from "./types";

const fmt = (over: Partial<GameFormat> = {}): GameFormat => ({ ...defaultFormat(), ...over });

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
      expect(validatePrizeNote(bad), bad).toBe(PRIZE_MONEY_ERROR);
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

  it("sees through case, full-width characters and zero-width tricks", () => {
    expect(validatePrizeNote("VENMO")).toBe(PRIZE_MONEY_ERROR);
    expect(validatePrizeNote("ｂｅｔ")).toBe(PRIZE_MONEY_ERROR);
    expect(validatePrizeNote("＄20")).toBe(PRIZE_MONEY_ERROR);
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
