// Pure view-model helpers for the board screen: cell states, axis labels,
// tap rules, period cards, player stats and activity wording. No React, no IO,
// so the rules the grid follows are unit-tested (boardModel.test.ts).

import {
  SHARED_DRAW_KEY,
  everyScoreIndex,
  everyScorePeriod,
  hasScoreMoment,
  matchingPreset,
  momentsLabel,
  periodPhrase,
  PRESET_INFO,
  prizeFor,
  prizeRange,
  ruleFor,
  ruleForPeriodKey,
  rulesOf,
  unitOf,
} from "../../../shared/formats";
import {
  boardPeriods,
  cellKey,
  drawFor,
  fixedPeriodsOf,
  gridSize,
  liveCell,
  momentInPlay,
  periodInPlay,
  prizeTotals,
  reverseCell,
  squareAt,
  totalSquares,
  upcomingPeriod,
  winCounts,
  winningCell,
  type Cell,
  type PeriodResult,
} from "../../../shared/squares";
import type { Activity, AmountUnit, Game, GameState, GameStatus, MomentRule, NumberDraw, Player, Square } from "../../../shared/types";

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
  state: Pick<GameState, "game" | "players" | "squares" | "live" | "scores" | "manualWinners">;
  me: string;
  selection: Selection;
  results: PeriodResult[];
  /**
   * The square the score points at right now (see rightNow). Omitted: the live
   * score's square, if there is a game on. null: no square is "now".
   */
  now?: { cell: Cell; reverseCell: Cell | null } | null;
  /**
   * The draw the axes show. On fresh-numbers boards a period's winner only
   * shows under its own digits, so a trophy never sits where the visible
   * numbers say it can't be.
   */
  drawKey?: string;
}

/** Which draw decided a period (fresh numbers: its own; otherwise the shared one). */
export function drawKeyOf(game: Pick<Game, "numbers">, periodKey: string | null): string {
  return periodKey && game.numbers?.[periodKey] ? periodKey : SHARED_DRAW_KEY;
}

/** Every square of the board, row-major, with what the grid needs to draw it. */
export function buildCells({ state, me, selection, results, now: nowCell, drawKey }: CellInputs): CellView[][] {
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
  const fresh = state.game.format.freshNumbers && drawKey !== undefined;
  for (const r of results) {
    if (fresh && drawKeyOf(state.game, r.periodKey) !== drawKey) continue;
    addWin(r.cell, { periodKey: r.periodKey, label: r.label, reverse: false });
    addWin(r.reverseCell, { periodKey: r.periodKey, label: r.label, reverse: true });
  }
  const now = state.game.status === "final" ? null : nowCell !== undefined ? nowCell : liveCell(state);
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
    const k = periodInPlay(state, live.period);
    if (k && game.numbers[k]) return k;
  }
  const next = upcomingPeriod(state);
  if (next && game.numbers[next.key]) return next.key;
  return keys[keys.length - 1] ?? SHARED_DRAW_KEY;
}

/** Period tabs for the fresh-numbers switcher (only periods that have their own draw). */
export function drawTabs(game: Pick<Game, "format" | "periods" | "numbers">): { key: string; label: string }[] {
  if (!game.format.freshNumbers || !game.numbers) return [];
  return fixedPeriodsOf(game)
    .filter((p) => game.numbers?.[p.key])
    .map((p) => ({ key: p.key, label: p.label }));
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
  /** Squares this player already owns (picked give-backs still count). */
  mineCount: number;
}

/** Squares this player owns once the selection goes through (give-backs are sent first, then claims). */
export function mineAfter(mineCount: number, selection: Selection): number {
  return mineCount - selection.release.size + selection.claim.size;
}

export function decideTap({ status, cell, selection, maxPerPlayer, mineCount }: TapInput): TapOutcome {
  if (status !== "open") return { kind: "inspect" };
  // One more square than the selection ends with: a picked give-back makes room for a swap.
  const overLimit = maxPerPlayer > 0 && mineAfter(mineCount, selection) + 1 > maxPerPlayer;
  if (cell.mine) {
    if (!selection.release.has(cell.key)) return { kind: "select-release" };
    // Keeping it after all, with its replacement already picked, would go over.
    return overLimit ? { kind: "limit", max: maxPerPlayer } : { kind: "unselect-release" };
  }
  if (cell.ownerId) return { kind: "inspect" };
  if (selection.claim.has(cell.key)) return { kind: "unselect" };
  if (overLimit) return { kind: "limit", max: maxPerPlayer };
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
  // The latest recorded moment in game order (every-score entries and quarter-ends alike).
  const order = boardPeriods(game, scores);
  for (let i = order.length - 1; i >= 0; i--) {
    const s = scores.find((x) => x.periodKey === order[i].key);
    if (!s) continue;
    if (everyScoreIndex(order[i].key) !== null) return { scoreX: s.scoreX, scoreY: s.scoreY, detail: game.status === "final" ? "Final" : "Latest score" };
    return { scoreX: s.scoreX, scoreY: s.scoreY, detail: order[i].key === "final" ? "Final" : `End of ${order[i].label}` };
  }
  return null;
}

function clockLine(period: number, clock: string): string {
  const p = period > 4 ? "OT" : `Q${Math.max(1, period)}`;
  return clock ? `${p} ${clock}` : p;
}

// ---- Right now: who the score points at, and how close I am ----

export type Side = "x" | "y";

export interface ScoringPlay {
  team: Side;
  points: number;
}

/** Common football scoring plays, likeliest first: TD + kick, field goal, TD without the kick, TD + 2, safety. */
export const SCORING_PLAYS: readonly number[] = [7, 3, 6, 8, 2];

/**
 * Rough chance of each play by one team over the rest of a period. Only the
 * order of magnitude matters: two common scores beat one rare one (a TD then
 * a field goal is likelier than a safety).
 */
const PLAY_WEIGHT: Record<number, number> = { 7: 0.34, 3: 0.3, 6: 0.03, 8: 0.03, 2: 0.01 };
/** Two scores in what's left of a period are less likely than either alone. */
const SECOND_SCORE = 0.5;

/** "field goal", "touchdown"... for a play's points. */
export function playName(points: number): string {
  switch (points) {
    case 7:
      return "touchdown";
    case 3:
      return "field goal";
    case 6:
      return "touchdown (no kick)";
    case 8:
      return "touchdown + 2";
    case 2:
      return "safety";
    default:
      return `${points}-point score`;
  }
}

export interface ScorePath {
  /** Plays to get there, likeliest first; empty when the score is already on one of mine. */
  plays: ScoringPlay[];
  cell: Cell;
}

type ScorePair = { scoreX: number; scoreY: number };

function addPlays(score: ScorePair, plays: ScoringPlay[]): ScorePair {
  let { scoreX, scoreY } = score;
  for (const p of plays) {
    if (p.team === "x") scoreX += p.points;
    else scoreY += p.points;
  }
  return { scoreX, scoreY };
}

const SINGLE_PLAYS: ScoringPlay[] = SCORING_PLAYS.flatMap((points) => [
  { team: "x" as const, points },
  { team: "y" as const, points },
]);

const weightOf = (plays: ScoringPlay[]) =>
  plays.reduce((w, p, i) => w * (PLAY_WEIGHT[p.points] ?? 0.01) * (i > 0 ? SECOND_SCORE : 1), 1);

/**
 * The likeliest way, in at most `maxPlays` (2) common scoring plays, for the
 * score to land on one of `mine` (cell keys). null when none of my squares is
 * that close. `minPlays` 1 skips "already there" (every-score boards, where
 * the current square has already been decided).
 */
export function nearestPath(
  score: ScorePair,
  draw: NumberDraw,
  mine: ReadonlySet<string>,
  maxPlays = 2,
  minPlays = 0,
  reverse = false,
): ScorePath | null {
  if (mine.size === 0) return null;
  const cellAt = reverse ? reverseCell : winningCell;
  const hit = (plays: ScoringPlay[]): ScorePath | null => {
    const cell = cellAt(addPlays(score, plays), draw);
    return cell && mine.has(cellKey(cell.row, cell.col)) ? { plays, cell } : null;
  };
  const here = minPlays > 0 ? null : hit([]);
  if (here) return here;
  const options: ScoringPlay[][] = [];
  if (maxPlays >= 1) for (const p of SINGLE_PLAYS) options.push([p]);
  if (maxPlays >= 2) {
    for (let i = 0; i < SINGLE_PLAYS.length; i++) for (let j = i; j < SINGLE_PLAYS.length; j++) options.push([SINGLE_PLAYS[i], SINGLE_PLAYS[j]]);
  }
  let best: ScorePath | null = null;
  let bestWeight = 0;
  for (const plays of options) {
    const w = weightOf(plays);
    if (w <= bestWeight) continue;
    const found = hit(plays);
    if (found) {
      best = found;
      bestWeight = w;
    }
  }
  return best;
}

/** The likeliest single score that moves the square off `fromKey` to someone else, and who'd have it then. */
export function nextChange(
  score: ScorePair,
  draw: NumberDraw,
  fromKey: string,
  squares: Square[],
  me?: string,
  reverse = false,
): { play: ScoringPlay; cell: Cell; ownerId: string | null } | null {
  const cellAt = reverse ? reverseCell : winningCell;
  for (const play of SINGLE_PLAYS) {
    const cell = cellAt(addPlays(score, [play]), draw);
    if (!cell || cellKey(cell.row, cell.col) === fromKey) continue;
    const ownerId = squareAt(squares, cell.row, cell.col)?.playerId ?? null;
    if (me !== undefined && ownerId === me) continue;
    return { play, cell, ownerId };
  }
  return null;
}

export interface NowView {
  /** Real live game data; false = the last recorded score ("if nobody scores"). */
  live: boolean;
  periodKey: string | null;
  /** Period label ("Q3", "Half"), or "Next score" on every-score boards. */
  label: string;
  everyScore: boolean;
  scoreX: number;
  scoreY: number;
  /** Game clock when live ("Q3 8:41"). */
  detail: string | null;
  /** The draw that decides this period (fresh numbers: the period's own). */
  drawKey: string;
  cell: Cell;
  /** The cell's digits, e.g. { x: "7", y: "3" } ("1·6" on 5x5). */
  digits: { x: string; y: string };
  ownerId: string | null;
  mine: boolean;
  reverse: { cell: Cell; ownerId: string | null } | null;
  /** My closest way onto this period's square (null: no squares, or none within two scores). */
  path: ScorePath | null;
  /** When it's mine: the likeliest single score that would take it, and to whom. */
  threat: { play: ScoringPlay; ownerId: string | null } | null;
  /** Only the reverse square wins this moment: `cell` is the reverse square (and `reverse` is null). */
  reverseOnly: boolean;
  /** Display-only amount the square in play wins, and the board's unit. */
  amount: number | null;
  /**
   * What it can show: one amount, or lowest and highest when every score
   * change shows amounts by score type (the next score's kind isn't known yet).
   */
  range: { min: number; max: number } | null;
  unit: AmountUnit;
  /** Where the next common score lands (TD or field goal, either team), and whose square it is. */
  outcomes: { play: ScoringPlay; cell: Cell; ownerId: string | null }[];
  mineCount: number;
}

/** The four plays worth showing as "what if": a touchdown or a field goal by either team. */
const OUTCOME_PLAYS: ScoringPlay[] = [
  { team: "x", points: 7 },
  { team: "x", points: 3 },
  { team: "y", points: 7 },
  { team: "y", points: 3 },
];

/**
 * What a fan wants mid-game: which square the score points at for the period
 * in play, whose it is, and how close my squares are. Uses live data when the
 * game is on, else the last recorded score for the next undecided period
 * (0-0 before any score). null until numbers are drawn, and once it's over.
 */
export function rightNow(state: Pick<GameState, "game" | "squares" | "scores" | "manualWinners" | "live">, me: string): NowView | null {
  const { game, live, squares } = state;
  if (game.status !== "locked" || !game.numbers || live?.state === "post") return null;
  const rules = rulesOf(game.format);
  let periodKey: string | null = null;
  let rule: MomentRule | null;
  let score: ScorePair;
  let detail: string | null = null;
  const isLive = live?.state === "in";
  if (live && isLive) {
    // The fixed period in play, or the next score once those are decided (every-score boards: always).
    ({ periodKey, rule } = momentInPlay(state, live.period));
    score = { scoreX: live.scoreX, scoreY: live.scoreY };
    detail = live.detail || clockLine(live.period, live.clock);
  } else {
    const next = upcomingPeriod(state);
    if (next) periodKey = next.key;
    else if (!hasScoreMoment(rules)) return null;
    rule = periodKey ? ruleForPeriodKey(rules, periodKey) : ruleFor(rules, "score");
    const head = headlineScore(state);
    score = { scoreX: head?.scoreX ?? 0, scoreY: head?.scoreY ?? 0 };
  }
  const everyScore = periodKey === null;
  const reverseOnly = !!rule && !rule.square && !!rule.reverse;
  const drawKey = drawKeyOf(game, periodKey);
  const draw = drawFor(game, drawKey);
  if (!draw) return null;
  // When only the reverse square wins this moment, the square in play is the reverse one.
  const cellAt = reverseOnly ? reverseCell : winningCell;
  const cell = cellAt(score, draw);
  if (!cell) return null;
  const n = gridSize(game.format.boardSize);
  const labels = axisLabels(draw, n);
  const owner = (c: Cell) => squareAt(squares, c.row, c.col)?.playerId ?? null;
  const ownerId = owner(cell);
  const mineKeys = new Set(squares.filter((s) => s.playerId === me).map((s) => cellKey(s.row, s.col)));
  const mine = ownerId !== null && ownerId === me;
  const rev = rule?.reverse && !reverseOnly ? reverseCell(score, draw) : null;
  const label = everyScore ? "Next score" : (fixedPeriodsOf(game).find((p) => p.key === periodKey)?.label ?? "This period");
  // Every-score boards: the current square is already decided, so it's all about the next score.
  const change = mine && !everyScore ? nextChange(score, draw, cellKey(cell.row, cell.col), squares, me, reverseOnly) : null;
  const outcomes = OUTCOME_PLAYS.flatMap((play) => {
    const c = cellAt(addPlays(score, [play]), draw);
    return c ? [{ play, cell: c, ownerId: owner(c) }] : [];
  });
  return {
    live: isLive,
    periodKey,
    label,
    everyScore,
    scoreX: score.scoreX,
    scoreY: score.scoreY,
    detail,
    drawKey,
    cell,
    digits: { x: labels.x[cell.col], y: labels.y[cell.row] },
    ownerId,
    mine,
    reverse: rev ? { cell: rev, ownerId: owner(rev) } : null,
    path: everyScore ? nearestPath(score, draw, mineKeys, 2, 1, reverseOnly) : mine ? null : nearestPath(score, draw, mineKeys, 2, 0, reverseOnly),
    threat: change ? { play: change.play, ownerId: change.ownerId } : null,
    outcomes,
    mineCount: mineKeys.size,
    reverseOnly,
    amount: (reverseOnly ? rule?.reverse?.amount : rule?.square?.amount) ?? null,
    range: prizeRange(reverseOnly ? rule?.reverse : rule?.square),
    unit: unitOf(game.format),
  };
}

/**
 * The "Right now" card's line under the name, in the app's period wording:
 * live "Wins if it's 17–13 at the end of Q3", otherwise (the last recorded
 * score) "Wins at halftime if it stays 14–10". Mine reads "Yours …".
 */
export function nowSentence(
  now: Pick<NowView, "live" | "periodKey" | "label" | "scoreX" | "scoreY" | "mine" | "ownerId"> & Partial<Pick<NowView, "reverseOnly">>,
): string {
  const { moment } = periodPhrase(now.periodKey ?? "", now.label);
  const when = now.reverseOnly ? `${moment} (reverse)` : moment;
  const score = `${now.scoreX}–${now.scoreY}`;
  const verb = now.mine ? "Yours" : now.ownerId ? "Wins" : "Nobody wins";
  const line = now.live ? `${verb} if it's ${score} ${when}` : `${verb} ${when} if it stays ${score}`;
  return line.replace(/\s+/g, " ").trim();
}

// ---- Period cards (results strip) ----

export type PeriodCardStatus = "done" | "live" | "next" | "later";

export interface PeriodCard {
  key: string;
  label: string;
  status: PeriodCardStatus;
  result: PeriodResult | null;
  /** The square's note (older boards: the period's note). */
  prize: string | null;
  /** The reverse square's note. */
  reversePrize: string | null;
  /** Which squares win this moment. */
  awardsSquare: boolean;
  awardsReverse: boolean;
  /** Display-only amounts (in the board's unit). */
  amount: number | null;
  reverseAmount: number | null;
  /**
   * What a card still to come can show: lowest and highest amount (they
   * differ when every score change shows amounts by score type). A decided
   * card's is its amount.
   */
  range: { min: number; max: number } | null;
  reverseRange: { min: number; max: number } | null;
}

/** A card's prize facts, from its result or (still to come) its rule. */
function cardPrizes(game: Pick<Game, "format" | "prizes">, key: string, result: PeriodResult | null) {
  const one = (n: number | null) => (n ? { min: n, max: n } : null);
  if (result) {
    const { prize, reversePrize, awardsSquare, awardsReverse, amount, reverseAmount } = result;
    return { prize, reversePrize, awardsSquare, awardsReverse, amount, reverseAmount, range: one(amount), reverseRange: one(reverseAmount) };
  }
  const rule = ruleForPeriodKey(rulesOf(game.format), key);
  const legacy = !game.format.rules?.length;
  return {
    prize: rule?.square ? (legacy ? prizeFor(game.prizes, key) : rule.square.note || null) : null,
    reversePrize: rule?.reverse?.note || null,
    awardsSquare: !!rule?.square,
    awardsReverse: !!rule?.reverse,
    amount: rule?.square?.amount ?? null,
    reverseAmount: rule?.reverse?.amount ?? null,
    range: prizeRange(rule?.square),
    reverseRange: prizeRange(rule?.reverse),
  };
}

export function periodCards(state: Pick<GameState, "game" | "scores" | "manualWinners" | "live">, results: PeriodResult[]): PeriodCard[] {
  const { game, live } = state;
  const byKey = new Map(results.map((r) => [r.periodKey, r]));
  const rules = rulesOf(game.format);
  const card = (key: string, label: string, status: PeriodCardStatus, result: PeriodResult | null): PeriodCard => ({
    key,
    label,
    status,
    result,
    ...cardPrizes(game, key, result),
  });
  const livePeriod = live?.state === "in" && game.status === "locked" ? periodInPlay(state, live.period) : null;
  const fixed = fixedPeriodsOf(game);
  if (fixed.length === 0) {
    const cards: PeriodCard[] = results.map((r) => card(r.periodKey, r.label, "done", r));
    if (game.status !== "final") {
      const n = results.reduce((m, r) => Math.max(m, everyScoreIndex(r.periodKey) ?? 0), 0) + 1;
      const p = everyScorePeriod(n);
      cards.push(card(p.key, n === 1 ? "First score" : "Next score", live?.state === "in" ? "live" : "next", null));
    }
    return cards;
  }
  // Fixed periods, with every-score entries in game order on boards that award both.
  let nextAssigned = false;
  const cards = boardPeriods(game, state.scores).map((p) => {
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
    return card(p.key, p.label, status, result);
  });
  // Entries with no card yet (a host pick whose score was removed) are left out, as before.
  if (hasScoreMoment(rules) && game.status !== "final") {
    const n = state.scores.reduce((m, s) => Math.max(m, everyScoreIndex(s.periodKey) ?? 0), 0) + 1;
    const p = everyScorePeriod(n);
    const at = cards.findIndex((c) => c.status !== "done" && everyScoreIndex(c.key) === null);
    const next = card(p.key, n === 1 ? "First score" : "Next score", "later", null);
    if (at === -1) cards.push(next);
    else cards.splice(at, 0, next);
  }
  return cards;
}

// ---- Players ----

export interface PlayerRow {
  player: Player;
  squares: number;
  /** Their squares at the board's square price (display-only), when one is set. */
  squaresValue: number | null;
  /** Display-only prize amounts won so far, when the board has amounts. */
  prizeTotal: number | null;
  wins: number;
  /** Periods won, in board order ("Q1", "Half"); a reverse-only win reads "Q1 rev". */
  winLabels: string[];
  isMe: boolean;
}

/**
 * Whether the host can take this player off the board (freeing their squares):
 * only while squares are being picked (the API answers 409 once locked), never
 * the host's own player, and never this device's own row.
 */
export function canRemovePlayer(game: Pick<Game, "status" | "hostPlayerId">, playerId: string, me: string): boolean {
  return (game.status === "draft" || game.status === "open") && playerId !== game.hostPlayerId && playerId !== me;
}

/** Who's in: wins first, then squares, then who joined first. Players on the board without a record are skipped. */
export function playerRows(
  state: Pick<GameState, "players" | "squares"> & { game?: Pick<Game, "format"> },
  results: PeriodResult[],
  me: string,
): PlayerRow[] {
  const counts = new Map<string, number>();
  for (const s of state.squares) counts.set(s.playerId, (counts.get(s.playerId) ?? 0) + 1);
  const wins = winCounts(results);
  const totals = prizeTotals(results);
  const price = state.game?.format.squarePrice ?? null;
  const labels = new Map<string, string[]>();
  const addLabel = (id: string | null, label: string) => {
    if (!id) return;
    const list = labels.get(id) ?? [];
    list.push(label);
    labels.set(id, list);
  };
  for (const r of results) {
    addLabel(r.winnerPlayerId, r.label);
    // Both squares of a period (regular and reverse) read once.
    if (r.reverseWinnerPlayerId && r.reverseWinnerPlayerId !== r.winnerPlayerId) addLabel(r.reverseWinnerPlayerId, `${r.label} rev`);
  }
  return state.players
    .map((player) => ({
      player,
      squares: counts.get(player.id) ?? 0,
      squaresValue: price ? Math.round(price * (counts.get(player.id) ?? 0) * 100) / 100 : null,
      prizeTotal: totals[player.id] ?? null,
      wins: wins[player.id] ?? 0,
      winLabels: labels.get(player.id) ?? [],
      isMe: player.id === me,
    }))
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

/** Events the game itself makes (not a player's own move): shown with a fixed glyph, never an avatar. */
export function isSystemActivity(type: Activity["type"]): boolean {
  return type === "locked" || type === "score" || type === "winner" || type === "final" || type === "created";
}

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
      return `${who} gave back ${squaresWord(count)}`;
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
    case "rules":
      return d.scoring ? `${who} changed the rules` : `${who} updated the prizes`;
    default:
      return "Board updated";
  }
}

// ---- Misc ----

export function claimedCount(state: Pick<GameState, "game" | "squares">): { claimed: number; total: number } {
  return { claimed: state.squares.length, total: totalSquares(state.game.format.boardSize) };
}

export function formatLabel(game: Pick<Game, "format">): string {
  const rules = rulesOf(game.format);
  const exact = matchingPreset(rules);
  return exact ? PRESET_INFO[exact.preset].short : momentsLabel(rules);
}
