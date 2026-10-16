import { describe, expect, it } from "vitest";
import type { GameState } from "../shared/types";
import { inviteMeta } from "./og";

function state(over: Partial<GameState["game"]> = {}, extra: Partial<GameState> = {}): GameState {
  return {
    game: {
      id: "abc123",
      name: "Smith Family Squares",
      sport: "football",
      league: "nfl",
      teamX: { name: "Chiefs", abbr: "KC" },
      teamY: { name: "Eagles", abbr: "PHI" },
      format: { periods: "quarters", reverse: false, boardSize: 100, freshNumbers: false },
      periods: [],
      prizes: {},
      maxPerPlayer: 0,
      numbers: null,
      status: "open",
      linkedEvent: null,
      hostPlayerId: "h",
      createdAt: 0,
      lockedAt: null,
      ...over,
    },
    players: [],
    squares: [
      { row: 0, col: 0, playerId: "a", claimedAt: 0 },
      { row: 0, col: 1, playerId: "a", claimedAt: 0 },
    ],
    scores: [],
    manualWinners: [],
    live: null,
    activity: [],
    version: 1,
    ...extra,
  };
}

describe("inviteMeta", () => {
  it("invites to the board with squares left", () => {
    const m = inviteMeta(state(), "https://jaxsquares.com");
    expect(m.title).toBe("Join Smith Family Squares on JaxSquares");
    expect(m.description).toBe("Chiefs vs Eagles · 98 of 100 squares left. Grab yours");
    expect(m.url).toBe("https://jaxsquares.com/g/abc123");
    expect(m.image).toBe("https://jaxsquares.com/og-image.png");
  });

  it("uses 5x5 totals", () => {
    const m = inviteMeta(state({ format: { periods: "final", reverse: false, boardSize: 25, freshNumbers: false } }), "https://x");
    expect(m.description).toContain("23 of 25 squares left");
  });

  it("describes locked and final boards", () => {
    expect(inviteMeta(state({ status: "locked" }), "https://x").description).toContain("Numbers are drawn");
    const final = inviteMeta(
      state({ status: "final" }, { scores: [{ periodKey: "final", scoreX: 27, scoreY: 24, source: "live", updatedAt: 0 }] }),
      "https://x",
    );
    expect(final.description).toBe("Chiefs vs Eagles · Final: Chiefs 27, Eagles 24");
  });

  it("never mentions money", () => {
    for (const status of ["draft", "open", "locked", "final"] as const) {
      expect(inviteMeta(state({ status }), "https://x").description).not.toMatch(/\$|bet|wager|pot|payout|buy-in/i);
    }
  });
});
