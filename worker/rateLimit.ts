// Light rate limits on the endpoints worth abusing: creating boards, joining
// them, claiming/releasing squares, co-host links, signing in, the Host
// Pass checkout (each call there can reach Stripe or Apple) and email
// notices (each sign-up sends an email to an address someone typed). Fixed windows counted in D1
// (rate_limits, migrations/0005_housekeeping.sql), keyed by
// "<rule>:<public player id>" (or "<rule>:<game id>" for per-board rules, or
// "<rule>:<hashed address>" for per-address rules) so the table never holds a
// clientId or a raw IP. Best effort: if the counter can't be read the request
// goes through (a missing table must never block play).
//
// A clientId is free to mint, so each per-device rule has a per-address twin
// (CF-Connecting-IP): one source rotating made-up ids still runs into it. The
// address limits are generous, since a household, a bar's Wi-Fi or a carrier
// NAT puts many real people behind one address.

import * as db from "./db";

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;

/** Friendly 429 messages, shared by a per-device rule and its per-address twin. */
const TOO_MANY = {
  create: "That's a lot of new boards for one hour. Take a breather and try again a little later.",
  taps: "Whoa, that's a lot of taps. Give it a few seconds and try again.",
  changes: "Whoa, that's a lot of changes. Give it a few seconds and try again.",
  signIn: "That's a lot of sign-in attempts. Take a breather and try again a little later.",
  checkout: "That's a lot of checkout attempts. Take a breather and try again a little later.",
  cohost: "That's a lot of co-host links for one hour. Take a breather and try again a little later.",
  email: "That's a lot of email changes for one hour. Try again a little later.",
};

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
    message: TOO_MANY.create,
  },
  /** POST /api/games/:id/claim and /release, shared. */
  squares: {
    name: "squares",
    limit: 60,
    windowMs: MINUTE,
    message: TOO_MANY.taps,
  },
  /** POST /api/games/:id/join (joins and renames), per device. */
  join: {
    name: "join",
    limit: 60,
    windowMs: MINUTE,
    message: TOO_MANY.changes,
  },
  /** Per network address: `createGame` for everyone behind one address. */
  createGameIp: {
    name: "create-ip",
    limit: 20,
    windowMs: HOUR,
    message: TOO_MANY.create,
  },
  /** Per network address: `squares` for everyone behind one address. */
  squaresIp: {
    name: "squares-ip",
    limit: 300,
    windowMs: MINUTE,
    message: TOO_MANY.taps,
  },
  /** Per network address: `join` for everyone behind one address. */
  joinIp: {
    name: "join-ip",
    limit: 120,
    windowMs: MINUTE,
    message: TOO_MANY.changes,
  },
  /** Optional sign-in (worker/auth): signing in, signing out and deleting the account, per device. */
  auth: {
    name: "auth",
    limit: 20,
    windowMs: HOUR,
    message: TOO_MANY.signIn,
  },
  /** Per network address: `auth` for everyone behind one address. */
  authIp: {
    name: "auth-ip",
    limit: 60,
    windowMs: HOUR,
    message: TOO_MANY.signIn,
  },
  /** The Host Pass (worker/payments): starting, confirming or restoring a purchase, the test pass and Manage, per device. */
  pass: {
    name: "pass",
    limit: 30,
    windowMs: HOUR,
    message: TOO_MANY.checkout,
  },
  /** Per network address: `pass` for everyone behind one address. */
  passIp: {
    name: "pass-ip",
    limit: 120,
    windowMs: HOUR,
    message: TOO_MANY.checkout,
  },
  /** POST /api/games/:id/cohost-invites (the host makes a co-host link), per device. */
  cohostInvite: {
    name: "cohost-invite",
    limit: 20,
    windowMs: HOUR,
    message: TOO_MANY.cohost,
  },
  /** Per network address: `cohostInvite` for everyone behind one address. */
  cohostInviteIp: {
    name: "cohost-invite-ip",
    limit: 60,
    windowMs: HOUR,
    message: TOO_MANY.cohost,
  },
  /** POST /api/games/:id/cohosts/accept, per device: counted before the token is looked up, so links can't be guessed at speed. */
  cohostAccept: {
    name: "cohost-accept",
    limit: 20,
    windowMs: HOUR,
    message: TOO_MANY.cohost,
  },
  /** Per network address: `cohostAccept` for everyone behind one address. */
  cohostAcceptIp: {
    name: "cohost-accept-ip",
    limit: 60,
    windowMs: HOUR,
    message: TOO_MANY.cohost,
  },
  /** Email notices (worker/email): adding, resending or removing an address, per device. */
  email: {
    name: "email",
    limit: 20,
    windowMs: HOUR,
    message: TOO_MANY.email,
  },
  /** Per network address: `email` for everyone behind one address. */
  emailIp: {
    name: "email-ip",
    limit: 60,
    windowMs: HOUR,
    message: TOO_MANY.email,
  },
  /**
   * Confirmation emails to one address (keyed by its keyed hash, never the
   * address), whoever asks: nobody can flood someone's inbox from many devices.
   */
  emailSend: {
    name: "email-send",
    limit: 5,
    windowMs: HOUR,
    message: "We've sent a few confirmation emails to that address already. Check your inbox (and spam), or try again in an hour.",
  },
  /** GET /api/games/:id/email, per device. */
  emailStatus: {
    name: "email-status",
    limit: 120,
    windowMs: MINUTE,
    message: TOO_MANY.taps,
  },
  /** The confirm and unsubscribe pages an email's links open, per network address. */
  emailLinkIp: {
    name: "email-link-ip",
    limit: 60,
    windowMs: MINUTE,
    message: "That's a lot of clicks. Give it a minute and try again.",
  },
  /**
   * New players joining one board, keyed by game id: clientIds are free to
   * mint, so a per-device count alone can't stop a script filling a board.
   */
  joinBoard: {
    name: "join-board",
    limit: 30,
    windowMs: MINUTE,
    message: "Lots of people are joining this board right now. Give it a few seconds and try again.",
  },
} as const satisfies Record<string, RateRule>;

/** The longest window; counters older than this are dead weight (the cron prunes them). */
export const RATE_WINDOW_MAX_MS = HOUR;

export interface RateDecision {
  ok: boolean;
  /** Seconds until the current window resets (for Retry-After). */
  retryAfter: number;
}

/**
 * The rate-limit subject for a network address: a one-way hash, so the
 * counters never hold the address itself.
 */
export async function addressSubject(ip: string): Promise<string> {
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(`jaxsquares:ip:${ip}`)));
  return Array.from(digest.slice(0, 12), (b) => b.toString(16).padStart(2, "0")).join("");
}

/** Counts this request against `rule` for `subject` (a public player id, a game id, a hashed network address, or an email address's keyed hash). */
export async function checkRate(d1: D1Database, rule: RateRule, subject: string, now = Date.now()): Promise<RateDecision> {
  const retryAfter = Math.max(1, Math.ceil((rule.windowMs - (now % rule.windowMs)) / 1000));
  try {
    const hits = await db.hitRateLimit(d1, `${rule.name}:${subject}`, rule.windowMs, now);
    return { ok: hits <= rule.limit, retryAfter };
  } catch (err) {
    console.error(`rate limit ${rule.name} unavailable`, err);
    return { ok: true, retryAfter };
  }
}
