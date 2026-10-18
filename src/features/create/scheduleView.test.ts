import { describe, expect, it } from "vitest";
import type { ScheduleEvent } from "../../../shared/types";
import { dayHeading, groupByDay, matchesQuery, siteLabel, weekRange, weekTag, zoneLabel } from "./scheduleView";

// Vitest runs with TZ=UTC unless the environment sets it; these tests build
// local times so they hold in any zone.
const local = (y: number, m: number, d: number, h = 12, min = 0) => new Date(y, m - 1, d, h, min).getTime();
const NOW = local(2026, 10, 17, 21);

describe("dayHeading", () => {
  it("says Today and Tomorrow, then the weekday and date", () => {
    expect(dayHeading(local(2026, 10, 17, 23), NOW)).toBe("Today");
    expect(dayHeading(local(2026, 10, 18, 6, 30), NOW)).toBe("Tomorrow");
    expect(dayHeading(local(2026, 10, 22, 17, 15), NOW)).toBe("Thursday, Oct 22");
  });
});

describe("weekRange", () => {
  it("spans the week's days, across a month end too", () => {
    expect(weekRange({ startsAt: local(2026, 10, 21, 0), endsAt: local(2026, 10, 28, 0) })).toBe("Oct 21 – 27");
    expect(weekRange({ startsAt: local(2026, 10, 28, 0), endsAt: local(2026, 11, 4, 0) })).toBe("Oct 28 – Nov 3");
    expect(weekRange({ startsAt: local(2027, 2, 7, 0), endsAt: local(2027, 2, 8, 0) })).toBe("Feb 7");
  });
});

describe("weekTag", () => {
  it("knows a week under way from one still ahead", () => {
    expect(weekTag({ startsAt: NOW - 1 }, NOW)).toBe("This week");
    expect(weekTag({ startsAt: NOW + 1 }, NOW)).toBe("Up next");
  });
});

describe("zoneLabel", () => {
  it("names the device's time zone", () => {
    expect(zoneLabel(NOW)).toMatch(/\S/);
  });
});

describe("siteLabel", () => {
  it("names games abroad and neutral sites, not ordinary home games", () => {
    expect(siteLabel({ venue: { name: "Wembley Stadium", city: "London", country: "England" }, neutralSite: true })).toBe("London · Wembley Stadium");
    expect(siteLabel({ venue: { name: "Mercedes-Benz Stadium", city: "Atlanta", country: "USA" }, neutralSite: true })).toBe("Neutral site · Atlanta");
    expect(siteLabel({ venue: { name: "Soldier Field", city: "Chicago", country: "USA" } })).toBeNull();
    expect(siteLabel({})).toBeNull();
  });
});

describe("groupByDay", () => {
  it("groups games under local day headings in kickoff order", () => {
    const groups = groupByDay([{ startsAt: local(2026, 10, 18, 13) }, { startsAt: local(2026, 10, 17, 22) }, { startsAt: local(2026, 10, 18, 6, 30) }], NOW);
    expect(groups.map((g) => [g.day, g.events.length])).toEqual([
      ["Today", 1],
      ["Tomorrow", 2],
    ]);
    expect(groups[1].events[0].startsAt).toBe(local(2026, 10, 18, 6, 30));
  });
});

describe("matchesQuery", () => {
  const e = { shortName: "HOU VS JAX", home: { name: "Jacksonville Jaguars", abbr: "JAX" }, away: { name: "Houston Texans", abbr: "HOU" } } as ScheduleEvent;
  it("matches every word against names and abbreviations", () => {
    expect(matchesQuery(e, "jag")).toBe(true);
    expect(matchesQuery(e, "hou jax")).toBe(true);
    expect(matchesQuery(e, "jets")).toBe(false);
  });
});
