// x-client-id -> the clientId the request acts as. A device signed in to an
// account acts as the account's canonical clientId (migrations/0010), so its
// squares, boards, host checks, rate limits and push registrations are the
// account's on every device; any other device is itself, exactly as before.
//
// One indexed D1 read (client_links by primary key, joined to accounts),
// cached per isolate for a short TTL:
// - Signing in, out or deleting the account updates or drops this isolate's
//   entries at once. Another isolate can hold a stale "linked" answer for up
//   to the TTL; only the device that just signed out could use it, and the
//   app throws that clientId away on sign-out, so it never sends it again.
// - A stale "not linked" answer would act as the bare device right after it
//   signed in elsewhere, so the app sends `x-signed-in: 1` while it's signed
//   in, and that always skips a cached "not linked". The hint can only ask for
//   a fresh read: it never makes a device act as anyone else.
// - Missing tables (migration 0010 not applied) fail open to the header id.
//   Any other read error fails open too for a device that isn't signed in,
//   and is a 503 for one that is (better than acting as the bare device).

import { HTTPException } from "hono/http-exception";
import { isMissingTable, linkOf } from "./store";

export const SIGNED_IN_HEADER = "x-signed-in";
export const CANONICAL_TTL_MS = 30_000;
const CACHE_MAX = 10_000;

interface Entry {
  canonical: string;
  linked: boolean;
  at: number;
}

const cache = new Map<string, Entry>();

/** The `x-signed-in` header: the app believes it's signed in. */
export function signedInHint(header: string | null | undefined): boolean {
  return header === "1";
}

function remember(clientId: string, canonical: string, linked: boolean, now: number): void {
  if (cache.size >= CACHE_MAX) cache.clear();
  cache.set(clientId, { canonical, linked, at: now });
}

/** After a sign-in: this device now acts as `canonical`. */
export function rememberLink(clientId: string, canonical: string, now = Date.now()): void {
  remember(clientId, canonical, true, now);
}

/** After a sign-out or an account deletion: read these devices fresh next time. */
export function forgetClients(clientIds: Iterable<string>): void {
  for (const id of clientIds) cache.delete(id);
}

/** Tests. */
export function resetCanonicalCache(): void {
  cache.clear();
}

/** The account link for a device, read fresh (no cache): null when not linked or the tables are missing. Throws on other errors. */
export async function freshLink(db: D1Database, clientId: string, now = Date.now()): Promise<{ accountId: string; canonical: string } | null> {
  try {
    const link = await linkOf(db, clientId);
    remember(clientId, link?.canonical ?? clientId, !!link, now);
    return link;
  } catch (err) {
    if (isMissingTable(err)) {
      remember(clientId, clientId, false, now);
      return null;
    }
    throw err;
  }
}

/**
 * The clientId this request acts as (see the top of this file). `clientId`
 * must already be a valid x-client-id.
 */
export async function canonicalClientId(
  db: D1Database,
  clientId: string,
  opts: { signedIn?: boolean; now?: number } = {},
): Promise<string> {
  const now = opts.now ?? Date.now();
  const hit = cache.get(clientId);
  if (hit && now - hit.at < CANONICAL_TTL_MS && (hit.linked || !opts.signedIn)) return hit.canonical;
  try {
    const link = await freshLink(db, clientId, now);
    return link?.canonical ?? clientId;
  } catch (err) {
    console.error("account link lookup failed", err);
    if (opts.signedIn) throw new HTTPException(503, { message: "Couldn't check your sign-in. Try again in a moment." });
    return clientId;
  }
}
