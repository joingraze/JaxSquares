// The create flow for basketball, end to end with the server faked: the sport
// switch at the top of the game step, the leagues' chips and the day list, the
// format step's cards for the game (no Every score; halves for men's college),
// a custom basketball board scored by hand (NBA teams, "Tip-off"), and
// landing on basketball when football has nothing to link.

import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { createMemoryRouter, RouterProvider } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { CreateGameInput, League, PaymentConfig, ScheduleEvent } from "../../../shared/types";

vi.mock("../../lib/native", async (orig) => {
  const real = await orig<typeof import("../../lib/native")>();
  return { ...real, haptic: vi.fn(async () => {}), platform: () => "web" };
});
vi.mock("../../components/ui/confetti", () => ({ celebrate: vi.fn(), CELEBRATION_COLORS: [], prefersReducedMotion: () => true }));

const { ToastProvider } = await import("../../components/ui");
const { setProfile } = await import("../../lib/identity");
const { default: CreateGame } = await import("../../pages/CreateGame");
const { clearScheduleCache } = await import("./useSchedule");

const TEST: PaymentConfig = { mode: "test", priceCents: 499, currency: "usd", stripePublishableKey: null, iapProductId: "com.jaxsquares.app.board" };
const HOUR = 3_600_000;
// Noon on a fixed day (local time), so "today's games" (a couple of hours out)
// are still today and the day list's labels don't depend on when the suite runs.
vi.useFakeTimers({ toFake: ["Date"] });
vi.setSystemTime(new Date(2026, 9, 18, 12, 0, 0));
const NOW = Date.now();

function game(league: League, id: string, startsAt: number, away: [string, string], home: [string, string], extra: Partial<ScheduleEvent> = {}): ScheduleEvent {
  return {
    eventId: id,
    league: league as ScheduleEvent["league"],
    name: `${away[0]} at ${home[0]}`,
    shortName: `${away[1]} @ ${home[1]}`,
    startsAt,
    away: { name: away[0], abbr: away[1], color: "#123456" },
    home: { name: home[0], abbr: home[1], color: "#654321" },
    state: "pre",
    ...extra,
  };
}

const NFL = [game("nfl", "e1", NOW + 3 * HOUR, ["Philadelphia Eagles", "PHI"], ["Minnesota Vikings", "MIN"])];
const NBA = [
  game("nba", "n1", NOW + 2 * HOUR, ["Boston Celtics", "BOS"], ["Los Angeles Lakers", "LAL"]),
  game("nba", "n2", NOW + 26 * HOUR, ["Miami Heat", "MIA"], ["Denver Nuggets", "DEN"]),
];
const NCAAM = [game("ncaab", "m1", NOW + 4 * HOUR, ["Vermont Catamounts", "UVM"], ["Duke Blue Devils", "DUKE"], { ranks: { home: 2 } })];

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
let posted: CreateGameInput[];
let footballGames: boolean;
let scheduleCalls: string[];

beforeEach(() => {
  cleanup();
  clearScheduleCache();
  posted = [];
  scheduleCalls = [];
  footballGames = true;
  sessionStorage.clear();
  setProfile({ name: "Jordan" });
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: string, init: RequestInit = {}) => {
      const url = new URL(String(input), "http://x");
      const method = init.method ?? "GET";
      if (url.pathname.endsWith("/api/schedule")) {
        const league = url.searchParams.get("league");
        scheduleCalls.push(league ?? "");
        if (league === "nfl" && footballGames) return json({ events: NFL, week: null, weeks: [] });
        if (league === "nba") return json({ events: NBA, dates: ["20261019"] });
        if (league === "ncaab") return json({ events: NCAAM, dates: ["20261019"] });
        return json({ events: [], unavailable: true });
      }
      if (url.pathname.endsWith("/api/config")) return json({ payments: TEST, vapidPublicKey: null });
      if (method === "POST" && url.pathname.endsWith("/api/games")) {
        const body = JSON.parse(String(init.body)) as CreateGameInput;
        posted.push(body);
        return json({ game: { id: "g1", ...body, status: "open", paid: false }, adminToken: "admin-g1", paymentRequired: false }, 201);
      }
      return json({ error: "not found" }, 404);
    }),
  );
});

function renderFlow() {
  const router = createMemoryRouter(
    [
      { path: "/", element: <p>Home page</p> },
      { path: "/new", element: <CreateGame /> },
      { path: "/g/:id", element: <p>Board page</p> },
    ],
    { initialEntries: ["/", "/new"], initialIndex: 1 },
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
const formats = () => screen.getAllByTestId("format-option").map((el) => el.getAttribute("data-format"));

/** Next through the steps after the current one, to Review. */
async function toReview() {
  const steps = ["game", "format", "prizes", "details", "review"];
  const from = steps.indexOf(screen.getByTestId("wizard-step").getAttribute("data-step") ?? "game");
  for (const step of steps.slice(from + 1)) {
    next();
    await onStep(step);
  }
}

describe("making a basketball board", () => {
  it("switches sport at the top of the game step: basketball's leagues, today's games picked, no football weeks", async () => {
    renderFlow();
    await onStep("game");
    await screen.findAllByTestId("week-toggle");
    expect(screen.getByTestId("sport-football")).toHaveAttribute("aria-checked", "true");
    expect(scheduleCalls).toEqual(["nfl", "ncaaf"]);

    fireEvent.click(screen.getByTestId("sport-basketball"));
    await screen.findByTestId("day-list");
    expect(screen.getAllByTestId("league-option").map((c) => c.getAttribute("data-league"))).toEqual(["nba", "wnba", "ncaab", "ncaaw"]);
    expect(screen.getAllByTestId("league-option")[0]).toHaveAttribute("aria-checked", "true");
    expect(scheduleCalls.sort()).toEqual(["nba", "ncaab", "ncaaf", "ncaaw", "nfl", "wnba"]);
    const rows = screen.getAllByTestId("game-option");
    expect(rows[0]).toHaveAttribute("aria-pressed", "true");
    expect(rows[0].getAttribute("aria-label")).toMatch(/^Boston Celtics at Los Angeles Lakers/);
    expect(screen.queryByTestId("week-toggle")).toBeNull();
    expect(screen.getAllByTestId("day-toggle")[0]).toHaveTextContent(/Today/);
  });

  it("offers basketball's cards on the format step and creates a linked NBA board", async () => {
    renderFlow();
    await onStep("game");
    fireEvent.click(await screen.findByTestId("sport-basketball"));
    await screen.findByTestId("day-list");
    next();
    await onStep("format");
    expect(formats()).toEqual(["quarters", "halves", "final"]);
    await toReview();
    expect(screen.getByText(/Celtics @ Lakers/)).toBeTruthy();
    fireEvent.click(screen.getByTestId("create-submit"));
    await waitFor(() => expect(posted).toHaveLength(1));
    expect(posted[0]).toMatchObject({ sport: "basketball", league: "nba", linkedEvent: { league: "nba", eventId: "n1" }, name: "Celtics vs Lakers Squares" });
    expect(posted[0].format.rules?.map((r) => r.moment)).toEqual(["q1", "q2", "q3", "final"]);
  });

  it("men's college plays halves: Halftime + Final and the Final only, and a quarters board fits itself", async () => {
    renderFlow();
    await onStep("game");
    fireEvent.click(await screen.findByTestId("sport-basketball"));
    await screen.findByTestId("day-list");
    fireEvent.click(screen.getAllByTestId("league-option").find((c) => c.getAttribute("data-league") === "ncaab")!);
    const row = await screen.findByRole("button", { name: /Vermont Catamounts at Duke Blue Devils/ });
    expect(row.textContent).toMatch(/2Duke/);
    fireEvent.click(row);
    await onStep("format");
    expect(formats()).toEqual(["halves", "final"]);
    expect(screen.getAllByTestId("format-option")[0]).toHaveAttribute("aria-checked", "true");
    expect(screen.queryByTestId("format-fresh")).toBeTruthy();
    expect(screen.getByText("New numbers each half")).toBeTruthy();
    await toReview();
    fireEvent.click(screen.getByTestId("create-submit"));
    await waitFor(() => expect(posted).toHaveLength(1));
    expect(posted[0]).toMatchObject({ sport: "basketball", league: "ncaab" });
    expect(posted[0].format.rules?.map((r) => r.moment)).toEqual(["q2", "final"]);
  });

  it("turns a football Every score board into basketball's quarters on the switch", async () => {
    renderFlow();
    await onStep("game");
    await screen.findAllByTestId("week-toggle");
    next();
    await onStep("format");
    fireEvent.click(screen.getAllByTestId("format-option").find((el) => el.getAttribute("data-format") === "every-score")!);
    expect(formats()).toContain("every-score");
    fireEvent.click(screen.getByTestId("wizard-back"));
    await onStep("game");
    fireEvent.click(screen.getByTestId("sport-basketball"));
    await screen.findByTestId("day-list");
    next();
    await onStep("format");
    expect(formats()).toEqual(["quarters", "halves", "final"]);
    expect(screen.getAllByTestId("format-option")[0]).toHaveAttribute("aria-checked", "true");
    expect(screen.queryByText(/Every score options/)).toBeNull();
  });

  it("makes a custom basketball board: NBA teams, a tip-off, the host scores it", async () => {
    renderFlow();
    await onStep("game");
    fireEvent.click(await screen.findByTestId("sport-basketball"));
    fireEvent.click(await screen.findByTestId("custom-matchup"));
    const picker = await screen.findByTestId("custom-kickoff");
    expect(within(picker).getByText("Tip-off")).toBeTruthy();
    expect(screen.getByRole("listbox", { name: "Popular teams" }).textContent).toMatch(/Lakers/);
    fireEvent.change(screen.getByTestId("team-x-input"), { target: { value: "Knicks" } });
    fireEvent.change(screen.getByTestId("team-y-input"), { target: { value: "Celtics" } });
    await toReview();
    expect(screen.getByTestId("review-kickoff")).toHaveTextContent(/Tips off/);
    fireEvent.click(screen.getByTestId("create-submit"));
    await waitFor(() => expect(posted).toHaveLength(1));
    expect(posted[0]).toMatchObject({
      sport: "basketball",
      league: "custom",
      linkedEvent: null,
      teamX: { name: "New York Knicks", abbr: "NY" },
      teamY: { name: "Boston Celtics", abbr: "BOS" },
      name: "Knicks vs Celtics Squares",
    });
  });

  it("lands on basketball when football has nothing to link", async () => {
    footballGames = false;
    renderFlow();
    await onStep("game");
    await screen.findByTestId("day-list");
    expect(screen.getByTestId("sport-basketball")).toHaveAttribute("aria-checked", "true");
    expect(screen.getAllByTestId("game-option")[0]).toHaveAttribute("aria-pressed", "true");
  });
});
