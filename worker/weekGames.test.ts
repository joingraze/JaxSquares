// @vitest-environment node
// "This week's games" on the NFL, college football and basketball landing
// pages: which games make the list, how they read, and the page the Worker
// serves with them (or without them, when the schedule doesn't come back).
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { WEEK_END, WEEK_START, weekSlot } from "../shared/weekGames";
import type { LinkedLeague } from "../shared/sports";
import type { ScheduleEvent } from "../shared/types";
import type { Env } from "./env";
import { scheduleVia } from "./scores";
import { WEEK_MAX_GAMES, kickoffLabel, matchup, pickGames, serveWeekPage, weekGamesHtml } from "./weekGames";

vi.mock("./scores", () => ({ scheduleVia: vi.fn() }));

// Thursday Oct 22, 2026, 8:15 PM ET.
const TNF = Date.UTC(2026, 9, 23, 0, 15);
const HOUR = 60 * 60 * 1000;
const NOW = TNF - 6 * HOUR;

function game(id: string, away: string, home: string, startsAt: number, extra: Partial<ScheduleEvent> = {}): ScheduleEvent {
  return {
    eventId: id,
    league: "nfl",
    name: `${away} at ${home}`,
    shortName: `${away} @ ${home}`,
    startsAt,
    home: { name: home },
    away: { name: away },
    state: "pre",
    ...extra,
  };
}

const PAGE = `<html><body><h1>NFL squares</h1>${weekSlot("<p>Fallback copy</p>")}</body></html>`;

function envWith(page = PAGE): Env {
  return {
    ASSETS: { fetch: async () => new Response(page, { headers: { "content-type": "text/html; charset=utf-8", etag: '"abc"' } }) },
  } as unknown as Env;
}

beforeEach(() => {
  vi.mocked(scheduleVia).mockReset();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("the list", () => {
  it("reads like a matchup with an Eastern kickoff", () => {
    const e = game("1", "New England Patriots", "Chicago Bears", TNF);
    expect(matchup(e)).toBe("New England Patriots at Chicago Bears");
    expect(matchup({ ...e, neutralSite: true })).toBe("New England Patriots vs. Chicago Bears");
    expect(matchup({ ...e, ranks: { away: 5 } })).toBe("No. 5 New England Patriots at Chicago Bears");
    expect(kickoffLabel(TNF)).toBe("Thu, Oct 22 · 8:15 PM ET");
  });

  it("leaves out finished games and keeps ranked matchups when a week has too many", () => {
    const over = game("over", "A", "B", NOW - 5 * HOUR, { state: "post" });
    const stale = game("stale", "C", "D", NOW - 5 * HOUR);
    const later = game("later", "E", "F", NOW + 2 * HOUR);
    const soon = game("soon", "G", "H", NOW + HOUR, { state: "in" });
    expect(pickGames([over, stale, later, soon], NOW).map((e) => e.eventId)).toEqual(["soon", "later"]);

    const many = Array.from({ length: WEEK_MAX_GAMES + 5 }, (_, i) => game(`g${i}`, `Away ${i}`, `Home ${i}`, NOW + i * HOUR));
    const ranked = game("ranked", "Ranked", "Team", NOW + 100 * HOUR, { ranks: { home: 3 } });
    const picked = pickGames([...many, ranked], NOW);
    expect(picked).toHaveLength(WEEK_MAX_GAMES);
    expect(picked.map((e) => e.eventId)).toContain("ranked");
    expect(picked.map((e) => e.startsAt)).toEqual([...picked.map((e) => e.startsAt)].sort((a, b) => a - b));
  });

  it("heads each league on the basketball page, and says nothing when no league has games", () => {
    const nba = game("n", "Boston Celtics", "New York Knicks", NOW + HOUR, { league: "nba" });
    const wnba = game("w", "Las Vegas Aces", "New York Liberty", NOW + 2 * HOUR, { league: "wnba" });
    const html = weekGamesHtml("basketball-squares", { nba: [nba], wnba: [wnba] }, NOW)!;
    expect(html).toContain("<h3>NBA</h3>");
    expect(html).toContain("<h3>WNBA</h3>");
    expect(html).not.toContain("college");
    expect(html.indexOf("NBA")).toBeLessThan(html.indexOf("WNBA"));
    expect(weekGamesHtml("nfl-squares", { nfl: [game("1", "A", "B", NOW + HOUR)] }, NOW)).not.toContain("<h3>");
    expect(weekGamesHtml("nfl-squares", { nfl: [] }, NOW)).toBeNull();
  });

  it("escapes team names and marks a game that's on", () => {
    const html = weekGamesHtml("nfl-squares", { nfl: [game("1", "A&M <x>", "B", NOW, { state: "in" })] }, NOW)!;
    expect(html).toContain("A&amp;M &lt;x&gt; at B");
    expect(html).toContain(`<span class="live">Live now</span>`);
    expect(html).toContain(`datetime="${new Date(NOW).toISOString()}"`);
  });
});

describe("the page", () => {
  const request = (method = "GET") => new Request("https://jaxsquares.test/nfl-squares", { method, headers: { "if-none-match": '"abc"' } });

  it("puts this week's games in place of the fallback", async () => {
    vi.mocked(scheduleVia).mockResolvedValue({ events: [game("1", "New England Patriots", "Chicago Bears", TNF)], week: null, weeks: [] });
    const res = await serveWeekPage(envWith(), request(), "nfl-squares", NOW);
    const html = await res.text();
    expect(vi.mocked(scheduleVia).mock.calls.map(([, league]) => league)).toEqual(["nfl"] satisfies LinkedLeague[]);
    expect(html).toContain(`${WEEK_START}<ul class="games"><li><span class="match">New England Patriots at Chicago Bears</span>`);
    expect(html).toContain(WEEK_END);
    expect(html).not.toContain("Fallback copy");
    expect(res.headers.get("etag")).toBeNull();
    expect(res.headers.get("cache-control")).toBe("public, max-age=600");
    expect(res.headers.get("content-type")).toBe("text/html; charset=utf-8");
  });

  it("keeps the fallback when the schedule fails or has nothing", async () => {
    vi.mocked(scheduleVia).mockRejectedValue(new Error("ESPN down"));
    expect(await (await serveWeekPage(envWith(), request(), "nfl-squares", NOW)).text()).toContain("Fallback copy");
    vi.mocked(scheduleVia).mockResolvedValue(null);
    expect(await (await serveWeekPage(envWith(), request(), "nfl-squares", NOW)).text()).toContain("Fallback copy");
  });

  it("doesn't wait on a slow schedule", async () => {
    vi.useFakeTimers();
    vi.mocked(scheduleVia).mockReturnValue(new Promise(() => {}));
    const pending = serveWeekPage(envWith(), request(), "nfl-squares", NOW);
    await vi.advanceTimersByTimeAsync(3000);
    expect(await (await pending).text()).toContain("Fallback copy");
  });

  it("passes anything but a GET straight through", async () => {
    const res = await serveWeekPage(envWith(), request("HEAD"), "nfl-squares", NOW);
    expect(res.headers.get("etag")).toBe('"abc"');
    expect(scheduleVia).not.toHaveBeenCalled();
  });
});
