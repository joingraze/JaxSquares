// Pure dashboard logic for Home: which boards show at all, which section a
// board belongs in, what the card says and asks for, the glanceable "live"
// snapshot of a board in play, friend activity grouped by person, and the
// headline. No React or IO, so it is unit-tested in sections.test.ts.

import { gameKickoff } from "../../../shared/kickoff";
import type { GameState, GameSummary, HostProfile, Player, Team } from "../../../shared/types";
import { periodNote, periodPhrase } from "../../../shared/formats";
import { countdown, isHexColor, kickoffLabel, pluralize } from "../../lib/format";
import { lockIsTheMove } from "../host/hostModel";
import { prizeLineup } from "../rules/rulesModel";
import { boardPeriods, liveCell, liveLabel, myWins, resolveResults, upcomingPeriod, winCounts, type PeriodResult } from "../../../shared/squares";

export type SectionKey = "live" | "invites" | "needs" | "next" | "final";

export const SECTION_ORDER: readonly SectionKey[] = ["live", "invites", "needs", "next", "final"];

/** Host to-dos on a board that isn't in play yet. */
export type HostAction = "finish-setup" | "lock" | "invite";

/** Anything the user has to do on a board: a host to-do, or picking squares on a board they were invited to. */
export type BoardAction = HostAction | "pick";

/**
 * How this device stands with a board:
 * - host: it's my board;
 * - playing: I hold squares on it;
 * - invited: it's open with squares left and I have none yet (whether I only
 *   opened the invite or joined without picking);
 * - watching: no squares, and none to pick any more (full, drawn, in play or over).
 */
export type Relation = "host" | "playing" | "invited" | "watching";

export function relationOf(g: Pick<GameSummary, "isHost" | "mySquares" | "status" | "claimed" | "totalSquares">): Relation {
  if (g.isHost) return "host";
  if (g.mySquares > 0) return "playing";
  if (g.status === "open" && g.claimed < g.totalSquares) return "invited";
  return "watching";
}

/**
 * The boards Home shows: every board I host or joined, and the ones I only
 * opened that are still in my seen list (not hidden) and not over. A board I
 * never joined drops off once it's final (useMyGames prunes it from the seen
 * list), and one that isn't open yet waits until it is.
 */
export function homeBoards(games: readonly GameSummary[], seen: Iterable<string>): GameSummary[] {
  const kept = new Set(seen);
  return games.filter((g) => g.isHost || g.joined || (kept.has(g.id) && g.status !== "final" && g.status !== "draft"));
}

const DAY = 24 * 60 * 60 * 1000;

/** Same rule as the host bar: invite until the board is (nearly) full, then draw. */
export function hostAction(g: Pick<GameSummary, "status" | "claimed" | "totalSquares">): HostAction {
  if (g.status === "draft") return "finish-setup";
  if (lockIsTheMove(g.claimed, g.totalSquares)) return "lock";
  return "invite";
}

const inPlay = (g: GameSummary) => g.status === "locked" || g.live?.state === "in";

/** What this board needs from you before kickoff, if anything: a host to-do, or picking squares on an invite. */
export function actionFor(g: GameSummary): BoardAction | null {
  if (g.status === "final" || inPlay(g)) return null;
  if (g.isHost) return hostAction(g);
  if (relationOf(g) === "invited") return "pick";
  return null;
}

/**
 * Where a board sits on the dashboard: boards in play under "Live now" (the
 * ones I'm only watching too), boards waiting on my picks under "Invites",
 * host to-dos under "Needs you", the rest under "Up next" and "Final".
 */
export function sectionOf(g: GameSummary): SectionKey {
  if (g.status === "final") return "final";
  // A linked game that kicked off before the host drew numbers is still "live" news.
  if (inPlay(g)) return "live";
  if (relationOf(g) === "invited") return "invites";
  if (actionFor(g)) return "needs";
  return "next";
}

/** Most urgent first: a (nearly) full board holds up the game; picks on an invite beat inviting more. */
const ACTION_RANK: Record<BoardAction, number> = { lock: 0, pick: 1, invite: 2, "finish-setup": 3 };

export type Sections = Record<SectionKey, GameSummary[]>;

/**
 * Boards grouped by what they need, each group in its most useful order:
 * live by latest activity, invites by kickoff (soonest first, unscheduled
 * last), host to-dos by urgency (full boards first), upcoming by kickoff,
 * finals newest first. Pass the boards Home shows (homeBoards).
 */
export function groupBoards(games: readonly GameSummary[]): Sections {
  const out: Sections = { live: [], invites: [], needs: [], next: [], final: [] };
  for (const g of games) out[sectionOf(g)].push(g);
  const recent = (a: GameSummary, b: GameSummary) => b.lastActivityAt - a.lastActivityAt;
  out.live.sort(recent);
  out.final.sort(recent);
  out.invites.sort((a, b) => kickoffOrder(a, b) || recent(a, b));
  out.needs.sort((a, b) => ACTION_RANK[actionFor(a)!] - ACTION_RANK[actionFor(b)!] || kickoffOrder(a, b) || recent(a, b));
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
 * The one card whose action gets the filled button: the most urgent to-do on
 * the page (a full board waiting on the host's draw, else the first invite,
 * else the first host to-do). Every other action is outlined, whatever it is.
 */
export function primaryActionId(sections: Sections): string | null {
  const todo = sections.needs[0];
  if (todo && actionFor(todo) === "lock") return todo.id;
  return sections.invites[0]?.id ?? todo?.id ?? null;
}

// ---- Card copy ----

export interface CardModel {
  /** How I stand with the board (a card on a board I'm playing shows my avatar by the role). */
  relation: Relation;
  /** Role label: "Your board", "15 squares yours", or "Watching". */
  role: string;
  /** Game state, e.g. "42 left", "Board's full", "Kickoff Sun 8:56 PM". */
  status: string;
  statusTone: "brand" | "gold" | "muted";
  /** The status is the count of open squares (animated when it changes). */
  statusIsLeft: boolean;
  /** Trailing detail on the status line, e.g. "10 yours". */
  meta: string | null;
  action: { kind: BoardAction; label: string } | null;
  /** Show the fill meter (not on drafts). */
  meter: boolean;
  /** Friend activity is news here (boards still filling that you host or haven't picked on). */
  buzz: boolean;
}

export const ACTION_LABEL: Record<BoardAction, string> = {
  lock: "Draw numbers",
  invite: "Invite",
  pick: "Pick squares",
  "finish-setup": "Finish setup",
};

export function kickoffText(startsAt: number, now: number, short = false): string {
  const ms = startsAt - now;
  if (ms <= 0) return short ? "kicking off" : "Kicking off";
  if (ms < 2 * DAY) return short ? `kicks off in ${countdown(ms)}` : `Kickoff in ${countdown(ms)}`;
  return short ? kickoffLabel(startsAt, now) : `Kickoff ${kickoffLabel(startsAt, now)}`;
}

/** "15 squares yours": what a card on a board I'm playing says first. */
export function squaresYours(n: number): string {
  return `${pluralize(n, "square")} yours`;
}

/** What a board card says and asks for, for a board that isn't in play or final. */
export function cardModel(g: GameSummary, now: number): CardModel {
  const left = Math.max(0, g.totalSquares - g.claimed);
  const action = actionFor(g);
  const relation = relationOf(g);
  const role = relation === "host" ? "Your board" : relation === "playing" ? squaresYours(g.mySquares) : "Watching";
  // A playing card's role already says how many are mine; a host's card says it here.
  const mine = relation !== "host" ? null : g.mySquares > 0 ? `${g.mySquares} yours` : "none yours yet";
  const kickoff = g.startsAt !== null ? kickoffText(g.startsAt, now, true) : null;
  const base = { relation, role, action: action ? { kind: action, label: ACTION_LABEL[action] } : null };

  switch (action) {
    case "finish-setup":
      return { ...base, status: "Not open yet", statusTone: "brand", statusIsLeft: false, meta: "friends can join once it's open", meter: false, buzz: false };
    case "lock":
      return left === 0
        ? { ...base, status: "Board's full", statusTone: "gold", statusIsLeft: false, meta: kickoff ?? mine, meter: true, buzz: false }
        : { ...base, status: `${left} left`, statusTone: "gold", statusIsLeft: true, meta: kickoff ?? mine, meter: true, buzz: true };
    case "invite":
    case "pick":
      return { ...base, status: `${left} left`, statusTone: "brand", statusIsLeft: true, meta: kickoff ?? mine, meter: true, buzz: true };
    default: {
      if (left === 0) {
        // A playing card shows my squares there instead. Only a linked board draws on its own.
        const meta = relation === "playing" ? null : g.linked ? "numbers drawn at kickoff" : "waiting on the host's draw";
        return { ...base, status: "Board's full", statusTone: "muted", statusIsLeft: false, meta, meter: true, buzz: false };
      }
      const soon = g.startsAt !== null && g.startsAt - now < DAY;
      return g.startsAt !== null
        ? { ...base, status: kickoffText(g.startsAt, now), statusTone: soon ? "brand" : "muted", statusIsLeft: false, meta: mine, meter: true, buzz: false }
        : { ...base, status: `${left} left`, statusTone: "muted", statusIsLeft: true, meta: mine, meter: true, buzz: false };
    }
  }
}

// ---- Invite card copy ----

export interface InviteModel {
  /** Who asked you in: the host's public profile (null when the host has none). */
  inviter: HostProfile | null;
  /** "Maya invited you", or "You're invited" when the host has no name. */
  from: string;
  /** Open squares (the card's count, "42 squares left"). */
  left: number;
  /** "Chiefs vs Bills". */
  matchup: string;
  /** "kicks off in 2h 10m", "kicks off Sun 8:25 PM", or null for an unscheduled matchup. */
  kickoff: string | null;
  /**
   * What the host shows before anyone picks, in the board's own words (the
   * same lineup the board shows: "$10 a square · Q1 $100 · Final $400"), or
   * "Just for fun". null when the host set neither. In-app only.
   */
  lineup: { fun: boolean; parts: string[] } | null;
  /** I only opened the invite (no player row): "Not for me" hides it from Home. */
  canHide: boolean;
}

export function inviteModel(g: GameSummary, now: number): InviteModel {
  const name = g.host?.name.trim() ?? "";
  return {
    inviter: g.host,
    from: name ? `${name} invited you` : "You're invited",
    left: Math.max(0, g.totalSquares - g.claimed),
    matchup: `${g.teamX.name} vs ${g.teamY.name}`,
    kickoff: g.startsAt !== null ? kickoffText(g.startsAt, now, true) : null,
    lineup: prizeLineup(g.format),
    canHide: !g.joined && !g.isHost,
  };
}

// ---- Live board state on top of a summary ----

/**
 * The summary with everything a live board state knows more recently: counts,
 * status, your squares and wins, the score and who leads. Home follows the
 * boards you're in live, so this is how a card changes the moment a friend
 * grabs a square, without waiting for the next summary refresh.
 */
export function withState(g: GameSummary, s: GameState, me: string): GameSummary {
  const results = resolveResults(s);
  return {
    ...g,
    name: s.game.name,
    teamX: s.game.teamX,
    teamY: s.game.teamY,
    status: s.game.status,
    format: s.game.format,
    mySquares: s.squares.filter((q) => q.playerId === me).length,
    claimed: s.squares.length,
    playerCount: s.players.length,
    live: s.live,
    startsAt: gameKickoff(s.game),
    myWins: myWins(results, me).map((w) => ({ periodKey: w.periodKey, label: w.reverse ? `${w.label} (reverse)` : w.label })),
    lastActivityAt: Math.max(g.lastActivityAt, s.activity[0]?.at ?? 0),
    latestScore: latestScoreOf(s, results),
    leaderPlayerId: liveCell(s)?.playerId ?? results.at(-1)?.winnerPlayerId ?? null,
  };
}

/** Same rule as the server's dashboard query: the live feed's score, else the latest recorded period's. */
function latestScoreOf(s: GameState, results: PeriodResult[]): GameSummary["latestScore"] {
  const { live } = s;
  if (live && live.state !== "pre") return { scoreX: live.scoreX, scoreY: live.scoreY, label: liveLabel(live, s.game.status) };
  const last = [...results].reverse().find((r) => r.score);
  if (last?.score) return { scoreX: last.score.scoreX, scoreY: last.score.scoreY, label: last.label };
  const byKey = new Map(s.scores.map((x) => [x.periodKey, x]));
  const p = boardPeriods(s.game, s.scores).filter((x) => byKey.has(x.key)).at(-1);
  const score = p ? byKey.get(p.key) : undefined;
  return p && score ? { scoreX: score.scoreX, scoreY: score.scoreY, label: p.label } : null;
}

// ---- Team colors ----

/** Same fallbacks the board uses (teamVars): sky for X, pink for Y, so a custom matchup never shows grey marks. */
export const TEAM_X_FALLBACK = "#3ab7ff";
export const TEAM_Y_FALLBACK = "#ff66a6";

export function withTeamColors(teamX: Team, teamY: Team): [Team, Team] {
  return [
    isHexColor(teamX.color) ? teamX : { ...teamX, color: TEAM_X_FALLBACK },
    isHexColor(teamY.color) ? teamY : { ...teamY, color: TEAM_Y_FALLBACK },
  ];
}

// ---- Plain-language periods ----

/**
 * The app's one period vocabulary (periodPhrase), for a label that may carry
 * a "(reverse)" suffix: `short` for chips and clocks ("Q1", "Half", "Final"),
 * `moment` inside sentences ("at halftime", "at the end of Q1", "on score 3").
 */
export function phraseOf(periodKey: string, label = ""): { short: string; moment: string } {
  return periodPhrase(periodKey, label.replace(/\s*\(reverse\)$/, ""));
}

/** "at halftime" -> "At halftime", for a moment that starts a line. */
export function capitalize(text: string): string {
  return text ? text[0].toUpperCase() + text.slice(1) : text;
}

/** "SEA 22–26 ARI". */
export function scoreWithTeams(g: Pick<GameSummary, "teamX" | "teamY">, scoreX: number, scoreY: number): string {
  const abbr = (t: GameSummary["teamX"]) => t.abbr?.trim() || t.name;
  return `${abbr(g.teamX)} ${scoreX}–${scoreY} ${abbr(g.teamY)}`;
}

/** "once", "twice", "3 times". */
export function times(n: number): string {
  return n === 1 ? "once" : n === 2 ? "twice" : `${n} times`;
}

// ---- Live snapshot ----

export interface Leader {
  /** Public id of who holds the square (null = nobody claimed it). */
  playerId: string | null;
  player: Player | null;
  /** "now": the square the live score points at; "last": the latest period's winner. */
  kind: "now" | "last";
  /** Period key and label the square is for, e.g. "q3"/"Q3", "q2"/"Half". */
  periodKey: string | null;
  periodLabel: string;
  /** Digits of the square, X (columns) then Y (rows), e.g. [4, 0]. */
  digits: [number, number] | null;
  /** The host's prize note for that period, e.g. "Loser buys wings". */
  prize: string | null;
}

export interface LiveSnapshot {
  scoreX: number;
  scoreY: number;
  /** A score exists (live feed or a recorded period). */
  hasScore: boolean;
  /** A real live feed is mid-game. */
  inProgress: boolean;
  /** "Q3 4:12" (live feed), "Half", "Q1", "Final" (latest recorded period), "Numbers drawn". */
  clock: string;
  leader: Leader | null;
  /** This device holds the leading square (or its reverse). */
  meWinning: boolean;
  /** Next fixed period still to be decided, e.g. "Q3" (periodPhrase short). */
  nextLabel: string | null;
  /** The same period mid-sentence, e.g. "at the end of Q3" (periodPhrase moment). */
  nextMoment: string | null;
}

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
  const nextPhrase = next ? phraseOf(next.key, next.label) : null;
  const upNext = { nextLabel: nextPhrase?.short ?? null, nextMoment: nextPhrase?.moment || null };

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
      clock: liveLabel(live, game.status),
      leader: now
        ? {
            playerId: leaderId,
            player: leaderId ? (playerById.get(leaderId) ?? null) : null,
            kind: live.state === "in" ? "now" : "last",
            periodKey: now.periodKey,
            periodLabel: label,
            digits: [lastDigit(live.scoreX), lastDigit(live.scoreY)],
            // A note only, never an amount.
            prize: now.periodKey ? periodNote(game.format, game.prizes, now.periodKey) : null,
          }
        : null,
      meWinning: leaderId === me || reverseOwner === me,
      ...upNext,
    };
  }

  const last: PeriodResult | undefined = results.at(-1);
  if (!last) {
    return { scoreX: 0, scoreY: 0, hasScore: false, inProgress: false, clock: "Numbers drawn", leader: null, meWinning: false, ...upNext };
  }
  const leaderId = last.winnerPlayerId;
  return {
    scoreX: last.score?.scoreX ?? 0,
    scoreY: last.score?.scoreY ?? 0,
    hasScore: last.score !== null,
    inProgress: false,
    clock: phraseOf(last.periodKey, last.label).short,
    leader: {
      playerId: leaderId,
      player: leaderId ? (playerById.get(leaderId) ?? null) : null,
      kind: "last",
      periodKey: last.periodKey,
      periodLabel: last.label,
      digits: last.score ? [lastDigit(last.score.scoreX), lastDigit(last.score.scoreY)] : null,
      prize: last.prize,
    },
    meWinning: leaderId === me || last.reverseWinnerPlayerId === me,
    ...upNext,
  };
}

// ---- Buzz: friend activity, grouped by person ----

/** Friend activity older than this isn't news on a card. */
export const BUZZ_WINDOW_MS = 15 * 60 * 1000;
/** One person's moves this close to their latest read as one burst ("Maya grabbed 5 squares"). */
export const BURST_MS = 10 * 60 * 1000;

export interface Buzz {
  player: Player;
  text: string;
  /** When their latest move happened. */
  at: number;
  /** Other friends who were also active in the window. */
  others: number;
}

type Activity = GameState["activity"][number];

const isFriendMove = (a: Activity, me: string) =>
  !!a.actor && a.actor !== me && (a.type === "claimed" || a.type === "released" || a.type === "joined");

const countOf = (a: Activity) => Math.max(1, Math.trunc(Number(a.data.count)) || 1);

/**
 * What a friend just did on a board that's still filling up, with their
 * burst added together: five separate grabs read "Maya grabbed 5 squares"
 * (short enough to fit a card; a join alone reads "Maya joined"). Your own
 * moves and system events don't count; nothing older than the window shows.
 */
export function boardBuzz(state: GameState, me: string, now: number): Buzz | null {
  const byId = new Map(state.players.map((p) => [p.id, p]));
  const recent = state.activity.filter((a) => now - a.at <= BUZZ_WINDOW_MS && isFriendMove(a, me) && byId.has(a.actor!));
  const latest = recent[0];
  if (!latest) return null;
  const player = byId.get(latest.actor!)!;
  const burst = recent.filter((a) => a.actor === latest.actor && latest.at - a.at <= BURST_MS);
  const net = burst.reduce((n, a) => n + (a.type === "claimed" ? countOf(a) : a.type === "released" ? -countOf(a) : 0), 0);
  const joined = burst.some((a) => a.type === "joined");
  const grabbed = net === 1 ? "grabbed a square" : `grabbed ${net} squares`;
  let text: string;
  if (net > 0) text = `${player.name} ${grabbed}`;
  else if (joined) text = `${player.name} joined`;
  else return null; // only let go of squares: not news here
  const others = new Set(recent.filter((a) => a.actor !== latest.actor).map((a) => a.actor)).size;
  return { player, text, at: latest.at, others };
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
 * The one sentence at the top of Home: a summary of your day across boards
 * (the cards carry the details). Your live games and your hits there first,
 * then the most urgent to-do (a full board to draw, invites waiting on your
 * picks, then the host's other to-dos), a game you're only watching, then the
 * next kickoff.
 */
export function headlineFor(sections: Sections, opts: { winningNow: boolean; hits: number; now: number }): Headline {
  // A board you're only watching doesn't make it "your game".
  const live = sections.live.filter((g) => relationOf(g) !== "watching").length;
  if (live > 0) {
    const lead = live === 1 ? "Your game is live." : `${live} games live.`;
    if (opts.winningNow) return { lead, hot: "You're winning right now.", tone: "win" };
    if (opts.hits > 0) return { lead, hot: `You've hit ${times(opts.hits)}.`, tone: "win" };
    return live === 1 ? { lead: "Your game is", hot: "live.", tone: "live" } : { lead: `${live} games`, hot: "live right now.", tone: "live" };
  }
  const todo = sections.needs[0];
  const drawNow = !!todo && actionFor(todo) === "lock";
  if (drawNow) {
    return { lead: todo.claimed >= todo.totalSquares ? "Your board is full." : "Almost full.", hot: "Draw the numbers.", tone: "brand" };
  }
  const invites = sections.invites.length;
  if (invites > 1) return { lead: `${invites} boards`, hot: "waiting on your picks.", tone: "brand" };
  if (invites === 1) {
    const host = sections.invites[0].host?.name.trim();
    return host ? { lead: `${host} invited you.`, hot: "Grab your squares.", tone: "brand" } : { lead: "Squares are open.", hot: "Grab yours.", tone: "brand" };
  }
  if (todo) {
    switch (actionFor(todo)) {
      case "invite":
        return { lead: "Board's open.", hot: "Invite the crew.", tone: "brand" };
      default:
        return { lead: "Almost there.", hot: "Finish your board.", tone: "brand" };
    }
  }
  if (sections.live.length > 0) return { lead: "Game on.", hot: "You're watching live.", tone: "live" };
  if (sections.next.length > 0) {
    const kickoff = sections.next.find((g) => g.startsAt !== null && g.startsAt > opts.now)?.startsAt;
    return kickoff
      ? { lead: "Kickoff in", hot: `${countdown(kickoff - opts.now)}.`, tone: "brand" }
      : { lead: "You're in.", hot: "Now we wait.", tone: "brand" };
  }
  return { lead: "Good games.", hot: "Run it back?", tone: "brand" };
}

/** Your wins on boards that are in play (the headline's "you've hit twice"). */
export function liveHits(sections: Sections): number {
  return sections.live.reduce((n, g) => n + new Set(g.myWins.map((w) => w.periodKey)).size, 0);
}
