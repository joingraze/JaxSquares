import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { GameState, GameSummary } from "../../../shared/types";
import { ToastProvider } from "../../components/ui";
import { getPlayerId, setServerIdentity } from "../../lib/identity";
import { markCelebrated } from "../board/storage";
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
    joined: true,
    host: null,
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
    if (/\/api\/me\/games(\?|$)/.test(url)) return json({ games });
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
    expect(screen.getByTestId("welcome-note")).toHaveTextContent("Friends join from a link, no account needed.");
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    expect(screen.getAllByTestId("new-board")).toHaveLength(1);
  });

  it("tells someone in the iPhone Home Screen app that the boards they joined in Safari are still there", async () => {
    const ua = vi.spyOn(navigator, "userAgent", "get").mockReturnValue("Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148");
    Object.defineProperty(navigator, "standalone", { configurable: true, value: true });
    try {
      serve([]);
      renderHome();
      expect(screen.getByTestId("welcome-note")).toHaveTextContent("Joined a board in Safari? It's still there. Open your invite link in Safari to get back to it.");
      await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    } finally {
      delete (navigator as Navigator & { standalone?: boolean }).standalone;
      ua.mockRestore();
    }
  });

  it("tells someone signed in with no boards yet where a board made before signing in is", async () => {
    setServerIdentity(getPlayerId(), { provider: "apple", email: null, name: null, since: 0 });
    serve([]);
    renderHome();
    expect(screen.getByTestId("welcome-signed-in")).toHaveTextContent(
      "Signed in with Apple, no boards yet. Made one before signing in? Open it on the phone or browser you made it on and sign in there too: it joins your account.",
    );
    expect(screen.queryByTestId("welcome-signin")).toBeNull();
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
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
    expect(screen.getByText("Invites")).toBeInTheDocument();
    expect(screen.getByText("Needs you")).toBeInTheDocument();
    expect(screen.getByText("Up next")).toBeInTheDocument();
    expect(screen.getByText("Final")).toBeInTheDocument();
    expect(screen.getByText("Thanksgiving Showdown")).toBeInTheDocument();
    // Needs you is for the host's to-dos; a friend's board I haven't picked on is an invite.
    const needs = screen.getByRole("region", { name: "Needs you" });
    expect(within(needs).getByRole("button", { name: "Draw numbers" })).toBeInTheDocument();
    expect(within(needs).queryByRole("button", { name: "Pick squares" })).toBeNull();
    const invites = screen.getByRole("region", { name: "Invites" });
    expect(within(invites).getByTestId("invite-card")).toHaveTextContent("Group Chat Squares");
    expect(within(invites).getByTestId("invite-pick")).toHaveTextContent("Pick squares");
    // Joined without picking: no "Not for me" (that only hides an invite I just opened).
    expect(within(invites).queryByTestId("invite-hide")).toBeNull();
    // A board I'm playing shows my squares; my own board keeps its quiet role label.
    expect(screen.getByText("3 squares yours")).toBeInTheDocument();
    expect(screen.getByText("Your board")).toBeInTheDocument();
    expect(screen.getByText(/You hit at the final whistle/)).toBeInTheDocument();
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

  it("shows the host's corrected final, not the wrong one Home saw live, now and on the next visit", async () => {
    const me = getPlayerId();
    localStorage.setItem("jaxsquares.games", JSON.stringify(["fixed"]));
    markCelebrated("fixed", ["final"]); // no confetti (jsdom has no canvas)
    const digits = Array.from({ length: 10 }, (_, i) => [i]);
    const base = boardState("fixed", me);
    const locked = boardState("fixed", me, {
      game: { ...base.game, hostPlayerId: MAYA, status: "locked", numbers: { "*": { x: digits, y: digits } } },
      squares: [
        { row: 0, col: 7, playerId: me, claimedAt: 1 },
        { row: 0, col: 1, playerId: MAYA, claimedAt: 1 },
      ],
      version: 5,
    });
    const finalScore = (scoreX: number, version: number): GameState => ({
      ...locked,
      game: { ...locked.game, status: "final" },
      scores: [{ periodKey: "final", scoreX, scoreY: 0, source: "host", updatedAt: 1 }],
      version,
    });
    const wrong = finalScore(17, 6); // hits my square
    const fixed = finalScore(21, 8); // hits Maya's
    serve([summary({ id: "fixed", name: "Probe Board", status: "locked", mySquares: 1, claimed: 2, playerCount: 2, version: 5 })], {
      fixed,
    });
    const view = renderHome();
    await waitFor(() => expect(sockets.get("fixed")).toBeDefined());
    act(() => sockets.get("fixed")!.open());
    act(() => sockets.get("fixed")!.push({ type: "state", state: wrong }));
    expect(await screen.findByText("17–0")).toBeInTheDocument();

    // The host deletes the wrong final and types 21-0; the next summary refresh says so.
    serve(
      [
        summary({
          id: "fixed",
          name: "Probe Board",
          status: "final",
          mySquares: 1,
          claimed: 2,
          playerCount: 2,
          latestScore: { scoreX: 21, scoreY: 0, label: "Final" },
          leaderPlayerId: MAYA,
          version: 8,
        }),
      ],
      { fixed },
    );
    act(() => void window.dispatchEvent(new Event("focus")));
    expect(await screen.findByText("21–0")).toBeInTheDocument();
    expect(screen.queryByText("17–0")).toBeNull();
    expect(screen.queryByText(/You hit/)).toBeNull();
    await waitFor(() => expect(screen.getByText(/Maya won/)).toBeInTheDocument());

    // Coming back to Home later in the session.
    view.unmount();
    renderHome();
    expect(await screen.findByText("21–0")).toBeInTheDocument();
    expect(screen.queryByText("17–0")).toBeNull();
    expect(screen.queryByText(/You hit/)).toBeNull();
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
    // Home follows the board passively (not counted as watching) and takes its state from the socket, no extra GET.
    await waitFor(() => expect(sockets.get("inbox")).toBeDefined());
    const socket = sockets.get("inbox")!;
    expect(socket.url).toContain("watch=0");
    expect(fetchMock.mock.calls.some(([url]) => String(url).endsWith("/api/games/inbox"))).toBe(false);
    act(() => socket.open());
    act(() => socket.push({ type: "state", state }));
    const bell = await screen.findByRole("button", { name: "Activity, 1 new" });
    fireEvent.click(bell);
    const sheet = await screen.findByRole("dialog");
    expect(await within(sheet).findByText("Maya joined and grabbed a square")).toBeInTheDocument();
    expect(within(sheet).getByText("New")).toBeInTheDocument();
    // Opening it marks everything read.
    expect(screen.getByRole("button", { name: "Activity" })).toBeInTheDocument();
  });

  it("offers back an invite I only opened, distinct from my boards, and hides it with an undo", async () => {
    localStorage.setItem("jaxsquares.games", JSON.stringify(["mine"]));
    localStorage.setItem("jaxsquares.seen", JSON.stringify(["inv1"]));
    const maya = { id: MAYA, name: "Maya", color: "#ff6b6b", emoji: "🦊" };
    serve([
      summary({
        id: "inv1",
        name: "Maya's Squares",
        joined: false,
        host: maya,
        claimed: 58,
        playerCount: 6,
        format: { periods: "quarters", reverse: false, boardSize: 100, freshNumbers: false, unit: "$", squarePrice: 10 },
      }),
      summary({ id: "mine", name: "Sunday Funday", mySquares: 15, claimed: 40 }),
    ]);
    renderHome();
    // (The first paint may be an earlier test's cached list: wait for this one.)
    await screen.findByText("Maya's Squares");
    const card = screen.getByTestId("invite-card");
    // Home asked for the seen board by its public id (never the clientId).
    const meGames = fetchMock.mock.calls.map(([url]) => String(url)).find((url) => url.includes("/api/me/games"));
    expect(meGames).toMatch(/\/api\/me\/games\?seen=inv1$/);
    expect(within(screen.getByTestId("home-invites")).getAllByTestId("invite-card")).toHaveLength(1);
    expect(card).toHaveTextContent("Maya invited you");
    expect(card).toHaveTextContent("Maya's Squares");
    expect(card).toHaveTextContent("Chiefs vs Bills");
    expect(card).toHaveTextContent("$10 a square");
    expect(within(card).getByText(wholeText("42 squares left"))).toBeInTheDocument();
    expect(within(card).getByRole("progressbar", { name: "58 of 100 squares claimed" })).toBeInTheDocument();
    expect(within(card).getByTestId("invite-pick")).toHaveTextContent("Pick squares");
    expect(screen.getByText("Maya invited you.")).toBeInTheDocument();
    // The board I'm playing reads differently: my squares, no invite.
    expect(screen.getByText("15 squares yours")).toBeInTheDocument();
    // Home follows boards I'm on live, not an invite I only opened.
    await waitFor(() => expect(sockets.get("mine")).toBeDefined());
    expect(sockets.has("inv1")).toBe(false);

    fireEvent.click(within(card).getByTestId("invite-hide"));
    await waitFor(() => expect(screen.queryByTestId("invite-card")).toBeNull());
    expect(JSON.parse(localStorage.getItem("jaxsquares.seen") ?? "[]")).toEqual([]);
    expect(screen.getByText("Sunday Funday")).toBeInTheDocument();
    fireEvent.click(await screen.findByRole("button", { name: "Undo" }));
    expect(await screen.findByTestId("invite-card")).toHaveTextContent("Maya's Squares");
    expect(JSON.parse(localStorage.getItem("jaxsquares.seen") ?? "[]")).toEqual(["inv1"]);
  });

  it("drops a finished board I never joined, and forgets it", async () => {
    localStorage.setItem("jaxsquares.games", JSON.stringify(["mine"]));
    localStorage.setItem("jaxsquares.seen", JSON.stringify(["over", "gone"]));
    serve([summary({ id: "over", name: "Old Invite", joined: false, status: "final" }), summary({ id: "mine", name: "Sunday Funday", mySquares: 2, claimed: 30 })]);
    renderHome();
    expect(await screen.findByText("Sunday Funday")).toBeInTheDocument();
    expect(screen.queryByText("Old Invite")).toBeNull();
    // Over, or deleted (the server left it out): neither comes back.
    await waitFor(() => expect(JSON.parse(localStorage.getItem("jaxsquares.seen") ?? "[]")).toEqual([]));
  });
});
