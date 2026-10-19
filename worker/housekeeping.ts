// Hourly cleanup, run from the cron (worker/index.ts `scheduled`):
// - boards left from the pay-to-open flow are settled: one its payment opened
//   counts as paid, and a draft opens (it pays at the draw like any new board),
// - each game keeps only its newest 200 activity rows (the API shows 50),
// - expired rate-limit windows are dropped,
// - co-host invite links used or expired over a day ago are dropped,
// - email addresses that aren't needed any more are deleted (worker/email:
//   a week after the board's final, an unconfirmed one after its link
//   expires; docs/email.md).

import * as db from "./db";
import { pruneSubscriptions } from "./email/store";
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

/** Email addresses past their keep (0 when migration 0013 isn't applied yet, or it failed: logged, never blocking the rest). */
async function pruneEmail(env: Pick<Env, "DB">, now: number): Promise<number> {
  try {
    return await pruneSubscriptions(env.DB, now);
  } catch (err) {
    if (!/no such table/i.test(String(err))) console.error("housekeeping: email prune failed", err);
    return 0;
  }
}

/** `opened`: leftover drafts it opened (the cron pushes their new state). `emails`: addresses deleted. */
export async function housekeeping(env: Pick<Env, "DB">, now = Date.now()): Promise<{ opened: string[]; activity: number; emails: number }> {
  const opened = await db.settleLegacyBoards(env.DB, now);
  const activity = await db.pruneActivity(env.DB, ACTIVITY_KEEP);
  await db.pruneRateLimits(env.DB, now - RATE_WINDOW_MAX_MS);
  // Fails quietly until migration 0014 is applied.
  await db.pruneCohostInvites(env.DB, now - COHOST_INVITE_KEEP_MS).catch((err: unknown) => console.error("co-host invite cleanup failed", err));
  const emails = await pruneEmail(env, now);
  if (opened.length > 0 || activity > 0 || emails > 0) {
    console.log(`housekeeping: ${opened.length} leftover drafts opened, ${activity} old activity rows pruned, ${emails} email addresses deleted`);
  }
  return { opened, activity, emails };
}
