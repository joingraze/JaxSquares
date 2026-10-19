// Optional sign-in routes (mounted under /api by worker/index.ts, which also
// applies CORS). See docs/auth.md for the model and docs/ARCHITECTURE.md for
// the contract.
//
//   POST   /auth/apple | /auth/google  SignInInput -> MeResponse
//   GET    /me                         MeResponse
//   POST   /auth/sign-out              SignOutInput -> { ok }
//   DELETE /account                    { ok }
//
// Every route works on the device's own x-client-id (and its link); the rest of
// the API sees the resolved canonical clientId instead (canonical.ts). No
// response ever carries a clientId, and email/name only ever go back to the
// account's owner here.

import { Hono, type Context } from "hono";
import { HTTPException } from "hono/http-exception";
import { isClientId } from "../../shared/playerId";
import type { AuthProvider, MeResponse } from "../../shared/types";
import * as db from "../db";
import type { Env } from "../env";
import { hostPassOf } from "../payments/pass";
import { endWebPassRenewals } from "../payments/passStripe";
import * as paymentsStore from "../payments/store";
import { playerIdOf } from "../playerIds";
import * as pushStore from "../push/store";
import { isFcmToken, isPushServiceEndpoint } from "../push/validate";
import { RATE_LIMITS, addressSubject, checkRate, type RateRule } from "../rateLimit";
import { broadcast } from "../service";
import { exchangeAppleCode, revokeAppleToken } from "./apple";
import { forgetClients, freshLink, rememberLink } from "./canonical";
import { PROVIDER_NAME, providerSetup } from "./config";
import { JwksUnavailableError, MAX_TOKEN_LENGTH, TokenError, verifyIdToken, type IdTokenClaims } from "./jwt";
import * as store from "./store";

type Ctx = Context<{ Bindings: Env }>;

export const authRoutes = new Hono<{ Bindings: Env }>();

const MAX_BODY_BYTES = 16 * 1024;
/** Boards whose open sockets get the merged state right away; the rest catch up on their next read. */
const BROADCAST_MAX = 50;

const SIGNED_OUT_FIRST = "You're signed in to a different account on this device. Sign out first.";
const SIGN_IN_FAILED = "That sign-in didn't go through. Try again.";

function fail(status: 400 | 401 | 404 | 409 | 413 | 502 | 503, message: string): never {
  throw new HTTPException(status, { message });
}

/** The device's own x-client-id (401 when missing or malformed). */
function deviceOf(c: Ctx): string {
  const id = c.req.header("x-client-id") ?? "";
  if (!isClientId(id)) fail(401, "Missing or invalid x-client-id");
  return id;
}

/** The JSON object body; an empty body reads as {} when `optional`. */
async function readBody(c: Ctx, optional = false): Promise<Record<string, unknown>> {
  const text = await c.req.text().catch(() => "");
  if (text.length > MAX_BODY_BYTES) fail(413, "Request too large");
  if (optional && !text.trim()) return {};
  try {
    const body: unknown = JSON.parse(text);
    if (body && typeof body === "object" && !Array.isArray(body)) return body as Record<string, unknown>;
  } catch {
    // fall through
  }
  fail(400, "Invalid JSON body");
}

/** Run after the response (fire-and-forget outside a Worker). */
function defer(c: Ctx, p: Promise<unknown>): void {
  const guarded = p.catch((err) => console.error("auth background task failed", err));
  try {
    c.executionCtx.waitUntil(guarded);
  } catch {
    // no execution context (tests)
  }
}

/** 429 once this device, or its network address, is over the sign-in limits; null to carry on. */
async function limited(c: Ctx, device: string): Promise<Response | null> {
  const check = async (rule: RateRule, subject: string) => {
    const { ok, retryAfter } = await checkRate(c.env.DB, rule, subject);
    return ok ? null : c.json({ error: rule.message }, 429, { "retry-after": String(retryAfter) });
  };
  const ip = c.req.header("cf-connecting-ip")?.trim();
  const [byDevice, byAddress] = await Promise.all([
    playerIdOf(device).then((subject) => check(RATE_LIMITS.auth, subject)),
    ip ? addressSubject(ip).then((subject) => check(RATE_LIMITS.authIp, subject)) : null,
  ]);
  return byDevice ?? byAddress;
}

/** Single-line text for a display name: control and bidi characters out, capped by code points. */
function cleanName(v: unknown, max = 60): string | null {
  if (typeof v !== "string") return null;
  const s = v.replace(/[\p{Cc}‪-‮⁦-⁩]/gu, "").replace(/\s+/g, " ").trim();
  return Array.from(s).slice(0, max).join("").trim() || null;
}

/** The email to show the owner ("Signed in as"), when the provider says it's theirs. */
function emailOf(claims: IdTokenClaims): string | null {
  const email = typeof claims.email === "string" ? claims.email.trim() : "";
  if (!email || email.length > 254 || !email.includes("@")) return null;
  // Google says whether it checked the address; Apple's are always verified (real or private relay).
  return claims.email_verified === false || claims.email_verified === "false" ? null : email;
}

/**
 * A redirect URI for Apple's token exchange (codes from Sign in with Apple JS
 * are bound to it): https on this app's own host (or its www.), else null.
 */
function appleRedirectUri(env: Env, v: unknown): string | null {
  if (typeof v !== "string" || v.length > 256) return null;
  let url: URL;
  let own: URL;
  try {
    url = new URL(v);
    own = new URL(env.APP_ORIGIN ?? "https://jaxsquares.com");
  } catch {
    return null;
  }
  const host = own.hostname.replace(/^www\./, "");
  const ok = url.protocol === "https:" && (url.hostname === host || url.hostname === `www.${host}`) && !url.username && !url.password;
  return ok ? url.toString() : null;
}

/** Who this device is: GET /api/me and the sign-in response. */
async function meFor(env: Env, canonical: string, accountId: string | null): Promise<MeResponse> {
  const [account, hostTokens, profile, playerId, hostPass] = await Promise.all([
    accountId ? store.accountInfo(env.DB, accountId) : null,
    db.hostTokensFor(env.DB, canonical),
    db.latestProfileOf(env.DB, canonical),
    playerIdOf(canonical),
    hostPassOf(env.DB, canonical),
  ]);
  return { playerId, account, hostTokens, profile, hostPass };
}

type Outcome = { conflict: true } | { conflict: false; accountId: string; canonical: string; merged: string[] };

interface SignIn {
  provider: AuthProvider;
  subject: string;
  device: string;
  email: string | null;
  name: string | null;
  now: number;
}

/**
 * Signs the device in: a new identity makes a new account with this device as
 * canonical; a known one links the device to its account, moving the device's
 * rows to the canonical clientId first. A device signed in to (or the
 * canonical device of) a different account is a conflict. Retried once when a
 * concurrent sign-in won a race (UNIQUE).
 */
async function signInDevice(env: Env, s: SignIn): Promise<Outcome> {
  for (let attempt = 0; ; attempt++) {
    const state = await store.signInState(env.DB, s.provider, s.subject, s.device);
    const mine = state.identity?.accountId ?? null;
    if (state.device && state.device.accountId !== mine) return { conflict: true };
    if (!state.device && state.canonicalOf && state.canonicalOf !== mine) return { conflict: true };
    const touch = { provider: s.provider, subject: s.subject, email: s.email, name: s.name, now: s.now };
    try {
      if (state.identity && state.device) {
        await store.touchAccount(env.DB, { ...touch, accountId: state.identity.accountId });
        return { conflict: false, accountId: state.identity.accountId, canonical: state.identity.canonical, merged: [] };
      }
      if (state.identity) {
        const { accountId, canonical } = state.identity;
        const merge =
          canonical === s.device
            ? []
            : [
                ...db.mergeClientStatements(
                  env.DB,
                  { clientId: s.device, playerId: await playerIdOf(s.device) },
                  { clientId: canonical, playerId: await playerIdOf(canonical) },
                  s.now,
                ),
                ...pushStore.mergeClientStatements(env.DB, s.device, canonical),
                ...paymentsStore.mergeClientStatements(env.DB, s.device, canonical, s.now),
              ];
        const results = await store.linkDevice(env.DB, { ...touch, accountId, clientId: s.device }, merge);
        const merged = merge.length > 0 ? (results[0].results as { id: string }[]).map((r) => r.id) : [];
        return { conflict: false, accountId, canonical, merged };
      }
      const accountId = await store.createAccount(env.DB, { ...touch, clientId: s.device });
      return { conflict: false, accountId, canonical: s.device, merged: [] };
    } catch (err) {
      if (attempt === 0 && store.isUniqueViolation(err)) continue;
      throw err;
    }
  }
}

async function signIn(c: Ctx, provider: AuthProvider): Promise<Response> {
  const device = deviceOf(c);
  const setup = providerSetup(c.env, provider);
  if (setup.audiences.length === 0) fail(503, `Sign in with ${PROVIDER_NAME[provider]} isn't set up yet.`);
  const body = await readBody(c);
  const idToken = typeof body.idToken === "string" ? body.idToken.trim() : "";
  if (!idToken || idToken.length > MAX_TOKEN_LENGTH) fail(400, "Missing sign-in token");
  if (body.nonce !== undefined && (typeof body.nonce !== "string" || body.nonce.length > 512)) fail(400, "Bad nonce");
  const nonce = typeof body.nonce === "string" && body.nonce ? body.nonce : null;
  const code = provider === "apple" && typeof body.authorizationCode === "string" && body.authorizationCode.length <= 2048 ? body.authorizationCode.trim() : "";

  const tooMany = await limited(c, device);
  if (tooMany) return tooMany;

  let claims: IdTokenClaims;
  try {
    claims = await verifyIdToken(idToken, { ...setup, nonce });
  } catch (err) {
    if (err instanceof TokenError) {
      console.log(`sign in with ${provider} refused: ${err.reason}`);
      fail(401, SIGN_IN_FAILED);
    }
    if (err instanceof JwksUnavailableError) {
      console.error(`sign in with ${provider}: keys unavailable`, err.message);
      fail(502, `Couldn't reach ${PROVIDER_NAME[provider]}. Try again in a moment.`);
    }
    throw err;
  }

  const now = Date.now();
  const outcome = await signInDevice(c.env, {
    provider,
    subject: claims.sub,
    device,
    email: emailOf(claims),
    // Google's token carries the name; Apple sends it once, beside the token, on the first authorization.
    name: provider === "google" ? cleanName(claims.name) : cleanName(body.name),
    now,
  });
  if (outcome.conflict) fail(409, SIGNED_OUT_FIRST);
  rememberLink(device, outcome.canonical, now);

  // Boards open on any phone show the device's squares under the account right away.
  if (outcome.merged.length > 0) {
    defer(c, Promise.all(outcome.merged.slice(0, BROADCAST_MAX).map((id) => broadcast(c.env, id))));
  }
  // Keep a refresh token so deleting the account can revoke it. The code's
  // audience is the token's: the bundle id (iOS app) or the Services ID (web).
  if (code) {
    const clientId = typeof claims.aud === "string" ? claims.aud : String(claims.aud[0]);
    const redirectUri = appleRedirectUri(c.env, body.redirectUri);
    defer(
      c,
      exchangeAppleCode(c.env, { code, clientId, redirectUri }).then(async (token) => {
        if (token) await store.setAppleRefreshToken(c.env.DB, claims.sub, token, clientId);
      }),
    );
  }
  return c.json(await meFor(c.env, outcome.canonical, outcome.accountId), 200, { "cache-control": "no-store" });
}

authRoutes.post("/auth/apple", (c) => signIn(c, "apple"));
authRoutes.post("/auth/google", (c) => signIn(c, "google"));

/** Read fresh: the app trusts `account: null` to mean "not signed in here" (and drops a sign-in it thought it had). */
async function linkOr503(c: Ctx, device: string) {
  try {
    return await freshLink(c.env.DB, device);
  } catch (err) {
    console.error("account link lookup failed", err);
    fail(503, "Couldn't check your sign-in. Try again in a moment.");
  }
}

authRoutes.get("/me", async (c) => {
  const device = deviceOf(c);
  const link = await linkOr503(c, device);
  return c.json(await meFor(c.env, link?.canonical ?? device, link?.accountId ?? null), 200, { "cache-control": "no-store" });
});

authRoutes.post("/auth/sign-out", async (c) => {
  const device = deviceOf(c);
  const body = await readBody(c, true);
  const tooMany = await limited(c, device);
  if (tooMany) return tooMany;
  const link = await linkOr503(c, device);
  if (!link) return c.json({ ok: true });
  const writes = [store.unlinkStatement(c.env.DB, device)];
  // This device's registration stops getting the account's pushes (it re-registers as its new self).
  const key =
    typeof body.endpoint === "string" && isPushServiceEndpoint(body.endpoint)
      ? body.endpoint
      : isFcmToken(body.token)
        ? body.token
        : null;
  if (key) writes.push(pushStore.deleteSubscriptionStatement(c.env.DB, link.canonical, key));
  await c.env.DB.batch(writes);
  forgetClients([device]);
  return c.json({ ok: true });
});

authRoutes.delete("/account", async (c) => {
  const device = deviceOf(c);
  const tooMany = await limited(c, device);
  if (tooMany) return tooMany;
  const link = await linkOr503(c, device);
  if (!link) fail(404, "You're not signed in on this device.");
  // A web Host Pass stops renewing first: nobody could manage it once the
  // account is gone. (An App Store one is the person's to cancel in iPhone
  // Settings; the delete sheet says so.)
  try {
    await endWebPassRenewals(c.env, link.canonical);
  } catch (err) {
    console.error("couldn't stop a web Host Pass renewing", err);
    fail(502, "Couldn't stop your Host Pass from renewing, so nothing was deleted. Try again in a moment.");
  }
  const doomed = await store.accountForDeletion(c.env.DB, link.accountId);
  // Revoke first: once the rows are gone there's no token left to revoke.
  const revoked = await Promise.all(
    doomed.appleTokens.map((t) =>
      revokeAppleToken(c.env, t).catch((err) => {
        console.error("Sign in with Apple revoke failed", err);
        return false;
      }),
    ),
  );
  if (doomed.unrevocable > 0) console.log(`account deleted with ${doomed.unrevocable} Apple sign-in(s) that had no refresh token to revoke`);
  if (revoked.some((ok) => !ok)) console.log("account deleted; an Apple token couldn't be revoked (see above)");
  // The boards and squares stay as anonymous data under the canonical clientId.
  await c.env.DB.batch([
    ...store.deleteAccountStatements(c.env.DB, link.accountId),
    pushStore.deleteClientSubscriptionsStatement(c.env.DB, link.canonical),
  ]);
  forgetClients([device, ...doomed.clients]);
  return c.json({ ok: true });
});
