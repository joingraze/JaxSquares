import { describe, expect, it } from "vitest";
import { KICKOFF_ERRORS, KICKOFF_FUTURE_MS, KICKOFF_PAST_MS, gameKickoff, kickoffProblem } from "./kickoff";

const NOW = Date.UTC(2026, 9, 18, 16, 0);

describe("kickoffProblem", () => {
  it("takes no set time, and a time from about a day ago to a year ahead", () => {
    expect(kickoffProblem(null, NOW)).toBeNull();
    expect(kickoffProblem(NOW, NOW)).toBeNull();
    expect(kickoffProblem(NOW - KICKOFF_PAST_MS, NOW)).toBeNull();
    expect(kickoffProblem(NOW + KICKOFF_FUTURE_MS, NOW)).toBeNull();
  });

  it("says why otherwise", () => {
    expect(kickoffProblem(NOW - KICKOFF_PAST_MS - 1, NOW)).toBe(KICKOFF_ERRORS.past);
    expect(kickoffProblem(NOW + KICKOFF_FUTURE_MS + 1, NOW)).toBe(KICKOFF_ERRORS.future);
    for (const bad of [undefined, "2026-10-25", Number.NaN, Infinity, {}]) expect(kickoffProblem(bad, NOW)).toBe(KICKOFF_ERRORS.invalid);
  });
});

describe("gameKickoff", () => {
  it("is the linked event's time, else the host's, else none", () => {
    const linkedEvent = { provider: "espn", league: "nfl", eventId: "1", startsAt: NOW + 1, xIsHome: false } as const;
    expect(gameKickoff({ linkedEvent, startsAt: NOW + 2 })).toBe(NOW + 1);
    expect(gameKickoff({ linkedEvent: null, startsAt: NOW + 2 })).toBe(NOW + 2);
    expect(gameKickoff({ linkedEvent: null, startsAt: null })).toBeNull();
    expect(gameKickoff({ linkedEvent: null })).toBeNull();
  });
});
