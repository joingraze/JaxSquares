// Pure helpers for the host tools: what the host should do next, score entry
// (keypad, quick adds, who would win before saving), the edit form diff and the
// number-draw reveal. No React and no IO so the rules are unit-tested.

import {
  MONEY_ERRORS,
  SHARED_DRAW_KEY,
  everyScoreIndex,
  everyScorePeriod,
  hasScoreMoment,
  mentionsMoney,
  prizeAmount,
  prizeFor,
  ruleForPeriodKey,
  rulesOf,
  unitOf,
} from "../../../shared/formats";
import {
  boardPeriods,
  cellKey,
  drawFor,
  entryPlayFor,
  fixedPeriodsOf,
  liveLabel,
  primaryAward,
  resolveResults,
  restSoFar,
  reverseCell,
  totalSquares,
  upcomingPeriod,
  winningCell,
  type Cell,
  type PeriodResult,
  type ScorePlay,
} from "../../../shared/squares";
import { FREE_PLAYER_LIMIT, isFreeDraw } from "../../../shared/hostFee";
import { kickoffProblem } from "../../../shared/kickoff";
import type { AmountUnit, Game, GameState, LiveStatus, ManualWinner, NumberDraw, Score, UpdateGameInput } from "../../../shared/types";
import { isUrgent } from "../invite/inviteModel";

/** Highest score the API accepts. */
export const MAX_SCORE = 999;

/** periodKey that appends a new entry on every-score boards. */
export const NEXT_ENTRY = "next";

/** Every score change wins on this board (it records score entries s1..sN). */
export function hasEntries(game: Pick<Game, "format">): boolean {
  return hasScoreMoment(rulesOf(game.format));
}

/** Only score entries win (no fixed period): the classic every-score board. */
export function entriesOnly(game: Pick<Game, "format" | "periods">): boolean {
  return fixedPeriodsOf(game).length === 0;
}

// ---- What the host should do next ----

export type HostActionKind = "invite" | "lock" | "score" | "auto" | "final";

export interface HostAction {
  kind: HostActionKind;
  /** Short label for the host bar's pill, e.g. "Lock & draw". */
  label: string;
}

export interface HostSummary {
  /** One-line status for the host bar, e.g. "58 of 100 taken", "8 squares left · ready to draw". */
  status: string;
  /** 0..1 fill for the bar's meter (squares taken while open, periods decided after). */
  progress: number;
  action: HostAction;
  /** Nothing for the host to do right now: the bar folds to one slim row. */
  slim: boolean;
  /** Drawing needs the host fee first: the draw action opens the checkout, then draws. */
  fee?: boolean;
  /** The host fee would be due, but the host's Host Pass covers it: the draw just draws. */
  covered?: boolean;
  /** The host fee would be due, but 5 or fewer players hold squares: "Draw the numbers · Free", and the draw just draws. */
  free?: boolean;
}

export function claimedOf(state: Pick<GameState, "game" | "squares">): { claimed: number; total: number } {
  return { claimed: state.squares.length, total: totalSquares(state.game.format.boardSize) };
}

/** True when scores come from the live feed (the host can still override). */
export function isLinked(game: Pick<Game, "linkedEvent">): boolean {
  return game.linkedEvent !== null;
}

/** Squares are still being picked (a legacy draft counts: paying opens it). */
export function isPicking(game: Pick<Game, "status">): boolean {
  return game.status === "open" || game.status === "draft";
}

/**
 * Drawing the numbers needs the host fee first: a board still being picked
 * whose fee isn't paid. `paid` absent (an older cached state) reads as paid;
 * the server's 402 still sends the host to the checkout.
 */
export function needsHostFee(game: Pick<Game, "status" | "paid">): boolean {
  return isPicking(game) && game.paid === false;
}

/** The draw action on a board whose fee is due: "Draw the numbers · $4.99" (no price when it can't be said). */
export function payToDrawLabel(price: string | null | undefined): string {
  return price ? `Draw the numbers · ${price}` : "Draw the numbers";
}

/**
 * The fee would be due, but 5 or fewer players hold squares (the free tier,
 * shared/hostFee.ts): drawing costs nothing and needs no checkout. The server
 * counts again as it draws; a 6th player who got in meanwhile brings back the
 * 402, and with it the checkout.
 */
export function drawIsFree(state: Pick<GameState, "game" | "squares">): boolean {
  return needsHostFee(state.game) && isFreeDraw(state);
}

/** The draw action on a free board. */
export const FREE_DRAW_LABEL = "Draw the numbers · Free";
/** The small note beside it. */
export const FREE_DRAW_NOTE = `Free for up to ${FREE_PLAYER_LIMIT} players`;
/** The free tier in one line, where the host reads about the draw before it. */
export const FREE_TIER_LINE = `Boards with up to ${FREE_PLAYER_LIMIT} players are free.`;

/**
 * A linked board can be paid ahead so Jax draws the numbers at kickoff: its
 * fee is due and kickoff hasn't come yet.
 */
export function canPayAhead(game: Pick<Game, "status" | "paid" | "linkedEvent">, now = Date.now()): boolean {
  return needsHostFee(game) && game.linkedEvent !== null && game.linkedEvent.startsAt > now;
}

/**
 * `price`: the host fee as this device shows it, for the draw action on a
 * board whose fee is due. A board with 5 or fewer players holding squares
 * draws for free: "Draw the numbers · Free" ("Free for up to 5 players"
 * beside it), no checkout, whatever the pass. `pass`: the host's Host Pass is
 * active, so a bigger board's fee is covered: the draw reads "Draw the
 * numbers" (with "Included with your Host Pass" beside it) and needs no
 * checkout.
 */
export function hostSummary(state: GameState, price?: string | null, now = Date.now(), pass = false): HostSummary {
  const { game } = state;
  const { claimed, total } = claimedOf(state);

  if (isPicking(game)) {
    const left = Math.max(0, total - claimed);
    const full = left === 0;
    const due = needsHostFee(game);
    const free = drawIsFree(state);
    const covered = due && !free && pass;
    const fee = due && !free && !covered;
    // A linked game under way that wasn't drawn at kickoff (its fee wasn't paid): drawing is the move.
    const late = claimed > 0 && isLinked(game) && gameStarted(state, now);
    // Getting people in stays the move until the board is (nearly) full; then it's locking.
    if (late || lockIsTheMove(claimed, total)) {
      return {
        status: late
          ? "Kicked off · numbers not drawn yet"
          : full
            ? "Board's full. Draw time!"
            : `${left} ${left === 1 ? "square" : "squares"} left · ready to draw`,
        progress: claimed / total,
        action: { kind: "lock", label: fee ? payToDrawLabel(price) : free ? FREE_DRAW_LABEL : covered ? "Draw the numbers" : "Lock & draw" },
        slim: false,
        fee,
        covered,
        free,
      };
    }
    return {
      // Short: it shares the row with "Invite (42 left)"; who's in is on the board's header.
      status: claimed === 0 ? "Nobody's picked a square yet" : `${claimed} of ${total} taken`,
      progress: claimed / total,
      action: { kind: "invite", label: invitedAnyone(state) ? `Invite (${left} left)` : "Invite friends" },
      slim: false,
    };
  }
  if (game.status === "final") {
    const results = resolveResults(state);
    const empty = emptyPrizes(state);
    // A prize that landed on an empty square is still the host's to hand out.
    if (empty > 0) {
      return {
        status: `${empty} ${empty === 1 ? "prize needs" : "prizes need"} a winner`,
        progress: 1,
        action: { kind: "final", label: empty === 1 ? "Pick a winner" : "Pick winners" },
        slim: false,
      };
    }
    return {
      status: `Final · ${results.length} ${results.length === 1 ? "prize" : "prizes"} decided`,
      progress: 1,
      action: { kind: "final", label: "Results" },
      slim: true,
    };
  }

  // Locked.
  const everyScore = entriesOnly(game);
  const mixed = !everyScore && hasEntries(game);
  const recorded = everyScore ? state.scores.length : decidedCount(state);
  const periods = everyScore ? 0 : fixedPeriodsOf(game).length;
  const status = everyScore
    ? `${recorded} ${recorded === 1 ? "score" : "scores"} so far`
    : `${recorded} of ${periods} ${isLinked(game) ? "decided" : "prizes decided"}`;
  const progress = everyScore ? 0 : periods ? recorded / periods : 0;
  if (isLinked(game)) {
    return {
      status: recorded === 0 ? "Scores come in on their own" : `${status} · auto-scored`,
      progress,
      action: { kind: "auto", label: "Scores" },
      slim: true,
    };
  }
  if (everyScore || mixed) return { status, progress, action: { kind: "score", label: "Add score" }, slim: false };
  const next = upcomingPeriod(state);
  return { status, progress, action: { kind: "score", label: next ? `${next.label} score` : "Scores" }, slim: false };
}

/** Share of the board taken at which locking becomes the host's main move. */
export const LOCK_READY_SHARE = 0.9;

/**
 * Locking is the move once the board is full or nearly there: every square
 * taken, 90% claimed, or few enough left to call last call (isUrgent). Before
 * that, inviting stays primary; the host can still lock any time from Host tools.
 */
export function lockIsTheMove(claimed: number, total: number): boolean {
  if (total <= 0 || claimed <= 0) return false;
  const left = Math.max(0, total - claimed);
  return left === 0 || claimed / total >= LOCK_READY_SHARE || isUrgent(left, total);
}

/** Decided prizes whose square nobody owns (and the host hasn't handed out). The reverse square on a reverse-only moment. */
export function emptyPrizes(state: GameState): number {
  const manual = new Set(state.manualWinners.map((m) => m.periodKey));
  return resolveResults(state).filter((r) => !primaryAward(r).playerId && !manual.has(r.periodKey)).length;
}

/** True once someone besides the host has joined (the invite button stops saying "Invite friends"). */
export function invitedAnyone(state: Pick<GameState, "game" | "players">): boolean {
  return state.players.some((p) => p.id !== state.game.hostPlayerId);
}

/**
 * The game is under way: a score or pick is in, the live feed says it started,
 * or a linked game's kickoff time has passed. Before that there's nothing to
 * crown and nothing to end.
 */
export function gameStarted(state: Pick<GameState, "game" | "scores" | "manualWinners" | "live">, now = Date.now()): boolean {
  if (state.scores.length > 0 || state.manualWinners.length > 0) return true;
  if (state.live && state.live.state !== "pre") return true;
  const kickoff = state.game.linkedEvent?.startsAt ?? null;
  return kickoff !== null && kickoff <= now;
}

/** One line under the host sheet's title saying where the board stands. */
export function hostStatusLine(state: GameState, now = Date.now()): string {
  const { game } = state;
  if (isPicking(game)) {
    const { claimed, total } = claimedOf(state);
    if (isLinked(game) && gameStarted(state, now)) return "Kicked off · draw the numbers to start the board";
    return claimed >= total ? "Board's full. Time to draw the numbers." : `Filling up · ${claimed} of ${total} squares taken`;
  }
  if (game.status === "final") {
    const empty = emptyPrizes(state);
    return empty === 0 ? "Final · the winners are in" : `Final · ${empty} ${empty === 1 ? "prize has" : "prizes have"} no winner yet`;
  }
  if (isLinked(game)) {
    if (state.live?.state === "in") return "Live · scores come in on their own";
    return gameStarted(state, now) ? "Scores come in on their own" : "Numbers drawn · waiting for kickoff";
  }
  if (entriesOnly(game)) return "Numbers drawn · add each score as it happens";
  const next = upcomingPeriod(state);
  if (hasEntries(game)) return next ? `Numbers drawn · add each score · ${next.label} is up next` : "Numbers drawn · add each score as it happens";
  return next ? `Numbers drawn · ${next.label} is up next` : "All prizes decided";
}

function decidedCount(state: Pick<GameState, "game" | "scores" | "manualWinners">): number {
  const done = new Set([...state.scores.map((s) => s.periodKey), ...state.manualWinners.map((m) => m.periodKey)]);
  return fixedPeriodsOf(state.game).filter((p) => done.has(p.key)).length;
}

// ---- Locking ----

export interface LockFacts {
  claimed: number;
  total: number;
  empty: number;
  players: number;
  /** Players who joined but haven't picked a square yet. */
  idle: number;
}

export function lockFacts(state: GameState): LockFacts {
  const { claimed, total } = claimedOf(state);
  const owners = new Set(state.squares.map((s) => s.playerId));
  return {
    claimed,
    total,
    empty: total - claimed,
    players: state.players.length,
    idle: state.players.filter((p) => !owners.has(p.id)).length,
  };
}

export type LockReadiness = "empty" | "low" | "ok";

/** Below this share of squares taken, locking asks "with only N in?". */
export const LOW_FILL = 0.25;

/** Nobody in: nothing to draw for. A thin board: the host confirms on purpose. */
export function lockReadiness(f: Pick<LockFacts, "claimed" | "total">): LockReadiness {
  if (f.claimed === 0) return "empty";
  return f.claimed / f.total < LOW_FILL ? "low" : "ok";
}

// ---- Removing a player ----

export interface RemoveCopy {
  /** "Remove Maya?" */
  title: string;
  /** What happens to their squares, in plain words. */
  detail: string;
  /** The line after it. */
  after: string;
  /** Confirm button. */
  confirm: string;
  /** Success toast: "Maya removed" + "6 squares are open again." */
  done: string;
  doneDetail: string;
}

/** Wording for taking `name` (holding `squares`) off the board. */
export function removeCopy(name: string, squares: number): RemoveCopy {
  const who = name.trim() || "this player";
  const Who = who === "this player" ? "This player" : who;
  return {
    title: `Remove ${who}?`,
    detail:
      squares === 0
        ? "They haven't picked a square yet."
        : squares === 1
          ? "Their square opens up again."
          : `Their ${squares} squares open up again.`,
    after: squares === 0 ? "Nothing on the board changes." : squares === 1 ? "Anyone can pick it." : "Anyone can pick them.",
    confirm: `Remove ${who}`,
    done: `${Who} removed`,
    doneDetail:
      squares === 0 ? "They're off the board." : squares === 1 ? "1 square is open again." : `${squares} squares are open again.`,
  };
}

// ---- Score entry ----

export interface ScoreTarget {
  /** Period key to send ("q1", "s3", or NEXT_ENTRY for a new every-score entry). */
  key: string;
  label: string;
  existing: Score | null;
}

/**
 * Periods the host can type a score for, in game order: fixed periods, and
 * on a board where every score wins its entries, then a new one.
 */
export function scoreTargets(state: Pick<GameState, "game" | "scores">): ScoreTarget[] {
  const { game, scores } = state;
  const by = new Map(scores.map((s) => [s.periodKey, s]));
  const targets = boardPeriods(game, scores).map((p) => ({ key: p.key, label: p.label, existing: by.get(p.key) ?? null }));
  if (!hasEntries(game)) return targets;
  const n = scores.reduce((m, s) => Math.max(m, everyScoreIndex(s.periodKey) ?? 0), 0);
  return [...targets, { key: NEXT_ENTRY, label: everyScorePeriod(n + 1).label, existing: null }];
}

/** The live period number each fixed period ends with (linked boards); "final" ends with the game. */
const ENDS_AFTER: Record<string, number> = { q1: 1, q2: 2, q3: 3 };

/** Play is stopped right after `live.period`: the feed's "End of 1st" or "Halftime" (see worker/scores/espn.ts). */
function atBreak(live: LiveStatus): boolean {
  return live.state === "in" && /^(end of|halftime)/i.test(live.detail.trim());
}

/** The real game is still playing for this period, so its score isn't known yet. */
function stillInPlay(live: LiveStatus | null, key: string): boolean {
  if (!live || live.state !== "in") return false;
  const n = ENDS_AFTER[key];
  if (n === undefined) return true;
  return live.period < n || (live.period === n && !atBreak(live));
}

/** The live score is this period's final score: the break right after it, or the final whistle. */
function liveScoreIsFor(state: Pick<GameState, "game" | "live">, key: string): boolean {
  const { live } = state;
  if (!live) return false;
  if (key === "final") return live.state === "post" && liveLabel(live, state.game.status) === "Final";
  return live.period === ENDS_AFTER[key] && atBreak(live);
}

/**
 * The period the keypad should open on: the next one without a result
 * (every-score: a new entry). On a linked board that period may still be in
 * play, and a host score would pin it for good, so a fix opens on the latest
 * decided period instead.
 */
export function defaultTargetKey(state: Pick<GameState, "game" | "squares" | "scores" | "manualWinners" | "live">): string {
  const { game } = state;
  // Score changes are what a host types most where every score wins.
  if (hasEntries(game)) return NEXT_ENTRY;
  const periods = boardPeriods(game, state.scores);
  const next = upcomingPeriod(state);
  if (next && stillInPlay(state.live, next.key)) {
    const done = new Set([...state.scores.map((s) => s.periodKey), ...state.manualWinners.map((m) => m.periodKey)]);
    const last = periods.filter((p) => done.has(p.key)).at(-1);
    if (last) return last.key;
  }
  if (next) return next.key;
  return periods[periods.length - 1]?.key ?? "final";
}

/** The real period key a target writes to (NEXT_ENTRY -> "sN"). */
export function resolvedKey(state: Pick<GameState, "game" | "scores">, key: string): string {
  if (key !== NEXT_ENTRY) return key;
  const n = state.scores.reduce((m, s) => Math.max(m, everyScoreIndex(s.periodKey) ?? 0), 0);
  return everyScorePeriod(n + 1).key;
}

export interface ScoreDraft {
  x: string;
  y: string;
}

/**
 * What the keypad starts with: the recorded score when editing. A new period
 * starts blank, so nothing is saved (and no winner announced) until the host
 * types it or confirms a suggestion. A new every-score entry starts from the
 * latest score, since it's always "that plus the points just scored".
 */
export function initialDraft(state: GameState, key: string): ScoreDraft {
  const existing = state.scores.find((s) => s.periodKey === key);
  if (existing) return { x: String(existing.scoreX), y: String(existing.scoreY) };
  // Where every score wins, a new entry (or a quarter-end being marked) starts from the latest score.
  if (hasEntries(state.game)) {
    const last = latestEntry(state.scores);
    return { x: String(last?.scoreX ?? 0), y: String(last?.scoreY ?? 0) };
  }
  return { x: "", y: "" };
}

export interface ScoreSuggestion {
  /** Chip text, e.g. "Same as Q1" or "Live score". */
  label: string;
  draft: ScoreDraft;
}

/**
 * A one-tap fill for a new period: on linked boards the live score, but only
 * when it is that period's score (its break, or the final whistle; mid-period
 * it's just the score so far); otherwise the score recorded before it (nobody
 * scored since). Null when editing a recorded score or on every-score boards.
 */
export function scoreSuggestion(state: GameState, key: string): ScoreSuggestion | null {
  // Where every score wins, a quarter-end starts from the latest score already (see initialDraft).
  if (hasEntries(state.game) || key === NEXT_ENTRY) return null;
  if (state.scores.some((s) => s.periodKey === key)) return null;
  if (state.live && state.live.state !== "pre") {
    if (!liveScoreIsFor(state, key)) return null;
    return { label: "Live score", draft: { x: String(state.live.scoreX), y: String(state.live.scoreY) } };
  }
  const targets = scoreTargets(state);
  const idx = targets.findIndex((t) => t.key === key);
  for (let i = idx - 1; i >= 0; i--) {
    const prev = targets[i].existing;
    if (prev) return { label: `Same as ${targets[i].label}`, draft: { x: String(prev.scoreX), y: String(prev.scoreY) } };
  }
  return null;
}

export function parseScore(value: string): number | null {
  if (!/^\d{1,3}$/.test(value)) return null;
  const n = Number(value);
  return n <= MAX_SCORE ? n : null;
}

export type PadKey = "0" | "1" | "2" | "3" | "4" | "5" | "6" | "7" | "8" | "9" | "back" | "clear";

/**
 * Keypad press. `fresh` = the field was just focused, so the first digit
 * replaces what's there (like a calculator). Max three digits, no leading zeros.
 */
export function pressKey(value: string, key: PadKey, fresh: boolean): string {
  if (key === "clear") return "";
  if (key === "back") return fresh ? "" : value.slice(0, -1);
  if (fresh || value === "0" || value === "") return key;
  if (value.length >= 3) return value;
  return value + key;
}

/** Keeps only digits from typed/pasted text, without leading zeros, capped at three. */
export function cleanTyped(raw: string): string {
  const digits = raw.replace(/\D/g, "").replace(/^0+(?=\d)/, "");
  return digits.slice(0, 3);
}

/** Quick add (+7 touchdown, +3 field goal...) on top of the current value. */
export function addPoints(value: string, points: number): string {
  return String(Math.min(MAX_SCORE, (parseScore(value) ?? 0) + points));
}

/** Football scoring plays for every-score boards. */
/**
 * The every-score pad's one-tap points for the team that scored. A
 * touchdown is +6 and its extra point or 2-point conversion is saved as its
 * own score (like the live feed records them), so the touchdown's square
 * gets its turn and each shows its kind's amount. A safety is also +2: the
 * kind comes from the order (2 right after that team's touchdown is a
 * 2-point conversion).
 */
export const QUICK_ADDS: readonly { points: number; label: string; name: string }[] = [
  { points: 6, label: "TD", name: "touchdown" },
  { points: 3, label: "FG", name: "field goal" },
  { points: 1, label: "XP", name: "extra point" },
  { points: 2, label: "2-PT", name: "2-point conversion" },
  { points: 2, label: "Safety", name: "safety" },
];

export interface WinnerPreview {
  periodKey: string;
  cell: Cell;
  ownerId: string | null;
  reverse: { cell: Cell; ownerId: string | null } | null;
  /** Last digits that decide it. */
  digitX: number;
  digitY: number;
  prize: string | null;
  /**
   * Display-only amount the square (or, on a reverse-only moment, the
   * reverse square) wins (by kind, for a score entry; the rest of the board
   * total so far for a final that takes it).
   */
  amount: number | null;
  unit: AmountUnit;
  /** A score entry: the kind of score this would be (from the entry before it); null for a fixed period. */
  play: ScorePlay | null;
  /** The final's square takes the rest of the board total: `amount` is that rest, as it stands. */
  rest: boolean;
  /** Only the reverse square wins this moment: `cell` is the reverse square. */
  reverseOnly: boolean;
  /** A host pick that will keep overriding the computed square. */
  manual: ManualWinner | null;
}

/** Who wins `key` if the host saves this score. null until numbers are drawn or the score is incomplete. */
export function previewWinner(state: GameState, key: string, draft: ScoreDraft): WinnerPreview | null {
  const scoreX = parseScore(draft.x);
  const scoreY = parseScore(draft.y);
  if (scoreX === null || scoreY === null) return null;
  const real = resolvedKey(state, key);
  const draw = drawFor(state.game, real === NEXT_ENTRY ? SHARED_DRAW_KEY : real);
  if (!draw) return null;
  const rule = ruleForPeriodKey(rulesOf(state.game.format), real);
  const reverseOnly = !!rule && !rule.square && !!rule.reverse;
  const square = winningCell({ scoreX, scoreY }, draw);
  const swapped = reverseCell({ scoreX, scoreY }, draw);
  const cell = reverseOnly ? swapped : square;
  if (!cell) return null;
  const owner = new Map(state.squares.map((s) => [cellKey(s.row, s.col), s.playerId]));
  const ownerOf = (c: Cell) => owner.get(cellKey(c.row, c.col)) ?? null;
  const rev = rule?.reverse && !reverseOnly ? swapped : null;
  const legacy = !state.game.format.rules?.length;
  const note = legacy ? prizeFor(state.game.prizes, real) : (reverseOnly ? rule?.reverse?.note : rule?.square?.note) || null;
  const football = !state.game.sport || state.game.sport === "football";
  const play = football && everyScoreIndex(real) !== null ? entryPlayFor(state.scores, real, scoreX, scoreY) : null;
  return {
    periodKey: real,
    cell,
    ownerId: ownerOf(cell),
    reverse: rev && (rev.row !== cell.row || rev.col !== cell.col) ? { cell: rev, ownerId: ownerOf(rev) } : null,
    digitX: scoreX % 10,
    digitY: scoreY % 10,
    prize: note,
    amount: !reverseOnly && rule?.square?.rest ? restSoFar(state) : prizeAmount(reverseOnly ? rule?.reverse : rule?.square, play?.kind),
    unit: unitOf(state.game.format),
    play,
    reverseOnly,
    rest: !reverseOnly && !!rule?.square?.rest,
    manual: state.manualWinners.find((m) => m.periodKey === real) ?? null,
  };
}

/** Saving is allowed once both scores are valid and something changed. */
export function canSaveScore(state: GameState, key: string, draft: ScoreDraft): boolean {
  const x = parseScore(draft.x);
  const y = parseScore(draft.y);
  if (x === null || y === null) return false;
  if (key === NEXT_ENTRY) {
    // A new every-score entry must differ from the latest one (0-0 before the first score).
    const last = latestEntry(state.scores);
    return !(x === (last?.scoreX ?? 0) && y === (last?.scoreY ?? 0));
  }
  const existing = state.scores.find((s) => s.periodKey === key);
  return !existing || existing.scoreX !== x || existing.scoreY !== y;
}

export function latestEntry(scores: Score[]): Score | null {
  let best: Score | null = null;
  let max = 0;
  for (const s of scores) {
    const n = everyScoreIndex(s.periodKey);
    if (n !== null && n > max) {
      max = n;
      best = s;
    }
  }
  return best;
}

/** A new every-score entry that still equals the latest score (nothing to add yet). */
export function isUnchangedEntry(state: Pick<GameState, "scores">, key: string, draft: ScoreDraft): boolean {
  if (key !== NEXT_ENTRY) return false;
  const last = latestEntry(state.scores);
  return parseScore(draft.x) === (last?.scoreX ?? 0) && parseScore(draft.y) === (last?.scoreY ?? 0);
}

/** Saving the Final score of a typed-in board ends the game (server rule). */
export function saveEndsGame(game: Pick<Game, "status" | "linkedEvent">, key: string): boolean {
  return key === "final" && game.status === "locked" && game.linkedEvent === null;
}

// ---- Winners list ----

export interface WinnerRow {
  key: string;
  label: string;
  score: Score | null;
  result: PeriodResult | null;
  manual: boolean;
}

/**
 * Rows for the host's winners list: every decided period (fixed boards) or
 * entry (every-score), then the next undecided period, if any.
 */
export function winnerRows(state: GameState): WinnerRow[] {
  const results = resolveResults(state);
  const byKey = new Map(results.map((r) => [r.periodKey, r]));
  const manual = new Set(state.manualWinners.map((m) => m.periodKey));
  const scores = new Map(state.scores.map((s) => [s.periodKey, s]));
  const keys = entriesOnly(state.game)
    ? results.map((r) => ({ key: r.periodKey, label: r.label }))
    : boardPeriods(state.game, state.scores).map((p) => ({ key: p.key, label: p.label }));
  const all = keys.map(({ key, label }) => ({
    key,
    label,
    score: scores.get(key) ?? null,
    result: byKey.get(key) ?? null,
    manual: manual.has(key),
  }));
  // Decided periods, plus the first one still open (so the host can always crown it by hand).
  const firstOpen = all.find((r) => !r.result);
  return all.filter((r) => r.result || r === firstOpen);
}

// ---- Edit board (name, a custom board's kickoff, the per-player cap; prices, prizes and notes are under Rules & prizes) ----

export interface EditDraft {
  name: string;
  maxPerPlayer: number;
  /** Custom boards: the kickoff (null = no set time). A linked board's comes from its schedule. */
  startsAt: number | null;
}

export function editDraftOf(game: Game): EditDraft {
  return { name: game.name, maxPerPlayer: game.maxPerPlayer, startsAt: game.startsAt ?? null };
}

/** The host can set the kickoff: custom boards only (a linked game's comes from ESPN). */
export function canEditKickoff(game: Pick<Game, "linkedEvent">): boolean {
  return game.linkedEvent === null;
}

const tidy = (s: string) => s.replace(/\s+/g, " ").trim();

export function editErrors(draft: EditDraft, game?: Pick<Game, "startsAt">, now = Date.now()): { name: string | null; kickoff: string | null } {
  const name = tidy(draft.name);
  // Only a changed kickoff is checked: an older board's past one doesn't stop a rename.
  const changed = game !== undefined && draft.startsAt !== (game.startsAt ?? null);
  return {
    name: !name ? "Give your board a name" : mentionsMoney(name) ? MONEY_ERRORS.name : null,
    kickoff: changed && draft.startsAt !== null ? kickoffProblem(draft.startsAt, now) : null,
  };
}

/** True when max squares per person can still change (the API refuses once locked). */
export function canEditMax(game: Pick<Game, "status">): boolean {
  return isPicking(game);
}

/** The PATCH body for what changed, or null when nothing did. */
export function editPatch(game: Game, draft: EditDraft): UpdateGameInput | null {
  const out: UpdateGameInput = {};
  const name = tidy(draft.name);
  if (name && name !== game.name) out.name = name;
  if (canEditMax(game) && draft.maxPerPlayer !== game.maxPerPlayer) out.maxPerPlayer = draft.maxPerPlayer;
  if (canEditKickoff(game) && draft.startsAt !== (game.startsAt ?? null)) out.startsAt = draft.startsAt;
  return Object.keys(out).length ? out : null;
}

// ---- Number reveal ----

/** The draw the reveal shows: the shared one, or Q1's when numbers are fresh each quarter. */
export function revealDraw(game: Pick<Game, "numbers" | "format">): { key: string; draw: NumberDraw | null } {
  if (!game.numbers) return { key: SHARED_DRAW_KEY, draw: null };
  if (game.numbers[SHARED_DRAW_KEY]) return { key: SHARED_DRAW_KEY, draw: game.numbers[SHARED_DRAW_KEY] };
  const key = Object.keys(game.numbers).sort((a, b) => order(a) - order(b))[0];
  return { key, draw: game.numbers[key] ?? null };
}

const ORDER = ["q1", "q2", "q3", "final"];
const order = (k: string) => (ORDER.includes(k) ? ORDER.indexOf(k) : 99);

/** "7–3" style pairs for a player's squares under a draw (x digit(s), y digit(s)). */
export function numbersFor(
  state: Pick<GameState, "squares">,
  draw: NumberDraw,
  playerId: string,
): { x: string; y: string; key: string }[] {
  return state.squares
    .filter((s) => s.playerId === playerId)
    .sort((a, b) => a.row - b.row || a.col - b.col)
    .map((s) => ({ key: cellKey(s.row, s.col), x: (draw.x[s.col] ?? []).join("·"), y: (draw.y[s.row] ?? []).join("·") }));
}

/** Order the reels land in: across the top left to right, then down the side. */
export function landingOrder(n: number): { axis: "x" | "y"; index: number }[] {
  const out: { axis: "x" | "y"; index: number }[] = [];
  for (let i = 0; i < n; i++) out.push({ axis: "x", index: i });
  for (let i = 0; i < n; i++) out.push({ axis: "y", index: i });
  return out;
}
