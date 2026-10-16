// This week's real games for the picker: NFL and college fetched together.
// The schedule endpoint answers 200 with `unavailable: true` when ESPN can't be
// reached; that (or an empty week) just means "lead with custom teams".

import { useEffect, useState } from "react";
import type { League, ScheduleEvent } from "../../../shared/types";
import { api } from "../../lib/api";
import { upcomingEvents } from "./model";

export type ScheduleLeague = Exclude<League, "custom">;

export interface LeagueSchedule {
  loading: boolean;
  events: ScheduleEvent[];
}

export type Schedule = Record<ScheduleLeague, LeagueSchedule>;

const LEAGUES: ScheduleLeague[] = ["nfl", "ncaaf"];
const EMPTY: Schedule = { nfl: { loading: true, events: [] }, ncaaf: { loading: true, events: [] } };

/** Session cache so going back and forth doesn't flash skeletons. */
let cache: { at: number; schedule: Schedule } | null = null;
const CACHE_MS = 5 * 60_000;

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
        .then((res) => (res.unavailable ? [] : upcomingEvents(res.events ?? [])))
        .catch(() => [] as ScheduleEvent[])
        .then((events) => {
          if (controller.signal.aborted) return;
          next = { ...next, [league]: { loading: false, events } };
          setSchedule(next);
          if (++done === LEAGUES.length) cache = { at: Date.now(), schedule: next };
        });
    }
    return () => controller.abort();
  }, []);

  return schedule;
}
