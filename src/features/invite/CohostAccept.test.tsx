// Opening a co-host invite link (/g/<id>?cohost=<token>): the board asks
// "Become a co-host of <board>?", accepts (joining first when needed), says so
// when the link can't be used, and never asks the host about their own link.
// The token leaves the address bar at once.

import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { GameState, Player } from "../../../shared/types";

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
  };
});
vi.mock("../../lib/native", async (orig) => {
  const real = await orig<typeof import("../../lib/native")>();
  return { ...real, haptic: vi.fn(async () => {}), shareLink: vi.fn(async () => "copied") };
});
vi.mock("../../components/ui/confetti", () => ({ celebrate: vi.fn(), CELEBRATION_COLORS: [], prefersReducedMotion: () => true }));

const identity = await import("../../lib/identity");
const { ToastProvider } = await import("../../components/ui");
const { loadHostTools } = await import("../host/hostTools");
const { default: GameView } = await import("../../pages/GameView");
await Promise.all([loadHostTools(), import("./JoinSheet"), import("./InviteSheet"), import("./CohostAcceptSheet")]);

const HOST = "host_public_id_000000";
const TOKEN = "Tk".repeat(21) + "x";
const player = (id: string, name: string): Player => ({ id, name, color: "#ff6b35", emoji: "🔥", joinedAt: 0, isHost: id === HOST });

function boardWith(players: Player[], cohostIds: string[] = []): GameState {
  return {
    game: {
      id: "brd123",
      name: "Office Pool",
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
      cohostIds,
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

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

/** The API as the board sees it: `routes` by path suffix, everything else offline. */
function server(routes: Record<string, () => Response>) {
  const fetchMock = vi.fn<(url: string, init?: RequestInit) => Promise<Response>>(async (url) => {
    for (const [suffix, respond] of Object.entries(routes)) if (String(url).endsWith(suffix)) return respond();
    return json({ error: "offline in tests" }, 503);
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

const callsTo = (fetchMock: ReturnType<typeof server>, suffix: string) =>
  fetchMock.mock.calls.filter(([url]) => String(url).endsWith(suffix)).map(([, init]) => init ?? {});

function Search() {
  return <output data-testid="search">{useLocation().search}</output>;
}

async function openLink(token = TOKEN) {
  render(
    <ToastProvider>
      <MemoryRouter initialEntries={[`/g/brd123?cohost=${token}`]}>
        <Routes>
          <Route
            path="/g/:id"
            element={
              <>
                <GameView />
                <Search />
              </>
            }
          />
        </Routes>
      </MemoryRouter>
    </ToastProvider>,
  );
  await act(async () => {});
}

beforeEach(() => {
  localStorage.clear();
});

describe("a co-host invite link", () => {
  it("asks a player on the board, and accepting makes them a co-host", async () => {
    const me = identity.getPlayerId();
    board.state = boardWith([player(HOST, "Jordan"), player(me, "Ana")]);
    const fetchMock = server({ "/cohosts/accept": () => json({ state: boardWith(board.state!.players, [me]) }) });
    await openLink();
    // The token is out of the address bar straight away.
    expect(screen.getByTestId("search")).toHaveTextContent(/^$/);
    expect(await screen.findByRole("heading", { name: "Become a co-host of Office Pool?" })).toBeInTheDocument();
    expect(screen.getByText("Jordan invited you to help run this board.")).toBeInTheDocument();
    expect(screen.getByText(/Jordan stays the host\./)).toBeInTheDocument();
    const accept = screen.getByTestId("cohost-accept");
    expect(accept).toHaveTextContent("Become a co-host");
    await act(async () => {
      fireEvent.click(accept);
    });
    const [init] = callsTo(fetchMock, "/api/games/brd123/cohosts/accept");
    expect(JSON.parse(String(init.body))).toEqual({ token: TOKEN });
    // Sent as this device, never with an admin token.
    expect(init.headers).not.toHaveProperty("x-admin-token");
    expect(await screen.findByText("You're a co-host")).toBeInTheDocument();
    expect(identity.isCohostGame("brd123")).toBe(true);
  });

  it("joins the board first for someone not on it yet, then accepts", async () => {
    board.state = boardWith([player(HOST, "Jordan")]);
    const me = identity.getPlayerId();
    const joined = boardWith([player(HOST, "Jordan"), player(me, "Ana")]);
    const fetchMock = server({
      "/api/games/brd123/join": () => json({ state: joined }),
      "/cohosts/accept": () => json({ state: boardWith(joined.players, [me]) }),
    });
    await openLink();
    const accept = await screen.findByTestId("cohost-accept");
    expect(accept).toHaveTextContent("Join & become a co-host");
    await act(async () => {
      fireEvent.click(accept);
      await new Promise((r) => setTimeout(r, 400));
    });
    fireEvent.change(await screen.findByTestId("join-name"), { target: { value: "Ana" } });
    const submit = screen.getByTestId("join-submit");
    expect(submit).toHaveTextContent("Join & become a co-host");
    await act(async () => {
      fireEvent.click(submit);
    });
    await waitFor(() => expect(callsTo(fetchMock, "/cohosts/accept")).toHaveLength(1));
    expect(callsTo(fetchMock, "/api/games/brd123/join")).toHaveLength(1);
    expect(await screen.findByText("You're a co-host")).toBeInTheDocument();
  });

  it("says plainly when the link was already used, and only closes", async () => {
    const me = identity.getPlayerId();
    board.state = boardWith([player(HOST, "Jordan"), player(me, "Ana")]);
    server({ "/cohosts/accept": () => json({ error: "This co-host link was already used. Ask the host for a new one." }, 410) });
    await openLink();
    await act(async () => {
      fireEvent.click(await screen.findByTestId("cohost-accept"));
    });
    expect(await screen.findByRole("alert")).toHaveTextContent("This co-host link was already used. Ask the host for a new one.");
    expect(screen.queryByTestId("cohost-accept")).toBeNull();
    expect(screen.getByTestId("cohost-decline")).toHaveTextContent("Close");
  });

  it("doesn't ask the host about their own link, or a co-host again", async () => {
    board.state = boardWith([player(HOST, "Jordan")]);
    identity.saveAdminToken("brd123", "admin-token");
    const fetchMock = server({});
    await openLink();
    expect(await screen.findByText("That's your co-host invite")).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: /Become a co-host/ })).toBeNull();
    expect(callsTo(fetchMock, "/cohosts/accept")).toHaveLength(0);
  });

  it("tells a co-host they already are one", async () => {
    const me = identity.getPlayerId();
    board.state = boardWith([player(HOST, "Jordan"), player(me, "Ana")], [me]);
    server({});
    await openLink();
    expect(await screen.findByText("You're already a co-host")).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: /Become a co-host/ })).toBeNull();
    // And the board shows them the host tools.
    expect(screen.getByTestId("host-open")).toBeInTheDocument();
  });

  it("ignores a broken link with a plain word", async () => {
    board.state = boardWith([player(HOST, "Jordan")]);
    server({});
    await openLink("short");
    expect(await screen.findByText("That co-host link isn't complete")).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: /Become a co-host/ })).toBeNull();
  });
});
