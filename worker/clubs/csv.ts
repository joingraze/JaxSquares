// The players CSV an Annual Pass + Venue board's host and co-hosts can download
// (GET /api/games/:id/export.csv): one row per player, from the board's
// public state only. Columns: the player's name, how many squares they hold,
// those squares as "row-col" (counted from 1 at the top left), after the draw
// their numbers (team across the top first, then the team down the side; a
// column per draw on a board with new numbers each quarter), and when they
// joined. Never a payment column, an email or a clientId: JaxSquares doesn't
// track who paid whom, and the state it's built from carries none. Pure.

import { fixedPeriodsOf } from "../../shared/squares";
import type { GameState, NumberDraw, Team } from "../../shared/types";

export interface CsvOptions {
  /** The downloader's IANA time zone for the joined time ("America/New_York"); UTC when missing or unknown. */
  timeZone?: string | null;
}

/** Formula injection: a cell a spreadsheet would run as a formula is kept as text. */
const FORMULA_START = /^[=+\-@\t\r]/;

/** One CSV cell (RFC 4180), never a formula. */
export function csvCell(value: string | number): string {
  let s = String(value);
  if (typeof value === "string" && FORMULA_START.test(s)) s = `'${s}`;
  return /[",\r\n]|^\s|\s$/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** The time zone to use: the asked one when this runtime knows it, else UTC. */
export function zoneOf(timeZone: string | null | undefined): string {
  if (!timeZone || timeZone.length > 64) return "UTC";
  try {
    new Intl.DateTimeFormat("en-US", { timeZone });
    return timeZone;
  } catch {
    return "UTC";
  }
}

/** "2026-10-19 13:05" in `timeZone`. */
export function csvTime(ms: number, timeZone: string): string {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", { timeZone, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" })
      .formatToParts(new Date(ms))
      .map((p) => [p.type, p.value]),
  );
  return `${parts.year}-${parts.month}-${parts.day} ${parts.hour}:${parts.minute}`;
}

const teamCode = (t: Team) => (t.abbr || t.name || "?").trim();

/** A square's numbers on one draw: "7-3" (5x5 boards: "1/6-3/8"), team across the top first. */
function pairOf(draw: NumberDraw, row: number, col: number): string {
  const x = draw.x[col] ?? [];
  const y = draw.y[row] ?? [];
  return x.length && y.length ? `${x.join("/")}-${y.join("/")}` : "";
}

/** The board's draws in game order, with a column title each: one ("*"), or one per quarter. */
function drawsOf(state: GameState): { key: string; title: string }[] {
  const { game } = state;
  if (!game.numbers) return [];
  const teams = `${teamCode(game.teamX)}-${teamCode(game.teamY)}`;
  if (game.numbers["*"]) return [{ key: "*", title: `Numbers (${teams})` }];
  return fixedPeriodsOf(game)
    .filter((p) => game.numbers?.[p.key])
    .map((p) => ({ key: p.key, title: `Numbers ${p.label} (${teams})` }));
}

/** The CSV, with a byte-order mark so spreadsheet apps read names (and emoji) as UTF-8. */
export function playersCsv(state: GameState, opts: CsvOptions = {}): string {
  const zone = zoneOf(opts.timeZone);
  const draws = drawsOf(state);
  const header = ["Player", "Squares", "Square list", ...draws.map((d) => d.title), `Joined (${zone})`];
  const rows = state.players.map((p) => {
    const mine = state.squares.filter((s) => s.playerId === p.id).sort((a, b) => a.row - b.row || a.col - b.col);
    const numbers = draws.map((d) => {
      const draw = state.game.numbers?.[d.key];
      return draw ? mine.map((s) => pairOf(draw, s.row, s.col)).join("; ") : "";
    });
    return [p.name, mine.length, mine.map((s) => `${s.row + 1}-${s.col + 1}`).join("; "), ...numbers, csvTime(p.joinedAt, zone)];
  });
  return `\uFEFF${[header, ...rows].map((r) => r.map(csvCell).join(",")).join("\r\n")}\r\n`;
}

/** "office-squares-players.csv". */
export function csvFilename(boardName: string): string {
  const slug = boardName
    .normalize("NFKD")
    .replace(/[^\w\s-]/g, "")
    .trim()
    .toLowerCase()
    .replace(/[\s_-]+/g, "-")
    .slice(0, 48)
    .replace(/^-+|-+$/g, "");
  return `${slug || "board"}-players.csv`;
}
