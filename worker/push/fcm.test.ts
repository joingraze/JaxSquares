// @vitest-environment node
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import {
  ANDROID_CHANNEL_ID,
  ANDROID_QUIET_CHANNEL_ID,
  FCM_SCOPE,
  GOOGLE_TOKEN_URL,
  fcmMessage,
  fcmOutcome,
  getAccessToken,
  parseServiceAccount,
  resetTokenCache,
  sendFcm,
  signAssertion,
  type ServiceAccount,
} from "./fcm";
import { fromB64url, makeServiceAccount } from "./testFixtures";
import type { PushContent, SubscriptionRow } from "./types";

let sa: ServiceAccount;
let saJson: string;
let publicKey: CryptoKey;

beforeAll(async () => {
  const made = await makeServiceAccount();
  saJson = made.json;
  publicKey = made.publicKey;
  sa = parseServiceAccount(saJson)!;
});

afterEach(() => resetTokenCache());

const decodePart = (s: string) => JSON.parse(new TextDecoder().decode(fromB64url(s)));

const content: PushContent = {
  title: "Super Bowl LX",
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

const sub: SubscriptionRow = {
  endpoint_or_token: "fcm-token:APA91bHPRgkF3JUikC4ENAHEeMrd41Zxv3hVZjC9KtT8OvPVGJ",
  client_id: "client-jax-001",
  platform: "ios",
  p256dh: null,
  auth: null,
  unread: 2,
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

const unregistered = () =>
  json(
    {
      error: {
        code: 404,
        message: "Requested entity was not found.",
        status: "NOT_FOUND",
        details: [{ "@type": "type.googleapis.com/google.firebase.fcm.v1.FcmError", errorCode: "UNREGISTERED" }],
      },
    },
    404,
  );

describe("parseServiceAccount", () => {
  it("accepts the downloaded JSON, or base64 of it", () => {
    expect(parseServiceAccount(saJson)).toMatchObject({ project_id: "jaxsquares-test", private_key_id: "kid-123" });
    expect(parseServiceAccount(btoa(saJson))?.client_email).toBe(sa.client_email);
  });

  it("rejects anything that isn't a service account", () => {
    expect(parseServiceAccount(undefined)).toBeNull();
    expect(parseServiceAccount("")).toBeNull();
    expect(parseServiceAccount("{not json")).toBeNull();
    expect(parseServiceAccount(JSON.stringify({ project_id: "p", client_email: "e" }))).toBeNull();
    expect(parseServiceAccount(JSON.stringify({ project_id: "p", client_email: "e", private_key: "nope" }))).toBeNull();
  });
});

describe("signAssertion", () => {
  it("is an RS256 JWT with the claims Google's JWT-bearer grant expects", async () => {
    const now = 1_760_000_000;
    const jwt = await signAssertion(sa, now);
    const [h, p, s] = jwt.split(".");
    expect(decodePart(h)).toEqual({ alg: "RS256", typ: "JWT", kid: "kid-123" });
    expect(decodePart(p)).toEqual({
      iss: sa.client_email,
      scope: FCM_SCOPE,
      aud: GOOGLE_TOKEN_URL,
      iat: now,
      exp: now + 3600,
    });
    const ok = await crypto.subtle.verify("RSASSA-PKCS1-v1_5", publicKey, fromB64url(s), new TextEncoder().encode(`${h}.${p}`));
    expect(ok).toBe(true);
  });

  it("copes with a private key whose newlines were escaped when pasted", async () => {
    const escaped = { ...sa, private_key: sa.private_key.replace(/\n/g, "\\n") };
    await expect(signAssertion(escaped, 1)).resolves.toMatch(/^[\w-]+\.[\w-]+\.[\w-]+$/);
  });
});

describe("getAccessToken", () => {
  it("exchanges a signed assertion and caches the token until shortly before expiry", async () => {
    const fetcher = vi.fn<typeof fetch>(async () => json({ access_token: "ya29.one", expires_in: 3599 }));
    const t0 = 1_760_000_000_000;
    expect(await getAccessToken(sa, fetcher as typeof fetch, t0)).toBe("ya29.one");
    const [url, init] = fetcher.mock.calls[0];
    expect(url).toBe(GOOGLE_TOKEN_URL);
    expect(init?.method).toBe("POST");
    const form = new URLSearchParams(String(init?.body));
    expect(form.get("grant_type")).toBe("urn:ietf:params:oauth:grant-type:jwt-bearer");
    expect(form.get("assertion")?.split(".")).toHaveLength(3);

    await getAccessToken(sa, fetcher as typeof fetch, t0 + 50 * 60 * 1000);
    expect(fetcher).toHaveBeenCalledTimes(1);
    await getAccessToken(sa, fetcher as typeof fetch, t0 + 56 * 60 * 1000);
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it("shares one exchange between concurrent sends", async () => {
    const fetcher = vi.fn(async () => json({ access_token: "ya29.shared", expires_in: 3599 }));
    const tokens = await Promise.all([1, 2, 3].map(() => getAccessToken(sa, fetcher as typeof fetch)));
    expect(tokens).toEqual(["ya29.shared", "ya29.shared", "ya29.shared"]);
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it("throws when Google refuses, and fails fast for a minute instead of hammering the endpoint", async () => {
    const fetcher = vi.fn(async () => json({ error: "invalid_grant" }, 400));
    const t0 = 1_760_000_000_000;
    await expect(getAccessToken(sa, fetcher as typeof fetch, t0)).rejects.toThrow(/400 invalid_grant/);
    await expect(getAccessToken(sa, fetcher as typeof fetch, t0 + 30_000)).rejects.toThrow(/invalid_grant/);
    expect(fetcher).toHaveBeenCalledTimes(1);
    await expect(getAccessToken(sa, fetcher as typeof fetch, t0 + 61_000)).rejects.toThrow();
    expect(fetcher).toHaveBeenCalledTimes(2);
  });
});

describe("fcmMessage", () => {
  it("carries the notification, string-only data and per-platform fields", () => {
    const m = fcmMessage(sub.endpoint_or_token, content, 3, 1_760_000_000).message;
    expect(m.token).toBe(sub.endpoint_or_token);
    expect(m.notification).toEqual({ title: "Super Bowl LX", body: "🎉 Your square hit at Half!" });
    expect(m.data).toEqual({ url: "/g/abc234", gameId: "abc234", kind: "winner", tag: "abc234:win:q2" });
    for (const v of Object.values(m.data)) expect(typeof v).toBe("string");
    expect(m.apns.payload.aps).toEqual({ sound: "default", badge: 3, "thread-id": "game-abc234" });
    expect(m.apns.headers).toMatchObject({
      "apns-push-type": "alert",
      "apns-priority": "10",
      "apns-expiration": String(1_760_000_000 + 21600),
      "apns-collapse-id": "abc234:win:q2",
    });
    expect(m.android).toMatchObject({
      priority: "HIGH",
      ttl: "21600s",
      notification: { channel_id: ANDROID_CHANNEL_ID, tag: "abc234:win:q2", sound: "default", notification_count: 3 },
    });
  });

  it("uses normal Android priority for routine updates", () => {
    expect(fcmMessage("t", { ...content, urgency: "normal" }, 1, 0).message.android.priority).toBe("NORMAL");
  });

  it("delivers board chatter quietly: passive on iOS, the low-importance channel on Android", () => {
    const m = fcmMessage("t", { ...content, quiet: true }, 1, 0).message;
    expect(m.apns.payload.aps).toEqual({ badge: 1, "thread-id": "game-abc234", "interruption-level": "passive" });
    expect(m.android.notification).toEqual({ channel_id: ANDROID_QUIET_CHANNEL_ID, tag: "abc234:win:q2", notification_count: 1 });
  });
});

describe("fcmOutcome", () => {
  it("deletes only tokens FCM says are unregistered", async () => {
    expect(fcmOutcome(200, null)).toBe("ok");
    expect(fcmOutcome(404, await unregistered().json())).toBe("gone");
    const invalid = { error: { code: 400, status: "INVALID_ARGUMENT", details: [{ errorCode: "INVALID_ARGUMENT" }] } };
    expect(fcmOutcome(400, invalid)).toBe("error");
    const mismatch = { error: { code: 403, status: "PERMISSION_DENIED", details: [{ errorCode: "SENDER_ID_MISMATCH" }] } };
    expect(fcmOutcome(403, mismatch)).toBe("error");
    expect(fcmOutcome(401, { error: { code: 401, status: "UNAUTHENTICATED" } })).toBe("retry-auth");
    expect(fcmOutcome(503, null)).toBe("error");
  });
});

describe("sendFcm", () => {
  const router = (send: () => Response | Promise<Response>) => {
    let tokens = 0;
    const fetcher = vi.fn<typeof fetch>(async (url) => {
      if (String(url) === GOOGLE_TOKEN_URL) return json({ access_token: `ya29.t${++tokens}`, expires_in: 3599 });
      return send();
    });
    return fetcher;
  };

  it("posts the message to the project's v1 endpoint with a bearer token", async () => {
    const fetcher = router(() => json({ name: "projects/jaxsquares-test/messages/1" }));
    expect(await sendFcm(sa, sub, content, 3, fetcher as typeof fetch)).toBe("ok");
    const [url, init] = fetcher.mock.calls[1];
    expect(url).toBe("https://fcm.googleapis.com/v1/projects/jaxsquares-test/messages:send");
    expect(new Headers(init?.headers).get("authorization")).toBe("Bearer ya29.t1");
    expect(JSON.parse(String(init?.body)).message.apns.payload.aps.badge).toBe(3);
  });

  it("re-mints the access token once when FCM rejects it", async () => {
    const replies = [json({ error: { code: 401, status: "UNAUTHENTICATED" } }, 401), json({ name: "ok" })];
    const fetcher = router(() => replies.shift()!);
    expect(await sendFcm(sa, sub, content, 1, fetcher as typeof fetch)).toBe("ok");
    const auths = fetcher.mock.calls.filter(([u]) => String(u) !== GOOGLE_TOKEN_URL).map(([, i]) => new Headers(i?.headers).get("authorization"));
    expect(auths).toEqual(["Bearer ya29.t1", "Bearer ya29.t2"]);
  });

  it("reports unregistered tokens as gone and failures as errors without throwing", async () => {
    expect(await sendFcm(sa, sub, content, 1, router(unregistered) as typeof fetch)).toBe("gone");
    resetTokenCache();
    expect(await sendFcm(sa, sub, content, 1, router(() => json({}, 503)) as typeof fetch)).toBe("error");
    resetTokenCache();
    const broken = vi.fn(async () => {
      throw new TypeError("network down");
    });
    expect(await sendFcm(sa, sub, content, 1, broken as typeof fetch)).toBe("error");
  });
});
