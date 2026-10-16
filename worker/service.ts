// Core game service shared by the routes, the GameRoom Durable Object and the
// payments/push modules. See docs/ARCHITECTURE.md "Cross-module function contracts".

import { everyScoreIndex } from "../shared/formats";
import {
  drawNumbers,
  liveChanged,
  nextEveryScoreEntry,
  periodScoresFromLinescores,
  resolveResults,
  winnersOf,
  type PeriodScore,
} from "../shared/squares";
import type { Activity, ActivityType, GameState, LiveStatus, LiveUpdate, Score } from "../shared/types";
import * as db from "./db";
import type { Env } from "./env";
import { notify, type NotifyEvent } from "./push";

export type Deliver = (state: GameState, activities: Activity[]) => Promise<void>;

export function newActivity(type: ActivityType, actor: string | null, data: Record<string, unknown> = {}, at = Date.now()): Activity {
  return { id: db.newActivityId(), type, at, actor, data };
}

export function roomStub(env: Env, gameId: string): DurableObjectStub {
  return env.GAME_ROOM.get(env.GAME_ROOM.idFromName(gameId));
}

/** Sends a state (and its new activity) to every socket in the game's room. Never throws. */
export async function pushToRoom(env: Env, gameId: string, state: GameState, activities: Activity[] = []): Promise<void> {
  try {
    const res = await roomStub(env, gameId).fetch("https://room/broadcast", {
      method: "POST",
      headers: { "content-type": "application/json", "x-game-id": gameId },
      body: JSON.stringify({ state, activities }),
    });
    if (!res.ok) console.error(`room broadcast ${gameId}: ${res.status}`);
  } catch (err) {
    console.error(`room broadcast ${gameId} failed`, err);
  }
}

/** Runs notify for each event, logging (not throwing) failures. */
export async function notifyAll(env: Env, gameId: string, events: NotifyEvent[]): Promise<void> {
  const results = await Promise.allSettled(events.map((e) => notify(env, gameId, e)));
  for (const r of results) if (r.status === "rejected") console.error(`notify ${gameId} failed`, r.reason);
}

export async function loadState(env: Env, gameId: string): Promise<GameState | null> {
  return db.getGameState(env.DB, gameId);
}

/**
 * Re-read state from D1 and push it to every socket in the game's room. When an
 * activity is given it is recorded (idempotently, by id) and sent as an event.
 */
export async function broadcast(env: Env, gameId: string, activity?: Activity): Promise<GameState | null> {
  const state = activity
    ? (await db.commit(env.DB, gameId, [db.insertActivity(env.DB, gameId, activity)])).state
    : await loadState(env, gameId);
  if (state) await pushToRoom(env, gameId, state, activity ? [activity] : []);
  return state;
}

/** draft -> open after a successful payment. Idempotent. */
export async function activateGame(
  env: Env,
  gameId: string,
  purchase: { provider: "test" | "stripe" | "iap"; reference: string; amountCents: number },
): Promise<GameState | null> {
  const current = await db.getGame(env.DB, gameId);
  if (!current) return null;
  if (current.status !== "draft") return loadState(env, gameId);
  const { state } = await db.commit(env.DB, gameId, [db.activateGame(env.DB, gameId, purchase, Date.now())]);
  if (state) await pushToRoom(env, gameId, state);
  return state;
}

/** Constant-time comparison so token checks don't leak how much of a guess matched. */
export function tokenMatches(a: string, b: string): boolean {
  if (!a || !b) return false;
  const enc = new TextEncoder();
  const x = enc.encode(a);
  const y = enc.encode(b);
  let diff = x.length ^ y.length;
  for (let i = 0; i < Math.max(x.length, y.length); i++) diff |= (x[i] ?? 0) ^ (y[i] ?? 0);
  return diff === 0;
}

export async function isHost(env: Env, gameId: string, adminToken: string): Promise<boolean> {
  if (!adminToken) return false;
  const token = await db.getAdminToken(env.DB, gameId);
  return !!token && tokenMatches(token, adminToken);
}

/**
 * Activities + notifications for periods whose score just changed: one "score"
 * event each, plus a "winner" event when the square is owned. `projected` is
 * the state as it will be once the writes land.
 */
export function scoreEvents(
  projected: Pick<GameState, "game" | "squares" | "scores" | "manualWinners">,
  changed: { periodKey: string; label: string; scoreX: number; scoreY: number }[],
  source: Score["source"],
  actor: string | null,
  now: number,
): { activities: Activity[]; notifications: NotifyEvent[] } {
  const activities: Activity[] = [];
  const notifications: NotifyEvent[] = [];
  const results = resolveResults(projected);
  for (const c of changed) {
    activities.push(
      newActivity("score", actor, { periodKey: c.periodKey, label: c.label, scoreX: c.scoreX, scoreY: c.scoreY, source }, now),
    );
    const r = results.find((x) => x.periodKey === c.periodKey);
    if (!r) continue;
    const clientIds = winnersOf(r);
    if (clientIds.length === 0) continue;
    activities.push(
      newActivity(
        "winner",
        actor,
        { periodKey: r.periodKey, label: r.label, clientIds, cell: r.cell, reverseCell: r.reverseCell, prize: r.prize },
        now,
      ),
    );
    notifications.push({ kind: "winner", periodKey: r.periodKey, label: r.label, clientIds });
  }
  return { activities, notifications };
}

function upsertScores(scores: Score[], changed: PeriodScore[], now: number): Score[] {
  const by = new Map(scores.map((s) => [s.periodKey, s]));
  for (const c of changed) {
    const s: Score = { periodKey: c.periodKey, scoreX: c.scoreX, scoreY: c.scoreY, source: "live", updatedAt: now };
    if (everyScoreIndex(c.periodKey) !== null) s.label = c.label;
    by.set(c.periodKey, s);
  }
  return [...by.values()];
}

/**
 * Apply a provider update to a linked board: upsert live status + completed
 * period scores (never replacing a host-entered score), append every-score
 * entries when the total changes, lock at kickoff if the host hasn't, and mark
 * the board final when the game ends. Pushes the new state and sends pushes.
 *
 * `deliver` lets the GameRoom (which calls this from its alarm) broadcast to its
 * own sockets directly instead of fetching itself.
 */
export async function applyLiveUpdate(
  env: Env,
  gameId: string,
  update: LiveUpdate,
  deliver: Deliver = (state, activities) => pushToRoom(env, gameId, state, activities),
): Promise<void> {
  const prev = await loadState(env, gameId);
  if (!prev || !prev.game.linkedEvent) return;
  const { game } = prev;
  if (game.status === "draft") return;

  const now = Date.now();
  const live: LiveStatus = { ...update.live, updatedAt: update.live.updatedAt || now };
  const writes: D1PreparedStatement[] = [];
  const activities: Activity[] = [];
  const notifications: NotifyEvent[] = [];
  // Activities whose insert is conditional on their write applying (lock/final);
  // their notification is only sent if the activity was actually recorded.
  const conditional = new Map<string, NotifyEvent>();

  if (liveChanged(prev.live, live)) writes.push(db.upsertLive(env.DB, gameId, live));

  if (live.state === "in" && prev.live?.state !== "in" && prev.live?.state !== "post" && game.status !== "final") {
    notifications.push({ kind: "game-starting" });
  }

  // Boards linked to a real game lock at kickoff so every period can be decided.
  // (Not on a "post" that isn't final: that's a postponed/canceled game.)
  let numbers = game.numbers;
  let status = game.status;
  if (status === "open" && (live.state === "in" || update.isFinal)) {
    numbers = drawNumbers(game.format);
    const locked = newActivity("locked", null, { auto: true }, now);
    writes.push(db.lockGame(env.DB, gameId, numbers, now), db.insertActivityIfChanged(env.DB, gameId, locked));
    activities.push(locked);
    conditional.set(locked.id, { kind: "numbers-drawn" });
    status = "locked";
  }

  const changed: PeriodScore[] = [];
  if (game.format.periods === "every-score") {
    const entry = live.state === "pre" ? null : nextEveryScoreEntry(prev.scores, live.scoreX, live.scoreY);
    if (entry) changed.push(entry);
  } else {
    const existing = new Map(prev.scores.map((s) => [s.periodKey, s]));
    for (const ps of periodScoresFromLinescores(game.format, update)) {
      const cur = existing.get(ps.periodKey);
      if (cur?.source === "host") continue;
      if (cur && cur.scoreX === ps.scoreX && cur.scoreY === ps.scoreY) continue;
      changed.push(ps);
    }
  }
  for (const c of changed) {
    const label = game.format.periods === "every-score" ? c.label : null;
    writes.push(db.upsertLiveScore(env.DB, gameId, { ...c, label }, now));
  }
  if (changed.length > 0) {
    const projected = { ...prev, game: { ...game, numbers }, scores: upsertScores(prev.scores, changed, now) };
    const events = scoreEvents(projected, changed, "live", null, now);
    activities.push(...events.activities);
    notifications.push(...events.notifications);
  }

  if (update.isFinal && status === "locked") {
    const final = newActivity("final", null, {}, now);
    writes.push(db.setFinal(env.DB, gameId), db.insertActivityIfChanged(env.DB, gameId, final));
    activities.push(final);
    conditional.set(final.id, { kind: "final" });
  }

  if (writes.length === 0) return;
  for (const a of activities) if (!conditional.has(a.id)) writes.push(db.insertActivity(env.DB, gameId, a));

  const { state } = await db.commit(env.DB, gameId, writes, now);
  if (!state) return;
  const recorded = new Set(state.activity.map((a) => a.id));
  for (const [id, event] of conditional) if (recorded.has(id)) notifications.push(event);
  await deliver(state, activities.filter((a) => recorded.has(a.id)));
  await notifyAll(env, gameId, notifications);
}
