// The shareable recap card as data: a 1080×1350 image (stories and feeds) a
// player sends the group chat once a winner lands or the game goes final.
// `recapCard` says what's on it, `recapLayout` where everything goes (every
// rect, circle, line of text and Jax, in card pixels); drawRecap.ts only
// paints the result on a canvas. Pure and unit-tested apart from the canvas.
//
// Share images leave the app, so the card never carries an amount (no square
// price, no prize, no "rest"): the board's name, the teams and the score, each
// moment's winner with the period and the winning digits, Jax cheering, and
// "Made with JaxSquares · jaxsquares.com". Its own fixed design (night turf,
// the brand's lime and gold), whatever the device's theme.

import { periodPhrase, scorePlayLabel } from "../../../shared/formats";
import { lastDigit, resolveResults, winCounts, type PeriodResult } from "../../../shared/squares";
import type { GameState, Player, Team } from "../../../shared/types";
import { initialsOf, luminance, shortTeam, teamVars } from "../../lib/format";
import { textEm } from "../../lib/textWidth";

export const RECAP_WIDTH = 1080;
export const RECAP_HEIGHT = 1350;
/** The card's sign-off, in three runs: "Made with " + "JaxSquares" (lime) + " · jaxsquares.com". */
export const RECAP_FOOTER = ["Made with ", "JaxSquares", " · jaxsquares.com"] as const;

/** The card's own colors: the dark theme's, fixed, so it looks the same from a phone in light mode. */
export const RECAP_COLORS = {
  top: "#0f1c15",
  bottom: "#060c09",
  ink: "#f3f7f1",
  muted: "#a3b8ab",
  subtle: "#768d7f",
  brand: "#d5ff52",
  gold: "#ffd56b",
  goldWash: "rgba(255, 194, 51, 0.16)",
  panel: "rgba(255, 255, 255, 0.06)",
  panelLine: "rgba(255, 255, 255, 0.12)",
  row: "rgba(255, 255, 255, 0.05)",
  yardLine: "rgba(255, 255, 255, 0.035)",
  inverse: "#060c09",
} as const;

// ---- What the card says ----

export interface RecapTeam {
  /** "Chiefs". */
  name: string;
  /** "KC" (or the name's initials for a typed-in team). */
  abbr: string;
  /** The team's color as it reads on the dark card, and the text that reads on it. */
  color: string;
  ink: string;
  /** The team's color for text on the card (the winning digits): lifted toward white until it reads (4.5:1). */
  text: string;
}

export interface RecapWinner {
  name: string;
  color: string;
  emoji: string;
  initials: string;
}

export interface RecapRow {
  /** The period key ("q1", "s3"), with ":reverse" for its reverse square. */
  key: string;
  /** "Q1", "Half", "Final", "Score 3 · TD", "Q1 reverse". Never an amount. */
  label: string;
  /** Who held the winning square; null when nobody did. */
  winner: RecapWinner | null;
  /** The winning digits, the column team's then the row team's (swapped for a reverse square); null without a score. */
  digits: [number, number] | null;
  reverse: boolean;
  /** A fixed moment (Q1, Half, Q3, Final): kept first when the card can't fit every row. */
  fixed: boolean;
}

export interface RecapCard {
  boardName: string;
  teamX: RecapTeam;
  teamY: RecapTeam;
  /** The final score, or the score so far. */
  score: { x: number; y: number } | null;
  final: boolean;
  /** "Final", "At halftime", "After Q1", "After score 4". */
  status: string;
  /** Every winning square so far, in game order. */
  rows: RecapRow[];
  /** How many players have won (each counted once). */
  winners: number;
}

const FIXED = new Set(["q1", "q2", "q3", "final"]);

/** The recap of a board with at least one decided moment; null before the first one. */
export function recapCard(state: GameState): RecapCard | null {
  const results = resolveResults(state);
  if (results.length === 0) return null;
  const { game } = state;
  const colors = teamVars(game.teamX, game.teamY, "dark") as Record<string, string>;
  const team = (t: Team, side: "x" | "y"): RecapTeam => {
    const name = shortTeam(t, game.league) || t.name;
    const color = colors[`--team-${side}`];
    return {
      name,
      abbr: (t.abbr?.trim() || initialsOf(name)).slice(0, 4).toUpperCase(),
      color,
      ink: colors[`--team-${side}-ink`],
      text: readableOnCard(color),
    };
  };
  const players = new Map(state.players.map((p) => [p.id, p]));
  const final = game.status === "final";
  return {
    boardName: game.name.trim() || "Squares",
    teamX: team(game.teamX, "x"),
    teamY: team(game.teamY, "y"),
    score: cardScore(state, results, final),
    final,
    status: final ? "Final" : statusAfter(results[results.length - 1]),
    rows: results.flatMap((r) => rowsOf(r, players)),
    winners: Object.keys(winCounts(results)).length,
  };
}

/** `hex` mixed toward white until it reads as text on the card's turf (4.5:1), so a navy jersey's digits still read. */
export function readableOnCard(hex: string): string {
  const m = /^#([0-9a-f]{6})$/i.exec(hex);
  if (!m) return RECAP_COLORS.ink;
  const n = parseInt(m[1], 16);
  const rgb = [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  const bg = luminance(RECAP_COLORS.top);
  for (let t = 0; t <= 1.0001; t += 0.05) {
    const mixed = `#${rgb.map((c) => Math.round(c + (255 - c) * t).toString(16).padStart(2, "0")).join("")}`;
    if ((luminance(mixed) + 0.05) / (bg + 0.05) >= 4.5) return mixed;
  }
  return RECAP_COLORS.ink;
}

function cardScore(state: GameState, results: PeriodResult[], final: boolean): RecapCard["score"] {
  const { live } = state;
  if (final) {
    const f = state.scores.find((s) => s.periodKey === "final");
    if (f) return { x: f.scoreX, y: f.scoreY };
    if (live && live.state !== "pre") return { x: live.scoreX, y: live.scoreY };
  } else if (live?.state === "in") {
    return { x: live.scoreX, y: live.scoreY };
  }
  const last = [...results].reverse().find((r) => r.score)?.score;
  return last ? { x: last.scoreX, y: last.scoreY } : null;
}

/** Where a game in progress stands, by its latest decided moment. */
function statusAfter(r: PeriodResult): string {
  switch (r.periodKey) {
    case "q1":
      return "After Q1";
    case "q2":
      return "At halftime";
    case "q3":
      return "After Q3";
    case "final":
      return "Final";
  }
  const short = periodPhrase(r.periodKey, r.label).short;
  return /^Score \d+$/.test(short) ? `After ${short.toLowerCase()}` : `After ${short}`;
}

function rowsOf(r: PeriodResult, players: Map<string, Player>): RecapRow[] {
  const base = periodPhrase(r.periodKey, r.label).short;
  const label = r.scoreKind ? `${base} · ${scorePlayLabel(r.scoreKind)}` : base;
  const fixed = FIXED.has(r.periodKey);
  const winner = (id: string | null): RecapWinner | null => {
    const p = id ? players.get(id) : undefined;
    return p ? { name: p.name.trim() || "Player", color: p.color, emoji: p.emoji, initials: initialsOf(p.name) } : null;
  };
  const x = r.score ? lastDigit(r.score.scoreX) : null;
  const y = r.score ? lastDigit(r.score.scoreY) : null;
  const rows: RecapRow[] = [];
  if (r.awardsSquare) rows.push({ key: r.periodKey, label, winner: winner(r.winnerPlayerId), digits: x !== null && y !== null ? [x, y] : null, reverse: false, fixed });
  if (r.awardsReverse) {
    rows.push({ key: `${r.periodKey}:reverse`, label: `${label} reverse`, winner: winner(r.reverseWinnerPlayerId), digits: x !== null && y !== null ? [y, x] : null, reverse: true, fixed });
  }
  return rows;
}

/**
 * The rows that fit `capacity` lines. All of them when they fit; otherwise
 * one line goes to "+ N more" and the rest, in this order, to the Final's
 * square, the other fixed moments' squares, their reverse squares, then the
 * latest scores; shown in game order.
 */
export function fitRows(rows: readonly RecapRow[], capacity: number): { shown: RecapRow[]; more: number } {
  if (rows.length <= capacity) return { shown: [...rows], more: 0 };
  const room = Math.max(0, capacity - 1);
  const rank = (row: RecapRow) => (!row.fixed ? 3 : row.reverse ? 2 : row.key === "final" ? 0 : 1);
  const order = rows.map((row, i) => ({ row, i }));
  // Fixed moments in game order; score entries newest first.
  const keep = [...order]
    .sort((a, b) => rank(a.row) - rank(b.row) || (a.row.fixed ? a.i - b.i : b.i - a.i))
    .slice(0, room);
  const shown = keep.sort((a, b) => a.i - b.i).map((o) => o.row);
  return { shown, more: rows.length - shown.length };
}

/** What the share sheet says with the image: the score and how many won, never an amount. */
export function recapShareText(card: RecapCard): string {
  const score = card.score ? `${card.teamX.name} ${card.score.x}, ${card.teamY.name} ${card.score.y}` : `${card.teamX.name} vs ${card.teamY.name}`;
  const won = card.winners > 0 ? ` · ${card.winners} ${card.winners === 1 ? "winner" : "winners"}` : "";
  return `${card.final ? "Final" : card.status}: ${score}${won} on ${card.boardName} 🏈`;
}

// ---- Where everything goes ----

export interface RecapFont {
  family: "display" | "sans";
  weight: number;
  /** px */
  size: number;
}

export type RecapOp =
  | { kind: "rect"; x: number; y: number; w: number; h: number; r: number; fill: string; stroke?: string }
  | { kind: "circle"; cx: number; cy: number; r: number; fill: string }
  | { kind: "line"; x1: number; y1: number; x2: number; y2: number; color: string; width: number }
  /** One run of text on a baseline; `maxWidth` truncates it with "…". `tracking` is letter spacing in px. */
  | { kind: "text"; x: number; y: number; text: string; font: RecapFont; color: string; align: "left" | "center" | "right"; maxWidth?: number; tracking?: number }
  /** Runs of text side by side on one baseline (the digits, the sign-off), aligned as a whole. */
  | { kind: "runs"; x: number; y: number; font: RecapFont; align: "left" | "center" | "right"; runs: { text: string; color: string; weight?: number }[] }
  | { kind: "jax"; x: number; y: number; w: number; h: number };

export interface RecapLayout {
  width: number;
  height: number;
  /** Turf from `top` to `bottom`, with each team's color as a floodlight in its top corner. */
  background: { top: string; bottom: string; glowX: string; glowY: string };
  ops: RecapOp[];
  /** Rows on the card, and how many didn't fit ("+ N more"). */
  rows: RecapRow[];
  more: number;
}

const PAD = 64;
/** Jax cheering: his pose is 128×132. */
const JAX_W = 224;
const JAX_H = Math.round((JAX_W * 132) / 128);
const PANEL = { x: PAD, y: 288, w: RECAP_WIDTH - 2 * PAD, h: 236 };
const ROWS_TOP = 622;
const ROW_H = 76;
const ROW_GAP = 10;
const FOOTER_Y = 1290;
const ROWS_BOTTOM = FOOTER_Y - 60;
/** Lines the rows area holds (7 on the 1350 card). */
export const RECAP_ROW_CAPACITY = Math.floor((ROWS_BOTTOM - ROWS_TOP + ROW_GAP) / (ROW_H + ROW_GAP));

const sans = (weight: number, size: number): RecapFont => ({ family: "sans", weight, size });
const display = (weight: number, size: number): RecapFont => ({ family: "display", weight, size });
/** A width for text set in the UI face, in px (measured advances, a little headroom for heavier weights). */
const widthOf = (text: string, size: number) => Math.ceil(textEm(text) * size * 1.05);

export function recapLayout(card: RecapCard): RecapLayout {
  const c = RECAP_COLORS;
  const ops: RecapOp[] = [];
  const right = RECAP_WIDTH - PAD;

  // Yard lines across the turf, faint.
  for (let y = 120; y < RECAP_HEIGHT; y += 120) ops.push({ kind: "line", x1: 0, y1: y, x2: RECAP_WIDTH, y2: y, color: c.yardLine, width: 2 });

  // ---- Header: the board, where the game stands, Jax cheering ----
  const headerW = RECAP_WIDTH - 2 * PAD - JAX_W - 24;
  ops.push({ kind: "text", x: PAD, y: 118, text: card.boardName.toUpperCase(), font: sans(800, 30), color: c.muted, align: "left", maxWidth: headerW, tracking: 3 });
  ops.push({
    kind: "text",
    x: PAD,
    y: card.final ? 238 : 226,
    text: card.status,
    font: display(800, card.final ? 112 : 80),
    color: card.final ? c.brand : c.ink,
    align: "left",
    maxWidth: headerW,
  });
  ops.push({ kind: "jax", x: right - JAX_W + 8, y: 40, w: JAX_W, h: JAX_H });

  // ---- The scoreboard ----
  ops.push({ kind: "rect", x: PANEL.x, y: PANEL.y, w: PANEL.w, h: PANEL.h, r: 44, fill: c.panel, stroke: c.panelLine });
  const inner = { left: PANEL.x + 40, right: PANEL.x + PANEL.w - 40 };
  const chip = (team: RecapTeam, side: "left" | "right") => {
    const w = Math.max(84, widthOf(team.abbr, 30) + 36);
    const x = side === "left" ? inner.left : inner.right - w;
    ops.push({ kind: "rect", x, y: PANEL.y + 36, w, h: 52, r: 16, fill: team.color });
    ops.push({ kind: "text", x: x + w / 2, y: PANEL.y + 72, text: team.abbr, font: sans(800, 30), color: team.ink, align: "center" });
    const nameMax = PANEL.w / 2 - 40 - w - 16 - 24;
    ops.push({
      kind: "text",
      x: side === "left" ? x + w + 16 : x - 16,
      y: PANEL.y + 72,
      text: team.name,
      font: sans(700, 30),
      color: c.muted,
      align: side === "left" ? "left" : "right",
      maxWidth: nameMax,
    });
  };
  chip(card.teamX, "left");
  chip(card.teamY, "right");
  const scoreY = PANEL.y + PANEL.h - 32;
  ops.push({ kind: "text", x: inner.left, y: scoreY, text: card.score ? String(card.score.x) : "–", font: display(800, 150), color: c.ink, align: "left" });
  ops.push({ kind: "text", x: inner.right, y: scoreY, text: card.score ? String(card.score.y) : "–", font: display(800, 150), color: c.ink, align: "right" });
  ops.push({ kind: "text", x: RECAP_WIDTH / 2, y: scoreY - 34, text: "–", font: display(800, 80), color: c.subtle, align: "center" });

  // ---- Winners ----
  ops.push({ kind: "text", x: PAD, y: ROWS_TOP - 30, text: "WINNERS", font: sans(800, 28), color: c.gold, align: "left", tracking: 4 });
  if (card.winners > 0) {
    ops.push({
      kind: "text",
      x: right,
      y: ROWS_TOP - 30,
      text: `${card.winners} ${card.winners === 1 ? "player" : "players"} won`,
      font: sans(700, 28),
      color: c.muted,
      align: "right",
    });
  }
  const { shown, more } = fitRows(card.rows, RECAP_ROW_CAPACITY);
  shown.forEach((row, i) => {
    const y = ROWS_TOP + i * (ROW_H + ROW_GAP);
    const mid = y + ROW_H / 2;
    ops.push({ kind: "rect", x: PAD, y, w: RECAP_WIDTH - 2 * PAD, h: ROW_H, r: 24, fill: c.row });
    // The moment, in a gold chip.
    const chipW = Math.max(112, widthOf(row.label, 28) + 36);
    ops.push({ kind: "rect", x: PAD + 16, y: mid - 26, w: chipW, h: 52, r: 16, fill: c.goldWash });
    ops.push({ kind: "text", x: PAD + 16 + chipW / 2, y: mid + 10, text: row.label, font: sans(800, 28), color: c.gold, align: "center" });
    // Who won: their color and emoji (or initials), then the name.
    const avatarX = PAD + 16 + chipW + 20 + 26;
    const digitsW = 150;
    const nameX = avatarX + 26 + 16;
    const nameMax = right - 24 - digitsW - 16 - nameX;
    if (row.winner) {
      ops.push({ kind: "circle", cx: avatarX, cy: mid, r: 26, fill: row.winner.color || c.subtle });
      ops.push({
        kind: "text",
        x: avatarX,
        y: mid + (row.winner.emoji ? 10 : 9),
        text: row.winner.emoji || row.winner.initials,
        font: sans(800, row.winner.emoji ? 28 : 22),
        color: c.inverse,
        align: "center",
      });
      ops.push({ kind: "text", x: nameX, y: mid + 12, text: row.winner.name, font: sans(800, 34), color: c.ink, align: "left", maxWidth: nameMax });
    } else {
      ops.push({ kind: "circle", cx: avatarX, cy: mid, r: 26, fill: c.panel });
      ops.push({ kind: "text", x: nameX, y: mid + 12, text: "Nobody had it", font: sans(700, 32), color: c.subtle, align: "left", maxWidth: nameMax });
    }
    // The winning digits: the column team's in its color, the row team's in its.
    ops.push({
      kind: "runs",
      x: right - 24,
      y: mid + 15,
      font: display(800, 44),
      align: "right",
      runs: row.digits
        ? [
            { text: String(row.digits[0]), color: card.teamX.text },
            { text: "–", color: c.subtle },
            { text: String(row.digits[1]), color: card.teamY.text },
          ]
        : [{ text: "—", color: c.subtle }],
    });
  });
  if (more > 0) {
    const y = ROWS_TOP + shown.length * (ROW_H + ROW_GAP) + ROW_H / 2 + 10;
    ops.push({ kind: "text", x: RECAP_WIDTH / 2, y, text: `+ ${more} more on the board`, font: sans(700, 30), color: c.muted, align: "center" });
  }

  // ---- Sign-off ----
  ops.push({ kind: "line", x1: PAD, y1: FOOTER_Y - 52, x2: right, y2: FOOTER_Y - 52, color: c.panelLine, width: 2 });
  ops.push({
    kind: "runs",
    x: RECAP_WIDTH / 2,
    y: FOOTER_Y,
    font: sans(600, 32),
    align: "center",
    runs: [
      { text: RECAP_FOOTER[0], color: c.muted },
      { text: RECAP_FOOTER[1], color: c.brand, weight: 800 },
      { text: RECAP_FOOTER[2], color: c.muted },
    ],
  });

  return {
    width: RECAP_WIDTH,
    height: RECAP_HEIGHT,
    background: { top: c.top, bottom: c.bottom, glowX: card.teamX.color, glowY: card.teamY.color },
    ops,
    rows: shown,
    more,
  };
}

/** Every piece of text on the card (tests: nothing on it is an amount). */
export function recapTexts(layout: RecapLayout): string[] {
  return layout.ops.flatMap((op) => (op.kind === "text" ? [op.text] : op.kind === "runs" ? [op.runs.map((r) => r.text).join("")] : []));
}
