// The create flow for goal-minute soccer, end to end with the server faked:
// the Soccer switch and its leagues (by day), soccer's format cards (Every
// goal, First & last goal, Last goal) in goal words with no fresh numbers or
// score types, a custom soccer board (any two sides, typed), no season boards,
// and landing on soccer when football and basketball have nothing to link.

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
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
const EPL = [
  game("epl", "p1", NOW + 2 * HOUR, ["Chelsea", "CHE"], ["Arsenal", "ARS"]),
  game("epl", "p2", NOW + 26 * HOUR, ["Liverpool", "LIV"], ["Everton", "EVE"]),
];

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
        if (league === "epl") return json({ events: EPL, dates: ["20261018", "20261019"] });
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

/** The Soccer switch, then the Premier League chip (the first league with games). */
async function toSoccer() {
  renderFlow();
  await onStep("game");
  fireEvent.click(await screen.findByTestId("sport-soccer"));
  await screen.findByTestId("day-list");
}

describe("making a soccer board", () => {
  it("switches to soccer: its leagues by day, the first with games picked, no season boards", async () => {
    await toSoccer();
    expect(screen.getAllByTestId("league-option").map((c) => c.getAttribute("data-league"))).toEqual(["mls", "nwsl", "epl", "laliga", "ligamx", "ucl"]);
    const epl = screen.getAllByTestId("league-option").find((c) => c.getAttribute("data-league") === "epl")!;
    expect(epl).toHaveAttribute("aria-checked", "true");
    expect(scheduleCalls).toEqual(expect.arrayContaining(["mls", "nwsl", "epl", "laliga", "ligamx", "ucl"]));
    // Basketball's leagues weren't needed.
    expect(scheduleCalls).not.toContain("nba");
    expect(screen.getAllByTestId("game-option")[0].getAttribute("aria-label")).toMatch(/^Chelsea at Arsenal/);
    expect(screen.queryByTestId("board-scope")).toBeNull();
  });

  it("offers soccer's cards in goal words and creates a linked board that wins on every goal", async () => {
    await toSoccer();
    next();
    await onStep("format");
    expect(formats()).toEqual(["every-score", "first-last", "final"]);
    expect(screen.getAllByTestId("format-option").map((el) => el.textContent)).toEqual([
      expect.stringMatching(/^Every goal.*1 winner per goal/),
      expect.stringMatching(/^First & last goal.*2 winners/),
      expect.stringMatching(/^Last goal.*1 winner/),
    ]);
    expect(screen.getAllByTestId("format-option")[0]).toHaveAttribute("aria-checked", "true");
    expect(screen.queryByTestId("format-fresh")).toBeNull();
    expect(screen.queryByText(/Every score options/)).toBeNull();
    expect(screen.getByText(/Each square is a minute/)).toBeTruthy();
    await toReview();
    expect(screen.getByText(/Chelsea @ Arsenal/)).toBeTruthy();
    fireEvent.click(screen.getByTestId("create-submit"));
    await waitFor(() => expect(posted).toHaveLength(1));
    expect(posted[0]).toMatchObject({ sport: "soccer", league: "epl", linkedEvent: { league: "epl", eventId: "p1" }, name: "Chelsea vs Arsenal Squares" });
    expect(posted[0].format.rules?.map((r) => r.moment)).toEqual(["score", "final"]);
    expect(posted[0].format.rules?.[0].square?.byKind).toBeUndefined();
    expect(posted[0].format.freshNumbers).toBe(false);
  });

  it("picks the first and last goal", async () => {
    await toSoccer();
    next();
    await onStep("format");
    fireEvent.click(screen.getAllByTestId("format-option").find((el) => el.getAttribute("data-format") === "first-last")!);
    await toReview();
    fireEvent.click(screen.getByTestId("create-submit"));
    await waitFor(() => expect(posted).toHaveLength(1));
    expect(posted[0].format.rules?.map((r) => r.moment)).toEqual(["first", "final"]);
  });

  it("turns football's quarters into every goal on the switch, and back", async () => {
    renderFlow();
    await onStep("game");
    await screen.findAllByTestId("week-toggle");
    next();
    await onStep("format");
    expect(formats()).toEqual(["quarters", "halves", "final", "every-score"]);
    fireEvent.click(screen.getByTestId("wizard-back"));
    await onStep("game");
    fireEvent.click(screen.getByTestId("sport-soccer"));
    await screen.findByTestId("day-list");
    next();
    await onStep("format");
    expect(screen.getAllByTestId("format-option")[0]).toHaveAttribute("data-format", "every-score");
    expect(screen.getAllByTestId("format-option")[0]).toHaveAttribute("aria-checked", "true");
  });

  it("makes a custom soccer board: any two sides, typed as they are", async () => {
    await toSoccer();
    fireEvent.click(screen.getByTestId("custom-matchup"));
    await screen.findByTestId("custom-kickoff");
    expect(screen.queryByRole("listbox", { name: "Popular teams" })).toBeNull();
    expect(screen.getByText(/add each goal's minute/)).toBeTruthy();
    fireEvent.change(screen.getByTestId("team-x-input"), { target: { value: "Rovers" } });
    fireEvent.change(screen.getByTestId("team-y-input"), { target: { value: "United" } });
    await toReview();
    fireEvent.click(screen.getByTestId("create-submit"));
    await waitFor(() => expect(posted).toHaveLength(1));
    expect(posted[0]).toMatchObject({ sport: "soccer", league: "custom", linkedEvent: null, teamX: { name: "Rovers" }, teamY: { name: "United" } });
  });

  it("lands on soccer when football and basketball have nothing to link", async () => {
    footballGames = false;
    renderFlow();
    await onStep("game");
    await screen.findByTestId("day-list");
    expect(screen.getByTestId("sport-soccer")).toHaveAttribute("aria-checked", "true");
    expect(screen.getAllByTestId("game-option")[0]).toHaveAttribute("aria-pressed", "true");
  });
});
