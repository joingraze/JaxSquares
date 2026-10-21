import { describe, expect, it } from "vitest";
import { formatError, sanitizeFormat, withRules } from "./formats";
import type { GameFormat, GameState } from "./types";
import {
  CLAIM_CODE_ALPHABET,
  HOUSE_RULE_IDEAS,
  HOUSE_RULE_MONEY_ERROR,
  HOUSE_RULE_PURCHASE_ERROR,
  VENUE_PRICE_ERROR,
  claimCodeFrom,
  claimDeadline,
  cleanHouseRules,
  collectedFor,
  countdownText,
  decidedAt,
  houseRuleProblem,
  venueLines,
} from "./venue";

const BASE = { boardSize: 100, freshNumbers: false, periods: "quarters", reverse: false } as const;

describe("house rules", () => {
  it("take how-to-play lines, and every idea the editor offers", () => {
    for (const rule of ["Must be present to win", "Claim at the bar before halftime", "One square per person", ...HOUSE_RULE_IDEAS]) {
      expect(houseRuleProblem(rule)).toBeNull();
    }
  });

  it("never ask anyone to buy anything, or talk money", () => {
    for (const rule of ["Buy a drink to play", "Purchase required", "Minimum spend applies", "Order a pitcher to enter"]) {
      expect(houseRuleProblem(rule)).toBe(HOUSE_RULE_PURCHASE_ERROR);
    }
    for (const rule of ["Pay $5 at the bar", "Venmo the bartender", "Winner takes the pot"]) {
      expect(houseRuleProblem(rule)).toBe(HOUSE_RULE_MONEY_ERROR);
    }
  });

  it("clean to at most four single lines", () => {
    expect(cleanHouseRules(["  Must be\npresent ", "", 3, "a", "b", "c", "d"])).toEqual(["Must be present", "a", "b", "c"]);
    expect(cleanHouseRules("nope")).toEqual([]);
  });

  it("ride along in a format (and stay out of one that has none)", () => {
    const input = { ...BASE, houseRules: ["Must be present to win", "  "], claimCodes: true };
    expect(formatError(input)).toBeNull();
    const stored = withRules(sanitizeFormat(input));
    expect(stored).toMatchObject({ houseRules: ["Must be present to win"], claimCodes: true });
    const plain = withRules(sanitizeFormat(BASE));
    expect(plain).not.toHaveProperty("houseRules");
    expect(plain).not.toHaveProperty("claimCodes");
  });

  it("are refused by the API with the same words the editor shows", () => {
    expect(formatError({ ...BASE, houseRules: ["Buy a round to play"] })).toBe(HOUSE_RULE_PURCHASE_ERROR);
    expect(formatError({ ...BASE, houseRules: ["a", "b", "c", "d", "e"] })).toBe("Up to 4 house rules.");
    expect(formatError({ ...BASE, houseRules: "Must be present" })).toBe("House rules must be a list of short lines");
    expect(formatError({ ...BASE, claimCodes: "yes" })).toBe("claimCodes must be true or false");
  });
});

describe("venue lines", () => {
  const format = (squarePrice: number | null) => ({ ...BASE, squarePrice }) as GameFormat;
  const club = { id: "c1", name: "The Rusty Anchor", hasLogo: false, logoVersion: null };

  it("say a club's free board is free to play, with the club's prizes", () => {
    expect(venueLines({ format: format(null), club })).toEqual(["Free to play · No purchase necessary", "Prizes from The Rusty Anchor"]);
  });

  it("say a venue board without a club is free to play", () => {
    expect(venueLines({ format: { ...format(null), venue: true } })).toEqual(["Free to play · No purchase necessary"]);
  });

  it("say nothing on a board with a square price, an unnamed club or no club", () => {
    expect(venueLines({ format: format(5), club })).toEqual([]);
    expect(venueLines({ format: format(null), club: { ...club, name: " " } })).toEqual([]);
    expect(venueLines({ format: format(null) })).toEqual([]);
  });
});

describe("venue mode", () => {
  it("is free to play: a square price is refused, and never stored", () => {
    expect(formatError({ ...BASE, venue: true, unit: "$", squarePrice: 5 })).toBe(VENUE_PRICE_ERROR);
    expect(formatError({ ...BASE, venue: true, justForFun: true })).toBeNull();
    expect(withRules({ ...BASE, venue: true, unit: "$", squarePrice: 5 } as GameFormat).squarePrice).toBeNull();
    expect(withRules(sanitizeFormat({ ...BASE, venue: true }))).toMatchObject({ venue: true });
  });

  it("keeps a time to collect only with claim codes, in whole minutes", () => {
    expect(withRules(sanitizeFormat({ ...BASE, claimCodes: true, claimMinutes: 5 }))).toMatchObject({ claimCodes: true, claimMinutes: 5 });
    expect(withRules(sanitizeFormat({ ...BASE, claimMinutes: 5 }))).not.toHaveProperty("claimMinutes");
    expect(formatError({ ...BASE, claimCodes: true, claimMinutes: 2.5 })).toBe("Time to collect must be 1 to 120 minutes");
    expect(formatError({ ...BASE, claimCodes: true, claimMinutes: 500 })).toBe("Time to collect must be 1 to 120 minutes");
  });
});

describe("collecting a prize", () => {
  const state = (over: Partial<GameState> & { minutes?: number } = {}) =>
    ({
      game: { format: { ...BASE, claimCodes: true, claimMinutes: over.minutes } },
      scores: [{ periodKey: "q1", scoreX: 7, scoreY: 3, source: "host", updatedAt: 1_000 }],
      manualWinners: [],
      collected: [],
      ...over,
    }) as unknown as GameState;

  it("counts down from when the winner was decided (the host's pick, else the score)", () => {
    expect(decidedAt(state(), "q1")).toBe(1_000);
    expect(decidedAt(state({ manualWinners: [{ periodKey: "q1", row: 0, col: 0, updatedAt: 9_000 }] }), "q1")).toBe(9_000);
    expect(decidedAt(state(), "q2")).toBeNull();
    expect(claimDeadline(state({ minutes: 5 }), "q1")).toBe(1_000 + 5 * 60_000);
    expect(claimDeadline(state(), "q1")).toBeNull();
    expect(countdownText(4 * 60_000 + 5_000)).toBe("4:05");
    expect(countdownText(-3)).toBe("0:00");
  });

  it("is collected only for the winner it was handed to", () => {
    const s = state({ collected: [{ periodKey: "q1", reverse: false, playerId: "ana", at: 5, by: "host" }] });
    expect(collectedFor(s, "q1", false, "ana")?.by).toBe("host");
    expect(collectedFor(s, "q1", false, "ben")).toBeNull();
    expect(collectedFor(s, "q1", true, "ana")).toBeNull();
  });
});

describe("claim codes", () => {
  it("are four letters from an alphabet that can't be misread", () => {
    const code = claimCodeFrom(new Uint8Array([0, 22, 45, 255]));
    expect(code).toHaveLength(4);
    expect([...code].every((ch) => CLAIM_CODE_ALPHABET.includes(ch))).toBe(true);
    expect(CLAIM_CODE_ALPHABET).not.toMatch(/[0O1IL2Z5S8B]/);
  });
});
