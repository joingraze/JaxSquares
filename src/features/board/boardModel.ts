// Pure view-model helpers for the board screen: cell states, axis labels,
// tap rules, period cards, player stats and activity wording. No React, no IO,
// so the rules the grid follows are unit-tested (boardModel.test.ts).

import { PRESET_INFO, SHARED_DRAW_KEY, everyScoreIndex, everyScorePeriod, prizeFor } from "../../../shared/formats";
import {
  boardPeriods,
  cellKey,
  drawFor,
  gridSize,
  liveCell,
  periodKeyForLive,
  totalSquares,
  upcomingPeriod,
  winCounts,
  type Cell,
  type PeriodResult,
} from "../../../shared/squares";
import type { Activity, Game, GameState, GameStatus, NumberDraw, Player, Square } from "../../../shared/types";

/** Matches docs/testids.md: `data-state` on every board square. */
export type CellState = "empty" | "mine" | "taken" | "selected" | "winner";

/** Cells picked in the action bar, keyed by cellKey ("row,col"). */
export interface Selection {
  claim: ReadonlySet<string>;
  release: ReadonlySet<string>;
}

export const EMPTY_SELECTION: Selection = { claim: new Set(), release: new Set() };

export function parseKey(key: string): Cell {
  const [row, col] = key.split(",").map(Number);
  return { row, col };
}

export function selectionCount(sel: Selection): number {
  return sel.claim.size + sel.release.size;
}

/** Sorted cells for an API call (stable order keeps optimistic patches predictable). */
export function cellsOf(keys: ReadonlySet<string>): Cell[] {
  return [...keys].map(parseKey).sort((a, b) => a.row - b.row || a.col - b.col);
}

// ---- Phase ----

/** What the scoreboard leads with. "live" = the real game is in progress. */
export type BoardPhase = "draft" | "open" | "locked" | "live" | "final";

export function boardPhase(state: Pick<GameState, "game" | "live">): BoardPhase {
  const { game, live } = state;
  if (game.status === "draft" || game.status === "open") return game.status;
  if (game.status === "final" || live?.state === "post") return "final";
  if (live?.state === "in") return "live";
  return "locked";
}

// ---- Cells ----

export interface CellWin {
  periodKey: string;
  label: string;
  reverse: boolean;
}

export interface CellView {
  row: number;
  col: number;
  key: string;
  state: CellState;
  owner: Player | null;
  /** Public id of the owner (also set when the player record is missing). */
  ownerId: string | null;
  mine: boolean;
  selected: "claim" | "release" | null;
  wins: CellWin[];
  /** Where the live score points right now ("if it ended now"). */
  live: boolean;
  /** The reverse square of the live score (reverse boards). */
  liveReverse: boolean;
}

export interface CellInputs {
  state: Pick<GameState, "game" | "players" | "squares" | "live">;
  me: string;
  selection: Selection;
  results: PeriodResult[];
}

/** Every square of the board, row-major, with what the grid needs to draw it. */
export function buildCells({ state, me, selection, results }: CellInputs): CellView[][] {
  const n = gridSize(state.game.format.boardSize);
  const players = new Map(state.players.map((p) => [p.id, p]));
  const owners = new Map<string, Square>(state.squares.map((s) => [cellKey(s.row, s.col), s]));
  const wins = new Map<string, CellWin[]>();
  const addWin = (cell: Cell | null, win: CellWin) => {
    if (!cell) return;
    const k = cellKey(cell.row, cell.col);
    const list = wins.get(k) ?? [];
    if (!list.some((w) => w.periodKey === win.periodKey)) list.push(win);
    wins.set(k, list);
  };
  for (const r of results) {
    addWin(r.cell, { periodKey: r.periodKey, label: r.label, reverse: false });
    addWin(r.reverseCell, { periodKey: r.periodKey, label: r.label, reverse: true });
  }
  const now = state.game.status === "final" ? null : liveCell(state);
  const liveKey = now ? cellKey(now.cell.row, now.cell.col) : null;
  const liveRevKey = now?.reverseCell ? cellKey(now.reverseCell.row, now.reverseCell.col) : null;

  const rows: CellView[][] = [];
  for (let row = 0; row < n; row++) {
    const line: CellView[] = [];
    for (let col = 0; col < n; col++) {
      const key = cellKey(row, col);
      const sq = owners.get(key);
      const ownerId = sq?.playerId ?? null;
      const mine = ownerId !== null && ownerId === me;
      const selected = selection.claim.has(key) && !sq ? "claim" : selection.release.has(key) && mine ? "release" : null;
      const cellWins = wins.get(key) ?? [];
      const st: CellState = selected ? "selected" : cellWins.length ? "winner" : mine ? "mine" : sq ? "taken" : "empty";
      line.push({
        row,
        col,
        key,
        state: st,
        owner: ownerId ? (players.get(ownerId) ?? null) : null,
        ownerId,
        mine,
        selected,
        wins: cellWins,
        live: key === liveKey,
        liveReverse: key === liveRevKey && key !== liveKey,
      });
    }
    rows.push(line);
  }
  return rows;
}

// ---- Axes ----

/** Digits along the top (x, team X) and side (y, team Y); "?" until numbers are drawn. */
export function axisLabels(draw: NumberDraw | null, n: number): { x: string[]; y: string[]; drawn: boolean } {
  if (!draw) {
    const blank = Array.from({ length: n }, () => "?");
    return { x: blank, y: [...blank], drawn: false };
  }
  const fmt = (digits: number[] | undefined) => (digits && digits.length ? digits.join("·") : "?");
  return {
    x: Array.from({ length: n }, (_, i) => fmt(draw.x[i])),
    y: Array.from({ length: n }, (_, i) => fmt(draw.y[i])),
    drawn: true,
  };
}

/** Which draw the axes show by default: the period in play, else the next one, else the last. */
export function defaultDrawKey(state: Pick<GameState, "game" | "squares" | "scores" | "manualWinners" | "live">): string {
  const { game, live } = state;
  if (!game.format.freshNumbers || !game.numbers) return SHARED_DRAW_KEY;
  const keys = Object.keys(game.numbers).filter((k) => k !== SHARED_DRAW_KEY);
  if (live && live.state === "in") {
    const k = periodKeyForLive(game.format, live.period);
    if (k && game.numbers[k]) return k;
  }
  const next = upcomingPeriod(state);
  if (next && game.numbers[next.key]) return next.key;
  return keys[keys.length - 1] ?? SHARED_DRAW_KEY;
}

/** Period tabs for the fresh-numbers switcher (only periods that have their own draw). */
export function drawTabs(game: Pick<Game, "format" | "periods" | "numbers">): { key: string; label: string }[] {
  if (!game.format.freshNumbers || !game.numbers) return [];
  const periods = game.periods.length ? game.periods : boardPeriods({ format: game.format, periods: [] }, []);
  return periods.filter((p) => game.numbers?.[p.key]).map((p) => ({ key: p.key, label: p.label }));
}

// ---- Tapping a square ----

export type TapOutcome =
  | { kind: "select" }
  | { kind: "unselect" }
  | { kind: "select-release" }
  | { kind: "unselect-release" }
  /** Over the host's per-player limit. */
  | { kind: "limit"; max: number }
  /** Not claimable (someone else's, or squares are locked): show who has it. */
  | { kind: "inspect" };

export interface TapInput {
  status: GameStatus;
  cell: Pick<CellView, "key" | "ownerId" | "mine">;
  selection: Selection;
  maxPerPlayer: number;
  /** Squares this player already owns. */
  mineCount: number;
}

export function decideTap({ status, cell, selection, maxPerPlayer, mineCount }: TapInput): TapOutcome {
  if (status !== "open") return { kind: "inspect" };
  if (cell.mine) return selection.release.has(cell.key) ? { kind: "unselect-release" } : { kind: "select-release" };
  if (cell.ownerId) return { kind: "inspect" };
  if (selection.claim.has(cell.key)) return { kind: "unselect" };
  if (maxPerPlayer > 0 && mineCount + selection.claim.size + 1 > maxPerPlayer) return { kind: "limit", max: maxPerPlayer };
  return { kind: "select" };
}

export function applyTap(sel: Selection, key: string, outcome: TapOutcome): Selection {
  const claim = new Set(sel.claim);
  const release = new Set(sel.release);
  if (outcome.kind === "select") claim.add(key);
  else if (outcome.kind === "unselect") claim.delete(key);
  else if (outcome.kind === "select-release") release.add(key);
  else if (outcome.kind === "unselect-release") release.delete(key);
  else return sel;
  return { claim, release };
}

/** Drop selected cells that are no longer valid (someone else claimed them, or squares locked). */
export function pruneSelection(sel: Selection, state: Pick<GameState, "game" | "squares">, me: string): Selection {
  if (sel.claim.size === 0 && sel.release.size === 0) return sel;
  if (state.game.status !== "open") return EMPTY_SELECTION;
  const owner = new Map(state.squares.map((s) => [cellKey(s.row, s.col), s.playerId]));
  const claim = [...sel.claim].filter((k) => !owner.has(k));
  const release = [...sel.release].filter((k) => owner.get(k) === me);
  if (claim.length === sel.claim.size && release.length === sel.release.size) return sel;
  return { claim: new Set(claim), release: new Set(release) };
}

/** Picked squares that someone else has claimed since (my own optimistic claims don't count). */
export function lostToOthers(sel: Selection, state: Pick<GameState, "squares">, me: string): number {
  if (sel.claim.size === 0) return 0;
  const owner = new Map(state.squares.map((s) => [cellKey(s.row, s.col), s.playerId]));
  let n = 0;
  for (const k of sel.claim) {
    const o = owner.get(k);
    if (o && o !== me) n++;
  }
  return n;
}

/** Squares this player may still pick (null when unlimited). */
export function squaresLeftFor(maxPerPlayer: number, mineCount: number): number | null {
  return maxPerPlayer > 0 ? Math.max(0, maxPerPlayer - mineCount) : null;
}

// ---- Scoreboard ----

export interface Headline {
  scoreX: number;
  scoreY: number;
  /** "Q3 4:12", "Half", "Final"... */
  detail: string;
}

/** The score the scoreboard shows: live data when there is a game on, else the latest recorded score. */
export function headlineScore(state: Pick<GameState, "game" | "scores" | "live">): Headline | null {
  const { live, game, scores } = state;
  if (live && live.state !== "pre") {
    return { scoreX: live.scoreX, scoreY: live.scoreY, detail: live.state === "post" ? "Final" : live.detail || clockLine(live.period, live.clock) };
  }
  if (scores.length === 0) return null;
  if (game.format.periods === "every-score") {
    let best = scores[0];
    for (const s of scores) if ((everyScoreIndex(s.periodKey) ?? 0) > (everyScoreIndex(best.periodKey) ?? 0)) best = s;
    return { scoreX: best.scoreX, scoreY: best.scoreY, detail: game.status === "final" ? "Final" : "Latest score" };
  }
  const order = boardPeriods(game, scores);
  for (let i = order.length - 1; i >= 0; i--) {
    const s = scores.find((x) => x.periodKey === order[i].key);
    if (s) return { scoreX: s.scoreX, scoreY: s.scoreY, detail: order[i].key === "final" ? "Final" : `End of ${order[i].label}` };
  }
  return null;
}

function clockLine(period: number, clock: string): string {
  const p = period > 4 ? "OT" : `Q${Math.max(1, period)}`;
  return clock ? `${p} ${clock}` : p;
}

// ---- Period cards (results strip) ----

export type PeriodCardStatus = "done" | "live" | "next" | "later";

export interface PeriodCard {
  key: string;
  label: string;
  status: PeriodCardStatus;
  result: PeriodResult | null;
  prize: string | null;
}

export function periodCards(state: Pick<GameState, "game" | "scores" | "manualWinners" | "live">, results: PeriodResult[]): PeriodCard[] {
  const { game, live } = state;
  const byKey = new Map(results.map((r) => [r.periodKey, r]));
  if (game.format.periods === "every-score") {
    const cards: PeriodCard[] = results.map((r) => ({ key: r.periodKey, label: r.label, status: "done", result: r, prize: r.prize }));
    if (game.status !== "final") {
      const n = results.reduce((m, r) => Math.max(m, everyScoreIndex(r.periodKey) ?? 0), 0) + 1;
      const p = everyScorePeriod(n);
      cards.push({
        key: p.key,
        label: n === 1 ? "First score" : "Next score",
        status: live?.state === "in" ? "live" : "next",
        result: null,
        prize: prizeFor(game.prizes, p.key),
      });
    }
    return cards;
  }
  const livePeriod = live?.state === "in" && game.status === "locked" ? periodKeyForLive(game.format, live.period) : null;
  let nextAssigned = false;
  return boardPeriods(game, state.scores).map((p) => {
    const result = byKey.get(p.key) ?? null;
    let status: PeriodCardStatus = "later";
    if (result) status = "done";
    else if (p.key === livePeriod) {
      status = "live";
      nextAssigned = true;
    } else if (!nextAssigned && game.status !== "final") {
      status = "next";
      nextAssigned = true;
    }
    return { key: p.key, label: p.label, status, result, prize: prizeFor(game.prizes, p.key) };
  });
}

// ---- Players ----

export interface PlayerRow {
  player: Player;
  squares: number;
  wins: number;
  isMe: boolean;
}

/** Who's in: wins first, then squares, then who joined first. Players on the board without a record are skipped. */
export function playerRows(state: Pick<GameState, "players" | "squares">, results: PeriodResult[], me: string): PlayerRow[] {
  const counts = new Map<string, number>();
  for (const s of state.squares) counts.set(s.playerId, (counts.get(s.playerId) ?? 0) + 1);
  const wins = winCounts(results);
  return state.players
    .map((player) => ({ player, squares: counts.get(player.id) ?? 0, wins: wins[player.id] ?? 0, isMe: player.id === me }))
    .sort((a, b) => b.wins - a.wins || b.squares - a.squares || a.player.joinedAt - b.player.joinedAt);
}

// ---- My wins ----

/** Stable ids for each of my wins ("q1", "q1:reverse") so a celebration fires once per win. */
export function myWinIds(results: PeriodResult[], me: string): string[] {
  const out: string[] = [];
  for (const r of results) {
    if (r.winnerPlayerId === me) out.push(r.periodKey);
    if (r.reverseWinnerPlayerId === me && r.winnerPlayerId !== me) out.push(`${r.periodKey}:reverse`);
  }
  return out;
}

/** My squares with their numbers for a draw, e.g. { x: "7", y: "3" }. */
export function myNumbers(
  state: Pick<GameState, "game" | "squares">,
  me: string,
  drawKey: string,
): { row: number; col: number; x: string; y: string }[] {
  const draw = drawFor(state.game, drawKey);
  if (!draw) return [];
  const labels = axisLabels(draw, gridSize(state.game.format.boardSize));
  return state.squares
    .filter((s) => s.playerId === me)
    .sort((a, b) => a.row - b.row || a.col - b.col)
    .map((s) => ({ row: s.row, col: s.col, x: labels.x[s.col], y: labels.y[s.row] }));
}

// ---- Activity wording (fallback until describeActivity covers a type) ----

function nameOf(state: Pick<GameState, "players">, id: string | null, me: string): string {
  if (!id) return "Someone";
  if (id === me) return "You";
  return state.players.find((p) => p.id === id)?.name ?? "Someone";
}

function squaresWord(n: number): string {
  return n === 1 ? "a square" : `${n} squares`;
}

/** Plain feed line for any activity, from this device's point of view. */
export function fallbackActivityText(a: Activity, state: Pick<GameState, "game" | "players">, me: string): string {
  const who = nameOf(state, a.actor, me);
  const d = a.data as Record<string, unknown>;
  const count = typeof d.count === "number" ? d.count : 1;
  const { teamX, teamY } = state.game;
  switch (a.type) {
    case "created":
      return `${who} opened the board`;
    case "joined":
      return a.actor === me ? "You joined the board" : `${typeof d.name === "string" && d.name ? d.name : who} joined`;
    case "claimed":
      return `${who} grabbed ${squaresWord(count)}`;
    case "released":
      return `${who} let go of ${squaresWord(count)}`;
    case "locked":
      return d.auto ? "Kickoff! Numbers are locked in" : "Numbers drawn. Good luck!";
    case "score": {
      const label = typeof d.label === "string" ? d.label : "Score";
      return `${label}: ${teamX.abbr || teamX.name} ${Number(d.scoreX) || 0} – ${teamY.abbr || teamY.name} ${Number(d.scoreY) || 0}`;
    }
    case "winner": {
      const label = typeof d.label === "string" ? d.label : "This period";
      const ids = Array.isArray(d.playerIds) ? d.playerIds.filter((x): x is string => typeof x === "string") : [];
      if (ids.length === 0) return `${label}: the winning square was empty`;
      const names = ids.map((id) => nameOf(state, id, me));
      const joined = names.length > 1 ? `${names.slice(0, -1).join(", ")} & ${names[names.length - 1]}` : names[0];
      return `${label}: ${joined} ${names.length === 1 && names[0] === "You" ? "won!" : names.length > 1 ? "win" : "wins"}`;
    }
    case "final":
      return "That's the final whistle";
    default:
      return "Board updated";
  }
}

// ---- Misc ----

export function claimedCount(state: Pick<GameState, "game" | "squares">): { claimed: number; total: number } {
  return { claimed: state.squares.length, total: totalSquares(state.game.format.boardSize) };
}

export function formatLabel(game: Pick<Game, "format">): string {
  return PRESET_INFO[game.format.periods].short;
}
