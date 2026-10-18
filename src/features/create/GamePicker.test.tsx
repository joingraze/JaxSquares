// The game picker a week at a time: this week's soonest games up front, later
// weeks load only when opened, a pick from a later week stays visible, and
// games abroad say where they're played.

import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { useState } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ScheduleEvent, ScheduleWeek } from "../../../shared/types";

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

function Harness() {
  const [selected, setSelected] = useState<ScheduleEvent | null>(THIS_WEEK[0]);
  return (
    <GamePicker
      schedule={{
        nfl: { loading: false, events: THIS_WEEK, week: week("2-6", "Week 6", NOW - DAY), weeks: [week("2-7", "Week 7", NOW + 4 * DAY), week("2-8", "Week 8", NOW + 11 * DAY)] },
        ncaaf: { loading: false, events: [], week: null, weeks: [] },
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
