import { describe, expect, it } from "vitest";
import {
  PERIOD_PRESETS,
  PRESET_INFO,
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

  it("validates period keys per format", () => {
    expect(isPeriodKeyFor(fmt({ periods: "final" }), "final")).toBe(true);
    expect(isPeriodKeyFor(fmt({ periods: "final" }), "q1")).toBe(false);
    expect(isPeriodKeyFor(fmt({ periods: "every-score" }), "s9")).toBe(true);
  });
});
