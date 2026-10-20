// @vitest-environment node
import { beforeAll, describe, expect, it, vi } from "vitest";
import { decryptWebPush, fromB64url, makeBrowserSubscription, makeVapidKeys } from "./testFixtures";
import type { PushContent, SubscriptionRow } from "./types";
import { sendWebPush, vapidFromEnv, webPayload, webPushOutcome, webTopic } from "./webpush";

const ENDPOINT = "https://fcm.googleapis.com/fcm/send/dQw4w9WgXcQ:APA91bExample";

const content: PushContent = {
  title: "Big Game Night",
  body: "🎉 Your square hit at Half!",
  url: "/g/abc234",
  gameId: "abc234",
  kind: "winner",
  tag: "abc234:win:q2",
  renotify: true,
  quiet: false,
  urgency: "high",
  ttlSeconds: 21600,
};

let vapid: { publicKey: string; privateKey: string; subject: string };
let browser: Awaited<ReturnType<typeof makeBrowserSubscription>>;
let row: SubscriptionRow;

beforeAll(async () => {
  vapid = { ...(await makeVapidKeys()), subject: "mailto:hello@jaxsquares.com" };
  browser = await makeBrowserSubscription(ENDPOINT);
  row = { endpoint_or_token: ENDPOINT, client_id: "client-jax-001", platform: "web", p256dh: browser.p256dh, auth: browser.auth, unread: 0 };
});

describe("vapidFromEnv", () => {
  it("is off without both keys and defaults the subject to the app origin", () => {
    expect(vapidFromEnv({ VAPID_PUBLIC_KEY: "pub" })).toBeNull();
    expect(vapidFromEnv({ VAPID_PUBLIC_KEY: "pub", VAPID_PRIVATE_KEY: "priv", APP_ORIGIN: "https://jaxsquares.com" })?.subject).toBe(
      "https://jaxsquares.com",
    );
    expect(vapidFromEnv({ VAPID_PUBLIC_KEY: "p", VAPID_PRIVATE_KEY: "q", VAPID_SUBJECT: "mailto:a@b.co" })?.subject).toBe("mailto:a@b.co");
  });
});

describe("webPushOutcome", () => {
  it("forgets subscriptions only on 404/410", () => {
    expect(webPushOutcome(201)).toBe("ok");
    expect(webPushOutcome(410)).toBe("gone");
    expect(webPushOutcome(404)).toBe("gone");
    for (const s of [400, 403, 413, 429, 500, 503]) expect(webPushOutcome(s)).toBe("error");
  });
});

describe("webTopic", () => {
  it("fits RFC 8030's 32-char URL-safe alphabet", () => {
    expect(webTopic("abc234:win:q2")).toBe("abc234-win-q2");
    expect(webTopic(`${"x".repeat(16)}:player-joined:extra`)).toMatch(/^[A-Za-z0-9_-]{32}$/);
  });
});

describe("sendWebPush", () => {
  it("sends a VAPID-signed, aes128gcm-encrypted payload the browser can read", async () => {
    let captured: { url: string; init: RequestInit } | null = null;
    const fetcher = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
      captured = { url: String(url), init: init! };
      return new Response(null, { status: 201 });
    });
    expect(await sendWebPush(row, content, 4, vapid, fetcher as typeof fetch)).toBe("ok");

    const { url, init } = captured!;
    expect(url).toBe(ENDPOINT);
    const headers = new Headers(init.headers);
    expect(headers.get("content-encoding")).toBe("aes128gcm");
    expect(headers.get("ttl")).toBe("21600");
    expect(headers.get("urgency")).toBe("high");
    expect(headers.get("topic")).toBe("abc234-win-q2");

    // Authorization: vapid t=<ES256 JWT>, k=<our public key>
    const m = /^vapid t=([^,]+), k=(.+)$/.exec(headers.get("authorization") ?? "");
    expect(m).not.toBeNull();
    const [, jwt, k] = m!;
    expect(k).toBe(vapid.publicKey);
    const [h, p, s] = jwt.split(".");
    const claims = JSON.parse(new TextDecoder().decode(fromB64url(p)));
    expect(claims).toMatchObject({ aud: "https://fcm.googleapis.com", sub: "mailto:hello@jaxsquares.com" });
    const pub = await crypto.subtle.importKey("raw", fromB64url(vapid.publicKey), { name: "ECDSA", namedCurve: "P-256" }, false, ["verify"]);
    const valid = await crypto.subtle.verify({ name: "ECDSA", hash: "SHA-256" }, pub, fromB64url(s), new TextEncoder().encode(`${h}.${p}`));
    expect(valid).toBe(true);

    const plaintext = await decryptWebPush(new Uint8Array(init.body as Uint8Array), browser);
    expect(JSON.parse(plaintext)).toEqual(webPayload(content, 4));
    expect(JSON.parse(plaintext)).toMatchObject({ title: "Big Game Night", url: "/g/abc234", badge: 4, renotify: true });
  });

  it("maps push service replies and never throws", async () => {
    const reply = (status: number) => vi.fn(async () => new Response("nope", { status })) as unknown as typeof fetch;
    expect(await sendWebPush(row, content, 1, vapid, reply(410))).toBe("gone");
    expect(await sendWebPush(row, content, 1, vapid, reply(404))).toBe("gone");
    expect(await sendWebPush(row, content, 1, vapid, reply(403))).toBe("error");
    const broken = vi.fn(async () => {
      throw new TypeError("network down");
    }) as unknown as typeof fetch;
    expect(await sendWebPush(row, content, 1, vapid, broken)).toBe("error");
    expect(await sendWebPush(row, content, 1, { ...vapid, privateKey: "not-a-key" }, reply(201))).toBe("error");
  });

  it("treats a row without keys as unusable", async () => {
    const fetcher = vi.fn() as unknown as typeof fetch;
    expect(await sendWebPush({ ...row, p256dh: null }, content, 1, vapid, fetcher)).toBe("gone");
    expect(fetcher).not.toHaveBeenCalled();
  });
});
