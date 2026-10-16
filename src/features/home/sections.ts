// Pure dashboard logic for Home: which section a board belongs in, what the
// host should do next, and the glanceable "live" snapshot of a board in play.
// No React or IO, so it is unit-tested in sections.test.ts.

import type { GameState, GameSummary, Player } from "../../../shared/types";
import { countdown } from "../../lib/format";
import { boardPeriods, liveCell, resolveResults, upcomingPeriod, winCounts, type PeriodResult } from "../../../shared/squares";

export type SectionKey = "live" | "needs" | "next" | "final";

export const SECTION_ORDER: readonly SectionKey[] = ["live", "needs", "next", "final"];

/** Host to-dos on a board that isn't in play yet. */
export type HostAction = "finish-setup" | "lock" | "invite";

/** Where a board sits on the dashboard. */
export function sectionOf(g: GameSummary): SectionKey {
  if (g.status === "final") return "final";
  if (g.status === "locked") return "live";
  // A linked game that kicked off before the host drew numbers is still "live" news.
  if (g.live?.state === "in") return "live";
  if (g.isHost) return "needs";
  return "next";
}

export function hostAction(g: Pick<GameSummary, "status" | "claimed" | "totalSquares">): HostAction {
  if (g.status === "draft") return "finish-setup";
  if (g.claimed >= g.totalSquares) return "lock";
  return "invite";
}

const ACTION_RANK: Record<HostAction, number> = { lock: 0, invite: 1, "finish-setup": 2 };

export type Sections = Record<SectionKey, GameSummary[]>;

/**
 * Boards grouped by what they need, each group in its most useful order:
 * live by latest activity, host to-dos by urgency (full boards first),
 * upcoming by kickoff (unscheduled last), finals newest first.
 */
export function groupBoards(games: readonly GameSummary[]): Sections {
  const out: Sections = { live: [], needs: [], next: [], final: [] };
  for (const g of games) out[sectionOf(g)].push(g);
  const recent = (a: GameSummary, b: GameSummary) => b.lastActivityAt - a.lastActivityAt;
  out.live.sort(recent);
  out.final.sort(recent);
  out.needs.sort((a, b) => ACTION_RANK[hostAction(a)] - ACTION_RANK[hostAction(b)] || kickoffOrder(a, b) || recent(a, b));
  out.next.sort((a, b) => kickoffOrder(a, b) || recent(a, b));
  return out;
}

function kickoffOrder(a: GameSummary, b: GameSummary): number {
  if (a.startsAt === b.startsAt) return 0;
  if (a.startsAt === null) return 1;
  if (b.startsAt === null) return -1;
  return a.startsAt - b.startsAt;
}

/**
 * The one card whose action gets the filled button: the most urgent host
 * to-do, else the first upcoming board where you have no squares yet.
 */
export function primaryActionId(sections: Sections): string | null {
  if (sections.needs[0]) return sections.needs[0].id;
  const pick = sections.next.find((g) => g.mySquares === 0 && g.claimed < g.totalSquares);
  return pick?.id ?? null;
}

// ---- Live snapshot ----

export interface Leader {
  /** Public id of who holds the square (null = nobody claimed it). */
  playerId: string | null;
  player: Player | null;
  /** "now": the square the live score points at; "last": the latest period's winner. */
  kind: "now" | "last";
  /** Period the square is for, e.g. "Q3", "Half". */
  periodLabel: string;
  /** Digits of the square, X (columns) then Y (rows), e.g. [4, 0]. */
  digits: [number, number] | null;
}

export interface LiveSnapshot {
  scoreX: number;
  scoreY: number;
  /** A score exists (live feed or a recorded period). */
  hasScore: boolean;
  /** A real live feed is mid-game. */
  inProgress: boolean;
  /** "Q3 4:12", "Halftime", "End of Q1", "Numbers drawn". */
  clock: string;
  leader: Leader | null;
  /** This device holds the leading square (or its reverse). */
  meWinning: boolean;
  /** Next fixed period still to be decided, e.g. "Q3". */
  nextLabel: string | null;
}

const AFTER_PERIOD: Record<string, string> = { q1: "End of Q1", q2: "Halftime", q3: "End of Q3", final: "Final" };

function lastDigit(n: number): number {
  return ((Math.trunc(n) % 10) + 10) % 10;
}

/** The board-at-a-glance for a game in play. null for boards that haven't drawn numbers. */
export function liveSnapshot(state: GameState, me: string): LiveSnapshot | null {
  const { game, live } = state;
  if (!game.numbers) return null;
  const playerById = new Map(state.players.map((p) => [p.id, p]));
  const results = resolveResults(state);
  const next = upcomingPeriod(state);

  if (live && live.state !== "pre") {
    const now = liveCell(state);
    const periods = boardPeriods(game, state.scores);
    const label = now?.periodKey ? (periods.find((p) => p.key === now.periodKey)?.label ?? "Final") : "Last score";
    const leaderId = now?.playerId ?? null;
    const reverseOwner = now?.reverseCell
      ? (state.squares.find((s) => s.row === now.reverseCell!.row && s.col === now.reverseCell!.col)?.playerId ?? null)
      : null;
    return {
      scoreX: live.scoreX,
      scoreY: live.scoreY,
      hasScore: true,
      inProgress: live.state === "in",
      clock: live.state === "post" ? "Final" : live.detail || `Q${live.period} ${live.clock}`.trim(),
      leader: now
        ? {
            playerId: leaderId,
            player: leaderId ? (playerById.get(leaderId) ?? null) : null,
            kind: live.state === "in" ? "now" : "last",
            periodLabel: label,
            digits: [lastDigit(live.scoreX), lastDigit(live.scoreY)],
          }
        : null,
      meWinning: leaderId === me || reverseOwner === me,
      nextLabel: next?.label ?? null,
    };
  }

  const last: PeriodResult | undefined = results.at(-1);
  if (!last) {
    return { scoreX: 0, scoreY: 0, hasScore: false, inProgress: false, clock: "Numbers drawn", leader: null, meWinning: false, nextLabel: next?.label ?? null };
  }
  const leaderId = last.winnerPlayerId;
  return {
    scoreX: last.score?.scoreX ?? 0,
    scoreY: last.score?.scoreY ?? 0,
    hasScore: last.score !== null,
    inProgress: false,
    clock: AFTER_PERIOD[last.periodKey] ?? last.label,
    leader: {
      playerId: leaderId,
      player: leaderId ? (playerById.get(leaderId) ?? null) : null,
      kind: "last",
      periodLabel: last.label,
      digits: last.score ? [lastDigit(last.score.scoreX), lastDigit(last.score.scoreY)] : null,
    },
    meWinning: leaderId === me || last.reverseWinnerPlayerId === me,
    nextLabel: next?.label ?? null,
  };
}

// ---- Buzz ----

/** Friend activity older than this isn't news on the dashboard. */
export const BUZZ_WINDOW_MS = 6 * 60 * 60 * 1000;

export interface Buzz {
  player: Player;
  text: string;
  at: number;
}

/**
 * The freshest thing a friend did on a board that's still filling up
 * ("Maya grabbed 3 squares"), so a quiet card still feels alive. Your own
 * moves and system events don't count.
 */
export function latestBuzz(state: GameState, me: string, now: number): Buzz | null {
  const byId = new Map(state.players.map((p) => [p.id, p]));
  for (const a of state.activity) {
    if (now - a.at > BUZZ_WINDOW_MS) return null; // newest first: the rest are older
    if (!a.actor || a.actor === me) continue;
    const player = byId.get(a.actor);
    if (!player) continue;
    if (a.type === "joined") return { player, text: `${player.name} joined`, at: a.at };
    if (a.type === "claimed") {
      const n = Number(a.data.count) || 1;
      return { player, text: `${player.name} grabbed ${n === 1 ? "a square" : `${n} squares`}`, at: a.at };
    }
  }
  return null;
}

// ---- Finals ----

export interface FinalSummary {
  scoreX: number | null;
  scoreY: number | null;
  /** Players with the most wins first (ties keep join order). */
  winners: { player: Player; wins: number }[];
}

export function finalSummary(state: GameState): FinalSummary {
  const results = resolveResults(state);
  const final = results.find((r) => r.periodKey === "final") ?? results.at(-1);
  const counts = winCounts(results);
  const winners = state.players
    .filter((p) => counts[p.id])
    .map((p) => ({ player: p, wins: counts[p.id] }))
    .sort((a, b) => b.wins - a.wins);
  const score = state.live?.state === "post" ? state.live : final?.score;
  return { scoreX: score?.scoreX ?? null, scoreY: score?.scoreY ?? null, winners };
}

// ---- Headline ----

export interface Headline {
  /** Lead-in words in plain ink. */
  lead: string;
  /** Emphasized words (volt, or gold foil when `tone` is "win"). */
  hot: string;
  tone: "brand" | "win" | "live";
}

/**
 * The one sentence at the top of Home, picked from the most exciting thing
 * going on: your square winning > live games > a host to-do > next kickoff.
 */
export function headlineFor(
  sections: Sections,
  opts: { winning: Pick<Leader, "kind" | "periodLabel"> | null; now: number },
): Headline {
  if (opts.winning) {
    return opts.winning.kind === "now"
      ? { lead: "You're", hot: "winning right now.", tone: "win" }
      : { lead: "You won", hot: `${opts.winning.periodLabel}!`, tone: "win" };
  }
  if (sections.live.length > 0) {
    return sections.live.length === 1
      ? { lead: "Your game is", hot: "on.", tone: "live" }
      : { lead: `${sections.live.length} games`, hot: "on right now.", tone: "live" };
  }
  const todo = sections.needs[0];
  if (todo) {
    const action = hostAction(todo);
    if (action === "lock") return { lead: "Your board is full.", hot: "Draw the numbers.", tone: "brand" };
    if (action === "invite") return { lead: "Board's open.", hot: "Invite the crew.", tone: "brand" };
    return { lead: "Almost there.", hot: "Finish your board.", tone: "brand" };
  }
  if (sections.next.length > 0) {
    if (sections.next.some((g) => g.mySquares === 0 && g.claimed < g.totalSquares)) {
      return { lead: "Squares are open.", hot: "Grab yours.", tone: "brand" };
    }
    const kickoff = sections.next.find((g) => g.startsAt !== null && g.startsAt > opts.now)?.startsAt;
    return kickoff
      ? { lead: "Kickoff in", hot: `${countdown(kickoff - opts.now)}.`, tone: "brand" }
      : { lead: "You're in.", hot: "Now we wait.", tone: "brand" };
  }
  return { lead: "Good games.", hot: "Run it back?", tone: "brand" };
}
