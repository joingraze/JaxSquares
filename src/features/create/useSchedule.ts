// Real games for the picker, a week at a time. On mount, NFL and college each
// load their first week with games still to link plus the list of weeks after
// it; a later week's games load only when someone opens it (useWeekGames).
// The schedule endpoint answers 200 with `unavailable: true` when ESPN can't be
// reached; that (or an empty week) just means "lead with custom teams".

import { useEffect, useState } from "react";
import type { League, ScheduleEvent, ScheduleWeek } from "../../../shared/types";
import { api } from "../../lib/api";
import { upcomingEvents } from "./model";

export type ScheduleLeague = Exclude<League, "custom">;

export interface LeagueSchedule {
  loading: boolean;
  /** Games in `week` that can still be linked, soonest first. */
  events: ScheduleEvent[];
  /** The week `events` belong to: this week, or next week once this one's games are over. */
  week: ScheduleWeek | null;
  /** The weeks after it, through the end of the season. */
  weeks: ScheduleWeek[];
}

export type Schedule = Record<ScheduleLeague, LeagueSchedule>;

const LEAGUES: ScheduleLeague[] = ["nfl", "ncaaf"];
const LOADING: LeagueSchedule = { loading: true, events: [], week: null, weeks: [] };
const EMPTY: Schedule = { nfl: LOADING, ncaaf: LOADING };
/** Session cache so going back and forth doesn't flash skeletons or refetch. */
const CACHE_MS = 5 * 60_000;

let cache: { at: number; schedule: Schedule } | null = null;

export function useSchedule(): Schedule {
  const [schedule, setSchedule] = useState<Schedule>(() => (cache && Date.now() - cache.at < CACHE_MS ? cache.schedule : EMPTY));

  useEffect(() => {
    if (cache && Date.now() - cache.at < CACHE_MS) return;
    const controller = new AbortController();
    let done = 0;
    let next: Schedule = EMPTY;
    for (const league of LEAGUES) {
      api
        .schedule(league, controller.signal)
        .then((res): LeagueSchedule =>
          res.unavailable
            ? { loading: false, events: [], week: null, weeks: [] }
            : { loading: false, events: upcomingEvents(res.events ?? []), week: res.week ?? null, weeks: res.weeks ?? [] },
        )
        .catch((): LeagueSchedule => ({ loading: false, events: [], week: null, weeks: [] }))
        .then((loaded) => {
          if (controller.signal.aborted) return;
          next = { ...next, [league]: loaded };
          setSchedule(next);
          if (++done === LEAGUES.length) cache = { at: Date.now(), schedule: next };
        });
    }
    return () => controller.abort();
  }, []);

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
 * One later week's games, fetched the first time it's opened (null = nothing
 * open). Bump `attempt` to retry after an error.
 */
export function useWeekGames(league: ScheduleLeague, weekId: string | null, attempt = 0): WeekGames | null {
  const key = weekId ? `${league}:${weekId}` : null;
  const [state, setState] = useState<{ key: string; games: WeekGames } | null>(null);

  useEffect(() => {
    if (!key || !weekId) return;
    const hit = cachedWeek(key);
    if (hit) {
      setState({ key, games: { status: "ready", events: hit } });
      return;
    }
    setState({ key, games: { status: "loading", events: [] } });
    const controller = new AbortController();
    api
      .schedule(league, controller.signal, weekId)
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
  }, [key, league, weekId, attempt]);

  if (!key) return null;
  const hit = cachedWeek(key);
  if (hit) return { status: "ready", events: hit };
  return state?.key === key ? state.games : { status: "loading", events: [] };
}
