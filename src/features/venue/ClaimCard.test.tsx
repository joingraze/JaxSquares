// A winner's claim card and winning pass on a venue board: the prize and the
// code, the time left to collect, staff marking it collected on the phone,
// and the card once it's collected (here or in Host tools).

import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ClaimsResponse, GameState, NumberDraw, Player, Square } from "../../../shared/types";
import { winnerRows } from "../host/hostModel";
import { WinnersList } from "../host/WinnersList";
import { ClaimCard } from "./ClaimCard";

// Column c holds digit c for the Chiefs; row r holds 9 - r for the Bills: 7–3 lands on row 6, column 7 (square 67 -> Dre).
const DRAW: NumberDraw = {
  x: [[0], [1], [2], [3], [4], [5], [6], [7], [8], [9]],
  y: [[9], [8], [7], [6], [5], [4], [3], [2], [1], [0]],
};
const player = (id: string, name: string): Player => ({ id, name, color: "#4dabf7", emoji: "🐻", joinedAt: 0, isHost: false });
const PLAYERS = [player("maya", "Maya"), player("dre", "Dre"), player("kim", "Kim")];
const SQUARES: Square[] = Array.from({ length: 100 }, (_, i) => ({ row: Math.floor(i / 10), col: i % 10, playerId: PLAYERS[i % 3].id, claimedAt: 0 }));
const NOW = Date.UTC(2026, 9, 21, 20, 0, 0);

function venueState(over: Partial<GameState> = {}): GameState {
  return {
    game: {
      id: "bar123",
      name: "Rusty Anchor Game Night",
      sport: "football",
      league: "custom",
      teamX: { name: "Chiefs", abbr: "KC", color: "#e31837" },
      teamY: { name: "Bills", abbr: "BUF", color: "#00338d" },
      format: {
        periods: "quarters",
        reverse: false,
        boardSize: 100,
        freshNumbers: false,
        justForFun: true,
        venue: true,
        claimCodes: true,
        claimMinutes: 5,
        rules: [
          { moment: "q1", square: { amount: null, note: "Free appetizer" }, reverse: null },
          { moment: "final", square: { amount: null, note: "Team jersey" }, reverse: null },
        ],
      },
      periods: [
        { key: "q1", label: "Q1" },
        { key: "final", label: "Final" },
      ],
      prizes: {},
      maxPerPlayer: 1,
      numbers: { "*": DRAW },
      status: "locked",
      linkedEvent: null,
      hostPlayerId: "maya",
      createdAt: 0,
      lockedAt: 1,
    },
    players: PLAYERS,
    squares: SQUARES,
    scores: [{ periodKey: "q1", scoreX: 7, scoreY: 3, source: "host", updatedAt: NOW - 60_000 }],
    manualWinners: [],
    live: null,
    activity: [],
    collected: [],
    version: 1,
    ...over,
  };
}

const CLAIMS: ClaimsResponse = { enabled: true, mine: [{ periodKey: "q1", label: "Q1", reverse: false, playerId: "dre", code: "UXFK" }], all: null };

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date", "setInterval", "clearInterval", "setTimeout", "clearTimeout"] });
  vi.setSystemTime(NOW);
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("ClaimCard", () => {
  it("shows nothing to anyone who didn't win, or on a board without claim codes", () => {
    render(<ClaimCard state={venueState()} claims={{ enabled: true, mine: [], all: null }} onCollect={vi.fn()} />);
    expect(screen.queryByTestId("claim-card")).toBeNull();
    render(<ClaimCard state={venueState()} claims={{ enabled: false, mine: [], all: null }} onCollect={vi.fn()} />);
    expect(screen.queryByTestId("claim-card")).toBeNull();
  });

  it("shows the winner's prize, code and time left, and the pass staff mark collected", async () => {
    const onCollect = vi.fn(async () => {});
    render(<ClaimCard state={venueState()} claims={CLAIMS} onCollect={onCollect} />);
    const card = screen.getByTestId("claim-card");
    expect(card).toHaveTextContent("Free appetizer");
    expect(screen.getByTestId("claim-code")).toHaveTextContent("UXFK");
    expect(screen.getByTestId("claim-countdown")).toHaveTextContent("4:00 left to collect");
    act(() => void vi.advanceTimersByTime(2_000));
    expect(screen.getByTestId("claim-countdown")).toHaveTextContent("3:58 left to collect");

    fireEvent.click(screen.getByTestId("claim-show"));
    const pass = screen.getByTestId("winning-pass");
    expect(pass).toHaveTextContent("Rusty Anchor Game Night");
    expect(screen.getByTestId("winning-pass-name")).toHaveTextContent("Dre");
    expect(screen.getByTestId("winning-pass-prize")).toHaveTextContent("Free appetizer");
    expect(screen.getByTestId("winning-pass-code")).toHaveTextContent("UXFK");
    expect(screen.getByTestId("winning-pass-countdown")).toHaveTextContent("3:58 left to collect");

    // Staff confirm before it counts.
    fireEvent.click(screen.getByTestId("winning-pass-collect"));
    expect(onCollect).not.toHaveBeenCalled();
    await act(async () => void fireEvent.click(screen.getByTestId("winning-pass-confirm")));
    expect(onCollect).toHaveBeenCalledWith(CLAIMS.mine[0]);
  });

  it("says when it was collected, and the pass shows it too", () => {
    const state = venueState({ collected: [{ periodKey: "q1", reverse: false, playerId: "dre", at: NOW - 30_000, by: "host" }] });
    render(<ClaimCard state={state} claims={CLAIMS} onCollect={vi.fn()} />);
    expect(screen.getByTestId("claim-card")).toHaveTextContent("Prize collected");
    expect(screen.getByTestId("claim-collected")).toHaveTextContent("Collected at");
    expect(screen.queryByTestId("claim-show")).toBeNull();
  });

  it("says time's up once the time to collect runs out, and the pass has no collect button", () => {
    render(<ClaimCard state={venueState({ scores: [{ periodKey: "q1", scoreX: 7, scoreY: 3, source: "host", updatedAt: NOW - 6 * 60_000 }] })} claims={CLAIMS} onCollect={vi.fn()} />);
    expect(screen.getByTestId("claim-countdown")).toHaveTextContent("Time's up. Ask staff.");
    fireEvent.click(screen.getByTestId("claim-show"));
    expect(screen.getByTestId("winning-pass-countdown")).toHaveTextContent("Time's up to collect");
    expect(screen.queryByTestId("winning-pass-collect")).toBeNull();
  });

  it("shows the server's refusal on the pass", async () => {
    const onCollect = vi.fn(async () => {
      throw new Error("Time's up to collect on this phone.");
    });
    render(<ClaimCard state={venueState()} claims={CLAIMS} onCollect={onCollect} />);
    fireEvent.click(screen.getByTestId("claim-show"));
    fireEvent.click(screen.getByTestId("winning-pass-collect"));
    await act(async () => void fireEvent.click(screen.getByTestId("winning-pass-confirm")));
    expect(screen.getByRole("alert")).toHaveTextContent("Time's up to collect on this phone.");
  });
});

describe("Host tools: winners on a venue board", () => {
  const codes = [{ periodKey: "q1", label: "Q1", reverse: false, playerId: "dre", code: "UXFK" }];
  const list = (state: GameState, onCollect = vi.fn()) => {
    render(<WinnersList state={state} codes={codes} onCollect={onCollect} rows={winnerRows(state)} me="maya" busy={false} onPick={vi.fn()} onUndoPick={vi.fn()} canPickOpen={false} />);
    return onCollect;
  };

  it("lists each winner's code with the time left, and marks the prize collected", () => {
    const onCollect = list(venueState());
    expect(screen.getByTestId("winner-code")).toHaveTextContent("UXFK");
    expect(screen.getByText("4:00 left")).toBeInTheDocument();
    fireEvent.click(screen.getByTestId("winner-collect"));
    expect(onCollect).toHaveBeenCalledWith("q1", false, true);
  });

  it("says when it was collected, with Undo", () => {
    const onCollect = list(venueState({ collected: [{ periodKey: "q1", reverse: false, playerId: "dre", at: NOW, by: "winner" }] }));
    expect(screen.getByTestId("winner-collected")).toHaveTextContent("Collected");
    fireEvent.click(screen.getByTestId("winner-uncollect"));
    expect(onCollect).toHaveBeenCalledWith("q1", false, false);
  });
});
