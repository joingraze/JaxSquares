// D1 access for the clubs table (migrations/0016_club.sql): a Club Pass
// holder's club, its name, logo and TV link. The table belongs to the clubs
// module, so its SQL lives here and nowhere else.
//
// Keyed by the holder's canonical clientId (owner_client_id), which never
// leaves the server: everything public names a club by its own random id.

import type { ClubLogoType } from "../../shared/clubs";

export interface ClubRow {
  /** Random, public (Game.club.id, /api/clubs/<id>/logo, /club/<id>/tv). */
  id: string;
  /** The holder's canonical clientId. Server-only. */
  ownerClientId: string;
  name: string;
  logoType: ClubLogoType | null;
  /** SHA-256 of the logo's bytes (16 hex); null with no logo. */
  logoEtag: string | null;
  /** SHA-256 (hex) of the TV link's token; null before there's one. */
  tvTokenHash: string | null;
  createdAt: number;
  updatedAt: number;
}

export interface ClubLogo {
  /** The image, base64. */
  base64: string;
  type: ClubLogoType;
  etag: string;
}

interface ClubDbRow {
  id: string;
  owner_client_id: string;
  name: string;
  logo_type: string | null;
  logo_etag: string | null;
  tv_token_hash: string | null;
  created_at: number;
  updated_at: number;
}

// Never the logo bytes: only GET /api/clubs/:id/logo reads those (clubLogo).
const COLUMNS = "id, owner_client_id, name, logo_type, logo_etag, tv_token_hash, created_at, updated_at";

function fromRow(r: ClubDbRow): ClubRow {
  return {
    id: r.id,
    ownerClientId: r.owner_client_id,
    name: r.name ?? "",
    logoType: r.logo_type === "image/webp" || r.logo_type === "image/png" ? r.logo_type : null,
    logoEtag: r.logo_etag,
    tvTokenHash: r.tv_token_hash,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

/** D1 / SQLite says the table isn't there: migration 0016 isn't applied (yet). */
export function isMissingTable(err: unknown): boolean {
  return /no such (table|column)/i.test(String(err instanceof Error ? err.message : err));
}

/** A new club id: 16 hex characters, random (isClubId). */
export function newClubId(): string {
  return crypto.randomUUID().replace(/-/g, "").slice(0, 16);
}

const byOwner = (db: D1Database, owner: string) => db.prepare(`SELECT ${COLUMNS} FROM clubs WHERE owner_client_id = ?`).bind(owner);

/** The identity's club, or null. Throws when the table is missing (isMissingTable). */
export async function clubOfOwner(db: D1Database, owner: string): Promise<ClubRow | null> {
  const row = await byOwner(db, owner).first<ClubDbRow>();
  return row ? fromRow(row) : null;
}

/** The club by its public id, or null. */
export async function clubById(db: D1Database, id: string): Promise<ClubRow | null> {
  const row = await db.prepare(`SELECT ${COLUMNS} FROM clubs WHERE id = ?`).bind(id).first<ClubDbRow>();
  return row ? fromRow(row) : null;
}

/**
 * The identity's club, made (unnamed, no logo, no TV link) the first time a
 * Club Pass holder needs one. One per identity: a race keeps the first.
 */
export async function ensureClub(db: D1Database, owner: string, now = Date.now()): Promise<ClubRow> {
  const [, read] = await db.batch<ClubDbRow>([
    db
      .prepare(`INSERT OR IGNORE INTO clubs (id, owner_client_id, name, created_at, updated_at) VALUES (?, ?, '', ?, ?)`)
      .bind(newClubId(), owner, now, now),
    byOwner(db, owner),
  ]);
  return fromRow(read.results[0]);
}

/** The club's logo (bytes as base64), or null when it has none. */
export async function clubLogo(db: D1Database, id: string): Promise<ClubLogo | null> {
  const row = await db
    .prepare(`SELECT logo, logo_type, logo_etag FROM clubs WHERE id = ? AND logo IS NOT NULL`)
    .bind(id)
    .first<{ logo: string; logo_type: string; logo_etag: string }>();
  if (!row || (row.logo_type !== "image/webp" && row.logo_type !== "image/png")) return null;
  return { base64: row.logo, type: row.logo_type, etag: row.logo_etag };
}

export async function renameClub(db: D1Database, owner: string, name: string, now = Date.now()): Promise<void> {
  await db.prepare(`UPDATE clubs SET name = ?2, updated_at = ?3 WHERE owner_client_id = ?1`).bind(owner, name, now).run();
}

export async function setClubLogo(db: D1Database, owner: string, logo: ClubLogo, now = Date.now()): Promise<void> {
  await db
    .prepare(`UPDATE clubs SET logo = ?2, logo_type = ?3, logo_etag = ?4, updated_at = ?5 WHERE owner_client_id = ?1`)
    .bind(owner, logo.base64, logo.type, logo.etag, now)
    .run();
}

export async function clearClubLogo(db: D1Database, owner: string, now = Date.now()): Promise<void> {
  await db
    .prepare(`UPDATE clubs SET logo = NULL, logo_type = NULL, logo_etag = NULL, updated_at = ?2 WHERE owner_client_id = ?1`)
    .bind(owner, now)
    .run();
}

/** A new TV link: only its token's hash is kept, so the old link stops working at once. */
export async function setTvTokenHash(db: D1Database, owner: string, hash: string, now = Date.now()): Promise<void> {
  await db.prepare(`UPDATE clubs SET tv_token_hash = ?2, updated_at = ?3 WHERE owner_client_id = ?1`).bind(owner, hash, now).run();
}

/** The club a TV link opens: its id and its token's hash both have to match; null otherwise. */
export async function clubByTvLink(db: D1Database, id: string, tokenHash: string): Promise<ClubRow | null> {
  const row = await db
    .prepare(`SELECT ${COLUMNS} FROM clubs WHERE id = ? AND tv_token_hash IS NOT NULL AND tv_token_hash = ?`)
    .bind(id, tokenHash)
    .first<ClubDbRow>();
  return row ? fromRow(row) : null;
}

// ---- Accounts (optional sign-in: worker/auth, docs/auth.md) ----

/**
 * A device signing in to an account: its club becomes the account's, unless
 * the account has a club of its own with anything in it (a name or a logo),
 * which stays; the device's is then dropped. An account's empty club (made
 * the first time its pass needed one) gives way to the device's. For the same
 * batch as the core rows and the link (worker/auth/store.ts linkDevice).
 */
export function mergeClientStatements(db: D1Database, from: string, to: string, now: number): D1PreparedStatement[] {
  return [
    db
      .prepare(
        `DELETE FROM clubs WHERE owner_client_id = ?2 AND name = '' AND logo IS NULL
           AND EXISTS (SELECT 1 FROM clubs WHERE owner_client_id = ?1)`,
      )
      .bind(from, to),
    db.prepare(`UPDATE OR IGNORE clubs SET owner_client_id = ?2, updated_at = ?3 WHERE owner_client_id = ?1`).bind(from, to, now),
    db.prepare(`DELETE FROM clubs WHERE owner_client_id = ?`).bind(from),
  ];
}

/** Deleting the account: the club's name, logo and TV link go with it. */
export function deleteOwnerStatement(db: D1Database, owner: string): D1PreparedStatement {
  return db.prepare(`DELETE FROM clubs WHERE owner_client_id = ?`).bind(owner);
}
