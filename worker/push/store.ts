// D1 access for push subscriptions and per-game mutes (tables from
// migrations/0004_push.sql). The core tables stay in worker/db.ts; this module
// owns its own, like payments/store.ts does.

import type { Platform, SendOutcome, SubscriptionRow } from "./types";

/** Oldest registrations beyond this are dropped, so one clientId can't fan a push out to endless endpoints. */
export const MAX_DEVICES_PER_CLIENT = 10;

/** D1 allows 100 bound parameters per statement; leave room for the game id. */
const IN_CHUNK = 90;

export type ParsedRegistration =
  | { platform: "web"; key: string; p256dh: string; auth: string }
  | { platform: Exclude<Platform, "web">; key: string };

/**
 * Insert or refresh a device. Re-registering (the app does it on every open)
 * also resets `unread`, which is what the badge counts.
 */
export async function upsertSubscription(db: D1Database, clientId: string, reg: ParsedRegistration, now: number): Promise<void> {
  const p256dh = reg.platform === "web" ? reg.p256dh : null;
  const auth = reg.platform === "web" ? reg.auth : null;
  await db.batch([
    db
      .prepare(
        `INSERT INTO push_subscriptions (endpoint_or_token, client_id, platform, p256dh, auth, unread, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, 0, ?, ?)
         ON CONFLICT(endpoint_or_token) DO UPDATE SET
           client_id = excluded.client_id, platform = excluded.platform, p256dh = excluded.p256dh,
           auth = excluded.auth, unread = 0, updated_at = excluded.updated_at`,
      )
      .bind(reg.key, clientId, reg.platform, p256dh, auth, now, now),
    db
      .prepare(
        `DELETE FROM push_subscriptions WHERE client_id = ? AND endpoint_or_token NOT IN (
           SELECT endpoint_or_token FROM push_subscriptions WHERE client_id = ? ORDER BY updated_at DESC LIMIT ?)`,
      )
      .bind(clientId, clientId, MAX_DEVICES_PER_CLIENT),
  ]);
}

export async function deleteSubscription(db: D1Database, clientId: string, key: string): Promise<void> {
  await db.prepare(`DELETE FROM push_subscriptions WHERE client_id = ? AND endpoint_or_token = ?`).bind(clientId, key).run();
}

const SUB_COLUMNS = `s.endpoint_or_token, s.client_id, s.platform, s.p256dh, s.auth, s.unread`;

/** Devices of these clients that haven't muted the game. */
export async function subscriptionsFor(db: D1Database, gameId: string, clientIds: string[]): Promise<SubscriptionRow[]> {
  const chunks: string[][] = [];
  for (let i = 0; i < clientIds.length; i += IN_CHUNK) chunks.push(clientIds.slice(i, i + IN_CHUNK));
  if (chunks.length === 0) return [];
  const results = await db.batch(
    chunks.map((ids) =>
      db
        .prepare(
          `SELECT ${SUB_COLUMNS} FROM push_subscriptions s
           WHERE s.client_id IN (${ids.map(() => "?").join(", ")})
             AND NOT EXISTS (SELECT 1 FROM game_mutes m WHERE m.game_id = ? AND m.client_id = s.client_id)`,
        )
        .bind(...ids, gameId),
    ),
  );
  return results.flatMap((r) => r.results as SubscriptionRow[]);
}

export async function subscriptionsForClient(db: D1Database, clientId: string): Promise<SubscriptionRow[]> {
  const { results } = await db.prepare(`SELECT ${SUB_COLUMNS} FROM push_subscriptions s WHERE s.client_id = ?`).bind(clientId).all<SubscriptionRow>();
  return results;
}

/** Record what each send did: bump the badge count on success, forget devices that are gone. */
export async function applyOutcomes(db: D1Database, outcomes: { key: string; outcome: SendOutcome }[], now: number): Promise<void> {
  const writes = outcomes.flatMap(({ key, outcome }) => {
    if (outcome === "ok") {
      return [db.prepare(`UPDATE push_subscriptions SET last_ok_at = ?, unread = unread + 1 WHERE endpoint_or_token = ?`).bind(now, key)];
    }
    if (outcome === "gone") return [db.prepare(`DELETE FROM push_subscriptions WHERE endpoint_or_token = ?`).bind(key)];
    return [];
  });
  if (writes.length > 0) await db.batch(writes);
}

export async function setMuted(db: D1Database, gameId: string, clientId: string, muted: boolean, now: number): Promise<void> {
  const stmt = muted
    ? db.prepare(`INSERT INTO game_mutes (game_id, client_id, created_at) VALUES (?, ?, ?) ON CONFLICT DO NOTHING`).bind(gameId, clientId, now)
    : db.prepare(`DELETE FROM game_mutes WHERE game_id = ? AND client_id = ?`).bind(gameId, clientId);
  await stmt.run();
}

export async function isMuted(db: D1Database, gameId: string, clientId: string): Promise<boolean> {
  const row = await db.prepare(`SELECT 1 AS muted FROM game_mutes WHERE game_id = ? AND client_id = ?`).bind(gameId, clientId).first();
  return row !== null;
}
