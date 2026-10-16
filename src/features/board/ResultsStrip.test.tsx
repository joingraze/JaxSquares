import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { resolveResults } from "../../../shared/squares";
import type { GameState, NumberDraw, Player, Score, Square } from "../../../shared/types";
import { periodCards, rightNow } from "./boardModel";
import { ResultsStrip } from "./ResultsStrip";

const ME = "me_public_id";
const BOB = "bob_public_id";
const AL = "al_public_id";
// Column c holds digit c, row r holds digit 9 - r.
const DIGITS: NumberDraw = {
  x: [[0], [1], [2], [3], [4], [5], [6], [7], [8], [9]],
  y: [[9], [8], [7], [6], [5], [4], [3], [2], [1], [0]],
};

const player = (id: string, name: string): Player => ({ id, name, color: "#ff6b35", emoji: "", joinedAt: 1, isHost: false });
const sq = (row: number, col: number, playerId: string): Square => ({ row, col, playerId, claimedAt: 1 });
const entry = (periodKey: string, scoreX: number, scoreY: number): Score => ({ periodKey, scoreX, scoreY, source: "live", updatedAt: 1 });

function boardState(periods: "every-score" | "quarters", scores: Score[], score: { x: number; y: number }, squares: Square[]): GameState {
  return {
    game: {
      id: "g1",
      name: "Test board",
      sport: "football",
      league: "nfl",
      teamX: { name: "Chiefs", abbr: "KC", color: "#e31837" },
      teamY: { name: "Bills", abbr: "BUF", color: "#00338d" },
      format: { periods, reverse: false, boardSize: 100, freshNumbers: false },
      periods:
        periods === "quarters"
          ? [
              { key: "q1", label: "Q1" },
              { key: "q2", label: "Half" },
              { key: "q3", label: "Q3" },
              { key: "final", label: "Final" },
            ]
          : [],
      prizes: {},
      maxPerPlayer: 0,
      numbers: { "*": DIGITS },
      status: "locked",
      linkedEvent: { provider: "espn", league: "nfl", eventId: "1", startsAt: 1, xIsHome: true },
      hostPlayerId: BOB,
      createdAt: 1,
      lockedAt: 1,
    },
    players: [player(ME, "Jordan"), player(BOB, "Bob"), player(AL, "Al")],
    squares,
    scores,
    manualWinners: [],
    live: { state: "in", period: 1, clock: "15:00", detail: "Q1 15:00", scoreX: score.x, scoreY: score.y, updatedAt: 1 },
    activity: [],
    version: 1,
  };
}

/** The strip as the board renders it: live "now" straight from rightNow, like GameView. */
function cardText(state: GameState): string[] {
  const now = rightNow(state, ME);
  const { container, unmount } = render(
    <ResultsStrip
      cards={periodCards(state, resolveResults(state))}
      players={state.players}
      me={ME}
      teamX={state.game.teamX}
      teamY={state.game.teamY}
      reverse={false}
      predraw={false}
      liveNow={now?.live ? { playerId: now.ownerId, scoreX: now.scoreX, scoreY: now.scoreY } : null}
      selectedKey={null}
      onSelect={() => {}}
      grid={state.game.format.periods !== "every-score"}
    />,
  );
  const text = Array.from(container.querySelectorAll("button")).map((b) => b.textContent ?? "");
  unmount();
  return text;
}

describe("ResultsStrip live card", () => {
  it("every-score: the next-score card never names the current score's square (it can't win that entry)", () => {
    // Kickoff, 0-0 on Bob's square: 0-0 never wins on an every-score board.
    const [kickoff] = cardText(boardState("every-score", [], { x: 0, y: 0 }, [sq(9, 0, BOB)]));
    expect(kickoff).toContain("First score");
    expect(kickoff).not.toContain("If it ended now");
    expect(kickoff).not.toContain("Bob");

    // Score 3 (14-7) just went to Al; the next entry must be a different score.
    const strip = cardText(boardState("every-score", [entry("s1", 7, 0), entry("s2", 7, 7), entry("s3", 14, 7)], { x: 14, y: 7 }, [sq(2, 4, AL)]));
    const next = strip.find((t) => t.includes("Next score"))!;
    expect(next).not.toContain("If it ended now");
    expect(next).not.toContain("Al");
    expect(strip.some((t) => t.includes("Score 3") && t.includes("Al"))).toBe(true);
  });

  it("fixed periods still say who has it if the period ended now", () => {
    const strip = cardText(boardState("quarters", [], { x: 7, y: 3 }, [sq(6, 7, BOB)]));
    expect(strip[0]).toContain("If it ended now");
    expect(strip[0]).toContain("Bob");
  });
});
