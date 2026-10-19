// "Add another board for this game" end to end with the server faked: the
// create flow opens from the host's board (/new?from=brd001) straight on the
// price step, prefilled with that board's game, rules, board size and max per
// player; a new price recomputes the suggested amounts; the name counts
// boards ("· Board 2", never the price); Create sends fromGameId with the
// board's admin token. A device that doesn't host the board can't.

import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { createMemoryRouter, RouterProvider } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { withRules } from "../../../shared/formats";
import type { CreateGameInput, GameState, PaymentConfig } from "../../../shared/types";

vi.mock("../../lib/native", async (orig) => {
  const real = await orig<typeof import("../../lib/native")>();
  return { ...real, haptic: vi.fn(async () => {}), platform: () => "web" };
});
vi.mock("../../components/ui/confetti", () => ({ celebrate: vi.fn(), CELEBRATION_COLORS: [], prefersReducedMotion: () => true }));

const { ToastProvider } = await import("../../components/ui");
const { forgetGame, getPlayerId, saveAdminToken, setProfile } = await import("../../lib/identity");
const { default: CreateGame } = await import("../../pages/CreateGame");

const TEST: PaymentConfig = { mode: "test", priceCents: 499, currency: "usd", stripePublishableKey: null, iapProductId: "com.jaxsquares.app.board" };
const KICKOFF = Date.now() + 3 * 24 * 3_600_000;

/** The $1 board the host adds another board to. */
function source(over: Partial<GameState> = {}): GameState {
  const prize = (amount: number) => ({ amount, note: "" });
  return {
    game: {
      id: "brd001",
      name: "Office Squares",
      sport: "football",
      league: "custom",
      teamX: { name: "Chiefs", abbr: "KC", color: "#e31837" },
      teamY: { name: "Bills", abbr: "BUF", color: "#00338d" },
      format: withRules({
        periods: "quarters",
        reverse: false,
        boardSize: 100,
        freshNumbers: false,
        unit: "$",
        squarePrice: 1,
        rules: [
          { moment: "q1", square: prize(20), reverse: null },
          { moment: "q2", square: prize(20), reverse: null },
          { moment: "q3", square: prize(20), reverse: null },
          { moment: "final", square: { amount: 40, note: "Loser buys wings" }, reverse: null },
        ],
      }),
      periods: [],
      prizes: {},
      maxPerPlayer: 5,
      numbers: null,
      status: "open",
      linkedEvent: null,
      startsAt: KICKOFF,
      hostPlayerId: "host",
      createdAt: 0,
      lockedAt: null,
      paid: false,
    },
    players: [],
    squares: [],
    scores: [],
    manualWinners: [],
    live: null,
    activity: [],
    version: 3,
    ...over,
  };
}

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
let posted: { body: CreateGameInput; headers: Record<string, string> }[];
let board: GameState;

beforeEach(() => {
  cleanup();
  posted = [];
  board = source();
  sessionStorage.clear();
  setProfile({ name: "Jordan" });
  saveAdminToken("brd001", "admin-brd001");
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: string, init: RequestInit = {}) => {
      const url = String(input);
      const method = init.method ?? "GET";
      if (url.includes("/api/schedule")) return json({ events: [], unavailable: true });
      if (url.endsWith("/api/config")) return json({ payments: TEST, vapidPublicKey: null });
      if (method === "GET" && url.endsWith("/api/games/brd001")) return json(board);
      if (method === "POST" && url.endsWith("/api/games")) {
        const body = JSON.parse(String(init.body)) as CreateGameInput;
        posted.push({ body, headers: init.headers as Record<string, string> });
        return json({ game: { id: "g2", ...body, status: "open", paid: false }, adminToken: "admin-g2", paymentRequired: false }, 201);
      }
      return json({ error: "not found" }, 404);
    }),
  );
});

function renderFlow(entries: string[] = ["/g/brd001", "/new?from=brd001&step=prizes"]) {
  const router = createMemoryRouter(
    [
      { path: "/", element: <p>Home page</p> },
      { path: "/new", element: <CreateGame /> },
      { path: "/g/:id", element: <p>Board page</p> },
    ],
    { initialEntries: entries, initialIndex: entries.length - 1 },
  );
  render(
    <ToastProvider>
      <RouterProvider router={router} />
    </ToastProvider>,
  );
  return router;
}

const onStep = (step: string) => waitFor(() => expect(screen.getByTestId("wizard-step")).toHaveAttribute("data-step", step));
const next = () => fireEvent.click(screen.getByTestId("wizard-next"));
const amounts = () => screen.getAllByTestId("rule-amount").map((el) => (el as HTMLInputElement).value);
const priceChip = (price: number) => screen.getAllByTestId("price-chip").find((el) => el.getAttribute("data-price") === String(price))!;

describe("Add another board for this game", () => {
  it("opens on the price, prefilled from the board; a new price recomputes the prizes; Create sends fromGameId", async () => {
    const router = renderFlow();
    await onStep("prizes");
    expect(screen.getByRole("progressbar")).toHaveAttribute("aria-valuetext", "Step 1 of 3: Square price & prizes");
    expect(screen.getByTestId("sibling-intro")).toHaveTextContent("Chiefs vs Bills");
    expect(screen.getByTestId("sibling-intro")).toHaveTextContent("Same game and rules as Office Squares ($1 a square).");
    expect(screen.getByRole("heading", { name: "This board's square price" })).toBeInTheDocument();
    // The board's price and prizes, ready to change.
    expect(priceChip(1)).toHaveAttribute("aria-pressed", "true");
    expect(amounts()).toEqual(["20", "20", "20", "40"]);
    expect(screen.queryByTestId("wizard-back")).toBeNull();

    // $5 a square: the suggested amounts follow the new board total ($500).
    fireEvent.click(priceChip(5));
    expect(amounts()).toEqual(["100", "100", "100", "200"]);

    next();
    await onStep("details");
    expect(router.state.location.search).toBe("?from=brd001&step=details");
    expect(screen.getByTestId("board-name")).toHaveValue("Office Squares · Board 2");
    next();
    await onStep("review");
    // The game and the rules are the board's: one card that doesn't open a step.
    expect(screen.getByTestId("review-same-game")).toHaveTextContent("Same game & rules as Office Squares");
    expect(screen.getByTestId("review-same-game")).toHaveTextContent("Chiefs vs Bills");
    const editable = screen.getAllByTestId("review-edit").map((el) => el.getAttribute("data-step"));
    expect(editable).toEqual(["prizes", "details"]);
    expect(screen.getAllByTestId("review-edit")[0]).toHaveTextContent("$5 a square · Q1 $100 · Half $100 · Q3 $100 · Final $200");

    await act(async () => void fireEvent.click(screen.getByTestId("create-submit")));
    await waitFor(() => expect(router.state.location.pathname).toBe("/g/g2"));
    expect(posted).toHaveLength(1);
    const { body, headers } = posted[0];
    expect(body.fromGameId).toBe("brd001");
    expect(headers["x-admin-token"]).toBe("admin-brd001");
    expect(body.name).toBe("Office Squares · Board 2");
    expect([body.teamX.name, body.teamY.name, body.league, body.linkedEvent]).toEqual(["Chiefs", "Bills", "custom", null]);
    expect(body.startsAt).toBe(KICKOFF);
    expect(body.maxPerPlayer).toBe(5);
    expect(body.format.boardSize).toBe(100);
    expect(body.format.squarePrice).toBe(5);
    expect(body.format.rules?.map((r) => r.square?.amount)).toEqual([100, 100, 100, 200]);
    // The prize note carried over.
    expect(body.format.rules?.find((r) => r.moment === "final")?.square?.note).toBe("Loser buys wings");
  });

  it("names the next board past the ones the game already has", async () => {
    board = source({
      siblings: [{ id: "brd002", name: "Office Squares · Board 2", status: "open", squarePrice: 5, unit: "$", justForFun: false, squaresLeft: 90, totalSquares: 100 }],
    });
    renderFlow();
    await onStep("prizes");
    next();
    await onStep("details");
    await waitFor(() => expect(screen.getByTestId("board-name")).toHaveValue("Office Squares · Board 3"));
  });

  it("is open to a co-host too: no admin token, the server knows them by their identity", async () => {
    forgetGame("brd001");
    board = source();
    board.game.cohostIds = [getPlayerId()];
    renderFlow();
    await onStep("prizes");
    next();
    await onStep("details");
    next();
    await onStep("review");
    await act(async () => void fireEvent.click(screen.getByTestId("create-submit")));
    await waitFor(() => expect(posted).toHaveLength(1));
    expect(posted[0].body.fromGameId).toBe("brd001");
    expect(posted[0].headers["x-admin-token"]).toBeUndefined();
  });

  it("is for the board's host only, and only before the game starts", async () => {
    forgetGame("brd001");
    renderFlow();
    expect(await screen.findByText("Can't add a board here")).toBeInTheDocument();
    expect(screen.getByText("Only this board's host or a co-host can add another board for its game.")).toBeInTheDocument();
    expect(screen.queryByTestId("wizard-step")).toBeNull();
    cleanup();

    saveAdminToken("brd001", "admin-brd001");
    board = source({ scores: [{ periodKey: "q1", scoreX: 7, scoreY: 0, source: "host", updatedAt: 0 }] });
    renderFlow();
    expect(await screen.findByText("That game has kicked off. Add boards for it before kickoff.")).toBeInTheDocument();
  });
});
