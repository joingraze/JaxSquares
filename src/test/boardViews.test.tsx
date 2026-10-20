// The board's TV and print views: their routes resolve to their own screens
// (full-bleed in the shell), and the board offers them: "Show on TV" and
// "Print board" in the invite sheet, and the watch-party hint in the host sheet.

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { matchRoutes, MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { GameState, Player } from "../../shared/types";

vi.mock("../lib/native", async (orig) => {
  const real = await orig<typeof import("../lib/native")>();
  return { ...real, haptic: vi.fn(async () => {}), shareLink: vi.fn(async () => "copied") };
});
vi.mock("../components/ui/confetti", () => ({ celebrate: vi.fn(), CELEBRATION_COLORS: [], prefersReducedMotion: () => true }));

const { appRoutes, preloadScreen } = await import("../App");
const { boardViewPath, isBoardViewPath } = await import("../lib/boardViews");
const { InviteSheet } = await import("../features/invite/InviteSheet");
const { HostControls } = await import("../features/host/HostControls");
const { ToastProvider } = await import("../components/ui");
const identity = await import("../lib/identity");

const player = (id: string, name: string): Player => ({ id, name, color: "#ff6b35", emoji: "", joinedAt: 0, isHost: id === "host" });

function makeState(): GameState {
  return {
    game: {
      id: "brd123",
      name: "Sunday Night Squares",
      sport: "football",
      league: "custom",
      teamX: { name: "Chiefs", abbr: "KC", color: "#e31837" },
      teamY: { name: "Bills", abbr: "BUF", color: "#00338d" },
      format: { periods: "quarters", reverse: false, boardSize: 100, freshNumbers: false },
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
      hostPlayerId: "host",
      createdAt: 0,
      lockedAt: null,
    },
    players: [player("host", "Jordan"), player("maya", "Maya")],
    squares: [],
    scores: [],
    manualWinners: [],
    live: null,
    activity: [],
    version: 1,
  };
}

beforeEach(() => {
  localStorage.clear();
  vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ error: "offline in tests" }), { status: 503 })));
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("routes", () => {
  const screenFor = (path: string) => matchRoutes(appRoutes(), path)?.at(-1)?.route.id;

  it("resolves /g/:id/tv and /g/:id/print to their own screens, next to the board", () => {
    expect(screenFor("/g/k7m2px/tv")).toBe("tv");
    expect(screenFor("/g/k7m2px/print")).toBe("print");
    expect(screenFor("/g/k7m2px")).toBe("game");
    expect(screenFor("/g/k7m2px/nope")).toBeUndefined();
  });

  it("loads each view's screen before the router starts (deep links)", async () => {
    await expect(preloadScreen("/g/k7m2px/tv")).resolves.toBeUndefined();
    await expect(preloadScreen("/g/k7m2px/print")).resolves.toBeUndefined();
  });

  it("builds the paths and tells the shell which ones are full-bleed", () => {
    expect(boardViewPath("k7m2px", "tv")).toBe("/g/k7m2px/tv");
    expect(boardViewPath("k7m2px", "print")).toBe("/g/k7m2px/print");
    expect(isBoardViewPath("/g/k7m2px/tv")).toBe(true);
    expect(isBoardViewPath("/g/K7M2PX/print/")).toBe(true);
    expect(isBoardViewPath("/g/k7m2px")).toBe(false);
    expect(isBoardViewPath("/g/k7m2px/tv/extra")).toBe(false);
  });
});

describe("entry points", () => {
  it("puts Show on TV and Print board in the board's invite sheet", () => {
    const onShowTv = vi.fn();
    const onPrint = vi.fn();
    render(<InviteSheet state={makeState()} open onClose={() => {}} onShowTv={onShowTv} onPrint={onPrint} />);
    fireEvent.click(screen.getByTestId("invite-tv"));
    expect(onShowTv).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId("invite-tv")).toHaveTextContent("Show on TV");
    fireEvent.click(screen.getByTestId("invite-print"));
    expect(onPrint).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId("invite-print")).toHaveTextContent("Print board");
  });

  it("leaves them out of an invite sheet that wasn't given them", () => {
    render(<InviteSheet state={makeState()} open onClose={() => {}} />);
    expect(screen.queryByTestId("invite-tv")).toBeNull();
    expect(screen.queryByTestId("invite-print")).toBeNull();
  });

  it("gives the host a watch-party hint that opens TV mode", async () => {
    identity.saveAdminToken("brd123", "tok");
    render(
      <MemoryRouter initialEntries={["/g/brd123"]} future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <ToastProvider>
          <Routes>
            <Route path="/g/:id" element={<HostControls state={makeState()} apply={vi.fn()} pickCell={vi.fn(async () => null)} onInvite={vi.fn()} />} />
            <Route path="/g/:id/tv" element={<p>TV mode</p>} />
          </Routes>
        </ToastProvider>
      </MemoryRouter>,
    );
    fireEvent.click(screen.getByTestId("host-open"));
    const hint = await screen.findByTestId("host-tv");
    expect(hint).toHaveTextContent("Hosting a watch party? Show the board on your TV.");
    expect(hint).toHaveAttribute("href", "/g/brd123/tv");
    fireEvent.click(hint);
    expect(await screen.findByText("TV mode")).toBeInTheDocument();
  });
});
