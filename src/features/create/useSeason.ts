// A team's season for the create flow's season boards: the league's teams
// (logos and colors) once "A team's season" is picked, then the picked team's
// schedule. Both endpoints answer 200 with `unavailable: true` when ESPN can't
// be reached; that reads as an error the host can retry (or pick games
// instead). Cached for the session, like the schedule.

import { useEffect, useState } from "react";
import type { LinkedLeague } from "../../../shared/sports";
import type { SeasonTeam, TeamScheduleResponse } from "../../../shared/types";
import { api } from "../../lib/api";

export interface Loadable<T> {
  status: "idle" | "loading" | "ready" | "error";
  value: T | null;
}

const CACHE_MS = 10 * 60_000;
const teamsCache = new Map<LinkedLeague, { at: number; teams: SeasonTeam[] }>();
const seasonCache = new Map<string, { at: number; season: TeamScheduleResponse }>();

/** Tests: forget the session cache. */
export function clearSeasonCache(): void {
  teamsCache.clear();
  seasonCache.clear();
}

const fresh = (at: number) => Date.now() - at < CACHE_MS;

/** The league's teams for the team picker (null league = not wanted yet). Bump `attempt` to retry. */
export function useSeasonTeams(league: LinkedLeague | null, attempt = 0): Loadable<SeasonTeam[]> {
  const hit = league ? teamsCache.get(league) : undefined;
  const [state, setState] = useState<{ league: LinkedLeague | null; value: Loadable<SeasonTeam[]> }>({ league: null, value: { status: "idle", value: null } });
  useEffect(() => {
    if (!league) return;
    const cached = teamsCache.get(league);
    if (cached && fresh(cached.at)) {
      setState({ league, value: { status: "ready", value: cached.teams } });
      return;
    }
    const controller = new AbortController();
    setState({ league, value: { status: "loading", value: null } });
    api
      .seasonTeams(league, controller.signal)
      .then((res) => {
        if (res.unavailable || res.teams.length === 0) throw new Error("teams unavailable");
        teamsCache.set(league, { at: Date.now(), teams: res.teams });
        if (!controller.signal.aborted) setState({ league, value: { status: "ready", value: res.teams } });
      })
      .catch(() => {
        if (!controller.signal.aborted) setState({ league, value: { status: "error", value: null } });
      });
    return () => controller.abort();
  }, [league, attempt]);
  if (!league) return { status: "idle", value: null };
  if (hit && fresh(hit.at)) return { status: "ready", value: hit.teams };
  return state.league === league ? state.value : { status: "loading", value: null };
}

/** One team's season (null team = none picked). Bump `attempt` to retry. */
export function useTeamSeason(league: LinkedLeague | null, teamId: string | null, attempt = 0): Loadable<TeamScheduleResponse> {
  const key = league && teamId ? `${league}:${teamId}` : null;
  const [state, setState] = useState<{ key: string | null; value: Loadable<TeamScheduleResponse> }>({ key: null, value: { status: "idle", value: null } });
  useEffect(() => {
    if (!key || !league || !teamId) return;
    const cached = seasonCache.get(key);
    if (cached && fresh(cached.at)) {
      setState({ key, value: { status: "ready", value: cached.season } });
      return;
    }
    const controller = new AbortController();
    setState({ key, value: { status: "loading", value: null } });
    api
      .teamSchedule(league, teamId, controller.signal)
      .then((res) => {
        if (res.unavailable) throw new Error("schedule unavailable");
        seasonCache.set(key, { at: Date.now(), season: res });
        if (!controller.signal.aborted) setState({ key, value: { status: "ready", value: res } });
      })
      .catch(() => {
        if (!controller.signal.aborted) setState({ key, value: { status: "error", value: null } });
      });
    return () => controller.abort();
  }, [key, league, teamId, attempt]);
  if (!key) return { status: "idle", value: null };
  const cached = seasonCache.get(key);
  if (cached && fresh(cached.at)) return { status: "ready", value: cached.season };
  return state.key === key ? state.value : { status: "loading", value: null };
}
