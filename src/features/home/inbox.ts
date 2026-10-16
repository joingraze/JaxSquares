// The activity inbox behind Home's bell: what happened across your boards
// (your wins, friends joining and grabbing squares on boards you host,
// numbers drawn, finals) plus host to-dos like "your board is full". Built
// from the live board states Home already follows, so it fills in the moment
// something happens. Pure (plus tiny localStorage helpers); unit-tested.

import { resolveResults } from "../../../shared/squares";
import type { Activity, GameState, GameSummary, Player } from "../../../shared/types";
import { BURST_MS, phraseOf, scoreWithTeams } from "./sections";

export interface InboxItem {
  id: string;
  gameId: string;
  /** Board name, shown under the line. */
  board: string;
  at: number;
  tone: "win" | "todo" | "live" | "social";
  /** The news, e.g. "Your square hit at halftime". */
  text: string;
  /** Specifics, e.g. "SEA 22–26 ARI · Loser buys wings". */
  detail: string | null;
  /** Whose avatar to show (null = an icon for the tone). */
  player: Player | null;
  href: string;
}

const DAY = 24 * 60 * 60 * 1000;
/** Older news isn't worth a row. */
export const INBOX_MAX_AGE_MS = 7 * DAY;
export const INBOX_LIMIT = 40;
/** Friends joining/grabbing on one board: the newest few rows are the news, the rest is noise. */
export const SOCIAL_PER_BOARD = 4;

const str = (v: unknown): string | null => (typeof v === "string" && v.trim() ? v.trim() : null);
const ids = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : []);
const countOf = (a: Activity) => Math.max(1, Math.trunc(Number(a.data.count)) || 1);

function joinNames(names: string[]): string {
  if (names.length <= 1) return names[0] ?? "";
  return `${names.slice(0, -1).join(", ")} & ${names[names.length - 1]}`;
}

/** Everything worth knowing on one board, newest first. */
function boardItems(g: GameSummary, s: GameState, me: string, since: number): InboxItem[] {
  const out: InboxItem[] = [];
  const byId = new Map(s.players.map((p) => [p.id, p]));
  const base = { gameId: g.id, board: s.game.name, href: `/g/${g.id}` };
  const results = resolveResults(s);
  const filling = s.game.status === "open";
  let social = 0;
  // One person's claims (and the join before them) in a row read as one line.
  let burst: { item: InboxItem; actor: string; count: number; joined: boolean; oldest: number } | null = null;
  const flush = () => {
    if (!burst) return;
    const { item, count, joined } = burst;
    const name = item.player?.name ?? "Someone";
    if (count > 0) item.text = `${name} ${joined ? "joined and " : ""}grabbed ${count === 1 ? "a square" : `${count} squares`}`;
    else if (joined) item.text = `${name} joined`;
    if ((count > 0 || joined) && social < SOCIAL_PER_BOARD) {
      out.push(item);
      social++;
    }
    burst = null;
  };

  for (const a of s.activity) {
    if (a.at < since) break; // newest first: the rest are older
    const mine = !!a.actor && a.actor === me;
    // Who's joining and grabbing is news on your own board while it fills up; once numbers are drawn it's history.
    if ((a.type === "claimed" || a.type === "joined") && g.isHost && filling && !mine && a.actor && byId.has(a.actor)) {
      if (burst && burst.actor === a.actor && burst.oldest - a.at <= BURST_MS) {
        burst.oldest = a.at;
      } else {
        flush();
        const player: Player = byId.get(a.actor)!;
        burst = {
          item: { ...base, id: `${g.id}:${a.id}`, at: a.at, tone: "social", text: "", detail: null, player },
          actor: a.actor,
          count: 0,
          joined: false,
          oldest: a.at,
        };
      }
      if (a.type === "claimed") burst.count += countOf(a);
      else burst.joined = true;
      continue;
    }
    // My own moves (and squares changing hands on boards I don't host) aren't news and don't break a run.
    if (a.type === "claimed" || a.type === "joined" || a.type === "released") continue;
    flush();

    if (a.type === "winner") {
      const periodKey = str(a.data.periodKey) ?? "";
      const label = str(a.data.label) ?? periodKey;
      const winners = ids(a.data.playerIds);
      if (winners.length === 0) continue;
      const score = s.scores.find((x) => x.periodKey === periodKey);
      const prize = str(a.data.prize);
      const detail = [score ? scoreWithTeams(s.game, score.scoreX, score.scoreY) : null, prize].filter(Boolean).join(" · ") || null;
      if (winners.includes(me)) {
        const result = results.find((r) => r.periodKey === periodKey);
        const reverseOnly = result ? result.winnerPlayerId !== me && result.reverseWinnerPlayerId === me : false;
        out.push({
          ...base,
          id: `${g.id}:${a.id}`,
          at: a.at,
          tone: "win",
          text: `Your ${reverseOnly ? "reverse " : ""}square hit ${phraseOf(periodKey, label).moment}`,
          detail,
          player: null,
        });
      } else {
        const names = winners.map((id) => byId.get(id)?.name.trim() || "Someone");
        out.push({
          ...base,
          id: `${g.id}:${a.id}`,
          at: a.at,
          tone: "live",
          text: `${joinNames(names)} hit ${phraseOf(periodKey, label).moment}`,
          detail,
          player: byId.get(winners[0]) ?? null,
        });
      }
    } else if (a.type === "locked" && !mine) {
      const count = s.squares.filter((q) => q.playerId === me).length;
      out.push({
        ...base,
        id: `${g.id}:${a.id}`,
        at: a.at,
        tone: "live",
        text: a.data.auto === true ? "Kickoff! Numbers are in" : "Numbers are in",
        detail: count > 0 ? `Find your ${count === 1 ? "square" : `${count} squares`}` : null,
        player: null,
      });
    } else if (a.type === "final" && !mine) {
      const last = results.at(-1)?.score ?? s.live;
      out.push({
        ...base,
        id: `${g.id}:${a.id}`,
        at: a.at,
        tone: "live",
        text: "That's final",
        detail: last ? scoreWithTeams(s.game, last.scoreX, last.scoreY) : null,
        player: null,
      });
    }
  }
  flush();

  // A full board waiting on the host's draw.
  if (g.isHost && s.game.status === "open" && s.squares.length >= g.totalSquares) {
    const filledAt = s.activity.find((a) => a.type === "claimed")?.at ?? g.lastActivityAt;
    out.push({
      ...base,
      id: `${g.id}:full`,
      at: filledAt,
      tone: "todo",
      text: "Your board is full",
      detail: "Draw the numbers to lock it in",
      player: null,
      href: `/g/${g.id}?draw=1`,
    });
  }
  return out;
}

/** Inbox rows across every board with a known state, newest first. */
export function buildInbox(games: readonly GameSummary[], states: Readonly<Record<string, GameState>>, me: string, now: number): InboxItem[] {
  const since = now - INBOX_MAX_AGE_MS;
  const items = games.flatMap((g) => (states[g.id] ? boardItems(g, states[g.id], me, since) : []));
  return items.sort((a, b) => b.at - a.at).slice(0, INBOX_LIMIT);
}

export function unreadCount(items: readonly InboxItem[], seenAt: number): number {
  return items.filter((i) => i.at > seenAt).length;
}

// ---- Seen marker (per device) ----

const SEEN_KEY = "jaxsquares.home.inboxSeenAt";
/** On a device that never opened the inbox, the last few hours count as new. */
export const FIRST_LOOK_MS = 6 * 60 * 60 * 1000;

export function readSeenAt(now = Date.now()): number {
  try {
    const v = Number(localStorage.getItem(SEEN_KEY));
    return Number.isFinite(v) && v > 0 ? v : now - FIRST_LOOK_MS;
  } catch {
    return now - FIRST_LOOK_MS;
  }
}

export function writeSeenAt(at: number): void {
  try {
    localStorage.setItem(SEEN_KEY, String(at));
  } catch {
    // private mode: the badge just comes back next time
  }
}
