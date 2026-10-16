import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { GameState, GameSummary } from "../../../shared/types";
import { ToastProvider } from "../../components/ui";
import { getPlayerId } from "../../lib/identity";
import Home from "../../pages/Home";

const fetchMock = vi.fn();
const MAYA = "maya-public-id-0000000";

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

function boardState(id: string, me: string, over: Partial<GameState> = {}): GameState {
  return {
    game: {
      id,
      name: "Probe Board",
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
      hostPlayerId: me,
      createdAt: 1,
      lockedAt: null,
    },
    players: [
      { id: me, name: "Jordan", color: "#38b6ff", emoji: "🏈", joinedAt: 1, isHost: true },
      { id: MAYA, name: "Maya", color: "#ff6b6b", emoji: "🦊", joinedAt: 2, isHost: false },
    ],
    squares: [],
    scores: [],
    manualWinners: [],
    live: null,
    activity: [],
    version: 1,
    ...over,
  };
}

/** Sockets Home opened, by board id. Nothing connects until a test says so. */
const sockets = new Map<string, FakeSocket>();
class FakeSocket {
  readyState = 0;
  onopen: ((ev: Event) => void) | null = null;
  onmessage: ((ev: MessageEvent) => void) | null = null;
  onclose: ((ev: CloseEvent) => void) | null = null;
  onerror: ((ev: Event) => void) | null = null;
  constructor(readonly url: string) {
    const id = /\/api\/games\/([^/]+)\/live/.exec(url)?.[1];
    if (id) sockets.set(decodeURIComponent(id), this);
  }
  send() {}
  close() {
    this.readyState = 3;
  }
  open() {
    this.readyState = 1;
    this.onopen?.(new Event("open"));
  }
  push(msg: unknown) {
    this.onmessage?.(new MessageEvent("message", { data: JSON.stringify(msg) }));
  }
}

function serve(games: GameSummary[], states: Record<string, GameState> = {}) {
  fetchMock.mockImplementation((url: string) => {
    const json = (body: unknown, status = 200) =>
      Promise.resolve(new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } }));
    if (url.endsWith("/api/me/games")) return json({ games });
    const id = /\/api\/games\/([^/?]+)$/.exec(url)?.[1];
    if (id && states[id]) return json(states[id]);
    return json({ error: "We couldn't find that board." }, 404);
  });
}

/** Matches an element whose whole text (across child elements, e.g. an animated count) is exactly `text`. */
const wholeText = (text: string) => (_: string, el: Element | null) =>
  !!el && el.textContent === text && Array.from(el.children).every((c) => c.textContent !== text);

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
  sockets.clear();
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
  vi.stubGlobal("WebSocket", FakeSocket);
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
    localStorage.setItem("jaxsquares.games", JSON.stringify(["live", "full", "pick", "next", "done"]));
    serve([
      summary({ id: "live", name: "Thanksgiving Showdown", status: "locked", mySquares: 12 }),
      summary({ id: "full", name: "Fantasy League Board", isHost: true, claimed: 100 }),
      summary({ id: "pick", name: "Group Chat Squares", claimed: 9 }),
      summary({ id: "next", name: "Sunday Funday", mySquares: 3, claimed: 37 }),
      summary({ id: "done", name: "Office Playoff Pool", status: "final", myWins: [{ periodKey: "final", label: "Final" }] }),
    ]);
    renderHome();
    expect(await screen.findByText("Live now")).toBeInTheDocument();
    expect(screen.getByText("Needs you")).toBeInTheDocument();
    expect(screen.getByText("Up next")).toBeInTheDocument();
    expect(screen.getByText("Final")).toBeInTheDocument();
    expect(screen.getByText("Thanksgiving Showdown")).toBeInTheDocument();
    // Picking squares on a friend's board is something you must do: it's under Needs you, with the host's draw.
    const needs = screen.getByRole("region", { name: "Needs you" });
    expect(within(needs).getByRole("button", { name: "Draw numbers" })).toBeInTheDocument();
    expect(within(needs).getByRole("button", { name: "Pick squares" })).toBeInTheDocument();
    // Roles are quiet labels, not chips that read like game state.
    expect(screen.getAllByText("You're in").length).toBeGreaterThan(0);
    expect(screen.getByText("Your board")).toBeInTheDocument();
    expect(screen.getByText(/You hit at the Final/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Open Sunday Funday" })).toHaveAttribute("href", "/g/next");
  });

  it("shows a friend's grabs the moment they happen, added up by person", async () => {
    const me = getPlayerId();
    localStorage.setItem("jaxsquares.games", JSON.stringify(["probe"]));
    const start = boardState("probe", me, { activity: [{ id: "j", type: "joined", at: Date.now() - 5000, actor: MAYA, data: { name: "Maya" } }] });
    serve([summary({ id: "probe", name: "Probe Board", isHost: true, playerCount: 2 })], { probe: start });
    renderHome();
    expect(await screen.findByText(wholeText("100 left"))).toBeInTheDocument();
    await waitFor(() => expect(sockets.get("probe")).toBeDefined());

    // Maya grabs five squares in five separate requests; the room pushes each state.
    const socket = sockets.get("probe")!;
    act(() => socket.open());
    const squares: GameState["squares"] = [];
    const activity: GameState["activity"] = [...start.activity];
    for (let i = 0; i < 5; i++) {
      squares.push({ row: i, col: 3, playerId: MAYA, claimedAt: Date.now() });
      activity.unshift({ id: `c${i}`, type: "claimed", at: Date.now(), actor: MAYA, data: { count: 1, cells: [{ row: i, col: 3 }] } });
      const next = { ...start, squares: [...squares], activity: [...activity], version: 2 + i };
      act(() => socket.push({ type: "state", state: next }));
    }

    await waitFor(() => expect(screen.getByText(/Maya grabbed 5 squares/)).toBeInTheDocument());
    expect(screen.getByRole("progressbar", { name: "5 of 100 squares claimed" })).toBeInTheDocument();
    await waitFor(() => expect(screen.getByText(wholeText("95 left"))).toBeInTheDocument(), { timeout: 3000 });
  });

  it("opens an activity inbox from the bell, with an unread count", async () => {
    const me = getPlayerId();
    localStorage.setItem("jaxsquares.games", JSON.stringify(["inbox"]));
    const now = Date.now();
    const state = boardState("inbox", me, {
      squares: [{ row: 0, col: 0, playerId: MAYA, claimedAt: now - 60_000 }],
      activity: [
        { id: "c1", type: "claimed", at: now - 60_000, actor: MAYA, data: { count: 1 } },
        { id: "j1", type: "joined", at: now - 61_000, actor: MAYA, data: { name: "Maya" } },
      ],
    });
    serve([summary({ id: "inbox", name: "Probe Board", isHost: true, claimed: 1, playerCount: 2 })], { inbox: state });
    renderHome();
    const bell = await screen.findByRole("button", { name: "Activity, 1 new" });
    fireEvent.click(bell);
    const sheet = await screen.findByRole("dialog");
    expect(await within(sheet).findByText("Maya joined and grabbed a square")).toBeInTheDocument();
    expect(within(sheet).getByText("New")).toBeInTheDocument();
    // Opening it marks everything read.
    expect(screen.getByRole("button", { name: "Activity" })).toBeInTheDocument();
  });
});
