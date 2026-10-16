import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { GameSummary } from "../../../shared/types";
import { ToastProvider } from "../../components/ui";
import Home from "../../pages/Home";

const fetchMock = vi.fn();

function summary(over: Partial<GameSummary>): GameSummary {
  return {
    id: "g1",
    name: "Board",
    sport: "football",
    teamX: { name: "Chiefs", abbr: "KC", color: "#e31837" },
    teamY: { name: "Bills", abbr: "BUF", color: "#00338d" },
    status: "open",
    format: { periods: "quarters", reverse: false, boardSize: 100, freshNumbers: false },
    isHost: false,
    mySquares: 0,
    claimed: 0,
    totalSquares: 100,
    playerCount: 1,
    live: null,
    startsAt: null,
    myWins: [],
    lastActivityAt: 1,
    createdAt: 1,
    ...over,
  };
}

function serve(games: GameSummary[]) {
  fetchMock.mockImplementation((url: string) => {
    const body = url.endsWith("/api/me/games") ? { games } : { error: "We couldn't find that board." };
    const status = url.endsWith("/api/me/games") ? 200 : 404;
    return Promise.resolve(new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } }));
  });
}

function renderHome() {
  return render(
    <ToastProvider>
      <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <Home />
      </MemoryRouter>
    </ToastProvider>,
  );
}

beforeEach(() => {
  localStorage.clear();
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("Home", () => {
  it("welcomes a brand-new device with one primary call to action", async () => {
    serve([]);
    renderHome();
    const cta = screen.getByTestId("new-board");
    expect(cta).toHaveAttribute("href", "/new");
    expect(cta).toHaveTextContent("Make a board");
    expect(screen.getByRole("button", { name: "Join with a code" })).toBeInTheDocument();
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    expect(screen.getAllByTestId("new-board")).toHaveLength(1);
  });

  it("groups a device's boards by what they need", async () => {
    localStorage.setItem("jaxsquares.games", JSON.stringify(["live", "full", "next", "done"]));
    serve([
      summary({ id: "live", name: "Thanksgiving Showdown", status: "locked", mySquares: 12 }),
      summary({ id: "full", name: "Fantasy League Board", isHost: true, claimed: 100 }),
      summary({ id: "next", name: "Group Chat Squares" }),
      summary({ id: "done", name: "Office Playoff Pool", status: "final", myWins: [{ periodKey: "final", label: "Final" }] }),
    ]);
    renderHome();
    expect(await screen.findByText("Live now")).toBeInTheDocument();
    expect(screen.getByText("Needs you")).toBeInTheDocument();
    expect(screen.getByText("Up next")).toBeInTheDocument();
    expect(screen.getByText("Final")).toBeInTheDocument();
    expect(screen.getByText("Thanksgiving Showdown")).toBeInTheDocument();
    // The full board is the most urgent to-do: it gets the one filled action.
    expect(screen.getByRole("button", { name: "Draw numbers" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Pick squares" })).toBeInTheDocument();
    expect(screen.getByText(/You won Final/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Open Group Chat Squares" })).toHaveAttribute("href", "/g/next");
  });
});
