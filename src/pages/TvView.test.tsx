// TV mode (/g/:id/tv): a locked board with a winner, an open board with the
// QR code, the winner celebration, and the big-screen plumbing (wake lock,
// its own theme, the auto-hiding toolbar). Read-only: no join, no claim, no
// admin token.

import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Activity, GameFormat, GameState, MomentRule, NumberDraw, Player, Square } from "../../shared/types";
import indexHtml from "../../index.html?raw";
import type { ActivityListener } from "../lib/live";

const board: { state: GameState | null; notFound?: boolean; onActivity?: ActivityListener } = { state: null };
vi.mock("../lib/live", async (orig) => {
  const real = await orig<typeof import("../lib/live")>();
  return {
    ...real,
    useGame: (_id: string | undefined, opts: { onActivity?: ActivityListener } = {}) => {
      board.onActivity = opts.onActivity;
      return {
        state: board.state,
        fromPage: false,
        loading: false,
        notFound: !!board.notFound,
        error: null,
        connection: "open",
        watching: 3,
        refresh: async () => {},
        receive: () => {},
        mutate: <T,>(request: () => Promise<T>) => request(),
      };
    },
  };
});
const celebrate = vi.fn();
vi.mock("../components/ui/confetti", () => ({ celebrate: (...a: unknown[]) => celebrate(...a), CELEBRATION_COLORS: [], prefersReducedMotion: () => false }));

const theme = await import("../lib/theme");
const { inviteUrl } = await import("../lib/api");
const { displayLink } = await import("../features/invite/inviteModel");
const { setTvTheme, IDLE_MS } = await import("../features/tv/screen");
const { default: TvView, CELEBRATE_MS } = await import("./TvView");

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
const PLAYERS: Player[] = ["Maya", "Dre", "Kim"].map((name, i) => ({ id: `${name.toLowerCase()}_public_id_00000`.slice(0, 22), name, color: ["#ff6b35", "#4dabf7", "#da77f2"][i], emoji: "", joinedAt: 0, isHost: i === 0 }));
const squares = (n: number): Square[] => Array.from({ length: n }, (_, i) => ({ row: Math.floor(i / 10), col: i % 10, playerId: PLAYERS[i % 3].id, claimedAt: 0 }));

function makeState(over: Partial<GameState["game"]> = {}, rest: Partial<GameState> = {}): GameState {
  return {
    game: {
      id: "tv1234",
      name: "Sunday Night Squares",
      sport: "football",
      league: "custom",
      teamX: { name: "Chiefs", abbr: "KC", color: "#e31837" },
      teamY: { name: "Bills", abbr: "BUF", color: "#00338d" },
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
      ...over,
    },
    players: PLAYERS,
    squares: squares(58),
    scores: [],
    manualWinners: [],
    live: null,
    activity: [],
    version: 1,
    ...rest,
  };
}

/** Locked, Q1 in at 7–3 (row 6, column 7: square 67 -> Dre). */
const lockedWithWinner = () =>
  makeState({ status: "locked", numbers: { "*": DRAW }, lockedAt: 1 }, { squares: squares(100), scores: [{ periodKey: "q1", scoreX: 7, scoreY: 3, source: "host", updatedAt: 2 }] });

function renderTv(path = "/g/tv1234/tv") {
  return render(
    <MemoryRouter initialEntries={[path]} future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <Routes>
        <Route path="/g/:id/tv" element={<TvView />} />
        <Route path="/g/:id" element={<p>Board screen</p>} />
      </Routes>
    </MemoryRouter>,
  );
}

const fetchSpy = vi.fn<(url: string, init?: RequestInit) => Promise<Response>>(async () => new Response("{}", { status: 503 }));

beforeEach(() => {
  board.state = null;
  board.notFound = false;
  celebrate.mockClear();
  localStorage.clear();
  setTvTheme("dark");
  vi.stubGlobal("fetch", fetchSpy);
  fetchSpy.mockClear();
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("TV mode", () => {
  it("shows a locked board with its winner, the score and the square in play, read-only", () => {
    board.state = lockedWithWinner();
    renderTv();

    expect(screen.getByTestId("tv-game")).toBeInTheDocument();
    expect(screen.queryByTestId("tv-qr")).toBeNull();
    expect(screen.getByTestId("tv-score-x")).toHaveTextContent("7");
    expect(screen.getByTestId("tv-score-y")).toHaveTextContent("3");

    // Winners so far: the moment's label as the board shows it (amounts are in-app) and the winner's name.
    const row = screen.getByTestId("tv-winner");
    expect(within(row).getByTestId("tv-winner-label")).toHaveTextContent("Q1 · $200");
    expect(row).toHaveTextContent("Dre");
    expect(row).toHaveTextContent("7–3");
    expect(row).toHaveTextContent("Loser buys wings");

    // The board: every square named, the Q1 square gold, and the square in play (Half, if it stays 7–3) lit.
    const cells = screen.getAllByTestId("tv-cell");
    expect(cells).toHaveLength(100);
    const q1 = cells.find((c) => c.dataset.row === "6" && c.dataset.col === "7")!;
    expect(q1.dataset.state).toBe("winner");
    expect(q1).toHaveTextContent("Dre");
    expect(cells.filter((c) => c.dataset.live === "true")).toEqual([q1]);
    expect(screen.getByTestId("tv-now")).toHaveTextContent("Right now · Half");
    expect(screen.getByTestId("tv-upcoming")).toHaveTextContent("Final");

    // Nothing to tap on the board, and nothing that joins or claims.
    expect(screen.getByTestId("tv-board").querySelector("button")).toBeNull();
    expect(screen.queryByTestId("claim-submit")).toBeNull();
    expect(screen.queryByTestId("join-name")).toBeNull();
  });

  it("puts a big QR code to the invite link on an open board, and never asks for the admin token", () => {
    board.state = makeState();
    renderTv();

    const link = displayLink(inviteUrl("tv1234"));
    expect(screen.getByTestId("tv-open")).toHaveTextContent("Scan to grab a square");
    expect(screen.getByTestId("tv-link")).toHaveTextContent(link);
    expect(within(screen.getByTestId("tv-qr")).getByRole("img")).toHaveAccessibleName(`QR code: open ${link} to grab a square`);
    expect(screen.getByTestId("tv-open")).toHaveTextContent("42 of 100 squares left");
    expect(screen.getByTestId("tv-open")).toHaveTextContent("$10 a square");
    expect(screen.getByTestId("tv-predraw")).toHaveTextContent("Numbers get drawn when the host locks the board");
    // Names (or initials) in the claimed squares; open ones are empty.
    const cells = screen.getAllByTestId("tv-cell");
    expect(cells[0]).toHaveTextContent("Maya");
    expect(cells.filter((c) => c.dataset.state === "empty")).toHaveLength(42);
    for (const [, init] of fetchSpy.mock.calls as unknown as [string, RequestInit | undefined][]) {
      expect(JSON.stringify(init?.headers ?? {})).not.toContain("x-admin-token");
    }
  });

  it("spells out a venue board's prizes and house rules for the room, and keeps them up once the game's on", () => {
    const club = { id: "club1", name: "The Rusty Anchor", hasLogo: false, logoVersion: null };
    const rules: MomentRule[] = [
      { moment: "q1", square: { amount: null, note: "Free appetizer" }, reverse: null },
      { moment: "q2", square: { amount: null, note: "" }, reverse: null },
      { moment: "final", square: { amount: null, note: "Team jersey" }, reverse: { amount: null, note: "Pint glass" } },
    ];
    const format: GameFormat = { ...FORMAT, rules, squarePrice: null, houseRules: ["Must be present to win", "21+ only"], claimCodes: true };
    board.state = makeState({ format, club });
    const { unmount } = renderTv();

    const details = screen.getByTestId("tv-details");
    expect(screen.getAllByTestId("tv-prize").map((r) => r.textContent)).toEqual(["Q1Free appetizer", "FinalTeam jersey · Reverse Pint glass"]);
    expect(within(details).getByTestId("tv-house-rules")).toHaveTextContent("Must be present to win21+ onlyWinners show staff the winning pass on their phone to collect.");
    expect(screen.getByTestId("tv-venue")).toHaveTextContent("Free to play · No purchase necessaryPrizes from The Rusty Anchor");
    unmount();

    // Q1 in: the winner's row says what they won, the next moments their prizes, and the house rules stay in a line.
    board.state = makeState({ format, club, status: "locked", numbers: { "*": DRAW }, lockedAt: 1 }, { squares: squares(100), scores: [{ periodKey: "q1", scoreX: 7, scoreY: 3, source: "host", updatedAt: 2 }] });
    renderTv();
    expect(screen.getByTestId("tv-winner-label")).toHaveTextContent("Q1 · Free appetizer");
    expect(screen.getByTestId("tv-upcoming")).toHaveTextContent("Team jersey");
    expect(screen.getByTestId("tv-house-line")).toHaveTextContent("Must be present to win · 21+ only · Winners show staff the winning pass on their phone to collect.");
    expect(screen.getByTestId("tv-house-line")).toHaveTextContent("Prizes from The Rusty Anchor");

    // The winner's card says the code is on their phone; no code is ever on the TV.
    act(() =>
      board.onActivity?.(
        { id: "act-q1", type: "winner", actor: null, data: { periodKey: "q1", label: "Q1", playerIds: [PLAYERS[1].id], cell: { row: 6, col: 7 }, prize: "Free appetizer" }, at: 3 },
        board.state!,
      ),
    );
    expect(screen.getByTestId("tv-celebrate-prize")).toHaveTextContent("Free appetizer");
    expect(screen.getByTestId("tv-celebrate-claim")).toHaveTextContent("Your winning pass is on your phone");
    expect(screen.queryByTestId("claim-code")).toBeNull();
    expect(screen.queryByTestId("winner-code")).toBeNull();
  });

  it("shows only what the host picked: no right now, winners or still to play, no amounts", () => {
    board.state = lockedWithWinner();
    board.state.game.tv = { now: false, winners: false, upcoming: false, amounts: false };
    renderTv();
    expect(screen.getByTestId("tv-game")).toBeInTheDocument();
    expect(screen.queryByTestId("tv-now")).toBeNull();
    expect(screen.queryByTestId("tv-winner")).toBeNull();
    expect(screen.queryByTestId("tv-upcoming")).toBeNull();
    expect(screen.getByTestId("tv-game")).not.toHaveTextContent("$");
    // Nobody but the host gets the Display button.
    expect(screen.queryByTestId("tv-display-open")).toBeNull();
  });

  it("lets the host pick what shows from the TV's own Display button, for every TV", async () => {
    board.state = makeState();
    localStorage.setItem("jaxsquares.admin.tv1234", "admin-tv");
    const saved: unknown[] = [];
    fetchSpy.mockImplementation(async (url: string, init?: RequestInit) => {
      if (String(url).endsWith("/api/games/tv1234") && init?.method === "PATCH") {
        const body = JSON.parse(String(init.body)) as { tv: Record<string, boolean> };
        saved.push(body);
        return new Response(JSON.stringify({ state: { ...board.state!, game: { ...board.state!.game, tv: body.tv } } }), { status: 200 });
      }
      return new Response("{}", { status: 503 });
    });
    renderTv();
    expect(screen.getAllByTestId("tv-prize").length).toBeGreaterThan(0);
    fireEvent.click(screen.getByTestId("tv-display-open"));
    const prizes = within(screen.getByTestId("tv-display-prizes").closest("li")!).getByRole("switch");
    expect(prizes).toBeChecked();
    await act(async () => void fireEvent.click(prizes));
    expect(saved).toEqual([{ tv: { prizes: false } }]);
    const [, init] = fetchSpy.mock.calls.find(([, i]) => i?.method === "PATCH")!;
    expect(JSON.stringify(init?.headers)).toContain("admin-tv");
    // Free to play is off by default on a board with a square price, and can't be turned on there.
    expect(within(screen.getByTestId("tv-display-freeToPlay").closest("li")!).getByRole("switch")).toBeDisabled();
  });

  it("celebrates a winner landing (Jax cheers, confetti), then goes back to the board", () => {
    vi.useFakeTimers();
    board.state = lockedWithWinner();
    renderTv();
    expect(screen.queryByTestId("tv-celebrate")).toBeNull();

    const winner: Activity = {
      id: "act-q1",
      type: "winner",
      actor: null,
      data: { periodKey: "q1", label: "Q1", playerIds: [PLAYERS[1].id], cell: { row: 6, col: 7 }, prize: "Loser buys wings" },
      at: 3,
    };
    act(() => board.onActivity?.(winner, board.state!));
    const card = screen.getByTestId("tv-celebrate");
    expect(card).toHaveTextContent("Q1 winner");
    expect(card).toHaveTextContent("Dre");
    expect(card).toHaveTextContent("$200");
    expect(card).toHaveTextContent("KC 7 – 3 BUF");
    expect(screen.getByTestId("tv-celebrate-prize")).toHaveTextContent("Loser buys wings");
    expect(screen.queryByTestId("tv-celebrate-claim")).toBeNull();
    expect(celebrate).toHaveBeenCalledWith("win");
    expect(document.querySelector('[data-testid="jax-cheer"]')).not.toBeNull();

    // The same winner twice (socket + poll) celebrates once; anything else doesn't celebrate at all.
    act(() => board.onActivity?.(winner, board.state!));
    act(() => board.onActivity?.({ ...winner, id: "act-s", type: "score" }, board.state!));
    act(() => void vi.advanceTimersByTime(CELEBRATE_MS + 50));
    expect(screen.queryByTestId("tv-celebrate")).toBeNull();
  });

  it("keeps the screen awake, and takes the lock again when the page comes back", async () => {
    const sentinel = { released: false, release: vi.fn(async () => void (sentinel.released = true)), addEventListener: vi.fn() };
    const request = vi.fn(async () => sentinel);
    Object.defineProperty(navigator, "wakeLock", { value: { request }, configurable: true });
    try {
      board.state = makeState();
      const { unmount } = renderTv();
      await act(async () => {});
      expect(request).toHaveBeenCalledWith("screen");

      // The browser drops the lock while hidden; back on screen it's taken again.
      sentinel.released = true;
      await act(async () => void document.dispatchEvent(new Event("visibilitychange")));
      expect(request).toHaveBeenCalledTimes(2);

      sentinel.released = false;
      unmount();
      expect(sentinel.release).toHaveBeenCalled();
    } finally {
      Reflect.deleteProperty(navigator, "wakeLock");
    }
  });

  it("is dark by default whatever the device's Appearance, switches to light on its own, and gives the theme back on exit", () => {
    theme.setThemePreference("light");
    board.state = makeState();
    const { unmount } = renderTv();
    expect(document.documentElement.dataset.theme).toBe("dark");

    fireEvent.click(screen.getByTestId("tv-theme"));
    expect(document.documentElement.dataset.theme).toBe("light");
    expect(localStorage.getItem("jaxsquares.tvTheme")).toBe("light");
    // The device's own choice is untouched.
    expect(theme.getThemePreference()).toBe("light");

    fireEvent.click(screen.getByTestId("tv-theme"));
    expect(document.documentElement.dataset.theme).toBe("dark");
    unmount();
    expect(document.documentElement.dataset.theme).toBe("light");
    theme.setThemePreference("system");
  });

  it("hides the toolbar when nobody's touching anything, and shows it on any key or touch", () => {
    vi.useFakeTimers();
    board.state = makeState();
    renderTv();
    const bar = screen.getByTestId("tv-toolbar");
    expect(bar.dataset.awake).toBe("true");
    act(() => void vi.advanceTimersByTime(IDLE_MS + 10));
    expect(bar.dataset.awake).toBe("false");
    expect(screen.getByTestId("tv-view").dataset.awake).toBe("false");
    act(() => void fireEvent.keyDown(window, { key: "ArrowDown" }));
    expect(bar.dataset.awake).toBe("true");
  });

  it("offers full screen where the browser can, and Exit goes back to the board", () => {
    const requestFullscreen = vi.fn(async () => {});
    Object.defineProperty(document, "fullscreenEnabled", { value: true, configurable: true });
    Object.defineProperty(document.documentElement, "requestFullscreen", { value: requestFullscreen, configurable: true });
    try {
      board.state = makeState();
      renderTv();
      fireEvent.click(screen.getByTestId("tv-fullscreen"));
      expect(requestFullscreen).toHaveBeenCalled();
      fireEvent.click(screen.getByTestId("tv-exit"));
      expect(screen.getByText("Board screen")).toBeInTheDocument();
    } finally {
      Reflect.deleteProperty(document, "fullscreenEnabled");
      Reflect.deleteProperty(document.documentElement, "requestFullscreen");
    }
  });

  it("says so when the board is gone", () => {
    board.notFound = true;
    renderTv();
    expect(screen.getByText("Jax looked everywhere")).toBeInTheDocument();
    expect(screen.getByTestId("tv-exit")).toBeInTheDocument();
  });
});

describe("TV mode before first paint (index.html)", () => {
  const boot = /<script id="theme-boot">([\s\S]*?)<\/script>/.exec(indexHtml)?.[1] ?? "";

  afterEach(() => window.history.replaceState(null, "", "/"));

  it("paints a TV view dark even on a light-theme device, unless light was picked on that screen", () => {
    localStorage.setItem("jaxsquares.theme", "light");
    window.history.replaceState(null, "", "/g/tv1234/tv");
    new Function(boot)();
    expect(document.documentElement.dataset.theme).toBe("dark");

    localStorage.setItem("jaxsquares.tvTheme", "light");
    new Function(boot)();
    expect(document.documentElement.dataset.theme).toBe("light");

    // Anywhere else, the device's own choice.
    localStorage.removeItem("jaxsquares.tvTheme");
    window.history.replaceState(null, "", "/g/tv1234");
    new Function(boot)();
    expect(document.documentElement.dataset.theme).toBe("light");
  });
});
