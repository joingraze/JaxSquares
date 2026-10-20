// The printable board (/g/:id/print): amounts off by default and on with the
// switch, the sign-up sheet before anyone claims, names and digits in the
// grid, the QR code to the live board, and print rules only while it's open.

import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { GameFormat, GameState, MomentRule, NumberDraw, Player, Square } from "../../shared/types";

const board: { state: GameState | null } = { state: null };
vi.mock("../lib/live", async (orig) => {
  const real = await orig<typeof import("../lib/live")>();
  return {
    ...real,
    useGame: () => ({
      state: board.state,
      fromPage: false,
      loading: false,
      notFound: false,
      error: null,
      connection: "open",
      watching: 0,
      refresh: async () => {},
      receive: () => {},
      mutate: <T,>(request: () => Promise<T>) => request(),
    }),
  };
});

const { inviteUrl } = await import("../lib/api");
const { displayLink } = await import("../features/invite/inviteModel");
const { default: PrintView } = await import("./PrintView");

const DRAW: NumberDraw = {
  x: [[0], [1], [2], [3], [4], [5], [6], [7], [8], [9]],
  y: [[9], [8], [7], [6], [5], [4], [3], [2], [1], [0]],
};
const RULES: MomentRule[] = [
  { moment: "q1", square: { amount: 200, note: "Loser buys wings" }, reverse: null },
  { moment: "q2", square: { amount: 200, note: "" }, reverse: null },
  { moment: "q3", square: { amount: 200, note: "" }, reverse: null },
  { moment: "final", square: { amount: null, note: "", rest: true }, reverse: null },
];
const FORMAT: GameFormat = { periods: "quarters", reverse: false, boardSize: 100, freshNumbers: false, rules: RULES, unit: "$", squarePrice: 10 };
const PLAYERS: Player[] = [
  { id: "maya_public_id_0000000", name: "Maya", color: "#ff6b35", emoji: "", joinedAt: 0, isHost: true },
  { id: "mary_public_id_0000000", name: "Mary Elizabeth Johnson", color: "#4dabf7", emoji: "", joinedAt: 0, isHost: false },
];
const squares = (n: number): Square[] => Array.from({ length: n }, (_, i) => ({ row: Math.floor(i / 10), col: i % 10, playerId: PLAYERS[i % 2].id, claimedAt: 0 }));

function makeState(over: Partial<GameState["game"]> = {}, rest: Partial<GameState> = {}): GameState {
  return {
    game: {
      id: "prt123",
      name: "Office Big Game Board",
      sport: "football",
      league: "custom",
      teamX: { name: "Eagles", abbr: "PHI", color: "#004c54" },
      teamY: { name: "49ers", abbr: "SF", color: "#aa0000" },
      format: FORMAT,
      periods: [
        { key: "q1", label: "Q1" },
        { key: "q2", label: "Half" },
        { key: "q3", label: "Q3" },
        { key: "final", label: "Final" },
      ],
      prizes: {},
      maxPerPlayer: 0,
      numbers: null,
      status: "open",
      linkedEvent: null,
      hostPlayerId: PLAYERS[0].id,
      createdAt: 0,
      lockedAt: null,
      startsAt: Date.UTC(2027, 1, 7, 23, 30),
      ...over,
    },
    players: PLAYERS,
    squares: squares(40),
    scores: [],
    manualWinners: [],
    live: null,
    activity: [],
    version: 1,
    ...rest,
  };
}

function renderPrint() {
  return render(
    <MemoryRouter initialEntries={["/g/prt123/print"]} future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <Routes>
        <Route path="/g/:id/print" element={<PrintView />} />
        <Route path="/g/:id" element={<p>Board screen</p>} />
      </Routes>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  board.state = null;
  localStorage.clear();
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("Printable board", () => {
  it("prints without the square price or any prize amount by default", () => {
    board.state = makeState();
    renderPrint();
    const sheet = screen.getByTestId("print-sheet");
    expect(sheet.dataset.amounts).toBe("false");
    expect(sheet).not.toHaveTextContent("$");
    expect(screen.queryByTestId("print-price")).toBeNull();
    // Who wins when, with the host's note, still there.
    expect(within(sheet).getByTestId("print-rules")).toHaveTextContent("End of Q1");
    expect(within(sheet).getByTestId("print-rules")).toHaveTextContent("Loser buys wings");
    // The switch that would add them is on screen, off, and never printed.
    const toggle = screen.getByRole("switch", { name: "Include square price and prizes" });
    expect(toggle).toHaveAttribute("aria-checked", "false");
    expect(toggle.closest("[data-print-hide]")).not.toBeNull();
    expect(sheet.closest("[data-print-hide]")).toBeNull();
  });

  it("adds the square price and prizes when the switch is on", () => {
    board.state = makeState();
    renderPrint();
    fireEvent.click(screen.getByRole("switch", { name: "Include square price and prizes" }));
    const sheet = screen.getByTestId("print-sheet");
    expect(sheet.dataset.amounts).toBe("true");
    expect(screen.getByTestId("print-price")).toHaveTextContent("$10 a square");
    expect(within(sheet).getAllByTestId("print-amount").map((a) => a.textContent)).toEqual([" · $200", " · $200", " · $200", " · the rest of the board total"]);
  });

  it("shows the title row, names in the squares and a dash for numbers not drawn yet", () => {
    board.state = makeState();
    renderPrint();
    const sheet = screen.getByTestId("print-sheet");
    expect(within(sheet).getByRole("heading", { level: 1 })).toHaveTextContent("Office Big Game Board");
    expect(screen.getByTestId("print-subtitle")).toHaveTextContent(/^Eagles vs 49ers · .*2027/);
    const cells = screen.getAllByTestId("print-cell");
    expect(cells).toHaveLength(100);
    expect(cells[0]).toHaveTextContent("Maya");
    // A long name splits between words.
    expect(cells[1].querySelectorAll("span.block").length).toBeGreaterThan(1);
    expect(cells[1]).toHaveTextContent(/Mary\s*Elizabeth\s*Johnson/);
    expect(cells[99]).toHaveTextContent("");
    expect(sheet.querySelectorAll(".jx-paper-axis")).toHaveLength(20);
    for (const axis of sheet.querySelectorAll(".jx-paper-axis")) expect(axis).toHaveTextContent("–");
  });

  it("links the QR code to the live board", () => {
    board.state = makeState({ status: "locked", numbers: { "*": DRAW }, lockedAt: 1 }, { squares: squares(100) });
    renderPrint();
    const link = displayLink(inviteUrl("prt123"));
    expect(within(screen.getByTestId("print-qr")).getByRole("img")).toHaveAccessibleName(`QR code for ${link}`);
    expect(screen.getByTestId("print-follow")).toHaveTextContent(`Follow it live: ${link}`);
    expect(screen.queryByTestId("print-signup")).toBeNull();
    // Drawn numbers on both edges.
    const axes = [...screen.getByTestId("print-sheet").querySelectorAll(".jx-paper-axis")].map((a) => a.textContent);
    expect(axes.slice(0, 10)).toEqual(["0", "1", "2", "3", "4", "5", "6", "7", "8", "9"]);
  });

  it("doubles as a sign-up sheet before anyone claims", () => {
    board.state = makeState({}, { squares: [] });
    renderPrint();
    const sheet = screen.getByTestId("print-sheet");
    expect(sheet.dataset.mode).toBe("signup");
    expect(sheet).toHaveTextContent("Sign-up sheet");
    expect(screen.getByTestId("print-signup")).toHaveTextContent("Grab a square on your phone, or write your name in a box.");
    expect(screen.getAllByTestId("print-cell").every((c) => c.textContent === "")).toBe(true);
    expect(screen.getByRole("heading", { name: "Print a sign-up sheet" })).toBeInTheDocument();
  });

  it("has no amounts switch on a just-for-fun board", () => {
    board.state = makeState({ format: { ...FORMAT, justForFun: true, squarePrice: null, rules: RULES.map((r) => ({ ...r, square: r.square && { amount: null, note: r.square.note } })) } });
    renderPrint();
    expect(screen.queryByRole("switch")).toBeNull();
    expect(screen.getByTestId("print-sheet")).not.toHaveTextContent("$");
  });

  it("prints on the big button, landscape, with print rules only while the page is open", () => {
    const print = vi.spyOn(window, "print").mockImplementation(() => {});
    board.state = makeState();
    const { container, unmount } = renderPrint();
    expect(document.documentElement.hasAttribute("data-print-page")).toBe(true);
    expect(container.querySelector("style")?.textContent).toContain("@page { size: landscape; margin: 10mm; }");
    fireEvent.click(screen.getByTestId("print-button"));
    expect(print).toHaveBeenCalledTimes(1);
    unmount();
    expect(document.documentElement.hasAttribute("data-print-page")).toBe(false);
  });

  it("prints a 5×5 board portrait", () => {
    board.state = makeState({ format: { ...FORMAT, boardSize: 25 } }, { squares: [] });
    const { container } = renderPrint();
    expect(screen.getAllByTestId("print-cell")).toHaveLength(25);
    expect(container.querySelector("style")?.textContent).toContain("size: portrait");
  });
});
