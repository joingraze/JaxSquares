// A custom board's kickoff, as the create flow and Edit board pick it: quick
// day chips (Today, Tomorrow, then the week's days by name), a few common
// times, any date and time from the full input, or no set time. Everything
// is in the device's own time zone, labeled ("PDT"). Pure: no React, no IO.

import { kickoffProblem } from "../../../shared/kickoff";
import { kickoffLabel, zoneLabel } from "../../lib/format";

const DAY_MS = 86_400_000;

/** The time a day chip uses when there's no time yet (and the default kickoff's time). */
export const DEFAULT_KICKOFF_TIME = "13:00";

/** One-tap kickoff times ("HH:MM", local), in order. */
export const KICKOFF_TIMES: readonly string[] = ["12:00", "13:00", "16:25", "19:00", "20:20"];

export interface KickoffDay {
  /** Local calendar day, "2026-10-25". */
  key: string;
  /** "Today", "Tomorrow", or the weekday: "Sun". */
  label: string;
  /** "Oct 25". */
  date: string;
  /** Local midnight that day, epoch ms. */
  start: number;
}

const pad = (n: number) => String(n).padStart(2, "0");

function startOfDay(ts: number): number {
  return new Date(ts).setHours(0, 0, 0, 0);
}

/** Local calendar day of a time: "2026-10-25". */
export function dayKey(ts: number): string {
  const d = new Date(ts);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** Local time of day, 24-hour: "13:00". */
export function timeKey(ts: number): string {
  const d = new Date(ts);
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** "13:00" -> "1:00 PM". */
export function timeLabel(time: string): string {
  const [h, m] = time.split(":").map(Number);
  return new Date(2000, 0, 1, h, m).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
}

/** The day (any time in it) at a local time of day ("13:00"); DST-safe. */
export function atLocal(day: number, time: string): number {
  const [h, m] = time.split(":").map(Number);
  const d = new Date(day);
  return new Date(d.getFullYear(), d.getMonth(), d.getDate(), h || 0, m || 0).getTime();
}

/** The next `count` days from today: "Today", "Tomorrow", then weekday names. */
export function kickoffDays(now: number, count = 7): KickoffDay[] {
  const today = new Date(startOfDay(now));
  return Array.from({ length: count }, (_, i) => {
    const start = new Date(today.getFullYear(), today.getMonth(), today.getDate() + i).getTime();
    const d = new Date(start);
    return {
      key: dayKey(start),
      label: i === 0 ? "Today" : i === 1 ? "Tomorrow" : d.toLocaleDateString("en-US", { weekday: "short" }),
      date: d.toLocaleDateString("en-US", { month: "short", day: "numeric" }),
      start,
    };
  });
}

/**
 * Where a new custom board's kickoff starts: the next Sunday at 1:00 PM local
 * (football's big slot), at least half an hour out, so a Sunday morning picks
 * today and a Sunday evening picks next week.
 */
export function defaultKickoff(now: number): number {
  const d = new Date(now);
  for (let i = 0; i <= 7; i++) {
    const day = new Date(d.getFullYear(), d.getMonth(), d.getDate() + i);
    if (day.getDay() !== 0) continue;
    const at = atLocal(day.getTime(), DEFAULT_KICKOFF_TIME);
    if (at >= now + 30 * 60_000) return at;
  }
  return atLocal(new Date(d.getFullYear(), d.getMonth(), d.getDate() + 7).getTime(), DEFAULT_KICKOFF_TIME);
}

/** The kickoff moved to another day, keeping its time (or `fallbackTime` when there was none). */
export function withDay(kickoff: number | null, day: number, fallbackTime = DEFAULT_KICKOFF_TIME): number {
  return atLocal(day, kickoff === null ? fallbackTime : timeKey(kickoff));
}

/** The kickoff at another time of day, keeping its day (or `fallbackDay` when there was none). */
export function withTime(kickoff: number | null, time: string, fallbackDay: number): number {
  return atLocal(kickoff ?? fallbackDay, time);
}

/** For `<input type="datetime-local">`: "2026-10-25T13:00" in local time. */
export function toLocalInput(ts: number): string {
  return `${dayKey(ts)}T${timeKey(ts)}`;
}

/** From `<input type="datetime-local">`; null when empty or unreadable. */
export function fromLocalInput(value: string): number | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(value);
  if (!m) return null;
  const [, y, mo, d, h, mi] = m.map(Number);
  const ts = new Date(y, mo - 1, d, h, mi).getTime();
  return Number.isFinite(ts) ? ts : null;
}

/** How a kickoff reads in the picker: "Sun, Oct 25", "1:00 PM", "PDT" and "in 6 days" / "in 3h" / "Started". */
export function kickoffReadout(ts: number, now: number): { day: string; time: string; zone: string; relative: string } {
  const d = new Date(ts);
  const days = Math.round((startOfDay(ts) - startOfDay(now)) / DAY_MS);
  const weekday = d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
  const day = days === 0 ? `Today, ${d.toLocaleDateString("en-US", { month: "short", day: "numeric" })}` : days === 1 ? `Tomorrow, ${d.toLocaleDateString("en-US", { month: "short", day: "numeric" })}` : weekday;
  return { day, time: timeLabel(timeKey(ts)), zone: zoneLabel(ts), relative: relativeKickoff(ts, now) };
}

/** "in 45m", "in 3h", "in 2 days", "Started" (a past time the server still takes). */
export function relativeKickoff(ts: number, now: number): string {
  const ms = ts - now;
  if (ms <= 0) return "Started";
  const min = Math.round(ms / 60_000);
  if (min < 60) return `in ${Math.max(1, min)}m`;
  const days = Math.round((startOfDay(ts) - startOfDay(now)) / DAY_MS);
  if (days === 0) return `in ${Math.round(ms / 3_600_000)}h`;
  if (days === 1) return "Tomorrow";
  return `in ${days} days`;
}

/** One line for summaries: "Sun 1:00 PM PDT" ("Oct 26 · 1:00 PM PST" further out), or "No set time". */
export function kickoffLine(ts: number | null, now: number): string {
  return ts === null ? "No set time" : `${kickoffLabel(ts, now)} ${zoneLabel(ts)}`.trim();
}

/** Why a custom kickoff can't be used (the server's rule, in the picker's words), or null. */
export function kickoffError(ts: number | null, now: number): string | null {
  if (ts === null) return null;
  return kickoffProblem(ts, now);
}
