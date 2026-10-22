// "This week's games" on the NFL, college football and basketball landing
// pages (shared/weekGames.ts): the Worker reads the static page, asks the
// league's ScoreHub for its schedule (the same cached ESPN reads the app's
// game picker makes) and swaps the list in for the page's fallback. Without
// a schedule in time (offseason, ESPN down) the static page goes out as is.
//
// Teams appear by name only (no logos), to describe the matchup.

import { WEEK_PAGES, injectWeek, type WeekPage } from "../shared/weekGames";
import { LEAGUE_INFO, type LinkedLeague } from "../shared/sports";
import type { ScheduleEvent } from "../shared/types";
import type { Env } from "./env";
import { scheduleVia } from "./scores";

/** Most games listed per league: a college week has dozens. */
export const WEEK_MAX_GAMES = 12;
/** A page never waits longer than this for the schedule; the fallback goes out instead. */
const SCHEDULE_BUDGET_MS = 2500;
/** A game started more than this long ago is over, whatever the feed says. */
const GAME_SPAN_MS = 4 * 60 * 60 * 1000;
/** Browsers and crawlers recheck the list after this long. */
const PAGE_MAX_AGE_S = 600;

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

const ET = "America/New_York";
const dayFmt = new Intl.DateTimeFormat("en-US", { timeZone: ET, weekday: "short", month: "short", day: "numeric" });
const timeFmt = new Intl.DateTimeFormat("en-US", { timeZone: ET, hour: "numeric", minute: "2-digit" });

/** "Thu, Oct 22 · 8:15 PM ET" */
export function kickoffLabel(startsAt: number): string {
  return `${dayFmt.format(startsAt)} · ${timeFmt.format(startsAt)} ET`;
}

function teamLabel(name: string, rank: number | undefined): string {
  return rank ? `No. ${rank} ${name}` : name;
}

/** "Away at Home", or "vs." at a neutral site. */
export function matchup(e: ScheduleEvent): string {
  return `${teamLabel(e.away.name, e.ranks?.away)} ${e.neutralSite ? "vs." : "at"} ${teamLabel(e.home.name, e.ranks?.home)}`;
}

/** Best poll rank in the game (lower is better), or Infinity when neither team is ranked. */
function bestRank(e: ScheduleEvent): number {
  return Math.min(e.ranks?.home ?? Infinity, e.ranks?.away ?? Infinity);
}

/**
 * The games worth listing: not over, soonest first. When a league has more
 * than WEEK_MAX_GAMES (a college Saturday), ranked matchups make the cut first.
 */
export function pickGames(events: readonly ScheduleEvent[], now: number): ScheduleEvent[] {
  const open = events.filter((e) => e.state !== "post" && e.startsAt > now - GAME_SPAN_MS);
  const chosen =
    open.length > WEEK_MAX_GAMES
      ? [...open].sort((a, b) => bestRank(a) - bestRank(b) || a.startsAt - b.startsAt).slice(0, WEEK_MAX_GAMES)
      : open;
  return [...chosen].sort((a, b) => a.startsAt - b.startsAt || matchup(a).localeCompare(matchup(b)));
}

/** "Men's college basketball" for a heading. */
function leagueHeading(league: LinkedLeague): string {
  const name = LEAGUE_INFO[league].name;
  return name.charAt(0).toUpperCase() + name.slice(1);
}

/**
 * The list for a page: one group per league with games (a heading each when
 * the page shows more than one league), or null when no league has any, so
 * the fallback stays.
 */
export function weekGamesHtml(page: WeekPage, schedules: Partial<Record<LinkedLeague, readonly ScheduleEvent[]>>, now: number): string | null {
  const leagues: readonly LinkedLeague[] = WEEK_PAGES[page];
  const groups = leagues
    .map((league) => ({ league, games: pickGames(schedules[league] ?? [], now) }))
    .filter((g) => g.games.length > 0);
  if (groups.length === 0) return null;
  const many = leagues.length > 1;
  const lists = groups
    .map(({ league, games }) => {
      const items = games
        .map((e) => {
          const live = e.state === "in" ? ` <span class="live">Live now</span>` : "";
          return (
            `<li><span class="match">${esc(matchup(e))}</span>` +
            `<time datetime="${new Date(e.startsAt).toISOString()}">${esc(kickoffLabel(e.startsAt))}</time>${live}</li>`
          );
        })
        .join("");
      return `${many ? `<h3>${esc(leagueHeading(league))}</h3>` : ""}<ul class="games">${items}</ul>`;
    })
    .join("");
  return `${lists}<p class="fine">Times are Eastern. Pick any of these games when you <a href="/new">make a board</a> and the scores fill in on their own.</p>`;
}

/** Each league's schedule, or none for a league that isn't back within the budget. */
async function loadSchedules(env: Env, page: WeekPage): Promise<Partial<Record<LinkedLeague, ScheduleEvent[]>>> {
  const out: Partial<Record<LinkedLeague, ScheduleEvent[]>> = {};
  const reads = WEEK_PAGES[page].map(async (league) => {
    try {
      const result = await scheduleVia(env, league);
      out[league] = result?.events ?? [];
    } catch (err) {
      console.warn(`week games: no ${league} schedule`, err);
    }
  });
  let timer: ReturnType<typeof setTimeout> | undefined;
  await Promise.race([Promise.all(reads), new Promise<void>((resolve) => (timer = setTimeout(resolve, SCHEDULE_BUDGET_MS)))]);
  clearTimeout(timer);
  return { ...out };
}

/** The landing page with this week's games in it (GET), or the static page as is. */
export async function serveWeekPage(env: Env, req: Request, page: WeekPage, now = Date.now()): Promise<Response> {
  if (req.method !== "GET") return env.ASSETS.fetch(req);
  // A plain GET: the page changes under the asset's ETag, so no conditional request.
  const [asset, schedules] = await Promise.all([
    env.ASSETS.fetch(new Request(req.url, { headers: { accept: "text/html" } })),
    loadSchedules(env, page),
  ]);
  if (!asset.ok || !(asset.headers.get("content-type") ?? "").includes("text/html")) return asset;
  const list = weekGamesHtml(page, schedules, now);
  const text = await asset.text();
  const html = list === null ? null : injectWeek(text, list);
  const res = new Response(html ?? text, asset);
  res.headers.set("content-type", "text/html; charset=utf-8");
  res.headers.set("cache-control", `public, max-age=${PAGE_MAX_AGE_S}`);
  res.headers.delete("etag");
  res.headers.delete("content-length");
  return res;
}
