// Pure helpers for the printable board (/g/:id/print): the sheet's size on
// paper (one layout that fits both US Letter and A4), each square's name
// fitted to its box, and the rules summary with or without amounts. No React,
// no IO (printModel.test.ts).
//
// Amounts are off by default: the host chooses "Include square price and
// prizes" on screen. They're read through the existing helpers (ruleLines /
// priceLine for the rules, PeriodResult + formatAmount for results), never
// from a rule's raw fields here.

import { formatAmount, periodPhrase, unitOf } from "../../../shared/formats";
import { fixedPeriodsOf, primaryAward, type PeriodResult } from "../../../shared/squares";
import type { Game, GameState } from "../../../shared/types";
import { zoneLabel } from "../../lib/format";
import { textEm } from "../../lib/textWidth";
import { priceLine, ruleLines } from "../rules/rulesModel";

// ---- The sheet ----

/** One typographic point in millimetres. */
export const PT_MM = 25.4 / 72;
/** CSS pixels per millimetre (96 per inch). */
export const PX_PER_MM = 96 / 25.4;

export interface PrintSheet {
  orientation: "landscape" | "portrait";
  /** The printed area, mm: what's left of US Letter and of A4 inside the margins, whichever is smaller. */
  width: number;
  height: number;
  /** @page margin, mm. */
  margin: number;
  /** The board's side, mm: team band + digit row + every square. */
  grid: number;
  band: number;
  axis: number;
  cell: number;
  /** Name sizes and lines for a square. */
  name: { maxPt: number; minPt: number; maxLines: number };
  /** What a name may use of a square, mm: its width less the padding and the rules (print.css). */
  nameBox: number;
}

/** A square's padding and its rule, mm (print.css: .jx-paper-cell). */
export const CELL_PADDING_MM = 0.6;
export const CELL_RULE_MM = 0.25;

/** The @page margin, mm. Most printers can't print the outer ~6 mm anyway. */
export const PAGE_MARGIN_MM = 10;
/** Kept free at the bottom of the printed area, mm, so rounding never spills onto a second page. */
const SAFETY_MM = 4;
const LETTER = { w: 215.9, h: 279.4 };
const A4 = { w: 210, h: 297 };

/**
 * A 10×10 board prints landscape (the board on the left, the rules and the QR
 * code beside it); a 5×5 board prints portrait (the board on top). The area
 * is the overlap of US Letter and A4 inside the margins, so one layout fits
 * either paper without scaling.
 */
export function printSheet(n: number): PrintSheet {
  const landscape = n > 5;
  const short = Math.min(LETTER.w, A4.w) - 2 * PAGE_MARGIN_MM;
  const long = Math.min(LETTER.h, A4.h) - 2 * PAGE_MARGIN_MM;
  const width = Math.floor((landscape ? long : short) * 10) / 10;
  const height = Math.floor(((landscape ? short : long) - SAFETY_MM) * 10) / 10;
  const grid = landscape ? 154 : 150;
  const band = landscape ? 7 : 8;
  const axis = landscape ? 8 : 10;
  const cell = Math.floor(((grid - band - axis) / n) * 100) / 100;
  return {
    orientation: landscape ? "landscape" : "portrait",
    width,
    height,
    margin: PAGE_MARGIN_MM,
    grid,
    band,
    axis,
    cell,
    name: landscape ? { maxPt: 9.5, minPt: 5.5, maxLines: 3 } : { maxPt: 15, minPt: 8, maxLines: 3 },
    nameBox: Math.floor((cell - 2 * CELL_PADDING_MM - 2 * CELL_RULE_MM - 0.2) * 100) / 100,
  };
}

// ---- A name in a square ----

const LINE_HEIGHT = 1.12;


export interface FittedName {
  lines: string[];
  /** Font size, pt. */
  pt: number;
  /** Cut short with an ellipsis: it didn't fit even at the smallest size. */
  truncated: boolean;
}

export interface FitOptions {
  maxPt: number;
  minPt: number;
  /** Lines a name may take (default 2). */
  maxLines?: number;
  /** The box's height, mm: caps the lines' total height. */
  height?: number;
}

/** Greedy word wrap into at most `max` lines no wider than `room` ems; null when a word is wider than a line or it needs more lines. */
function wrapWords(words: string[], room: number, max: number): string[] | null {
  const lines: string[] = [];
  for (const w of words) {
    if (textEm(w) > room) return null;
    const last = lines.at(-1);
    if (last !== undefined && textEm(`${last} ${w}`) <= room) lines[lines.length - 1] = `${last} ${w}`;
    else lines.push(w);
    if (lines.length > max) return null;
  }
  return lines;
}

/** At most `max` lines no wider than `room` ems (broken between words where it can), the last cut with "…" when there's more. */
function cutToFit(text: string, room: number, max: number): string[] {
  const out: string[] = [];
  let rest = [...text];
  // How many glyphs from the start fit in `room` (at least one); `suffix` must fit after them.
  const fitting = (glyphs: string[], suffix = "") => {
    let n = 0;
    while (n < glyphs.length && textEm(glyphs.slice(0, n + 1).join("") + suffix) <= room) n++;
    return Math.max(1, n);
  };
  while (rest.length > 0 && out.length < max) {
    let take = fitting(rest);
    if (take >= rest.length) {
      out.push(rest.join(""));
      rest = [];
      break;
    }
    if (out.length < max - 1) {
      const space = rest.slice(0, take + 1).lastIndexOf(" ");
      if (space > 0) take = space;
    }
    out.push(rest.slice(0, take).join("").trimEnd());
    rest = rest.slice(take);
    while (rest[0] === " ") rest.shift();
  }
  if (rest.length > 0 && out.length > 0) {
    const last = [...out[out.length - 1]];
    out[out.length - 1] = `${last.slice(0, fitting(last, "…")).join("").trimEnd()}…`;
  }
  return out;
}

/**
 * A player's name in a square `width` mm wide: one line at the largest size
 * that fits, else up to `maxLines` lines split between words, shrinking down
 * to `minPt`; a name too long even then is cut with "…". Widths come from the
 * UI face's measured advances (textEm). Sizes step by half a point so
 * neighbouring squares look alike.
 */
export function fitName(name: string, width: number, opts: FitOptions): FittedName {
  const text = name.trim().replace(/\s+/g, " ");
  const maxLines = Math.max(1, opts.maxLines ?? 2);
  if (!text) return { lines: [], pt: opts.maxPt, truncated: false };
  const words = text.split(" ");
  /** The box's width in ems at this size. */
  const room = (pt: number) => width / (pt * PT_MM);
  const linesFit = (lines: number, pt: number) => !opts.height || lines * pt * PT_MM * LINE_HEIGHT <= opts.height;
  for (let pt = opts.maxPt; pt >= opts.minPt - 1e-9; pt -= 0.5) {
    if (textEm(text) <= room(pt)) return { lines: [text], pt, truncated: false };
    if (maxLines > 1 && words.length > 1) {
      const wrapped = wrapWords(words, room(pt), maxLines);
      if (wrapped && linesFit(wrapped.length, pt)) return { lines: wrapped, pt, truncated: false };
    }
  }
  let lines = maxLines;
  while (lines > 1 && !linesFit(lines, opts.minPt)) lines--;
  return { lines: cutToFit(text, room(opts.minPt), lines), pt: opts.minPt, truncated: true };
}

// ---- Rules, with or without amounts ----

export interface PrintRule {
  moment: string;
  /** "Q1", "Half", "+" for every score. */
  short: string;
  /** "End of Q1", "Every score change". */
  label: string;
  /** "The score when the 1st quarter ends". */
  when: string;
  /** "Square", "Reverse", each with what it shows when amounts are on, and the host's note. */
  sides: { side: "Square" | "Reverse"; amount: string | null; note: string | null }[];
}

/**
 * Who wins when, from the board's rules (GameFormat.rules via ruleLines, so
 * older boards' presets read the same), one line per moment in game order.
 * `amounts` false (the default printout) leaves every amount out, the rest
 * of the board total included; notes stay (they never mention money).
 */
export function printRules(game: Pick<Game, "format" | "prizes">, amounts: boolean): PrintRule[] {
  return ruleLines(game.format, game.prizes).map((line) => ({
    moment: line.moment,
    short: line.moment === "score" ? "+" : line.short,
    label: line.label,
    when: line.when,
    sides: line.sides.map((s) => {
      let amount: string | null = null;
      if (amounts) {
        if (s.rest) amount = "the rest of the board total";
        else if (s.kinds?.length) amount = s.kinds.map((k) => `${k.short} ${k.amount}`).join(" · ");
        else amount = s.amount;
      }
      return { side: s.side === "square" ? "Square" : "Reverse", amount, note: s.note };
    }),
  }));
}

/** "$10 a square" when amounts are on and the board has a price; else null. */
export function printPrice(format: Game["format"], amounts: boolean): string | null {
  return amounts && !format.justForFun ? priceLine(format) : null;
}

/** The board has anything the "Include square price and prizes" switch would add. */
export function hasPrintAmounts(game: Pick<Game, "format" | "prizes">): boolean {
  if (game.format.justForFun) return false;
  if (priceLine(game.format)) return true;
  return printRules(game, true).some((r) => r.sides.some((s) => s.amount));
}

// ---- Winners (a box to write each one in) ----

export interface PrintWinner {
  key: string;
  /** "Q1", "Half", "Q3", "Final". */
  label: string;
  /** Filled in once decided; null leaves a line to write on. */
  name: string | null;
  score: string | null;
  amount: string | null;
}

/**
 * One line per fixed moment (Q1, Half, Q3, Final), filled in where the board
 * already has a winner, blank to write on otherwise. Every-score entries are
 * too many for paper: they stay in the app.
 */
export function printWinners(state: Pick<GameState, "game" | "players">, results: readonly PeriodResult[], amounts: boolean): PrintWinner[] {
  const unit = unitOf(state.game.format);
  const names = new Map(state.players.map((p) => [p.id, p.name]));
  return fixedPeriodsOf(state.game).map((p) => {
    const r = results.find((x) => x.periodKey === p.key);
    const main = r ? primaryAward(r) : null;
    return {
      key: p.key,
      label: periodPhrase(p.key, p.label).short,
      name: main?.playerId ? (names.get(main.playerId) ?? "Someone") : r ? "Nobody" : null,
      score: r?.score ? `${r.score.scoreX}–${r.score.scoreY}` : null,
      amount: amounts && main?.amount ? formatAmount(main.amount, unit) : null,
    };
  });
}

// ---- Sign-up sheet ----

/**
 * What the printout is for: a sign-up sheet before anyone claims a square
 * ("signup"), a board still taking names ("open": write one in, or grab a
 * square on a phone), or the board once the numbers are drawn ("game").
 */
export function sheetMode(state: Pick<GameState, "game" | "squares">): "signup" | "open" | "game" {
  const { status } = state.game;
  if (status !== "open" && status !== "draft") return "game";
  return state.squares.length === 0 ? "signup" : "open";
}

// ---- When ----

/** "Sun, Oct 26, 2026 · 1:00 PM PDT" in the device's time zone (`timeZone` for tests). */
export function printDate(ts: number, timeZone?: string): string {
  const d = new Date(ts);
  const day = d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", year: "numeric", timeZone });
  const time = d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", timeZone });
  return `${day} · ${time} ${zoneLabel(ts, timeZone)}`.trim();
}
