import { describe, expect, it } from "vitest";
import { defaultFormat, ruleFor, rulesForPreset, suggestPrizes, withRules } from "../../../shared/formats";
import { VENUE_LOCKED_ERROR } from "../../../shared/pricing";
import type { Game, GameFormat, MomentRule } from "../../../shared/types";
import {
  PRICE_CHIPS,
  boardTotal,
  boardTotalLabel,
  budgetText,
  byKindOn,
  isEveryScoreWithReverseQuarters,
  prizeBudget,
  reverseQuartersAmount,
  reverseQuartersOn,
  setByKind,
  setKindAmount,
  setReverseQuarters,
  setReverseQuartersAmount,
  splitSharesBoth,
  autoFill,
  evenSplit,
  everyScoreBudgetText,
  finalRestOn,
  isEveryScoreSetup,
  presetChoice,
  restEstimate,
  setFinalRest,
  setTouchdownAmount,
  setupKey,
  suggestedPrizes,
  withSuggested,
  type PrizeChoice,
  canCopyToFixed,
  capLine,
  choiceOf,
  copyToFixed,
  draftOf,
  editorRows,
  firstNoteProblem,
  formatOf,
  lockViolation,
  maxValueText,
  noteProblems,
  parseAmount,
  parsePrice,
  presetOf,
  prizeLineup,
  prizesSummary,
  ruleLines,
  rulesLock,
  rulesPatch,
  setVenue,
  SCORING_LOCKED,
  FRESH_LOCKED,
  selectPreset,
  setMoment,
  setPrize,
  setReverseEverywhere,
  setSides,
  sidesOf,
  type RulesDraft,
} from "./rulesModel";

const p = (amount: number | null, note = "") => ({ amount, note });

/** The owner's example: every score -> the square, $50; each quarter-end -> the reverse square, $200. */
const OWNER: MomentRule[] = [
  { moment: "score", square: p(50), reverse: null },
  { moment: "q1", square: null, reverse: p(200) },
  { moment: "q2", square: null, reverse: p(200) },
  { moment: "q3", square: null, reverse: p(200) },
  { moment: "final", square: null, reverse: p(200) },
];

const quarters = () => rulesForPreset("quarters", false);
const fmt = (over: Partial<GameFormat> = {}): GameFormat => withRules({ ...defaultFormat(), ...over });

describe("editing moments and squares", () => {
  it("lists every moment in game order, off ones as null", () => {
    expect(editorRows(rulesForPreset("halves", false)).map((r) => [r.moment, !!r.rule])).toEqual([
      ["score", false],
      ["q1", false],
      ["q2", true],
      ["q3", false],
      ["final", true],
    ]);
  });

  it("builds the owner's example from the default board in a few taps", () => {
    let rules = setMoment(quarters(), "score", true);
    rules = setPrize(rules, "score", "square", { amount: 50 });
    rules = setSides(rules, "q1", "reverse");
    rules = setPrize(rules, "q1", "reverse", { amount: 200 });
    expect(canCopyToFixed(rules, "q1")).toBe(true);
    rules = copyToFixed(rules, "q1");
    expect(rules).toEqual(OWNER);
    expect(canCopyToFixed(rules, "q1")).toBe(false);
    expect(presetOf(rules)).toBeNull();
  });

  it("keeps typed amounts when a preset is picked", () => {
    const typed = setPrize(quarters(), "final", "square", { amount: 400, note: "Wings" });
    const halves = selectPreset(typed, "halves", true);
    expect(halves).toEqual([
      { moment: "q2", square: p(null), reverse: p(null) },
      { moment: "final", square: p(400, "Wings"), reverse: p(null) },
    ]);
    expect(presetOf(halves)).toBe("halves");
    // Reverse stays as it is unless asked.
    expect(selectPreset(halves, "quarters").every((r) => r.reverse)).toBe(true);
  });

  it("turns a quarter on like its closest neighbour (amounts, not notes); the last moment can't go", () => {
    const owner = OWNER.filter((r) => r.moment !== "q3").map((r) => (r.moment === "q2" ? { ...r, reverse: p(200, "Pushups") } : r));
    expect(setMoment(owner, "q3", true).find((r) => r.moment === "q3")).toEqual({ moment: "q3", square: null, reverse: p(200) });
    expect(setMoment(setMoment(quarters(), "q1", false), "score", true).find((r) => r.moment === "score")).toEqual({ moment: "score", square: p(null), reverse: null });
    const one = rulesForPreset("final", false);
    expect(setMoment(one, "final", false)).toEqual(one);
  });

  it("switches square / reverse / both, carrying what was typed across", () => {
    const rules = setPrize(quarters(), "q2", "square", { amount: 100, note: "Wings" });
    const rev = setSides(rules, "q2", "reverse");
    expect(rev.find((r) => r.moment === "q2")).toEqual({ moment: "q2", square: null, reverse: p(100, "Wings") });
    const both = setSides(rev, "q2", "both");
    expect(both.find((r) => r.moment === "q2")).toEqual({ moment: "q2", square: p(null), reverse: p(100, "Wings") });
    expect(sidesOf(both.find((r) => r.moment === "q2")!)).toBe("both");
    expect(setReverseEverywhere(OWNER, false).every((r) => r.square && !r.reverse)).toBe(true);
    expect(setReverseEverywhere(OWNER, false)[1].square?.amount).toBe(200);
  });

  it("only copies amounts to squares that already win once scoring has started", () => {
    const mixed = setSides(setPrize(quarters(), "q1", "square", { amount: 100 }), "q3", "reverse");
    const copied = copyToFixed(mixed, "q1", true);
    expect(copied.map((r) => [r.moment, sidesOf(r), r.square?.amount ?? r.reverse?.amount])).toEqual([
      ["q1", "square", 100],
      ["q2", "square", 100],
      ["q3", "reverse", null],
      ["final", "square", 100],
    ]);
  });
});

describe("amount fields", () => {
  it("reads dollars, cents and commas; empty or 0 is no amount", () => {
    expect(parseAmount("50")).toEqual({ value: 50, error: null });
    expect(parseAmount("$1,250.505")).toEqual({ value: 1250.51, error: null });
    expect(parseAmount("2.5")).toEqual({ value: 2.5, error: null });
    expect(parseAmount("")).toEqual({ value: null, error: null });
    expect(parseAmount("0")).toEqual({ value: null, error: null });
    expect(parseAmount("abc").error).toBe("Numbers only");
    expect(parseAmount("1000001").error).toBe("Up to 1,000,000");
    expect(parsePrice("100001").error).toBe("Up to 100,000");
    expect(parseAmount("25 pts").value).toBe(25);
  });
});

describe("notes", () => {
  it("flags notes that mention money, keyed by moment and square", () => {
    const rules = setPrize(setPrize(OWNER, "q2", "reverse", { note: "Winner gets $20" }), "final", "reverse", { note: "Venmo me" });
    expect(Object.keys(noteProblems(rules))).toEqual(["q2:reverse", "final:reverse"]);
    expect(firstNoteProblem(rules)).toMatchObject({ moment: "q2", side: "reverse", message: expect.stringMatching(/amount box/) });
    expect(firstNoteProblem(OWNER)).toBeNull();
  });
});

describe("the host's rules edit", () => {
  const game = (over: Partial<Game> = {}): Pick<Game, "format" | "prizes" | "numbers"> => ({
    format: fmt({ rules: OWNER, unit: "$", squarePrice: 10 }),
    prizes: {},
    numbers: null,
    ...over,
  });

  it("starts from the board, an older board's notes folded into its rules", () => {
    const legacy = { periods: "halves", reverse: false, boardSize: 100, freshNumbers: false } as const;
    const d = draftOf(legacy, { final: "Wings" });
    expect(d.rules.find((r) => r.moment === "final")?.square?.note).toBe("Wings");
    expect(d.choice).toBeNull();
    expect(draftOf(game().format).choice).toBe("$");
    expect(choiceOf(fmt({ justForFun: true }))).toBe("fun");
  });

  it("sends nothing when nothing changed, the whole format when something did", () => {
    const g = game();
    expect(rulesPatch(g, draftOf(g.format))).toBeNull();
    const d = draftOf(g.format);
    const patch = rulesPatch(g, { ...d, rules: setPrize(d.rules, "q1", "reverse", { amount: 250 }) });
    expect(patch?.format?.rules?.[1].reverse?.amount).toBe(250);
    expect(patch?.format).toMatchObject({ periods: "custom", unit: "$", squarePrice: 10, justForFun: false });
    // An older board saved as-is still moves its notes into rules.
    const legacy = { format: { periods: "final", reverse: false, boardSize: 100, freshNumbers: false } as GameFormat, prizes: { final: "Wings" } };
    expect(rulesPatch(legacy, draftOf(legacy.format, legacy.prizes))).toBeNull();
  });

  it("clears amounts when the board is just for fun (or nothing's chosen), and keeps notes", () => {
    const d: RulesDraft = { ...draftOf(game().format), choice: "fun" };
    const f = formatOf(game().format, { ...d, rules: setPrize(d.rules, "final", "reverse", { note: "Wings" }) });
    expect(f).toMatchObject({ justForFun: true, squarePrice: null });
    expect(f.rules?.every((r) => !r.square?.amount && !r.reverse?.amount)).toBe(true);
    expect(f.rules?.at(-1)?.reverse?.note).toBe("Wings");
    expect(formatOf(game().format, { ...d, choice: null }).squarePrice).toBeNull();
    expect(formatOf(game().format, { ...d, choice: "pts" }).unit).toBe("pts");
  });

  it("locks who wins once a score or pick is in, fresh numbers once drawn, and venue mode once paid for", () => {
    const g = game();
    expect(rulesLock({ game: g as unknown as Game, scores: [], manualWinners: [] })).toEqual({ scoring: null, fresh: null, venue: null });
    const lock = rulesLock({ game: { ...g, numbers: { "*": { x: [], y: [] } } } as unknown as Game, scores: [{ periodKey: "s1", scoreX: 7, scoreY: 0, source: "host", updatedAt: 0 }], manualWinners: [] });
    expect(lock).toEqual({ scoring: SCORING_LOCKED, fresh: FRESH_LOCKED, venue: VENUE_LOCKED_ERROR });
    const d = draftOf(g.format);
    expect(lockViolation(g, { ...d, rules: setPrize(d.rules, "q1", "reverse", { amount: 1 }) }, lock)).toBeNull();
    expect(lockViolation(g, { ...d, rules: setSides(d.rules, "q1", "both") }, lock)).toBe(SCORING_LOCKED);
    expect(lockViolation(g, { ...d, freshNumbers: true }, lock)).toBe(FRESH_LOCKED);
    // Paid for (its Venue add-on charged or not) before the draw: venue mode stays as it was.
    const paid = rulesLock({ game: { ...g, paid: true } as unknown as Game, scores: [], manualWinners: [] });
    expect(paid).toEqual({ scoring: null, fresh: null, venue: VENUE_LOCKED_ERROR });
    expect(lockViolation(g, { ...d, venue: true }, paid)).toBe(VENUE_LOCKED_ERROR);
  });
});

describe("what players see", () => {
  it("lines up the square price and each moment's amounts", () => {
    expect(prizeLineup(fmt({ rules: OWNER, squarePrice: 10 }))?.parts).toEqual(["$10 a square", "$50 every score", "$200 reverse each quarter"]);
    const lineup = quarters().map((r, i) => ({ ...r, square: p([100, 200, 100, 400][i]) }));
    expect(prizesSummary(fmt({ rules: lineup, squarePrice: 10 }))).toBe("$10 a square · Q1 $100 · Half $200 · Q3 $100 · Final $400");
    const every = rulesForPreset("every-score", false).map((r) => ({ ...r, square: p(50) }));
    expect(prizeLineup(fmt({ rules: every }))?.parts).toEqual(["$50 every score"]);
    const both = [{ moment: "final" as const, square: p(100), reverse: p(50) }];
    expect(prizeLineup(fmt({ rules: both, unit: "pts" }))?.parts).toEqual(["Final 100 pts + 50 pts reverse"]);
  });

  it("shows a badge for just for fun, and nothing when the host set nothing", () => {
    expect(prizeLineup(fmt({ justForFun: true }))).toEqual({ fun: true, parts: [] });
    expect(prizesSummary(fmt({ justForFun: true }))).toBe("Just for fun");
    expect(prizeLineup(fmt())).toBeNull();
    expect(prizesSummary(fmt())).toBe("Square price: not set");
  });

  it("words the cap as a cap", () => {
    expect(capLine(0)).toBeNull();
    expect(capLine(5)).toBe("Up to 5 squares each");
    expect(maxValueText(0)).toBe("No max");
    expect(maxValueText(5)).toBe("Up to 5");
  });

  it("reads the rules out, moment by moment", () => {
    const lines = ruleLines(fmt({ rules: setPrize(OWNER, "final", "reverse", { note: "Loser buys wings" }) }));
    expect(lines.map((l) => [l.label, l.sides.map((s) => `${s.side} ${s.amount ?? "-"} ${s.note ?? "-"}`)])).toEqual([
      ["Every score change", ["square $50 -"]],
      ["End of Q1", ["reverse $200 -"]],
      ["Halftime", ["reverse $200 -"]],
      ["End of Q3", ["reverse $200 -"]],
      ["Final score", ["reverse $200 Loser buys wings"]],
    ]);
  });

  it("never uses gambling words", () => {
    const text = [prizesSummary(fmt({ rules: OWNER, squarePrice: 10 })), ...ruleLines(fmt({ rules: OWNER })).map((l) => `${l.label} ${l.when}`)].join(" ");
    expect(text).not.toMatch(/\b(bet|wager|pot|payout|buy-?in|jackpot|odds|stakes|gambl\w*)\b/i);
  });
});

describe("square price: quick picks and the board's total", () => {
  it("offers whole-dollar picks, and point values for a points board", () => {
    expect(PRICE_CHIPS.$).toEqual([1, 2, 5, 10, 20, 25, 50, 100]);
    expect(PRICE_CHIPS.pts.every((v) => Number.isInteger(v) && v > 0)).toBe(true);
    expect(PRICE_CHIPS.pts).toHaveLength(8);
  });

  it("adds up the whole board at the price (100 or 25 squares)", () => {
    expect(boardTotal(10, 100)).toBe(1000);
    expect(boardTotal(10, 25)).toBe(250);
    expect(boardTotal(2.5, 25)).toBe(62.5);
    expect(boardTotal(null, 100)).toBeNull();
    expect(boardTotalLabel(100)).toBe("All 100 squares");
    expect(boardTotalLabel(25)).toBe("All 25 squares");
  });

  it("compares the fixed prizes with the total", () => {
    const q = setPrize(setPrize(quarters(), "q1", "square", { amount: 200 }), "q2", "square", { amount: 200 });
    const under = prizeBudget(setPrize(q, "final", "square", { amount: 400 }), 1000);
    expect(under).toMatchObject({ total: 1000, fixed: 800, left: 200, status: "under", everyScore: false, rest: false, typical: null, tight: false });
    expect(budgetText(under, "$")).toEqual({ main: "$800 of $1,000", detail: "$200 left" });
    const over = prizeBudget(setPrize(q, "final", "square", { amount: 800 }), 1000);
    expect(budgetText(over, "$")).toEqual({ main: "$1,200 of $1,000", detail: "$200 over" });
    expect(over.status).toBe("over");
    const exact = prizeBudget(setPrize(setPrize(q, "q3", "square", { amount: 200 }), "final", "square", { amount: 400 }), 1000);
    expect([exact.status, budgetText(exact, "$").detail]).toEqual(["exact", "Adds up"]);
    expect(budgetText(prizeBudget(quarters(), 500), "pts")).toEqual({ main: "None yet", detail: null });
    // The final taking the rest: what's left goes to it.
    const rest = prizeBudget(setFinalRest(q, true, 1000), 1000);
    expect([rest.status, budgetText(rest, "$").detail]).toEqual(["rest", "The rest, $600, to the final"]);
    expect(budgetText(prizeBudget(setFinalRest(setPrize(q, "q3", "square", { amount: 600 }), true, 1000), 1000), "$").detail).toBe("Nothing left for the final");
  });

  it("every score: where its prizes come from, a typical game, and a warning when that leaves little for the final", () => {
    const rules = suggestPrizes(withKinds(), 10, 100);
    const b = prizeBudget(rules, 1000);
    expect(b).toMatchObject({ everyScore: true, rest: true, typical: 270, tight: false });
    expect(everyScoreBudgetText(b, "$")).toEqual({
      lead: "Score prizes come out of the $1,000 board total during the game; the final gets the rest.",
      estimate: "A typical game uses about $270, leaving about $730 for the final.",
      warning: null,
    });
    // $1 squares on 5×5: TD $2, FG $1, XP $0.50, 2-PT $1: about $27 of $25.
    const small = prizeBudget(suggestPrizes(withKinds(), 1, 25), 25);
    expect(small).toMatchObject({ typical: 27, tight: true });
    expect(everyScoreBudgetText(small, "$")?.warning).toBe("A typical game would use about $27 of the $25 board total, leaving little for the final.");
    // With the reverse at each quarter too ($4 each): about $43.
    const rev = prizeBudget(suggestPrizes(setReverseQuarters(withKinds(), true), 1, 25), 25);
    expect(everyScoreBudgetText(rev, "$")?.warning).toBe("A typical game would use about $43 of the $25 board total, leaving little for the final.");
    expect(everyScoreBudgetText(prizeBudget(quarters(), 1000), "$")).toBeNull();
    const text = JSON.stringify([everyScoreBudgetText(b, "$"), everyScoreBudgetText(small, "$")]);
    expect(text).not.toMatch(BETTING);
  });
});

describe("suggested amounts in the editor", () => {
  it("offers the suggestion with what each prize gets, and knows when the amounts are it", () => {
    const s = suggestedPrizes(quarters(), 10, 100, "$")!;
    expect(s.basis).toBe("From the $1,000 board total");
    expect(s.parts.map((p) => `${p.label} ${p.amount}`)).toEqual(["Q1 $200", "Half $200", "Q3 $200", "Final $400"]);
    expect(s.selected).toBe(false);
    expect(suggestedPrizes(s.rules, 10, 100, "$")?.selected).toBe(true);
    expect(suggestedPrizes(setPrize(s.rules, "q1", "square", { amount: 150 }), 10, 100, "$")?.selected).toBe(false);
    // Notes don't matter.
    expect(suggestedPrizes(setPrize(s.rules, "q1", "square", { note: "Wings" }), 10, 100, "$")?.selected).toBe(true);
    expect(suggestedPrizes(quarters(), null, 100, "$")).toBeNull();
  });

  it("reads quarters with reverse and every score as their parts", () => {
    const rev = suggestedPrizes(rulesForPreset("quarters", true), 10, 100, "$")!;
    expect(rev.parts.map((p) => `${p.label} ${p.amount}`)).toEqual(["Q1 $170 + $40", "Half $170 + $40", "Q3 $170 + $40", "Final $330 + $40"]);
    const every = suggestedPrizes(setReverseQuarters(withKinds(), true), 10, 100, "$")!;
    expect(every.parts.map((p) => `${p.label} ${p.amount}`)).toEqual(["TD $20", "FG $10", "XP $5", "2-PT $10", "Safety $10", "Reverse each quarter $40", "Final The rest"]);
    // Claimed squares after the draw: a smaller total.
    expect(suggestedPrizes(quarters(), 10, 62, "$")?.basis).toBe("From the $620 board total");
  });

  it("offers Even as the alternative on fixed-moment boards, when it differs", () => {
    const even = evenSplit(quarters(), 1000, "$", suggestPrizes(quarters(), 10, 100))!;
    expect([even.label, even.preview]).toEqual(["Even", "Q1 $250 · Half $250 · Q3 $250 · Final $250"]);
    expect(evenSplit(even.rules, 1000, "$", null)?.selected).toBe(true);
    // The final alone: the same as the suggestion, so no second choice.
    const final = rulesForPreset("final", false);
    expect(evenSplit(final, 1000, "$", suggestPrizes(final, 10, 100))).toBeNull();
    expect(evenSplit(withKinds(), 1000, "$", null)).toBeNull();
    expect(evenSplit(quarters(), null, "$", null)).toBeNull();
    expect(evenSplit(OWNER, 250, "pts", null)).toBeNull();
    expect(splitSharesBoth(rulesForPreset("quarters", true))).toBe(true);
    expect(splitSharesBoth(OWNER)).toBe(false);
  });

  it("switches the final between the rest and a fixed amount (about what the rest would be)", () => {
    const rules = suggestPrizes(withKinds(), 10, 100);
    expect(finalRestOn(rules)).toBe(true);
    const fixed = setFinalRest(rules, false, 1000);
    expect(ruleFor(fixed, "final")?.square).toEqual({ amount: 730, note: "" });
    expect(finalRestOn(fixed)).toBe(false);
    expect(ruleFor(setFinalRest(fixed, true, 1000), "final")?.square).toEqual({ amount: null, note: "", rest: true });
    // Fixed boards: the total less the other prizes.
    const q = suggestPrizes(quarters(), 10, 100);
    expect(ruleFor(setFinalRest(setFinalRest(q, true, 1000), false, 1000), "final")?.square?.amount).toBe(400);
    expect(restEstimate(withKinds(), 1000)).toBe(1000);
    // Nowhere to put it without the final's square.
    expect(setFinalRest(OWNER, true, 1000)).toEqual(OWNER);
  });

  it("keeps the rest out of \"Same for every quarter\" (only the final's reverse square counts)", () => {
    const rules = suggestPrizes(setReverseQuarters(withKinds(), true), 10, 100);
    // Every quarter-end and the final's reverse already match: nothing to offer.
    expect(["q1", "q2", "q3", "final"].map((m) => canCopyToFixed(rules, m as MomentRule["moment"]))).toEqual([false, false, false, false]);
    // The final's reverse amount cleared: Q1's copies to it, and the final keeps the rest.
    const cleared = setPrize(rules, "final", "reverse", { amount: null });
    expect(canCopyToFixed(cleared, "q1")).toBe(true);
    const copied = copyToFixed(setPrize(cleared, "q1", "reverse", { amount: 50 }), "q1");
    expect(ruleFor(copied, "final")).toMatchObject({ square: { rest: true }, reverse: { amount: 50 } });
    expect(fixedRules(copied).map((r) => r.reverse?.amount)).toEqual([50, 50, 50, 50]);
    // From the final: its reverse amount only, never who wins.
    const fromFinal = copyToFixed(setPrize(rules, "final", "reverse", { amount: 60 }), "final");
    expect(fixedRules(fromFinal).map((r) => [!!r.square, r.reverse?.amount])).toEqual([
      [false, 60],
      [false, 60],
      [false, 60],
      [true, 60],
    ]);
  });
});

describe("auto-filling the suggested amounts (create flow)", () => {
  const setup = (rules: MomentRule[], squarePrice: number | null = 10, choice: PrizeChoice = "$", boardSize: 100 | 25 = 100) => ({
    format: withRules({ ...defaultFormat(), rules, squarePrice, boardSize }),
    choice,
  });
  const fixed = (f: GameFormat) => sortRulesFixed(f.rules!);

  it("fills them in when the price, the game type, reverse or the every-score options change", () => {
    const start = setup(quarters(), null);
    const priced = autoFill(start, setup(quarters(), 10), true);
    expect([priced.auto, fixed(priced.format)]).toEqual([true, [200, 200, 200, 400]]);
    const halves = autoFill(setup(priced.format.rules!), setup(selectPreset(priced.format.rules!, "halves")), true);
    expect(fixed(halves.format)).toEqual([400, 600]);
    const reverse = autoFill(setup(priced.format.rules!), setup(setReverseEverywhere(priced.format.rules!, true)), true);
    expect(sortRulesFixed(reverse.format.rules!, "reverse")).toEqual([40, 40, 40, 40]);
    const every = autoFill(setup(priced.format.rules!), setup(selectPreset(priced.format.rules!, "every-score")), true);
    expect(every.format.rules?.map((r) => [r.moment, r.square?.rest ? "rest" : r.square?.amount])).toEqual([
      ["score", 10],
      ["final", "rest"],
    ]);
    const kinds = autoFill(setup(every.format.rules!), setup(setByKind(every.format.rules!, true)), true);
    expect(kinds.format.rules?.[0].square?.byKind).toEqual({ touchdown: 20, fieldGoal: 10, extraPoint: 5, twoPoint: 10, safety: 10 });
    // A new price, the board size, the unit.
    expect(fixed(autoFill(setup(priced.format.rules!), setup(priced.format.rules!, 20), true).format)).toEqual([400, 400, 400, 800]);
    expect(fixed(autoFill(setup(priced.format.rules!), setup(priced.format.rules!, 10, "$", 25), true).format)).toEqual([50, 50, 50, 100]);
    expect(fixed(autoFill(setup(priced.format.rules!), setup(priced.format.rules!, 10, "pts"), true).format)).toEqual([200, 200, 200, 400]);
  });

  it("stops once the host types an amount, and starts again on Use suggested amounts", () => {
    const priced = autoFill(setup(quarters(), null), setup(quarters(), 10), true).format;
    const typed = setPrize(priced.rules!, "q1", "square", { amount: 250 });
    const manual = autoFill(setup(priced.rules!), setup(typed), true);
    expect(manual.auto).toBe(false);
    // Nothing changes by itself now.
    const newPrice = autoFill(setup(typed), setup(typed, 20), false);
    expect([newPrice.auto, fixed(newPrice.format)]).toEqual([false, [250, 200, 200, 400]]);
    // "Use suggested amounts" (the amounts are the suggestion again): auto again.
    const back = autoFill(setup(typed, 20), setup(suggestPrizes(typed, 20, 100), 20), false);
    expect(back.auto).toBe(true);
    // Notes are not amounts.
    expect(autoFill(setup(priced.rules!), setup(setPrize(priced.rules!, "q1", "square", { note: "Wings" })), true).auto).toBe(true);
  });

  it("takes the suggested amounts away with the price, and leaves them alone without dollars or points", () => {
    const priced = autoFill(setup(quarters(), null), setup(quarters(), 10), true).format;
    const cleared = autoFill(setup(priced.rules!), setup(priced.rules!, null), true);
    expect([cleared.auto, fixed(cleared.format)]).toEqual([true, [null, null, null, null]]);
    const fun = autoFill(setup(priced.rules!), setup(priced.rules!, 10, "fun"), true);
    expect(fixed(fun.format)).toEqual([200, 200, 200, 400]);
    expect(setupKey(setup(quarters()))).not.toBe(setupKey(setup(quarters(), 20)));
    expect(withSuggested(setup(quarters(), 10, null)).rules).toEqual(setup(quarters(), 10, null).format.rules);
  });
});

describe("every score change: reverse at the quarters, amounts by score type", () => {
  const every = () => rulesForPreset("every-score", false);

  it("the Every score card comes with the final, which takes the rest", () => {
    expect(selectPreset(quarters(), "every-score").map((r) => r.moment)).toEqual(["score", "final"]);
    expect(presetChoice(selectPreset(quarters(), "every-score"))).toBe("every-score");
    expect(presetChoice(every())).toBe("every-score");
    expect(isEveryScoreSetup(setReverseQuarters(selectPreset(quarters(), "every-score"), true))).toBe(true);
    expect(presetChoice(setMoment(selectPreset(quarters(), "every-score"), "q2", true))).toBeNull();
  });

  it("turns on the reverse square at each quarter-end and the final, and back off", () => {
    const on = setReverseQuarters(every(), true);
    expect(on.map((r) => [r.moment, !!r.square, !!r.reverse])).toEqual([
      ["score", true, false],
      ["q1", false, true],
      ["q2", false, true],
      ["q3", false, true],
      ["final", false, true],
    ]);
    expect(reverseQuartersOn(on)).toBe(true);
    expect(isEveryScoreWithReverseQuarters(on)).toBe(true);
    expect(presetOf(on)).toBeNull();
    expect(setReverseQuarters(on, false)).toEqual(every());
    expect(reverseQuartersOn(every())).toBe(false);
    // With the final's square (the card's setup): it keeps it and gets the reverse too.
    const card = setReverseQuarters(selectPreset(quarters(), "every-score"), true);
    expect(card.map((r) => [r.moment, !!r.square, !!r.reverse])).toEqual([
      ["score", true, false],
      ["q1", false, true],
      ["q2", false, true],
      ["q3", false, true],
      ["final", true, true],
    ]);
    expect(isEveryScoreWithReverseQuarters(card)).toBe(true);
    expect(setReverseQuarters(card, false).map((r) => r.moment)).toEqual(["score", "final"]);
    // A quarter-end already paying the square keeps it (and gets the reverse too); off keeps the square.
    const mixed = setMoment(every(), "q2", true);
    const both = setReverseQuarters(mixed, true);
    expect(sidesOf(both.find((r) => r.moment === "q2")!)).toBe("both");
    expect(isEveryScoreWithReverseQuarters(both)).toBe(false);
    expect(setReverseQuarters(both, false).map((r) => r.moment)).toEqual(["score", "q2"]);
  });

  it("sets one reverse amount for every quarter-end, and says when they differ", () => {
    const on = setReverseQuarters(every(), true);
    expect(reverseQuartersAmount(on)).toBeNull();
    const each = setReverseQuartersAmount(on, 200);
    expect(reverseQuartersAmount(each)).toBe(200);
    expect(fixedRules(each).map((r) => r.reverse?.amount)).toEqual([200, 200, 200, 200]);
    expect(reverseQuartersAmount(setPrize(each, "final", "reverse", { amount: 400 }))).toBe("mixed");
    // Turned on again later, new quarter-ends take the amount the others have.
    const partial = setReverseQuarters(setReverseQuarters(each, false), true);
    expect(reverseQuartersAmount(partial)).toBeNull();
    expect(reverseQuartersAmount(setReverseQuarters(each.filter((r) => r.moment !== "q3"), true))).toBe(200);
  });

  it("keeps amounts by score type on the every-score rule only, in a fixed order", () => {
    const on = setByKind(setSides(every(), "score", "both"), true);
    expect(byKindOn(on)).toBe(true);
    expect(on[0].square?.byKind).toEqual({});
    let rules = setKindAmount(on, "square", "extraPoint", 10);
    rules = setKindAmount(rules, "square", "touchdown", 50);
    rules = setKindAmount(rules, "reverse", "safety", 5);
    expect(rules[0].square?.byKind).toEqual({ touchdown: 50, extraPoint: 10 });
    expect(Object.keys(rules[0].square?.byKind ?? {})).toEqual(["touchdown", "extraPoint"]);
    expect(rules[0].reverse?.byKind).toEqual({ safety: 5 });
    expect(setKindAmount(rules, "square", "touchdown", null)[0].square?.byKind).toEqual({ extraPoint: 10 });
    const off = setByKind(rules, false);
    expect(byKindOn(off)).toBe(false);
    expect(off[0].square).toEqual({ amount: null, note: "" });
    // Rules without a score moment ignore it.
    expect(setKindAmount(quarters(), "square", "touchdown", 5)).toEqual(quarters());
  });

  it("moves the kinds the host hasn't set along with the touchdown, as clean multiples", () => {
    const suggested = suggestPrizes(withKinds(), 10, 100);
    const kindsOf = (rules: MomentRule[], side: "square" | "reverse" = "square") => rules[0][side]?.byKind;
    // TD $100: FG, 2-PT and Safety $50, XP $25.
    const td100 = setTouchdownAmount(suggested, "square", 100, "$", 20);
    expect(kindsOf(td100)).toEqual({ touchdown: 100, fieldGoal: 50, extraPoint: 25, twoPoint: 50, safety: 50 });
    // Typed one digit at a time, through a cleared field: they keep following.
    let typing = setTouchdownAmount(suggested, "square", 1, "$", 20);
    expect(kindsOf(typing)).toEqual({ touchdown: 1, fieldGoal: 1, extraPoint: 0.5, twoPoint: 1, safety: 1 });
    typing = setTouchdownAmount(typing, "square", null, "$", 1);
    typing = setTouchdownAmount(typing, "square", 3, "$", 1);
    typing = setTouchdownAmount(typing, "square", 30, "$", 3);
    expect(kindsOf(typing)).toEqual({ touchdown: 30, fieldGoal: 15, extraPoint: 7.5, twoPoint: 15, safety: 15 });
    // One set by hand stops following; the rest still do.
    const fg = setKindAmount(suggested, "square", "fieldGoal", 12);
    expect(kindsOf(setTouchdownAmount(fg, "square", 100, "$", 20))).toEqual({ touchdown: 100, fieldGoal: 12, extraPoint: 25, twoPoint: 50, safety: 50 });
    // Empty kinds (just turned on in the host's editor) fill in.
    expect(kindsOf(setTouchdownAmount(setByKind(every(), true), "square", 40, "$", null))).toEqual({ touchdown: 40, fieldGoal: 20, extraPoint: 10, twoPoint: 20, safety: 20 });
    // Points: whole points.
    expect(kindsOf(setTouchdownAmount(setByKind(every(), true), "square", 10, "pts", null))).toEqual({ touchdown: 10, fieldGoal: 6, extraPoint: 3, twoPoint: 6, safety: 6 });
    // Only that side.
    const both = suggestPrizes(setSides(withKinds(), "score", "both"), 10, 100);
    expect(kindsOf(setTouchdownAmount(both, "square", 100, "$", 20), "reverse")).toEqual(kindsOf(both, "reverse"));
    // "Use suggested amounts" resets them all.
    expect(kindsOf(suggestPrizes(setTouchdownAmount(fg, "square", 100, "$", 20), 10, 100))).toEqual(kindsOf(suggested));
  });

  it("sends amounts by score type only when some are typed, and never without amounts", () => {
    const g = { format: fmt() };
    const rules = setKindAmount(setByKind(setReverseQuarters(every(), true), true), "square", "touchdown", 50);
    const draft: RulesDraft = { rules, choice: "$", squarePrice: 10, freshNumbers: false };
    expect(formatOf(g.format, draft).rules?.[0].square).toEqual({ amount: null, note: "", byKind: { touchdown: 50 } });
    const empty = { ...draft, rules: setByKind(every(), true) };
    expect(formatOf(g.format, empty).rules?.[0].square).toEqual({ amount: null, note: "" });
    expect(formatOf(g.format, { ...draft, choice: "fun" }).rules?.[0].square).toEqual({ amount: null, note: "" });
    expect(formatOf(g.format, { ...draft, choice: null }).rules?.[0].square).toEqual({ amount: null, note: "" });
  });

  it("sends the rest only with a square price and amounts", () => {
    const rules = suggestPrizes(withKinds(), 10, 100);
    const draft: RulesDraft = { rules, choice: "$", squarePrice: 10, freshNumbers: false };
    expect(ruleFor(formatOf(fmt(), draft).rules!, "final")?.square).toEqual({ amount: null, note: "", rest: true });
    expect(ruleFor(formatOf(fmt(), { ...draft, squarePrice: null }).rules!, "final")?.square).toEqual({ amount: null, note: "" });
    expect(ruleFor(formatOf(fmt(), { ...draft, choice: "fun" }).rules!, "final")?.square).toEqual({ amount: null, note: "" });
  });

  it("reads a board saved with one conversion amount as the five kinds, and saves it that way", () => {
    const legacy = fmt({ rules: [{ moment: "score", square: { amount: 30, note: "", byKind: { touchdown: 50, conversion: 10 } }, reverse: null }] as unknown as MomentRule[], squarePrice: 10 });
    const d = draftOf(legacy);
    expect(d.rules[0].square?.byKind).toEqual({ touchdown: 50, extraPoint: 10, twoPoint: 10 });
    expect(ruleLines(legacy)[0].sides[0].kinds?.map((k) => `${k.short} ${k.amount}`)).toEqual(["TD $50", "FG $30", "XP $10", "2-PT $10", "Safety $30"]);
    expect(prizeLineup(legacy)?.parts).toEqual(["$10 a square", "$10–$50 every score"]);
    expect(formatOf(legacy, d).rules?.[0].square?.byKind).toEqual({ touchdown: 50, extraPoint: 10, twoPoint: 10 });
  });

  it("shows the range players see, and each kind in the rules sheet", () => {
    const rules = setReverseQuartersAmount(
      setKindAmount(
        setKindAmount(setByKind(setReverseQuarters(rulesForPreset("every-score", false).map((r) => ({ ...r, square: p(30) })), true), true), "square", "touchdown", 50),
        "square",
        "extraPoint",
        10,
      ),
      200,
    );
    const f = fmt({ rules, squarePrice: 10 });
    expect(prizeLineup(f)?.parts).toEqual(["$10 a square", "$10–$50 every score", "$200 reverse each quarter"]);
    const [score] = ruleLines(f);
    expect(score.sides[0].kinds?.map((k) => `${k.label} ${k.amount}`)).toEqual(["Touchdown $50", "Field goal $30", "Extra point $10", "2-point conversion $30", "Safety $30"]);
    expect(ruleLines(fmt({ rules: OWNER }))[0].sides[0].kinds).toBeNull();
    expect(prizeLineup(fmt({ rules: setKindAmount(setByKind(rulesForPreset("every-score", false), true), "square", "touchdown", 70), unit: "pts" }))?.parts).toEqual(["70 pts every score"]);
  });

  it("shows the suggested every-score board to players: the reverse each quarter, and the final's rest", () => {
    const f = withRules({ ...fmt(), squarePrice: 10, rules: suggestPrizes(setReverseQuarters(withKinds(), true), 10, 100) });
    expect(prizeLineup(f)?.parts).toEqual(["$10 a square", "$5–$20 every score", "$40 reverse each quarter", "Final: the rest"]);
    expect(prizesSummary(f)).toBe("$10 a square · $5–$20 every score · $40 reverse each quarter · Final: the rest");
    const final = ruleLines(f).find((l) => l.moment === "final")!;
    expect(final.sides.map((s) => [s.side, s.rest, s.amount])).toEqual([
      ["square", true, null],
      ["reverse", false, "$40"],
    ]);
    // Without the reverse each quarter: "Final: the rest".
    const plain = withRules({ ...fmt(), squarePrice: 10, rules: suggestPrizes(withKinds(), 10, 100) });
    expect(prizeLineup(plain)?.parts).toEqual(["$10 a square", "$5–$20 every score", "Final: the rest"]);
    // Quarters with reverse: the reverse each quarter, then each square.
    const q = withRules({ ...fmt(), squarePrice: 10, rules: suggestPrizes(rulesForPreset("quarters", true), 10, 100) });
    expect(prizeLineup(q)?.parts).toEqual(["$10 a square", "$40 reverse each quarter", "Q1 $170", "Half $170", "Q3 $170", "Final $330"]);
    expect(JSON.stringify([prizeLineup(f), prizeLineup(q), ruleLines(f)])).not.toMatch(BETTING);
  });
});

const BETTING = /\b(bet|bets|betting|wager\w*|pot|payouts?|buy-?ins?|jackpots?|odds|stakes|gambl\w*)\b/i;

/** Every score with amounts by score type on (empty) and the final's square: the Every score card. */
function withKinds(): MomentRule[] {
  return setByKind(selectPreset(rulesForPreset("quarters", false), "every-score"), true);
}

/** The fixed moments' square (or reverse) amounts, in game order. */
function sortRulesFixed(rules: MomentRule[], side: "square" | "reverse" = "square"): (number | null)[] {
  return fixedRules(rules).map((r) => r[side]?.amount ?? null);
}

function fixedRules(rules: MomentRule[]): MomentRule[] {
  return rules.filter((r) => r.moment !== "score");
}

describe("venue mode in the editor", () => {
  it("starts a venue's board just for fun, free to play, with claim codes, five minutes and must be present", () => {
    const d = setVenue(draftOf(fmt({ rules: OWNER, squarePrice: 10 })), true);
    expect(d).toMatchObject({ venue: true, squarePrice: null, claimCodes: true, claimMinutes: 5, houseRules: ["Must be present to win"] });
    // Amounts the host already chose stay (as display-only prize values); otherwise just for fun.
    expect(d.choice).toBe("$");
    expect(setVenue(draftOf(fmt()), true).choice).toBe("fun");
    // The host's own house rules stay; turning it off keeps everything else as set.
    expect(setVenue({ ...draftOf(fmt()), houseRules: ["21+ only"] }, true).houseRules).toEqual(["21+ only"]);
    expect(setVenue(d, false)).toMatchObject({ venue: false, claimCodes: true, claimMinutes: 5 });
    expect(formatOf(fmt(), setVenue(draftOf(fmt()), true))).toMatchObject({ venue: true, justForFun: true, claimCodes: true, claimMinutes: 5 });
  });

  it("caps an open board at one square each when the host turns it on", () => {
    const game = { format: fmt({ justForFun: true }), prizes: {}, status: "open", maxPerPlayer: 0 } as Pick<Game, "format" | "prizes" | "status" | "maxPerPlayer">;
    expect(rulesPatch(game, setVenue(draftOf(game.format), true))).toMatchObject({ maxPerPlayer: 1, format: { venue: true } });
    expect(rulesPatch({ ...game, status: "locked" }, setVenue(draftOf(game.format), true))).not.toHaveProperty("maxPerPlayer");
  });
});
