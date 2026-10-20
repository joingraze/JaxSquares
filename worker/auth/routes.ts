// Optional sign-in routes (mounted under /api by worker/index.ts, which also
// applies CORS). See docs/auth.md for the model and docs/ARCHITECTURE.md for
// the contract.
//
//   POST   /auth/apple | /auth/google  SignInInput -> MeResponse
//   POST   /auth/apple/link | /auth/google/link  SignInInput -> MeResponse (adds it to this device's account)
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
import { ACCOUNT_EXISTS_CODE, type AuthProvider, type MeResponse } from "../../shared/types";
import { forgetClubBrand } from "../clubs/brand";
import * as clubStore from "../clubs/store";
import * as db from "../db";
import * as emailStore from "../email/store";
import type { Env } from "../env";
import { clubPassOf, hostPassOf } from "../payments/pass";
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
 * The email a new sign-in may join an existing account by: only one the
 * provider says it verified, and never an Apple private relay address (each
 * app gets its own, so it never matches). Lowercased.
 */
export function matchEmailOf(claims: IdTokenClaims): string | null {
  const email = typeof claims.email === "string" ? claims.email.trim().toLowerCase() : "";
  if (!email || email.length > 254 || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return null;
  if (claims.email_verified !== true && claims.email_verified !== "true") return null;
  return email.endsWith(`@${store.PRIVATE_RELAY_DOMAIN}`) ? null : email;
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

/** Who this device is: GET /api/me and the sign-in response. Co-hosted boards come as ids only: a co-host has no token. */
async function meFor(env: Env, canonical: string, accountId: string | null): Promise<MeResponse> {
  const [account, hostTokens, profile, playerId, hostPass, clubPass, cohostGames] = await Promise.all([
    accountId ? store.accountInfo(env.DB, accountId) : null,
    db.hostTokensFor(env.DB, canonical),
    db.latestProfileOf(env.DB, canonical),
    playerIdOf(canonical),
    hostPassOf(env.DB, canonical),
    clubPassOf(env.DB, canonical),
    db.cohostGamesFor(env.DB, canonical),
  ]);
  return { playerId, account, hostTokens, profile, hostPass, clubPass, cohostGames };
}

type Outcome = { conflict: true } | { conflict: false; accountId: string; canonical: string; merged: string[] };

interface SignIn {
  provider: AuthProvider;
  subject: string;
  device: string;
  email: string | null;
  /** The token's email when the provider vouches for it (matchEmailOf): a new identity with it joins that account. */
  matchEmail: string | null;
  name: string | null;
  now: number;
}

/**
 * The statements moving everything `from` holds (squares, players, hosted and
 * co-hosted boards, push, payments, email notices, a club) to `to`, in the
 * tables' owners' words. The first statement's results are the boards touched.
 */
async function mergeStatements(env: Env, from: string, to: string, now: number): Promise<D1PreparedStatement[]> {
  return [
    ...db.mergeClientStatements(env.DB, { clientId: from, playerId: await playerIdOf(from) }, { clientId: to, playerId: await playerIdOf(to) }, now),
    ...pushStore.mergeClientStatements(env.DB, from, to),
    ...paymentsStore.mergeClientStatements(env.DB, from, to, now),
    ...emailStore.mergeClientStatements(env.DB, from, to),
    ...clubStore.mergeClientStatements(env.DB, from, to, now),
  ];
}

/**
 * Signs the device in. A known identity links the device to its account,
 * moving the device's rows to the canonical clientId first. A new identity
 * whose verified email an account already has joins that account the same
 * way (one account per email: Google after Apple lands in the same boards);
 * otherwise it makes a new account with this device as canonical. A device
 * signed in to (or the canonical device of) a different account is a
 * conflict. Retried once when a concurrent sign-in won a race (UNIQUE).
 */
async function signInDevice(env: Env, s: SignIn): Promise<Outcome> {
  for (let attempt = 0; ; attempt++) {
    const state = await store.signInState(env.DB, s.provider, s.subject, s.device, s.matchEmail);
    const target = state.identity ?? state.emailAccount;
    // The identity joins `target` in the same batch (it isn't on any account yet).
    const adding = !state.identity && !!state.emailAccount;
    const mine = target?.accountId ?? null;
    if (state.device && state.device.accountId !== mine) return { conflict: true };
    if (!state.device && state.canonicalOf && state.canonicalOf !== mine) return { conflict: true };
    const touch = { provider: s.provider, subject: s.subject, email: s.email, name: s.name, now: s.now };
    try {
      if (target && state.device) {
        await store.touchAccount(env.DB, { ...touch, accountId: target.accountId }, adding);
        return { conflict: false, accountId: target.accountId, canonical: target.canonical, merged: [] };
      }
      if (target) {
        const { accountId, canonical } = target;
        const merge = canonical === s.device ? [] : await mergeStatements(env, s.device, canonical, s.now);
        const results = await store.linkDevice(env.DB, { ...touch, accountId, clientId: s.device }, merge, adding);
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

/** A sign-in request, read and verified: who the provider says this is, and what came with the token. */
interface Verified {
  device: string;
  claims: IdTokenClaims;
  body: Record<string, unknown>;
  /** Apple's authorization code (for the refresh token that revocation needs), or "". */
  code: string;
}

/** Reads and verifies a sign-in body (rate limited by device and address); a Response when it's refused with 429. */
async function verifiedSignIn(c: Ctx, provider: AuthProvider): Promise<Verified | Response> {
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

  try {
    return { device, claims: await verifyIdToken(idToken, { ...setup, nonce }), body, code };
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
}

/** Google's token carries the name; Apple sends it once, beside the token, on the first authorization. */
function nameOf(provider: AuthProvider, v: Verified): string | null {
  return provider === "google" ? cleanName(v.claims.name) : cleanName(v.body.name);
}

/**
 * Keeps a refresh token so deleting the account can revoke it. The code's
 * audience is the token's: the bundle id (iOS app) or the Services ID (web).
 */
function keepAppleToken(c: Ctx, v: Verified): void {
  if (!v.code) return;
  const clientId = typeof v.claims.aud === "string" ? v.claims.aud : String(v.claims.aud[0]);
  const redirectUri = appleRedirectUri(c.env, v.body.redirectUri);
  defer(
    c,
    exchangeAppleCode(c.env, { code: v.code, clientId, redirectUri }).then(async (token) => {
      if (token) await store.setAppleRefreshToken(c.env.DB, v.claims.sub, token, clientId);
    }),
  );
}

/** Boards open on any phone show the moved squares under the account right away. */
function broadcastMerged(c: Ctx, merged: string[]): void {
  if (merged.length > 0) defer(c, Promise.all(merged.slice(0, BROADCAST_MAX).map((id) => broadcast(c.env, id))));
}

async function signIn(c: Ctx, provider: AuthProvider): Promise<Response> {
  const v = await verifiedSignIn(c, provider);
  if (v instanceof Response) return v;
  const now = Date.now();
  const outcome = await signInDevice(c.env, {
    provider,
    subject: v.claims.sub,
    device: v.device,
    email: emailOf(v.claims),
    matchEmail: matchEmailOf(v.claims),
    name: nameOf(provider, v),
    now,
  });
  if (outcome.conflict) fail(409, SIGNED_OUT_FIRST);
  rememberLink(v.device, outcome.canonical, now);
  // A Club Pass (and its club) the device brought now brands the account's boards.
  if (outcome.canonical !== v.device) forgetClubBrand(c.env.DB, outcome.canonical);
  broadcastMerged(c, outcome.merged);
  keepAppleToken(c, v);
  return c.json(await meFor(c.env, outcome.canonical, outcome.accountId), 200, { "cache-control": "no-store" });
}

/**
 * Adds Apple or Google to the account this device is signed in to (Profile →
 * Account → "Add Google"), so either one signs in. When that sign-in already
 * has an account of its own, the answer is 409 ACCOUNT_EXISTS_CODE until the
 * person confirms (`combine: true`); then that account is combined into this
 * one: its canonical clientId's rows move over, then its devices and
 * sign-ins, and it's deleted. The person proved both: this device is signed
 * in to one, and the token is a fresh sign-in to the other.
 */
async function addSignIn(c: Ctx, provider: AuthProvider): Promise<Response> {
  const v = await verifiedSignIn(c, provider);
  if (v instanceof Response) return v;
  const link = await linkOr503(c, v.device);
  if (!link) fail(409, "Sign in first, then add another way to sign in.");
  const now = Date.now();
  const touch = { accountId: link.accountId, provider, subject: v.claims.sub, email: emailOf(v.claims), name: nameOf(provider, v), now };
  const state = await store.signInState(c.env.DB, provider, v.claims.sub, v.device);
  if (!state.identity) {
    try {
      await store.touchAccount(c.env.DB, touch, true);
    } catch (err) {
      // Added meanwhile (a double tap): it's on an account now; this request's answer is the same either way.
      if (!store.isUniqueViolation(err)) throw err;
    }
  } else if (state.identity.accountId === link.accountId) {
    await store.touchAccount(c.env.DB, touch);
  } else {
    if (v.body.combine !== true) {
      return c.json({ error: `That ${PROVIDER_NAME[provider]} sign-in already has its own JaxSquares account.`, code: ACCOUNT_EXISTS_CODE }, 409);
    }
    const other = state.identity;
    const others = await store.clientsOf(c.env.DB, other.accountId);
    const merge = await mergeStatements(c.env, other.canonical, link.canonical, now);
    const results = await c.env.DB.batch([...merge, ...store.combineAccountStatements(c.env.DB, other.accountId, link.accountId, now)]);
    await store.touchAccount(c.env.DB, touch);
    // Its devices act as this account from their next request (other isolates within 30 s).
    forgetClients([...others, other.canonical]);
    forgetClubBrand(c.env.DB, link.canonical);
    broadcastMerged(c, (results[0].results as { id: string }[]).map((r) => r.id));
  }
  keepAppleToken(c, v);
  return c.json(await meFor(c.env, link.canonical, link.accountId), 200, { "cache-control": "no-store" });
}

authRoutes.post("/auth/apple", (c) => signIn(c, "apple"));
authRoutes.post("/auth/google", (c) => signIn(c, "google"));
authRoutes.post("/auth/apple/link", (c) => addSignIn(c, "apple"));
authRoutes.post("/auth/google/link", (c) => addSignIn(c, "google"));

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
  // Email addresses for notices go: nobody could manage them afterwards. So
  // does a Club Pass holder's club (its name, logo and TV link).
  await c.env.DB.batch([
    ...store.deleteAccountStatements(c.env.DB, link.accountId),
    pushStore.deleteClientSubscriptionsStatement(c.env.DB, link.canonical),
    emailStore.deleteClientSubscriptionsStatement(c.env.DB, link.canonical),
    clubStore.deleteOwnerStatement(c.env.DB, link.canonical),
  ]);
  forgetClients([device, ...doomed.clients]);
  return c.json({ ok: true });
});
