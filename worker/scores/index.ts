// Live schedule + live score provider (ESPN). Mounted under /api by worker/index.ts;
// fetchLiveForEvent is polled by the GameRoom Durable Object while a linked game is on.

import { Hono } from "hono";
import type { LinkedEvent, LiveUpdate, ScheduleEvent, ScheduleResponse } from "../../shared/types";
import type { Env } from "../env";
import { cached, type CachedValue } from "./cache";
import {
  fetchEspnJson,
  isScoreboard,
  parseSchedule,
  parseScoreboardSnapshots,
  parseSummarySnapshot,
  scoreboardUrl,
  summaryUrl,
  toLiveUpdate,
  type GameSnapshot,
  type LinkedLeague,
} from "./espn";

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;
const SCHEDULE_DAYS = 10;
const SCHEDULE_TTL_S = 10 * 60;
/** Keep offering last known games for a few hours if ESPN is down. */
const SCHEDULE_STALE_S = 6 * 60 * 60;
const SCHEDULE_TIMEOUT_MS = 8000;
const LIVE_TTL_S = 10;
const LIVE_TIMEOUT_MS = 4000;
/** No football game runs this long, so an older "pre"/"in" entry is stale data. */
const MAX_GAME_SPAN_MS = 6 * HOUR_MS;
/** Bump when the cached (parsed) shape changes so old entries are ignored after a deploy. */
const CACHE_VERSION = "1";

function cacheKey(upstreamUrl: string): string {
  return `${upstreamUrl}&jx=${CACHE_VERSION}`;
}

function isLinkedLeague(v: string): v is LinkedLeague {
  return v === "nfl" || v === "ncaaf";
}

// ---- Schedule ----

/** Upcoming and in-progress games over the next ~10 days, or null if ESPN is unavailable. */
export async function getSchedule(league: LinkedLeague, now = Date.now()): Promise<ScheduleEvent[] | null> {
  // Start a day back so late games still in progress past midnight UTC are included.
  // The window only moves once a day, so the cache key is shared all day.
  const url = scoreboardUrl(league, now - DAY_MS, now + SCHEDULE_DAYS * DAY_MS);
  const result = await cached({
    key: cacheKey(url),
    ttlSeconds: SCHEDULE_TTL_S,
    staleSeconds: SCHEDULE_STALE_S,
    load: async () => {
      const json = await fetchEspnJson(url, SCHEDULE_TIMEOUT_MS);
      if (!isScoreboard(json)) throw new Error("ESPN scoreboard response had no events array");
      return parseSchedule(json, league).filter((e) => e.state !== "post");
    },
  });
  if (!result) return null;

  const horizon = now + SCHEDULE_DAYS * DAY_MS;
  return result.value
    .filter((e) => e.state !== "post" && e.startsAt <= horizon && e.startsAt > now - MAX_GAME_SPAN_MS)
    .sort((a, b) => a.startsAt - b.startsAt || a.name.localeCompare(b.name));
}

export const scheduleRoutes = new Hono<{ Bindings: Env }>();

scheduleRoutes.get("/schedule", async (c) => {
  const league = c.req.query("league") ?? "nfl";
  if (!isLinkedLeague(league)) return c.json({ error: "league must be nfl or ncaaf" }, 400);

  const events = await getSchedule(league);
  if (!events) {
    // 200 so the picker can fall back to a typed-in matchup without error handling.
    c.header("cache-control", "no-store");
    return c.json<ScheduleResponse>({ events: [], unavailable: true });
  }
  c.header("cache-control", "public, max-age=60");
  return c.json<ScheduleResponse>({ events });
});

// ---- Live ----

/**
 * Live data for a linked board, or null when ESPN can't be reached or doesn't
 * know the event. Never throws.
 *
 * Primary source is the scoreboard around the game's slate day: every board
 * linked to any game that day (Sunday's early, late and night games alike)
 * shares one cached fetch, and it's the same payload and parser as the schedule.
 * If the event isn't there (kickoff moved after the board was linked), the
 * per-event summary endpoint is the fallback; it's a much larger payload and
 * isn't shared, so it isn't the default.
 */
export async function fetchLiveForEvent(event: LinkedEvent): Promise<LiveUpdate | null> {
  try {
    const found = await findSnapshot(event);
    return found ? toLiveUpdate(found.value, event.xIsHome, found.fetchedAt) : null;
  } catch (err) {
    console.warn(`live scores failed for ${event.league}/${event.eventId}`, err);
    return null;
  }
}

/**
 * Groups kickoffs from 6am to 6am US Eastern (10:00 UTC) into one day, so a whole
 * slate, through late West Coast and Hawaii games, maps to the same cache key.
 * ESPN's `dates` follow US local days, which put a game on its UTC date or the
 * day before; padding the slate day by one on each side always covers both.
 */
function slateDay(startsAt: number): number {
  return Math.floor((startsAt - 10 * HOUR_MS) / DAY_MS) * DAY_MS;
}

async function findSnapshot(event: LinkedEvent): Promise<CachedValue<GameSnapshot> | null> {
  if (!isLinkedLeague(event.league) || !event.eventId) return null;

  if (Number.isFinite(event.startsAt) && event.startsAt > 0) {
    const day = slateDay(event.startsAt);
    const url = scoreboardUrl(event.league, day - DAY_MS, day + DAY_MS);
    const board = await cached({
      key: cacheKey(url),
      ttlSeconds: LIVE_TTL_S,
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
    key: cacheKey(url),
    ttlSeconds: LIVE_TTL_S,
    load: async () => {
      const snap = parseSummarySnapshot(await fetchEspnJson(url, LIVE_TIMEOUT_MS));
      if (!snap) throw new Error("ESPN summary response had no competition");
      return snap;
    },
  });
  return summary && summary.value.eventId === event.eventId ? summary : null;
}
