// What a host pays (shared/pricing.ts): per game, the host fee plus the Venue
// add-on on a venue board; the Annual Pass covers the host fee on every board
// (season boards come only with it), and with the Venue add-on venue boards too.

import { describe, expect, it } from "vitest";
import { coverOf, coversBoard, feeDue, passPlanFor, type PricedBoard } from "./pricing";

const PRICES = { boardCents: 499, venueCents: 1000 };
const plain: PricedBoard = { format: {} };
const venue: PricedBoard = { format: { venue: true } };
const season: PricedBoard = { kind: "season", format: {} };
const venueSeason: PricedBoard = { kind: "season", format: { venue: true } };

describe("feeDue", () => {
  it("is one board's host fee, plus the Venue add-on on a venue board, with no pass", () => {
    expect(feeDue(plain, PRICES, "none")).toEqual({ cents: 499, boardCents: 499, venueCents: 0, needsPass: false });
    expect(feeDue(venue, PRICES, "none")).toEqual({ cents: 1499, boardCents: 499, venueCents: 1000, needsPass: false });
  });

  it("leaves only the Venue add-on to an Annual Pass, and nothing to the pass with the Venue add-on", () => {
    expect(feeDue(plain, PRICES, "pass").cents).toBe(0);
    expect(feeDue(venue, PRICES, "pass")).toEqual({ cents: 1000, boardCents: 0, venueCents: 1000, needsPass: false });
    expect(feeDue(venue, PRICES, "venue").cents).toBe(0);
  });

  it("sells no season board per game: it comes with the Annual Pass", () => {
    expect(feeDue(season, PRICES, "none")).toEqual({ cents: 0, boardCents: 0, venueCents: 0, needsPass: true });
    expect(feeDue(season, PRICES, "pass")).toEqual({ cents: 0, boardCents: 0, venueCents: 0, needsPass: false });
    // A venue's season with the Annual Pass alone: its Venue add-on, once.
    expect(feeDue(venueSeason, PRICES, "pass").cents).toBe(1000);
    expect(feeDue(venueSeason, PRICES, "venue").cents).toBe(0);
  });
});

describe("what a pass covers", () => {
  it("reads the identity's passes: the Venue add-on beats the plain pass, an ended one covers nothing", () => {
    expect(coverOf(null, null)).toBe("none");
    expect(coverOf({ active: true }, null)).toBe("pass");
    expect(coverOf({ active: false }, { active: true })).toBe("venue");
    expect(coverOf({ active: true }, { active: false })).toBe("pass");
  });

  it("covers a board outright only when nothing is left to pay, whatever the prices", () => {
    expect(coversBoard(plain, "none")).toBe(false);
    expect(coversBoard(plain, "pass")).toBe(true);
    expect(coversBoard(season, "pass")).toBe(true);
    expect(coversBoard(venue, "pass")).toBe(false);
    expect(coversBoard(venue, "venue")).toBe(true);
    for (const board of [plain, venue, season, venueSeason]) {
      for (const cover of ["none", "pass", "venue"] as const) {
        const due = feeDue(board, PRICES, cover);
        expect(coversBoard(board, cover), `${JSON.stringify(board)} ${cover}`).toBe(due.cents === 0 && !due.needsPass);
      }
    }
  });

  it("offers the pass with the Venue add-on on a venue board", () => {
    expect(passPlanFor(plain)).toBe("host");
    expect(passPlanFor(venue)).toBe("club");
  });
});
