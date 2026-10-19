// The create flow as data: step order and URLs, what holds each step back,
// the history state, and the draft that survives a reload.

import { describe, expect, it } from "vitest";
import { defaultFormat, rulesForPreset, withRules } from "../../../shared/formats";
import { KICKOFF_FUTURE_MS } from "../../../shared/kickoff";
import type { GameFormat, ScheduleEvent } from "../../../shared/types";
import type { Matchup } from "./model";
import {
  DRAFT_KEY,
  DRAFT_TTL_MS,
  SIBLING_STEPS,
  STEP_INFO,
  STEPS,
  clearDraft,
  loadDraft,
  nextStep,
  parseFrom,
  parseStep,
  prevStep,
  reachableStep,
  readNav,
  saveDraft,
  stepBlocker,
  stepNumber,
  stepSearch,
  type WizardCheck,
  type WizardDraft,
} from "./wizard";

const NOW = Date.UTC(2026, 9, 18, 16, 0);

const event = (over: Partial<ScheduleEvent> = {}): ScheduleEvent => ({
  eventId: "401",
  league: "nfl",
  name: "Buffalo Bills at Kansas City Chiefs",
  shortName: "BUF @ KC",
  startsAt: NOW + 4 * 3_600_000,
  home: { name: "Kansas City Chiefs", abbr: "KC" },
  away: { name: "Buffalo Bills", abbr: "BUF" },
  state: "pre",
  ...over,
});

const noted = (note: string): GameFormat =>
  withRules({ ...defaultFormat(), rules: rulesForPreset("quarters", false).map((r) => (r.moment === "q3" ? { ...r, square: { amount: null, note } } : r)) });

function check(over: Partial<WizardCheck> = {}): WizardCheck {
  return { matchup: { kind: "linked", event: event() }, kickoff: null, hostName: null, format: withRules(defaultFormat()), name: "", now: NOW, ...over };
}

const custom = (x: string, y: string): Matchup => ({ kind: "custom", x, y });

describe("steps", () => {
  it("go game, how squares win, prizes, final touches, review", () => {
    expect(STEPS).toEqual(["game", "format", "prizes", "details", "review"]);
    expect(STEPS.map((s) => stepNumber(s))).toEqual([1, 2, 3, 4, 5]);
    expect(STEPS.map((s) => STEP_INFO[s].label)).toEqual(["The game", "How squares win", "Square price & prizes", "Final touches", "Review"]);
    expect(nextStep("game")).toBe("format");
    expect(nextStep("details")).toBe("review");
    expect(nextStep("review")).toBeNull();
    expect(prevStep("format")).toBe("game");
    expect(prevStep("game")).toBeNull();
  });

  it("is a URL: /new?step=<step>, the first step for anything else", () => {
    for (const s of STEPS) expect(parseStep(stepSearch(s))).toBe(s);
    expect(stepSearch("prizes")).toBe("?step=prizes");
    expect(parseStep("")).toBe("game");
    expect(parseStep("?step=checkout")).toBe("game");
    expect(parseStep("?invite=1&step=details")).toBe("details");
  });

  it("another board for a game: straight to the price, the board it comes from kept in the URL", () => {
    expect(SIBLING_STEPS).toEqual(["prizes", "details", "review"]);
    expect(SIBLING_STEPS.map((s) => stepNumber(s, SIBLING_STEPS))).toEqual([1, 2, 3]);
    expect(nextStep("prizes", SIBLING_STEPS)).toBe("details");
    expect(prevStep("prizes", SIBLING_STEPS)).toBeNull();
    expect(stepSearch("details", "k7m2px")).toBe("?from=k7m2px&step=details");
    expect(parseFrom("?from=k7m2px&step=details")).toBe("k7m2px");
    expect(parseFrom("?from=K7M2PX")).toBe("k7m2px");
    expect(parseFrom("?from=../x")).toBeNull();
    expect(parseFrom("?step=details")).toBeNull();
    // No game step there: anything else lands on the price.
    expect(parseStep("?from=k7m2px", SIBLING_STEPS)).toBe("prizes");
    expect(parseStep("?from=k7m2px&step=game", SIBLING_STEPS)).toBe("prizes");
    expect(parseStep("?from=k7m2px&step=review", SIBLING_STEPS)).toBe("review");
    // A board's game is never incomplete, and a later blocker still holds Review back.
    const board: Matchup = {
      kind: "board",
      from: { id: "k7m2px", name: "Office", teamX: { name: "Chiefs" }, teamY: { name: "Bills" }, league: "custom", linkedEvent: null, startsAt: null },
    };
    expect(reachableStep("review", check({ matchup: board }), SIBLING_STEPS)).toBe("review");
    expect(reachableStep("review", check({ matchup: board, hostName: "" }), SIBLING_STEPS)).toBe("details");
  });

  it("reads the history state each step carries, ignoring junk", () => {
    expect(readNav({ wizardDepth: 3, fromReview: true, appBack: true })).toEqual({ wizardDepth: 3, fromReview: true, appBack: true });
    expect(readNav(null)).toEqual({ wizardDepth: 0, fromReview: false, appBack: false });
    expect(readNav({ wizardDepth: -2, fromReview: "yes" })).toEqual({ wizardDepth: 0, fromReview: false, appBack: false });
    expect(readNav({ wizardDepth: 1.5 }).wizardDepth).toBe(0);
  });
});

describe("what holds a step back", () => {
  it("the game: both teams, and a kickoff in range", () => {
    expect(stepBlocker("game", check({ matchup: null }))?.field).toBe("game");
    expect(stepBlocker("game", check({ matchup: custom("", "") }))).toEqual({ field: "team-x", label: "Add both teams to continue" });
    expect(stepBlocker("game", check({ matchup: custom("Chiefs", " ") }))?.field).toBe("team-y");
    expect(stepBlocker("game", check({ matchup: custom("Chiefs", "Eagles"), kickoff: NOW + KICKOFF_FUTURE_MS + 1 }))?.field).toBe("kickoff");
    expect(stepBlocker("game", check({ matchup: custom("Chiefs", "Eagles"), kickoff: null }))).toBeNull();
    expect(stepBlocker("game", check({ matchup: custom("Chiefs", "Eagles"), kickoff: NOW + 3_600_000 }))).toBeNull();
  });

  it("how squares win: nothing (every choice there is valid)", () => {
    expect(stepBlocker("format", check({ matchup: null }))).toBeNull();
  });

  it("prizes: never the price (skipping is fine), only a note that talks money", () => {
    expect(stepBlocker("prizes", check())).toBeNull();
    expect(stepBlocker("prizes", check({ format: noted("Winner gets $20") }))).toMatchObject({ field: "prize", key: "rule-note-q3-square" });
  });

  it("final touches: the host's name when asked, and a board name without money", () => {
    expect(stepBlocker("details", check({ hostName: " " }))?.field).toBe("host");
    expect(stepBlocker("details", check({ hostName: "Jordan" }))).toBeNull();
    expect(stepBlocker("details", check({ name: "$20 Squares Pool" }))?.field).toBe("name");
  });

  it("review: the first thing anywhere", () => {
    expect(stepBlocker("review", check({ matchup: custom("", ""), hostName: "" }))?.field).toBe("team-x");
    expect(stepBlocker("review", check())).toBeNull();
  });

  it("a URL can't skip past an incomplete step", () => {
    expect(reachableStep("review", check({ matchup: custom("Chiefs", "") }))).toBe("game");
    expect(reachableStep("details", check({ format: noted("Venmo me") }))).toBe("prizes");
    expect(reachableStep("review", check({ hostName: "" }))).toBe("details");
    // An earlier step, or the blocked one itself, is fine.
    expect(reachableStep("game", check({ matchup: custom("", "") }))).toBe("game");
    expect(reachableStep("prizes", check({ hostName: "" }))).toBe("prizes");
    expect(reachableStep("review", check())).toBe("review");
  });
});

describe("the draft", () => {
  function memory(): Pick<Storage, "getItem" | "setItem" | "removeItem"> & { data: Map<string, string> } {
    const data = new Map<string, string>();
    return { data, getItem: (k) => data.get(k) ?? null, setItem: (k, v) => void data.set(k, v), removeItem: (k) => void data.delete(k) };
  }
  const draft = (over: Partial<WizardDraft> = {}): WizardDraft => ({
    tab: "nfl",
    tabTouched: true,
    picked: { nfl: event() },
    custom: { x: "Chiefs", y: "" },
    kickoff: NOW + 86_400_000,
    format: withRules({ ...defaultFormat(), boardSize: 25, squarePrice: 10, rules: rulesForPreset("halves", true) }),
    prizeChoice: "$",
    prizesAuto: false,
    name: "Sunday Squares",
    nameTouched: true,
    maxPerPlayer: 4,
    hostName: "Jordan",
    ...over,
  });

  it("comes back as it was saved", () => {
    const store = memory();
    saveDraft(draft(), NOW, store);
    expect(loadDraft(NOW + 60_000, store)).toEqual(draft());
  });

  it("keeps following the suggested amounts in a draft saved before it could say", () => {
    const store = memory();
    const { prizesAuto: _drop, ...older } = draft();
    void _drop;
    saveDraft(older as WizardDraft, NOW, store);
    expect(loadDraft(NOW, store)?.prizesAuto).toBe(true);
  });

  it("is gone once cleared (the board was made), or when it's from another session's day", () => {
    const store = memory();
    saveDraft(draft(), NOW, store);
    expect(loadDraft(NOW + DRAFT_TTL_MS + 1, store)).toBeNull();
    clearDraft(store);
    expect(store.data.has(DRAFT_KEY)).toBe(false);
    expect(loadDraft(NOW, store)).toBeNull();
  });

  it("drops a game that has started since (the league shows its soonest again) and a long-gone kickoff", () => {
    const store = memory();
    saveDraft(draft({ picked: { nfl: event({ startsAt: NOW - 3_600_000 }) }, kickoff: NOW - 2 * 86_400_000 }), NOW - 60_000, store);
    const back = loadDraft(NOW, store)!;
    expect(back.picked).toEqual({});
    expect(back.kickoff).toBeNull();
  });

  it("remembers which board a draft adds a board to", () => {
    const store = memory();
    saveDraft(draft({ from: "k7m2px" }), NOW, store);
    expect(loadDraft(NOW, store)?.from).toBe("k7m2px");
    saveDraft(draft({ from: "<script>" }), NOW, store);
    expect(loadDraft(NOW, store)?.from).toBeUndefined();
  });

  it("keeps no set time as no set time", () => {
    const store = memory();
    saveDraft(draft({ kickoff: null }), NOW, store);
    expect(loadDraft(NOW, store)?.kickoff).toBeNull();
  });

  it("ignores anything unreadable", () => {
    const store = memory();
    store.setItem(DRAFT_KEY, "{not json");
    expect(loadDraft(NOW, store)).toBeNull();
    store.setItem(DRAFT_KEY, JSON.stringify({ v: 99, savedAt: NOW, draft: draft() }));
    expect(loadDraft(NOW, store)).toBeNull();
    store.setItem(DRAFT_KEY, JSON.stringify({ v: 1, savedAt: NOW, draft: { ...draft(), format: { boardSize: 7 }, tab: "nhl", prizeChoice: "€", maxPerPlayer: -3 } }));
    const fixed = loadDraft(NOW, store)!;
    expect(fixed.tab).toBe("nfl");
    expect(fixed.format.boardSize).toBe(100);
    expect(fixed.prizeChoice).toBeNull();
    expect(fixed.maxPerPlayer).toBe(0);
    expect(loadDraft(NOW, null)).toBeNull();
  });
});
