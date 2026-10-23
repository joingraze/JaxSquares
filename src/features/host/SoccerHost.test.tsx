// The host's tools on a goal-minute soccer board: goals go in as the side
// that scored and the minute (with stoppage time), the footer says whose
// minute it is and what it wins, a goal can be fixed or removed, full time
// ends the match, and Rules & prizes offers soccer's presets and moments.

import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { rulesForPreset, withRules } from "../../../shared/formats";
import type { GameState, NumberDraw, Player, Square } from "../../../shared/types";

const setScore = vi.fn();
const deleteScore = vi.fn();
vi.mock("../../lib/api", async (orig) => {
  const real = await orig<typeof import("../../lib/api")>();
  return { ...real, api: { ...real.api, setScore: (...a: unknown[]) => setScore(...a), deleteScore: (...a: unknown[]) => deleteScore(...a) } };
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

const ALL = withRules({
  periods: "custom",
  reverse: false,
  boardSize: 100,
  freshNumbers: false,
  rules: [...rulesForPreset("first-last", false), ...rulesForPreset("every-score", false)],
});

function soccer(over: Partial<GameState["game"]> = {}, rest: Partial<GameState> = {}): GameState {
  return {
    game: {
      id: "hst123",
      name: "Derby Squares",
      sport: "soccer",
      league: "custom",
      teamX: { name: "Arsenal", abbr: "ARS", color: "#ef0107" },
      teamY: { name: "Chelsea", abbr: "CHE", color: "#034694" },
      format: ALL,
      periods: [
        { key: "first", label: "1st goal" },
        { key: "final", label: "Last goal" },
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
          <Route path="*" element={<p>Elsewhere</p>} />
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

// The draw: column i holds digit i (the minute's ones), row i holds 9 - i (its tens).
// The 43rd minute is row 5 (tens 4), column 3.
const goal1 = { periodKey: "s1", label: "Goal 1", scoreX: 0, scoreY: 1, minute: 43, added: 0, source: "host" as const, updatedAt: 1 };

describe("adding goals", () => {
  it("takes the side that scored and the minute, says whose square it is, and saves the goal", async () => {
    renderHost(soccer({}, { squares: [sq(5, 3, "maya")] }));
    fireEvent.click(screen.getByTestId("host-open"));
    const save = await screen.findByTestId("score-save");
    expect(save).toBeDisabled();
    expect(save).toHaveTextContent("Add goal 1");
    expect(screen.queryByTestId("score-x")).toBeNull();
    expect(screen.getByText("Pick who scored, then the minute.")).toBeInTheDocument();
    fireEvent.click(screen.getByTestId("goal-team-y"));
    fireEvent.change(screen.getByTestId("goal-minute"), { target: { value: "43" } });
    expect(screen.getByTestId("goal-preview")).toHaveTextContent("43' · Maya's square");
    expect(screen.getByTestId("goal-preview")).toHaveTextContent("Maya would win 1st goal + Goal 1");
    setScore.mockResolvedValue({ state: soccer({}, { squares: [sq(5, 3, "maya")], scores: [goal1] }) });
    fireEvent.click(save);
    await waitFor(() => expect(setScore).toHaveBeenCalledWith("hst123", { periodKey: "next", scoreX: 0, scoreY: 1, minute: 43, added: 0 }));
  });

  it("counts first-half stoppage time as the 45th minute", async () => {
    renderHost(soccer({}, { squares: [sq(5, 5, "maya")] }));
    fireEvent.click(screen.getByTestId("host-open"));
    await screen.findByTestId("score-save");
    fireEvent.click(screen.getByTestId("goal-team-x"));
    fireEvent.change(screen.getByTestId("goal-minute"), { target: { value: "45" } });
    fireEvent.change(screen.getByTestId("goal-added"), { target: { value: "3" } });
    expect(screen.getByTestId("goal-preview")).toHaveTextContent("45+3' · Maya's square");
  });

  it("lists the goals so far, fixes one and removes one", async () => {
    renderHost(soccer({}, { scores: [goal1] }));
    fireEvent.click(screen.getByTestId("host-open"));
    const row = await screen.findByTestId("goal-row");
    expect(row).toHaveTextContent("Goal 1 · CHE");
    expect(row).toHaveTextContent("43'");
    fireEvent.click(row);
    expect(screen.getByTestId("goal-minute")).toHaveValue("43");
    expect(screen.getByTestId("goal-team-y")).toHaveAttribute("aria-checked", "true");
    expect(screen.getByTestId("score-save")).toBeDisabled();
    fireEvent.change(screen.getByTestId("goal-minute"), { target: { value: "44" } });
    setScore.mockResolvedValue({ state: soccer({}, { scores: [{ ...goal1, minute: 44 }] }) });
    fireEvent.click(screen.getByTestId("score-save"));
    await waitFor(() => expect(setScore).toHaveBeenCalledWith("hst123", { periodKey: "s1", scoreX: 0, scoreY: 1, minute: 44, added: 0 }));
  });

  it("refuses a minute past extra time", async () => {
    renderHost(soccer());
    fireEvent.click(screen.getByTestId("host-open"));
    await screen.findByTestId("score-save");
    fireEvent.click(screen.getByTestId("goal-team-x"));
    fireEvent.change(screen.getByTestId("goal-minute"), { target: { value: "150" } });
    expect(screen.getByText("Minutes go from 0 to 130.")).toBeInTheDocument();
    expect(screen.getByTestId("score-save")).toBeDisabled();
  });

  it("ends the match at full time with the last goal's score", async () => {
    renderHost(soccer({}, { scores: [goal1] }));
    fireEvent.click(screen.getByTestId("host-open"));
    setScore.mockResolvedValue({ state: soccer({ status: "final" }, { scores: [goal1, { periodKey: "final", scoreX: 0, scoreY: 1, source: "host", updatedAt: 2 }] }) });
    fireEvent.click(await screen.findByTestId("goal-full-time"));
    await waitFor(() => expect(setScore).toHaveBeenCalledWith("hst123", { periodKey: "final", scoreX: 0, scoreY: 1 }));
  });

  it("says goals in the host bar", async () => {
    renderHost(soccer({}, { scores: [goal1] }));
    expect(await screen.findByText("1 goal so far")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Add goal/ })).toBeInTheDocument();
  });
});

describe("Rules & prizes on a soccer board", () => {
  it("offers soccer's presets and its goal moments", async () => {
    renderHost(soccer({ status: "open", numbers: null }));
    fireEvent.click(screen.getByTestId("host-open"));
    fireEvent.click(await screen.findByTestId("host-rules"));
    const editor = await screen.findByTestId("rules-editor");
    expect(screen.getAllByTestId("rules-preset").map((c) => c.textContent)).toEqual(["Every goal", "First & last", "Last goal"]);
    // The first, every and last goal together is no preset of its own.
    expect(screen.getByText("Custom", { selector: "button" })).toBeInTheDocument();
    expect(within(editor).getAllByTestId("rule-row").map((r) => r.getAttribute("data-moment"))).toEqual(["first", "score", "final"]);
    expect(within(editor).getAllByTestId("rule-row").map((r) => r.querySelector("p")?.textContent)).toEqual(["First goal", "Every goal", "Last goal"]);
    expect(screen.queryByText(/New numbers each/)).toBeNull();
    expect(screen.queryByText(/score type/i)).toBeNull();
  });
});
