import { describe, expect, it } from "vitest";
import { defaultFormat, PRIZE_MONEY_ERROR } from "../../../shared/formats";
import type { ScheduleEvent } from "../../../shared/types";
import {
  boardHeadline,
  boardNameFor,
  buildCreateInput,
  customShortName,
  describeBoard,
  firstPrizeProblem,
  formatLine,
  inputSignature,
  matchNflTeam,
  orientEvent,
  prizeSlots,
  resolveCustomTeam,
  shortTeamName,
  kickoffParts,
  upcomingEvents,
  winnersTag,
  type CreateDraft,
} from "./model";

const event = (over: Partial<ScheduleEvent> = {}): ScheduleEvent => ({
  eventId: "401",
  league: "nfl",
  name: "Buffalo Bills at Kansas City Chiefs",
  shortName: "BUF @ KC",
  startsAt: Date.UTC(2026, 9, 18, 20, 25),
  home: { name: "Kansas City Chiefs", abbr: "KC", color: "#e31837" },
  away: { name: "Buffalo Bills", abbr: "BUF", color: "#00338d" },
  state: "pre",
  ...over,
});

const host = { name: "Jordan", color: "#ff6b35", emoji: "🏈" };

describe("shortTeamName", () => {
  it("uses the NFL nickname", () => {
    expect(shortTeamName({ name: "Kansas City Chiefs", abbr: "KC" }, "nfl")).toBe("Chiefs");
    expect(shortTeamName({ name: "Los Angeles Rams" }, "nfl")).toBe("Rams");
    expect(shortTeamName({ name: "Unknown Team" }, "nfl")).toBe("Unknown Team");
  });

  it("drops the college mascot, including two-word ones", () => {
    expect(shortTeamName({ name: "Georgia Bulldogs" }, "ncaaf")).toBe("Georgia");
    expect(shortTeamName({ name: "Ohio State Buckeyes" }, "ncaaf")).toBe("Ohio State");
    expect(shortTeamName({ name: "Alabama Crimson Tide" }, "ncaaf")).toBe("Alabama");
    expect(shortTeamName({ name: "Penn State Nittany Lions" }, "ncaaf")).toBe("Penn State");
    expect(shortTeamName({ name: "North Texas Mean Green" }, "ncaaf")).toBe("North Texas");
    expect(shortTeamName({ name: "Bowling Green Falcons" }, "ncaaf")).toBe("Bowling Green");
    expect(shortTeamName({ name: "Army" }, "ncaaf")).toBe("Army");
  });

  it("doesn't confuse college abbreviations with NFL ones", () => {
    expect(shortTeamName({ name: "Miami Hurricanes", abbr: "MIA" }, "ncaaf")).toBe("Miami");
  });
});

describe("custom teams", () => {
  it("matches NFL teams exactly by nickname, abbreviation, full name or a unique city", () => {
    expect(matchNflTeam("chiefs")?.abbr).toBe("KC");
    expect(matchNflTeam("GB")?.nickname).toBe("Packers");
    expect(matchNflTeam("green bay packers")?.abbr).toBe("GB");
    expect(matchNflTeam("Green Bay")?.abbr).toBe("GB");
    expect(matchNflTeam("New York")).toBeNull();
    expect(matchNflTeam("Chica")).toBeNull();
  });

  it("upgrades matches to the full team and keeps anything else as typed", () => {
    expect(resolveCustomTeam("  Packers ")?.team).toEqual({ name: "Green Bay Packers", abbr: "GB" });
    expect(resolveCustomTeam("Team  Maya")?.team).toEqual({ name: "Team Maya" });
    expect(resolveCustomTeam("   ")).toBeNull();
    expect(resolveCustomTeam("x".repeat(80))?.team.name).toHaveLength(40);
  });

  it("names the board with the nickname", () => {
    expect(customShortName("green bay packers")).toBe("Packers");
    expect(customShortName("Team Maya")).toBe("Team Maya");
  });
});

describe("boardNameFor", () => {
  it("builds the default name", () => {
    expect(boardNameFor("Bills", "Chiefs")).toBe("Bills vs Chiefs Squares");
    expect(boardNameFor("Bills", " ")).toBe("");
  });

  it("stays within 60 characters", () => {
    const long = boardNameFor("A".repeat(30), "B".repeat(26));
    expect(long.length).toBeLessThanOrEqual(60);
    expect(long).toBe(`${"A".repeat(30)} vs ${"B".repeat(26)}`);
    expect(boardNameFor("A".repeat(40), "B".repeat(40)).length).toBeLessThanOrEqual(60);
  });
});

describe("linked games", () => {
  it("puts the away team across the top", () => {
    const o = orientEvent(event());
    expect(o.teamX.abbr).toBe("BUF");
    expect(o.teamY.abbr).toBe("KC");
    expect(o.linkedEvent).toEqual({ provider: "espn", league: "nfl", eventId: "401", startsAt: event().startsAt, xIsHome: false });
  });

  it("lists only upcoming games, soonest first", () => {
    const now = Date.UTC(2026, 9, 16);
    const list = upcomingEvents(
      [
        event({ eventId: "late", startsAt: now + 3 * 86_400_000 }),
        event({ eventId: "live", state: "in", startsAt: now - 3_600_000 }),
        event({ eventId: "soon", startsAt: now + 3_600_000 }),
      ],
      now,
    );
    expect(list.map((e) => e.eventId)).toEqual(["soon", "late"]);
  });
});

describe("kickoffParts", () => {
  it("splits the day from the time", () => {
    const now = new Date(2026, 9, 16, 10, 0).getTime(); // a Friday
    expect(kickoffParts(new Date(2026, 9, 16, 20, 15).getTime(), now)).toEqual({ day: "Today", time: "8:15 PM" });
    expect(kickoffParts(new Date(2026, 9, 17, 13, 0).getTime(), now)).toEqual({ day: "Tomorrow", time: "1:00 PM" });
    expect(kickoffParts(new Date(2026, 9, 18, 16, 25).getTime(), now)).toEqual({ day: "Sun", time: "4:25 PM" });
    expect(kickoffParts(new Date(2026, 9, 26, 13, 0).getTime(), now)).toEqual({ day: "Oct 26", time: "1:00 PM" });
  });
});

describe("format copy", () => {
  it("counts winners, doubled by reverse", () => {
    expect(winnersTag("quarters", false)).toBe("4 winners");
    expect(winnersTag("quarters", true)).toBe("8 winners");
    expect(winnersTag("final", false)).toBe("1 winner");
    expect(winnersTag("every-score", false)).toBe("Winners all game");
    expect(winnersTag("every-score", true)).toBe("2 winners a score");
  });

  it("explains the board in plain words", () => {
    const quarters = describeBoard(defaultFormat());
    expect(boardHeadline(defaultFormat())).toBe("4 winners · 100 squares");
    expect(quarters).toContain("after Q1, at halftime, after Q3");
    const quick = { periods: "final", boardSize: 25, reverse: true, freshNumbers: false } as const;
    expect(boardHeadline(quick)).toBe("2 winners · 25 squares");
    expect(describeBoard(quick)).toContain("overtime counts");
    expect(describeBoard(quick)).toContain("Flip the digits");
    expect(describeBoard(quick)).toContain("Two numbers per row");
    expect(boardHeadline({ ...defaultFormat(), periods: "every-score" })).toBe("Every score wins · 100 squares");
    expect(describeBoard({ ...defaultFormat(), freshNumbers: true })).toContain("New numbers every quarter");
    // Fresh numbers only apply to quarters.
    expect(describeBoard({ ...defaultFormat(), periods: "halves", freshNumbers: true })).not.toContain("New numbers");
  });

  it("never uses money words", () => {
    for (const periods of ["quarters", "halves", "final", "every-score"] as const) {
      const text = describeBoard({ periods, boardSize: 100, reverse: true, freshNumbers: true }) + boardHeadline({ periods, boardSize: 25, reverse: true, freshNumbers: false }) + formatLine({ periods, boardSize: 25, reverse: true, freshNumbers: true });
      expect(text).not.toMatch(/\$|money|bet|wager|pot\b|payout|buy-in/i);
    }
  });

  it("gives every-score boards a single prize slot", () => {
    expect(prizeSlots(defaultFormat()).map((p) => p.key)).toEqual(["q1", "q2", "q3", "final"]);
    expect(prizeSlots({ ...defaultFormat(), periods: "every-score" }).map((p) => p.key)).toEqual(["*"]);
  });

  it("flags a prize note that mentions money", () => {
    const f = defaultFormat();
    expect(firstPrizeProblem(f, { q1: "Loser buys wings" })).toBeNull();
    expect(firstPrizeProblem(f, { q1: "Loser buys wings", q3: "$20 to the winner" })).toEqual({ key: "q3", message: PRIZE_MONEY_ERROR });
    // Notes for periods this format doesn't have are ignored.
    expect(firstPrizeProblem({ ...f, periods: "final" }, { q1: "$5" })).toBeNull();
  });
});

describe("buildCreateInput", () => {
  const base: CreateDraft = {
    matchup: { kind: "custom", x: "Packers", y: "Bears" },
    format: defaultFormat(),
    name: "",
    maxPerPlayer: 0,
    prizes: {},
    host,
  };

  it("waits for both teams", () => {
    expect(buildCreateInput({ ...base, matchup: null })).toBeNull();
    expect(buildCreateInput({ ...base, matchup: { kind: "custom", x: "Packers", y: " " } })).toBeNull();
  });

  it("builds a custom board with an auto name", () => {
    const input = buildCreateInput(base)!;
    expect(input.name).toBe("Packers vs Bears Squares");
    expect(input.league).toBe("custom");
    expect(input.teamX).toEqual({ name: "Green Bay Packers", abbr: "GB" });
    expect(input.teamY).toEqual({ name: "Chicago Bears", abbr: "CHI" });
    expect(input.linkedEvent).toBeNull();
    expect(input.host).toEqual(host);
  });

  it("builds a linked board", () => {
    const input = buildCreateInput({ ...base, matchup: { kind: "linked", event: event() } })!;
    expect(input.name).toBe("Bills vs Chiefs Squares");
    expect(input.league).toBe("nfl");
    expect(input.teamX.color).toBe("#00338d");
    expect(input.linkedEvent?.xIsHome).toBe(false);
  });

  it("keeps a typed name, trims prizes to this format and clamps the square limit", () => {
    const input = buildCreateInput({
      ...base,
      name: "  The Big One ",
      format: { periods: "halves", boardSize: 25, reverse: false, freshNumbers: true },
      prizes: { q1: "Not used", q2: "  Loser   does dishes ", final: "" },
      maxPerPlayer: 40,
    })!;
    expect(input.name).toBe("The Big One");
    expect(input.prizes).toEqual({ q2: "Loser does dishes" });
    expect(input.format.freshNumbers).toBe(false);
    expect(input.maxPerPlayer).toBe(25);
  });

  it("gives the same signature for the same board", () => {
    const a = buildCreateInput({ ...base, prizes: { q1: "Wings", final: "Bragging rights" } })!;
    const b = buildCreateInput({ ...base, prizes: { final: "Bragging rights", q1: "Wings" } })!;
    expect(inputSignature(a)).toBe(inputSignature(b));
    expect(inputSignature(a)).not.toBe(inputSignature({ ...a, maxPerPlayer: 3 }));
  });
});
