// Pure squares logic: number drawing, winning cells, per-period results and
// dashboard helpers. No I/O or framework code, so the Worker and the client share
// it and it is unit-tested in isolation.

import {
  SHARED_DRAW_KEY,
  drawKeys,
  everyScoreIndex,
  everyScorePeriod,
  fixedPeriods,
  hasScoreMoment,
  prizeAmount,
  prizeFor,
  ruleFor,
  ruleForPeriodKey,
  rulesOf,
} from "./formats";
import type {
  BoardSize,
  Game,
  GameFormat,
  GameState,
  LiveStatus,
  LiveUpdate,
  MomentRule,
  NumberDraw,
  Period,
  Score,
  ScoreKind,
  Square,
} from "./types";

export interface Cell {
  row: number;
  col: number;
}

/** Classic grid dimension. Prefer gridSize(boardSize); kept for older callers. */
export const GRID_SIZE = 10;

/** Rows (= columns) on a board: 10 for 100 squares, 5 for 25. */
export function gridSize(boardSize: BoardSize): number {
  return boardSize === 25 ? 5 : 10;
}

export function totalSquares(boardSize: BoardSize): number {
  const n = gridSize(boardSize);
  return n * n;
}

/**
 * Most players one board takes, the host included. Every open board carries
 * every player in each state it sends, so this keeps that small; joining past
 * it is refused (409) until the host removes someone.
 */
export const MAX_PLAYERS = 200;

/** Stable string key for a grid coordinate, e.g. "1,4". */
export const cellKey = (row: number, col: number): string => `${row},${col}`;

export function isValidCell(boardSize: BoardSize, row: number, col: number): boolean {
  const n = gridSize(boardSize);
  return Number.isInteger(row) && Number.isInteger(col) && row >= 0 && col >= 0 && row < n && col < n;
}

export function lastDigit(n: number): number {
  return ((Math.trunc(n) % 10) + 10) % 10;
}

/** Uniform [0, 1) from the platform CSPRNG (Workers, browsers and Node 22 all expose it). */
export function secureRandom(): number {
  return crypto.getRandomValues(new Uint32Array(1))[0] / 0x1_0000_0000;
}

/** Fisher–Yates shuffle into a new array. */
export function shuffle<T>(items: readonly T[], rng: () => number = secureRandom): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/** A shuffled permutation of 0..9. */
export function shuffledDigits(rng: () => number = secureRandom): number[] {
  return shuffle([0, 1, 2, 3, 4, 5, 6, 7, 8, 9], rng);
}

function drawAxis(perCell: number, rng: () => number): number[][] {
  const digits = shuffledDigits(rng);
  const out: number[][] = [];
  for (let i = 0; i < digits.length; i += perCell) out.push(digits.slice(i, i + perCell));
  return out;
}

/** One draw: every digit 0-9 appears exactly once per axis (pairs on 5x5 boards). */
export function drawOne(boardSize: BoardSize, rng: () => number = secureRandom): NumberDraw {
  const perCell = boardSize === 25 ? 2 : 1;
  return { x: drawAxis(perCell, rng), y: drawAxis(perCell, rng) };
}

/** All draws for a board being locked: one under "*", or one per quarter with fresh numbers. */
export function drawNumbers(format: GameFormat, rng: () => number = secureRandom): Record<string, NumberDraw> {
  const out: Record<string, NumberDraw> = {};
  for (const key of drawKeys(format)) out[key] = drawOne(format.boardSize, rng);
  return out;
}

/** The draw that decides a period (per-quarter draw when present, else the shared one). */
export function drawFor(game: Pick<Game, "numbers">, periodKey: string): NumberDraw | null {
  if (!game.numbers) return null;
  return game.numbers[periodKey] ?? game.numbers[SHARED_DRAW_KEY] ?? null;
}

/**
 * The square a score lands on: last digit of each team's score, mapped to the
 * column (team X) / row (team Y) whose digit list contains it.
 */
export function winningCell(score: Pick<Score, "scoreX" | "scoreY">, draw: NumberDraw): Cell | null {
  const xd = lastDigit(score.scoreX);
  const yd = lastDigit(score.scoreY);
  const col = draw.x.findIndex((digits) => digits.includes(xd));
  const row = draw.y.findIndex((digits) => digits.includes(yd));
  return col === -1 || row === -1 ? null : { row, col };
}

/**
 * The "reverse" square: the two digits swapped. It can be the same square as
 * the regular winner (e.g. 7-7, or on 5x5 when both digits share a pair); that
 * square then takes both.
 */
export function reverseCell(score: Pick<Score, "scoreX" | "scoreY">, draw: NumberDraw): Cell | null {
  return winningCell({ scoreX: score.scoreY, scoreY: score.scoreX }, draw);
}

/** Look up the square (if any) at a grid coordinate. */
export function squareAt(squares: Square[], row: number, col: number): Square | undefined {
  return squares.find((s) => s.row === row && s.col === col);
}

/** Squares owned by this player (public id). */
export function countClaimedBy(squares: Square[], playerId: string): number {
  return squares.reduce((n, s) => (s.playerId === playerId ? n + 1 : n), 0);
}

export function squaresLeft(state: Pick<GameState, "game" | "squares">): number {
  return Math.max(0, totalSquares(state.game.format.boardSize) - state.squares.length);
}

export function isBoardFull(state: Pick<GameState, "game" | "squares">): boolean {
  return squaresLeft(state) === 0;
}

// ---- Periods & results ----

/**
 * The fixed periods a board awards (Q1 / Half / Q3 / Final), from its rules.
 * A board made before rules existed keeps the periods it stored.
 */
export function fixedPeriodsOf(game: Pick<Game, "format" | "periods">): Period[] {
  if (!game.format.rules?.length && game.periods.length > 0) return game.periods;
  return fixedPeriods(rulesOf(game.format));
}

/** Every-score entries (s1..sN) for these keys, in order, labelled from their score. */
function entryPeriods(keys: Iterable<string>, scoreBy: Map<string, Score>): Period[] {
  const seen = new Set<string>();
  for (const k of keys) if (everyScoreIndex(k) !== null) seen.add(k);
  return [...seen]
    .sort((a, b) => (everyScoreIndex(a) ?? 0) - (everyScoreIndex(b) ?? 0))
    .map((key) => ({ key, label: scoreBy.get(key)?.label || everyScorePeriod(everyScoreIndex(key) ?? 0).label }));
}

/**
 * Fixed periods and score entries in the order they happened. Scores only go
 * up in a game, so a recorded quarter-end goes right after the run of entries
 * whose scores are both at or below it. A fixed period with no score yet sits
 * before a later recorded one, else after every entry (it's still to come).
 */
function mergePeriods(fixed: Period[], entries: Period[], scoreBy: Map<string, Score>): Period[] {
  if (entries.length === 0) return fixed;
  if (fixed.length === 0) return entries;
  const out: Period[] = [];
  const later: Period[] = [];
  let i = 0;
  fixed.forEach((f, idx) => {
    const s = scoreBy.get(f.key);
    if (!s) {
      if (fixed.slice(idx + 1).some((g) => scoreBy.has(g.key))) out.push(f);
      else later.push(f);
      return;
    }
    while (i < entries.length) {
      const e = scoreBy.get(entries[i].key);
      if (e && (e.scoreX > s.scoreX || e.scoreY > s.scoreY)) break;
      out.push(entries[i++]);
    }
    out.push(f);
  });
  return [...out, ...entries.slice(i), ...later];
}

/**
 * Periods shown on a board: its fixed ones (from the rules), plus one per
 * recorded score entry (s1..sN) when every score wins, in game order.
 */
export function boardPeriods(game: Pick<Game, "format" | "periods">, scores: Score[]): Period[] {
  const fixed = fixedPeriodsOf(game);
  if (!hasScoreMoment(rulesOf(game.format))) return fixed;
  const scoreBy = new Map(scores.map((s) => [s.periodKey, s]));
  return mergePeriods(fixed, entryPeriods(scoreBy.keys(), scoreBy), scoreBy);
}

// ---- Kinds of score (every-score entries) ----

/** What one every-score entry was: the kind of score, which team scored, and how many points. */
export interface ScorePlay {
  kind: ScoreKind;
  /** The team whose score went up. */
  team: "x" | "y";
  /** How many points it went up by (tells an extra point from a 2-point try). */
  points: number;
}

type ScorePoint = Pick<Score, "scoreX" | "scoreY">;

/**
 * The play that took the score from `prev` (0-0 before the first entry) to
 * `cur`, given the play that made `prev`. Only one team's score may go up:
 * 6 = touchdown; 3 = field goal; 1 = conversion; 2 = conversion right after
 * that team's touchdown (a 6-point entry), else a safety; 7 or 8 = a
 * touchdown and its conversion landing together. Anything else (both teams
 * changed, a score went down, an odd jump) is null: it shows the default amount.
 */
export function scorePlayBetween(prev: ScorePoint | null, cur: ScorePoint, prevPlay: ScorePlay | null = null): ScorePlay | null {
  const dx = cur.scoreX - (prev?.scoreX ?? 0);
  const dy = cur.scoreY - (prev?.scoreY ?? 0);
  if (dx < 0 || dy < 0 || (dx > 0) === (dy > 0)) return null;
  const team = dx > 0 ? "x" : "y";
  const points = dx > 0 ? dx : dy;
  switch (points) {
    case 6:
    case 7:
    case 8:
      return { kind: "touchdown", team, points };
    case 3:
      return { kind: "fieldGoal", team, points };
    case 1:
      return { kind: "conversion", team, points };
    case 2: {
      const afterTouchdown = prevPlay?.kind === "touchdown" && prevPlay.points === 6 && prevPlay.team === team;
      return { kind: afterTouchdown ? "conversion" : "safety", team, points };
    }
    default:
      return null;
  }
}

/** Every-score entries in order (by index), whatever order they're stored in. */
function orderedEntries<T extends Pick<Score, "periodKey">>(scores: readonly T[]): T[] {
  return scores
    .filter((s) => everyScoreIndex(s.periodKey) !== null)
    .sort((a, b) => (everyScoreIndex(a.periodKey) ?? 0) - (everyScoreIndex(b.periodKey) ?? 0));
}

/**
 * The play behind each every-score entry (s1..sN), keyed by period key: each
 * entry against the one before it (0-0 before the first), see
 * scorePlayBetween. Derived on read from the ordered entries, never stored,
 * so a host correction or an overturned score re-derives what follows.
 */
export function entryPlays(scores: readonly Pick<Score, "periodKey" | "scoreX" | "scoreY">[]): Map<string, ScorePlay | null> {
  const out = new Map<string, ScorePlay | null>();
  let prev: ScorePoint | null = null;
  let prevPlay: ScorePlay | null = null;
  for (const e of orderedEntries(scores)) {
    const play = scorePlayBetween(prev, e, prevPlay);
    out.set(e.periodKey, play);
    prev = e;
    prevPlay = play;
  }
  return out;
}

/**
 * The play an entry would be if the host saved this score for it: `key` is
 * an entry ("s3", replacing what's there) or anything else for a new one
 * after the latest. null when it can't tell.
 */
export function entryPlayFor(scores: readonly Score[], key: string, scoreX: number, scoreY: number): ScorePlay | null {
  const entries = orderedEntries(scores).filter((s) => s.periodKey !== key);
  const n = everyScoreIndex(key) ?? (everyScoreIndex(entries.at(-1)?.periodKey ?? "") ?? 0) + 1;
  const draft = { periodKey: `s${n}`, scoreX, scoreY };
  return entryPlays([...entries, draft]).get(draft.periodKey) ?? null;
}

/** Plays for a board's entries: football boards only (another sport's points mean other things). */
function boardPlays(game: Pick<Game, "sport">, scores: readonly Score[]): Map<string, ScorePlay | null> {
  return !game.sport || game.sport === "football" ? entryPlays(scores) : new Map();
}

export interface PeriodResult {
  periodKey: string;
  label: string;
  /** null only when the host picked a winner for a period with no recorded score. */
  score: Score | null;
  /** Winning square (the host's pick when overridden); null when only the reverse square wins this period. */
  cell: Cell | null;
  /** Public player id owning `cell`, if claimed. */
  winnerPlayerId: string | null;
  /** Reverse square, when this period has one (the host's pick on a reverse-only period); may equal `cell`. */
  reverseCell: Cell | null;
  reverseWinnerPlayerId: string | null;
  /** True when the square wins this period (its rule's `square`). */
  awardsSquare: boolean;
  /** True when the reverse square wins this period (its rule's `reverse`). */
  awardsReverse: boolean;
  /** The square's note (older boards: their period note), or null. Never an amount. */
  prize: string | null;
  /** The reverse square's note, or null. */
  reversePrize: string | null;
  /**
   * Display-only amount for the square, in the board's unit (for a score
   * entry with amounts by score type, the one for its kind).
   */
  amount: number | null;
  /** Display-only amount for the reverse square (by kind too). */
  reverseAmount: number | null;
  /**
   * Every-score entries on a football board: the kind of score, from its
   * change versus the entry before it (see entryPlays); null for fixed
   * periods and when it can't tell.
   */
  scoreKind: ScoreKind | null;
  /** The points behind `scoreKind` (1 = extra point, 2 = 2-point try); null without a kind. */
  scorePoints: number | null;
  /** "host" when the winner comes from a ManualWinner override. */
  source: "auto" | "host";
}

export type ResultsInput = Pick<GameState, "game" | "squares" | "scores" | "manualWinners">;

/**
 * Winners for every period that has a score or a host pick, in game order.
 * Empty until numbers are drawn. Each period follows its rule: the square
 * only when the rule awards it, the reverse square only when it has one. A
 * ManualWinner replaces the square (or, when only the reverse wins that
 * period, the reverse square); a reverse square otherwise follows the score.
 */
export function resolveResults(state: ResultsInput): PeriodResult[] {
  const { game, squares, scores, manualWinners } = state;
  if (!game.numbers) return [];

  const rules = rulesOf(game.format);
  const legacy = !game.format.rules?.length;
  const owner = new Map(squares.map((s) => [cellKey(s.row, s.col), s.playerId]));
  const ownerOf = (cell: Cell | null) => (cell ? (owner.get(cellKey(cell.row, cell.col)) ?? null) : null);
  const scoreBy = new Map(scores.map((s) => [s.periodKey, s]));
  const manualBy = new Map(manualWinners.map((m) => [m.periodKey, m]));

  // A host pick may exist for an entry whose score was removed; keep it.
  const entries = hasScoreMoment(rules) ? entryPeriods([...scoreBy.keys(), ...manualBy.keys()], scoreBy) : [];
  const periods = mergePeriods(fixedPeriodsOf(game), entries, scoreBy);
  const plays = entries.length > 0 ? boardPlays(game, scores) : new Map<string, ScorePlay | null>();

  const out: PeriodResult[] = [];
  for (const p of periods) {
    const rule = ruleForPeriodKey(rules, p.key);
    if (!rule) continue;
    const score = scoreBy.get(p.key) ?? null;
    const manual = manualBy.get(p.key);
    if (!score && !manual) continue;
    const draw = drawFor(game, p.key);
    const picked = manual ? { row: manual.row, col: manual.col } : null;
    const cell = rule.square ? (picked ?? (score && draw ? winningCell(score, draw) : null)) : null;
    const rev = rule.reverse ? ((!rule.square ? picked : null) ?? (score && draw ? reverseCell(score, draw) : null)) : null;
    const play = plays.get(p.key) ?? null;
    out.push({
      periodKey: p.key,
      label: p.label,
      score,
      cell,
      winnerPlayerId: ownerOf(cell),
      reverseCell: rev,
      reverseWinnerPlayerId: ownerOf(rev),
      awardsSquare: !!rule.square,
      awardsReverse: !!rule.reverse,
      prize: rule.square ? (legacy ? prizeFor(game.prizes, p.key) : rule.square.note || null) : null,
      reversePrize: rule.reverse?.note || null,
      amount: prizeAmount(rule.square, play?.kind),
      reverseAmount: prizeAmount(rule.reverse, play?.kind),
      scoreKind: play?.kind ?? null,
      scorePoints: play?.points ?? null,
      source: manual ? "host" : "auto",
    });
  }
  return out;
}

/**
 * A period's headline award: the square, or the reverse square when only
 * the reverse wins that period. What a one-winner view shows (a card, the
 * host's "needs a winner", the leader).
 */
export function primaryAward(r: PeriodResult): {
  cell: Cell | null;
  playerId: string | null;
  amount: number | null;
  note: string | null;
  reverse: boolean;
} {
  return r.awardsSquare || !r.awardsReverse
    ? { cell: r.cell, playerId: r.winnerPlayerId, amount: r.amount, note: r.prize, reverse: false }
    : { cell: r.reverseCell, playerId: r.reverseWinnerPlayerId, amount: r.reverseAmount, note: r.reversePrize, reverse: true };
}

/** The note for a period's result (the square's, else the reverse square's). Never an amount. */
export function resultNote(r: Pick<PeriodResult, "prize" | "reversePrize">): string | null {
  return r.prize ?? r.reversePrize;
}

/** What this player won in a period: the amounts and notes of the squares (square, reverse) they hold. */
export function playerTake(r: PeriodResult, playerId: string): { amount: number | null; note: string | null; square: boolean; reverse: boolean } {
  const square = r.winnerPlayerId === playerId;
  const reverse = r.reverseWinnerPlayerId === playerId;
  const amounts = [square ? r.amount : null, reverse ? r.reverseAmount : null].filter((a): a is number => !!a);
  const amount = amounts.length ? Math.round(amounts.reduce((s, a) => s + a, 0) * 100) / 100 : null;
  const note = (square ? r.prize : null) ?? (reverse ? r.reversePrize : null);
  return { amount, note, square, reverse };
}

/**
 * Public player id -> total prize amount won (square and reverse amounts; the
 * same player taking both squares of a period counts both). Display-only, in
 * the board's unit. Players without an amount aren't listed.
 */
export function prizeTotals(results: PeriodResult[]): Record<string, number> {
  const out: Record<string, number> = {};
  const add = (id: string | null, amount: number | null) => {
    if (!id || !amount) return;
    out[id] = Math.round(((out[id] ?? 0) + amount) * 100) / 100;
  };
  for (const r of results) {
    add(r.winnerPlayerId, r.amount);
    add(r.reverseWinnerPlayerId, r.reverseAmount);
  }
  return out;
}

/** Public player ids that won a period (regular and reverse), deduplicated. */
export function winnersOf(result: PeriodResult): string[] {
  const ids = [result.winnerPlayerId, result.reverseWinnerPlayerId].filter((id): id is string => !!id);
  return [...new Set(ids)];
}

// ---- Live scores ----

/** A score to record for a completed fixed period. */
export interface PeriodScore {
  periodKey: string;
  label: string;
  scoreX: number;
  scoreY: number;
}

const PERIODS_COMPLETED_FOR: Record<string, number> = { q1: 1, q2: 2, q3: 3 };

function cumulative(linescores: number[], n: number): number {
  let total = 0;
  for (let i = 0; i < n; i++) {
    const v = Number(linescores[i]);
    if (Number.isFinite(v)) total += v;
  }
  return total;
}

/**
 * Cumulative scores for every fixed period a live update has completed.
 * Half = after 2 periods. Final only once the game is over and includes OT;
 * it uses the provider's game total, which is authoritative over linescores.
 * Only the fixed moments the rules award; every-score entries come from
 * nextEveryScoreEntries (a board with both gets both).
 */
export function periodScoresFromLinescores(format: GameFormat, update: LiveUpdate): PeriodScore[] {
  const out: PeriodScore[] = [];
  for (const p of fixedPeriods(rulesOf(format))) {
    if (p.key === "final") {
      if (!update.isFinal) continue;
      const x = Number.isFinite(update.live.scoreX) ? update.live.scoreX : cumulative(update.linescoresX, update.linescoresX.length);
      const y = Number.isFinite(update.live.scoreY) ? update.live.scoreY : cumulative(update.linescoresY, update.linescoresY.length);
      out.push({ periodKey: p.key, label: p.label, scoreX: x, scoreY: y });
      continue;
    }
    const n = PERIODS_COMPLETED_FOR[p.key];
    if (n === undefined || update.completedPeriods < n) continue;
    out.push({
      periodKey: p.key,
      label: p.label,
      scoreX: cumulative(update.linescoresX, n),
      scoreY: cumulative(update.linescoresY, n),
    });
  }
  return out;
}

/**
 * For every-score boards: the entries to append when the live score has
 * moved on from the latest recorded entry (0-0 before the first score), in
 * order. One team up 7 or 8 with the other unchanged is a touchdown and its
 * conversion landing in one poll: that's two entries, the touchdown (+6)
 * first, so its square still wins its turn. Anything else is one entry at
 * the new score. Empty when unchanged, and when either team is below it:
 * that's a correction (a score overturned on review), not a new score; see
 * retractedEntries. Host-typed entries never go through this: they're
 * recorded as typed.
 */
export function nextEveryScoreEntries(scores: Score[], scoreX: number, scoreY: number): PeriodScore[] {
  let last: Score | null = null;
  let maxN = 0;
  for (const s of scores) {
    const n = everyScoreIndex(s.periodKey);
    if (n !== null && n > maxN) {
      maxN = n;
      last = s;
    }
  }
  const lastX = last?.scoreX ?? 0;
  const lastY = last?.scoreY ?? 0;
  if (lastX === scoreX && lastY === scoreY) return [];
  if (scoreX < lastX || scoreY < lastY) return [];
  const entry = (n: number, x: number, y: number): PeriodScore => {
    const p = everyScorePeriod(n);
    return { periodKey: p.key, label: p.label, scoreX: x, scoreY: y };
  };
  const dx = scoreX - lastX;
  const dy = scoreY - lastY;
  const touchdownAndTry = (d: number, other: number) => (d === 7 || d === 8) && other === 0;
  if (touchdownAndTry(dx, dy)) return [entry(maxN + 1, lastX + 6, lastY), entry(maxN + 2, scoreX, scoreY)];
  if (touchdownAndTry(dy, dx)) return [entry(maxN + 1, lastX, lastY + 6), entry(maxN + 2, scoreX, scoreY)];
  return [entry(maxN + 1, scoreX, scoreY)];
}

/**
 * For every-score boards: the feed's entries the live score has taken back
 * (a touchdown overturned, a stat correction), newest first. Live entries
 * the score is now below are dropped until it's at or above the latest one
 * left; a host-entered entry is never dropped. A touchdown recorded as two
 * entries (+6, then the conversion) unwinds the same way: a conversion taken
 * back drops just its entry. With them gone, nextEveryScoreEntries gives the
 * corrected score's entries, if any.
 */
export function retractedEntries(scores: Score[], scoreX: number, scoreY: number): string[] {
  const entries = scores
    .map((s) => ({ s, n: everyScoreIndex(s.periodKey) }))
    .filter((e): e is { s: Score; n: number } => e.n !== null)
    .sort((a, b) => b.n - a.n);
  const out: string[] = [];
  for (const { s } of entries) {
    if (s.source !== "live" || (scoreX >= s.scoreX && scoreY >= s.scoreY)) break;
    out.push(s.periodKey);
  }
  return out;
}

/** The fixed period in play for a live period number (1-4, 5+ = OT counts toward Final). null without fixed moments. */
export function periodKeyForLive(format: GameFormat, livePeriod: number): string | null {
  const keys = fixedPeriods(rulesOf(format)).map((p) => p.key);
  if (keys.length === 0) return null;
  const order = ["q1", "q2", "q3", "final"];
  const idx = Math.min(Math.max(1, Math.trunc(livePeriod) || 1), 4) - 1;
  // First period of this board that ends at or after the live period.
  for (const key of order.slice(idx)) if (keys.includes(key)) return key;
  return "final";
}

const decidedKeys = (state: Pick<GameState, "scores" | "manualWinners">) =>
  new Set([...state.scores.map((s) => s.periodKey), ...state.manualWinners.map((m) => m.periodKey)]);

/**
 * The fixed period the live game is playing for: the one covering the live
 * period number, or the next undecided one once that's decided. ESPN keeps
 * the period number through a break (2 all through halftime, 1 at "End of
 * 1st") while the board has already recorded that period. null when no
 * fixed moment wins (every-score boards).
 */
export function periodInPlay(state: Pick<GameState, "game" | "scores" | "manualWinners">, livePeriod: number): string | null {
  const key = periodKeyForLive(state.game.format, livePeriod);
  if (key === null) return null;
  const done = decidedKeys(state);
  if (!done.has(key)) return key;
  const keys = fixedPeriodsOf(state.game).map((p) => p.key);
  return keys.slice(keys.indexOf(key) + 1).find((k) => !done.has(k)) ?? key;
}

/**
 * What the live score is playing for: the fixed period in play while it's
 * undecided; once every fixed period is decided (or with none), the next
 * score on a board where every score wins (`periodKey` null).
 */
export function momentInPlay(
  state: Pick<GameState, "game" | "scores" | "manualWinners">,
  livePeriod: number,
): { periodKey: string | null; rule: MomentRule | null } {
  const rules = rulesOf(state.game.format);
  const scoreRule = ruleFor(rules, "score");
  const key = periodInPlay(state, livePeriod);
  if (key !== null && (!scoreRule || !decidedKeys(state).has(key))) return { periodKey: key, rule: ruleForPeriodKey(rules, key) };
  return { periodKey: null, rule: scoreRule };
}

/**
 * The square the current live score points at — "if it ended now" — for
 * the moment in play (see momentInPlay), under its draw. When only the
 * reverse square wins that moment, `cell` is the reverse square (`reverse`
 * set) and `reverseCell` is null. null until locked or without live data.
 */
export function liveCell(
  state: Pick<GameState, "game" | "squares" | "live" | "scores" | "manualWinners">,
): { periodKey: string | null; cell: Cell; playerId: string | null; reverseCell: Cell | null; reverse?: true } | null {
  const { game, live } = state;
  if (!game.numbers || !live || live.state === "pre") return null;
  const { periodKey, rule } = momentInPlay(state, live.period);
  const draw = drawFor(game, periodKey ?? SHARED_DRAW_KEY);
  if (!draw) return null;
  const cell = winningCell(live, draw);
  if (!cell) return null;
  const rev = rule?.reverse ? reverseCell(live, draw) : null;
  const ownerOf = (c: Cell) => squareAt(state.squares, c.row, c.col)?.playerId ?? null;
  if (rule && !rule.square && rev) return { periodKey, cell: rev, playerId: ownerOf(rev), reverseCell: null, reverse: true };
  return { periodKey, cell, playerId: ownerOf(cell), reverseCell: rev };
}

// ---- Dashboard / summary ----

/** Periods this player (public id) has won so far (regular and reverse). */
export function myWins(
  results: PeriodResult[],
  playerId: string,
): { periodKey: string; label: string; reverse: boolean }[] {
  const out: { periodKey: string; label: string; reverse: boolean }[] = [];
  for (const r of results) {
    if (r.winnerPlayerId === playerId) out.push({ periodKey: r.periodKey, label: r.label, reverse: false });
    if (r.reverseWinnerPlayerId === playerId) out.push({ periodKey: r.periodKey, label: r.label, reverse: true });
  }
  return out;
}

/** Public player id -> number of wins (a reverse win counts once). Handy for a leaderboard. */
export function winCounts(results: PeriodResult[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const r of results) {
    if (r.winnerPlayerId) counts[r.winnerPlayerId] = (counts[r.winnerPlayerId] ?? 0) + 1;
    if (r.reverseWinnerPlayerId) counts[r.reverseWinnerPlayerId] = (counts[r.reverseWinnerPlayerId] ?? 0) + 1;
  }
  return counts;
}

/** First fixed period still waiting for a result (null without fixed moments, or when all are done). */
export function upcomingPeriod(state: ResultsInput): Period | null {
  const done = decidedKeys(state);
  return fixedPeriodsOf(state.game).find((p) => !done.has(p.key)) ?? null;
}

/**
 * How a summary labels the live feed's score: the provider's clock ("Q3 4:12")
 * while the game is on, "Final" once it's over. A "post" that isn't final (the
 * board isn't, and the provider doesn't say so) is a postponed or canceled
 * game: it shows the provider's word for it ("Postponed"), never "Final".
 */
export function liveLabel(live: Pick<LiveStatus, "state" | "period" | "clock" | "detail">, status: Game["status"]): string {
  const detail = live.detail.trim();
  if (live.state !== "post") return detail || `Q${live.period} ${live.clock}`.trim();
  if (status === "final" || /^final\b/i.test(detail)) return "Final";
  return detail || "Postponed";
}

/** True when the live status differs in anything the board shows (ignores updatedAt). */
export function liveChanged(a: LiveStatus | null, b: LiveStatus | null): boolean {
  if (!a || !b) return a !== b;
  return (
    a.state !== b.state ||
    a.period !== b.period ||
    a.clock !== b.clock ||
    a.detail !== b.detail ||
    a.scoreX !== b.scoreX ||
    a.scoreY !== b.scoreY
  );
}
