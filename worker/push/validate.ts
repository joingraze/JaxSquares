// Request validation for the push routes. Web endpoints are limited to the
// browser vendors' push services so a registration can't point our outbound
// pushes at an arbitrary URL.

import type { ParsedRegistration } from "./store";

const WEB_PUSH_HOSTS = [
  "fcm.googleapis.com", // Chrome, Edge on Android, Samsung Internet, Opera
  "android.googleapis.com", // legacy Chrome endpoints
  "push.services.mozilla.com", // Firefox
  "push.apple.com", // Safari and iOS/iPadOS home-screen web apps (web.push.apple.com)
  "notify.windows.com", // Edge on Windows (WNS)
];

const MAX_ENDPOINT = 1024;
const FCM_TOKEN_RE = /^[A-Za-z0-9_:.-]{32,4096}$/;

export function base64UrlBytes(s: string): Uint8Array | null {
  if (!/^[A-Za-z0-9_-]+={0,2}$/.test(s)) return null;
  try {
    const bin = atob(s.replace(/=+$/, "").replace(/-/g, "+").replace(/_/g, "/"));
    return Uint8Array.from(bin, (ch) => ch.charCodeAt(0));
  } catch {
    return null;
  }
}

export function isPushServiceEndpoint(raw: string): boolean {
  if (raw.length > MAX_ENDPOINT) return false;
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return false;
  }
  if (url.protocol !== "https:" || url.username || url.password || url.port) return false;
  const host = url.hostname.toLowerCase();
  return WEB_PUSH_HOSTS.some((h) => host === h || host.endsWith(`.${h}`));
}

export function isFcmToken(raw: unknown): raw is string {
  return typeof raw === "string" && FCM_TOKEN_RE.test(raw);
}

/** A `PushRegistration` body, or why it was rejected. */
export function parseRegistration(body: unknown): { ok: true; value: ParsedRegistration } | { ok: false; error: string } {
  const b = (body && typeof body === "object" ? body : {}) as Record<string, unknown>;
  if (b.platform === "web") {
    const sub = (b.subscription && typeof b.subscription === "object" ? b.subscription : {}) as Record<string, unknown>;
    const keys = (sub.keys && typeof sub.keys === "object" ? sub.keys : {}) as Record<string, unknown>;
    const endpoint = typeof sub.endpoint === "string" ? sub.endpoint : "";
    if (!isPushServiceEndpoint(endpoint)) return { ok: false, error: "Unsupported push endpoint" };
    const p256dh = typeof keys.p256dh === "string" ? keys.p256dh : "";
    const auth = typeof keys.auth === "string" ? keys.auth : "";
    const pub = base64UrlBytes(p256dh);
    const secret = base64UrlBytes(auth);
    // An uncompressed P-256 point and a 16-byte auth secret (RFC 8291).
    if (!pub || pub.length !== 65 || pub[0] !== 0x04 || !secret || secret.length !== 16) {
      return { ok: false, error: "Invalid push subscription keys" };
    }
    return { ok: true, value: { platform: "web", key: endpoint, p256dh, auth } };
  }
  if (b.platform === "ios" || b.platform === "android") {
    if (!isFcmToken(b.token)) return { ok: false, error: "Invalid device token" };
    return { ok: true, value: { platform: b.platform, key: b.token } };
  }
  return { ok: false, error: "Unknown platform" };
}
