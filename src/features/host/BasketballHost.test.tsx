// The host's tools on a basketball board: the score pad keeps to the keypad
// (no touchdown or field goal buttons) and takes three-digit scores, Rules &
// prizes offers the game's own presets and moments (no every score; halves
// for men's college), and the copy says tip-off.

import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { rulesForPreset, withRules } from "../../../shared/formats";
import type { GameState, NumberDraw, Player, Square } from "../../../shared/types";

const setScore = vi.fn();
vi.mock("../../lib/api", async (orig) => {
  const real = await orig<typeof import("../../lib/api")>();
  return { ...real, api: { ...real.api, setScore: (...a: unknown[]) => setScore(...a) } };
});
vi.mock("../../lib/native", async (orig) => {
  const real = await orig<typeof import("../../lib/native")>();
  return { ...real, haptic: vi.fn(async () => {}), shareLink: vi.fn(async () => "copied") };
});
vi.mock("../../components/ui/confetti", () => ({ celebrate: vi.fn(), CELEBRATION_COLORS: [], prefersReducedMotion: () => true }));

const passStore = await import("../../lib/hostPassStore");
const identity = await import("../../lib/identity");
const { ToastProvider } = await import("../../components/ui");
const { HostControls } = await import("./HostControls");

const DRAW: NumberDraw = {
  x: [[0], [1], [2], [3], [4], [5], [6], [7], [8], [9]],
  y: [[9], [8], [7], [6], [5], [4], [3], [2], [1], [0]],
};
const player = (id: string, name: string): Player => ({ id, name, color: "#ff6b35", emoji: "🔥", joinedAt: 0, isHost: false });
const sq = (row: number, col: number, playerId: string): Square => ({ row, col, playerId, claimedAt: 0 });

function hoops(over: Partial<GameState["game"]> = {}, rest: Partial<GameState> = {}): GameState {
  return {
    game: {
      id: "hst123",
      name: "March Squares",
      sport: "basketball",
      league: "custom",
      teamX: { name: "Boston Celtics", abbr: "BOS", color: "#008348" },
      teamY: { name: "Los Angeles Lakers", abbr: "LAL", color: "#552583" },
      format: withRules({ periods: "quarters", reverse: false, boardSize: 100, freshNumbers: false }),
      periods: [
        { key: "q1", label: "Q1" },
        { key: "q2", label: "Half" },
        { key: "q3", label: "Q3" },
        { key: "final", label: "Final" },
      ],
      prizes: {},
      maxPerPlayer: 0,
      numbers: { "*": DRAW },
      status: "locked",
      linkedEvent: null,
      hostPlayerId: "host",
      createdAt: 0,
      lockedAt: null,
      ...over,
    },
    players: [player("host", "Jordan"), player("maya", "Maya")],
    squares: [],
    scores: [],
    manualWinners: [],
    live: null,
    activity: [],
    version: 1,
    ...rest,
  };
}

function renderHost(state: GameState) {
  return render(
    <MemoryRouter initialEntries={["/g/hst123"]}>
      <ToastProvider>
        <Routes>
          <Route path="/g/:id" element={<HostControls state={state} apply={vi.fn()} pickCell={vi.fn(async () => null)} onInvite={vi.fn()} />} />
        </Routes>
      </ToastProvider>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  localStorage.clear();
  vi.clearAllMocks();
  passStore.resetHostPass();
  identity.saveAdminToken("hst123", "tok");
});

describe("the score pad on a basketball board", () => {
  it("has the keypad only (no touchdown buttons) and takes a three-digit score", async () => {
    // 104-98 -> BOS digit 4 (col 4), LAL digit 8 (row 1).
    renderHost(hoops({}, { squares: [sq(1, 4, "maya")] }));
    fireEvent.click(screen.getByTestId("host-open"));
    const save = await screen.findByTestId("score-save");
    expect(screen.queryByTestId("score-quick-adds")).toBeNull();
    expect(screen.queryByText(/TD|touchdown|field goal|the kick/i)).toBeNull();
    for (const d of ["1", "0", "4"]) fireEvent.click(screen.getByRole("button", { name: d }));
    expect(screen.getByTestId("score-x")).toHaveValue("104");
    fireEvent.click(screen.getByRole("button", { name: /Switch to Los Angeles Lakers/ }));
    fireEvent.click(screen.getByRole("button", { name: "9" }));
    fireEvent.click(screen.getByRole("button", { name: "8" }));
    expect(screen.getByText(/would win at the end of Q1/)).toHaveTextContent("Maya would win at the end of Q1");
    setScore.mockResolvedValue({ state: hoops({}, { squares: [sq(1, 4, "maya")], scores: [{ periodKey: "q1", scoreX: 104, scoreY: 98, source: "host", updatedAt: 1 }] }) });
    fireEvent.click(save);
    await waitFor(() => expect(setScore).toHaveBeenCalledWith("hst123", { periodKey: "q1", scoreX: 104, scoreY: 98 }));
  });

  it("never shows the football quick adds, even on an every-score basketball board from older data", async () => {
    const everyScore = withRules({ periods: "every-score", reverse: false, boardSize: 100, freshNumbers: false });
    renderHost(hoops({ format: everyScore, periods: [] }, { scores: [{ periodKey: "s1", scoreX: 2, scoreY: 0, source: "host", updatedAt: 1, label: "Score 1" }] }));
    fireEvent.click(screen.getByTestId("host-open"));
    await screen.findByTestId("score-save");
    expect(screen.queryByTestId("score-quick-adds")).toBeNull();
    expect(screen.queryByText(/Save the TD/)).toBeNull();
  });
});

describe("Rules & prizes on a basketball board", () => {
  it("offers the quarters, halves and final, and no every-score row", async () => {
    renderHost(hoops({ status: "open", numbers: null }));
    fireEvent.click(screen.getByTestId("host-open"));
    fireEvent.click(await screen.findByTestId("host-rules"));
    await screen.findByTestId("rules-editor");
    expect(screen.getAllByTestId("rules-preset").map((c) => c.getAttribute("data-preset"))).toEqual(["quarters", "halves", "final"]);
    expect(screen.getAllByTestId("rule-row").map((r) => r.getAttribute("data-moment"))).toEqual(["q1", "q2", "q3", "final"]);
  });

  it("offers men's college basketball halftime and the final only, with new numbers each half", async () => {
    const halves = withRules({ periods: "halves", reverse: false, boardSize: 100, freshNumbers: false, rules: rulesForPreset("halves", false) });
    renderHost(
      hoops({
        league: "ncaab",
        status: "open",
        numbers: null,
        format: halves,
        periods: [
          { key: "q2", label: "Half" },
          { key: "final", label: "Final" },
        ],
        linkedEvent: { provider: "espn", league: "ncaab", eventId: "401745001", startsAt: Date.now() + 86_400_000, xIsHome: false },
      }),
    );
    fireEvent.click(screen.getByTestId("host-open"));
    fireEvent.click(await screen.findByTestId("host-rules"));
    const editor = await screen.findByTestId("rules-editor");
    expect(screen.getAllByTestId("rules-preset").map((c) => c.getAttribute("data-preset"))).toEqual(["halves", "final"]);
    expect(within(editor).getAllByTestId("rule-row").map((r) => r.getAttribute("data-moment"))).toEqual(["q2", "final"]);
    expect(screen.getByText("New numbers each half")).toBeInTheDocument();
  });
});

describe("tip-off", () => {
  it("says tip-off where football says kickoff", async () => {
    renderHost(hoops({ linkedEvent: { provider: "espn", league: "nba", eventId: "1", startsAt: Date.now() + 3_600_000, xIsHome: false }, league: "nba" }));
    fireEvent.click(screen.getByTestId("host-open"));
    expect(await screen.findByText(/^Tip-off /)).toBeInTheDocument();
    expect(screen.queryByText(/kickoff/i)).toBeNull();
  });
});
