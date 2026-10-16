import { describe, expect, it, vi } from "vitest";
import type { GameState } from "../shared/types";
import { POLL_LEAD_MS, pollPlan } from "./room";

// Only the room's pure scheduling rule is under test; keep its I/O deps out.
vi.mock("./service", () => ({ applyLiveUpdate: vi.fn(), loadState: vi.fn() }));
vi.mock("./scores", () => ({ fetchLiveForEvent: vi.fn() }));

const KICKOFF = 1_800_000_000_000;

function state(over: { status?: GameState["game"]["status"]; linked?: boolean; live?: "pre" | "in" | "post" } = {}): GameState {
  return {
    game: {
      id: "g1",
      name: "Board",
      sport: "football",
      league: "nfl",
      teamX: { name: "A" },
      teamY: { name: "B" },
      format: { periods: "quarters", reverse: false, boardSize: 100, freshNumbers: false },
      periods: [],
      prizes: {},
      maxPerPlayer: 0,
      numbers: null,
      status: over.status ?? "locked",
      linkedEvent:
        over.linked === false ? null : { provider: "espn", league: "nfl", eventId: "1", startsAt: KICKOFF, xIsHome: true },
      hostPlayerId: "h",
      createdAt: 0,
      lockedAt: null,
    },
    players: [],
    squares: [],
    scores: [],
    manualWinners: [],
    live: over.live
      ? { state: over.live, period: 1, clock: "", detail: "", scoreX: 0, scoreY: 0, updatedAt: 0 }
      : null,
    activity: [],
    version: 1,
  };
}

describe("pollPlan", () => {
  it("never polls unlinked, draft, final or missing games", () => {
    expect(pollPlan(null, KICKOFF)).toEqual({ kind: "stop" });
    expect(pollPlan(state({ linked: false }), KICKOFF)).toEqual({ kind: "stop" });
    expect(pollPlan(state({ status: "draft" }), KICKOFF)).toEqual({ kind: "stop" });
    expect(pollPlan(state({ status: "final" }), KICKOFF)).toEqual({ kind: "stop" });
  });

  it("waits until 15 minutes before kickoff", () => {
    expect(pollPlan(state({ status: "open" }), KICKOFF - 60 * 60_000)).toEqual({ kind: "at", at: KICKOFF - POLL_LEAD_MS });
    expect(pollPlan(state({ status: "open" }), KICKOFF - 10 * 60_000)).toEqual({ kind: "now" });
  });

  it("polls during the game and stops once the provider says it's over", () => {
    expect(pollPlan(state({ live: "in" }), KICKOFF + 60 * 60_000)).toEqual({ kind: "now" });
    expect(pollPlan(state({ live: "post" }), KICKOFF + 3 * 60 * 60_000)).toEqual({ kind: "stop" });
  });

  it("gives up on a game that never went final", () => {
    expect(pollPlan(state({ live: "in" }), KICKOFF + 13 * 60 * 60_000)).toEqual({ kind: "stop" });
  });
});
