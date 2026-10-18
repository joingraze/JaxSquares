// The board on the host's second device (opened from the host link): it holds the
// admin token but has its own player id, so it isn't on the player list. It's the
// host's own board, not an invite: no "<host> invited you" hero, and tapping a
// square doesn't throw them into the join sheet.

import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { GameState, Player } from "../../shared/types";

const board: { state: GameState | null; fromPage?: boolean } = { state: null };
vi.mock("../lib/live", async (orig) => {
  const real = await orig<typeof import("../lib/live")>();
  return {
    ...real,
    useGame: () => ({
      state: board.state,
      fromPage: !!board.fromPage,
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
  board.fromPage = false;
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

describe("GameView players list for the host", () => {
  const MAYA = "maya_public_id_000000";
  const mayas = (n: number) => Array.from({ length: n }, (_, i) => ({ row: 0, col: i, playerId: MAYA, claimedAt: 0 }));

  it("offers remove on everyone else's row while squares are being picked, confirmed in the host tools", async () => {
    board.state = { ...openBoard([player(HOST, "Jordan"), player(MAYA, "Maya")]), squares: mayas(6) };
    identity.saveAdminToken("brd123", "admin-token");
    await renderBoard();

    const remove = screen.getAllByTestId("player-remove");
    expect(remove).toHaveLength(1);
    expect(remove[0]).toHaveAccessibleName("Remove Maya");
    await act(async () => {
      fireEvent.click(remove[0]);
    });
    expect(await screen.findByRole("heading", { name: /Remove Maya\?/ })).toBeInTheDocument();
    expect(screen.getByText("Their 6 squares open up again.")).toBeInTheDocument();
    expect(screen.getByTestId("remove-player-confirm")).toHaveTextContent("Remove Maya");
  });

  it("isn't offered once the numbers are drawn, or to anyone but the host", async () => {
    const locked = { ...openBoard([player(HOST, "Jordan"), player(MAYA, "Maya")]), squares: mayas(6) };
    locked.game = { ...locked.game, status: "locked", numbers: { "*": { x: [[0], [1], [2], [3], [4], [5], [6], [7], [8], [9]], y: [[0], [1], [2], [3], [4], [5], [6], [7], [8], [9]] } } };
    board.state = locked;
    identity.saveAdminToken("brd123", "admin-token");
    const { unmount } = render(
      <ToastProvider>
        <MemoryRouter initialEntries={["/g/brd123"]}>
          <Routes>
            <Route path="/g/:id" element={<GameView />} />
          </Routes>
        </MemoryRouter>
      </ToastProvider>,
    );
    await act(async () => {});
    expect(screen.queryByTestId("player-remove")).toBeNull();
    unmount();

    localStorage.clear();
    board.state = { ...openBoard([player(HOST, "Jordan"), player(MAYA, "Maya")]), squares: mayas(6) };
    await renderBoard();
    expect(within(screen.getByRole("region", { name: "Players" })).getByText("Maya")).toBeInTheDocument();
    expect(screen.queryByTestId("player-remove")).toBeNull();
  });
});

describe("Let Jax pick", () => {
  const MAYA = "maya_public_id_000000";
  type Cells = { cells: { row: number; col: number }[] };

  /** Answers claim requests with `answer(cells, call)`; everything else is offline. */
  function claimServer(answer: (cells: Cells["cells"], call: number) => { claimed: number; state: GameState }) {
    const calls: Cells["cells"][] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string, init?: RequestInit) => {
        if (String(url).endsWith("/claim") && init?.method === "POST") {
          const { cells } = JSON.parse(String(init.body)) as Cells;
          calls.push(cells);
          const { claimed, state } = answer(cells, calls.length);
          return new Response(JSON.stringify({ claimed, skipped: cells.length - claimed, state }), { status: 200 });
        }
        return new Response(JSON.stringify({ error: "offline in tests" }), { status: 503 });
      }),
    );
    return calls;
  }

  it("a newcomer: Jax picks an open square and the join sheet opens to claim it", async () => {
    board.state = openBoard([player(HOST, "Jordan")]);
    await renderBoard();
    await act(async () => {
      fireEvent.click(screen.getByTestId("jax-pick"));
    });
    expect(await screen.findByTestId("join-name")).toBeInTheDocument();
    expect(screen.getAllByTestId("cell").filter((c) => c.dataset.state === "selected")).toHaveLength(1);
    expect(screen.getByText("Jax picked this one!")).toBeInTheDocument();
  });

  it("on the board: claims right away, and picks again when someone takes his square first", async () => {
    const me = identity.getPlayerId();
    const start = { ...openBoard([player(HOST, "Jordan"), player(MAYA, "Maya"), player(me, "Sam")]), squares: [] };
    board.state = start;
    const calls = claimServer((cells, call) => {
      const [cell] = cells;
      // The first pick loses the race to Maya; the second one lands.
      const owner = call === 1 ? MAYA : me;
      const prior = call === 1 ? [] : [{ ...calls[0][0], playerId: MAYA, claimedAt: 1 }];
      return { claimed: call === 1 ? 0 : 1, state: { ...start, squares: [...prior, { ...cell, playerId: owner, claimedAt: 2 }], version: call + 1 } };
    });
    await renderBoard();
    await act(async () => {
      fireEvent.click(screen.getByTestId("jax-pick"));
      await new Promise((r) => setTimeout(r, 30));
    });
    expect(calls).toHaveLength(2);
    expect(calls[0]).toHaveLength(1);
    expect(calls[1]).toHaveLength(1);
    expect(calls[1][0]).not.toEqual(calls[0][0]);
    expect(screen.queryByTestId("join-name")).toBeNull();
    expect(await screen.findByText("Jax picked this one!")).toBeInTheDocument();
  });

  it("isn't offered once I'm at the per-player max (full and locked boards: see jaxPick.test)", async () => {
    const me = identity.getPlayerId();
    const mine = [0, 1].map((col) => ({ row: 0, col, playerId: me, claimedAt: 0 }));
    board.state = { ...openBoard([player(HOST, "Jordan"), player(me, "Sam")]), squares: mine };
    board.state.game = { ...board.state.game, maxPerPlayer: 2 };
    await renderBoard();
    expect(screen.queryByTestId("jax-pick")).toBeNull();
  });
});

describe("GameView opened from an invite link", () => {
  it("paints the skeleton for a frame, then the board the page carried (no fetch)", async () => {
    board.state = openBoard([player(HOST, "Jordan")]);
    board.fromPage = true;
    render(
      <ToastProvider>
        <MemoryRouter initialEntries={["/g/brd123"]}>
          <Routes>
            <Route path="/g/:id" element={<GameView />} />
          </Routes>
        </MemoryRouter>
      </ToastProvider>,
    );
    expect(screen.getByLabelText("Loading board")).toBeInTheDocument();
    expect(screen.queryAllByTestId("cell")).toHaveLength(0);
    await act(async () => {
      await new Promise((r) => requestAnimationFrame(() => r(null)));
    });
    expect(screen.getAllByTestId("cell")).toHaveLength(100);
    expect(screen.queryByLabelText("Loading board")).toBeNull();
  });
});

