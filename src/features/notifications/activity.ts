// Turns live board activity into short in-app announcements (toasts, and the
// board's activity feed). Pure: everything comes from the activity and the
// board state, so it is unit-tested in activity.test.ts.
//
// Rules of thumb:
// - Never announce my own actions (I just did it; the UI already reacted).
//   Winners are the exception: a win is news even when I typed the score.
// - Be specific: names, counts, labels, "only 6 left".
// - Group bursts: a run of claims by one person reads "Maya grabbed 2 more · 5 total".
// - Skip noise: releases only matter when the board is nearly full, and a score
//   that produced a winner is announced by the winner line instead.

import { drawFor, myWins, resolveResults, squaresLeft, winCounts } from "../../../shared/squares";
import { SHARED_DRAW_KEY, drawKeys } from "../../../shared/formats";
import type { Activity, ActivityType, GameState, Team } from "../../../shared/types";

export interface ActivityAnnouncement {
  text: string;
  tone: "info" | "live" | "win";
  haptic?: "light" | "medium" | "heavy" | "success" | "warning" | "selection";
  /** Fire confetti (e.g. my square won). */
  celebrate?: boolean;
}

/** Claims by the same person this close together read as one burst. */
export const BURST_WINDOW_MS = 2 * 60_000;
/** At or below this many open squares, claims and releases mention what's left. */
export const SCARCE_LEFT = 10;
/** Player counts worth a shout when someone joins. */
const PLAYER_MILESTONES = new Set([5, 10, 15, 20, 25, 30, 40, 50]);
/** How many of my squares to spell out when the numbers are drawn. */
const NUMBERS_SHOWN = 2;

type Data = Record<string, unknown>;

// ---- small readers (activity data is loosely typed; legacy rows may be missing fields) ----

const str = (v: unknown): string | null => (typeof v === "string" && v.trim() ? v.trim() : null);
const int = (v: unknown, fallback: number): number => (typeof v === "number" && Number.isFinite(v) ? Math.trunc(v) : fallback);
const ids = (v: unknown): string[] =>
  Array.isArray(v) ? [...new Set(v.filter((x): x is string => typeof x === "string" && x.length > 0))] : [];

function nameOf(state: GameState, id: string | null): string {
  if (!id) return "Someone";
  return state.players.find((p) => p.id === id)?.name.trim() || "Someone";
}

/** "Maya", "Maya & Sam", "Maya, Sam & Lee". */
export function joinNames(names: string[]): string {
  if (names.length <= 1) return names[0] ?? "";
  return `${names.slice(0, -1).join(", ")} & ${names[names.length - 1]}`;
}

const teamShort = (t: Team): string => t.abbr?.trim() || t.name;

/** How a period reads mid-sentence: "Q1", "halftime", "the Final", "Score 3". */
export function periodPhrase(label: string, periodKey: string): string {
  if (periodKey === "final" || /^final$/i.test(label)) return "the Final";
  if (periodKey === "q2" || /^half(time)?$/i.test(label)) return "halftime";
  return label;
}

/** Stable pick between phrasings, so the same activity always reads the same. */
function variant<T>(seed: string, options: readonly T[]): T {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (Math.imul(h, 31) + seed.charCodeAt(i)) | 0;
  return options[Math.abs(h) % options.length];
}

/** True when no activity of these types happened after `a` (so "right now" facts apply to it). */
function isLatest(a: Activity, state: GameState, types: ActivityType[]): boolean {
  return !state.activity.some((x) => x.id !== a.id && types.includes(x.type) && x.at > a.at);
}

/** Another activity written in the same request (same timestamp), e.g. the winner that came with a score. */
function sibling(a: Activity, state: GameState, type: ActivityType, match: (d: Data) => boolean = () => true): Activity | undefined {
  return state.activity.find((x) => x.id !== a.id && x.type === type && x.at === a.at && match(x.data as Data));
}

// ---- per type ----

function joined(a: Activity, state: GameState): ActivityAnnouncement {
  const name = str((a.data as Data).name) ?? nameOf(state, a.actor);
  const count = state.players.length;
  if (isLatest(a, state, ["joined"]) && PLAYER_MILESTONES.has(count)) {
    return { text: `${name} joined. That's ${count} players! 🔥`, tone: "info" };
  }
  return { text: variant(a.id, [`${name} joined the board 👋`, `${name} pulled up 👋`, `${name} is in 👋`]), tone: "info" };
}

function claimed(a: Activity, state: GameState): ActivityAnnouncement {
  const who = nameOf(state, a.actor);
  const count = Math.max(1, int((a.data as Data).count, 1));
  const latest = isLatest(a, state, ["claimed", "released"]);
  const left = squaresLeft(state);
  // Scarcity is news only while people can still pick.
  const picking = state.game.status === "open";

  if (latest && left === 0) {
    const what = count === 1 ? "the last square" : `the last ${count} squares`;
    return { text: `${who} grabbed ${what}. Board's full! 🔥`, tone: "live", haptic: "medium" };
  }

  // Earlier claims by the same person in this burst.
  const before = state.activity
    .filter((x) => x.id !== a.id && x.type === "claimed" && x.actor === a.actor && x.at <= a.at && a.at - x.at <= BURST_WINDOW_MS)
    .reduce((n, x) => n + Math.max(1, int((x.data as Data).count, 1)), 0);

  let text: string;
  if (before > 0) text = count === 1 ? `${who} grabbed another square` : `${who} grabbed ${count} more squares`;
  else text = count === 1 ? `${who} grabbed a square` : `${who} grabbed ${count} squares`;

  if (latest && picking && left <= SCARCE_LEFT) text += ` · only ${left} left`;
  else if (before > 0) text += ` · ${before + count} total`;
  return { text, tone: "info" };
}

function released(a: Activity, state: GameState): ActivityAnnouncement | null {
  const left = squaresLeft(state);
  // Only news when squares are scarce and still up for grabs; otherwise it's noise.
  if (state.game.status !== "open" || !isLatest(a, state, ["claimed", "released"]) || left === 0 || left > SCARCE_LEFT) return null;
  const count = Math.max(1, int((a.data as Data).count, 1));
  const what = count === 1 ? "a square" : `${count} squares`;
  return { text: `${nameOf(state, a.actor)} freed up ${what} 👀 Grab it fast`, tone: "info" };
}

/** My squares as "x–y" digit pairs for the first draw, e.g. ["7–0", "3–7"]; null on 5x5 boards (two digits per line). */
export function myNumberPairs(state: GameState, me: string): string[] | null {
  const draw = drawFor(state.game, drawKeys(state.game.format)[0] ?? SHARED_DRAW_KEY);
  if (!draw) return [];
  if (state.game.format.boardSize === 25) return null;
  return state.squares
    .filter((s) => s.playerId === me)
    .sort((x, y) => x.row - y.row || x.col - y.col)
    .map((s) => `${draw.x[s.col]?.[0] ?? "?"}–${draw.y[s.row]?.[0] ?? "?"}`);
}

function locked(a: Activity, state: GameState, me: string): ActivityAnnouncement {
  const kickoff = (a.data as Data).auto === true;
  const mine = state.squares.filter((s) => s.playerId === me).length;
  const pairs = myNumberPairs(state, me);
  if (mine > 0 && pairs && pairs.length > 0) {
    // List them all when it's short; "+N more" only when it saves real space.
    const list =
      pairs.length <= NUMBERS_SHOWN + 1
        ? pairs.join(", ")
        : `${pairs.slice(0, NUMBERS_SHOWN).join(", ")} +${pairs.length - NUMBERS_SHOWN} more`;
    return { text: `${kickoff ? "Kickoff! " : ""}Numbers are in. You've got ${list}`, tone: "live", haptic: "medium" };
  }
  const head = kickoff ? "Kickoff! Numbers are in 🔢" : "Numbers are in 🔢";
  const tail = mine === 0 ? "" : mine === 1 ? " Find your square" : ` Find your ${mine} squares`;
  return { text: `${head}${tail}`, tone: "live", haptic: "medium" };
}

function score(a: Activity, state: GameState): ActivityAnnouncement | null {
  const d = a.data as Data;
  const periodKey = str(d.periodKey) ?? "";
  // The winner line covers this moment (and names the person, which is the news).
  if (sibling(a, state, "winner", (w) => w.periodKey === periodKey)) return null;
  const { teamX, teamY } = state.game;
  const line = `${teamShort(teamX)} ${int(d.scoreX, 0)}–${int(d.scoreY, 0)} ${teamShort(teamY)}`;
  const label = str(d.label) ?? periodKey;
  let lead: string;
  if (/^s\d+$/.test(periodKey)) lead = "Score!";
  else if (periodKey === "final") lead = "Final:";
  else if (periodKey === "q2") lead = "Halftime:";
  else lead = `End of ${label}:`;
  return { text: `${lead} ${line}`, tone: "live", haptic: "light" };
}

function winner(a: Activity, state: GameState, me: string): ActivityAnnouncement {
  const d = a.data as Data;
  const periodKey = str(d.periodKey) ?? "";
  const when = periodPhrase(str(d.label) ?? periodKey, periodKey);
  const winners = ids(d.playerIds);

  if (winners.includes(me)) {
    const others = winners.filter((id) => id !== me).map((id) => nameOf(state, id));
    const prize = str(d.prize);
    const text = others.length
      ? `You and ${joinNames(others)} both hit at ${when}! 🎉`
      : `Your square hit at ${when}! 🎉${prize ? ` ${prize}` : ""}`;
    return { text, tone: "win", haptic: "success", celebrate: true };
  }
  if (winners.length === 0) {
    return { text: `Nobody had the winning square at ${when}`, tone: "info" };
  }
  const names = joinNames(winners.map((id) => nameOf(state, id)));
  return { text: `${names} ${winners.length > 1 ? "win" : "wins"} ${when} 🎉`, tone: "win", haptic: "light" };
}

function final(state: GameState, me: string): ActivityAnnouncement {
  const results = resolveResults(state);
  const wins = [...new Set(myWins(results, me).map((w) => periodPhrase(w.label, w.periodKey)))];
  if (wins.length > 0) {
    const what = wins.length > 3 ? `${wins.length} times` : joinNames(wins);
    return { text: `That's a wrap! 🏁 You won ${what}`, tone: "win", haptic: "success", celebrate: true };
  }
  const counts = Object.entries(winCounts(results)).sort((x, y) => y[1] - x[1]);
  const [top, next] = counts;
  if (top && top[1] >= 2 && (!next || next[1] < top[1])) {
    return { text: `That's a wrap! 🏁 ${nameOf(state, top[0])} won ${top[1]} times`, tone: "live", haptic: "medium" };
  }
  return { text: "That's a wrap! 🏁 See who won each round", tone: "live", haptic: "medium" };
}

/** null = don't announce (e.g. my own action, or noise). */
export function describeActivity(activity: Activity, state: GameState, myPlayerId: string): ActivityAnnouncement | null {
  const mine = !!activity.actor && activity.actor === myPlayerId;
  if (mine && activity.type !== "winner") return null;
  switch (activity.type) {
    case "created":
      return { text: `${nameOf(state, activity.actor)} opened the board 🏈`, tone: "info" };
    case "joined":
      return joined(activity, state);
    case "claimed":
      return claimed(activity, state);
    case "released":
      return released(activity, state);
    case "locked":
      return locked(activity, state, myPlayerId);
    case "score":
      return score(activity, state);
    case "winner":
      return winner(activity, state, myPlayerId);
    case "final":
      return final(state, myPlayerId);
    default:
      return null;
  }
}
