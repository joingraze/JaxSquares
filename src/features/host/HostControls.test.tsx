import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AppConfig, GameState, NumberDraw, Player, Square } from "../../../shared/types";

const setScore = vi.fn();
const lock = vi.fn();
const setWinner = vi.fn();
const finish = vi.fn();
const updateGame = vi.fn();
const deleteGame = vi.fn();
const removePlayer = vi.fn();
vi.mock("../../lib/api", async (orig) => {
  const real = await orig<typeof import("../../lib/api")>();
  return {
    ...real,
    api: {
      ...real.api,
      setScore: (...a: unknown[]) => setScore(...a),
      lock: (...a: unknown[]) => lock(...a),
      setWinner: (...a: unknown[]) => setWinner(...a),
      finish: (...a: unknown[]) => finish(...a),
      updateGame: (...a: unknown[]) => updateGame(...a),
      deleteGame: (...a: unknown[]) => deleteGame(...a),
      removePlayer: (...a: unknown[]) => removePlayer(...a),
    },
  };
});

vi.mock("../../lib/native", async (orig) => {
  const real = await orig<typeof import("../../lib/native")>();
  return { ...real, haptic: vi.fn(async () => {}), shareLink: vi.fn(async () => "copied") };
});

vi.mock("../../components/ui/confetti", () => ({ celebrate: vi.fn(), CELEBRATION_COLORS: [], prefersReducedMotion: () => true }));

const { ApiError } = await import("../../lib/api");
const identity = await import("../../lib/identity");
const { ToastProvider } = await import("../../components/ui");
const { HostControls } = await import("./HostControls");

const DRAW: NumberDraw = {
  x: [[0], [1], [2], [3], [4], [5], [6], [7], [8], [9]],
  y: [[9], [8], [7], [6], [5], [4], [3], [2], [1], [0]],
};

const player = (id: string, name: string): Player => ({ id, name, color: "#ff6b35", emoji: "🔥", joinedAt: 0, isHost: false });
const sq = (row: number, col: number, playerId: string): Square => ({ row, col, playerId, claimedAt: 0 });

function makeState(over: Partial<GameState["game"]> = {}, rest: Partial<GameState> = {}): GameState {
  return {
    game: {
      id: "hst123",
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
      hostPlayerId: "host",
      createdAt: 0,
      lockedAt: null,
      ...over,
    },
    players: [player("host", "Jordan"), player("maya", "Maya")],
    squares: [],
    scores: [],
    manualWinners: [],
    live: null,
    activity: [],
    version: 1,
    ...rest,
  };
}

function Search() {
  return <output data-testid="search">{useLocation().search}</output>;
}

function renderHost(state: GameState, props: Partial<Parameters<typeof HostControls>[0]> = {}, url = "/g/hst123") {
  const apply = vi.fn();
  const pickCell = vi.fn(async () => null);
  const onInvite = vi.fn();
  const utils = render(
    <MemoryRouter initialEntries={[url]}>
      <ToastProvider>
        <Routes>
          <Route
            path="/g/:id"
            element={
              <>
                <HostControls state={state} apply={apply} pickCell={pickCell} onInvite={onInvite} {...props} />
                <Search />
              </>
            }
          />
          <Route path="/" element={<p>Home screen</p>} />
        </Routes>
      </ToastProvider>
    </MemoryRouter>,
  );
  return { ...utils, apply, pickCell, onInvite };
}

const fillSquares = (n: number, owner = "maya") => Array.from({ length: n }, (_, i) => sq(Math.floor(i / 10), i % 10, owner));

const CONFIG: AppConfig = {
  payments: { mode: "test", priceCents: 499, currency: "usd", stripePublishableKey: null, iapProductId: "com.jaxsquares.board" },
  vapidPublicKey: null,
};

beforeEach(() => {
  localStorage.clear();
  vi.clearAllMocks();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("HostControls", () => {
  it("renders nothing without this board's admin token", () => {
    renderHost(makeState());
    expect(screen.queryByTestId("host-open")).not.toBeInTheDocument();
    expect(screen.queryByText("Host tools")).not.toBeInTheDocument();
  });

  it("shows the host bar with the next move when the device is the host", () => {
    identity.saveAdminToken("hst123", "tok");
    const squares = Array.from({ length: 92 }, (_, i) => sq(Math.floor(i / 10), i % 10, "maya"));
    renderHost(makeState({}, { squares }));
    expect(screen.getByTestId("host-open")).toHaveTextContent("Host tools");
    expect(screen.getByTestId("host-bar-action")).toHaveTextContent("Lock & draw");
  });

  it("keeps Invite as the bar's move, with the count left, until the board is nearly full", () => {
    identity.saveAdminToken("hst123", "tok");
    const squares = Array.from({ length: 58 }, (_, i) => sq(Math.floor(i / 10), i % 10, "maya"));
    renderHost(makeState({}, { squares }));
    expect(screen.getByTestId("host-bar-action")).toHaveTextContent("Invite (42 left)");
  });

  it("invites straight from the bar while the board is filling", () => {
    identity.saveAdminToken("hst123", "tok");
    const { onInvite } = renderHost(makeState());
    fireEvent.click(screen.getByTestId("host-bar-action"));
    expect(onInvite).toHaveBeenCalled();
  });

  it("locks only after the confirm step and applies the drawn state", async () => {
    identity.saveAdminToken("hst123", "tok");
    const lockedState = makeState({ status: "locked", numbers: { "*": DRAW } });
    lock.mockResolvedValue({ state: lockedState });
    const { apply } = renderHost(makeState({}, { squares: fillSquares(60) }));
    fireEvent.click(screen.getByTestId("host-open"));
    fireEvent.click(await screen.findByTestId("host-lock"));
    expect(lock).not.toHaveBeenCalled();
    fireEvent.click(await screen.findByTestId("host-lock-confirm"));
    await waitFor(() => expect(lock).toHaveBeenCalledWith("hst123"));
    await waitFor(() => expect(apply).toHaveBeenCalledWith(lockedState));
    // The reveal (reduced motion: instant) offers the way back to the board.
    expect(await screen.findByRole("button", { name: "See the board" })).toBeInTheDocument();
    fireEvent.click(screen.getByTestId("reveal-close"));
    expect(screen.queryByTestId("reveal-done")).toBeNull();
  });

  it("can be closed mid-shuffle, and doesn't pop back up when the draw lands", async () => {
    identity.saveAdminToken("hst123", "tok");
    const lockedState = makeState({ status: "locked", numbers: { "*": DRAW } });
    let land!: (v: { state: GameState }) => void;
    lock.mockReturnValue(new Promise((r) => (land = r)));
    const { apply } = renderHost(makeState({}, { squares: fillSquares(60) }));
    fireEvent.click(screen.getByTestId("host-open"));
    fireEvent.click(await screen.findByTestId("host-lock"));
    fireEvent.click(await screen.findByTestId("host-lock-confirm"));
    fireEvent.click(await screen.findByTestId("reveal-close"));
    expect(screen.queryByTestId("reveal-close")).toBeNull();
    await act(async () => land({ state: lockedState }));
    await waitFor(() => expect(apply).toHaveBeenCalledWith(lockedState));
    expect(screen.queryByTestId("reveal-close")).toBeNull();
  });

  it("types a score, previews the winner and saves it", async () => {
    identity.saveAdminToken("hst123", "tok");
    // 7-3 -> KC digit 7 (col 7), BUF digit 3 (row 6).
    const state = makeState({ status: "locked", numbers: { "*": DRAW } }, { squares: [sq(6, 7, "maya")] });
    const saved = makeState({ status: "locked", numbers: { "*": DRAW } }, { squares: [sq(6, 7, "maya")], scores: [{ periodKey: "q1", scoreX: 7, scoreY: 3, source: "host", updatedAt: 1 }] });
    setScore.mockResolvedValue({ state: saved });
    const { apply } = renderHost(state);
    fireEvent.click(screen.getByTestId("host-open"));
    const save = await screen.findByTestId("score-save");
    expect(save).toBeDisabled();
    fireEvent.change(screen.getByTestId("score-x"), { target: { value: "7" } });
    fireEvent.change(screen.getByTestId("score-y"), { target: { value: "3" } });
    expect(screen.getByText(/would win at the end of Q1/)).toHaveTextContent("Maya would win at the end of Q1");
    expect(save).toHaveTextContent("Save Q1 score");
    fireEvent.click(save);
    await waitFor(() => expect(setScore).toHaveBeenCalledWith("hst123", { periodKey: "q1", scoreX: 7, scoreY: 3 }));
    await waitFor(() => expect(apply).toHaveBeenCalledWith(saved));
    // Confirmed in the sheet's footer, not by a toast over the sheet's header.
    expect(await screen.findByTestId("score-saved")).toHaveTextContent("Saved · Maya wins at the end of Q1");
  });

  it("starts a new period blank and only saves once the host enters or confirms a score", async () => {
    identity.saveAdminToken("hst123", "tok");
    const state = makeState(
      { status: "locked", numbers: { "*": DRAW } },
      { squares: [sq(6, 7, "maya")], scores: [{ periodKey: "q1", scoreX: 7, scoreY: 3, source: "host", updatedAt: 1 }] },
    );
    renderHost(state);
    fireEvent.click(screen.getByTestId("host-open"));
    const save = await screen.findByTestId("score-save");
    expect(save).toHaveTextContent("Save Half score");
    expect(save).toBeDisabled();
    expect(screen.getByTestId("score-x")).toHaveValue("");
    expect(screen.queryByText(/win Half/)).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Same as Q1\?/ }));
    expect(screen.getByTestId("score-x")).toHaveValue("7");
    expect(screen.getByTestId("score-y")).toHaveValue("3");
    expect(save).toBeEnabled();
    expect(screen.getByText(/would win at halftime/)).toHaveTextContent("Maya would win at halftime");
  });

  it("enters digits with the keypad", async () => {
    identity.saveAdminToken("hst123", "tok");
    renderHost(makeState({ status: "locked", numbers: { "*": DRAW } }));
    fireEvent.click(screen.getByTestId("host-open"));
    await screen.findByTestId("score-save");
    fireEvent.click(screen.getByRole("button", { name: "2" }));
    fireEvent.click(screen.getByRole("button", { name: "1" }));
    expect(screen.getByTestId("score-x")).toHaveValue("21");
    fireEvent.click(screen.getByRole("button", { name: /Switch to Bills/ }));
    fireEvent.click(screen.getByRole("button", { name: "7" }));
    expect(screen.getByTestId("score-y")).toHaveValue("7");
    fireEvent.click(screen.getByRole("button", { name: "Delete digit" }));
    expect(screen.getByTestId("score-y")).toHaveValue("");
  });

  it("adds a new every-score entry with quick adds", async () => {
    identity.saveAdminToken("hst123", "tok");
    const state = makeState(
      { status: "locked", numbers: { "*": DRAW }, format: { periods: "every-score", reverse: false, boardSize: 100, freshNumbers: false }, periods: [] },
      { scores: [{ periodKey: "s1", scoreX: 7, scoreY: 0, source: "host", updatedAt: 1, label: "Score 1" }] },
    );
    setScore.mockResolvedValue({ state });
    renderHost(state);
    fireEvent.click(screen.getByTestId("host-open"));
    const save = await screen.findByTestId("score-save");
    expect(save).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: /Switch to Bills/ }));
    fireEvent.click(screen.getByRole("button", { name: "Add a field goal (3) for Bills" }));
    expect(save).toHaveTextContent("Add Score 2");
    fireEvent.click(save);
    await waitFor(() => expect(setScore).toHaveBeenCalledWith("hst123", { periodKey: "next", scoreX: 7, scoreY: 3 }));
  });

  it("shows a rate limit as a gentle toast", async () => {
    identity.saveAdminToken("hst123", "tok");
    setScore.mockRejectedValue(new ApiError("Slow down a sec and try again.", 429));
    renderHost(makeState({ status: "locked", numbers: { "*": DRAW } }));
    fireEvent.click(screen.getByTestId("host-open"));
    fireEvent.change(await screen.findByTestId("score-x"), { target: { value: "7" } });
    fireEvent.change(screen.getByTestId("score-y"), { target: { value: "3" } });
    fireEvent.click(screen.getByTestId("score-save"));
    expect(await screen.findByText("Slow down a sec and try again.")).toBeInTheDocument();
  });

  it("blocks money in prize notes inline (notes live under Rules & prizes)", async () => {
    identity.saveAdminToken("hst123", "tok");
    renderHost(makeState());
    fireEvent.click(screen.getByTestId("host-open"));
    fireEvent.click(await screen.findByTestId("host-rules"));
    const q1 = (await screen.findAllByTestId("rule-row")).find((r) => r.getAttribute("data-moment") === "q1")!;
    fireEvent.click(q1.querySelector('[data-testid="rule-note-add"]')!);
    const note = await screen.findByPlaceholderText("Loser buys wings");
    fireEvent.change(note, { target: { value: "Loser pays $20" } });
    expect(await screen.findByText(/Put amounts in the amount box/)).toBeInTheDocument();
    expect(screen.getByTestId("rules-save")).toBeDisabled();
    fireEvent.change(note, { target: { value: "Loser buys wings" } });
    updateGame.mockResolvedValue({ state: makeState() });
    fireEvent.click(screen.getByTestId("rules-save"));
    await waitFor(() => expect(updateGame).toHaveBeenCalled());
    const [id, body] = updateGame.mock.calls[0];
    expect(id).toBe("hst123");
    expect(body.format.rules.find((r: { moment: string }) => r.moment === "q1").square.note).toBe("Loser buys wings");
    expect(body.format.justForFun).toBe(false);
  });

  it("sets a square price and amounts, and locks who wins once a score is in", async () => {
    identity.saveAdminToken("hst123", "tok");
    const scored = makeState({ status: "locked", numbers: { "*": DRAW } }, { scores: [{ periodKey: "q1", scoreX: 7, scoreY: 3, source: "host", updatedAt: 1 }] });
    renderHost(scored);
    fireEvent.click(screen.getByTestId("host-open"));
    fireEvent.click(await screen.findByTestId("host-rules"));
    expect(await screen.findByText(/Scoring rules lock once the first score is in/)).toBeInTheDocument();
    // Moments and squares are shown, but locked.
    for (const t of screen.getAllByTestId("rule-toggle")) expect(t).toBeDisabled();
    // Amounts still change: pick dollars, a square price and a Q1 amount.
    fireEvent.click(screen.getAllByTestId("rules-choice-option").find((b) => b.getAttribute("data-choice") === "$")!);
    fireEvent.change(await screen.findByTestId("rules-square-price"), { target: { value: "10" } });
    const amount = screen.getAllByTestId("rule-amount").find((i) => i.getAttribute("data-moment") === "q1")!;
    fireEvent.change(amount, { target: { value: "200" } });
    updateGame.mockResolvedValue({ state: scored });
    fireEvent.click(screen.getByTestId("rules-save"));
    await waitFor(() => expect(updateGame).toHaveBeenCalled());
    const body = updateGame.mock.calls[0][1];
    expect(body.format).toMatchObject({ unit: "$", squarePrice: 10, periods: "quarters" });
    expect(body.format.rules[0]).toEqual({ moment: "q1", square: { amount: 200, note: "" }, reverse: null });
  });

  it("ends the game after a confirm", async () => {
    identity.saveAdminToken("hst123", "tok");
    const state = makeState({ status: "locked", numbers: { "*": DRAW } }, { scores: [{ periodKey: "q1", scoreX: 7, scoreY: 3, source: "host", updatedAt: 1 }] });
    const ended = makeState({ status: "final", numbers: { "*": DRAW } });
    finish.mockResolvedValue({ state: ended });
    const { apply } = renderHost(state);
    fireEvent.click(screen.getByTestId("host-open"));
    fireEvent.click(await screen.findByRole("button", { name: /End game/ }));
    fireEvent.click(await screen.findByRole("button", { name: "End game for everyone" }));
    await waitFor(() => expect(finish).toHaveBeenCalledWith("hst123"));
    await waitFor(() => expect(apply).toHaveBeenCalledWith(ended));
    expect(await screen.findByText("That's the game!")).toBeInTheDocument();
  });

  it("deletes only after an honest confirm, then goes home", async () => {
    identity.saveAdminToken("hst123", "tok");
    deleteGame.mockResolvedValue({ ok: true });
    renderHost(makeState({}, { squares: [sq(0, 0, "maya")] }));
    fireEvent.click(screen.getByTestId("host-open"));
    fireEvent.click(await screen.findByRole("button", { name: /Delete board/ }));
    expect(await screen.findByText(/can't be undone/)).toBeInTheDocument();
    expect(deleteGame).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Delete for everyone" }));
    await waitFor(() => expect(deleteGame).toHaveBeenCalledWith("hst123"));
    expect(await screen.findByText("Home screen")).toBeInTheDocument();
  });

  it("picks a winner by hand through the board", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      identity.saveAdminToken("hst123", "tok");
      // 7-3 lands on (6, 7), which nobody owns: the row says so and offers the fix.
      const state = makeState(
        { status: "locked", numbers: { "*": DRAW } },
        { squares: [sq(0, 0, "maya")], scores: [{ periodKey: "q1", scoreX: 7, scoreY: 3, source: "host", updatedAt: 1 }] },
      );
      setWinner.mockResolvedValue({ state: { ...state, manualWinners: [{ periodKey: "q1", row: 0, col: 0, updatedAt: 1 }] } });
      const pickCell = vi.fn(async () => ({ row: 0, col: 0 }));
      renderHost(state, { pickCell });
      fireEvent.click(screen.getByTestId("host-open"));
      expect(await screen.findByText("Nobody had 7–3")).toBeInTheDocument();
      const give = screen.getByRole("button", { name: "Pick the Q1 winner by hand" });
      expect(give).toHaveTextContent("Give it to a player");
      fireEvent.click(give);
      await vi.advanceTimersByTimeAsync(400);
      expect(pickCell).toHaveBeenCalledWith("Tap the square that wins at the end of Q1");
      await waitFor(() => expect(setWinner).toHaveBeenCalledWith("hst123", { periodKey: "q1", row: 0, col: 0 }));
    } finally {
      vi.useRealTimers();
    }
  });

  it("keeps the sheet titled Host tools in every state", async () => {
    identity.saveAdminToken("hst123", "tok");
    for (const status of ["draft", "open", "locked"] as const) {
      const { unmount } = renderHost(makeState({ status, numbers: status === "locked" ? { "*": DRAW } : null }));
      fireEvent.click(screen.getByTestId("host-open"));
      expect(await screen.findByRole("heading", { name: "Host tools" })).toBeInTheDocument();
      unmount();
    }
  });

  it("won't lock an empty board and says Invite friends until someone joins", async () => {
    identity.saveAdminToken("hst123", "tok");
    renderHost(makeState({}, { players: [player("host", "Jordan")] }));
    expect(screen.getByTestId("host-bar-action")).toHaveTextContent("Invite friends");
    fireEvent.click(screen.getByTestId("host-open"));
    expect(await screen.findByTestId("host-lock")).toBeDisabled();
    expect(screen.getAllByRole("button", { name: /Invite friends/ })).toHaveLength(2);
    expect(screen.getByText(/turns on once someone picks a square/)).toBeInTheDocument();
  });

  it("asks before locking a thin board", async () => {
    identity.saveAdminToken("hst123", "tok");
    renderHost(makeState({}, { squares: fillSquares(12) }));
    fireEvent.click(screen.getByTestId("host-open"));
    fireEvent.click(await screen.findByTestId("host-lock"));
    expect(await screen.findByRole("heading", { name: /Lock with only 12 in\?/ })).toBeInTheDocument();
    expect(screen.getByTestId("host-lock-confirm")).toHaveTextContent("Lock & draw anyway");
  });

  it("offers no pick, fix or end game before a linked game kicks off", async () => {
    identity.saveAdminToken("hst123", "tok");
    const state = makeState({
      status: "locked",
      numbers: { "*": DRAW },
      linkedEvent: { provider: "espn", league: "nfl", eventId: "1", startsAt: Date.now() + 3_600_000, xIsHome: true },
    });
    renderHost(state);
    fireEvent.click(screen.getByTestId("host-open"));
    expect(await screen.findByText("Up next")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /winner by hand/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Fix a score/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /End game/ })).not.toBeInTheDocument();
  });

  it("opens an unpaid board from the bar, then goes straight to the invite", async () => {
    identity.saveAdminToken("hst123", "tok");
    const opened = makeState({ status: "open" });
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        if (url.endsWith("/api/config")) return new Response(JSON.stringify(CONFIG), { status: 200 });
        if (url.endsWith("/api/games/hst123/pay/test")) return new Response(JSON.stringify({ state: opened }), { status: 200 });
        return new Response("{}", { status: 404 });
      }),
    );
    const { apply, onInvite } = renderHost(makeState({ status: "draft" }));
    const action = screen.getByTestId("host-bar-action");
    expect(action).toHaveTextContent("Open board");
    fireEvent.click(action);
    fireEvent.click(await screen.findByTestId("pay-confirm", {}, { timeout: 3000 }));
    await waitFor(() => expect(apply).toHaveBeenCalledWith(opened), { timeout: 3000 });
    await waitFor(() => expect(onInvite).toHaveBeenCalled(), { timeout: 3000 });
  });

  it("opens checkout from ?checkout=1 and clears the link", async () => {
    identity.saveAdminToken("hst123", "tok");
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify(CONFIG), { status: 200 })));
    renderHost(makeState({ status: "draft" }), {}, "/g/hst123?checkout=1");
    expect(await screen.findByTestId("pay-confirm", {}, { timeout: 3000 })).toBeInTheDocument();
    expect(screen.getByTestId("search")).toHaveTextContent(/^$/);
  });

  describe("removing a player", () => {
    const players = [player("host", "Jordan"), player("maya", "Maya"), player("kim", "Kim")];
    const filling = () => makeState({}, { players, squares: [...fillSquares(6, "maya"), sq(9, 9, "kim")] });
    const without = () => makeState({}, { players: [players[0], players[2]], squares: [sq(9, 9, "kim")], version: 2 });

    it("removes someone from the sheet's players list after a plain-words confirm", async () => {
      identity.saveAdminToken("hst123", "tok");
      removePlayer.mockResolvedValue({ state: without() });
      const { apply } = renderHost(filling());
      fireEvent.click(screen.getByTestId("host-open"));
      fireEvent.click(await screen.findByRole("button", { name: /^Players/ }));
      // Never offered on the host's own row.
      expect(screen.queryByRole("button", { name: "Remove Jordan" })).not.toBeInTheDocument();
      fireEvent.click(await screen.findByRole("button", { name: "Remove Maya" }));
      expect(await screen.findByRole("heading", { name: /Remove Maya\?/ })).toBeInTheDocument();
      expect(screen.getByText("Their 6 squares open up again.")).toBeInTheDocument();
      expect(removePlayer).not.toHaveBeenCalled();
      fireEvent.click(screen.getByTestId("remove-player-confirm"));
      await waitFor(() => expect(removePlayer).toHaveBeenCalledWith("hst123", "maya"));
      await waitFor(() => expect(apply).toHaveBeenCalledWith(without()));
      expect(await screen.findByText("Maya removed")).toBeInTheDocument();
      expect(screen.getByText("6 squares are open again.")).toBeInTheDocument();
      // Back on the sheet's list, to remove someone else if needed.
      expect(await screen.findByRole("heading", { name: /^Players/ })).toBeInTheDocument();
    });

    it("opens the confirm for a row tapped on the board, and Keep closes it without removing", async () => {
      identity.saveAdminToken("hst123", "tok");
      const onRemoveRequestHandled = vi.fn();
      renderHost(filling(), { removeRequest: "kim", onRemoveRequestHandled });
      expect(onRemoveRequestHandled).toHaveBeenCalled();
      expect(await screen.findByRole("heading", { name: /Remove Kim\?/ })).toBeInTheDocument();
      expect(screen.getByText("Their square opens up again.")).toBeInTheDocument();
      fireEvent.click(screen.getByRole("button", { name: "Keep Kim" }));
      await waitFor(() => expect(screen.queryByRole("heading", { name: /Remove Kim\?/ })).not.toBeInTheDocument());
      expect(removePlayer).not.toHaveBeenCalled();
    });

    it("explains a refusal in plain words when the squares just locked", async () => {
      identity.saveAdminToken("hst123", "tok");
      removePlayer.mockRejectedValue(new ApiError("Squares are locked", 409));
      const { apply } = renderHost(filling(), { removeRequest: "maya" });
      fireEvent.click(await screen.findByTestId("remove-player-confirm"));
      expect(await screen.findByText("Squares are locked now, so everyone stays on the board.")).toBeInTheDocument();
      expect(apply).not.toHaveBeenCalled();
    });

    it("isn't offered once the numbers are drawn", async () => {
      identity.saveAdminToken("hst123", "tok");
      const onRemoveRequestHandled = vi.fn();
      renderHost(makeState({ status: "locked", numbers: { "*": DRAW } }, { players }), { removeRequest: "maya", onRemoveRequestHandled });
      expect(screen.queryByRole("heading", { name: /Remove Maya\?/ })).not.toBeInTheDocument();
      fireEvent.click(screen.getByTestId("host-open"));
      expect(await screen.findByRole("heading", { name: "Host tools" })).toBeInTheDocument();
      expect(screen.queryByRole("button", { name: /^Players/ })).not.toBeInTheDocument();
    });
  });

  it("opens the lock & draw confirm from ?draw=1 and clears the link", async () => {
    identity.saveAdminToken("hst123", "tok");
    renderHost(makeState({}, { squares: fillSquares(100) }), {}, "/g/hst123?draw=1");
    expect(await screen.findByTestId("host-lock-confirm")).toHaveTextContent("Draw the numbers");
    expect(screen.getByTestId("search")).toHaveTextContent(/^$/);
  });
});
