// Season boards (docs/ARCHITECTURE.md "Season boards"): reading a season
// board's input, finding its games (a team's schedule from ESPN, or the games
// the host picked) and giving each game its own board, at the draw and from
// the cron as new games (playoffs) appear. Core orchestration: D1 goes
// through worker/db.ts, the provider through worker/scores, and the pure
// rules live in shared/season.ts.

import { MONEY_ERRORS, mentionsMoney } from "../shared/formats";
import {
  MAX_SEASON_GAMES,
  SEASON_ERRORS,
  SEASON_RETRY_MS,
  SEASON_SYNC_MS,
  gameNumbers,
  gamesToAdd,
  isSeasonNumbers,
  isSeasonScope,
  seasonAxes,
  seasonGameName,
  seasonGameTeams,
  seasonLabel,
  seasonOver,
  upcomingSeasonEvents,
} from "../shared/season";
import { isLinkedLeague, type LinkedLeague } from "../shared/sports";
import type { Game, GameState, NumberDraw, ScheduleEvent, SeasonEvent, SeasonTeam, Team } from "../shared/types";
import { cleanText, cleanTeam } from "./clean";
import * as db from "./db";
import type { Env } from "./env";
import { makeId } from "./ids";
import { isSeasonYear, isTeamId, teamSeasonVia } from "./scores";
import { newActivity, pushToRoom } from "./service";

const EVENT_ID_RE = /^[A-Za-z0-9_-]{1,32}$/;
const DAY_MS = 24 * 60 * 60_000;
/** Most games a request may list (a team's whole schedule, finished games included). */
const MAX_INPUT_EVENTS = 300;
/** Season boards the cron reads per minute (each one's team schedule is cached for half an hour). */
const SYNC_BATCH = 5;
/** A team's season ends this long after its last game, so a playoff game scheduled late still gets its board. */
const SEASON_END_GRACE_MS = 14 * DAY_MS;

/** An https logo on ESPN's CDN, else dropped. */
function cleanLogo(v: unknown): string | undefined {
  return typeof v === "string" && v.length <= 300 && /^https:\/\/[a-z0-9.-]*espncdn\.com\/[^\s"'<>]+$/i.test(v) ? v : undefined;
}

function cleanSeasonTeam(v: unknown): SeasonTeam | null {
  if (!v || typeof v !== "object") return null;
  const t = v as Record<string, unknown>;
  const team = cleanTeam(t);
  if (!team || !isTeamId(t.id)) return null;
  const out: SeasonTeam = { id: t.id, ...team };
  const short = cleanText(t.shortName, 30);
  if (short) out.shortName = short;
  const logo = cleanLogo(t.logo);
  if (logo) out.logo = logo;
  return out;
}

/** One game as a request lists it: well formed, kicking off from a day ago to about a year ahead; null otherwise. */
function cleanSeasonEvent(v: unknown, now: number): SeasonEvent | null {
  if (!v || typeof v !== "object") return null;
  const e = v as Record<string, unknown>;
  if (typeof e.eventId !== "string" || !EVENT_ID_RE.test(e.eventId)) return null;
  const startsAt = Number(e.startsAt);
  if (!Number.isFinite(startsAt) || startsAt < now - DAY_MS || startsAt > now + 400 * DAY_MS) return null;
  const home = cleanTeam(e.home);
  const away = cleanTeam(e.away);
  if (!home || !away) return null;
  const out: SeasonEvent = { eventId: e.eventId, startsAt: Math.trunc(startsAt), home, away };
  if (isTeamId(e.homeId)) out.homeId = e.homeId;
  if (isTeamId(e.awayId)) out.awayId = e.awayId;
  const label = cleanText(e.label, 40);
  if (label) out.label = label;
  if (e.playoff === true) out.playoff = true;
  return out;
}

/** A season board as the create route makes it: what it stores, its axes, its league. */
export interface SeasonPlan {
  stored: db.StoredSeason;
  league: LinkedLeague;
  teamX: Team;
  teamY: Team;
  /** The first game's kickoff (the board's startsAt). */
  firstKickoff: number;
}

/**
 * CreateGameInput.season, checked: a league with a live feed, a scope and a
 * numbers mode, the team (a team's season) and the games still to come
 * (deduplicated, up to MAX_SEASON_GAMES). A string is the 400's message.
 */
export function parseSeasonInput(v: unknown, league: unknown, now: number): SeasonPlan | string {
  if (!v || typeof v !== "object" || Array.isArray(v)) return SEASON_ERRORS.scope;
  const input = v as Record<string, unknown>;
  if (!isLinkedLeague(league)) return SEASON_ERRORS.league;
  if (!isSeasonScope(input.scope)) return SEASON_ERRORS.scope;
  if (!isSeasonNumbers(input.numbers)) return SEASON_ERRORS.numbers;
  const scope = input.scope;
  let team: SeasonTeam | null = null;
  let year: number | null = null;
  if (scope === "team") {
    team = cleanSeasonTeam(input.team);
    if (!team) return SEASON_ERRORS.team;
    if (mentionsMoney(team.name) || mentionsMoney(team.abbr ?? "") || mentionsMoney(team.shortName ?? "")) return MONEY_ERRORS.team;
    const y = Number(input.year);
    year = isSeasonYear(y) ? y : null;
  }
  const raw = Array.isArray(input.events) ? input.events : [];
  if (raw.length > MAX_INPUT_EVENTS) return SEASON_ERRORS.tooMany;
  const cleaned = raw.map((e) => cleanSeasonEvent(e, now)).filter((e): e is SeasonEvent => e !== null);
  if (cleaned.some((e) => [e.home, e.away].some((t) => mentionsMoney(t.name) || mentionsMoney(t.abbr ?? "")))) return MONEY_ERRORS.team;
  const events = upcomingSeasonEvents(cleaned, now);
  if (scope === "games" && events.length > MAX_SEASON_GAMES) return SEASON_ERRORS.tooMany;
  const kept = events.slice(0, MAX_SEASON_GAMES);
  if (kept.length === 0) return scope === "team" ? SEASON_ERRORS.noGames : SEASON_ERRORS.events;
  const spec = { scope, numbers: input.numbers, league, team, year };
  const { teamX, teamY } = seasonAxes(scope, team);
  return {
    stored: { ...spec, label: seasonLabel(spec, kept.length), events: kept },
    league,
    teamX,
    teamY,
    firstKickoff: kept[0].startsAt,
  };
}

/** A team schedule's game as a season keeps it. */
export function seasonEventOf(e: ScheduleEvent): SeasonEvent {
  const out: SeasonEvent = { eventId: e.eventId, startsAt: e.startsAt, home: e.home, away: e.away };
  if (e.homeId) out.homeId = e.homeId;
  if (e.awayId) out.awayId = e.awayId;
  if (e.label) out.label = e.label;
  if (e.playoff) out.playoff = true;
  return out;
}

/** The games a season works from now, and whether they're the provider's latest word (not just what was stored). */
export interface SeasonSchedule {
  events: SeasonEvent[];
  fresh: boolean;
}

/**
 * A season's games: a team's schedule as ESPN has it now (through the
 * ScoreHub), or, for picked games or while ESPN can't be reached, the games
 * the season board stored.
 */
export async function seasonSchedule(env: Env, stored: db.StoredSeason): Promise<SeasonSchedule> {
  if (stored.scope === "team" && stored.team) {
    const season = await teamSeasonVia(env, stored.league, stored.team.id, stored.year);
    if (season) return { events: season.events.map(seasonEventOf), fresh: true };
    return { events: stored.events, fresh: false };
  }
  return { events: stored.events, fresh: true };
}

/** Whether a season has a game still to come that would get a board (the draw needs one). */
export function hasGamesAhead(schedule: SeasonSchedule, children: readonly db.SeasonChild[], now: number): boolean {
  return children.some((c) => c.status !== "final") || gamesToAdd(schedule.events, new Set(children.map((c) => c.eventId)), children.length, now).length > 0;
}

export interface SeasonSync {
  /** The season board's state after the writes (null when nothing was written or it's gone). */
  state: GameState | null;
  /** Game boards made. */
  added: number;
  /** The season board ended (every game final, nothing more scheduled). */
  ended: boolean;
}

/**
 * Brings a drawn season board's games up to date: a board for every game on
 * the schedule still to come that has none (copied players, squares and
 * rules, the season's numbers or a fresh draw, locked and paid through the
 * season board), kickoffs the provider moved, the games it knows (for their
 * labels), and the season board's end once every game is final and nothing
 * more is scheduled. One batch on the season board (its version moves);
 * nothing is written when nothing changed but the read's time.
 */
export async function syncSeasonGames(env: Env, seasonId: string, now: number, schedule?: SeasonSchedule): Promise<SeasonSync> {
  const none: SeasonSync = { state: null, added: 0, ended: false };
  const row = await db.getGameRow(env.DB, seasonId);
  const stored = row ? db.storedSeasonOf(row) : null;
  if (!row || !stored || row.kind !== "season" || row.status !== "locked") return none;
  const [{ events, fresh }, children] = await Promise.all([schedule ? Promise.resolve(schedule) : seasonSchedule(env, stored), db.seasonChildren(env.DB, seasonId)]);
  const have = new Set(children.map((c) => c.eventId));
  const toAdd = gamesToAdd(events, have, children.length, now);
  const season = JSON.parse(row.numbers ?? "null") as Record<string, NumberDraw> | null;
  const format = JSON.parse(row.format) as Game["format"];

  const writes: D1PreparedStatement[] = [];
  const made: string[] = [];
  for (const event of toAdd) {
    const { teamX, teamY, linkedEvent } = seasonGameTeams(stored, event);
    const id = makeId();
    made.push(id);
    writes.push(
      ...db.seasonGameStatements(
        env.DB,
        seasonId,
        {
          id,
          eventId: event.eventId,
          name: seasonGameName(row.name, teamX, teamY, linkedEvent.xIsHome),
          teamX,
          teamY,
          linkedEvent,
          numbers: gameNumbers(season, format, stored.numbers),
        },
        now,
      ),
    );
  }

  // Kickoffs the provider moved (a flexed game), for games not started yet.
  if (fresh) {
    const byId = new Map(events.map((e) => [e.eventId, e]));
    for (const c of children) {
      const e = byId.get(c.eventId);
      if (!e || !c.linkedEvent || c.started || c.status !== "locked" || e.startsAt === c.linkedEvent.startsAt || e.startsAt <= now) continue;
      writes.push(db.moveSeasonGameStatement(env.DB, c.id, { ...c.linkedEvent, startsAt: e.startsAt }, now));
    }
  }

  // The games it knows, newest word first (labels for the schedule; the planned list before the draw).
  const known = new Map(stored.events.map((e) => [e.eventId, e]));
  let learned = false;
  for (const e of events) {
    const cur = known.get(e.eventId);
    if (!cur || cur.startsAt !== e.startsAt || cur.label !== e.label || cur.playoff !== e.playoff) learned = true;
    known.set(e.eventId, e);
  }
  if (learned) {
    const list = [...known.values()].sort((a, b) => a.startsAt - b.startsAt).slice(-MAX_SEASON_GAMES * 2);
    writes.push(db.storeSeasonStatement(env.DB, seasonId, { ...stored, events: list }));
  }

  // Over: every game has a board and is final, and nothing more is scheduled. A
  // team's season waits a while after its last game first: playoff games are
  // only put on its schedule once the matchups are known.
  const lastKickoff = Math.max(0, ...children.map((c) => c.linkedEvent?.startsAt ?? 0));
  const settled = stored.scope !== "team" || now - lastKickoff > SEASON_END_GRACE_MS;
  const ended = fresh && settled && seasonOver(children, toAdd.length);
  const final = ended ? newActivity("final", null, {}, now) : null;
  if (final) writes.push(db.setFinal(env.DB, seasonId), db.insertActivityIfChanged(env.DB, seasonId, final));

  // Read again in about SEASON_SYNC_MS; after a read that failed, within the hour.
  const syncedAt = fresh ? now : now - SEASON_SYNC_MS + SEASON_RETRY_MS;
  if (writes.length === 0) {
    await db.seasonSyncedStatement(env.DB, seasonId, syncedAt).run();
    return none;
  }
  writes.push(db.seasonSyncedStatement(env.DB, seasonId, syncedAt));
  const { results, state } = await db.commit(env.DB, seasonId, writes, now);
  // Each new game's first statement is its board's insert (4 statements a game).
  const added = made.filter((_, i) => (results[i * 4]?.meta.changes ?? 0) > 0).length;
  return { state, added, ended: !!final && !!state?.activity.some((a) => a.id === final.id) };
}

/**
 * The cron (every minute): drawn season boards due a schedule read (about
 * twice a day each; within the hour after a read that failed) get new games'
 * boards (playoffs as they're scheduled) and moved kickoffs. Their open
 * boards get the new state. Never pushed. Never throws.
 */
export async function syncSeasons(env: Env, now: number): Promise<void> {
  let due: string[];
  try {
    due = await db.seasonsDue(env.DB, now - SEASON_SYNC_MS, SYNC_BATCH);
  } catch (err) {
    // Migration 0017 not applied yet: nothing to read.
    if (/no such column|no such table/i.test(String(err))) return;
    throw err;
  }
  for (const id of due) {
    try {
      const { state } = await syncSeasonGames(env, id, now);
      if (state) await pushToRoom(env, id, state);
    } catch (err) {
      console.error(`season ${id} sync failed`, err);
    }
  }
}
