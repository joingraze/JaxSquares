// Native pushes (iOS via APNs, Android) through Firebase Cloud Messaging HTTP v1.
// Auth is a Google OAuth access token minted from the FCM_SERVICE_ACCOUNT secret:
// an RS256 JWT signed with WebCrypto, exchanged at Google's token endpoint, and
// cached in memory until shortly before it expires.

import type { PushContent, SendOutcome, SubscriptionRow } from "./types";

export const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
export const FCM_SCOPE = "https://www.googleapis.com/auth/firebase.messaging";
/** Android channels the app creates on first enable (src/lib/push.ts): game moments, and quiet board activity. */
export const ANDROID_CHANNEL_ID = "game-updates";
export const ANDROID_QUIET_CHANNEL_ID = "board-activity";

const TOKEN_LIFETIME_S = 3600;
const REFRESH_MARGIN_MS = 5 * 60 * 1000;
const SEND_TIMEOUT_MS = 10_000;

export interface ServiceAccount {
  project_id: string;
  client_email: string;
  private_key: string;
  private_key_id?: string;
}

/** The secret holds the service account JSON as downloaded (or base64 of it). */
export function parseServiceAccount(raw: string | undefined): ServiceAccount | null {
  if (!raw?.trim()) return null;
  let text = raw.trim();
  if (!text.startsWith("{")) {
    try {
      text = atob(text);
    } catch {
      return null;
    }
  }
  try {
    const sa = JSON.parse(text) as Partial<ServiceAccount>;
    if (typeof sa.project_id !== "string" || typeof sa.client_email !== "string" || typeof sa.private_key !== "string") return null;
    if (!sa.private_key.includes("PRIVATE KEY")) return null;
    return { project_id: sa.project_id, client_email: sa.client_email, private_key: sa.private_key, private_key_id: sa.private_key_id };
  } catch {
    return null;
  }
}

// ---- JWT assertion ----

const enc = new TextEncoder();

function base64Url(bytes: Uint8Array): string {
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

const jsonPart = (v: unknown) => base64Url(enc.encode(JSON.stringify(v)));

function pemToDer(pem: string): Uint8Array {
  const b64 = pem
    .replace(/\\n/g, "\n")
    .replace(/-----(BEGIN|END) PRIVATE KEY-----/g, "")
    .replace(/\s+/g, "");
  return Uint8Array.from(atob(b64), (ch) => ch.charCodeAt(0));
}

export function assertionHeader(sa: ServiceAccount): Record<string, string> {
  return sa.private_key_id ? { alg: "RS256", typ: "JWT", kid: sa.private_key_id } : { alg: "RS256", typ: "JWT" };
}

/** Claims for Google's JWT-bearer grant (service account → access token). */
export function assertionClaims(sa: ServiceAccount, nowSeconds: number): Record<string, string | number> {
  return {
    iss: sa.client_email,
    scope: FCM_SCOPE,
    aud: GOOGLE_TOKEN_URL,
    iat: nowSeconds,
    exp: nowSeconds + TOKEN_LIFETIME_S,
  };
}

export async function signAssertion(sa: ServiceAccount, nowSeconds: number): Promise<string> {
  const key = await crypto.subtle.importKey("pkcs8", pemToDer(sa.private_key), { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, [
    "sign",
  ]);
  const unsigned = `${jsonPart(assertionHeader(sa))}.${jsonPart(assertionClaims(sa, nowSeconds))}`;
  const sig = await crypto.subtle.sign("RSASSA-PKCS1-v1_5", key, enc.encode(unsigned));
  return `${unsigned}.${base64Url(new Uint8Array(sig))}`;
}

// ---- Access token (cached per isolate) ----

/** After a failed exchange, sends fail fast for a bit instead of each retrying it. */
const FAILURE_BACKOFF_MS = 60 * 1000;

let cached: { email: string; token: string; expiresAt: number } | null = null;
let inflight: { email: string; promise: Promise<string> } | null = null;
let failed: { email: string; until: number; error: Error } | null = null;

export function resetTokenCache(): void {
  cached = null;
  inflight = null;
  failed = null;
}

export async function getAccessToken(sa: ServiceAccount, fetcher: typeof fetch = fetch, now = Date.now()): Promise<string> {
  if (cached && cached.email === sa.client_email && cached.expiresAt > now) return cached.token;
  if (inflight && inflight.email === sa.client_email) return inflight.promise;
  if (failed && failed.email === sa.client_email && failed.until > now) throw failed.error;
  const promise = (async () => {
    const assertion = await signAssertion(sa, Math.floor(now / 1000));
    const res = await fetcher(GOOGLE_TOKEN_URL, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion }).toString(),
      signal: AbortSignal.timeout(SEND_TIMEOUT_MS),
    });
    const data = (await res.json().catch(() => ({}))) as { access_token?: string; expires_in?: number; error?: string };
    if (!res.ok || !data.access_token) throw new Error(`Google token exchange failed: ${res.status} ${data.error ?? ""}`.trim());
    const ttlMs = (data.expires_in ?? TOKEN_LIFETIME_S) * 1000;
    cached = { email: sa.client_email, token: data.access_token, expiresAt: now + ttlMs - REFRESH_MARGIN_MS };
    return data.access_token;
  })();
  inflight = { email: sa.client_email, promise };
  try {
    return await promise;
  } catch (err) {
    failed = { email: sa.client_email, until: now + FAILURE_BACKOFF_MS, error: err instanceof Error ? err : new Error(String(err)) };
    throw err;
  } finally {
    if (inflight?.promise === promise) inflight = null;
  }
}

// ---- Messages ----

/** FCM HTTP v1 `message` for one device, with APNs and Android specifics. */
export function fcmMessage(token: string, content: PushContent, badge: number, nowSeconds: number) {
  const { title, body, url, gameId, kind, tag, quiet } = content;
  const threadId = gameId ? `game-${gameId}` : "jaxsquares";
  return {
    message: {
      token,
      notification: { title, body },
      // FCM data values must be strings. The app opens data.url on tap.
      data: { url, gameId, kind, tag },
      android: {
        priority: content.urgency === "high" ? "HIGH" : "NORMAL",
        ttl: `${content.ttlSeconds}s`,
        notification: {
          channel_id: quiet ? ANDROID_QUIET_CHANNEL_ID : ANDROID_CHANNEL_ID,
          tag,
          ...(quiet ? {} : { sound: "default" }),
          notification_count: badge,
        },
      },
      apns: {
        headers: {
          "apns-push-type": "alert",
          "apns-priority": "10",
          "apns-expiration": String(nowSeconds + content.ttlSeconds),
          // Same tag as web/Android: a newer push for the same thing replaces the old one.
          "apns-collapse-id": tag.slice(0, 64),
        },
        payload: {
          // Passive: lands in Notification Center without lighting the screen or making a sound.
          aps: quiet ? { badge, "thread-id": threadId, "interruption-level": "passive" } : { sound: "default", badge, "thread-id": threadId },
        },
      },
    },
  };
}

interface FcmErrorBody {
  error?: { code?: number; status?: string; details?: { "@type"?: string; errorCode?: string }[] };
}

/**
 * Only UNREGISTERED proves the token is dead. INVALID_ARGUMENT or
 * SENDER_ID_MISMATCH can also come from our own payload or a misconfigured
 * project, and deleting every token over that would be worse than retrying.
 */
export function fcmOutcome(status: number, body: unknown): SendOutcome {
  if (status >= 200 && status < 300) return "ok";
  const err = (body as FcmErrorBody | null)?.error;
  const codes = (err?.details ?? []).map((d) => d.errorCode);
  if (codes.includes("UNREGISTERED") || err?.status === "UNREGISTERED") return "gone";
  if (status === 401) return "retry-auth";
  return "error";
}

export async function sendFcm(
  sa: ServiceAccount,
  sub: SubscriptionRow,
  content: PushContent,
  badge: number,
  fetcher: typeof fetch = fetch,
): Promise<SendOutcome> {
  const url = `https://fcm.googleapis.com/v1/projects/${encodeURIComponent(sa.project_id)}/messages:send`;
  const body = JSON.stringify(fcmMessage(sub.endpoint_or_token, content, badge, Math.floor(Date.now() / 1000)));
  try {
    for (let attempt = 0; attempt < 2; attempt++) {
      const token = await getAccessToken(sa, fetcher);
      const res = await fetcher(url, {
        method: "POST",
        headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
        body,
        signal: AbortSignal.timeout(SEND_TIMEOUT_MS),
      });
      const data = res.ok ? null : await res.json().catch(() => null);
      if (res.ok) await res.body?.cancel();
      const outcome = fcmOutcome(res.status, data);
      if (outcome === "retry-auth" && attempt === 0) {
        resetTokenCache();
        continue;
      }
      if (outcome !== "ok" && outcome !== "gone") console.warn(`fcm send: ${res.status} ${JSON.stringify(data)}`);
      return outcome === "retry-auth" ? "error" : outcome;
    }
    return "error";
  } catch (err) {
    console.warn("fcm send failed", err);
    return "error";
  }
}
