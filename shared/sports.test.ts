import { describe, expect, it } from "vitest";
import { MOMENT_INFO, momentInfo, periodPhrase, periodsFor, PRESET_INFO, presetInfo, rulesForPreset, suggestPrizes, withRules } from "./formats";
import {
  BY_KIND_SPORT_ERROR,
  EVERY_SCORE_SPORT_ERROR,
  HALVES_MOMENT_ERROR,
  SOCCER_FRESH_ERROR,
  SOCCER_MOMENT_ERROR,
  formatProblemFor,
  isSoccer,
  LEAGUE_INFO,
  SPORT_ERROR,
  SPORT_LEAGUES,
  boardSportFor,
  defaultPresetFor,
  fitRules,
  freshNumbersInfo,
  isBasketball,
  isDayLeague,
  isFootball,
  isLeague,
  isLinkedLeague,
  leagueSport,
  leagueSportProblem,
  liveMomentIndex,
  momentsFor,
  periodName,
  periodsBefore,
  playsHalves,
  presetsFor,
  regulationPeriods,
  rulesProblemFor,
  sportOf,
  wordsFor,
} from "./sports";
import { sportWords } from "./sportWords";
import type { MomentRule } from "./types";

const NBA = { sport: "basketball" as const, league: "nba" as const };
const NCAAM = { sport: "basketball" as const, league: "ncaab" as const };
const NCAAW = { sport: "basketball" as const, league: "ncaaw" as const };
const CUSTOM_HOOPS = { sport: "basketball" as const, league: "custom" as const };
const NFL = { sport: "football" as const, league: "nfl" as const };

describe("leagues", () => {
  it("knows each league's sport, chip and schedule", () => {
    expect(SPORT_LEAGUES.football).toEqual(["nfl", "ncaaf"]);
    expect(SPORT_LEAGUES.basketball).toEqual(["nba", "wnba", "ncaab", "ncaaw"]);
    expect(SPORT_LEAGUES.basketball.map((l) => LEAGUE_INFO[l].label)).toEqual(["NBA", "WNBA", "Men's college", "Women's college"]);
    expect(leagueSport("ncaaw")).toBe("basketball");
    expect(leagueSport("ncaaf")).toBe("football");
    expect(leagueSport("custom")).toBeNull();
    expect(isDayLeague("nba")).toBe(true);
    expect(isDayLeague("nfl")).toBe(false);
    expect(isDayLeague("custom")).toBe(false);
    expect([isLinkedLeague("wnba"), isLinkedLeague("custom"), isLinkedLeague("nhl"), isLeague("custom"), isLeague("mlb")]).toEqual([true, false, false, true, false]);
  });

  it("reads a board's sport, football when absent", () => {
    expect(sportOf({})).toBe("football");
    expect(sportOf({ league: "nba" })).toBe("basketball");
    expect(sportOf(CUSTOM_HOOPS)).toBe("basketball");
    expect([isFootball(null), isFootball(NBA), isBasketball(NBA), isBasketball({ sport: "football" })]).toEqual([true, false, true, false]);
  });

  it("checks a new board's league and sport", () => {
    expect(leagueSportProblem("basketball", "nba")).toBeNull();
    expect(leagueSportProblem(undefined, "nba")).toBeNull();
    expect(leagueSportProblem("football", "ncaab")).toBe("That league plays basketball, not football.");
    expect(leagueSportProblem("basketball", "nfl")).toBe("That league plays football, not basketball.");
    expect(leagueSportProblem("basketball", "custom")).toBeNull();
    expect(leagueSportProblem("hockey", "custom")).toBe(SPORT_ERROR);
    expect(boardSportFor(undefined, "wnba")).toBe("basketball");
    expect(boardSportFor("basketball", "custom")).toBe("basketball");
    expect(boardSportFor(undefined, "custom")).toBe("football");
  });
});

describe("moments and presets per league", () => {
  it("football keeps every moment and preset", () => {
    expect(momentsFor(NFL)).toEqual(["score", "q1", "q2", "q3", "final"]);
    expect(momentsFor({})).toEqual(["score", "q1", "q2", "q3", "final"]);
    expect(presetsFor(NFL)).toEqual(["quarters", "halves", "final", "every-score"]);
    expect(defaultPresetFor(NFL)).toBe("quarters");
  });

  it("basketball in quarters: Q1, halftime, Q3 and the final; no every score", () => {
    for (const kind of [NBA, NCAAW, { sport: "basketball" as const, league: "wnba" as const }, CUSTOM_HOOPS]) {
      expect(momentsFor(kind)).toEqual(["q1", "q2", "q3", "final"]);
      expect(presetsFor(kind)).toEqual(["quarters", "halves", "final"]);
      expect(defaultPresetFor(kind)).toBe("quarters");
    }
  });

  it("men's college basketball plays halves: halftime and the final only", () => {
    expect(playsHalves(NCAAM)).toBe(true);
    expect(playsHalves(NBA)).toBe(false);
    expect(regulationPeriods(NCAAM)).toBe(2);
    expect(momentsFor(NCAAM)).toEqual(["q2", "final"]);
    expect(presetsFor(NCAAM)).toEqual(["halves", "final"]);
    expect(defaultPresetFor(NCAAM)).toBe("halves");
  });

  it("labels read right per league: End of Q1, Halftime, Final", () => {
    const labels = (kind: Parameters<typeof momentsFor>[0]) => momentsFor(kind).map((m) => MOMENT_INFO[m].label);
    expect(labels(NBA)).toEqual(["End of Q1", "Halftime", "End of Q3", "Final score"]);
    expect(labels(NCAAM)).toEqual(["Halftime", "Final score"]);
    expect(periodsFor("halves").map((p) => p.label)).toEqual(["Half", "Final"]);
    expect(presetsFor(NCAAM).map((p) => PRESET_INFO[p].label)).toEqual(["Halftime + Final", "Final score"]);
    expect(presetsFor(NBA).map((p) => PRESET_INFO[p].label)).toEqual(["Every quarter", "Halftime + Final", "Final score"]);
  });

  it("says why rules don't fit the game", () => {
    expect(rulesProblemFor(rulesForPreset("every-score", false), NBA)).toBe(EVERY_SCORE_SPORT_ERROR);
    expect(rulesProblemFor(rulesForPreset("every-score", true), CUSTOM_HOOPS)).toBe(EVERY_SCORE_SPORT_ERROR);
    expect(rulesProblemFor(rulesForPreset("quarters", false), NCAAM)).toBe(HALVES_MOMENT_ERROR);
    expect(rulesProblemFor(rulesForPreset("halves", true), NCAAM)).toBeNull();
    expect(rulesProblemFor(rulesForPreset("quarters", false), NBA)).toBeNull();
    expect(rulesProblemFor(rulesForPreset("every-score", false), NFL)).toBeNull();
    expect(EVERY_SCORE_SPORT_ERROR).not.toMatch(/\b(bet|wager|pot|payout|buy-in|jackpot|odds|stakes|gamble)\b/i);
  });

  it("fits rules to a new game, keeping what still applies", () => {
    const quarters = rulesForPreset("quarters", true);
    expect(fitRules(quarters, NBA)).toBe(quarters);
    expect(fitRules(quarters, NCAAM).map((r) => r.moment)).toEqual(["q2", "final"]);
    expect(fitRules(quarters, NCAAM).every((r) => r.reverse)).toBe(true);
    // Every score can't go to basketball: the game's own first card instead.
    const everyScore: MomentRule[] = [...rulesForPreset("every-score", false), { moment: "final", square: { amount: null, note: "Loser buys wings" }, reverse: null }];
    expect(fitRules(everyScore, NBA).map((r) => r.moment)).toEqual(["q1", "q2", "q3", "final"]);
    expect(fitRules(everyScore, NCAAM).map((r) => r.moment)).toEqual(["q2", "final"]);
    // Only Q1 and Q3: nothing left in halves, so halftime + final.
    const odd = rulesForPreset("quarters", false).filter((r) => r.moment === "q1" || r.moment === "q3");
    expect(fitRules(odd, NCAAM).map((r) => r.moment)).toEqual(["q2", "final"]);
  });

  it("names fresh numbers per game", () => {
    expect(freshNumbersInfo(NBA).label).toBe("New numbers each quarter");
    expect(freshNumbersInfo(NCAAM)).toMatchObject({ label: "New numbers each half", each: "half" });
  });

  it("suggests prizes for basketball's fixed moments like football's", () => {
    expect(suggestPrizes(rulesForPreset("quarters", false), 10, 100).map((r) => r.square?.amount)).toEqual([200, 200, 200, 400]);
    expect(suggestPrizes(fitRules(rulesForPreset("quarters", false), NCAAM), 10, 100).map((r) => r.square?.amount)).toEqual([400, 600]);
  });
});

describe("soccer", () => {
  const MLS = { sport: "soccer" as const, league: "mls" as const };
  const CUSTOM_SOCCER = { sport: "soccer" as const, league: "custom" as const };

  it("has its leagues, picked by day", () => {
    expect(SPORT_LEAGUES.soccer).toEqual(["mls", "nwsl", "epl", "laliga", "ligamx", "ucl"]);
    expect(SPORT_LEAGUES.soccer.map((l) => LEAGUE_INFO[l].label)).toEqual(["MLS", "NWSL", "Premier League", "LaLiga", "Liga MX", "Champions League"]);
    expect(leagueSport("epl")).toBe("soccer");
    expect(isDayLeague("ucl")).toBe(true);
    expect(isSoccer(MLS)).toBe(true);
    expect(isSoccer(CUSTOM_SOCCER)).toBe(true);
    expect(isSoccer(NFL)).toBe(false);
    expect(boardSportFor("soccer", "custom")).toBe("soccer");
    expect(leagueSportProblem("football", "mls")).toBe("That league plays soccer, not football.");
    expect(leagueSportProblem("soccer", "custom")).toBeNull();
  });

  it("wins on goals: the first, every one and the last", () => {
    expect(momentsFor(MLS)).toEqual(["first", "score", "final"]);
    expect(presetsFor(MLS)).toEqual(["every-score", "first-last", "final"]);
    expect(defaultPresetFor(CUSTOM_SOCCER)).toBe("every-score");
    expect(presetsFor(MLS).map((p) => presetInfo(p, "soccer").label)).toEqual(["Every goal", "First & last goal", "Last goal"]);
    expect(momentsFor(MLS).map((m) => momentInfo(m, "soccer").label)).toEqual(["First goal", "Every goal", "Last goal"]);
    expect(periodsFor("first-last", "soccer").map((p) => p.label)).toEqual(["1st goal", "Last goal"]);
    // Football never offers the first goal.
    expect(presetsFor(NFL)).not.toContain("first-last");
    expect(rulesProblemFor(rulesForPreset("first-last", false), NFL)).toBe("That moment isn't part of this game.");
  });

  it("refuses quarters, amounts by score type and fresh numbers", () => {
    expect(rulesProblemFor(rulesForPreset("quarters", false), MLS)).toBe(SOCCER_MOMENT_ERROR);
    expect(rulesProblemFor(rulesForPreset("every-score", true), MLS)).toBeNull();
    const byKind: MomentRule[] = [{ moment: "score", square: { amount: 5, note: "", byKind: { touchdown: 10 } }, reverse: null }];
    expect(rulesProblemFor(byKind, MLS)).toBe(BY_KIND_SPORT_ERROR);
    expect(rulesProblemFor(byKind, NFL)).toBeNull();
    const fresh = withRules({ periods: "final", reverse: false, boardSize: 100, freshNumbers: true, rules: rulesForPreset("final", false) });
    expect(fresh.freshNumbers).toBe(true);
    expect(formatProblemFor(fresh, MLS)).toBe(SOCCER_FRESH_ERROR);
    expect(formatProblemFor(fresh, NFL)).toBeNull();
    // A first goal never takes fresh numbers, whatever the sport says.
    expect(withRules({ periods: "first-last", reverse: false, boardSize: 100, freshNumbers: true, rules: rulesForPreset("first-last", false) }).freshNumbers).toBe(false);
  });

  it("starts a board turning to or from soccer on its game's default", () => {
    expect(fitRules(rulesForPreset("quarters", false), MLS).map((r) => r.moment)).toEqual(["score", "final"]);
    expect(fitRules(rulesForPreset("first-last", true), NFL).map((r) => r.moment)).toEqual(["q1", "q2", "q3", "final"]);
    expect(fitRules(rulesForPreset("first-last", true), NFL).every((r) => r.reverse)).toBe(true);
    const goals = rulesForPreset("every-score", false);
    expect(fitRules(goals, MLS)).toBe(goals);
    // Football's amounts by score type don't come along.
    const byKind: MomentRule[] = [{ moment: "score", square: { amount: 5, note: "Wings", byKind: { touchdown: 10 } }, reverse: null }];
    expect(fitRules(byKind, MLS)).toEqual([{ moment: "score", square: { amount: 5, note: "Wings" }, reverse: null }]);
  });

  it("names soccer's periods", () => {
    expect(regulationPeriods(MLS)).toBe(2);
    expect([1, 2, 3, 5].map((p) => periodName(p, MLS))).toEqual(["H1", "H2", "ET", "Pens"]);
    expect(wordsFor(MLS).emoji).toBe("⚽");
  });
});

describe("live periods", () => {
  it("maps completed periods onto moments: quarters, or halves", () => {
    expect(["q1", "q2", "q3", "final"].map((m) => periodsBefore(m, NBA))).toEqual([1, 2, 3, null]);
    expect(["q1", "q2", "q3", "final"].map((m) => periodsBefore(m, {}))).toEqual([1, 2, 3, null]);
    expect(["q1", "q2", "q3", "final"].map((m) => periodsBefore(m, NCAAM))).toEqual([null, 1, null, null]);
  });

  it("maps the live period to the moment it plays for", () => {
    expect([1, 2, 3, 4, 5, 6].map((p) => liveMomentIndex(p, NBA))).toEqual([0, 1, 2, 3, 3, 3]);
    expect([0, 1, 2, 3, 4].map((p) => liveMomentIndex(p, NCAAM))).toEqual([1, 1, 3, 3, 3]);
  });

  it("names a live period when the feed sends no text", () => {
    expect([1, 3, 5].map((p) => periodName(p, NBA))).toEqual(["Q1", "Q3", "OT"]);
    expect([1, 2, 3].map((p) => periodName(p, NCAAM))).toEqual(["H1", "H2", "OT"]);
  });
});

describe("words", () => {
  it("speaks each sport's language", () => {
    expect(wordsFor(NBA)).toMatchObject({ start: "Tip-off", startLower: "tip-off", starts: "Tips off", end: "the final buzzer", noun: "basketball", emoji: "🏀" });
    expect(wordsFor(NFL)).toMatchObject({ start: "Kickoff", starts: "Kicks off", end: "the final whistle", noun: "football" });
    expect(sportWords(undefined).start).toBe("Kickoff");
  });

  it("words the final per sport", () => {
    expect(periodPhrase("final").moment).toBe("at the final whistle");
    expect(periodPhrase("final", undefined, "basketball").moment).toBe("at the final buzzer");
    expect(periodPhrase("q2", undefined, "basketball")).toEqual({ short: "Half", moment: "at halftime" });
  });
});
