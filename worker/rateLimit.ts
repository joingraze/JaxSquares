// Light per-player rate limits on the endpoints worth abusing: creating boards
// and claiming/releasing squares. Fixed windows counted in D1 (rate_limits,
// migrations/0005_housekeeping.sql), keyed by "<rule>:<public player id>" so the
// table never holds a clientId. Best effort: if the counter can't be read the
// request goes through (a missing table must never block play).

import * as db from "./db";

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;

export interface RateRule {
  name: string;
  limit: number;
  windowMs: number;
  /** Friendly 429 message the UI can show as-is. */
  message: string;
}

export const RATE_LIMITS = {
  /** POST /api/games */
  createGame: {
    name: "create",
    limit: 10,
    windowMs: HOUR,
    message: "That's a lot of new boards for one hour. Take a breather and try again a little later.",
  },
  /** POST /api/games/:id/claim and /release, shared. */
  squares: {
    name: "squares",
    limit: 60,
    windowMs: MINUTE,
    message: "Whoa, that's a lot of taps. Give it a few seconds and try again.",
  },
} as const satisfies Record<string, RateRule>;

/** The longest window; counters older than this are dead weight (the cron prunes them). */
export const RATE_WINDOW_MAX_MS = HOUR;

export interface RateDecision {
  ok: boolean;
  /** Seconds until the current window resets (for Retry-After). */
  retryAfter: number;
}

/** Counts this request against `rule` for `playerId`. */
export async function checkRate(d1: D1Database, rule: RateRule, playerId: string, now = Date.now()): Promise<RateDecision> {
  const retryAfter = Math.max(1, Math.ceil((rule.windowMs - (now % rule.windowMs)) / 1000));
  try {
    const hits = await db.hitRateLimit(d1, `${rule.name}:${playerId}`, rule.windowMs, now);
    return { ok: hits <= rule.limit, retryAfter };
  } catch (err) {
    console.error(`rate limit ${rule.name} unavailable`, err);
    return { ok: true, retryAfter };
  }
}
