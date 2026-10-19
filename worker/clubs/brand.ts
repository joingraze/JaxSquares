// A board's club branding (Game.club): the host's club while the host holds an
// active Club Pass (worker/payments/pass.ts activeClubPass), else null. Read
// with every board state (worker/db.ts), so it's cached per isolate for a
// short TTL, like the canonical clientId: a rename or a new logo shows at once
// on the holder's own requests (forgetClubBrand) and the boards it broadcasts
// to, and within the TTL everywhere else; a pass that just ended stops
// branding within the TTL. Never throws: a missing table or a failed read is
// "no club" (the branding is cosmetic; the board must always load).

import type { ClubBrand } from "../../shared/types";
import { activeClubPass } from "../payments/pass";
import { clubOfOwner, ensureClub, isMissingTable, type ClubRow } from "./store";

export const CLUB_BRAND_TTL_MS = 30_000;
const CACHE_MAX = 5_000;

interface Entry {
  brand: ClubBrand | null;
  at: number;
}

// One cache per database binding (each test's database starts clean).
const caches = new WeakMap<D1Database, Map<string, Entry>>();

function cacheFor(db: D1Database): Map<string, Entry> {
  let cache = caches.get(db);
  if (!cache) {
    cache = new Map();
    caches.set(db, cache);
  }
  return cache;
}

/** The public branding of a club row. */
export function brandOf(club: Pick<ClubRow, "id" | "name" | "logoEtag">): ClubBrand {
  return { id: club.id, name: club.name, hasLogo: club.logoEtag !== null, logoVersion: club.logoEtag };
}

/**
 * The branding on the boards `hostClientId` (a board's host's canonical
 * clientId, server-only) hosts: their club while their Club Pass is active,
 * made on first need (unnamed until they name it), else null.
 */
export async function clubBrandOf(db: D1Database, hostClientId: string, now = Date.now()): Promise<ClubBrand | null> {
  if (!hostClientId) return null;
  const cache = cacheFor(db);
  const hit = cache.get(hostClientId);
  if (hit && now - hit.at < CLUB_BRAND_TTL_MS) return hit.brand;
  let brand: ClubBrand | null = null;
  try {
    const [pass, club] = await Promise.all([activeClubPass(db, hostClientId, now), clubOfOwner(db, hostClientId)]);
    if (pass) brand = brandOf(club ?? (await ensureClub(db, hostClientId, now)));
  } catch (err) {
    if (!isMissingTable(err)) console.error("club branding lookup failed", err);
    return null;
  }
  if (cache.size >= CACHE_MAX) cache.clear();
  cache.set(hostClientId, { brand, at: now });
  return brand;
}

/** The holder changed their club or their pass: read it fresh next time (this isolate). */
export function forgetClubBrand(db: D1Database, hostClientId: string): void {
  caches.get(db)?.delete(hostClientId);
}
