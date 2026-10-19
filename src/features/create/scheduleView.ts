// How the game picker talks about time and place. Times are always the
// device's own time zone (an early kickoff like 6:30 AM in California is a
// 9:30 AM Eastern game in London, so the venue is shown for those).

import type { ScheduleEvent, ScheduleWeek } from "../../../shared/types";

const DAY_MS = 86_400_000;

function startOfDay(ts: number): number {
  return new Date(ts).setHours(0, 0, 0, 0);
}

/** Short name of the device's time zone, e.g. "PDT" (lives in lib/format: the board shows it too). */
export { zoneLabel } from "../../lib/format";

/** "Today", "Tomorrow", or "Thursday, Oct 22", in local time. */
export function dayHeading(ts: number, now = Date.now()): string {
  const days = Math.round((startOfDay(ts) - startOfDay(now)) / DAY_MS);
  if (days === 0) return "Today";
  if (days === 1) return "Tomorrow";
  return new Date(ts).toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric" });
}

// ---- Basketball's days ("20260320", the schedule's `date`) ----

const pad = (n: number) => String(n).padStart(2, "0");

/** The local calendar day of `ts` as a schedule day id: "20260320". */
export function dayIdOf(ts: number): string {
  const d = new Date(ts);
  return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}`;
}

/** A day id as a date input's value: "20260320" -> "2026-03-20". */
export function dateInputValue(id: string): string {
  return /^\d{8}$/.test(id) ? `${id.slice(0, 4)}-${id.slice(4, 6)}-${id.slice(6)}` : "";
}

/** A picked day for a label: "20260402" -> "Thu, Apr 2" (that calendar date, whatever the zone). */
export function pickedDayLabel(id: string): string {
  const m = /^(\d{4})(\d{2})(\d{2})$/.exec(id);
  if (!m) return id;
  return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
}

/** "Oct 21 – 27" or "Oct 28 – Nov 3" (endsAt is exclusive). */
export function weekRange(week: Pick<ScheduleWeek, "startsAt" | "endsAt">): string {
  const start = new Date(week.startsAt);
  const end = new Date(Math.max(week.startsAt, week.endsAt - 1));
  const month = (d: Date) => d.toLocaleDateString("en-US", { month: "short" });
  if (start.getMonth() === end.getMonth() && start.getFullYear() === end.getFullYear()) {
    return start.getDate() === end.getDate() ? `${month(start)} ${start.getDate()}` : `${month(start)} ${start.getDate()} – ${end.getDate()}`;
  }
  return `${month(start)} ${start.getDate()} – ${month(end)} ${end.getDate()}`;
}

/** Whether a week is under way, or still to come (the lead week can be next week). */
export function weekTag(week: Pick<ScheduleWeek, "startsAt">, now = Date.now()): "This week" | "Up next" {
  return week.startsAt <= now ? "This week" : "Up next";
}

const US = new Set(["usa", "us", "united states", "united states of america"]);

/**
 * Where a game is played, when that's worth saying: "London · Wembley Stadium"
 * for games abroad, "Neutral site · Atlanta" for bowls and neutral-site games.
 * Null for an ordinary home game.
 */
export function siteLabel(e: Pick<ScheduleEvent, "venue" | "neutralSite">): string | null {
  const v = e.venue;
  if (!v) return null;
  const abroad = !!v.country && !US.has(v.country.trim().toLowerCase());
  if (abroad) return v.city ? `${v.city} · ${v.name}` : v.name;
  if (e.neutralSite) return `Neutral site · ${v.city ?? v.name}`;
  return null;
}

/** Games grouped under local day headings, in kickoff order. */
export function groupByDay<T extends Pick<ScheduleEvent, "startsAt">>(events: readonly T[], now = Date.now()): { day: string; events: T[] }[] {
  const out: { day: string; events: T[] }[] = [];
  for (const e of [...events].sort((a, b) => a.startsAt - b.startsAt)) {
    const day = dayHeading(e.startsAt, now);
    const last = out[out.length - 1];
    if (last?.day === day) last.events.push(e);
    else out.push({ day, events: [e] });
  }
  return out;
}

/** True when every word of the query appears in the teams' names or abbreviations. */
export function matchesQuery(e: Pick<ScheduleEvent, "home" | "away" | "shortName">, q: string): boolean {
  const hay = [e.away.name, e.home.name, e.away.abbr, e.home.abbr, e.shortName].join(" ").toLowerCase();
  return q
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
    .every((w) => hay.includes(w));
}
