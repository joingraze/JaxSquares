// The club TV (/club/:clubId/tv#k=<token>): it goes round the club's boards
// every 20 seconds with the board TV's own screen, a winner on a board that
// isn't up takes the screen at once (with its celebration), the club stays in
// the corner, and a wrong or old link says so. The token only ever travels as
// a header; the page only has the boards' public state.

import { act, cleanup, render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CLUB_TV_ROTATE_MS, CLUB_TV_TOKEN_HEADER } from "../../shared/clubs";
import type { Activity, ClubBrand, ClubTvState, GameState, NumberDraw, Player, Square } from "../../shared/types";

const boards = new Map<string, GameState>();
const opened: string[] = [];
vi.mock("../lib/live", async (orig) => {
  const real = await orig<typeof import("../lib/live")>();
  return {
    ...real,
    // The board on screen: whatever the club TV primed for it (no socket in a test).
    useGame: (id: string | undefined) => {
      if (id && opened[opened.length - 1] !== id) opened.push(id);
      return {
        state: (id && boards.get(id)) || null,
        fromPage: false,
        loading: false,
        notFound: false,
        error: null,
        connection: "open",
        watching: 1,
        refresh: async () => {},
        receive: () => {},
        mutate: <T,>(request: () => Promise<T>) => request(),
      };
    },
    primeGame: (s: GameState) => void boards.set(s.game.id, s),
  };
});
vi.mock("../components/ui/confetti", () => ({ celebrate: vi.fn(), CELEBRATION_COLORS: [], prefersReducedMotion: () => true }));

const { default: ClubTvView, CLUB_TV_POLL_MS } = await import("./ClubTvView");

const CLUB: ClubBrand = { id: "0123456789abcdef", name: "The Rusty Anchor", hasLogo: false, logoVersion: null };
const TOKEN = "t".repeat(43);
const DRAW: NumberDraw = { x: [[0], [1], [2], [3], [4], [5], [6], [7], [8], [9]], y: [[9], [8], [7], [6], [5], [4], [3], [2], [1], [0]] };
const PLAYERS: Player[] = ["Maya", "Dre"].map((name, i) => ({ id: `${name.toLowerCase()}_public_id_00000`.slice(0, 22), name, color: "#ff6b35", emoji: "", joinedAt: 0, isHost: i === 0 }));
const squares: Square[] = Array.from({ length: 100 }, (_, i) => ({ row: Math.floor(i / 10), col: i % 10, playerId: PLAYERS[i % 2].id, claimedAt: 0 }));

function board(id: string, name: string, over: Partial<GameState> = {}, game: Partial<GameState["game"]> = {}): GameState {
  return {
    game: {
      id,
      name,
      sport: "football",
      league: "custom",
      teamX: { name: "Chiefs", abbr: "KC" },
      teamY: { name: "Bills", abbr: "BUF" },
      format: { periods: "quarters", reverse: false, boardSize: 100, freshNumbers: false },
      periods: [
        { key: "q1", label: "Q1" },
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
      club: CLUB,
      ...game,
    },
    players: PLAYERS,
    squares: [],
    scores: [],
    manualWinners: [],
    live: null,
    activity: [],
    version: 1,
    ...over,
  };
}

const winner: Activity = { id: "win-q1", type: "winner", actor: null, at: 5, data: { periodKey: "q1", label: "Q1", playerIds: [PLAYERS[1].id], cell: { row: 6, col: 7 } } };
/** Locked, Q1 in at 7–3: row 6, column 7 (square 67, Dre). */
const withWinner = (b: GameState): GameState => ({
  ...b,
  game: { ...b.game, status: "locked", numbers: { "*": DRAW }, lockedAt: 1 },
  squares,
  scores: [{ periodKey: "q1", scoreX: 7, scoreY: 3, source: "host", updatedAt: 2 }],
  activity: [winner],
});

let served: ClubTvState | null;
let status = 200;
const fetchMock = vi.fn<(url: string, init?: RequestInit) => Promise<Response>>(async () => (status === 200 && served ? Response.json(served) : Response.json({ error: "Not found" }, { status })));

function renderTv(hash = `#k=${TOKEN}`) {
  return render(
    <MemoryRouter initialEntries={[`/club/${CLUB.id}/tv${hash}`]} future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <Routes>
        <Route path="/club/:clubId/tv" element={<ClubTvView />} />
      </Routes>
    </MemoryRouter>,
  );
}

const flush = () => act(async () => void (await vi.advanceTimersByTimeAsync(0)));
const advance = (ms: number) => act(async () => void (await vi.advanceTimersByTimeAsync(ms)));
const onScreen = () => screen.getByTestId("club-tv").getAttribute("data-board");

beforeEach(() => {
  vi.useFakeTimers();
  boards.clear();
  opened.length = 0;
  status = 200;
  served = null;
  fetchMock.mockClear();
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("the club TV", () => {
  it("goes round the club's boards every 20 seconds, the club in the corner", async () => {
    served = { club: CLUB, active: true, boards: [board("aaa111", "Early Game"), board("bbb222", "Late Game")] };
    renderTv();
    await flush();
    // The token goes as a header, never in the URL.
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(`/api/clubs/${CLUB.id}/tv`);
    expect((init.headers as Record<string, string>)[CLUB_TV_TOKEN_HEADER]).toBe(TOKEN);
    expect(onScreen()).toBe("aaa111");
    expect(screen.getByTestId("club-tv-corner")).toHaveTextContent("The Rusty Anchor");
    expect(screen.getByTestId("club-tv-progress")).toHaveTextContent("Board 1 of 2");
    // The panel's own corner keeps the JaxSquares mark: the club is in the club TV's.
    expect(screen.getByTestId("tv-brand")).toBeInTheDocument();
    expect(screen.queryByTestId("tv-club")).toBeNull();

    await advance(CLUB_TV_ROTATE_MS);
    expect(onScreen()).toBe("bbb222");
    expect(screen.getByTestId("club-tv-progress")).toHaveTextContent("Board 2 of 2");
    await advance(CLUB_TV_ROTATE_MS);
    expect(onScreen()).toBe("aaa111");
    expect(opened).toEqual(["aaa111", "bbb222", "aaa111"]);
  });

  it("goes straight to a board whose winner just landed, and celebrates it", async () => {
    const early = board("aaa111", "Early Game");
    const late = board("bbb222", "Late Game", {}, { status: "locked", numbers: { "*": DRAW }, lockedAt: 1 });
    served = { club: CLUB, active: true, boards: [early, late] };
    renderTv();
    await flush();
    expect(onScreen()).toBe("aaa111");
    // Next poll: Q1's winner on the board that isn't up.
    served = { ...served, boards: [early, withWinner(late)] };
    await advance(CLUB_TV_POLL_MS);
    expect(onScreen()).toBe("bbb222");
    await flush();
    expect(screen.getByTestId("tv-celebrate")).toHaveTextContent("Dre");
  });

  it("takes no notice of winners that were there before it looked", async () => {
    served = { club: CLUB, active: true, boards: [board("aaa111", "Early Game"), withWinner(board("bbb222", "Late Game"))] };
    renderTv();
    await flush();
    await advance(CLUB_TV_POLL_MS);
    expect(onScreen()).toBe("aaa111");
    expect(screen.queryByTestId("tv-celebrate")).toBeNull();
  });

  it("says when there's nothing on, or the pass isn't active", async () => {
    served = { club: CLUB, active: true, boards: [] };
    const { unmount } = renderTv();
    await flush();
    expect(screen.getByTestId("club-tv")).toHaveAttribute("data-state", "empty");
    expect(screen.getByTestId("club-tv-title")).toHaveTextContent("The Rusty Anchor");
    unmount();
    served = { club: CLUB, active: false, boards: [] };
    renderTv();
    await flush();
    expect(screen.getByTestId("club-tv")).toHaveAttribute("data-state", "inactive");
    expect(screen.getByTestId("club-tv")).toHaveTextContent("while its Venue add-on is active");
  });

  it("says a wrong or old link doesn't work, and never asks without a token", async () => {
    status = 404;
    const { unmount } = renderTv();
    await flush();
    expect(screen.getByTestId("club-tv")).toHaveAttribute("data-state", "missing");
    expect(screen.getByText("This TV link doesn't work anymore")).toBeInTheDocument();
    unmount();
    fetchMock.mockClear();
    renderTv("");
    await flush();
    expect(fetchMock).not.toHaveBeenCalled();
    expect(screen.getByTestId("club-tv")).toHaveAttribute("data-state", "missing");
  });
});
