// The Annual Pass: a yearly subscription that covers the host fee of every
// board its holder hosts, and with the Venue add-on (plan "club") venue boards
// too (docs/payments.md "Annual Pass", shared/pricing.ts). What "active" means, what the
// API shows, and the lookups core uses when a board is drawn: POST /lock and a
// linked board's kickoff (worker/index.ts, worker/service.ts), the "kickoff
// soon" reminders and the board-full push. Kept free of routes and core
// imports so core can use it without a cycle.
//
// Active: status 'active' and paid up (current_period_end) in the future. While
// it auto-renews it gets a short grace window past the period end, so a renewal
// whose webhook or notification is a little late doesn't stop a draw; one that
// won't renew ends exactly at the period end. Checked when the pass is used:
// webhooks and notifications keep the rows current, so no cron is needed.

import type { PassCover } from "../../shared/pricing";
import type { HostPass, HostPassState, HostPassStatus, PassPlan } from "../../shared/types";
import type { Env } from "../env";
import { clubPassOffer, getPaymentConfig, hostPassOffer } from "./config";
import { isMissingTable, passesOf, type PassRow, type PassStatus } from "./store";

/** Past the period end, an auto-renewing pass still covers draws this long while its renewal lands. */
export const PASS_GRACE_MS = 24 * 60 * 60_000;

/** The pass covers the host fee at `now`. */
export function passCovers(p: Pick<PassRow, "status" | "currentPeriodEnd" | "autoRenew">, now: number): boolean {
  if (p.status !== "active" || p.currentPeriodEnd === null) return false;
  return now < p.currentPeriodEnd + (p.autoRenew ? PASS_GRACE_MS : 0);
}

/** The best active pass among `rows` (the one paid up the longest), or null. */
export function bestActive(rows: readonly PassRow[], now: number): PassRow | null {
  let best: PassRow | null = null;
  for (const p of rows) {
    if (!passCovers(p, now)) continue;
    if (!best || (p.currentPeriodEnd ?? 0) > (best.currentPeriodEnd ?? 0)) best = p;
  }
  return best;
}

function publicStatus(p: PassRow, now: number): HostPassStatus {
  if (p.status === "active") return passCovers(p, now) ? "active" : "ended";
  if (p.status === "pending") return "ended";
  return p.status;
}

/**
 * What the API shows for an identity's passes: the active one (paid up the
 * longest), else the latest that ever started (so the app can say it ended,
 * or that a renewal payment is being retried); null when there's none. A
 * Stripe subscription still waiting for its first payment isn't shown.
 */
export function passView(rows: readonly PassRow[], now: number): HostPass | null {
  const active = bestActive(rows, now);
  const shown = active ?? rows.filter((p) => p.status !== "pending").sort((a, b) => (b.currentPeriodEnd ?? 0) - (a.currentPeriodEnd ?? 0))[0];
  if (!shown) return null;
  const status = publicStatus(shown, now);
  const renews = status === "active" && shown.autoRenew;
  return {
    active: status === "active",
    status,
    provider: shown.provider,
    renewsAt: renews ? shown.currentPeriodEnd : null,
    endsAt: renews ? null : shown.currentPeriodEnd,
    autoRenew: shown.autoRenew,
  };
}

/** Passes, or none when migration 0011 isn't applied yet (a missing table never blocks play). */
async function rowsOf(db: D1Database, clientIds: readonly string[], activeOnly: boolean): Promise<PassRow[]> {
  try {
    return await passesOf(db, clientIds, { activeOnly });
  } catch (err) {
    if (isMissingTable(err)) return [];
    throw err;
  }
}

const ofPlan = (rows: readonly PassRow[], plan: PassPlan) => rows.filter((p) => p.plan === plan);

/**
 * The active pass any of these identities holds, or null: an Annual Pass or a
 * Annual Pass + Venue, since both cover the host fee. `clientIds` are canonical
 * clientIds: whoever draws (c.get("clientId")) and the board's host.
 */
export async function activePass(db: D1Database, clientIds: readonly string[], now = Date.now()): Promise<PassRow | null> {
  return bestActive(await rowsOf(db, clientIds, true), now);
}

/**
 * What these identities' active passes cover (shared/pricing.ts PassCover): the
 * Venue add-on when any holds an active pass with it (plan "club"), the host
 * fee when any holds one without, else nothing. Returns the pass that covers it.
 */
export async function passCover(db: D1Database, clientIds: readonly string[], now = Date.now()): Promise<{ cover: PassCover; pass: PassRow | null }> {
  const rows = (await rowsOf(db, clientIds, true)).filter((p) => passCovers(p, now));
  const venue = bestActive(ofPlan(rows, "club"), now);
  if (venue) return { cover: "venue", pass: venue };
  const pass = bestActive(rows, now);
  return { cover: pass ? "pass" : "none", pass };
}

/**
 * The identity's active Annual Pass + Venue, or null: what turns on the club features
 * on the boards it hosts (branding, 10 co-hosts, the players CSV, the club TV).
 */
export async function activeClubPass(db: D1Database, clientId: string, now = Date.now()): Promise<PassRow | null> {
  return bestActive(ofPlan(await rowsOf(db, [clientId], true), "club"), now);
}

/** The identity's Annual Pass as the API shows it (GET /api/me folds it in). An Annual Pass + Venue is shown apart (clubPassOf). */
export async function hostPassOf(db: D1Database, clientId: string, now = Date.now()): Promise<HostPass | null> {
  return passView(ofPlan(await rowsOf(db, [clientId], false), "host"), now);
}

/** The identity's Annual Pass + Venue as the API shows it (GET /api/me's `clubPass`). */
export async function clubPassOf(db: D1Database, clientId: string, now = Date.now()): Promise<HostPass | null> {
  return passView(ofPlan(await rowsOf(db, [clientId], false), "club"), now);
}

/** GET /api/payments/pass: the identity's passes (each plan apart) and how they're sold here. */
export async function passState(env: Env, clientId: string, now = Date.now()): Promise<HostPassState> {
  const rows = await rowsOf(env.DB, [clientId], false);
  const config = getPaymentConfig(env);
  const live = config.mode === "live";
  return {
    pass: passView(ofPlan(rows, "host"), now),
    offer: config.hostPass ?? hostPassOffer(env, live),
    club: passView(ofPlan(rows, "club"), now),
    clubOffer: config.clubPass ?? clubPassOffer(env, live),
  };
}

// ---- Provider states -> ours ----

/** A Stripe Subscription's status. */
export function stripePassStatus(status: string): PassStatus {
  switch (status) {
    case "active":
    case "trialing":
      return "active";
    case "past_due":
      return "past_due";
    case "incomplete":
      return "pending";
    default:
      // canceled, incomplete_expired, unpaid, paused
      return "ended";
  }
}

/**
 * An App Store subscription status (the App Store Server API's and
 * Notifications V2's `status`): 1 active, 2 expired, 3 billing retry, 4
 * billing grace period (still active), 5 revoked.
 */
export function applePassStatus(status: number | undefined): PassStatus | null {
  switch (status) {
    case 1:
    case 4:
      return "active";
    case 2:
      return "ended";
    case 3:
      return "past_due";
    case 5:
      return "revoked";
    default:
      return null;
  }
}
