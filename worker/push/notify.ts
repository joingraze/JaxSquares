// notify(): turn a game event into pushes on every registered device of the
// right players. Runs inside waitUntil, so it never throws; failures are logged.

import type { VapidKeys } from "@block65/webcrypto-web-push";
import { getGame, getPlayers } from "../db";
import type { Env } from "../env";
import { coveredBySibling } from "./coalesce";
import { buildDeliveries } from "./copy";
import { parseServiceAccount, sendFcm, type ServiceAccount } from "./fcm";
import { applyOutcomes, subscriptionsFor } from "./store";
import type { Delivery, NotifyEvent, PushContent, SendOutcome, SubscriptionRow } from "./types";
import { sendWebPush, vapidFromEnv } from "./webpush";

/** Workers queue connections beyond six anyway; this keeps memory flat on big boards. */
const CONCURRENCY = 6;

export interface Channels {
  vapid: VapidKeys | null;
  fcm: ServiceAccount | null;
}

let warnedBadAccount = false;

export function channelsFrom(env: Env): Channels {
  const fcm = parseServiceAccount(env.FCM_SERVICE_ACCOUNT);
  if (env.FCM_SERVICE_ACCOUNT && !fcm && !warnedBadAccount) {
    warnedBadAccount = true;
    console.error("FCM_SERVICE_ACCOUNT is set but isn't a service account JSON; native pushes are off");
  }
  return { vapid: vapidFromEnv(env), fcm };
}

export interface Job {
  sub: SubscriptionRow;
  content: PushContent;
}

async function pool<T, R>(items: T[], limit: number, run: (item: T) => Promise<R>): Promise<R[]> {
  const out = new Array<R>(items.length);
  let next = 0;
  const worker = async () => {
    while (next < items.length) {
      const i = next++;
      out[i] = await run(items[i]);
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return out;
}

/** Pair deliveries with devices, skipping platforms whose service isn't configured. */
export function jobsFor(deliveries: Delivery[], subs: SubscriptionRow[], channels: Channels): Job[] {
  const byClient = new Map<string, PushContent>(deliveries.map((d) => [d.clientId, d.content]));
  return subs.flatMap((sub) => {
    const content = byClient.get(sub.client_id);
    if (!content) return [];
    if (sub.platform === "web" ? !channels.vapid : !channels.fcm) return [];
    return [{ sub, content }];
  });
}

/** Send every job, then record outcomes (badge counts, dead devices) in one batch. */
export async function deliver(
  db: D1Database,
  channels: Channels,
  jobs: Job[],
  fetcher: typeof fetch = fetch,
): Promise<Record<SendOutcome, number>> {
  const outcomes = await pool(jobs, CONCURRENCY, async ({ sub, content }) => {
    const badge = sub.unread + 1;
    const outcome =
      sub.platform === "web"
        ? await sendWebPush(sub, content, badge, channels.vapid!, fetcher)
        : await sendFcm(channels.fcm!, sub, content, badge, fetcher);
    return { key: sub.endpoint_or_token, outcome };
  });
  await applyOutcomes(db, outcomes, Date.now());
  const tally: Record<SendOutcome, number> = { ok: 0, gone: 0, "retry-auth": 0, error: 0 };
  for (const o of outcomes) tally[o.outcome]++;
  return tally;
}

export async function notify(env: Env, gameId: string, event: NotifyEvent): Promise<void> {
  // Must run before the first await so a sibling event dispatched alongside sees it.
  const covered = coveredBySibling(gameId, event);
  try {
    if (covered) return;
    const channels = channelsFrom(env);
    if (!channels.vapid && !channels.fcm) return;

    const [game, players] = await Promise.all([getGame(env.DB, gameId), getPlayers(env.DB, gameId)]);
    if (!game || game.status === "draft") return;
    const deliveries = buildDeliveries(game, players, event);
    if (deliveries.length === 0) return;

    const subs = await subscriptionsFor(env.DB, gameId, [...new Set(deliveries.map((d) => d.clientId))]);
    const jobs = jobsFor(deliveries, subs, channels);
    if (jobs.length === 0) return;

    const t = await deliver(env.DB, channels, jobs);
    console.log(`push ${gameId} ${event.kind}: ${t.ok} sent, ${t.gone} removed, ${t.error} failed`);
  } catch (err) {
    console.error(`push ${gameId} ${event.kind} failed`, err);
  }
}
