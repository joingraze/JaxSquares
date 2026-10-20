// The create flow's season path with the server faked: "A whole season", a
// team's season (team marks, its games left, playoffs joining later) or games
// picked from the league's list, the numbers choice, Review's season line and
// the season's one fee, and the POST /api/games body. Also: a team's schedule
// that can't load offers a retry and picking games, and the season draft
// survives a reload.

import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { createMemoryRouter, RouterProvider } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { CreateGameInput, PaymentConfig, ScheduleEvent, SeasonTeam } from "../../../shared/types";

vi.mock("../../lib/native", async (orig) => {
  const real = await orig<typeof import("../../lib/native")>();
  return { ...real, haptic: vi.fn(async () => {}), platform: () => "web" };
});
vi.mock("../../components/ui/confetti", () => ({ celebrate: vi.fn(), CELEBRATION_COLORS: [], prefersReducedMotion: () => true }));

const { ToastProvider } = await import("../../components/ui");
const { setProfile } = await import("../../lib/identity");
const { default: CreateGame } = await import("../../pages/CreateGame");
const { clearSeasonCache } = await import("./useSeason");

const CONFIG: PaymentConfig = {
  mode: "test",
  priceCents: 499,
  currency: "usd",
  stripePublishableKey: null,
  iapProductId: "com.jaxsquares.app.board",
  season: { priceCents: 1499, iapProductId: "com.jaxsquares.app.seasonboard" },
};
const HOUR = 3_600_000;
const DAY = 24 * HOUR;
const NOW = Date.now();

const JAX: SeasonTeam = { id: "30", name: "Jacksonville Jaguars", shortName: "Jaguars", abbr: "JAX", color: "#006778" };
const MIA: SeasonTeam = { id: "15", name: "Miami Dolphins", shortName: "Dolphins", abbr: "MIA", color: "#008e97" };
const HOU: SeasonTeam = { id: "34", name: "Houston Texans", shortName: "Texans", abbr: "HOU", color: "#03202f" };

function game(id: string, startsAt: number, away: SeasonTeam, home: SeasonTeam, extra: Partial<ScheduleEvent> = {}): ScheduleEvent {
  return {
    eventId: id,
    league: "nfl",
    name: `${away.name} at ${home.name}`,
    shortName: `${away.abbr} @ ${home.abbr}`,
    startsAt,
    away: { name: away.name, abbr: away.abbr, color: away.color },
    home: { name: home.name, abbr: home.abbr, color: home.color },
    awayId: away.id,
    homeId: home.id,
    state: "pre",
    ...extra,
  };
}

/** The Jaguars' season: one played, three to come. */
const JAX_SEASON = [
  game("s0", NOW - 6 * DAY, JAX, HOU, { state: "post", result: { home: 20, away: 17 }, label: "Week 1" }),
  game("s1", NOW + 1 * DAY, MIA, JAX, { label: "Week 2" }),
  game("s2", NOW + 8 * DAY, JAX, HOU, { label: "Week 3" }),
  game("s3", NOW + 15 * DAY, HOU, JAX, { label: "Week 4" }),
];
/** This week's NFL games, for picking games. */
const WEEK = [game("w1", NOW + 3 * HOUR, MIA, JAX), game("w2", NOW + 5 * HOUR, HOU, MIA), game("w3", NOW + 7 * HOUR, JAX, HOU)];

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
let posted: CreateGameInput[];
let scheduleDown: boolean;

beforeEach(() => {
  cleanup();
  clearSeasonCache();
  posted = [];
  scheduleDown = false;
  sessionStorage.clear();
  setProfile({ name: "Jordan" });
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: string, init: RequestInit = {}) => {
      const url = String(input);
      const method = init.method ?? "GET";
      if (url.includes("/api/season/teams")) return json({ teams: [MIA, JAX, HOU] });
      if (url.includes("/api/season/schedule")) {
        if (scheduleDown) return json({ team: null, year: null, events: [], unavailable: true });
        return json({ team: JAX, year: 2026, events: JAX_SEASON });
      }
      if (url.includes("/api/schedule")) {
        return url.includes("league=nfl") ? json({ events: WEEK, week: null, weeks: [] }) : json({ events: [], unavailable: true });
      }
      if (url.endsWith("/api/config")) return json({ payments: CONFIG, vapidPublicKey: null });
      if (method === "POST" && url.endsWith("/api/games")) {
        const body = JSON.parse(String(init.body)) as CreateGameInput;
        posted.push(body);
        return json({ game: { id: "s1x", ...body, kind: "season", status: "open", paid: false }, adminToken: "admin-s1x", paymentRequired: false }, 201);
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
async function nextTo(...steps: string[]) {
  for (const step of steps) {
    next();
    await onStep(step);
  }
}

async function wholeSeason() {
  await screen.findAllByTestId("game-option");
  fireEvent.click(screen.getByTestId("board-scope-season"));
  await screen.findByTestId("season-picker");
}

describe("making a season board", () => {
  it("follows a team's season: the team grid, its games left, new numbers each game, Review's line and the season's fee", async () => {
    const router = renderFlow();
    await wholeSeason();
    expect(screen.getByRole("heading", { name: "Pick the season" })).toBeInTheDocument();
    // No custom teams for a season.
    expect(screen.queryByTestId("custom-matchup")).toBeNull();

    // The league's teams, by name, each as its abbreviation on its color: never a logo.
    const tiles = await screen.findAllByTestId("season-team");
    expect(tiles.map((t) => t.getAttribute("aria-label"))).toEqual(["Miami Dolphins", "Jacksonville Jaguars", "Houston Texans"]);
    expect(tiles[1]).toHaveTextContent("JAX");
    expect(tiles.some((t) => t.querySelector("img"))).toBe(false);

    // Next waits for a team.
    expect(screen.getByRole("status")).toHaveTextContent("Pick a team to continue");

    fireEvent.change(screen.getByTestId("season-team-search"), { target: { value: "jag" } });
    expect(screen.getAllByTestId("season-team")).toHaveLength(1);
    fireEvent.click(screen.getByTestId("season-team"));

    const card = await screen.findByTestId("season-team-card");
    await waitFor(() => expect(within(card).getByTestId("season-team-line")).toHaveTextContent("Jaguars 2026 season · 3 games so far"));
    const nextGames = within(card).getAllByTestId("season-next-game");
    expect(nextGames[0]).toHaveTextContent("Next");
    expect(nextGames[0]).toHaveTextContent("vs MIA");
    expect(nextGames[1]).toHaveTextContent("@ HOU");
    expect(within(card).getByTestId("season-playoffs-note")).toHaveTextContent("Playoff games join the season as they're set.");

    // Same numbers all season by default; switch to new numbers every game.
    expect(screen.getByTestId("season-numbers-same")).toHaveAttribute("aria-checked", "true");
    fireEvent.click(screen.getByTestId("season-numbers-fresh"));
    expect(screen.getByTestId("season-numbers-fresh")).toHaveAttribute("aria-checked", "true");

    await nextTo("format", "prizes", "details", "review");
    expect(screen.getByTestId("review-season-line")).toHaveTextContent("Jaguars 2026 season · 3 games so far");
    expect(screen.getByTestId("review-season")).toHaveTextContent("New numbers every game");
    expect(screen.getByTestId("review-season")).toHaveTextContent("Next vs MIA");
    await waitFor(() => expect(screen.getByTestId("create-fee")).toHaveTextContent("$14.99 for the whole season"));
    expect(screen.getByTestId("create-submit")).toHaveTextContent("Create season board");

    fireEvent.click(screen.getByTestId("create-submit"));
    await waitFor(() => expect(posted).toHaveLength(1));
    const body = posted[0];
    expect(body.name).toBe("Jaguars Season Squares");
    expect(body.league).toBe("nfl");
    expect(body.linkedEvent).toBeNull();
    expect(body.teamX.name).toBe("Jacksonville Jaguars");
    expect(body.teamY).toMatchObject({ name: "Opponent", abbr: "OPP" });
    expect(body.season).toMatchObject({ scope: "team", numbers: "fresh", year: 2026, team: { id: "30", name: "Jacksonville Jaguars" } });
    // Only the games still to come (the played one stays off).
    expect(body.season!.events.map((e) => e.eventId)).toEqual(["s1", "s2", "s3"]);
    expect(body.season!.events[0]).toMatchObject({ homeId: "30", awayId: "15", label: "Week 2" });
    await waitFor(() => expect(router.state.location.pathname).toBe("/g/s1x"));
  });

  it("covers games picked from the league's list, any number of them", async () => {
    renderFlow();
    await wholeSeason();
    fireEvent.click(screen.getByTestId("season-scope-games"));
    expect(await screen.findByTestId("season-picks")).toHaveAttribute("data-count", "0");
    expect(screen.getByRole("status")).toHaveTextContent("Pick at least one game to continue");

    // Rows check on their own; nothing moves on.
    const rows = screen.getAllByTestId("game-option");
    fireEvent.click(rows[0]);
    fireEvent.click(rows[2]);
    await waitFor(() => expect(screen.getByTestId("season-picks")).toHaveAttribute("data-count", "2"));
    expect(screen.getByTestId("wizard-step")).toHaveAttribute("data-step", "game");
    expect(rows[0]).toHaveAttribute("aria-pressed", "true");
    expect(rows[1]).toHaveAttribute("aria-pressed", "false");
    // A second tap drops one, a third adds it back.
    fireEvent.click(rows[2]);
    await waitFor(() => expect(screen.getByTestId("season-picks")).toHaveAttribute("data-count", "1"));
    fireEvent.click(rows[2]);

    await nextTo("format", "prizes", "details", "review");
    expect(screen.getByTestId("review-season-line")).toHaveTextContent("2 NFL games");
    fireEvent.click(screen.getByTestId("create-submit"));
    await waitFor(() => expect(posted).toHaveLength(1));
    expect(posted[0].name).toBe("NFL Season Squares");
    expect(posted[0].teamX.name).toBe("Away");
    expect(posted[0].season).toMatchObject({ scope: "games", numbers: "same" });
    expect(posted[0].season!.events.map((e) => e.eventId)).toEqual(["w1", "w3"]);
    expect(posted[0].season!.team).toBeUndefined();
  });

  it("offers a retry and picking games when a team's schedule won't load", async () => {
    scheduleDown = true;
    renderFlow();
    await wholeSeason();
    fireEvent.click((await screen.findAllByTestId("season-team"))[1]);
    expect(await screen.findByText("The schedule didn't load")).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("Couldn't load the team's games. Try again");

    scheduleDown = false;
    fireEvent.click(screen.getByTestId("season-retry"));
    await waitFor(() => expect(screen.getByTestId("season-team-line")).toHaveTextContent("Jaguars 2026 season"));

    // "Change" brings the grid back with the pick checked; Cancel keeps it.
    fireEvent.click(screen.getByTestId("season-team-change"));
    const picked = screen.getAllByTestId("season-team").find((t) => t.getAttribute("data-team-id") === "30")!;
    expect(picked).toHaveAttribute("aria-checked", "true");
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(screen.getByTestId("season-team-card")).toHaveAttribute("data-team-id", "30");
  });

  it("keeps the season, its team and numbers through a reload", async () => {
    renderFlow();
    await wholeSeason();
    fireEvent.click((await screen.findAllByTestId("season-team"))[1]);
    fireEvent.click(screen.getByTestId("season-numbers-fresh"));
    await screen.findByTestId("season-team-card");
    cleanup();

    renderFlow(["/", "/new?step=game"]);
    const card = await screen.findByTestId("season-team-card");
    expect(card).toHaveAttribute("data-team-id", "30");
    expect(screen.getByTestId("board-scope-season")).toHaveAttribute("aria-checked", "true");
    expect(screen.getByTestId("season-numbers-fresh")).toHaveAttribute("aria-checked", "true");

    // Back to one game: the league's games as before.
    fireEvent.click(screen.getByTestId("board-scope-game"));
    expect(await screen.findAllByTestId("game-option")).toHaveLength(3);
  });
});
