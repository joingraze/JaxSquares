// A custom board's kickoff helpers. Times are built in the test machine's own
// zone (like the app, which works in the phone's), so they hold anywhere.

import { describe, expect, it } from "vitest";
import { zoneLabel } from "../../lib/format";
import {
  atLocal,
  dayKey,
  defaultKickoff,
  fromLocalInput,
  KICKOFF_TIMES,
  kickoffDays,
  kickoffError,
  kickoffLine,
  relativeKickoff,
  timeKey,
  timeLabel,
  toLocalInput,
  withDay,
  withTime,
} from "./kickoff";

const local = (y: number, m: number, d: number, h = 0, min = 0) => new Date(y, m - 1, d, h, min).getTime();
// Oct 2026: Wed 14, Sat 17, Sun 18, Sun 25.
const WED = local(2026, 10, 14, 9, 30);

describe("defaultKickoff", () => {
  it("is the next Sunday at 1:00 PM", () => {
    expect(defaultKickoff(WED)).toBe(local(2026, 10, 18, 13));
    expect(defaultKickoff(local(2026, 10, 17, 22))).toBe(local(2026, 10, 18, 13));
  });

  it("is today on a Sunday morning, next week once 1:00 PM is under half an hour away", () => {
    expect(defaultKickoff(local(2026, 10, 18, 9))).toBe(local(2026, 10, 18, 13));
    expect(defaultKickoff(local(2026, 10, 18, 12, 45))).toBe(local(2026, 10, 25, 13));
    expect(defaultKickoff(local(2026, 10, 18, 15))).toBe(local(2026, 10, 25, 13));
  });
});

describe("chips", () => {
  it("are Today, Tomorrow, then the week's days by name", () => {
    const days = kickoffDays(WED);
    expect(days.map((d) => d.label)).toEqual(["Today", "Tomorrow", "Fri", "Sat", "Sun", "Mon", "Tue"]);
    expect(days.map((d) => d.key)).toEqual(["2026-10-14", "2026-10-15", "2026-10-16", "2026-10-17", "2026-10-18", "2026-10-19", "2026-10-20"]);
    expect(days[4].date).toBe("Oct 18");
    expect(days[4].start).toBe(local(2026, 10, 18));
  });

  it("offer common times", () => {
    expect(KICKOFF_TIMES.map(timeLabel)).toEqual(["12:00 PM", "1:00 PM", "4:25 PM", "7:00 PM", "8:20 PM"]);
  });

  it("move the day and keep the time, or the time and keep the day", () => {
    const sun = local(2026, 10, 18, 16, 25);
    expect(withDay(sun, local(2026, 10, 19))).toBe(local(2026, 10, 19, 16, 25));
    expect(withDay(null, local(2026, 10, 19))).toBe(local(2026, 10, 19, 13));
    expect(withTime(sun, "20:20", WED)).toBe(local(2026, 10, 18, 20, 20));
    expect(withTime(null, "12:00", WED)).toBe(local(2026, 10, 14, 12));
    expect(atLocal(local(2026, 11, 8, 23, 59), "13:00")).toBe(local(2026, 11, 8, 13));
  });
});

describe("the full input", () => {
  it("reads and writes datetime-local values in local time", () => {
    const at = local(2026, 11, 1, 15, 30);
    expect(toLocalInput(at)).toBe("2026-11-01T15:30");
    expect(fromLocalInput("2026-11-01T15:30")).toBe(at);
    expect(fromLocalInput("")).toBeNull();
    expect(fromLocalInput("soon")).toBeNull();
    expect(dayKey(at)).toBe("2026-11-01");
    expect(timeKey(at)).toBe("15:30");
  });
});

describe("how it reads", () => {
  it("says when, with the zone, or no set time", () => {
    const sun = local(2026, 10, 18, 13);
    expect(kickoffLine(null, WED)).toBe("No set time");
    expect(kickoffLine(sun, WED)).toBe(`Sun 1:00 PM ${zoneLabel(sun)}`.trim());
    expect(relativeKickoff(sun, WED)).toBe("in 4 days");
    expect(relativeKickoff(local(2026, 10, 14, 10), WED)).toBe("in 30m");
    expect(relativeKickoff(local(2026, 10, 14, 15), WED)).toBe("in 6h");
    expect(relativeKickoff(local(2026, 10, 15, 13), WED)).toBe("Tomorrow");
    expect(relativeKickoff(WED - 60_000, WED)).toBe("Started");
  });

  it("names the zone at the kickoff itself (PDT in October, PST after the clocks change)", () => {
    expect(zoneLabel(Date.UTC(2026, 9, 25, 20), "America/Los_Angeles")).toBe("PDT");
    expect(zoneLabel(Date.UTC(2026, 11, 6, 21), "America/Los_Angeles")).toBe("PST");
  });

  it("flags a kickoff the server won't take", () => {
    expect(kickoffError(null, WED)).toBeNull();
    expect(kickoffError(WED + 86_400_000, WED)).toBeNull();
    expect(kickoffError(WED + 400 * 86_400_000, WED)).toMatch(/within the next year/);
  });
});
