import { describe, expect, it } from "vitest";
import { resolveResults } from "../../../shared/squares";
import type { Game, GameFormat, GameState, MomentRule, NumberDraw, Player, Square } from "../../../shared/types";
import { textEm } from "../../lib/textWidth";
import { fitName, hasPrintAmounts, PAGE_MARGIN_MM, printDate, printPrice, printRules, printSheet, printWinners, PT_MM, sheetMode, type FitOptions } from "./printModel";

const DRAW: NumberDraw = {
  x: [[0], [1], [2], [3], [4], [5], [6], [7], [8], [9]],
  y: [[9], [8], [7], [6], [5], [4], [3], [2], [1], [0]],
};
const RULES: MomentRule[] = [
  { moment: "q1", square: { amount: 200, note: "Loser buys wings" }, reverse: null },
  { moment: "q2", square: { amount: 200, note: "" }, reverse: { amount: 50, note: "" } },
  { moment: "q3", square: { amount: 200, note: "" }, reverse: null },
  { moment: "final", square: { amount: null, note: "Bragging rights", rest: true }, reverse: null },
];
const FORMAT: GameFormat = { periods: "custom", reverse: true, boardSize: 100, freshNumbers: false, rules: RULES, unit: "$", squarePrice: 10 };
const PLAYERS: Player[] = [
  { id: "maya", name: "Maya", color: "#ff6b35", emoji: "", joinedAt: 0, isHost: true },
  { id: "dre", name: "Dre", color: "#4dabf7", emoji: "", joinedAt: 0, isHost: false },
];

function game(over: Partial<Game> = {}): Game {
  return {
    id: "prt123",
    name: "Office Pool",
    sport: "football",
    league: "custom",
    teamX: { name: "Chiefs", abbr: "KC" },
    teamY: { name: "Bills", abbr: "BUF" },
    format: FORMAT,
    periods: [
      { key: "q1", label: "Q1" },
      { key: "q2", label: "Half" },
      { key: "q3", label: "Q3" },
      { key: "final", label: "Final" },
    ],
    prizes: {},
    maxPerPlayer: 0,
    numbers: null,
    status: "open",
    linkedEvent: null,
    hostPlayerId: "maya",
    createdAt: 0,
    lockedAt: null,
    ...over,
  };
}

const LETTER_LANDSCAPE = { w: 279.4 - 2 * PAGE_MARGIN_MM, h: 215.9 - 2 * PAGE_MARGIN_MM };
const A4_LANDSCAPE = { w: 297 - 2 * PAGE_MARGIN_MM, h: 210 - 2 * PAGE_MARGIN_MM };

describe("printSheet (page sizing)", () => {
  it("prints a 10×10 board landscape, inside both US Letter and A4", () => {
    const s = printSheet(10);
    expect(s.orientation).toBe("landscape");
    for (const page of [LETTER_LANDSCAPE, A4_LANDSCAPE]) {
      expect(s.width).toBeLessThanOrEqual(page.w);
      expect(s.height).toBeLessThanOrEqual(page.h);
    }
    // The grid fits under the title row, with room beside it for the rules and the QR code.
    expect(s.band + s.axis + 10 * s.cell).toBeLessThanOrEqual(s.grid);
    expect(s.grid).toBeLessThan(s.height - 25);
    expect(s.width - s.grid).toBeGreaterThan(80);
    expect(s.cell).toBeGreaterThan(13);
    expect(s.nameBox).toBeLessThan(s.cell);
  });

  it("prints a 5×5 board portrait, with roomier squares", () => {
    const s = printSheet(5);
    expect(s.orientation).toBe("portrait");
    expect(s.width).toBeLessThanOrEqual(215.9 - 2 * PAGE_MARGIN_MM);
    expect(s.height).toBeLessThanOrEqual(279.4 - 2 * PAGE_MARGIN_MM);
    expect(s.cell).toBeGreaterThan(25);
    expect(s.name.maxPt).toBeGreaterThan(printSheet(10).name.maxPt);
  });
});

describe("fitName (a name in its box)", () => {
  const box = printSheet(10).nameBox;
  const opts: FitOptions = { ...printSheet(10).name, height: box };
  const widthOf = (line: string, pt: number) => textEm(line) * pt * PT_MM;

  it("keeps a short name on one line at the largest size", () => {
    expect(fitName("Dre", box, opts)).toEqual({ lines: ["Dre"], pt: opts.maxPt, truncated: false });
    expect(fitName("  Maya  ", box, opts).lines).toEqual(["Maya"]);
  });

  it("shrinks a long single word to fit on one line", () => {
    const fit = fitName("Christopher", box, opts);
    expect(fit.lines).toEqual(["Christopher"]);
    expect(fit.pt).toBeLessThan(opts.maxPt);
    expect(fit.pt).toBeGreaterThanOrEqual(opts.minPt);
    expect(widthOf("Christopher", fit.pt)).toBeLessThanOrEqual(box);
  });

  it("splits a full name between words before shrinking it further", () => {
    const fit = fitName("Mary Elizabeth Johnson", box, opts);
    expect(fit.truncated).toBe(false);
    expect(fit.lines.join(" ")).toBe("Mary Elizabeth Johnson");
    expect(fit.lines.length).toBeGreaterThan(1);
    for (const line of fit.lines) expect(widthOf(line, fit.pt)).toBeLessThanOrEqual(box);
    expect(fit.lines.length * fit.pt * PT_MM * 1.12).toBeLessThanOrEqual(box);
  });

  it("cuts a name that can't fit even at the smallest size, with an ellipsis", () => {
    const fit = fitName("Wolfeschlegelsteinhausenbergerdorff", box, opts);
    expect(fit.truncated).toBe(true);
    expect(fit.pt).toBe(opts.minPt);
    expect(fit.lines.length).toBeLessThanOrEqual(opts.maxLines ?? 2);
    expect(fit.lines.at(-1)?.endsWith("…")).toBe(true);
    for (const line of fit.lines) expect(widthOf(line, fit.pt)).toBeLessThanOrEqual(box + 0.01);
    // One line only when there's no height for more.
    const oneLine = fitName("Wolfeschlegelsteinhausenbergerdorff", 10, { maxPt: 9, minPt: 6, maxLines: 2, height: 3 });
    expect(oneLine.lines).toHaveLength(1);
    expect(oneLine.lines[0].endsWith("…")).toBe(true);
  });

  it("returns nothing for an empty name", () => {
    expect(fitName("   ", box, opts).lines).toEqual([]);
  });

  it("measures wide letters wider than narrow ones", () => {
    expect(textEm("WWW")).toBeGreaterThan(textEm("iii") * 2);
    expect(textEm("Maya")).toBeLessThan(textEm("MAYA"));
  });
});

describe("rules on paper", () => {
  it("leaves every amount out by default, notes included", () => {
    const rules = printRules(game(), false);
    expect(rules.map((r) => r.short)).toEqual(["Q1", "Half", "Q3", "Final"]);
    expect(rules[0]).toMatchObject({ label: "End of Q1", sides: [{ side: "Square", amount: null, note: "Loser buys wings" }] });
    expect(rules[1].sides.map((s) => s.side)).toEqual(["Square", "Reverse"]);
    expect(JSON.stringify(rules)).not.toMatch(/\$|rest of the board/);
    expect(printPrice(game().format, false)).toBeNull();
  });

  it("adds the square price and each prize's amount when asked", () => {
    const rules = printRules(game(), true);
    expect(rules[0].sides[0].amount).toBe("$200");
    expect(rules[1].sides[1]).toMatchObject({ side: "Reverse", amount: "$50" });
    expect(rules[3].sides[0]).toMatchObject({ amount: "the rest of the board total", note: "Bragging rights" });
    expect(printPrice(game().format, true)).toBe("$10 a square");
  });

  it("lists amounts by score type on an every-score board", () => {
    const every = game({
      format: {
        ...FORMAT,
        rules: [{ moment: "score", square: { amount: 10, note: "", byKind: { touchdown: 20, fieldGoal: 10, extraPoint: 5 } }, reverse: null }],
      },
    });
    const [line] = printRules(every, true);
    expect(line).toMatchObject({ moment: "score", short: "+", label: "Every score change" });
    // Kinds without their own amount show the flat one, like the rules sheet.
    expect(line.sides[0].amount).toBe("TD $20 · FG $10 · XP $5 · 2-PT $10 · Safety $10");
    expect(printRules(every, false)[0].sides[0].amount).toBeNull();
  });

  it("reads an older board's rules from its preset and notes", () => {
    const legacy = game({ format: { periods: "halves", reverse: false, boardSize: 100, freshNumbers: false }, prizes: { final: "Pizza on Monday" } });
    const rules = printRules(legacy, false);
    expect(rules.map((r) => r.short)).toEqual(["Half", "Final"]);
    expect(rules[1].sides[0].note).toBe("Pizza on Monday");
    expect(hasPrintAmounts(legacy)).toBe(false);
  });

  it("offers the amounts switch only when there's something to add", () => {
    expect(hasPrintAmounts(game())).toBe(true);
    expect(hasPrintAmounts(game({ format: { ...FORMAT, justForFun: true, squarePrice: null, rules: RULES.map((r) => ({ ...r, square: r.square && { amount: null, note: r.square.note } })) } }))).toBe(false);
    expect(hasPrintAmounts(game({ format: { ...FORMAT, squarePrice: 5, rules: RULES.map((r) => ({ ...r, square: r.square && { amount: null, note: "" }, reverse: null })) } }))).toBe(true);
  });
});

describe("winners on paper", () => {
  const squares: Square[] = Array.from({ length: 100 }, (_, i) => ({ row: Math.floor(i / 10), col: i % 10, playerId: i % 2 ? "dre" : "maya", claimedAt: 0 }));
  const locked: GameState = {
    game: game({ status: "locked", numbers: { "*": DRAW } }),
    players: PLAYERS,
    squares,
    scores: [{ periodKey: "q1", scoreX: 7, scoreY: 3, source: "host", updatedAt: 1 }],
    manualWinners: [],
    live: null,
    activity: [],
    version: 2,
  };

  it("leaves a line to write on for each moment still to come, and fills in the decided ones", () => {
    const rows = printWinners(locked, resolveResults(locked), false);
    expect(rows.map((r) => r.label)).toEqual(["Q1", "Half", "Q3", "Final"]);
    // 7–3: row 6, column 7 -> square 67 -> Dre.
    expect(rows[0]).toEqual({ key: "q1", label: "Q1", name: "Dre", score: "7–3", amount: null });
    expect(rows[1]).toMatchObject({ name: null, score: null });
    expect(printWinners(locked, resolveResults(locked), true)[0].amount).toBe("$200");
  });
});

describe("sheetMode", () => {
  const base = { game: game(), squares: [] as Square[] };
  it("is a sign-up sheet before anyone claims, a board taking names while open, the board once drawn", () => {
    expect(sheetMode(base)).toBe("signup");
    expect(sheetMode({ ...base, squares: [{ row: 0, col: 0, playerId: "maya", claimedAt: 0 }] })).toBe("open");
    expect(sheetMode({ ...base, game: game({ status: "locked", numbers: { "*": DRAW } }) })).toBe("game");
    expect(sheetMode({ ...base, game: game({ status: "final", numbers: { "*": DRAW } }) })).toBe("game");
  });
});

describe("printDate", () => {
  it("says the kickoff in local time with its zone", () => {
    const ts = Date.UTC(2026, 9, 25, 20, 0); // Sun Oct 25 2026, 1:00 PM in Los Angeles (PDT)
    expect(printDate(ts, "America/Los_Angeles")).toBe("Sun, Oct 25, 2026 · 1:00 PM PDT");
  });
});
