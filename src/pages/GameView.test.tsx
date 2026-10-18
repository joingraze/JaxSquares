// The board on the host's second device (opened from the host link): it holds the
// admin token but has its own player id, so it isn't on the player list. It's the
// host's own board, not an invite: no "<host> invited you" hero, and tapping a
// square doesn't throw them into the join sheet.

import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
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

  /** Taps "Let Jax pick", picks `count` in the "How many squares?" sheet and confirms. */
  async function askJax(count: number) {
    await act(async () => {
      fireEvent.click(screen.getByTestId("jax-pick"));
    });
    await screen.findByTestId("jax-count-sheet");
    const chip = screen.getAllByTestId("jax-count-chip").find((c) => c.dataset.count === String(count))!;
    await act(async () => {
      fireEvent.click(chip);
    });
    expect(screen.getByTestId("jax-count-confirm")).toHaveTextContent(`Pick ${count} square`);
    await act(async () => {
      fireEvent.click(screen.getByTestId("jax-count-confirm"));
      await new Promise((r) => setTimeout(r, 30));
    });
  }

  it("a newcomer: asks how many, picks them and opens the join sheet to claim them", async () => {
    board.state = openBoard([player(HOST, "Jordan")]);
    await renderBoard();
    await askJax(3);
    expect(await screen.findByTestId("join-name")).toBeInTheDocument();
    expect(screen.getAllByTestId("cell").filter((c) => c.dataset.state === "selected")).toHaveLength(3);
    expect(screen.getByText("Jax picked 3 squares!")).toBeInTheDocument();
  });

  it("offers only as many as I'm allowed, and skips the question when that's one", async () => {
    const me = identity.getPlayerId();
    const mine = [0, 1, 2].map((col) => ({ row: 0, col, playerId: me, claimedAt: 0 }));
    board.state = { ...openBoard([player(HOST, "Jordan"), player(me, "Sam")]), squares: mine };
    board.state.game = { ...board.state.game, maxPerPlayer: 5 };
    await renderBoard();
    await act(async () => {
      fireEvent.click(screen.getByTestId("jax-pick"));
    });
    const counts = (await screen.findAllByTestId("jax-count-chip")).map((c) => c.textContent);
    expect(counts).toEqual(["1", "2"]);
    cleanup();

    // At one square from my max: no question, Jax just picks it.
    const calls = claimServer((cells) => ({ claimed: 1, state: { ...board.state!, squares: [...board.state!.squares, { ...cells[0], playerId: me, claimedAt: 2 }] } }));
    board.state = { ...board.state, game: { ...board.state.game, maxPerPlayer: 4 } };
    await renderBoard();
    await act(async () => {
      fireEvent.click(screen.getByTestId("jax-pick"));
      await new Promise((r) => setTimeout(r, 30));
    });
    expect(screen.queryByTestId("jax-count-sheet")).toBeNull();
    expect(calls).toHaveLength(1);
    expect(calls[0]).toHaveLength(1);
  });

  it("on the board: claims all of them at once, and replaces any someone takes first", async () => {
    const me = identity.getPlayerId();
    const start = { ...openBoard([player(HOST, "Jordan"), player(MAYA, "Maya"), player(me, "Sam")]), squares: [] };
    board.state = start;
    const calls = claimServer((cells, call) => {
      // First call: Maya beats Jax to the first of his 3 picks. Second call: the replacement lands.
      if (call === 1) {
        const [lost, ...won] = cells;
        return {
          claimed: won.length,
          state: { ...start, squares: [{ ...lost, playerId: MAYA, claimedAt: 1 }, ...won.map((c) => ({ ...c, playerId: me, claimedAt: 2 }))], version: 2 },
        };
      }
      const prior = [{ ...calls[0][0], playerId: MAYA, claimedAt: 1 }, ...calls[0].slice(1).map((c) => ({ ...c, playerId: me, claimedAt: 2 }))];
      return { claimed: cells.length, state: { ...start, squares: [...prior, ...cells.map((c) => ({ ...c, playerId: me, claimedAt: 3 }))], version: 3 } };
    });
    await renderBoard();
    await askJax(3);
    expect(calls.map((c) => c.length)).toEqual([3, 1]);
    const firstKeys = calls[0].map((c) => `${c.row},${c.col}`);
    expect(new Set(firstKeys).size).toBe(3);
    expect(firstKeys).not.toContain(`${calls[1][0].row},${calls[1][0].col}`);
    expect(screen.queryByTestId("join-name")).toBeNull();
    expect(await screen.findByText("Jax picked 3 squares!")).toBeInTheDocument();
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
    await askJax(1);
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


describe("light/dark from the board", () => {
  it("flips the theme from the top bar and saves it", async () => {
    const { getResolvedTheme, getThemePreference } = await import("../lib/theme");
    board.state = openBoard([player(HOST, "Jordan")]);
    await renderBoard();

    const toggle = screen.getByTestId("board-theme-toggle");
    const start = getResolvedTheme();
    const other = start === "dark" ? "light" : "dark";
    expect(toggle).toHaveAccessibleName(`Switch to ${other} mode`);

    await act(async () => fireEvent.click(toggle));
    expect(getThemePreference()).toBe(other);
    expect(document.documentElement.dataset.theme).toBe(other);
    expect(localStorage.getItem("jaxsquares.theme")).toBe(other);
    expect(screen.getByTestId("board-theme-toggle")).toHaveAccessibleName(`Switch to ${start} mode`);

    await act(async () => fireEvent.click(screen.getByTestId("board-theme-toggle")));
    expect(getThemePreference()).toBe(start);
  });
});

describe("?invite=1 after creating a board", () => {
  function renderAt(path: string) {
    render(
      <ToastProvider>
        <MemoryRouter initialEntries={[path]}>
          <Routes>
            <Route path="/g/:id" element={<GameView />} />
          </Routes>
        </MemoryRouter>
      </ToastProvider>,
    );
  }

  it("opens the invite sheet for the host", async () => {
    board.state = openBoard([player(HOST, "Jordan")]);
    identity.saveAdminToken("brd123", "admin-token");
    renderAt("/g/brd123?invite=1");
    expect(await screen.findByTestId("invite-share")).toBeInTheDocument();
  });

  it("doesn't, for a friend sent that exact URL", async () => {
    board.state = openBoard([player(HOST, "Jordan")]);
    renderAt("/g/brd123?invite=1");
    await act(async () => {});
    expect(screen.getByText(/invited you/)).toBeInTheDocument();
    expect(screen.queryByTestId("invite-share")).toBeNull();
  });
});
