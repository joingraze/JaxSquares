// The secrets in email links (docs/email.md "Tokens").
//
// Confirmation links carry a random 256-bit token; only its SHA-256 is stored
// (email_subscriptions.confirm_token_hash), so the table alone can't confirm
// anything. Used once: confirming clears it.
//
// Unsubscribe links are signed instead of stored: "<game id>.<address key>.<HMAC>"
// under EMAIL_TOKEN_SECRET. Why HMAC rather than a stored random token per
// subscription:
// - the link must keep working after the row is gone (an address is deleted
//   a week after the final, but "stop all JaxSquares email" from an old email
//   still has to land, and mail providers keep List-Unsubscribe URLs around);
// - it carries the address's keyed hash, which is exactly what the
//   suppression list stores, so "all" needs no lookup of the address;
// - nothing in D1 can be replayed as a link, and there's no extra column.
// The cost: rotating EMAIL_TOKEN_SECRET breaks links already sent and resets
// the address keys (docs/email.md says to rotate only if it leaked).
//
// An address's key is HMAC(secret, address), not a plain SHA-256: addresses
// are easy to guess, so a bare hash in the suppression list or a link would
// confirm a guess. Without the secret it can't be checked or reversed.

const enc = new TextEncoder();

function base64url(bytes: Uint8Array): string {
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromBase64url(s: string): Uint8Array<ArrayBuffer> {
  const bin = atob(s.replace(/-/g, "+").replace(/_/g, "/"));
  const out = new Uint8Array(new ArrayBuffer(bin.length));
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

/** A confirmation token: 32 random bytes, base64url (43 chars). */
export const CONFIRM_TOKEN_RE = /^[A-Za-z0-9_-]{43}$/;
/** An address key: the first 32 base64url chars (192 bits) of its HMAC. */
export const EMAIL_KEY_RE = /^[A-Za-z0-9_-]{32}$/;
const UNSUBSCRIBE_RE = /^([a-z0-9]{4,16})\.([A-Za-z0-9_-]{32})\.([A-Za-z0-9_-]{43})$/;

export function randomToken(): string {
  return base64url(crypto.getRandomValues(new Uint8Array(32)));
}

/** What the table keeps of a confirmation token. */
export async function tokenHash(token: string): Promise<string> {
  return base64url(new Uint8Array(await crypto.subtle.digest("SHA-256", enc.encode(`jaxsquares:email-confirm:${token}`))));
}

const keys = new Map<string, Promise<CryptoKey>>();

function hmacKey(secret: string): Promise<CryptoKey> {
  let key = keys.get(secret);
  if (!key) {
    key = crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign", "verify"]);
    keys.set(secret, key);
  }
  return key;
}

async function sign(secret: string, message: string): Promise<Uint8Array> {
  return new Uint8Array(await crypto.subtle.sign("HMAC", await hmacKey(secret), enc.encode(message)));
}

/** The address's keyed hash (`email` already normalized): uniqueness per board, suppression, rate limits. */
export async function emailKeyOf(secret: string, email: string): Promise<string> {
  return base64url(await sign(secret, `jaxsquares:email-key:${email}`)).slice(0, 32);
}

const unsubscribeMessage = (gameId: string, emailKey: string) => `jaxsquares:unsubscribe:v1:${gameId}:${emailKey}`;

/** The unsubscribe token for one address on one board (it can also stop every board for that address). */
export async function unsubscribeToken(secret: string, gameId: string, emailKey: string): Promise<string> {
  return `${gameId}.${emailKey}.${base64url(await sign(secret, unsubscribeMessage(gameId, emailKey)))}`;
}

/** The board and address an unsubscribe token is for, or null when it's malformed or not ours (constant-time check). */
export async function readUnsubscribeToken(secret: string, token: unknown): Promise<{ gameId: string; emailKey: string } | null> {
  if (typeof token !== "string") return null;
  const m = UNSUBSCRIBE_RE.exec(token);
  if (!m) return null;
  const [, gameId, emailKey, sig] = m;
  const ok = await crypto.subtle.verify("HMAC", await hmacKey(secret), fromBase64url(sig), enc.encode(unsubscribeMessage(gameId, emailKey)));
  return ok ? { gameId, emailKey } : null;
}
