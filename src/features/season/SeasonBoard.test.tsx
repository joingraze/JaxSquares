// A season board's page and a season's game board, with the board state
// faked: before the draw (the season header, "Join the season", the planned
// schedule), mid-season (the game on now, played games with their winners,
// the standings and my place), the season's end (its top 3), and a game's
// board ("Game 2 of 3 · Office Season" with the games either side).

import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { GameState, Player, SeasonGame, SeasonState } from "../../../shared/types";

const board: { state: GameState | null } = { state: null };
vi.mock("../../lib/live", async (orig) => {
  const real = await orig<typeof import("../../lib/live")>();
  return {
    ...real,
    useGame: () => ({
      state: board.state,
      fromPage: false,
      loading: false,
      notFound: false,
      error: null,
      connection: "open",
      watching: 2,
      refresh: async () => {},
      receive: () => {},
      mutate: <T,>(request: () => Promise<T>) => request(),
    }),
    prefetchGame: async () => {},
  };
});
vi.mock("../../lib/native", async (orig) => {
  const real = await orig<typeof import("../../lib/native")>();
  return { ...real, haptic: vi.fn(async () => {}), shareLink: vi.fn(async () => "copied") };
});
vi.mock("../../components/ui/confetti", () => ({ celebrate: vi.fn(), CELEBRATION_COLORS: [], prefersReducedMotion: () => true }));
vi.mock("../recap/drawRecap", () => ({ renderRecap: async () => new Blob(["png"], { type: "image/png" }) }));

const identity = await import("../../lib/identity");
const { ToastProvider } = await import("../../components/ui");
const { default: GameView } = await import("../../pages/GameView");
await Promise.all([import("../invite/JoinSheet"), import("../invite/InviteSheet")]);

const HOST = "host_public_id_000000";
const MAYA = "maya_public_id_000000";
const HOUR = 3_600_000;
const DAY = 24 * HOUR;
const NOW = Date.now();
const player = (id: string, name: string): Player => ({ id, name, color: "#ff6b35", emoji: "🔥", joinedAt: 0, isHost: id === HOST });
const JAX = { id: "30", name: "Jacksonville Jaguars", shortName: "Jaguars", abbr: "JAX", color: "#006778" };
const OPP = { name: "Opponent", abbr: "OPP" };

function seasonGame(index: number, over: Partial<SeasonGame>): SeasonGame {
  return {
    id: null,
    eventId: `e${index}`,
    index,
    startsAt: NOW + index * 7 * DAY,
    teamX: { name: "Jacksonville Jaguars", abbr: "JAX", color: "#006778" },
    teamY: { name: "Miami Dolphins", abbr: "MIA", color: "#008e97" },
    status: "planned",
    live: null,
    score: null,
    winners: [],
    ...over,
  };
}

function seasonState(status: "open" | "locked" | "final", season: Partial<SeasonState>, players: Player[], squares: GameState["squares"] = []): GameState {
  return {
    game: {
      id: "sea123",
      name: "Office Season",
      kind: "season",
      sport: "football",
      league: "nfl",
      teamX: { name: JAX.name, abbr: JAX.abbr, color: JAX.color },
      teamY: OPP,
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
      status,
      linkedEvent: null,
      hostPlayerId: HOST,
      createdAt: 0,
      lockedAt: status === "open" ? null : NOW - 10 * DAY,
    },
    players,
    squares,
    scores: [],
    manualWinners: [],
    live: null,
    activity: [],
    version: 1,
    season: {
      scope: "team",
      numbers: "same",
      league: "nfl",
      team: JAX,
      year: 2026,
      label: "Jaguars 2026 season",
      games: [],
      standings: [],
      ...season,
    },
  };
}

beforeEach(() => {
  cleanup();
  localStorage.clear();
  vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ error: "offline in tests" }), { status: 503 })));
});

async function renderAt(path: string) {
  render(
    <ToastProvider>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="/g/:id" element={<GameView />} />
        </Routes>
      </MemoryRouter>
    </ToastProvider>,
  );
  await act(async () => {});
}

describe("a season board", () => {
  it("before the draw: the season, Join the season, the squares first, the schedule's planned games", async () => {
    board.state = seasonState("open", { games: [seasonGame(1, {}), seasonGame(2, {}), seasonGame(3, { playoff: true, label: "Wild Card" })] }, [player(HOST, "Jordan")]);
    await renderAt("/g/sea123");

    const header = screen.getByTestId("season-header");
    expect(within(header).getByTestId("season-label")).toHaveTextContent("Jaguars 2026 season");
    expect(header).toHaveTextContent("3 games so far · Same numbers all season");
    expect(within(header).getByTestId("season-featured")).toHaveTextContent("First game");
    expect(within(header).getByTestId("season-join")).toHaveTextContent("Join the season");
    // Squares first while they're picked.
    expect(screen.getByTestId("season-tab-squares")).toHaveAttribute("aria-checked", "true");
    expect(screen.getAllByTestId("cell").length).toBe(100);

    fireEvent.click(screen.getByTestId("season-tab-schedule"));
    const schedule = screen.getByTestId("season-schedule");
    expect(schedule).toHaveTextContent("Each game gets its own board when the numbers are drawn. Playoff games join as they're scheduled.");
    const rows = within(schedule).getAllByTestId("season-game");
    expect(rows.map((r) => r.getAttribute("data-status"))).toEqual(["planned", "planned", "planned"]);
    expect(rows[2]).toHaveTextContent("Playoffs");
    expect(rows[2]).toHaveTextContent("Wild Card");
    expect(rows[1]).toHaveTextContent("Board made at the draw");
    // The grid is out of the way on the schedule.
    expect(screen.getAllByTestId("cell")[0]).not.toBeVisible();
  });

  it("mid-season: the game on now, played games with winners and my win, the standings and my place", async () => {
    const me = identity.getPlayerId();
    const games = [
      seasonGame(1, {
        id: "c1",
        startsAt: NOW - 7 * DAY,
        status: "final",
        live: "post",
        score: { scoreX: 24, scoreY: 17, label: "Final" },
        winners: [
          { periodKey: "q1", label: "Q1", playerIds: [me] },
          { periodKey: "final", label: "Final", playerIds: [MAYA] },
        ],
      }),
      seasonGame(2, { id: "c2", startsAt: NOW - HOUR, status: "locked", live: "in", score: { scoreX: 7, scoreY: 3, label: "Q2 4:12" } }),
      seasonGame(3, { id: "c3", startsAt: NOW + 6 * DAY, status: "locked" }),
    ];
    board.state = seasonState(
      "locked",
      {
        games,
        standings: [
          { playerId: me, rank: 1, wins: 1, games: 1, amount: null },
          { playerId: MAYA, rank: 1, wins: 1, games: 1, amount: null },
          { playerId: HOST, rank: 3, wins: 0, games: 0, amount: null },
        ],
      },
      [player(HOST, "Jordan"), player(MAYA, "Maya Lin"), player(me, "Sam")],
      [{ row: 0, col: 0, playerId: me, claimedAt: 0 }],
    );
    await renderAt("/g/sea123");

    expect(screen.getByTestId("season-featured")).toHaveTextContent("On now");
    expect(screen.getByTestId("season-featured")).toHaveAttribute("href", "/g/c2");
    expect(screen.getByTestId("season-my-place")).toHaveTextContent("You're tied 1st of 3");
    // Drawn: the schedule first.
    expect(screen.getByTestId("season-tab-schedule")).toHaveAttribute("aria-checked", "true");
    const rows = screen.getAllByTestId("season-game");
    // On now, then coming up, then played.
    expect(rows.map((r) => r.getAttribute("href"))).toEqual(["/g/c2", "/g/c3", "/g/c1"]);
    expect(rows[2]).toHaveTextContent("Q1 You · Final Maya");
    expect(within(rows[2]).getByTestId("season-game-won")).toHaveTextContent("You won");
    expect(within(rows[0]).queryByTestId("season-game-won")).toBeNull();

    fireEvent.click(screen.getByTestId("season-tab-standings"));
    const standings = screen.getAllByTestId("season-standing");
    expect(standings.map((r) => r.getAttribute("data-rank"))).toEqual(["1", "1", "3"]);
    expect(standings[0]).toHaveTextContent("SamYou");
    expect(standings[0]).toHaveTextContent("1 win in 1 game");
    expect(standings[2]).toHaveTextContent("No wins yet");
    // Not over: no top 3 yet.
    expect(screen.queryByTestId("season-podium")).toBeNull();
  });

  it("once the season's over, the standings lead with its top 3", async () => {
    const games = [seasonGame(1, { id: "c1", status: "final", startsAt: NOW - 14 * DAY, winners: [{ periodKey: "final", label: "Final", playerIds: [MAYA] }] })];
    board.state = seasonState(
      "final",
      {
        games,
        standings: [
          { playerId: MAYA, rank: 1, wins: 3, games: 2, amount: null },
          { playerId: HOST, rank: 2, wins: 1, games: 1, amount: null },
        ],
      },
      [player(HOST, "Jordan"), player(MAYA, "Maya Lin")],
    );
    await renderAt("/g/sea123");
    fireEvent.click(screen.getByTestId("season-tab-standings"));
    const places = within(screen.getByTestId("season-podium")).getAllByTestId("season-podium-place");
    expect(places.map((p) => p.textContent?.replace("🔥", ""))).toEqual(["Maya1st · 3 wins", "Jordan2nd · 1 win"]);
  });
});

describe("a season's game board", () => {
  it("says which game of how many, links back to the season and to the games either side", async () => {
    const state = seasonState("locked", {}, [player(HOST, "Jordan")]);
    delete state.season;
    state.game = { ...state.game, id: "c2", kind: undefined, seasonId: "sea123", name: "Office Season · MIA @ JAX", teamY: { name: "Miami Dolphins", abbr: "MIA" } };
    state.seasonGame = { id: "sea123", name: "Office Season", index: 2, count: 3, prevId: "c1", nextId: null };
    board.state = state;
    await renderAt("/g/c2");

    const nav = screen.getByTestId("season-nav");
    expect(within(nav).getByTestId("season-nav-season")).toHaveTextContent("Game 2 of 3 · Office Season");
    expect(within(nav).getByTestId("season-nav-season")).toHaveAttribute("href", "/g/sea123");
    expect(within(nav).getByTestId("season-nav-prev")).toHaveAttribute("href", "/g/c1");
    expect(within(nav).getByTestId("season-nav-next")).toHaveAttribute("data-disabled");
    // A game's board isn't a season board: no season header or tabs.
    expect(screen.queryByTestId("season-header")).toBeNull();
    expect(screen.queryByTestId("season-tabs")).toBeNull();
  });
});
