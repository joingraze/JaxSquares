// Hourly cleanup, run from the cron (worker/index.ts `scheduled`):
// - boards left from the pay-to-open flow are settled: one its payment opened
//   counts as paid, and a draft opens (it pays at the draw like any new board),
// - each game keeps only its newest 200 activity rows (the API shows 50),
// - expired rate-limit windows are dropped,
// - co-host invite links used or expired over a day ago are dropped.

import * as db from "./db";
import type { Env } from "./env";
import { RATE_WINDOW_MAX_MS } from "./rateLimit";

export const ACTIVITY_KEEP = 200;
/** The cron fires every minute; housekeeping runs once an hour, at this UTC minute. */
export const HOUSEKEEPING_MINUTE = 17;
/** A used or expired co-host invite is kept this long (so its link still says why it doesn't work), then dropped. */
export const COHOST_INVITE_KEEP_MS = 24 * 60 * 60 * 1000;

export function isHousekeepingTick(scheduledTime: number): boolean {
  return new Date(scheduledTime).getUTCMinutes() === HOUSEKEEPING_MINUTE;
}

/** `opened`: leftover drafts it opened (the cron pushes their new state). */
export async function housekeeping(env: Pick<Env, "DB">, now = Date.now()): Promise<{ opened: string[]; activity: number }> {
  const opened = await db.settleLegacyBoards(env.DB, now);
  const activity = await db.pruneActivity(env.DB, ACTIVITY_KEEP);
  await db.pruneRateLimits(env.DB, now - RATE_WINDOW_MAX_MS);
  // Fails quietly until migration 0014 is applied.
  await db.pruneCohostInvites(env.DB, now - COHOST_INVITE_KEEP_MS).catch((err: unknown) => console.error("co-host invite cleanup failed", err));
  if (opened.length > 0 || activity > 0) {
    console.log(`housekeeping: ${opened.length} leftover drafts opened, ${activity} old activity rows pruned`);
  }
  return { opened, activity };
}
