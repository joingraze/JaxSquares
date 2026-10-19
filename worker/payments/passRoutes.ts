// The Host Pass routes (mounted under /api with the rest of the payments
// module). Every route acts as the request's canonical clientId (the
// account's when signed in; worker/auth/canonical.ts), never answers with a
// clientId or a payment reference, and returns the identity's HostPassState.
//
//   GET  /payments/pass                 HostPassState
//   POST /payments/pass/test            the no-charge test pass (test mode only)
//   POST /payments/pass/test/end        ends the test pass (test mode only)
//   POST /payments/pass/stripe          HostPassIntent (web; needs a signed-in account: 409 account_required)
//   POST /payments/pass/stripe/confirm  HostPassState, read back from Stripe after the browser paid
//   POST /payments/pass/portal          { url } of a Stripe Customer Portal session (Manage on the web)
//   POST /payments/pass/iap             HostPassState (iOS: { transactionId, jws? })
//   POST /payments/pass/iap/restore     HostPassState & { restored } (iOS: { transactions: [{ transactionId, jws? }] })
//   POST /payments/apple/notifications  App Store Server Notifications V2 ({ signedPayload })
//
// Rate limited per device (by its resolved public id) and per address, like
// the other endpoints worth abusing (worker/rateLimit.ts).

import { Hono, type Context } from "hono";
import { isClientId } from "../../shared/playerId";
import { ACCOUNT_REQUIRED_CODE, type HostPassState, type HostPassTransaction } from "../../shared/types";
import { canonicalClientId, freshLink, SIGNED_IN_HEADER, signedInHint } from "../auth/canonical";
import type { Env } from "../env";
import { playerIdOf } from "../playerIds";
import { RATE_LIMITS, addressSubject, checkRate, type RateRule } from "../rateLimit";
import { AppStoreApiError } from "./apple";
import { AppleJwsError } from "./appleJws";
import { getPaymentConfig } from "./config";
import { activePass, passState } from "./pass";
import { appStoreCredentials, attachAppleTransaction, handleAppleNotification } from "./passApple";
import { confirmStripePass, portalUrl, startStripePass } from "./passStripe";
import * as store from "./store";
import { StripeApiError } from "./stripe";

type Ctx = Context<{ Bindings: Env }>;

export const passRoutes = new Hono<{ Bindings: Env }>();

const YEAR_MS = 365 * 24 * 60 * 60_000;
const MAX_RESTORE = 20;
const MAX_JWS_LENGTH = 16 * 1024;
const NO_STORE = { "cache-control": "no-store" };

const SIGN_IN_FIRST = "Sign in first, so your Host Pass stays with your account on every device.";

/** The device's own x-client-id, or null when missing or malformed. */
function deviceOf(c: Ctx): string | null {
  const id = c.req.header("x-client-id") ?? "";
  return isClientId(id) ? id : null;
}

/** The identity this request acts as: the account's canonical clientId when signed in. */
function identityOf(c: Ctx, device: string): Promise<string> {
  return canonicalClientId(c.env.DB, device, { signedIn: signedInHint(c.req.header(SIGNED_IN_HEADER)) });
}

/** 429 once this identity, or its network address, is over the pass limits; null to carry on. */
async function limited(c: Ctx, clientId: string): Promise<Response | null> {
  const check = async (rule: RateRule, subject: string) => {
    const { ok, retryAfter } = await checkRate(c.env.DB, rule, subject);
    return ok ? null : c.json({ error: rule.message }, 429, { "retry-after": String(retryAfter) });
  };
  const ip = c.req.header("cf-connecting-ip")?.trim();
  const [byDevice, byAddress] = await Promise.all([
    playerIdOf(clientId).then((subject) => check(RATE_LIMITS.pass, subject)),
    ip ? addressSubject(ip).then((subject) => check(RATE_LIMITS.passIp, subject)) : null,
  ]);
  return byDevice ?? byAddress;
}

const missingClient = (c: Ctx) => c.json({ error: "Missing or invalid x-client-id" }, 401);

/** Runs a mutating pass route as the request's identity, after the rate limits. */
async function asIdentity(c: Ctx, run: (clientId: string, device: string) => Promise<Response>): Promise<Response> {
  const device = deviceOf(c);
  if (!device) return missingClient(c);
  const clientId = await identityOf(c, device);
  const tooMany = await limited(c, clientId);
  return tooMany ?? run(clientId, device);
}

async function stateResponse(c: Ctx, clientId: string, extra: Record<string, unknown> = {}, status: 200 | 409 = 200): Promise<Response> {
  const state: HostPassState = await passState(c.env, clientId);
  return c.json({ ...state, ...extra }, status, NO_STORE);
}

async function readBody(c: Ctx): Promise<Record<string, unknown>> {
  const body = (await c.req.json().catch(() => null)) as unknown;
  return body && typeof body === "object" && !Array.isArray(body) ? (body as Record<string, unknown>) : {};
}

function transactionOf(v: unknown): HostPassTransaction | null {
  if (!v || typeof v !== "object") return null;
  const t = v as Record<string, unknown>;
  const transactionId = String(t.transactionId ?? "").trim();
  if (!/^\d{1,32}$/.test(transactionId)) return null;
  const jws = typeof t.jws === "string" && t.jws.length <= MAX_JWS_LENGTH ? t.jws : undefined;
  return { transactionId, jws };
}

// ---- State ----

passRoutes.get("/payments/pass", async (c) => {
  const device = deviceOf(c);
  if (!device) return missingClient(c);
  return stateResponse(c, await identityOf(c, device));
});

// ---- Test mode: a no-charge pass that lasts a year ----

passRoutes.post("/payments/pass/test", (c) =>
  asIdentity(c, async (clientId) => {
    if (getPaymentConfig(c.env).mode !== "test") return c.json({ error: "Test checkout is off" }, 403);
    const now = Date.now();
    if (!(await activePass(c.env.DB, [clientId], now))) {
      await store.upsertPass(
        c.env.DB,
        {
          clientId,
          provider: "test",
          externalId: `test:${crypto.randomUUID()}`,
          status: "active",
          currentPeriodEnd: now + YEAR_MS,
          autoRenew: false,
          livemode: false,
          eventAt: now,
        },
        { now },
      );
    }
    return stateResponse(c, clientId);
  }),
);

passRoutes.post("/payments/pass/test/end", (c) =>
  asIdentity(c, async (clientId) => {
    if (getPaymentConfig(c.env).mode !== "test") return c.json({ error: "Test checkout is off" }, 403);
    await store.endTestPasses(c.env.DB, clientId);
    return stateResponse(c, clientId);
  }),
);

// ---- Web: Stripe Billing ----

passRoutes.post("/payments/pass/stripe", async (c) => {
  const device = deviceOf(c);
  if (!device) return missingClient(c);
  // A web subscription needs an account, or it would be lost with the browser
  // (sign-out or cleared data starts a new device). The app signs in first.
  let link: Awaited<ReturnType<typeof freshLink>>;
  try {
    link = await freshLink(c.env.DB, device);
  } catch (err) {
    console.error("account link lookup failed", err);
    return c.json({ error: "Couldn't check your sign-in. Try again in a moment." }, 503);
  }
  if (!link) return c.json({ error: SIGN_IN_FIRST, code: ACCOUNT_REQUIRED_CODE }, 409);
  const clientId = link.canonical;
  const tooMany = await limited(c, clientId);
  if (tooMany) return tooMany;
  try {
    const outcome = await startStripePass(c.env, clientId);
    if (outcome.kind === "unavailable") return c.json({ error: "The Host Pass isn't on sale here yet." }, 503);
    if (outcome.kind === "active") return stateResponse(c, clientId, { error: "You already have a Host Pass." }, 409);
    return c.json(outcome.intent, 200, NO_STORE);
  } catch (err) {
    if (!(err instanceof StripeApiError)) throw err;
    console.error(`host pass subscription failed: ${err.status} ${err.code ?? ""} ${err.message}`);
    return c.json({ error: "Couldn't start checkout. Try again." }, 502);
  }
});

passRoutes.post("/payments/pass/stripe/confirm", (c) =>
  asIdentity(c, async (clientId) => {
    try {
      await confirmStripePass(c.env, clientId);
    } catch (err) {
      if (!(err instanceof StripeApiError)) throw err;
      console.error(`host pass confirm failed: ${err.status} ${err.message}`);
      return c.json({ error: "Couldn't check with Stripe. Try again." }, 502);
    }
    return stateResponse(c, clientId);
  }),
);

passRoutes.post("/payments/pass/portal", (c) =>
  asIdentity(c, async (clientId) => {
    const origin = (c.env.APP_ORIGIN ?? new URL(c.req.url).origin).replace(/\/+$/, "");
    try {
      const url = await portalUrl(c.env, clientId, `${origin}/me`);
      if (!url) return c.json({ error: "There's no web Host Pass to manage here." }, 404);
      return c.json({ url }, 200, NO_STORE);
    } catch (err) {
      if (!(err instanceof StripeApiError)) throw err;
      console.error(`customer portal failed: ${err.status} ${err.message}`);
      return c.json({ error: "Couldn't open Manage. Try again." }, 502);
    }
  }),
);

// ---- iOS: App Store auto-renewable subscription ----

passRoutes.post("/payments/pass/iap", (c) =>
  asIdentity(c, async (clientId) => {
    const creds = appStoreCredentials(c.env);
    if (!creds) return c.json({ error: "In-app purchase isn't set up yet" }, 503);
    const tx = transactionOf(await readBody(c));
    if (!tx) return c.json({ error: "Missing or invalid transactionId" }, 400);
    try {
      const outcome = await attachAppleTransaction(c.env, creds, clientId, tx);
      if (!outcome.ok) return c.json({ error: outcome.error }, outcome.status);
    } catch (err) {
      if (!(err instanceof AppStoreApiError)) throw err;
      console.error(`App Store lookup for the Host Pass failed: ${err.status} ${err.message}`);
      return c.json({ error: "Couldn't reach the App Store. Try again." }, 502);
    }
    return stateResponse(c, clientId);
  }),
);

passRoutes.post("/payments/pass/iap/restore", (c) =>
  asIdentity(c, async (clientId) => {
    const creds = appStoreCredentials(c.env);
    if (!creds) return c.json({ error: "In-app purchase isn't set up yet" }, 503);
    const body = await readBody(c);
    const list = Array.isArray(body.transactions) ? body.transactions.slice(0, MAX_RESTORE) : null;
    if (!list) return c.json({ error: "Missing transactions" }, 400);
    const txs = list.map(transactionOf).filter((t): t is HostPassTransaction => t !== null);
    let restored = 0;
    let refused: string | null = null;
    try {
      for (const tx of txs) {
        const outcome = await attachAppleTransaction(c.env, creds, clientId, tx);
        if (outcome.ok) restored++;
        else if (outcome.status === 409) refused = outcome.error;
      }
    } catch (err) {
      if (!(err instanceof AppStoreApiError)) throw err;
      console.error(`App Store lookup for a Host Pass restore failed: ${err.status} ${err.message}`);
      return c.json({ error: "Couldn't reach the App Store. Try again." }, 502);
    }
    if (restored === 0 && refused) return c.json({ error: refused }, 409);
    return stateResponse(c, clientId, { restored });
  }),
);

// App Store Server Notifications V2: renewals, expirations, refunds. Apple
// retries anything but a 2xx; a payload whose signature doesn't check out is
// refused (400) and changes nothing.
passRoutes.post("/payments/apple/notifications", async (c) => {
  const body = await readBody(c);
  const signedPayload = typeof body.signedPayload === "string" ? body.signedPayload : "";
  if (!signedPayload || signedPayload.length > 64 * 1024) return c.json({ error: "Missing signedPayload" }, 400);
  try {
    const outcome = await handleAppleNotification(c.env, signedPayload);
    return c.json({ received: true, outcome });
  } catch (err) {
    if (err instanceof AppleJwsError) {
      console.error(`App Store notification refused: ${err.reason}`);
      return c.json({ error: "Signature check failed" }, 400);
    }
    throw err;
  }
});
