// "Pings by board" on Profile: which boards can still ping, in a stable order,
// and what each one will ping about next. Pure, tested in pings.test.ts.

import { fixedPeriods, rulesOf } from "../../../../shared/formats";
import { periodKeyForLive } from "../../../../shared/squares";
import type { GameSummary } from "../../../../shared/types";

export interface PingBoards {
  /** Boards that can still ping: live first, then by kickoff (or creation). */
  active: GameSummary[];
  /** Finished boards: they don't ping any more. Newest first. */
  ended: GameSummary[];
}

const RANK = (g: GameSummary): number => (g.live?.state === "in" ? 0 : g.status === "locked" ? 1 : 2);

export function pingBoards(games: readonly GameSummary[]): PingBoards {
  const active = games
    .filter((g) => g.status === "open" || g.status === "locked")
    .sort(
      (a, b) =>
        RANK(a) - RANK(b) ||
        (a.startsAt ?? a.createdAt) - (b.startsAt ?? b.createdAt) ||
        a.createdAt - b.createdAt ||
        a.id.localeCompare(b.id),
    );
  const ended = games.filter((g) => g.status === "final").sort((a, b) => b.lastActivityAt - a.lastActivityAt || a.id.localeCompare(b.id));
  return { active, ended };
}

/** The next result this board will ping about: "Q1", "Half", "Q3", "Final", or "the next score". */
export function upcomingResult(g: Pick<GameSummary, "format" | "live" | "latestScore">): string | null {
  // The fixed moments the rules award; a board where only every score wins pings about the next score.
  const periods = fixedPeriods(rulesOf(g.format));
  if (periods.length === 0) return "the next score";
  if (g.live?.state === "in") {
    const key = periodKeyForLive(g.format, g.live.period);
    return periods.find((p) => p.key === key)?.label ?? "Final";
  }
  const last = g.latestScore?.label;
  if (last) {
    const i = periods.findIndex((x) => x.label.toLowerCase() === last.toLowerCase());
    if (i >= 0) return periods[i + 1]?.label ?? null;
  }
  return periods[0]?.label ?? null;
}

const squaresLine = (n: number) => (n > 0 ? ` · you have ${n} ${n === 1 ? "square" : "squares"}` : "");

/** What this board pings about next, e.g. "Next: numbers drawn" or "Next: Q3 result · you have 17 squares". */
export function nextPing(g: GameSummary, now = Date.now()): string {
  if (g.status === "final") return "Ended · no more pings";
  if (g.status === "draft") return "Not open yet";
  if (g.status === "open") {
    const left = Math.max(0, g.totalSquares - g.claimed);
    if (g.isHost) return left > 0 ? `Next: friends joining · ${left} ${left === 1 ? "square" : "squares"} left` : "Next: time to draw the numbers";
    return `Next: numbers drawn${squaresLine(g.mySquares)}`;
  }
  const notStarted = !g.latestScore && g.live?.state !== "in" && g.live?.state !== "post";
  if (notStarted && g.startsAt && g.startsAt > now) return `Next: kickoff${squaresLine(g.mySquares)}`;
  const up = upcomingResult(g);
  const what = up === "the next score" ? "the next score" : up ? `${up} result` : "the final whistle";
  return `${g.live?.state === "in" ? "Live · next" : "Next"}: ${what}${squaresLine(g.mySquares)}`;
}

/** What you'd miss with notifications off: the soonest ping across your boards. */
export function wouldMiss(games: readonly GameSummary[], now = Date.now()): string | null {
  const first = pingBoards(games).active[0];
  if (!first) return null;
  const next = nextPing(first, now).replace(/^(Live · next|Next): /, "").replace(/ · .*$/, "");
  return `${next} on ${first.name}`;
}
