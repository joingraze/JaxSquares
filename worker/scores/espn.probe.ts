// @vitest-environment node
// The schedule and live-score code against real ESPN, from a GitHub runner
// (.github/workflows/probe-schedule.yml copies this to a *.test.ts and runs it;
// `npm run test` never does: the build sandbox can't reach ESPN). It logs what
// it saw and fails only when the app's own code can't read ESPN or reads it
// wrong. An empty schedule in a league's off-season is logged, not a failure.

import { describe, expect, it } from "vitest";
import { rulesForPreset, withRules } from "../../shared/formats";
import { periodKeyForLive, periodScoresFromLinescores } from "../../shared/squares";
import { BASKETBALL_LEAGUES, defaultPresetFor, playsHalves, regulationPeriods, type BasketballLeague } from "../../shared/sports";
import type { LinkedEvent, LiveUpdate, ScheduleEvent } from "../../shared/types";
import { espnDate, fetchEspnJson, parseDayId, parseSchedule, scoreboardUrl } from "./espn";
import { fetchLiveForEvent, getDaySchedule, getSchedule, SCHEDULE_DAYS } from "./index";

const DAY_MS = 86_400_000;
const NOW = Date.now();

/**
 * One past slate per league that had finished games, so the final-score parse
 * is checked in any month: the last day of the 2024-25 NBA regular season, the
 * last day of the 2025 WNBA regular season, and the 2025 men's (two halves) and
 * women's (four quarters) college championship games.
 */
const PAST_SLATES: Record<BasketballLeague, string> = {
  nba: "20250413",
  wnba: "20250911",
  ncaab: "20250407",
  ncaaw: "20250406",
};

const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);
const kindOf = (league: BasketballLeague) => ({ sport: "basketball" as const, league });
const formatFor = (league: BasketballLeague) => {
  const kind = kindOf(league);
  const preset = defaultPresetFor(kind);
  return withRules({ periods: preset, reverse: false, boardSize: 100, freshNumbers: false, rules: rulesForPreset(preset, false) });
};
const linkOf = (e: ScheduleEvent, startsAt = e.startsAt): LinkedEvent => ({ provider: "espn", league: e.league, eventId: e.eventId, startsAt, xIsHome: false });
const line = (u: LiveUpdate) => `${u.live.scoreX}-${u.live.scoreY} [${u.linescoresX.join(" ")}] / [${u.linescoresY.join(" ")}] ${u.live.detail}`;

/** A slate's games as the schedule parser reads them, finished ones included. */
async function slate(league: BasketballLeague, date: string): Promise<ScheduleEvent[]> {
  return parseSchedule(await fetchEspnJson(scoreboardUrl(league, parseDayId(date)!), 10_000), league);
}

/**
 * A finished game's live update, read the way a board reads it (the slate's
 * scoreboard) and again through the summary fallback; both must agree, add
 * up and map onto the board's moments.
 */
async function checkFinal(league: BasketballLeague, game: ScheduleEvent): Promise<void> {
  const kind = kindOf(league);
  const update = await fetchLiveForEvent(linkOf(game));
  console.log(`    final ${game.shortName}: ${update ? line(update) : "null"}`);
  expect(update, `${league} ${game.eventId} live lookup`).not.toBeNull();
  const u = update!;
  expect(u.isFinal).toBe(true);
  expect(u.live.state).toBe("post");
  // Every period played, overtime included, and they add up to the final score.
  expect(u.linescoresX.length).toBeGreaterThanOrEqual(regulationPeriods(kind));
  expect(u.completedPeriods).toBe(u.linescoresX.length);
  expect(sum(u.linescoresX)).toBe(u.live.scoreX);
  expect(sum(u.linescoresY)).toBe(u.live.scoreY);
  if (u.linescoresX.length > regulationPeriods(kind)) console.log(`    overtime: ${u.linescoresX.length - regulationPeriods(kind)} period(s)`);

  // The board's moments: halftime and the final for a game of halves, every quarter otherwise.
  const scores = periodScoresFromLinescores(formatFor(league), u, kind);
  const keys = scores.map((s) => s.periodKey);
  expect(keys).toEqual(playsHalves(kind) ? ["q2", "final"] : ["q1", "q2", "q3", "final"]);
  const half = scores.find((s) => s.periodKey === "q2")!;
  const halfPeriods = playsHalves(kind) ? 1 : 2;
  expect([half.scoreX, half.scoreY]).toEqual([sum(u.linescoresX.slice(0, halfPeriods)), sum(u.linescoresY.slice(0, halfPeriods))]);
  const final = scores.find((s) => s.periodKey === "final")!;
  expect([final.scoreX, final.scoreY]).toEqual([u.live.scoreX, u.live.scoreY]);
  console.log(`    moments: ${scores.map((s) => `${s.periodKey} ${s.scoreX}-${s.scoreY}`).join(", ")}`);

  // Kickoff moved after linking: the summary endpoint answers instead, with the same result.
  const viaSummary = await fetchLiveForEvent(linkOf(game, 0));
  expect(viaSummary, `${league} ${game.eventId} summary lookup`).not.toBeNull();
  expect([viaSummary!.live.scoreX, viaSummary!.live.scoreY, viaSummary!.isFinal]).toEqual([u.live.scoreX, u.live.scoreY, true]);
  expect(viaSummary!.linescoresX).toEqual(u.linescoresX);
}

describe.each(["nfl", "ncaaf"] as const)("%s (football, by week)", (league) => {
  it("reads the schedule and a game's live data", async () => {
    const result = await getSchedule(league);
    if (!result) throw new Error(`${league} schedule unavailable`);
    const { events, week, weeks } = result;
    console.log(`${league}: ${week?.label} ${events.length} games; later: ${weeks.map((w) => w.label).join(", ")}`);
    if (events.length === 0) {
      console.log(`  ${league}: no games to link (off-season?)`);
      return;
    }
    console.log(`  first: ${events.slice(0, 3).map((e) => `${e.shortName} ${new Date(e.startsAt).toISOString()} ${e.state} ${e.venue?.city ?? ""}${e.neutralSite ? " (neutral)" : ""} ${JSON.stringify(e.ranks ?? {})}`).join(" | ")}`);
    if (weeks.length > 0) {
      const next = await getSchedule(league, weeks[0].id);
      console.log(`  ${weeks[0].label}: ${next?.events.length} games; first ${next?.events[0]?.shortName}`);
      expect(next?.events.length, `${league} ${weeks[0].id}`).toBeGreaterThan(0);
    }
    const pick = events.find((e) => e.state === "in") ?? events[0];
    const update = await fetchLiveForEvent({ provider: "espn", league, eventId: pick.eventId, startsAt: pick.startsAt, xIsHome: true });
    console.log(`  live ${pick.shortName}: ${JSON.stringify(update)?.slice(0, 300)}`);
    expect(update, `${league} live lookup for ${pick.eventId}`).not.toBeNull();
  }, 60_000);
});

describe.each(BASKETBALL_LEAGUES)("%s (basketball, by day)", (league) => {
  it("reads the next 7 days, today first, and a date ahead", async () => {
    const result = await getDaySchedule(league);
    if (!result) throw new Error(`${league} schedule unavailable`);
    const dates = result.dates ?? [];
    expect(dates).toHaveLength(SCHEDULE_DAYS);
    // Consecutive days, starting with today's slate (or last night's, before 6am Eastern).
    for (let i = 1; i < dates.length; i++) expect(parseDayId(dates[i])! - parseDayId(dates[i - 1])!).toBe(DAY_MS);
    expect(Math.abs(parseDayId(dates[0])! - (NOW - 10 * 3_600_000))).toBeLessThan(DAY_MS + 3_600_000);
    const perDay = dates.map((d) => `${d}: ${result.events.filter((e) => espnDate(e.startsAt - 10 * 3_600_000) === d).length}`);
    console.log(`${league}: ${result.events.length} games in the next ${SCHEDULE_DAYS} days (${perDay.join(", ")})`);
    for (const e of result.events) {
      expect(e.league).toBe(league);
      expect(e.state).not.toBe("post");
      expect(e.home.name && e.away.name).toBeTruthy();
    }
    if (result.events.length === 0) console.log(`  ${league}: nothing to link this week (off-season?)`);
    else {
      console.log(`  first: ${result.events.slice(0, 3).map((e) => `${e.shortName} ${new Date(e.startsAt).toISOString()} ${e.state}${e.neutralSite ? " (neutral)" : ""} ${JSON.stringify(e.ranks ?? {})}`).join(" | ")}`);
      console.log(`  ranked games: ${result.events.filter((e) => e.ranks).length}`);
    }

    const ahead = espnDate(NOW + 3 * DAY_MS);
    const day = await getDaySchedule(league, ahead);
    expect(day?.dates).toEqual([ahead]);
    console.log(`  ${ahead}: ${day?.events.length} games`);
  }, 60_000);

  it("parses a past slate's finals onto the board's moments", async () => {
    const games = (await slate(league, PAST_SLATES[league])).filter((e) => e.state === "post");
    console.log(`${league} ${PAST_SLATES[league]}: ${games.length} finished games`);
    expect(games.length).toBeGreaterThan(0);
    for (const game of games.slice(0, 2)) await checkFinal(league, game);
  }, 60_000);

  it("parses the latest finals and any game on right now", async () => {
    // The most recent slate with a finished game, within the last 10 days.
    let finals: ScheduleEvent[] = [];
    for (let back = 0; back <= 10 && finals.length === 0; back++) {
      const date = espnDate(NOW - back * DAY_MS - 10 * 3_600_000);
      finals = (await slate(league, date)).filter((e) => e.state === "post");
      if (finals.length) console.log(`${league}: latest finals on ${date} (${finals.length})`);
    }
    if (finals.length === 0) console.log(`${league}: no finals in the last 10 days (off-season?)`);
    else await checkFinal(league, finals[0]);

    const live = (await getDaySchedule(league))?.events.filter((e) => e.state === "in") ?? [];
    for (const game of live.slice(0, 2)) {
      const u = await fetchLiveForEvent(linkOf(game));
      console.log(`  live ${game.shortName}: ${u ? line(u) : "null"} -> playing for ${u ? periodKeyForLive(formatFor(league), u.live.period, kindOf(league)) : "?"}`);
      expect(u, `${league} live lookup for ${game.eventId}`).not.toBeNull();
      expect(u!.completedPeriods).toBeLessThanOrEqual(u!.live.period);
      expect(sum(u!.linescoresX)).toBe(u!.live.scoreX);
      expect(sum(u!.linescoresY)).toBe(u!.live.scoreY);
    }
    if (live.length === 0) console.log(`  ${league}: no game on right now`);
  }, 120_000);
});

  // ncaab and ncaaw both ask ESPN for groups=50 (Division I). Log how many
  // ncaab asks ESPN for groups=50 (Division I); ncaaw doesn't. Log how many
  // games each way lists, on a busy regular-season Saturday and the last few days.
  it.each(["ncaab", "ncaaw"] as const)("%s: games per slate as the app asks, with groups=50 and with no groups", async (league) => {
    const days = ["20250201", ...[0, 1, 2].map((back) => espnDate(NOW - back * DAY_MS - 10 * 3_600_000))];
    for (const date of days) {
      const app = new URL(scoreboardUrl(league, parseDayId(date)!));
      const groups50 = new URL(app);
      groups50.searchParams.set("groups", "50");
      const none = new URL(app);
      none.searchParams.delete("groups");
      const counts: string[] = [];
      for (const [name, url] of [["app", app], ["groups=50", groups50], ["no groups", none]] as const) {
        counts.push(`${name} ${parseSchedule(await fetchEspnJson(url.toString(), 10_000), league).length}`);
      }
      console.log(`${league} ${date}: ${counts.join(", ")}`);
    }
  }, 60_000);
});
