// Hourly cleanup, run from the cron (worker/index.ts `scheduled`):
// - boards never paid for ("draft") are deleted after 7 days,
// - each game keeps only its newest 200 activity rows (the API shows 50),
// - expired rate-limit windows are dropped.

import * as db from "./db";
import type { Env } from "./env";
import { RATE_WINDOW_MAX_MS } from "./rateLimit";

export const DRAFT_TTL_MS = 7 * 24 * 60 * 60 * 1000;
export const ACTIVITY_KEEP = 200;
/** The cron fires every minute; housekeeping runs once an hour, at this UTC minute. */
export const HOUSEKEEPING_MINUTE = 17;

export function isHousekeepingTick(scheduledTime: number): boolean {
  return new Date(scheduledTime).getUTCMinutes() === HOUSEKEEPING_MINUTE;
}

export async function housekeeping(env: Pick<Env, "DB">, now = Date.now()): Promise<{ drafts: string[]; activity: number }> {
  const drafts = await db.deleteStaleDrafts(env.DB, now - DRAFT_TTL_MS);
  const activity = await db.pruneActivity(env.DB, ACTIVITY_KEEP);
  await db.pruneRateLimits(env.DB, now - RATE_WINDOW_MAX_MS);
  if (drafts.length > 0 || activity > 0) {
    console.log(`housekeeping: ${drafts.length} stale drafts deleted, ${activity} old activity rows pruned`);
  }
  return { drafts, activity };
}
