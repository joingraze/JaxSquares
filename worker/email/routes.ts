// Email notice routes, mounted under /api by worker/index.ts (which also
// applies CORS). Contract: docs/ARCHITECTURE.md; model: docs/email.md.
//
//   GET    /games/:id/email           EmailNotices: the caller's own, address masked
//   POST   /games/:id/email           { email } | { resend: true } -> EmailNotices (pending)
//   DELETE /games/:id/email           EmailNotices (none): the address is deleted
//   GET    /email/confirm?token=      page asking to confirm (changes nothing)
//   POST   /email/confirm?token=      confirms, page says so
//   GET    /email/unsubscribe?token=  page: this board or every board (changes nothing)
//   POST   /email/unsubscribe?token=  unsubscribes (RFC 8058 one-click, or the page's buttons)
//
// Every board route acts as the request's canonical clientId (an account's
// devices share one address per board) and answers 503 until email is set up,
// except DELETE: anyone can always take their address back. No response
// carries a clientId, and an address only ever goes back to its owner, masked.

import { Hono, type Context } from "hono";
import { emailProblem, maskEmail, normalizeEmail } from "../../shared/email";
import { isClientId } from "../../shared/playerId";
import type { EmailNotices, Game } from "../../shared/types";
import { canonicalClientId, SIGNED_IN_HEADER, signedInHint } from "../auth/canonical";
import { getGame, getPlayers } from "../db";
import type { Env } from "../env";
import { playerIdOf } from "../playerIds";
import { addressSubject, checkRate, RATE_LIMITS, type RateRule } from "../rateLimit";
import { emailSetup, tokenSecretOf } from "./config";
import { sendConfirmation } from "./notices";
import { confirmPage, PAGE_HEADERS, unsubscribePage } from "./pages";
import * as store from "./store";
import { CONFIRM_TOKEN_RE, emailKeyOf, randomToken, readUnsubscribeToken, tokenHash } from "./tokens";

type Ctx = Context<{ Bindings: Env }>;

const GAME_ID_RE = /^[a-z0-9]{4,16}$/;
const MAX_BODY_BYTES = 4 * 1024;
/** A pending address's link isn't sent again sooner than this. */
export const RESEND_GAP_MS = 60_000;

export const EMAIL_UNAVAILABLE = "Email notices aren't set up yet.";
export const EMAIL_JOIN_FIRST = "Join the board first, then add your email.";
export const EMAIL_BOARD_OVER = "This board is over, so there's nothing left to email.";
export const EMAIL_TAKEN = "That email is already used on this board.";
export const EMAIL_SUPPRESSED = "That address asked us to stop all JaxSquares email, so we can't send to it.";
export const EMAIL_JUST_SENT = "We just sent that link. Check your inbox (and spam folder), or try again in a minute.";
export const EMAIL_NOTHING_TO_RESEND = "There's no email waiting to be confirmed for this board.";

export const emailRoutes = new Hono<{ Bindings: Env }>();

const error = (c: Ctx, status: 400 | 401 | 403 | 404 | 409 | 413 | 503, message: string) => c.json({ error: message }, status);

const noStore = { "cache-control": "no-store" };

function statusOf(row: store.SubscriptionRow | null): EmailNotices {
  if (!row) return { status: "none", email: null };
  return { status: row.status, email: row.email ? maskEmail(row.email) : null };
}

/** Run after the response (fire-and-forget outside a Worker). */
function defer(c: Ctx, p: Promise<unknown>): void {
  const guarded = p.catch((err) => console.error("email background task failed", err));
  try {
    c.executionCtx.waitUntil(guarded);
  } catch {
    // no execution context (tests)
  }
}

async function limited(c: Ctx, rule: RateRule, subject: string): Promise<Response | null> {
  const { ok, retryAfter } = await checkRate(c.env.DB, rule, subject);
  return ok ? null : c.json({ error: rule.message }, 429, { "retry-after": String(retryAfter) });
}

/** `rule` for this device (its public id) and `perAddress` for its network address, when Cloudflare says it. */
async function deviceLimited(c: Ctx, playerId: string, rule: RateRule, perAddress?: RateRule): Promise<Response | null> {
  const ip = c.req.header("cf-connecting-ip")?.trim();
  const [device, address] = await Promise.all([
    limited(c, rule, playerId),
    perAddress && ip ? addressSubject(ip).then((subject) => limited(c, perAddress, subject)) : null,
  ]);
  return device ?? address;
}

interface Caller {
  clientId: string;
  playerId: string;
  game: Game;
}

/** The caller (canonical clientId) and the board, or an error response. */
async function callerFor(c: Ctx): Promise<Caller | Response> {
  const header = c.req.header("x-client-id") ?? "";
  if (!isClientId(header)) return error(c, 401, "Missing or invalid x-client-id");
  const id = c.req.param("id") ?? "";
  if (!GAME_ID_RE.test(id)) return error(c, 404, "Game not found");
  const [clientId, game] = await Promise.all([
    canonicalClientId(c.env.DB, header, { signedIn: signedInHint(c.req.header(SIGNED_IN_HEADER)) }),
    getGame(c.env.DB, id),
  ]);
  if (!game) return error(c, 404, "Game not found");
  return { clientId, playerId: await playerIdOf(clientId), game };
}

async function readBody(c: Ctx): Promise<Record<string, unknown> | Response> {
  const text = await c.req.text().catch(() => "");
  if (text.length > MAX_BODY_BYTES) return error(c, 413, "Request too large");
  try {
    const body: unknown = JSON.parse(text);
    if (body && typeof body === "object" && !Array.isArray(body)) return body as Record<string, unknown>;
  } catch {
    // fall through
  }
  return error(c, 400, "Invalid JSON body");
}

emailRoutes.get("/games/:id/email", async (c) => {
  if (!emailSetup(c.env)) return error(c, 503, EMAIL_UNAVAILABLE);
  const caller = await callerFor(c);
  if (caller instanceof Response) return caller;
  const tooMany = await deviceLimited(c, caller.playerId, RATE_LIMITS.emailStatus);
  if (tooMany) return tooMany;
  return c.json(statusOf(await store.subscriptionOf(c.env.DB, caller.game.id, caller.clientId)), 200, noStore);
});

emailRoutes.post("/games/:id/email", async (c) => {
  const setup = emailSetup(c.env);
  if (!setup) return error(c, 503, EMAIL_UNAVAILABLE);
  const caller = await callerFor(c);
  if (caller instanceof Response) return caller;
  const { game, clientId, playerId } = caller;
  const body = await readBody(c);
  if (body instanceof Response) return body;
  const resend = body.resend === true;
  if (!resend && body.email === undefined) return error(c, 400, "Send the email address to use");
  if (!resend) {
    const problem = emailProblem(body.email);
    if (problem) return error(c, 400, problem);
  }
  const players = await getPlayers(c.env.DB, game.id);
  if (!players.some((p) => p.id === playerId)) return error(c, 403, EMAIL_JOIN_FIRST);
  if (game.status === "final") return error(c, 409, EMAIL_BOARD_OVER);
  // Counted once the request is valid, so fixing a typo doesn't use up a try.
  const tooMany = await deviceLimited(c, playerId, RATE_LIMITS.email, RATE_LIMITS.emailIp);
  if (tooMany) return tooMany;

  const now = Date.now();
  const mineNow = resend ? await store.subscriptionOf(c.env.DB, game.id, clientId) : null;
  if (resend && mineNow?.status !== "pending") return error(c, 409, EMAIL_NOTHING_TO_RESEND);
  const email = resend ? mineNow!.email : normalizeEmail(String(body.email));
  const emailKey = await emailKeyOf(setup.secret, email);
  const { mine, holder, suppressed } = await store.lookup(c.env.DB, game.id, clientId, emailKey);
  if (suppressed) return error(c, 409, EMAIL_SUPPRESSED);
  if (holder && holder.client_id !== clientId) return error(c, 409, EMAIL_TAKEN);

  const same = mine !== null && mine.email_key === emailKey;
  // Already getting this board's email at this address: nothing to send.
  if (same && mine.status === "confirmed") return c.json(statusOf(mine), 200, noStore);
  // The same pending address again is a resend: not more than once a minute.
  const resending = same && mine.status === "pending";
  if (resending && mine.confirm_sent_at !== null && now - mine.confirm_sent_at < RESEND_GAP_MS) {
    const wait = Math.ceil((RESEND_GAP_MS - (now - mine.confirm_sent_at)) / 1000);
    return c.json({ error: EMAIL_JUST_SENT }, 429, { "retry-after": String(wait) });
  }
  // However many devices ask, one address gets a handful of confirmation emails an hour.
  const flood = await limited(c, RATE_LIMITS.emailSend, emailKey);
  if (flood) return flood;

  const token = randomToken();
  const hash = await tokenHash(token);
  if (resending) {
    if (!(await store.renewPending(c.env.DB, mine.id, hash, now))) return error(c, 409, EMAIL_NOTHING_TO_RESEND);
  } else {
    try {
      await store.savePending(c.env.DB, { gameId: game.id, clientId, email, emailKey, tokenHash: hash, now });
    } catch (err) {
      // Another player took this address on this board a moment ago.
      if (store.isUniqueViolation(err)) return error(c, 409, EMAIL_TAKEN);
      throw err;
    }
  }
  defer(c, sendConfirmation(setup, { game }, { email, emailKey }, token));
  return c.json({ status: "pending", email: maskEmail(email) } satisfies EmailNotices, 200, noStore);
});

emailRoutes.delete("/games/:id/email", async (c) => {
  const caller = await callerFor(c);
  if (caller instanceof Response) return caller;
  const tooMany = await deviceLimited(c, caller.playerId, RATE_LIMITS.email, RATE_LIMITS.emailIp);
  if (tooMany) return tooMany;
  try {
    await store.removeSubscription(c.env.DB, caller.game.id, caller.clientId);
  } catch (err) {
    if (!store.isMissingTable(err)) throw err;
  }
  return c.json({ status: "none", email: null } satisfies EmailNotices, 200, noStore);
});

// ---- The pages an email's links open ----

const page = (c: Ctx, html: string, status: 200 | 400 | 429 | 503 = 200) => c.body(html, status, PAGE_HEADERS);

/** The link pages, per network address (absent outside Cloudflare). */
async function linkLimited(c: Ctx): Promise<boolean> {
  const ip = c.req.header("cf-connecting-ip")?.trim();
  if (!ip) return false;
  const { ok } = await checkRate(c.env.DB, RATE_LIMITS.emailLinkIp, await addressSubject(ip));
  return !ok;
}

async function boardName(c: Ctx, gameId: string): Promise<string | null> {
  return (await getGame(c.env.DB, gameId).catch(() => null))?.name ?? null;
}

async function confirm(c: Ctx, apply: boolean): Promise<Response> {
  if (!emailSetup(c.env)) return page(c, confirmPage("unavailable"), 503);
  if (await linkLimited(c)) return page(c, confirmPage("unavailable"), 429);
  const token = c.req.query("token") ?? "";
  if (!CONFIRM_TOKEN_RE.test(token)) return page(c, confirmPage("expired"), 400);
  const hash = await tokenHash(token);
  const now = Date.now();
  try {
    const row = apply ? await store.confirmByToken(c.env.DB, hash, now) : await store.pendingByToken(c.env.DB, hash, now);
    if (!row) return page(c, confirmPage("expired"), 400);
    const name = await boardName(c, row.game_id);
    return page(c, confirmPage(apply ? "done" : "ask", { boardName: name, gameId: row.game_id, token }));
  } catch (err) {
    if (store.isMissingTable(err)) return page(c, confirmPage("unavailable"), 503);
    throw err;
  }
}

emailRoutes.get("/email/confirm", (c) => confirm(c, false));
emailRoutes.post("/email/confirm", (c) => confirm(c, true));

async function unsubscribe(c: Ctx, apply: boolean): Promise<Response> {
  const secret = tokenSecretOf(c.env);
  if (!secret) return page(c, unsubscribePage("unavailable"), 503);
  if (await linkLimited(c)) return page(c, unsubscribePage("unavailable"), 429);
  const token = c.req.query("token") ?? "";
  const target = await readUnsubscribeToken(secret, token);
  if (!target) return page(c, unsubscribePage("invalid"), 400);
  const name = await boardName(c, target.gameId);
  if (!apply) return page(c, unsubscribePage("ask", { boardName: name, token }));
  // RFC 8058: a mail app's one-click POST sends "List-Unsubscribe=One-Click" (this board);
  // the page's buttons send scope=board or scope=all.
  const form = await c.req.parseBody().catch(() => ({}) as Record<string, unknown>);
  const all = form.scope === "all";
  const now = Date.now();
  try {
    if (all) await store.unsubscribeAll(c.env.DB, target.emailKey, now);
    else await store.unsubscribeBoard(c.env.DB, target.gameId, target.emailKey, now);
  } catch (err) {
    if (store.isMissingTable(err)) return page(c, unsubscribePage("unavailable"), 503);
    throw err;
  }
  return page(c, unsubscribePage(all ? "all" : "board", { boardName: name, token }));
}

emailRoutes.get("/email/unsubscribe", (c) => unsubscribe(c, false));
emailRoutes.post("/email/unsubscribe", (c) => unsubscribe(c, true));
