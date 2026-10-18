import { describe, expect, it } from "vitest";
import { defaultFormat, rulesForPreset, withRules } from "../../../shared/formats";
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
  splitOptions,
  splitSharesBoth,
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

  it("locks who wins once a score or pick is in, and fresh numbers once drawn", () => {
    const g = game();
    expect(rulesLock({ game: g as unknown as Game, scores: [], manualWinners: [] })).toEqual({ scoring: null, fresh: null });
    const lock = rulesLock({ game: { ...g, numbers: { "*": { x: [], y: [] } } } as unknown as Game, scores: [{ periodKey: "s1", scoreX: 7, scoreY: 0, source: "host", updatedAt: 0 }], manualWinners: [] });
    expect(lock).toEqual({ scoring: SCORING_LOCKED, fresh: FRESH_LOCKED });
    const d = draftOf(g.format);
    expect(lockViolation(g, { ...d, rules: setPrize(d.rules, "q1", "reverse", { amount: 1 }) }, lock)).toBeNull();
    expect(lockViolation(g, { ...d, rules: setSides(d.rules, "q1", "both") }, lock)).toBe(SCORING_LOCKED);
    expect(lockViolation(g, { ...d, freshNumbers: true }, lock)).toBe(FRESH_LOCKED);
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

  it("compares the fixed prizes with the total, noting every-score prizes on top", () => {
    const owner = prizeBudget(OWNER, 1000);
    expect(owner).toEqual({ total: 1000, fixed: 800, left: 200, status: "under", everyScore: true });
    expect(budgetText(owner, "$")).toEqual({ main: "$800 of $1,000", detail: "$200 left" });
    const over = prizeBudget(setPrize(OWNER, "final", "reverse", { amount: 600 }), 1000);
    expect(budgetText(over, "$")).toEqual({ main: "$1,200 of $1,000", detail: "$200 over" });
    expect(over.status).toBe("over");
    const exact = prizeBudget(setPrize(OWNER, "final", "reverse", { amount: 400 }), 1000);
    expect([exact.status, budgetText(exact, "$").detail]).toEqual(["exact", "Adds up"]);
    expect(budgetText(prizeBudget(quarters(), 500), "pts")).toEqual({ main: "None yet", detail: null });
    const everyOnly = rulesForPreset("every-score", false).map((r) => ({ ...r, square: p(25) }));
    expect(budgetText(prizeBudget(everyOnly, 1000), "$")).toEqual({ main: "Every score only", detail: null });
    expect(prizeBudget(quarters(), 500).everyScore).toBe(false);
  });

  it("splits the total evenly or with a bigger final, and knows which split the prizes match", () => {
    const [even, bigger] = splitOptions(quarters(), 1000, "$");
    expect([even.label, even.preview]).toEqual(["Even", "Q1 $250 · Half $250 · Q3 $250 · Final $250"]);
    expect([bigger.label, bigger.preview]).toEqual(["Bigger final", "Q1 $200 · Half $200 · Q3 $200 · Final $400"]);
    expect(even.selected || bigger.selected).toBe(false);
    // After filling, that choice reads as picked; the amounts stay editable.
    const filled = splitOptions(bigger.rules, 1000, "$");
    expect(filled.map((o) => o.selected)).toEqual([false, true]);
    const edited = setPrize(bigger.rules, "q1", "square", { amount: 150 });
    expect(splitOptions(edited, 1000, "$").some((o) => o.selected)).toBe(false);
    // The owner's setup: reverse-only quarter-ends take the whole share; every score is left alone.
    const owner = splitOptions(OWNER, 1000, "$")[1].rules;
    expect(owner.map((r) => r.reverse?.amount ?? r.square?.amount)).toEqual([50, 200, 200, 200, 400]);
    expect(splitOptions(OWNER, 250, "pts")[0].preview).toBe("Q1 62 pts · Half 62 pts · Q3 63 pts · Final 63 pts");
  });

  it("offers one choice with one fixed moment, none without a total or fixed moments", () => {
    const final = rulesForPreset("final", false);
    expect(splitOptions(final, 500, "$").map((o) => [o.label, o.preview])).toEqual([["All of it", "Final $500"]]);
    expect(splitOptions(quarters(), null, "$")).toEqual([]);
    expect(splitOptions(rulesForPreset("every-score", false), 1000, "$")).toEqual([]);
    expect(splitSharesBoth(rulesForPreset("quarters", true))).toBe(true);
    expect(splitSharesBoth(OWNER)).toBe(false);
  });
});

describe("every score change: reverse at the quarters, amounts by score type", () => {
  const every = () => rulesForPreset("every-score", false);

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
    let rules = setKindAmount(on, "square", "conversion", 10);
    rules = setKindAmount(rules, "square", "touchdown", 50);
    rules = setKindAmount(rules, "reverse", "safety", 5);
    expect(rules[0].square?.byKind).toEqual({ touchdown: 50, conversion: 10 });
    expect(Object.keys(rules[0].square?.byKind ?? {})).toEqual(["touchdown", "conversion"]);
    expect(rules[0].reverse?.byKind).toEqual({ safety: 5 });
    expect(setKindAmount(rules, "square", "touchdown", null)[0].square?.byKind).toEqual({ conversion: 10 });
    const off = setByKind(rules, false);
    expect(byKindOn(off)).toBe(false);
    expect(off[0].square).toEqual({ amount: null, note: "" });
    // Rules without a score moment ignore it.
    expect(setKindAmount(quarters(), "square", "touchdown", 5)).toEqual(quarters());
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

  it("shows the range players see, and each kind in the rules sheet", () => {
    const rules = setReverseQuartersAmount(
      setKindAmount(
        setKindAmount(setByKind(setReverseQuarters(rulesForPreset("every-score", false).map((r) => ({ ...r, square: p(30) })), true), true), "square", "touchdown", 50),
        "square",
        "conversion",
        10,
      ),
      200,
    );
    const f = fmt({ rules, squarePrice: 10 });
    expect(prizeLineup(f)?.parts).toEqual(["$10 a square", "$10–$50 every score", "$200 reverse each quarter"]);
    const [score] = ruleLines(f);
    expect(score.sides[0].kinds?.map((k) => `${k.label} ${k.amount}`)).toEqual(["Touchdown $50", "Field goal $30", "Conversion $10", "Safety $30"]);
    expect(ruleLines(fmt({ rules: OWNER }))[0].sides[0].kinds).toBeNull();
    expect(prizeLineup(fmt({ rules: setKindAmount(setByKind(rulesForPreset("every-score", false), true), "square", "touchdown", 70), unit: "pts" }))?.parts).toEqual(["70 pts every score"]);
  });
});

function fixedRules(rules: MomentRule[]): MomentRule[] {
  return rules.filter((r) => r.moment !== "score");
}
