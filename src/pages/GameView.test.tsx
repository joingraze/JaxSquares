// The board on the host's second device (opened from the host link): it holds the
// admin token but has its own player id, so it isn't on the player list. It's the
// host's own board, not an invite: no "<host> invited you" hero, and tapping a
// square doesn't throw them into the join sheet.

import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { GameState, Player } from "../../shared/types";

const board: { state: GameState | null } = { state: null };
vi.mock("../lib/live", async (orig) => {
  const real = await orig<typeof import("../lib/live")>();
  return {
    ...real,
    useGame: () => ({
      state: board.state,
      loading: false,
      notFound: false,
      error: null,
      connection: "open",
      watching: 2,
      refresh: async () => {},
      receive: () => {},
      mutate: <T,>(request: () => Promise<T>) => request(),
    }),
  };
});
vi.mock("../lib/native", async (orig) => {
  const real = await orig<typeof import("../lib/native")>();
  return { ...real, haptic: vi.fn(async () => {}), shareLink: vi.fn(async () => "copied") };
});
vi.mock("../components/ui/confetti", () => ({ celebrate: vi.fn(), CELEBRATION_COLORS: [], prefersReducedMotion: () => true }));

const identity = await import("../lib/identity");
const { ToastProvider } = await import("../components/ui");
const { loadHostTools } = await import("../features/host/hostTools");
const { default: GameView } = await import("./GameView");
// The sheets are lazy: have them ready so an (unwanted) join sheet would show at once.
await Promise.all([loadHostTools(), import("../features/invite/JoinSheet"), import("../features/invite/InviteSheet")]);

const HOST = "host_public_id_000000";
const player = (id: string, name: string): Player => ({ id, name, color: "#ff6b35", emoji: "🔥", joinedAt: 0, isHost: id === HOST });

function openBoard(players: Player[]): GameState {
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
      hostPlayerId: HOST,
      createdAt: 0,
      lockedAt: null,
    },
    players,
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

async function renderBoard() {
  render(
    <ToastProvider>
      <MemoryRouter initialEntries={["/g/brd123"]}>
        <Routes>
          <Route path="/g/:id" element={<GameView />} />
        </Routes>
      </MemoryRouter>
    </ToastProvider>,
  );
  await act(async () => {});
}

async function tapSquare(row: number, col: number) {
  const cell = screen.getAllByTestId("cell").find((c) => c.dataset.row === String(row) && c.dataset.col === String(col))!;
  await act(async () => {
    fireEvent.click(cell);
    await new Promise((r) => setTimeout(r, 20));
  });
}

describe("GameView for the host on another device", () => {
  it("shows the host's own board, not an invite, and a tap doesn't open the join sheet", async () => {
    board.state = openBoard([player(HOST, "Jordan"), player("maya_public_id_000000", "Maya")]);
    // Opened the host link on this phone: it has the token, and its own (unlisted) player id.
    identity.saveAdminToken("brd123", "admin-token");
    expect(board.state.players.some((p) => p.id === identity.getPlayerId())).toBe(false);
    await renderBoard();

    expect(screen.getByTestId("host-open")).toBeInTheDocument();
    expect(screen.queryByText(/invited you/)).toBeNull();

    await tapSquare(0, 0);
    expect(screen.queryByTestId("join-name")).toBeNull();
    // The pick is still there; joining is the host's call, from the bar.
    expect(within(document.body).getByTestId("claim-submit")).toHaveTextContent("Join & claim 1");
  });

  it("still invites a real newcomer and opens the join sheet on their first pick", async () => {
    board.state = openBoard([player(HOST, "Jordan")]);
    await renderBoard();

    expect(screen.getByText(/invited you/)).toBeInTheDocument();
    await tapSquare(0, 0);
    expect(await screen.findByTestId("join-name")).toBeInTheDocument();
  });
});
