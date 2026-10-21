import { describe, expect, it } from "vitest";
import { TV_PARTS, cleanTvDisplay, tvDefault, tvDisplayError, tvShowAll, tvShows } from "./tv";
import type { GameFormat } from "./types";
import { freeToPlayLines } from "./venue";

const format = (over: Partial<GameFormat> = {}): GameFormat => ({ periods: "quarters", reverse: false, boardSize: 100, freshNumbers: false, ...over });
const club = { id: "c1", name: "The Rusty Anchor", hasLogo: false, logoVersion: null };

describe("what TV mode shows", () => {
  it("shows everything by default, and free to play only on a venue's or club's board", () => {
    const plain = { format: format() };
    expect(TV_PARTS.filter((p) => !tvDefault(p, plain))).toEqual(["freeToPlay"]);
    expect(tvDefault("freeToPlay", { format: format({ venue: true }) })).toBe(true);
    expect(tvDefault("freeToPlay", { format: format(), club })).toBe(true);
    expect(tvDefault("freeToPlay", { format: format(), club: { ...club, name: " " } })).toBe(false);
  });

  it("follows the host's choices, part by part", () => {
    const game = { format: format({ venue: true }), tv: { amounts: false, freeToPlay: false } };
    expect(tvShows(game, "amounts")).toBe(false);
    expect(tvShows(game, "freeToPlay")).toBe(false);
    expect(tvShows(game, "prizes")).toBe(true);
    // Another board's choices (a season's, for its game board) win over the board's own.
    expect(tvShowAll(game, { amounts: true }).amounts).toBe(true);
  });

  it("takes known parts with on/off only", () => {
    expect(tvDisplayError({ prizes: false, celebrations: true })).toBeNull();
    expect(tvDisplayError({ logos: true })).toBe("Unknown TV part: logos");
    expect(tvDisplayError({ prizes: 0 })).toBe("prizes must be true or false");
    expect(tvDisplayError(null)).toBe("tv must be an object of on/off choices");
    expect(tvDisplayError([])).toBe("tv must be an object of on/off choices");
    expect(cleanTvDisplay({ prizes: false, logos: true, now: "x" })).toEqual({ prizes: false });
  });

  it("says free to play only on a board with no square price", () => {
    expect(freeToPlayLines({ format: format() })).toEqual(["Free to play · No purchase necessary"]);
    expect(freeToPlayLines({ format: format(), club })).toEqual(["Free to play · No purchase necessary", "Prizes from The Rusty Anchor"]);
    expect(freeToPlayLines({ format: format({ squarePrice: 5 }), club })).toEqual([]);
  });
});
