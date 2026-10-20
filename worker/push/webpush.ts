// Web push (RFC 8030/8291/8292) for browsers and iOS home-screen web apps, via
// @block65/webcrypto-web-push. The payload is JSON that public/sw.js renders.

import { buildPushPayload, type VapidKeys } from "@block65/webcrypto-web-push";
import type { Env } from "../env";
import type { PushContent, SendOutcome, SubscriptionRow } from "./types";

const SEND_TIMEOUT_MS = 10_000;

/** What public/sw.js receives in `event.data.json()`. */
export interface WebPushPayload {
  title: string;
  body: string;
  url: string;
  tag: string;
  renotify: boolean;
  /** Show without sound or vibration. */
  quiet: boolean;
  /** App badge count to show (Badging API); the device's unread pushes. */
  badge: number;
  gameId: string;
  kind: PushContent["kind"];
}

/** VAPID keys from the environment, or null when web push isn't configured. */
export function vapidFromEnv(env: Pick<Env, "VAPID_PUBLIC_KEY" | "VAPID_PRIVATE_KEY" | "VAPID_SUBJECT" | "APP_ORIGIN">): VapidKeys | null {
  if (!env.VAPID_PUBLIC_KEY || !env.VAPID_PRIVATE_KEY) return null;
  return {
    publicKey: env.VAPID_PUBLIC_KEY,
    privateKey: env.VAPID_PRIVATE_KEY,
    // Apple rejects VAPID subjects that aren't a mailto: or https: URL.
    subject: env.VAPID_SUBJECT || env.APP_ORIGIN || "https://jaxsquares.com",
  };
}

export function webPayload(content: PushContent, badge: number): WebPushPayload {
  const { title, body, url, tag, renotify, quiet, gameId, kind } = content;
  return { title, body, url, tag, renotify, quiet, badge, gameId, kind };
}

/** RFC 8030 Topic: at most 32 characters of the URL-safe base64 alphabet. */
export function webTopic(tag: string): string {
  return tag.replace(/[^A-Za-z0-9_-]/g, "-").slice(0, 32);
}

/** 404/410 mean the subscription is gone for good; anything else might be us or a blip. */
export function webPushOutcome(status: number): SendOutcome {
  if (status >= 200 && status < 300) return "ok";
  if (status === 404 || status === 410) return "gone";
  return "error";
}

export async function sendWebPush(
  sub: SubscriptionRow,
  content: PushContent,
  badge: number,
  vapid: VapidKeys,
  fetcher: typeof fetch = fetch,
): Promise<SendOutcome> {
  if (!sub.p256dh || !sub.auth) return "gone";
  try {
    const payload = await buildPushPayload(
      {
        data: { ...webPayload(content, badge) },
        options: { ttl: content.ttlSeconds, urgency: content.urgency, topic: webTopic(content.tag) },
      },
      { endpoint: sub.endpoint_or_token, expirationTime: null, keys: { p256dh: sub.p256dh, auth: sub.auth } },
      vapid,
    );
    const res = await fetcher(sub.endpoint_or_token, { ...payload, signal: AbortSignal.timeout(SEND_TIMEOUT_MS) });
    const outcome = webPushOutcome(res.status);
    if (outcome === "error") console.warn(`web push ${new URL(sub.endpoint_or_token).host}: ${res.status} ${await res.text().catch(() => "")}`);
    else await res.body?.cancel();
    return outcome;
  } catch (err) {
    console.warn("web push send failed", err);
    return "error";
  }
}
