// The game picker a week at a time: this week's soonest games up front, later
// weeks load only when opened, a pick from a later week stays visible, and
// games abroad say where they're played.

import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { useState } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { BoardSport } from "../../../shared/sports";
import type { ScheduleEvent, ScheduleWeek } from "../../../shared/types";
import type { PickerTab } from "./GamePicker";

vi.mock("../../lib/native", async (orig) => {
  const real = await orig<typeof import("../../lib/native")>();
  return { ...real, haptic: vi.fn(async () => {}) };
});

const { GamePicker } = await import("./GamePicker");

const HOUR = 3_600_000;
const DAY = 24 * HOUR;
const NOW = Date.now();

function game(id: string, startsAt: number, away: [string, string], home: [string, string], extra: Partial<ScheduleEvent> = {}): ScheduleEvent {
  return {
    eventId: id,
    league: "nfl",
    name: `${away[0]} at ${home[0]}`,
    shortName: `${away[1]} @ ${home[1]}`,
    startsAt,
    away: { name: away[0], abbr: away[1] },
    home: { name: home[0], abbr: home[1] },
    state: "pre",
    ...extra,
  };
}

const week = (id: string, label: string, startsAt: number): ScheduleWeek => ({ id, label, startsAt, endsAt: startsAt + 7 * DAY });

const THIS_WEEK = [
  game("london", NOW + 9 * HOUR, ["Houston Texans", "HOU"], ["Jacksonville Jaguars", "JAX"], {
    neutralSite: true,
    venue: { name: "Wembley Stadium", city: "London", country: "England" },
  }),
  game("a", NOW + 12 * HOUR, ["Baltimore Ravens", "BAL"], ["Cleveland Browns", "CLE"]),
  game("b", NOW + 12 * HOUR, ["Carolina Panthers", "CAR"], ["Philadelphia Eagles", "PHI"]),
  game("c", NOW + 15 * HOUR, ["Denver Broncos", "DEN"], ["Las Vegas Raiders", "LV"]),
];
const WEEK_7 = [game("w7", NOW + 5 * DAY, ["New England Patriots", "NE"], ["Chicago Bears", "CHI"])];

const json = (body: unknown) => new Response(JSON.stringify(body), { headers: { "content-type": "application/json" } });
let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  fetchMock = vi.fn(async (input: string) => {
    const url = new URL(String(input), "http://x");
    if (url.searchParams.get("week") === "2-7") return json({ events: WEEK_7, week: week("2-7", "Week 7", NOW + 4 * DAY) });
    return json({ events: [], unavailable: true });
  });
  vi.stubGlobal("fetch", fetchMock);
});

const none = { loading: false, events: [], week: null, weeks: [], dates: [] };
const BASKETBALL_NONE = { nba: none, wnba: none, ncaab: none, ncaaw: none, mls: none, nwsl: none, epl: none, laliga: none, ligamx: none, ucl: none };

function Harness() {
  const [selected, setSelected] = useState<ScheduleEvent | null>(THIS_WEEK[0]);
  return (
    <GamePicker
      schedule={{
        nfl: { loading: false, events: THIS_WEEK, week: week("2-6", "Week 6", NOW - DAY), weeks: [week("2-7", "Week 7", NOW + 4 * DAY), week("2-8", "Week 8", NOW + 11 * DAY)], dates: [] },
        ncaaf: none,
        ...BASKETBALL_NONE,
      }}
      tab="nfl"
      onTab={() => {}}
      selected={selected}
      onPickEvent={setSelected}
      custom={{ x: "", y: "" }}
      onCustomChange={() => {}}
    />
  );
}

describe("GamePicker weeks", () => {
  it("shows this week's soonest games and later weeks closed", () => {
    render(<Harness />);
    expect(screen.getAllByTestId("game-option")).toHaveLength(3);
    expect(screen.getByText("This week")).toBeTruthy();
    expect(screen.getByRole("button", { name: /See all 4 games/ })).toBeTruthy();
    const toggles = screen.getAllByTestId("week-toggle");
    expect(toggles.map((t) => [t.dataset.week, t.getAttribute("aria-expanded")])).toEqual([
      ["2-6", "true"],
      ["2-7", "false"],
      ["2-8", "false"],
    ]);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(screen.getByText(/^Times in /)).toBeTruthy();
  });

  it("says where a game abroad is played", () => {
    render(<Harness />);
    expect(screen.getByText("London · Wembley Stadium")).toBeTruthy();
  });

  it("loads a later week when it's opened, and keeps a pick from it on screen", async () => {
    render(<Harness />);
    fireEvent.click(screen.getByRole("button", { name: /Week 7/ }));
    const pats = await screen.findByRole("button", { name: /New England Patriots at Chicago Bears/ });
    expect(String(fetchMock.mock.calls[0][0])).toContain("/schedule?league=nfl&week=2-7");
    fireEvent.click(pats);
    expect(pats.getAttribute("aria-pressed")).toBe("true");

    // Back to this week: the Week 7 pick is pinned above it.
    fireEvent.click(screen.getByRole("button", { name: /Week 6/ }));
    await waitFor(() => expect(screen.getAllByTestId("game-option")[0].getAttribute("aria-label")).toMatch(/New England Patriots/));
    expect(screen.getAllByTestId("game-option")[0].getAttribute("aria-pressed")).toBe("true");
  });

  it("searches this week's games", () => {
    render(<Harness />);
    fireEvent.change(screen.getByTestId("game-search"), { target: { value: "raiders" } });
    const rows = screen.getAllByTestId("game-option");
    expect(rows).toHaveLength(1);
    expect(within(rows[0]).getByText("Raiders")).toBeTruthy();
  });
});

describe("GamePicker basketball", () => {
  /** A local time `days` from today at `hour`:30. */
  const at = (days: number, hour: number) => {
    const d = new Date(NOW);
    d.setHours(hour, 30, 0, 0);
    d.setDate(d.getDate() + days);
    return d.getTime();
  };
  const hoops = (id: string, startsAt: number, away: [string, string], home: [string, string], extra: Partial<ScheduleEvent> = {}) =>
    game(id, startsAt, away, home, { league: "nba", ...extra });
  const NBA_WEEK = [
    hoops("t1", at(0, 19), ["Boston Celtics", "BOS"], ["Los Angeles Lakers", "LAL"]),
    hoops("t2", at(0, 20), ["Miami Heat", "MIA"], ["Denver Nuggets", "DEN"]),
    hoops("m1", at(1, 19), ["Golden State Warriors", "GS"], ["New York Knicks", "NY"]),
    hoops("x1", at(3, 18), ["Chicago Bulls", "CHI"], ["Phoenix Suns", "PHX"]),
  ];
  const APRIL = [hoops("apr", Date.parse("2027-04-02T23:30:00Z"), ["Orlando Magic", "ORL"], ["Utah Jazz", "UTAH"])];
  const MARCH = [
    game("mm", at(1, 12), ["Vermont Catamounts", "UVM"], ["Duke Blue Devils", "DUKE"], { league: "ncaab", ranks: { home: 2 }, neutralSite: true, venue: { name: "Lenovo Center", city: "Raleigh", country: "USA" } }),
  ];

  function Hoops({ nba = NBA_WEEK, start = "nba" as const }: { nba?: ScheduleEvent[]; start?: "nba" | "ncaab" }) {
    const [selected, setSelected] = useState<ScheduleEvent | null>(null);
    const [tab, setTab] = useState<PickerTab>(start);
    const [sport, setSport] = useState<BoardSport>("basketball");
    return (
      <GamePicker
        schedule={{
          nfl: { loading: false, events: THIS_WEEK, week: week("2-6", "Week 6", NOW - DAY), weeks: [], dates: [] },
          ncaaf: none,
          ...BASKETBALL_NONE,
          nba: { loading: false, events: nba, week: null, weeks: [], dates: ["20261019", "20261020"] },
          ncaab: { loading: false, events: MARCH, week: null, weeks: [], dates: [] },
        }}
        sport={sport}
        onSport={(s) => {
          setSport(s);
          setTab(s === "football" ? "nfl" : s === "soccer" ? "mls" : "nba");
        }}
        tab={tab}
        onTab={setTab}
        selected={selected}
        onPickEvent={setSelected}
        custom={{ x: "", y: "" }}
        onCustomChange={() => {}}
      />
    );
  }

  it("shows the sport switch and basketball's league chips with their game counts", () => {
    render(<Hoops />);
    expect(screen.getByTestId("sport-basketball")).toHaveAttribute("aria-checked", "true");
    const chips = screen.getAllByTestId("league-option");
    expect(chips.map((c) => c.textContent)).toEqual(["NBA4", "WNBA", "Men's college1", "Women's college"]);
    expect(chips[0]).toHaveAttribute("aria-checked", "true");
    expect(screen.getByTestId("custom-matchup")).toHaveAttribute("data-league", "custom");
  });

  it("lists the next days' games by day, today first and open", () => {
    render(<Hoops />);
    const days = screen.getAllByTestId("day-toggle");
    expect(days.map((d) => d.textContent?.replace(/\s+/g, " "))).toEqual([
      expect.stringMatching(/^Today2 games/),
      expect.stringMatching(/^Tomorrow1 game/),
      expect.stringMatching(/1 game$/),
    ]);
    expect(days.map((d) => d.getAttribute("aria-expanded"))).toEqual(["true", "false", "false"]);
    expect(screen.getAllByTestId("game-option").map((r) => r.getAttribute("aria-label"))).toEqual([
      expect.stringMatching(/^Boston Celtics at Los Angeles Lakers/),
      expect.stringMatching(/^Miami Heat at Denver Nuggets/),
    ]);
    fireEvent.click(days[1]);
    expect(screen.getAllByTestId("game-option").map((r) => r.getAttribute("aria-label"))).toEqual([expect.stringMatching(/^Golden State Warriors at New York Knicks/)]);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("searches across the days", () => {
    render(<Hoops />);
    fireEvent.change(screen.getByTestId("game-search"), { target: { value: "suns" } });
    const rows = screen.getAllByTestId("game-option");
    expect(rows).toHaveLength(1);
    expect(within(rows[0]).getByText("Suns")).toBeTruthy();
  });

  it("loads another date from the date picker", async () => {
    fetchMock.mockImplementation(async (input: string) => {
      const url = new URL(String(input), "http://x");
      return url.searchParams.get("date") === "20270402" ? json({ events: APRIL, dates: ["20270402"] }) : json({ events: [], unavailable: true });
    });
    render(<Hoops />);
    const picker = screen.getByTestId("day-picker");
    expect(picker.className).toMatch(/\btext-body\b/);
    fireEvent.change(picker, { target: { value: "2027-04-02" } });
    const row = await screen.findByRole("button", { name: /Orlando Magic at Utah Jazz/ });
    expect(String(fetchMock.mock.calls[0][0])).toContain("/schedule?league=nba&date=20270402");
    fireEvent.click(row);
    expect(row).toHaveAttribute("aria-pressed", "true");
  });

  it("says when a league has no games this week, and still offers a date", () => {
    render(<Hoops nba={[]} />);
    expect(screen.getByTestId("no-games").textContent).toMatch(/No NBA games to link in the next 7 days/);
    expect(screen.getByTestId("day-picker")).toBeTruthy();
  });

  it("shows college ranks and neutral sites", () => {
    render(<Hoops start="ncaab" />);
    const [row] = screen.getAllByTestId("game-option");
    expect(row.textContent).toMatch(/2Duke/);
    expect(within(row).getByText("Neutral site · Raleigh")).toBeTruthy();
  });

  it("switches back to football's weeks", () => {
    render(<Hoops />);
    fireEvent.click(screen.getByTestId("sport-football"));
    expect(screen.getAllByTestId("league-option").map((c) => c.getAttribute("data-league"))).toEqual(["nfl", "ncaaf"]);
    expect(screen.queryByTestId("day-list")).toBeNull();
    expect(screen.getAllByTestId("week-toggle")[0]).toHaveAttribute("data-week", "2-6");
  });
});
