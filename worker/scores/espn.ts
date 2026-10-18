// Client for ESPN's public site API (site.api.espn.com/apis/site/v2). The API is
// unofficial and undocumented by ESPN, so every field below is treated as
// optional and the parsers never throw on odd data: a malformed event is skipped,
// a missing number becomes 0 or "unknown", and callers decide what to do with gaps.

import type { League, LiveUpdate, ScheduleEvent, ScheduleWeek, Team } from "../../shared/types";

export type LinkedLeague = Exclude<League, "custom">;
export type EspnState = "pre" | "in" | "post";

const SITE_API = "https://site.api.espn.com/apis/site/v2/sports/football";
const LEAGUE_PATH: Record<LinkedLeague, string> = {
  nfl: "nfl",
  ncaaf: "college-football",
};

// ---- Raw response shapes (only the fields we read) ----

interface RawTeam {
  displayName?: string;
  location?: string;
  name?: string;
  abbreviation?: string;
  color?: string;
}

interface RawLinescore {
  value?: number;
  displayValue?: string;
  period?: number;
}

interface RawCompetitor {
  homeAway?: string;
  team?: RawTeam;
  /** College poll rank; 99 means unranked. */
  curatedRank?: { current?: number };
  /** A string on the scoreboard ("27"); tolerate numbers too. */
  score?: string | number;
  linescores?: RawLinescore[];
}

interface RawStatus {
  period?: number;
  displayClock?: string;
  type?: {
    name?: string;
    state?: string;
    completed?: boolean;
    shortDetail?: string;
    detail?: string;
  };
}

interface RawCompetition {
  id?: string;
  date?: string;
  competitors?: RawCompetitor[];
  status?: RawStatus;
  neutralSite?: boolean;
  venue?: { fullName?: string; address?: { city?: string; state?: string; country?: string } };
}

interface RawEvent {
  id?: string;
  date?: string;
  name?: string;
  shortName?: string;
  competitions?: RawCompetition[];
  status?: RawStatus;
}

// ---- URLs ----

/** YYYYMMDD in UTC, the format ESPN's `dates` parameter takes. */
export function espnDate(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10).replace(/-/g, "");
}

/** A week of the season: ESPN's season type (1 pre, 2 regular, 3 post) and its week value. */
export interface WeekRef {
  seasonType: number;
  week: number;
}

/** "2-7" -> { seasonType: 2, week: 7 }; null for anything else. */
export function parseWeekId(id: string): WeekRef | null {
  const m = /^([1-3])-([1-9]\d{0,2})$/.exec(id);
  return m ? { seasonType: Number(m[1]), week: Number(m[2]) } : null;
}

/**
 * The scoreboard for the current week, for one US day when `at` is a day (epoch
 * ms), or for a given week of the season. ESPN answers 400 to date ranges.
 */
export function scoreboardUrl(league: LinkedLeague, at?: number | WeekRef): string {
  const params = new URLSearchParams();
  if (typeof at === "number") params.set("dates", espnDate(at));
  else if (at) {
    params.set("seasontype", String(at.seasonType));
    params.set("week", String(at.week));
  }
  if (league === "ncaaf") {
    // groups=80 is FBS; without it the college scoreboard returns only a featured subset.
    params.set("groups", "80");
    params.set("limit", "300");
  }
  const query = params.toString();
  return `${SITE_API}/${LEAGUE_PATH[league]}/scoreboard${query ? `?${query}` : ""}`;
}

export function summaryUrl(league: LinkedLeague, eventId: string): string {
  return `${SITE_API}/${LEAGUE_PATH[league]}/summary?event=${encodeURIComponent(eventId)}`;
}

export async function fetchEspnJson(url: string, timeoutMs: number): Promise<unknown> {
  const res = await fetch(url, {
    // No custom user-agent: ESPN's CDN answers 403 Access Denied to unknown agents.
    headers: { accept: "application/json" },
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!res.ok) throw new Error(`ESPN responded ${res.status} for ${url}`);
  return res.json();
}

// ---- Shared field parsing ----

function asRecord(v: unknown): Record<string, unknown> | null {
  return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
}

function toNumber(v: unknown): number | null {
  const n = typeof v === "number" ? v : typeof v === "string" && v.trim() !== "" ? Number(v) : NaN;
  return Number.isFinite(n) ? n : null;
}

function parseState(status: RawStatus | undefined): EspnState {
  const state = status?.type?.state;
  if (state === "pre" || state === "in" || state === "post") return state;
  return status?.type?.completed ? "post" : "pre";
}

function parseTeam(raw: RawTeam | undefined): Team | null {
  if (!raw) return null;
  const name = raw.displayName?.trim() || [raw.location, raw.name].filter(Boolean).join(" ").trim();
  if (!name) return null;
  const team: Team = { name };
  if (raw.abbreviation) team.abbr = raw.abbreviation;
  if (raw.color && /^[0-9a-f]{6}$/i.test(raw.color)) team.color = `#${raw.color.toLowerCase()}`;
  return team;
}

/** ESPN marks the designated home team even at neutral sites; fall back to its ordering. */
function homeAndAway(competitors: RawCompetitor[] | undefined): [RawCompetitor, RawCompetitor] | null {
  if (!Array.isArray(competitors) || competitors.length < 2) return null;
  const home = competitors.find((c) => c.homeAway === "home") ?? competitors[0];
  const away = competitors.find((c) => c.homeAway === "away" && c !== home) ?? competitors.find((c) => c !== home);
  return away ? [home, away] : null;
}

function parseRank(raw: RawCompetitor): number | undefined {
  const n = toNumber(raw.curatedRank?.current);
  return n !== null && Number.isInteger(n) && n >= 1 && n <= 25 ? n : undefined;
}

function parseVenue(raw: RawCompetition["venue"]): ScheduleEvent["venue"] | undefined {
  const name = raw?.fullName?.trim();
  if (!name) return undefined;
  const venue: NonNullable<ScheduleEvent["venue"]> = { name };
  const city = raw?.address?.city?.trim();
  const country = raw?.address?.country?.trim();
  if (city) venue.city = city;
  if (country) venue.country = country;
  return venue;
}

function isPlaceholderTeam(team: Team): boolean {
  return /^tbd$/i.test(team.name) || /^tbd$/i.test(team.abbr ?? "");
}

/** True when the body looks like a scoreboard response (an `events` array, possibly empty). */
export function isScoreboard(json: unknown): json is { events: unknown[] } {
  return Array.isArray(asRecord(json)?.events);
}

function rawEvents(json: unknown): RawEvent[] {
  return isScoreboard(json) ? (json.events.filter((e) => asRecord(e)) as RawEvent[]) : [];
}

// ---- Schedule ----

export function parseSchedule(json: unknown, league: LinkedLeague): ScheduleEvent[] {
  const out: ScheduleEvent[] = [];
  for (const event of rawEvents(json)) {
    const competition = event.competitions?.[0];
    const sides = homeAndAway(competition?.competitors);
    const startsAt = Date.parse(competition?.date ?? event.date ?? "");
    if (!event.id || !sides || !Number.isFinite(startsAt)) continue;
    const home = parseTeam(sides[0].team);
    const away = parseTeam(sides[1].team);
    // Unannounced playoff slots can't be meaningfully linked to a board.
    if (!home || !away || isPlaceholderTeam(home) || isPlaceholderTeam(away)) continue;
    const item: ScheduleEvent = {
      eventId: String(event.id),
      league,
      name: event.name || `${away.name} at ${home.name}`,
      shortName: event.shortName || `${away.abbr ?? away.name} @ ${home.abbr ?? home.name}`,
      startsAt,
      home,
      away,
      state: parseState(competition?.status ?? event.status),
    };
    const venue = parseVenue(competition?.venue);
    if (venue) item.venue = venue;
    if (competition?.neutralSite === true) item.neutralSite = true;
    const homeRank = parseRank(sides[0]);
    const awayRank = parseRank(sides[1]);
    if (homeRank || awayRank) item.ranks = { ...(homeRank && { home: homeRank }), ...(awayRank && { away: awayRank }) };
    out.push(item);
  }
  return out;
}

// ---- Season calendar ----

export interface SeasonCalendar {
  /** The week this scoreboard covers, when ESPN says. */
  current: ScheduleWeek | null;
  /** Every pre, regular and postseason week of the season, in order. */
  weeks: ScheduleWeek[];
}

/**
 * Weeks from a scoreboard's `leagues[0].calendar` (ESPN groups them by season
 * type: preseason, regular season, postseason, off season) and the week the
 * scoreboard itself covers (`season.type` + `week.number`).
 */
export function parseCalendar(json: unknown): SeasonCalendar {
  const root = asRecord(json);
  const league = asRecord(Array.isArray(root?.leagues) ? root.leagues[0] : null);
  const groups = Array.isArray(league?.calendar) ? league.calendar : [];
  const weeks: ScheduleWeek[] = [];
  for (const g of groups) {
    const group = asRecord(g);
    const type = toNumber(group?.value);
    // 4 is the off season (all-star games); nothing there to put on a board.
    if (type === null || type < 1 || type > 3 || !Array.isArray(group?.entries)) continue;
    for (const e of group.entries) {
      const entry = asRecord(e);
      const week = toNumber(entry?.value);
      const startsAt = Date.parse(String(entry?.startDate ?? ""));
      const endsAt = Date.parse(String(entry?.endDate ?? ""));
      // Long names ("Conference Championship") use ESPN's short form ("Conf Champ").
      const full = typeof entry?.label === "string" ? entry.label.trim() : "";
      const short = typeof entry?.alternateLabel === "string" ? entry.alternateLabel.trim() : "";
      const label = full.length > 18 && short ? short : full;
      if (week === null || !Number.isInteger(week) || week < 1 || !label || !Number.isFinite(startsAt) || !Number.isFinite(endsAt)) continue;
      // ESPN's endDate is the last minute of the week ("...T06:59Z"); make it exclusive.
      weeks.push({ id: `${type}-${week}`, label, startsAt, endsAt: endsAt + 60_000 });
    }
  }
  weeks.sort((a, b) => a.startsAt - b.startsAt);
  const seasonType = toNumber(asRecord(root?.season)?.type);
  const weekNumber = toNumber(asRecord(root?.week)?.number);
  const currentId = seasonType !== null && weekNumber !== null ? `${seasonType}-${weekNumber}` : null;
  return { current: weeks.find((w) => w.id === currentId) ?? null, weeks };
}

// ---- Live snapshots ----

export interface SideSnapshot {
  score: number;
  /** Points per period, index 0 = first period; null where ESPN sent nothing. */
  linescores: (number | null)[];
}

/**
 * One game's live data in ESPN's home/away orientation. Kept JSON-serializable
 * so a whole scoreboard of these can be cached and shared by every board.
 */
export interface GameSnapshot {
  eventId: string;
  state: EspnState;
  statusName: string;
  completed: boolean;
  period: number;
  clock: string;
  detail: string;
  home: SideSnapshot;
  away: SideSnapshot;
}

function parseLinescores(raw: RawLinescore[] | undefined): (number | null)[] {
  const out: (number | null)[] = [];
  if (!Array.isArray(raw)) return out;
  raw.forEach((ls, i) => {
    // Newer payloads tag each entry with its period; older ones rely on order.
    // The summary endpoint only sends displayValue.
    const period = Number.isInteger(ls?.period) && (ls.period as number) >= 1 ? (ls.period as number) : i + 1;
    if (period > 20) return;
    const value = toNumber(ls?.value) ?? toNumber(ls?.displayValue);
    while (out.length < period) out.push(null);
    if (value !== null) out[period - 1] = value;
  });
  return out;
}

function parseSide(raw: RawCompetitor): SideSnapshot {
  return { score: Math.max(0, toNumber(raw.score) ?? 0), linescores: parseLinescores(raw.linescores) };
}

function snapshotFrom(eventId: string, competition: RawCompetition, fallbackStatus?: RawStatus): GameSnapshot | null {
  const sides = homeAndAway(competition.competitors);
  if (!sides) return null;
  const status = competition.status ?? fallbackStatus;
  return {
    eventId,
    state: parseState(status),
    statusName: status?.type?.name ?? "",
    completed: status?.type?.completed === true,
    period: Math.max(0, Math.trunc(toNumber(status?.period) ?? 0)),
    clock: status?.displayClock ?? "",
    detail: status?.type?.shortDetail ?? status?.type?.detail ?? "",
    home: parseSide(sides[0]),
    away: parseSide(sides[1]),
  };
}

export function parseScoreboardSnapshots(json: unknown): GameSnapshot[] {
  const out: GameSnapshot[] = [];
  for (const event of rawEvents(json)) {
    const competition = event.competitions?.[0];
    if (!event.id || !competition) continue;
    const snap = snapshotFrom(String(event.id), competition, event.status);
    if (snap) out.push(snap);
  }
  return out;
}

/** The summary endpoint carries the same competition object under `header`. */
export function parseSummarySnapshot(json: unknown): GameSnapshot | null {
  const header = asRecord(asRecord(json)?.header);
  const competitions = header?.competitions;
  const competition = Array.isArray(competitions) ? asRecord(competitions[0]) : null;
  const id = header?.id ?? competition?.id;
  if (!competition || (typeof id !== "string" && typeof id !== "number")) return null;
  return snapshotFrom(String(id), competition as RawCompetition);
}

// ---- Board orientation + period logic ----

// Status names ESPN uses while play is stopped between periods. The detail text
// check backs these up in case a new name appears ("End of 4th", "Halftime").
const BREAK_STATUSES = new Set(["STATUS_END_PERIOD", "STATUS_HALFTIME", "STATUS_END_OF_REGULATION"]);

function isBetweenPeriods(s: GameSnapshot): boolean {
  return BREAK_STATUSES.has(s.statusName) || /^(end of|halftime)/i.test(s.detail.trim());
}

/** Number of leading periods for which both teams have a linescore. */
function knownPeriods(a: (number | null)[], b: (number | null)[]): number {
  let n = 0;
  while (n < a.length && n < b.length && a[n] !== null && b[n] !== null) n++;
  return n;
}

/**
 * Converts a snapshot into a LiveUpdate oriented to the board (X = columns).
 *
 * completedPeriods: a final game counts every period it played; otherwise the
 * current period is complete only during an explicit break (end of quarter,
 * halftime). A clock reading 0:00 alone is not trusted, since the PAT after a
 * touchdown at the gun and untimed downs still belong to that period.
 *
 * Linescores: earlier periods come from ESPN as-is, and the latest period played
 * absorbs `score - earlier periods`, so the per-period totals always add up to
 * the headline score even when ESPN updates the score before the linescores.
 * If an earlier period is missing from ESPN's data, we stop at the gap and hold
 * back completedPeriods rather than award a period from invented numbers.
 */
export function toLiveUpdate(s: GameSnapshot, xIsHome: boolean, updatedAt: number): LiveUpdate {
  const x = xIsHome ? s.home : s.away;
  const y = xIsHome ? s.away : s.home;
  const known = knownPeriods(x.linescores, y.linescores);

  let latest: number; // index of the latest period played, -1 before kickoff
  let completedPeriods: number;
  if (s.completed) {
    const played = Math.max(known, s.period);
    latest = played - 1;
    completedPeriods = played;
  } else if (s.state === "pre") {
    latest = -1;
    completedPeriods = 0;
  } else {
    latest = s.period - 1;
    completedPeriods = isBetweenPeriods(s) ? s.period : Math.max(0, s.period - 1);
  }

  let linescoresX: number[];
  let linescoresY: number[];
  if (latest < 0) {
    linescoresX = [];
    linescoresY = [];
  } else if (known < latest) {
    linescoresX = x.linescores.slice(0, known) as number[];
    linescoresY = y.linescores.slice(0, known) as number[];
    completedPeriods = Math.min(completedPeriods, known);
  } else {
    linescoresX = reconcile(x, latest);
    linescoresY = reconcile(y, latest);
  }

  return {
    live: {
      state: s.state,
      period: s.period,
      clock: s.clock,
      detail: s.detail,
      scoreX: x.score,
      scoreY: y.score,
      updatedAt,
    },
    linescoresX,
    linescoresY,
    completedPeriods,
    isFinal: s.completed,
  };
}

function reconcile(side: SideSnapshot, latest: number): number[] {
  const out: number[] = [];
  let earlier = 0;
  for (let i = 0; i < latest; i++) {
    const v = side.linescores[i] ?? 0;
    out.push(v);
    earlier += v;
  }
  out.push(Math.max(0, side.score - earlier));
  return out;
}
