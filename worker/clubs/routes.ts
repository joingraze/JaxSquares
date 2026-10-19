// The Club Pass's club routes (mounted under /api by worker/index.ts, which
// also applies CORS). See docs/payments.md "Club Pass" and
// docs/ARCHITECTURE.md "The Club Pass".
//
//   GET    /clubs/mine         ClubSettings (the holder's club; 404 without an active Club Pass)
//   PATCH  /clubs/mine         { name } -> ClubSettings
//   PUT    /clubs/mine/logo    the logo's bytes (image/webp or image/png) -> ClubSettings
//   DELETE /clubs/mine/logo    ClubSettings
//   POST   /clubs/mine/tv      ClubTvLink (a new TV link; the old one stops working)
//   GET    /clubs/:id/logo     the logo (long cache, ETag); public
//   GET    /clubs/:id/tv       ClubTvState with the link's token in x-club-tv-token; 404 for a wrong one
//
// The "mine" routes act as the request's canonical clientId (the account's
// when signed in), like every other route, and need that identity's Club Pass
// to be active. Nothing here answers with a clientId: a club is named by its
// own random id, and its TV shows only the boards' public states. The players
// CSV is a board route (GET /api/games/:id/export.csv in worker/index.ts).

import { Hono, type Context } from "hono";
import { CLUB_TV_MAX_BOARDS, CLUB_TV_TOKEN_HEADER, clubNameProblem, clubTvPath, isClubId, isClubTvToken } from "../../shared/clubs";
import { isClientId } from "../../shared/playerId";
import type { ClubSettings, ClubTvLink, ClubTvState, GameState } from "../../shared/types";
import { canonicalClientId, SIGNED_IN_HEADER, signedInHint } from "../auth/canonical";
import * as db from "../db";
import type { Env } from "../env";
import { activeClubPass } from "../payments/pass";
import { playerIdOf } from "../playerIds";
import { RATE_LIMITS, addressSubject, checkRate, type RateRule } from "../rateLimit";
import { broadcast } from "../service";
import { brandOf, forgetClubBrand } from "./brand";
import { checkLogo, logoEtag } from "./logo";
import * as store from "./store";

type Ctx = Context<{ Bindings: Env }>;

export const clubRoutes = new Hono<{ Bindings: Env }>();

const NO_STORE = { "cache-control": "no-store" };
const NO_CLUB = "There's no Club Pass on this account.";
const NOT_FOUND = "This TV link doesn't work anymore. Ask the club for its new link.";
/** The logo's request body, at most: the logo's limit plus room for nothing else. */
const MAX_LOGO_BODY = 64 * 1024;
/** Most boards whose open screens get a club change right away; the rest catch up on their next read. */
const BROADCAST_MAX = CLUB_TV_MAX_BOARDS;

const missingClient = (c: Ctx) => c.json({ error: "Missing or invalid x-client-id" }, 401);

/** 429 once this device (its resolved public id) or its address is over `rule` / `perAddress`; null to carry on. */
async function limited(c: Ctx, clientId: string, rule: RateRule, perAddress: RateRule): Promise<Response | null> {
  const check = async (r: RateRule, subject: string) => {
    const { ok, retryAfter } = await checkRate(c.env.DB, r, subject);
    return ok ? null : c.json({ error: r.message }, 429, { "retry-after": String(retryAfter) });
  };
  const ip = c.req.header("cf-connecting-ip")?.trim();
  const [byDevice, byAddress] = await Promise.all([
    playerIdOf(clientId).then((subject) => check(rule, subject)),
    ip ? addressSubject(ip).then((subject) => check(perAddress, subject)) : null,
  ]);
  return byDevice ?? byAddress;
}

/** Run work after the response (falls back to fire-and-forget outside a Worker). */
function defer(c: Ctx, p: Promise<unknown>): void {
  const guarded = p.catch((err) => console.error("background task failed", err));
  try {
    c.executionCtx.waitUntil(guarded);
  } catch {
    // no execution context (tests)
  }
}

interface Holder {
  /** The canonical clientId. Server-only. */
  owner: string;
  club: store.ClubRow;
}

/**
 * Runs a "mine" route as the request's identity, once its Club Pass is active
 * (404 otherwise): its club is made on first need.
 */
async function asHolder(c: Ctx, run: (h: Holder) => Promise<Response>): Promise<Response> {
  const device = c.req.header("x-client-id") ?? "";
  if (!isClientId(device)) return missingClient(c);
  const owner = await canonicalClientId(c.env.DB, device, { signedIn: signedInHint(c.req.header(SIGNED_IN_HEADER)) });
  const now = Date.now();
  if (!(await activeClubPass(c.env.DB, owner, now))) return c.json({ error: NO_CLUB }, 404, NO_STORE);
  const club = (await store.clubOfOwner(c.env.DB, owner)) ?? (await store.ensureClub(c.env.DB, owner, now));
  return run({ owner, club });
}

async function settingsOf(env: Env, h: Holder): Promise<ClubSettings> {
  const club = (await store.clubOfOwner(env.DB, h.owner)) ?? h.club;
  return {
    club: brandOf(club),
    tvKey: club.tvTokenHash ? club.tvTokenHash.slice(0, 8) : null,
    boards: await db.clubBoards(env.DB, h.owner, Date.now(), CLUB_TV_MAX_BOARDS),
  };
}

/** The club changed: its boards read it fresh here, and their open screens get it now. */
function rebrand(c: Ctx, h: Holder, settings: ClubSettings): void {
  forgetClubBrand(c.env.DB, h.owner);
  defer(c, Promise.all(settings.boards.slice(0, BROADCAST_MAX).map((b) => broadcast(c.env, b.id))));
}

/** What D1 keeps of a TV link's token: a SHA-256 (hex), so the table can't be turned back into links. */
export async function tvTokenHash(token: string): Promise<string> {
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(`jaxsquares:club-tv:${token}`)));
  return Array.from(digest, (b) => b.toString(16).padStart(2, "0")).join("");
}

/** A new TV link token: 32 random bytes, base64url (43 characters; isClubTvToken). */
function newTvToken(): string {
  let bin = "";
  for (const b of crypto.getRandomValues(new Uint8Array(32))) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/** Single-line text: control and bidi-override characters stripped, whitespace collapsed. */
function cleanName(v: unknown): string {
  if (typeof v !== "string") return "";
  return v.replace(/[\p{Cc}‪-‮⁦-⁩]/gu, "").replace(/\s+/g, " ").trim();
}

/** The request's body, or null once it runs past `max` bytes (read no further: a missing Content-Length can't make it read everything). */
async function readCapped(req: Request, max: number): Promise<Uint8Array | null> {
  if (!req.body) return new Uint8Array(0);
  const reader = req.body.getReader();
  const parts: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > max) {
      await reader.cancel().catch(() => {});
      return null;
    }
    parts.push(value);
  }
  const out = new Uint8Array(size);
  let at = 0;
  for (const p of parts) {
    out.set(p, at);
    at += p.byteLength;
  }
  return out;
}

function bytesToBase64(bytes: Uint8Array): string {
  let bin = "";
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin);
}

function base64ToBytes(b64: string): Uint8Array<ArrayBuffer> {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

// ---- The holder's club ----

clubRoutes.get("/clubs/mine", (c) => asHolder(c, async (h) => c.json(await settingsOf(c.env, h), 200, NO_STORE)));

clubRoutes.patch("/clubs/mine", (c) =>
  asHolder(c, async (h) => {
    const body = (await c.req.json().catch(() => null)) as { name?: unknown } | null;
    if (!body || typeof body !== "object" || typeof body.name !== "string") return c.json({ error: "Give your club a name." }, 400);
    const name = cleanName(body.name);
    // Shown on every one of the club's boards and their link previews: checked like a board name.
    const problem = clubNameProblem(name);
    if (problem) return c.json({ error: problem }, 400);
    const tooMany = await limited(c, h.owner, RATE_LIMITS.clubBrand, RATE_LIMITS.clubBrandIp);
    if (tooMany) return tooMany;
    await store.renameClub(c.env.DB, h.owner, name);
    const settings = await settingsOf(c.env, h);
    rebrand(c, h, settings);
    return c.json(settings, 200, NO_STORE);
  }),
);

clubRoutes.put("/clubs/mine/logo", (c) =>
  asHolder(c, async (h) => {
    const declared = Number(c.req.header("content-length") ?? 0);
    if (declared > MAX_LOGO_BODY) return c.json({ error: "That logo is too big. Pick a smaller picture." }, 413);
    const tooMany = await limited(c, h.owner, RATE_LIMITS.clubBrand, RATE_LIMITS.clubBrandIp);
    if (tooMany) return tooMany;
    const bytes = await readCapped(c.req.raw, MAX_LOGO_BODY);
    if (!bytes) return c.json({ error: "That logo is too big. Pick a smaller picture." }, 413);
    const check = checkLogo(bytes, c.req.header("content-type"));
    if (!check.ok) return c.json({ error: check.error }, check.status);
    await store.setClubLogo(c.env.DB, h.owner, { base64: bytesToBase64(bytes), type: check.type, etag: await logoEtag(bytes) });
    const settings = await settingsOf(c.env, h);
    rebrand(c, h, settings);
    return c.json(settings, 200, NO_STORE);
  }),
);

clubRoutes.delete("/clubs/mine/logo", (c) =>
  asHolder(c, async (h) => {
    const tooMany = await limited(c, h.owner, RATE_LIMITS.clubBrand, RATE_LIMITS.clubBrandIp);
    if (tooMany) return tooMany;
    await store.clearClubLogo(c.env.DB, h.owner);
    const settings = await settingsOf(c.env, h);
    rebrand(c, h, settings);
    return c.json(settings, 200, NO_STORE);
  }),
);

/** A new TV link. Only its token's hash is kept, so the link comes back this once; the old one stops working. */
clubRoutes.post("/clubs/mine/tv", (c) =>
  asHolder(c, async (h) => {
    const tooMany = await limited(c, h.owner, RATE_LIMITS.clubTv, RATE_LIMITS.clubTvIp);
    if (tooMany) return tooMany;
    const token = newTvToken();
    await store.setTvTokenHash(c.env.DB, h.owner, await tvTokenHash(token));
    // The origin the app asked (the web app's own, or jaxsquares.com from the native app), like an invite link.
    const res: ClubTvLink = { ...(await settingsOf(c.env, h)), tvUrl: `${new URL(c.req.url).origin}${clubTvPath(h.club.id, token)}` };
    return c.json(res, 201, NO_STORE);
  }),
);

// ---- Public: the logo, and the club's TV ----

clubRoutes.get("/clubs/:id/logo", async (c) => {
  const id = c.req.param("id");
  if (!isClubId(id)) return c.json({ error: "Not found" }, 404);
  const logo = await store.clubLogo(c.env.DB, id).catch((err: unknown) => {
    if (store.isMissingTable(err)) return null;
    throw err;
  });
  if (!logo) return c.json({ error: "Not found" }, 404);
  const etag = `"${logo.etag}"`;
  // The board links it with its version (?v=), which changes with every new
  // logo: that URL never changes content. Without it, a day and the ETag.
  const versioned = c.req.query("v") === logo.etag;
  const headers = {
    etag,
    "cache-control": versioned ? "public, max-age=31536000, immutable" : "public, max-age=86400",
    "x-content-type-options": "nosniff",
    "content-security-policy": "default-src 'none'; sandbox",
  };
  const match = c.req.header("if-none-match");
  if (match && match.split(",").some((t) => t.trim().replace(/^W\//, "") === etag)) return new Response(null, { status: 304, headers });
  return new Response(base64ToBytes(logo.base64), { headers: { ...headers, "content-type": logo.type } });
});

/**
 * The club's TV: what's going round on it, read with the TV link's token
 * (x-club-tv-token; the link keeps it in its fragment, out of every log). A
 * wrong or old token is a 404, the same as a club that isn't there, so the
 * list of a club's boards is only ever shown to someone the holder gave the
 * link to. Only public board state (what GET /api/games/:id returns).
 */
clubRoutes.get("/clubs/:id/tv", async (c) => {
  // Counted before the token is checked, so tokens can't be tried at speed.
  const ip = c.req.header("cf-connecting-ip")?.trim();
  if (ip) {
    const { ok, retryAfter } = await checkRate(c.env.DB, RATE_LIMITS.clubTvViewIp, await addressSubject(ip));
    if (!ok) return c.json({ error: RATE_LIMITS.clubTvViewIp.message }, 429, { "retry-after": String(retryAfter) });
  }
  const id = c.req.param("id");
  const token = c.req.header(CLUB_TV_TOKEN_HEADER);
  if (!isClubId(id) || !isClubTvToken(token)) return c.json({ error: NOT_FOUND }, 404, NO_STORE);
  const club = await store.clubByTvLink(c.env.DB, id, await tvTokenHash(token)).catch((err: unknown) => {
    if (store.isMissingTable(err)) return null;
    throw err;
  });
  if (!club) return c.json({ error: NOT_FOUND }, 404, NO_STORE);
  const now = Date.now();
  const active = (await activeClubPass(c.env.DB, club.ownerClientId, now)) !== null;
  const ids = active ? (await db.clubBoards(c.env.DB, club.ownerClientId, now, CLUB_TV_MAX_BOARDS)).map((b) => b.id) : [];
  const states = await Promise.all(ids.map((gameId) => db.getGameState(c.env.DB, gameId)));
  const res: ClubTvState = { club: brandOf(club), active, boards: states.filter((s): s is GameState => s !== null) };
  return c.json(res, 200, NO_STORE);
});
