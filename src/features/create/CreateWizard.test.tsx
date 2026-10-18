// The guided create flow end to end with the server faked: the soonest game
// is picked and a tapped game moves on, Next waits (with its reason) until a
// step is complete, every step is a URL a reload or a typed link can't skip
// past, Review's cards jump back and Done returns, the draft survives a
// reload until the board is made, and a custom board sends its kickoff.

import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { createMemoryRouter, RouterProvider } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { CreateGameInput, PaymentConfig, ScheduleEvent } from "../../../shared/types";

vi.mock("../../lib/native", async (orig) => {
  const real = await orig<typeof import("../../lib/native")>();
  return { ...real, haptic: vi.fn(async () => {}), platform: () => "web" };
});
vi.mock("../../components/ui/confetti", () => ({ celebrate: vi.fn(), CELEBRATION_COLORS: [], prefersReducedMotion: () => true }));

const { ToastProvider } = await import("../../components/ui");
const { setProfile } = await import("../../lib/identity");
const { default: CreateGame } = await import("../../pages/CreateGame");
const { DRAFT_KEY } = await import("./wizard");
const { defaultKickoff } = await import("./kickoff");

const TEST: PaymentConfig = { mode: "test", priceCents: 499, currency: "usd", stripePublishableKey: null, iapProductId: "com.jaxsquares.app.board" };
const HOUR = 3_600_000;
const NOW = Date.now();

function game(id: string, startsAt: number, away: [string, string], home: [string, string]): ScheduleEvent {
  return {
    eventId: id,
    league: "nfl",
    name: `${away[0]} at ${home[0]}`,
    shortName: `${away[1]} @ ${home[1]}`,
    startsAt,
    away: { name: away[0], abbr: away[1], color: "#123456" },
    home: { name: home[0], abbr: home[1], color: "#654321" },
    state: "pre",
  };
}

const EVENTS = [
  game("e1", NOW + 3 * HOUR, ["Philadelphia Eagles", "PHI"], ["Minnesota Vikings", "MIN"]),
  game("e2", NOW + 5 * HOUR, ["Green Bay Packers", "GB"], ["Arizona Cardinals", "ARI"]),
];

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
let posted: CreateGameInput[];

beforeEach(() => {
  cleanup();
  posted = [];
  sessionStorage.clear();
  setProfile({ name: "Jordan" });
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: string, init: RequestInit = {}) => {
      const url = String(input);
      const method = init.method ?? "GET";
      if (url.includes("/api/schedule")) {
        return url.includes("league=nfl") ? json({ events: EVENTS, week: null, weeks: [] }) : json({ events: [], unavailable: true });
      }
      if (url.endsWith("/api/config")) return json({ payments: TEST, vapidPublicKey: null });
      if (method === "POST" && url.endsWith("/api/games")) {
        const body = JSON.parse(String(init.body)) as CreateGameInput;
        posted.push(body);
        // Open right away: the host fee is due at the draw, not now.
        return json({ game: { id: "g1", ...body, status: "open", paid: false }, adminToken: "admin-g1", paymentRequired: false }, 201);
      }
      return json({ error: "not found" }, 404);
    }),
  );
});

function renderFlow(entries: string[] = ["/", "/new"]) {
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
const reviewCard = (step: string) => screen.getAllByTestId("review-edit").find((el) => el.getAttribute("data-step") === step)!;

async function nextTo(...steps: string[]) {
  for (const step of steps) {
    next();
    await onStep(step);
  }
}

function pickDollars() {
  fireEvent.click(screen.getAllByTestId("rules-choice-option").find((el) => el.getAttribute("data-choice") === "$")!);
}

function pickPrice(price: number) {
  fireEvent.click(screen.getAllByTestId("price-chip").find((el) => el.getAttribute("data-price") === String(price))!);
}

/** The prize amount fields on the prizes step, in game order (square then reverse at each moment). */
function amounts(): string[] {
  return screen.getAllByTestId("rule-amount").map((el) => (el as HTMLInputElement).value);
}

async function customTeams(x = "Chiefs", y = "Eagles") {
  fireEvent.click(await screen.findByTestId("custom-matchup"));
  fireEvent.change(await screen.findByTestId("team-x-input"), { target: { value: x } });
  fireEvent.change(screen.getByTestId("team-y-input"), { target: { value: y } });
}

describe("the create flow", () => {
  it("starts on the soonest game; tapping a game picks it and moves on, Back keeps it", async () => {
    const router = renderFlow();
    await onStep("game");
    const options = await screen.findAllByTestId("game-option");
    expect(options[0]).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("progressbar")).toHaveAttribute("aria-valuetext", "Step 1 of 5: The game");

    fireEvent.click(options[1]);
    await onStep("format");
    expect(router.state.location.search).toBe("?step=format");
    expect(screen.getByRole("progressbar")).toHaveAttribute("aria-valuenow", "2");

    fireEvent.click(screen.getByTestId("wizard-back"));
    await onStep("game");
    expect((await screen.findAllByTestId("game-option"))[1]).toHaveAttribute("aria-pressed", "true");
  });

  it("takes the defaults in Next ×3 after the pick, flags the unset price on Review, and creates the linked board", async () => {
    const router = renderFlow();
    await onStep("game");
    fireEvent.click((await screen.findAllByTestId("game-option"))[0]);
    await onStep("format");
    expect(screen.getByTestId("wizard-next")).toHaveTextContent("Next");
    await nextTo("prizes");
    // Nothing chosen: the host can skip, and Review says so.
    expect(screen.getByTestId("wizard-next")).toHaveTextContent("Skip for now");
    await nextTo("details", "review");
    expect(screen.getByTestId("review-prizes")).toHaveAttribute("data-state", "unset");
    expect(reviewCard("prizes")).toHaveTextContent("Square price: not set");
    expect(reviewCard("game")).toHaveTextContent("Eagles @ Vikings");

    await act(async () => void fireEvent.click(screen.getByTestId("create-submit")));
    await waitFor(() => expect(router.state.location.pathname).toBe("/g/g1"));
    expect(posted).toHaveLength(1);
    expect(posted[0].linkedEvent).toMatchObject({ eventId: "e1" });
    expect(posted[0]).not.toHaveProperty("startsAt");
    expect(posted[0].name).toBe("Eagles vs Vikings Squares");
    // The flow's steps were rewound first: Back from the board goes Home, not into a finished flow.
    expect(sessionStorage.getItem(DRAFT_KEY)).toBeNull();
    await act(async () => void router.navigate(-1));
    expect(router.state.location.pathname).toBe("/");
  });

  it("keeps Next waiting, with the reason, until both custom teams are in", async () => {
    renderFlow();
    await onStep("game");
    fireEvent.click(await screen.findByTestId("custom-matchup"));
    const button = await screen.findByTestId("wizard-next");
    expect(button).toHaveAttribute("aria-disabled", "true");
    expect(screen.getByRole("status")).toHaveTextContent("Add both teams to continue");
    fireEvent.click(button);
    expect(await screen.findByRole("alert")).toHaveTextContent(/Add both teams/);
    expect(screen.getByTestId("wizard-step")).toHaveAttribute("data-step", "game");

    fireEvent.change(screen.getByTestId("team-x-input"), { target: { value: "Chiefs" } });
    expect(screen.getByRole("status")).toHaveTextContent("Add the home team to continue");
    fireEvent.change(screen.getByTestId("team-y-input"), { target: { value: "Eagles" } });
    expect(screen.getByTestId("wizard-next")).not.toHaveAttribute("aria-disabled");
    await nextTo("format");
  });

  it("sends a custom board's kickoff: next Sunday 1:00 PM to start, a chip to change it, or no set time", async () => {
    renderFlow();
    await onStep("game");
    await customTeams();
    const picker = await screen.findByTestId("custom-kickoff");
    const start = defaultKickoff(Date.now());
    expect(within(picker).getByTestId("kickoff-input")).toHaveValue(
      `${new Date(start).getFullYear()}-${String(new Date(start).getMonth() + 1).padStart(2, "0")}-${String(new Date(start).getDate()).padStart(2, "0")}T13:00`,
    );
    fireEvent.click(within(picker).getAllByTestId("kickoff-time").find((el) => el.getAttribute("data-time") === "16:25")!);
    await nextTo("format", "prizes", "details", "review");
    expect(screen.getByTestId("review-kickoff")).toHaveTextContent(/Kicks off .*4:25 PM/);

    // Back to the game from Review: no set time this time; Done returns to Review.
    fireEvent.click(reviewCard("game"));
    await onStep("game");
    fireEvent.click(await screen.findByTestId("kickoff-none"));
    expect(screen.getByTestId("kickoff-none")).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByTestId("wizard-next")).toHaveTextContent("Done");
    next();
    await onStep("review");
    expect(screen.getByTestId("review-kickoff")).toHaveTextContent("No set time");

    await act(async () => void fireEvent.click(screen.getByTestId("create-submit")));
    await waitFor(() => expect(posted).toHaveLength(1));
    expect(posted[0].startsAt).toBeNull();
    expect(posted[0].linkedEvent).toBeNull();
  });

  it("shows the lineup players will see once prizes are set from Review (the suggested amounts, filled in)", async () => {
    renderFlow();
    await onStep("game");
    await customTeams();
    await nextTo("format", "prizes", "details", "review");
    fireEvent.click(reviewCard("prizes"));
    await onStep("prizes");
    pickDollars();
    pickPrice(10);
    expect(amounts()).toEqual(["200", "200", "200", "400"]);
    next();
    await onStep("review");
    expect(screen.getByTestId("review-prizes")).toHaveAttribute("data-state", "set");
    expect(reviewCard("prizes")).toHaveTextContent("$10 a square · Q1 $200 · Half $200 · Q3 $200 · Final $400");
    await act(async () => void fireEvent.click(screen.getByTestId("create-submit")));
    await waitFor(() => expect(posted).toHaveLength(1));
    expect(posted[0].format.rules?.map((r) => r.square?.amount)).toEqual([200, 200, 200, 400]);
  });

  it("fills the suggested amounts in as the setup changes, until the host types one; then Use suggested amounts", async () => {
    renderFlow();
    await onStep("game");
    await customTeams();
    await nextTo("format", "prizes");
    pickDollars();
    pickPrice(10);
    expect(amounts()).toEqual(["200", "200", "200", "400"]);
    expect(screen.getByTestId("prizes-suggest")).toHaveAttribute("aria-pressed", "true");
    // A new price fills them in again.
    pickPrice(20);
    expect(amounts()).toEqual(["400", "400", "400", "800"]);
    // So does the game type and reverse (back on the format step).
    fireEvent.click(screen.getByTestId("wizard-back"));
    await onStep("format");
    fireEvent.click(screen.getAllByTestId("format-option").find((el) => el.getAttribute("data-format") === "halves")!);
    fireEvent.click(screen.getByTestId("format-reverse"));
    await nextTo("prizes");
    expect(amounts()).toEqual(["740", "80", "1100", "80"]);
    expect(screen.getByTestId("prizes-basis")).toHaveTextContent("From the $2,000 board total");

    // The host types an amount: nothing changes by itself after that.
    const half = screen.getAllByTestId("rule-amount").find((el) => el.getAttribute("data-moment") === "q2" && el.getAttribute("data-side") === "square")!;
    fireEvent.change(half, { target: { value: "500" } });
    pickPrice(10);
    expect(amounts()).toEqual(["500", "80", "1100", "80"]);
    const button = screen.getByRole("button", { name: /^Use suggested amounts/ });
    expect(button).toHaveAttribute("aria-pressed", "false");
    expect(screen.getByTestId("prizes-basis")).toHaveTextContent("From the $1,000 board total");
    fireEvent.click(button);
    expect(amounts()).toEqual(["370", "40", "550", "40"]);
    // Following again: a new price fills them in.
    pickPrice(5);
    expect(amounts()).toEqual(["180", "20", "280", "20"]);
  });

  it("every score: amounts by score type and the final's rest, and Review's lineup", async () => {
    renderFlow();
    await onStep("game");
    await customTeams();
    await nextTo("format");
    fireEvent.click(screen.getAllByTestId("format-option").find((el) => el.getAttribute("data-format") === "every-score")!);
    fireEvent.click(screen.getByTestId("every-score-reverse"));
    await nextTo("prizes");
    pickDollars();
    pickPrice(10);
    // Amount by score type is on by default.
    const kinds = screen.getAllByTestId("score-kind-amount").map((el) => [el.getAttribute("data-kind"), (el as HTMLInputElement).value]);
    expect(kinds).toEqual([
      ["touchdown", "20"],
      ["fieldGoal", "10"],
      ["extraPoint", "5"],
      ["twoPoint", "10"],
      ["safety", "10"],
    ]);
    expect(screen.getByTestId("final-rest-field")).toHaveTextContent("The rest");
    expect(screen.getByTestId("prize-budget")).toHaveTextContent("Score prizes come out of the $1,000 board total during the game; the final gets the rest.");
    expect(screen.getByTestId("prize-estimate")).toHaveTextContent("A typical game uses about $430, leaving about $570 for the final.");
    next();
    await onStep("details");
    next();
    await onStep("review");
    expect(reviewCard("prizes")).toHaveTextContent("$10 a square · $5–$20 every score · $40 reverse each quarter · Final: the rest");
    await act(async () => void fireEvent.click(screen.getByTestId("create-submit")));
    await waitFor(() => expect(posted).toHaveLength(1));
    const rules = posted[0].format.rules!;
    expect(rules[0].square?.byKind).toEqual({ touchdown: 20, fieldGoal: 10, extraPoint: 5, twoPoint: 10, safety: 10 });
    expect(rules.find((r) => r.moment === "final")?.square).toEqual({ amount: null, note: "", rest: true });
  });

  it("can't be deep-linked past an incomplete step", async () => {
    // A saved draft on custom teams with only one typed: Review falls back to the step that needs the other.
    renderFlow();
    await onStep("game");
    await customTeams("Chiefs", "");
    cleanup();
    const router = renderFlow(["/new?step=review"]);
    await onStep("game");
    await waitFor(() => expect(router.state.location.search).toBe("?step=game"));
    expect(screen.getByRole("status")).toHaveTextContent("Add the home team to continue");
  });

  it("goes straight to Review on a deep link when every step already has what it needs", async () => {
    const router = renderFlow(["/new?step=review"]);
    await onStep("review");
    expect(router.state.location.search).toBe("?step=review");
    expect(reviewCard("game")).toHaveTextContent("Eagles @ Vikings");
  });

  it("keeps the draft through a reload, on the same step", async () => {
    renderFlow();
    await onStep("game");
    await customTeams("Bills", "Jets");
    await nextTo("format");
    fireEvent.click(screen.getAllByTestId("format-option").find((el) => el.getAttribute("data-format") === "final")!);
    cleanup();

    renderFlow(["/new?step=format"]);
    await onStep("format");
    expect(screen.getAllByTestId("format-option").find((el) => el.getAttribute("data-format") === "final")).toHaveAttribute("aria-checked", "true");
    fireEvent.click(screen.getByTestId("wizard-back"));
    await onStep("game");
    expect(await screen.findByTestId("team-x-input")).toHaveValue("Bills");
    expect(screen.getByTestId("team-y-input")).toHaveValue("Jets");
  });

  it("asks a new device for the host's name on Final touches", async () => {
    setProfile({ name: "" });
    renderFlow();
    await onStep("game");
    await customTeams();
    await nextTo("format", "prizes", "details");
    expect(screen.getByTestId("wizard-next")).toHaveAttribute("aria-disabled", "true");
    expect(screen.getByRole("status")).toHaveTextContent("Add your name to continue");
    fireEvent.change(screen.getByTestId("host-name"), { target: { value: "Sam" } });
    await nextTo("review");
    expect(reviewCard("details")).toHaveTextContent("Hosted by Sam");
  });
});
