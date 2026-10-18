import { describe, expect, it } from "vitest";
import { defaultFormat, PRIZE_AMOUNT_ERROR, withRules } from "../../../shared/formats";
import type { GameFormat, MomentRule, ScheduleEvent } from "../../../shared/types";
import {
  boardHeadline,
  boardNameFor,
  buildCreateInput,
  createFormat,
  detailsSummary,
  rulesTitle,
  customShortName,
  CUSTOM_X_COLOR,
  CUSTOM_Y_COLOR,
  describeBoard,
  boardHeadlineParts,
  firstBlocker,
  firstPrizeProblem,
  formatLine,
  inputSignature,
  matchNflTeam,
  orientEvent,
  resolveCustomTeam,
  kickoffParts,
  matchupTeams,
  POPULAR_TEAMS,
  startsIn,
  teamColorsFrom,
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

/** A quarters board with these notes on the squares. */
function noted(notes: Record<string, string>, base: GameFormat = withRules(defaultFormat())): GameFormat {
  return { ...base, rules: base.rules!.map((r) => (r.square && notes[r.moment] !== undefined ? { ...r, square: { ...r.square, note: notes[r.moment] } } : r)) };
}

/** The owner's example: every score -> the square, $50; each quarter-end -> the reverse square, $200. */
const OWNER_RULES: MomentRule[] = [
  { moment: "score", square: { amount: 50, note: "" }, reverse: null },
  { moment: "q1", square: null, reverse: { amount: 200, note: "" } },
  { moment: "q2", square: null, reverse: { amount: 200, note: "" } },
  { moment: "q3", square: null, reverse: { amount: 200, note: "" } },
  { moment: "final", square: null, reverse: { amount: 200, note: "" } },
];

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

describe("startsIn", () => {
  const now = Date.UTC(2026, 9, 18, 14, 0);
  it("counts down only when kickoff is close, in round words", () => {
    expect(startsIn(now + 3 * 3_600_000, now)).toBe("in 3h");
    expect(startsIn(now + 2.5 * 3_600_000, now)).toBe("in 2h 30m");
    expect(startsIn(now + 45 * 60_000, now)).toBe("in 45m");
    expect(startsIn(now + 7 * 3_600_000, now)).toBeNull();
    expect(startsIn(now - 60_000, now)).toBeNull();
  });
});

describe("team colors", () => {
  it("takes NFL colors from the live schedule and gives typed teams the same color", () => {
    const colors = teamColorsFrom([event(), event({ league: "ncaaf", home: { name: "Georgia Bulldogs", abbr: "UGA", color: "#ba0c2f" } })]);
    expect(colors).toEqual({ KC: "#e31837", BUF: "#00338d" });
    expect(resolveCustomTeam("chiefs", colors)?.team).toEqual({ name: "Kansas City Chiefs", abbr: "KC", color: "#e31837" });
    // No live color: no color (the board's side color applies), and never for a non-NFL name.
    expect(resolveCustomTeam("Packers", colors)?.team.color).toBeUndefined();
    expect(resolveCustomTeam("Team Maya", colors)?.team.color).toBeUndefined();
    const teams = matchupTeams({ kind: "custom", x: "Bills", y: "Chiefs" }, colors)!;
    expect([teams.teamX.color, teams.teamY.color]).toEqual(["#00338d", "#e31837"]);
  });

  it("offers a handful of popular teams to tap", () => {
    expect(POPULAR_TEAMS.length).toBeGreaterThanOrEqual(4);
    expect(new Set(POPULAR_TEAMS.map((t) => t.abbr)).size).toBe(POPULAR_TEAMS.length);
  });
});

describe("firstBlocker", () => {
  const f = defaultFormat();
  const linked = { kind: "linked", event: event() } as const;
  it("asks for what's missing in page order", () => {
    expect(firstBlocker({ matchup: null, hostName: null, format: f })?.field).toBe("game");
    expect(firstBlocker({ matchup: { kind: "custom", x: " ", y: "" }, hostName: "", format: f })).toEqual({
      field: "team-x",
      label: "Add both teams to continue",
    });
    expect(firstBlocker({ matchup: { kind: "custom", x: "Packers", y: "" }, hostName: "", format: f })?.field).toBe("team-y");
    expect(firstBlocker({ matchup: linked, hostName: " ", format: f })).toEqual({ field: "host", label: "Add your name to continue" });
    // A note that mentions money points at its own input, inside the rules editor.
    expect(firstBlocker({ matchup: linked, hostName: "Jordan", format: noted({ q3: "$20" }) })).toMatchObject({ field: "prize", key: "rule-note-q3-square" });
  });

  it("is clear once everything is in (a device with a name skips the name)", () => {
    expect(firstBlocker({ matchup: linked, hostName: null, format: noted({ q1: "Loser buys wings" }) })).toBeNull();
  });
});

describe("format copy", () => {
  it("keeps card tags stable (modifiers show up in the summary instead)", () => {
    expect(winnersTag("quarters")).toBe("4 winners");
    expect(winnersTag("halves")).toBe("2 winners");
    expect(winnersTag("final")).toBe("1 winner");
    expect(winnersTag("every-score")).toBe("1 winner per score");
  });

  it("doubles the summary's winners with reverse, in phrases that never split", () => {
    expect(boardHeadlineParts({ ...defaultFormat(), reverse: true })).toEqual({ winners: "8 winners", size: "100 squares" });
    expect(boardHeadlineParts({ ...defaultFormat(), periods: "every-score" }).winners).toBe("A winner every score");
    expect(boardHeadlineParts({ ...defaultFormat(), periods: "every-score", reverse: true }).winners).toBe("2 winners every score");
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
    expect(boardHeadline({ ...defaultFormat(), periods: "every-score" })).toBe("A winner every score · 100 squares");
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

  it("describes custom rules: every score plus the quarters, reverse only on the quarters", () => {
    const owner = withRules({ ...defaultFormat(), rules: OWNER_RULES });
    expect(boardHeadline(owner)).toBe("Every score + 4 winners · 100 squares");
    expect(describeBoard(owner)).toBe(
      "The square matching the last digit of each team's score wins every time the score changes. Flip the digits and that square wins after Q1, at halftime, after Q3 and at the final.",
    );
    expect(formatLine(owner)).toBe("Every score + quarters · Reverse on quarters · 10×10");
    expect(rulesTitle(owner)).toBe("Custom rules");
    expect(rulesTitle(withRules(defaultFormat()))).toBe("Every quarter");
    expect(describeBoard(owner)).not.toMatch(/\$|money|bet|wager|pot\b|payout|buy-in/i);
  });

  it("words the per-player cap as a cap", () => {
    expect(detailsSummary(0)).toBe("No max per player");
    expect(detailsSummary(5)).toBe("Up to 5 squares each");
    expect(detailsSummary(1)).toBe("Up to 1 square each");
  });

  it("flags a prize note that mentions money", () => {
    expect(firstPrizeProblem(noted({ q1: "Loser buys wings" }))).toBeNull();
    expect(firstPrizeProblem(noted({ q1: "Loser buys wings", q3: "$20 to the winner" }))).toEqual({ key: "rule-note-q3-square", message: PRIZE_AMOUNT_ERROR });
  });
});

describe("buildCreateInput", () => {
  const base: CreateDraft = {
    matchup: { kind: "custom", x: "Packers", y: "Bears" },
    format: withRules(defaultFormat()),
    name: "",
    maxPerPlayer: 0,
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
    // No live colors known: the board's side colors are stored, so every screen agrees.
    expect(input.teamX).toEqual({ name: "Green Bay Packers", abbr: "GB", color: CUSTOM_X_COLOR });
    expect(input.teamY).toEqual({ name: "Chicago Bears", abbr: "CHI", color: CUSTOM_Y_COLOR });
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

  it("keeps a typed name, sends notes inside the rules (prizes {}) and clamps the square limit", () => {
    const halves = withRules({ periods: "halves", boardSize: 25, reverse: false, freshNumbers: false });
    const input = buildCreateInput({
      ...base,
      name: "  The Big One ",
      format: noted({ q2: "  Loser   does dishes ", final: "" }, halves),
      maxPerPlayer: 40,
    })!;
    expect(input.name).toBe("The Big One");
    expect(input.prizes).toEqual({});
    expect(input.format.rules?.map((r) => [r.moment, r.square?.note])).toEqual([
      ["q2", "Loser does dishes"],
      ["final", ""],
    ]);
    expect(input.maxPerPlayer).toBe(25);
    // Fresh numbers can't go with a winner on every score.
    expect(buildCreateInput({ ...base, format: { ...withRules({ ...defaultFormat(), periods: "every-score" }), freshNumbers: true } })!.format.freshNumbers).toBe(false);
  });

  it("sends amounts only once the host picks dollars or points", () => {
    const owner = { ...withRules({ ...defaultFormat(), rules: OWNER_RULES }), squarePrice: 10 };
    const notChosen = buildCreateInput({ ...base, format: owner })!.format;
    expect(notChosen.squarePrice).toBeNull();
    expect(notChosen.rules?.every((r) => !r.square?.amount && !r.reverse?.amount)).toBe(true);
    const dollars = buildCreateInput({ ...base, format: owner, prizeChoice: "$" })!.format;
    expect(dollars).toMatchObject({ unit: "$", squarePrice: 10, justForFun: false, periods: "custom" });
    expect(dollars.rules?.map((r) => r.square?.amount ?? r.reverse?.amount)).toEqual([50, 200, 200, 200, 200]);
    expect(buildCreateInput({ ...base, format: owner, prizeChoice: "pts" })!.format.unit).toBe("pts");
    const fun = buildCreateInput({ ...base, format: owner, prizeChoice: "fun" })!.format;
    expect(fun).toMatchObject({ justForFun: true, squarePrice: null });
    expect(createFormat(owner, "fun").rules?.every((r) => !r.square?.amount && !r.reverse?.amount)).toBe(true);
  });

  it("gives the same signature for the same board", () => {
    const a = buildCreateInput({ ...base, format: noted({ q1: "Wings", final: "Bragging rights" }) })!;
    const b = buildCreateInput({ ...base, format: noted({ final: "Bragging rights", q1: "Wings" }) })!;
    expect(inputSignature(a)).toBe(inputSignature(b));
    expect(inputSignature(a)).not.toBe(inputSignature({ ...a, maxPerPlayer: 3 }));
  });
});
