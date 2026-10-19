// Live schedule + live score provider (ESPN). Mounted under /api by worker/index.ts;
// fetchLiveForEvent is polled by the GameRoom Durable Object while a linked game is on.
//
// Football is picked a week of the season at a time; basketball has no weeks,
// so its leagues (shared/sports.ts `isDayLeague`) are picked by day: the next
// 7 days, today first, or one day further out (`date=YYYYMMDD`), one cached
// scoreboard per day.

import { Hono } from "hono";
import { isDayLeague, isLinkedLeague as isKnownLeague } from "../../shared/sports";
import type { LinkedEvent, LiveUpdate, ScheduleEvent, ScheduleResponse, ScheduleWeek } from "../../shared/types";
import type { Env } from "../env";
import { cached, type CachedValue } from "./cache";
import {
  espnDate,
  fetchEspnJson,
  isScoreboard,
  parseCalendar,
  parseDayId,
  parseSchedule,
  parseScoreboardSnapshots,
  parseSummarySnapshot,
  scoreboardUrl,
  summaryUrl,
  parseWeekId,
  toLiveUpdate,
  type GameSnapshot,
  type LinkedLeague,
  type SeasonCalendar,
  type WeekRef,
} from "./espn";

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;
const SCHEDULE_TTL_S = 10 * 60;
/** A later week's games rarely move (flexed games are announced days ahead). */
const LATER_WEEK_TTL_S = 30 * 60;
/** Keep offering last known games for a few hours if ESPN is down. */
const SCHEDULE_STALE_S = 6 * 60 * 60;
const SCHEDULE_TIMEOUT_MS = 8000;
const LIVE_TTL_S = 10;
const LIVE_TIMEOUT_MS = 4000;
/** No football or basketball game runs this long, so an older "pre"/"in" entry is stale data. */
const MAX_GAME_SPAN_MS = 6 * HOUR_MS;
/** Basketball's default schedule: this many days, today first. */
export const SCHEDULE_DAYS = 7;
/** Furthest ahead a basketball day can be asked for (a linked game can be up to 400 days out). */
const MAX_DAYS_AHEAD = 400;
/** Bump when the cached (parsed) shape changes so old entries are ignored after a deploy. */
const CACHE_VERSION = "4";

/**
 * The schedule and live scores read the same ESPN scoreboard URLs but cache
 * different parsed shapes, so each kind gets its own key.
 */
function cacheKey(upstreamUrl: string, kind: "schedule" | "live"): string {
  const url = new URL(upstreamUrl);
  url.searchParams.set("jx", `${CACHE_VERSION}-${kind}`);
  return url.toString();
}

/**
 * Groups kickoffs from 6am to 6am US Eastern (10:00 UTC) into one day, so a whole
 * slate, through late West Coast and Hawaii games, maps to the same US date, which
 * is how ESPN's `dates` parameter files games.
 */
function slateDay(startsAt: number): number {
  return Math.floor((startsAt - 10 * HOUR_MS) / DAY_MS) * DAY_MS;
}

/** A league with a live feed: NFL and college football, the NBA, the WNBA and men's and women's college basketball. */
export function isLinkedLeague(v: string): v is LinkedLeague {
  return isKnownLeague(v);
}

/**
 * A basketball day someone may ask for: a real date (YYYYMMDD, US Eastern as
 * ESPN files games) from yesterday's slate (late games still on) to about a
 * year ahead. null otherwise.
 */
export function dayInRange(date: string, now = Date.now()): number | null {
  const day = parseDayId(date);
  const today = slateDay(now);
  return day !== null && day >= today - DAY_MS && day <= today + MAX_DAYS_AHEAD * DAY_MS ? day : null;
}

// ---- Schedule ----

/** Options for code running inside the ScoreHub Durable Object (see hub.ts). */
export interface ScoresOptions {
  /** Shared by concurrent lookups so they wait on one ESPN fetch (see cached()). */
  inflight?: Map<string, Promise<unknown>>;
  now?: number;
}

/** One scoreboard as the picker needs it: its games (none finished) and the season's weeks. */
interface WeekBoard {
  events: ScheduleEvent[];
  calendar: SeasonCalendar;
}

export interface ScheduleResult {
  events: ScheduleEvent[];
  week: ScheduleWeek | null;
  weeks: ScheduleWeek[];
  /** Date-based leagues: the days (YYYYMMDD) `events` covers. */
  dates?: string[];
}

function loadWeekBoard(league: LinkedLeague, ref: WeekRef | undefined, opts: ScoresOptions) {
  const url = scoreboardUrl(league, ref);
  return cached<WeekBoard>({
    key: cacheKey(url, "schedule"),
    ttlSeconds: ref ? LATER_WEEK_TTL_S : SCHEDULE_TTL_S,
    staleSeconds: SCHEDULE_STALE_S,
    inflight: opts.inflight,
    load: async () => {
      const json = await fetchEspnJson(url, SCHEDULE_TIMEOUT_MS);
      if (!isScoreboard(json)) throw new Error("ESPN scoreboard response had no events array");
      return { events: parseSchedule(json, league).filter((e) => e.state !== "post"), calendar: parseCalendar(json) };
    },
  });
}

/** Games that can still be linked: not over, and not stale "pre"/"in" leftovers. */
function linkable(events: ScheduleEvent[], now: number): ScheduleEvent[] {
  return events
    .filter((e) => e.state !== "post" && e.startsAt > now - MAX_GAME_SPAN_MS)
    .sort((a, b) => a.startsAt - b.startsAt || a.name.localeCompare(b.name));
}

/**
 * Games to link, a week at a time, or null if ESPN is unavailable.
 *
 * Without `week`: the current week (ESPN's default scoreboard) and every later
 * week of the season. Once the current week's games are all over (a Tuesday
 * before ESPN rolls the week), it leads with next week instead. With `week`
 * ("2-8"): that week's games. One ESPN request per week, each cached.
 */
export async function getSchedule(
  league: LinkedLeague,
  week?: string,
  opts: ScoresOptions = {},
): Promise<ScheduleResult | null> {
  const now = opts.now ?? Date.now();
  if (week !== undefined) {
    const ref = parseWeekId(week);
    if (!ref) return null;
    const board = await loadWeekBoard(league, ref, opts);
    if (!board) return null;
    const known = board.value.calendar.weeks.find((w) => w.id === week) ?? board.value.calendar.current;
    return { events: linkable(board.value.events, now), week: known, weeks: [] };
  }

  const board = await loadWeekBoard(league, undefined, opts);
  if (!board) return null;
  const { calendar } = board.value;
  let current = calendar.current;
  let events = linkable(board.value.events, now);
  let later = calendar.weeks.filter((w) => w.endsAt > now && w.id !== current?.id && (!current || w.startsAt >= current.startsAt));

  if (events.length === 0 && later.length > 0) {
    const ref = parseWeekId(later[0].id);
    const next = ref ? await loadWeekBoard(league, ref, opts) : null;
    if (next) {
      current = later[0];
      events = linkable(next.value.events, now);
      later = later.slice(1);
    }
  }
  return { events, week: current, weeks: later };
}

/** One day's scoreboard as the picker needs it: its games, none finished. */
function loadDayBoard(league: LinkedLeague, day: number, now: number, opts: ScoresOptions) {
  const url = scoreboardUrl(league, day);
  return cached<ScheduleEvent[]>({
    key: cacheKey(url, "schedule"),
    // Today's and tomorrow's games can still move; later days rarely do.
    ttlSeconds: day - slateDay(now) <= DAY_MS ? SCHEDULE_TTL_S : LATER_WEEK_TTL_S,
    staleSeconds: SCHEDULE_STALE_S,
    inflight: opts.inflight,
    load: async () => {
      const json = await fetchEspnJson(url, SCHEDULE_TIMEOUT_MS);
      if (!isScoreboard(json)) throw new Error("ESPN scoreboard response had no events array");
      return parseSchedule(json, league).filter((e) => e.state !== "post");
    },
  });
}

/**
 * Basketball's games to link, by day, or null if ESPN is unavailable.
 *
 * Without `date`: the next SCHEDULE_DAYS days, today's slate first (ESPN files
 * games by US date; a late game still on counts toward its own day). With
 * `date` ("20260320"): that day's games. One ESPN request per day, each
 * cached; a day that can't be read is left out while the others answer.
 */
export async function getDaySchedule(league: LinkedLeague, date?: string, opts: ScoresOptions = {}): Promise<ScheduleResult | null> {
  const now = opts.now ?? Date.now();
  let days: number[];
  if (date !== undefined) {
    const day = parseDayId(date);
    if (day === null) return null;
    days = [day];
  } else {
    const today = slateDay(now);
    days = Array.from({ length: SCHEDULE_DAYS }, (_, i) => today + i * DAY_MS);
  }
  const boards = await Promise.all(days.map((day) => loadDayBoard(league, day, now, opts)));
  if (boards.every((b) => !b)) return null;
  const seen = new Set<string>();
  const events = linkable(
    boards.flatMap((b) => b?.value ?? []).filter((e) => !seen.has(e.eventId) && !!seen.add(e.eventId)),
    now,
  );
  return { events, week: null, weeks: [], dates: days.map(espnDate) };
}

/** The schedule for any league: by week (football) or by day (basketball). */
export function scheduleFor(league: LinkedLeague, query: { week?: string; date?: string }, opts: ScoresOptions = {}): Promise<ScheduleResult | null> {
  return isDayLeague(league) ? getDaySchedule(league, query.date, opts) : getSchedule(league, query.week, opts);
}

// ---- Through the ScoreHub ----
// Every request for a league goes through one ScoreHub Durable Object (hub.ts),
// so ESPN sees one fetch per scoreboard per TTL however many boards and pickers
// are open. Without the binding (tests) or if the hub fails, fetch directly.

function hubFor(env: Env | undefined, league: LinkedLeague): DurableObjectStub | null {
  const ns = env?.SCORE_HUB;
  return ns ? ns.get(ns.idFromName(`espn:${league}`)) : null;
}

/** getSchedule (football, by week) or getDaySchedule (basketball, by day) through the league's ScoreHub. */
export async function scheduleVia(env: Env | undefined, league: LinkedLeague, week?: string, date?: string): Promise<ScheduleResult | null> {
  const hub = hubFor(env, league);
  if (hub) {
    try {
      const q = new URLSearchParams({ league });
      if (week !== undefined) q.set("week", week);
      if (date !== undefined) q.set("date", date);
      const res = await hub.fetch(`https://hub/schedule?${q}`);
      if (res.ok) return (await res.json()) as ScheduleResult | null;
      console.warn(`score hub answered ${res.status} for the ${league} schedule`);
    } catch (err) {
      console.warn("score hub unavailable", err);
    }
  }
  return scheduleFor(league, { week, date });
}

/** fetchLiveForEvent through the league's ScoreHub. Never throws. */
export async function liveVia(env: Env, event: LinkedEvent): Promise<LiveUpdate | null> {
  const hub = isLinkedLeague(event.league) ? hubFor(env, event.league) : null;
  if (hub) {
    try {
      const res = await hub.fetch("https://hub/live", { method: "POST", body: JSON.stringify(event) });
      if (res.ok) return (await res.json()) as LiveUpdate | null;
      console.warn(`score hub answered ${res.status} for ${event.league}/${event.eventId}`);
    } catch (err) {
      console.warn("score hub unavailable", err);
    }
  }
  return fetchLiveForEvent(event);
}

export const scheduleRoutes = new Hono<{ Bindings: Env }>();

scheduleRoutes.get("/schedule", async (c) => {
  const league = c.req.query("league") ?? "nfl";
  if (!isLinkedLeague(league)) return c.json({ error: "league must be nfl, ncaaf, nba, wnba, ncaab or ncaaw" }, 400);
  const week = c.req.query("week");
  const date = c.req.query("date");

  if (isDayLeague(league)) {
    // Basketball has no weeks: a day at a time.
    if (week !== undefined) return c.json({ error: "Basketball games go by date: use date=20260320" }, 400);
    if (date !== undefined && dayInRange(date) === null) {
      return c.json({ error: "date must look like 20260320, from today to a year ahead" }, 400);
    }
    const result = await scheduleVia(c.env, league, undefined, date);
    if (!result) {
      c.header("cache-control", "no-store");
      return c.json<ScheduleResponse>({ events: [], unavailable: true });
    }
    c.header("cache-control", `public, max-age=${date ? 300 : 60}`);
    return c.json<ScheduleResponse>({ events: result.events, dates: result.dates ?? [] });
  }

  if (date !== undefined) return c.json({ error: "Football games go by week: use week=2-7" }, 400);
  if (week !== undefined && !parseWeekId(week)) return c.json({ error: "week must look like 2-7" }, 400);

  const result = await scheduleVia(c.env, league, week);
  if (!result) {
    // 200 so the picker can fall back to a typed-in matchup without error handling.
    c.header("cache-control", "no-store");
    return c.json<ScheduleResponse>({ events: [], unavailable: true });
  }
  c.header("cache-control", `public, max-age=${week ? 300 : 60}`);
  return c.json<ScheduleResponse>(week ? { events: result.events, week: result.week } : result);
});

// ---- Live ----

/**
 * Live data for a linked board, or null when ESPN can't be reached or doesn't
 * know the event. Never throws.
 *
 * Primary source is the scoreboard for the game's slate day: every board
 * linked to any game that day (Sunday's early, late and night games alike)
 * shares one cached fetch, and it's the same payload and parser as the schedule.
 * If the event isn't there (kickoff moved after the board was linked), the
 * per-event summary endpoint is the fallback; it's a much larger payload and
 * isn't shared, so it isn't the default.
 */
export async function fetchLiveForEvent(event: LinkedEvent, opts: ScoresOptions = {}): Promise<LiveUpdate | null> {
  try {
    const found = await findSnapshot(event, opts);
    return found ? toLiveUpdate(found.value, event.xIsHome, found.fetchedAt) : null;
  } catch (err) {
    console.warn(`live scores failed for ${event.league}/${event.eventId}`, err);
    return null;
  }
}

async function findSnapshot(event: LinkedEvent, opts: ScoresOptions): Promise<CachedValue<GameSnapshot> | null> {
  if (!isLinkedLeague(event.league) || !event.eventId) return null;

  if (Number.isFinite(event.startsAt) && event.startsAt > 0) {
    const url = scoreboardUrl(event.league, slateDay(event.startsAt));
    const board = await cached({
      key: cacheKey(url, "live"),
      ttlSeconds: LIVE_TTL_S,
      inflight: opts.inflight,
      load: async () => {
        const json = await fetchEspnJson(url, LIVE_TIMEOUT_MS);
        if (!isScoreboard(json)) throw new Error("ESPN scoreboard response had no events array");
        return parseScoreboardSnapshots(json);
      },
    });
    // ESPN itself is down; the summary lives on the same host, so don't wait on it too.
    if (!board) return null;
    const game = board.value.find((g) => g.eventId === event.eventId);
    if (game) return { value: game, fetchedAt: board.fetchedAt };
  }

  const url = summaryUrl(event.league, event.eventId);
  const summary = await cached({
    key: cacheKey(url, "live"),
    ttlSeconds: LIVE_TTL_S,
    inflight: opts.inflight,
    load: async () => {
      const snap = parseSummarySnapshot(await fetchEspnJson(url, LIVE_TIMEOUT_MS));
      if (!snap) throw new Error("ESPN summary response had no competition");
      return snap;
    },
  });
  return summary && summary.value.eventId === event.eventId ? summary : null;
}
