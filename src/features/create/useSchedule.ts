// Real games for the picker. Football goes a week at a time: on mount, NFL and
// college each load their first week with games still to link plus the list
// of weeks after it; a later week's games load only when someone opens it
// (useWeekGames). Basketball goes by day: its leagues load only once wanted
// (the host picks Basketball, or football has nothing to link), each with the
// next 7 days' games; a day further out loads when picked (useDayGames).
// The schedule endpoint answers 200 with `unavailable: true` when ESPN can't be
// reached; that (or an empty week) just means "lead with custom teams".

import { useEffect, useState } from "react";
import { SPORT_LEAGUES, type BoardSport } from "../../../shared/sports";
import type { League, ScheduleEvent, ScheduleWeek } from "../../../shared/types";
import { api } from "../../lib/api";
import { upcomingEvents } from "./model";

export type ScheduleLeague = Exclude<League, "custom">;

export interface LeagueSchedule {
  loading: boolean;
  /** Games in `week` (football) or the next 7 days (basketball) that can still be linked, soonest first. */
  events: ScheduleEvent[];
  /** The week `events` belong to: this week, or next week once this one's games are over (football). */
  week: ScheduleWeek | null;
  /** The weeks after it, through the end of the season (football). */
  weeks: ScheduleWeek[];
  /** The days `events` covers, YYYYMMDD, today first (basketball). */
  dates: string[];
}

export type Schedule = Record<ScheduleLeague, LeagueSchedule>;

const ALL: readonly ScheduleLeague[] = [...SPORT_LEAGUES.football, ...SPORT_LEAGUES.basketball];
const LOADING: LeagueSchedule = { loading: true, events: [], week: null, weeks: [], dates: [] };
const NOTHING: LeagueSchedule = { loading: false, events: [], week: null, weeks: [], dates: [] };
/** Session cache so going back and forth doesn't flash skeletons or refetch. */
const CACHE_MS = 5 * 60_000;

const cache = new Map<ScheduleLeague, { at: number; value: LeagueSchedule }>();
/** Loads in flight, shared by every picker that asks (a sport switch doesn't refetch). */
const inflight = new Map<ScheduleLeague, Promise<LeagueSchedule>>();

function cachedLeague(league: ScheduleLeague): LeagueSchedule | null {
  const hit = cache.get(league);
  return hit && Date.now() - hit.at < CACHE_MS ? hit.value : null;
}

function loadLeague(league: ScheduleLeague): Promise<LeagueSchedule> {
  const pending = inflight.get(league);
  if (pending) return pending;
  const started = api
    .schedule(league)
    .then((res): LeagueSchedule =>
      res.unavailable
        ? NOTHING
        : { loading: false, events: upcomingEvents(res.events ?? []), week: res.week ?? null, weeks: res.weeks ?? [], dates: res.dates ?? [] },
    )
    .catch((): LeagueSchedule => NOTHING)
    .then((value) => {
      cache.set(league, { at: Date.now(), value });
      return value;
    })
    .finally(() => inflight.delete(league));
  inflight.set(league, started);
  return started;
}

/** Tests: forget the session cache. */
export function clearScheduleCache(): void {
  cache.clear();
  inflight.clear();
}

function initial(): Schedule {
  const out = {} as Schedule;
  for (const league of ALL) out[league] = cachedLeague(league) ?? LOADING;
  return out;
}

/**
 * Every league's games: football's load on mount, basketball's once `sports`
 * includes it. A league not asked for yet reads as loading.
 */
export function useSchedule(sports: readonly BoardSport[] = ["football"]): Schedule {
  const [schedule, setSchedule] = useState<Schedule>(initial);
  const key = sports.join(",");

  useEffect(() => {
    let alive = true;
    for (const league of key.split(",").flatMap((s) => SPORT_LEAGUES[s as BoardSport] ?? [])) {
      const hit = cachedLeague(league);
      if (hit) {
        setSchedule((cur) => (cur[league] === hit ? cur : { ...cur, [league]: hit }));
        continue;
      }
      void loadLeague(league).then((loaded) => {
        if (alive) setSchedule((cur) => ({ ...cur, [league]: loaded }));
      });
    }
    return () => {
      alive = false;
    };
  }, [key]);

  return schedule;
}

export interface WeekGames {
  status: "loading" | "ready" | "error";
  events: ScheduleEvent[];
}

const weekCache = new Map<string, { at: number; events: ScheduleEvent[] }>();

function cachedWeek(key: string): ScheduleEvent[] | null {
  const hit = weekCache.get(key);
  return hit && Date.now() - hit.at < CACHE_MS ? hit.events : null;
}

/**
 * One later week's games (football, `weekId` "2-8") or one day's (basketball,
 * `date` "20260320"), fetched the first time it's opened (null = nothing
 * open). Bump `attempt` to retry after an error.
 */
function usePeriodGames(league: ScheduleLeague, query: { week?: string; date?: string } | null, attempt: number): WeekGames | null {
  const id = query?.week ?? query?.date ?? null;
  const key = id ? `${league}:${id}` : null;
  const [state, setState] = useState<{ key: string; games: WeekGames } | null>(null);

  useEffect(() => {
    if (!key || !id) return;
    const hit = cachedWeek(key);
    if (hit) {
      setState({ key, games: { status: "ready", events: hit } });
      return;
    }
    setState({ key, games: { status: "loading", events: [] } });
    const controller = new AbortController();
    const isDate = /^\d{8}$/.test(id);
    api
      .schedule(league, controller.signal, isDate ? undefined : id, isDate ? id : undefined)
      .then((res) => {
        if (res.unavailable) throw new Error("schedule unavailable");
        const events = upcomingEvents(res.events ?? []);
        weekCache.set(key, { at: Date.now(), events });
        if (!controller.signal.aborted) setState({ key, games: { status: "ready", events } });
      })
      .catch(() => {
        if (!controller.signal.aborted) setState({ key, games: { status: "error", events: [] } });
      });
    return () => controller.abort();
  }, [key, league, id, attempt]);

  if (!key) return null;
  const hit = cachedWeek(key);
  if (hit) return { status: "ready", events: hit };
  return state?.key === key ? state.games : { status: "loading", events: [] };
}

/** One later week's games, fetched the first time it's opened (null = nothing open). Bump `attempt` to retry after an error. */
export function useWeekGames(league: ScheduleLeague, weekId: string | null, attempt = 0): WeekGames | null {
  return usePeriodGames(league, weekId ? { week: weekId } : null, attempt);
}

/** One basketball day's games ("20260402"), fetched once picked (null = none picked). Bump `attempt` to retry. */
export function useDayGames(league: ScheduleLeague, date: string | null, attempt = 0): WeekGames | null {
  return usePeriodGames(league, date ? { date } : null, attempt);
}
