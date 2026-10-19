// Turns game events into email notices for the board's confirmed addresses,
// and sends them. Runs beside push in the notify pipeline (notifyAll in
// worker/service.ts, inside waitUntil or the room's alarm), so it never
// throws: failures are logged.
//
// Low volume on purpose (docs/email.md):
// - numbers drawn: the player's squares and their numbers;
// - a quarter-end or the half one of their squares won: "You won Q1!";
// - the final results: every moment's winners by name, and on an every-score
//   board how many scores each player won (no email per score).
// Each notice goes once per address (claimed in D1 before it's sent). Never
// an amount; a host's prize note is quoted only the way a push quotes it.

import { drawKeys, everyScoreIndex, hasScoreMoment, periodNote, periodPhrase, rulesOf, SHARED_DRAW_KEY } from "../../shared/formats";
import { freshNumbersInfo } from "../../shared/sports";
import { drawFor, fixedPeriodsOf, resolveResults, winnersOf, type PeriodResult } from "../../shared/squares";
import type { GameState, Team } from "../../shared/types";
import { getGameState } from "../db";
import type { Env } from "../env";
import { playerIdOf } from "../playerIds";
import type { NotifyEvent } from "../push/types";
import { emailSetup, type EmailSetup } from "./config";
import { resendSender, type OutgoingEmail } from "./sender";
import { claimNotices, confirmedOn, isMissingTable, type Recipient } from "./store";
import { confirmEmail, finalEmail, numbersEmail, winEmail, wonPhrase, type EmailFrame, type FinalFacts, type Rendered, type TeamLabel } from "./templates";
import { unsubscribeToken } from "./tokens";

/** "numbers", a quarter-end / half period key, or "final". */
export type NoticeKey = "numbers" | "q1" | "q2" | "q3" | "final";

/** Moments with a win email of their own (the final's winners are in the results email). */
const WIN_KEYS = new Set<string>(["q1", "q2", "q3"]);
const NOTICE_EVENTS = new Set<NotifyEvent["kind"]>(["numbers-drawn", "winner", "final"]);
/** Most players listed under "Scores won" in the results email. */
export const SCORE_WINNERS_LISTED = 10;

export interface Addressee extends Recipient {
  /** Public player id of the row's clientId. */
  playerId: string;
}

export interface NoticePlan {
  to: Addressee;
  key: NoticeKey;
}

/**
 * Who gets which notice for these events (pure). Only players still on the
 * board; the numbers only to those holding squares (and not the host who drew
 * them); a win email only for a quarter-end or the half on a board where
 * every score doesn't win (that board gets its summary at the end); the
 * results once the board is final. One plan per address and notice.
 */
export function planNotices(state: Pick<GameState, "game" | "players" | "squares">, recipients: Addressee[], events: NotifyEvent[]): NoticePlan[] {
  const { game } = state;
  const onBoard = new Set(state.players.map((p) => p.id));
  const holders = new Set(state.squares.map((s) => s.playerId));
  const everyScore = hasScoreMoment(rulesOf(game.format));
  const isFinal = game.status === "final";
  const plans = new Map<string, NoticePlan>();
  const add = (to: Addressee, key: NoticeKey) => plans.set(`${to.id}:${key}`, { to, key });
  const players = recipients.filter((r) => onBoard.has(r.playerId));

  for (const event of events) {
    switch (event.kind) {
      case "numbers-drawn":
        if (!game.numbers) break;
        for (const r of players) if (r.playerId !== event.actor && holders.has(r.playerId)) add(r, "numbers");
        break;
      case "winner":
        if (event.periodKey === "final") {
          if (isFinal) for (const r of players) add(r, "final");
          break;
        }
        if (everyScore || !WIN_KEYS.has(event.periodKey)) break;
        for (const r of players) if (event.playerIds.includes(r.playerId)) add(r, event.periodKey as NoticeKey);
        break;
      case "final":
        if (isFinal) for (const r of players) add(r, "final");
        break;
      default:
        break;
    }
  }
  return [...plans.values()];
}

// ---- Facts for the templates ----

export function teamLabel(t: Team): TeamLabel {
  return { abbr: t.abbr || t.name.slice(0, 3).toUpperCase(), name: t.name };
}

const digits = (d: number[] | undefined) => (d && d.length > 0 ? d.join("·") : "?");

/** My squares' numbers under the board's first draw (Q1's on a board with new numbers each quarter). */
export function numbersOf(state: GameState, playerId: string): { squares: { x: string; y: string }[]; freshLabel: string | null } {
  const { game } = state;
  const key = drawKeys(game.format)[0] ?? SHARED_DRAW_KEY;
  const draw = drawFor(game, key);
  const mine = state.squares.filter((s) => s.playerId === playerId).sort((a, b) => a.row - b.row || a.col - b.col);
  const squares = draw ? mine.map((s) => ({ x: digits(draw.x[s.col]), y: digits(draw.y[s.row]) })) : [];
  const freshLabel = key === SHARED_DRAW_KEY ? null : (fixedPeriodsOf(game).find((p) => p.key === key)?.label ?? periodPhrase(key).short);
  return { squares, freshLabel };
}

/** The game's final score: the Final period's, else the feed's once it's over, else the last score change. */
export function finalScoreOf(state: GameState, results: PeriodResult[]): { x: number; y: number } | null {
  const final = state.scores.find((s) => s.periodKey === "final");
  if (final) return { x: final.scoreX, y: final.scoreY };
  if (state.live?.state === "post") return { x: state.live.scoreX, y: state.live.scoreY };
  const last = [...results].reverse().find((r) => r.score);
  return last?.score ? { x: last.score.scoreX, y: last.score.scoreY } : null;
}

export function finalFactsOf(state: GameState, playerId: string, boardUrl: string): FinalFacts {
  const { game } = state;
  const results = resolveResults(state);
  const nameOf = (id: string) => state.players.find((p) => p.id === id)?.name || "Someone";
  const fixed = results.filter((r) => everyScoreIndex(r.periodKey) === null);
  const moments = fixed.map((r) => {
    const square = r.awardsSquare ? (r.winnerPlayerId ? nameOf(r.winnerPlayerId) : "Open square") : null;
    const reverse = r.awardsReverse ? (r.reverseWinnerPlayerId ? nameOf(r.reverseWinnerPlayerId) : "open square") : null;
    const winners = square && reverse ? `${square} · reverse: ${reverse}` : (square ?? `${reverse} (reverse)`);
    return { label: periodPhrase(r.periodKey, r.label).short, winners, mine: winnersOf(r).includes(playerId), key: r.periodKey, result: r };
  });
  const counts = new Map<string, number>();
  for (const r of results) if (everyScoreIndex(r.periodKey) !== null) for (const id of winnersOf(r)) counts.set(id, (counts.get(id) ?? 0) + 1);
  const scoreWins = [...counts.entries()]
    .map(([id, count]) => ({ name: nameOf(id), count, mine: id === playerId }))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name))
    .slice(0, SCORE_WINNERS_LISTED);
  return {
    teamX: teamLabel(game.teamX),
    teamY: teamLabel(game.teamY),
    score: finalScoreOf(state, results),
    moments: moments.map(({ label, winners, mine }) => ({ label, winners, mine })),
    scoreWins,
    everyScore: hasScoreMoment(rulesOf(game.format)),
    mine: { moments: moments.filter((m) => m.mine).map((m) => wonPhrase(m.key, m.result.label)), scores: counts.get(playerId) ?? 0 },
    boardUrl,
  };
}

// ---- Composing ----

async function frameFor(setup: EmailSetup, state: Pick<GameState, "game">, emailKey: string): Promise<EmailFrame> {
  const token = await unsubscribeToken(setup.secret, state.game.id, emailKey);
  return { boardName: state.game.name, origin: setup.origin, unsubscribeUrl: `${setup.origin}/api/email/unsubscribe?token=${token}` };
}

/** The message: the rendered email plus the RFC 8058 one-click unsubscribe headers. */
function message(to: string, frame: EmailFrame, rendered: Rendered): OutgoingEmail {
  return {
    to,
    subject: rendered.subject,
    html: rendered.html,
    text: rendered.text,
    headers: { "List-Unsubscribe": `<${frame.unsubscribeUrl}>`, "List-Unsubscribe-Post": "List-Unsubscribe=One-Click" },
  };
}

export async function composeNotice(plan: NoticePlan, state: GameState, setup: EmailSetup): Promise<OutgoingEmail> {
  const { game } = state;
  const frame = await frameFor(setup, state, plan.to.email_key);
  const boardUrl = `${setup.origin}/g/${game.id}`;
  const teamX = teamLabel(game.teamX);
  const teamY = teamLabel(game.teamY);
  let rendered: Rendered;
  if (plan.key === "numbers") {
    const { squares, freshLabel } = numbersOf(state, plan.to.playerId);
    rendered = numbersEmail(frame, {
      teamX,
      teamY,
      squares,
      freshLabel,
      freshEach: freshNumbersInfo(game).each,
      everyScore: hasScoreMoment(rulesOf(game.format)),
      boardUrl,
    });
  } else if (plan.key === "final") {
    rendered = finalEmail(frame, finalFactsOf(state, plan.to.playerId, boardUrl));
  } else {
    const r = resolveResults(state).find((x) => x.periodKey === plan.key);
    rendered = winEmail(frame, {
      periodKey: plan.key,
      label: r?.label ?? periodPhrase(plan.key).short,
      teamX,
      teamY,
      score: r?.score ? { x: r.score.scoreX, y: r.score.scoreY } : null,
      // The square's note (else the reverse square's), as the push quotes it; never an amount.
      note: periodNote(game.format, game.prizes, plan.key)?.trim() || null,
      boardUrl,
    });
  }
  return message(plan.to.email, frame, rendered);
}

/** The confirmation email ("Confirm your email for <board>"), with its link. */
export async function composeConfirmation(setup: EmailSetup, state: Pick<GameState, "game">, to: { email: string; emailKey: string }, token: string): Promise<OutgoingEmail> {
  const frame = await frameFor(setup, state, to.emailKey);
  return message(to.email, frame, confirmEmail(frame, `${setup.origin}/api/email/confirm?token=${token}`));
}

/** Sends the confirmation email. Never throws; false when it didn't go. */
export async function sendConfirmation(setup: EmailSetup, state: Pick<GameState, "game">, to: { email: string; emailKey: string }, token: string): Promise<boolean> {
  try {
    const result = await resendSender(setup.apiKey, setup.from).send([await composeConfirmation(setup, state, to, token)]);
    return result.sent === 1;
  } catch (err) {
    console.error(`email ${state.game.id} confirmation failed`, err);
    return false;
  }
}

// ---- The pipeline ----

/**
 * Email notices for a batch of events on one board (the same batch push gets).
 * Does nothing when email isn't set up, no event is one that emails, or nobody
 * on the board confirmed an address. Never throws.
 */
export async function emailNotices(env: Env, gameId: string, events: NotifyEvent[]): Promise<void> {
  if (!events.some((e) => NOTICE_EVENTS.has(e.kind))) return;
  const setup = emailSetup(env);
  if (!setup) return;
  const kinds = events.map((e) => e.kind).join(",");
  try {
    const recipients = await confirmedOn(env.DB, gameId);
    if (recipients.length === 0) return;
    const state = await getGameState(env.DB, gameId);
    if (!state) return;
    const addressees = await Promise.all(recipients.map(async (r) => ({ ...r, playerId: await playerIdOf(r.client_id) })));
    const plans = planNotices(state, addressees, events);
    if (plans.length === 0) return;
    const won = await claimNotices(
      env.DB,
      gameId,
      plans.map((p) => ({ id: p.to.id, key: p.key })),
    );
    const due = plans.filter((p) => won.has(`${p.to.id}:${p.key}`));
    if (due.length === 0) return;
    const messages = await Promise.all(due.map((p) => composeNotice(p, state, setup)));
    const t = await resendSender(setup.apiKey, setup.from).send(messages);
    console.log(`email ${gameId} ${kinds}: ${t.sent} sent, ${t.failed} failed`);
  } catch (err) {
    // Migration 0013 not applied yet: no addresses to email.
    if (isMissingTable(err)) return;
    console.error(`email ${gameId} ${kinds} failed`, err);
  }
}
