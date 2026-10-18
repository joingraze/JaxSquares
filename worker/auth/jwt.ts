// Verifies the ID tokens Sign in with Apple and Sign in with Google hand the
// app: RS256 JWTs, checked with WebCrypto against the provider's published
// keys (JWKS), which are cached per isolate for as long as the provider's
// Cache-Control says (refetched early, at most once a minute, when a token
// names a key we don't have: the provider rotated its keys).
//
// Checks: the signature, `iss`, `aud` (our client ids), `exp` / `iat` with a
// small clock skew, a non-empty `sub`, and the nonce. The app hashes a fresh
// random nonce into each sign-in request (SHA-256, lowercase hex) and sends
// us the raw value, so a token lifted from somewhere can't be replayed: the
// thief sees only the hash. A token that carries a nonce must come with the
// matching raw nonce, and a raw nonce sent with a token that has none fails.

export const GOOGLE_JWKS_URL = "https://www.googleapis.com/oauth2/v3/certs";
export const APPLE_JWKS_URL = "https://appleid.apple.com/auth/keys";
export const GOOGLE_ISSUERS: readonly string[] = ["https://accounts.google.com", "accounts.google.com"];
export const APPLE_ISSUERS: readonly string[] = ["https://appleid.apple.com"];

/** Clock skew allowed on `exp` and `iat`, in seconds. */
export const SKEW_SECONDS = 60;
/** A key set is refetched for an unknown key id at most this often. */
const MIN_REFETCH_MS = 60_000;
/** Key set lifetime when the response has no usable max-age, and the bounds on what it may say. */
const DEFAULT_MAX_AGE_S = 3600;
const MIN_MAX_AGE_S = 300;
const MAX_MAX_AGE_S = 24 * 3600;
/** Longest token we look at. */
export const MAX_TOKEN_LENGTH = 8192;

/** The token can't be trusted. `reason` is for logs, never for the response. */
export class TokenError extends Error {
  constructor(readonly reason: string) {
    super(reason);
    this.name = "TokenError";
  }
}

/** The provider's keys couldn't be loaded (network, provider down): not the token's fault. */
export class JwksUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "JwksUnavailableError";
  }
}

export interface IdTokenClaims {
  iss: string;
  sub: string;
  aud: string | string[];
  exp: number;
  iat: number;
  azp?: string;
  nonce?: string;
  email?: string;
  /** Google: boolean; Apple: boolean or "true"/"false". */
  email_verified?: boolean | string;
  name?: string;
  [claim: string]: unknown;
}

export interface VerifyOptions {
  jwksUrl: string;
  issuers: readonly string[];
  /** Accepted `aud` values (our client ids); empty never verifies. */
  audiences: readonly string[];
  /** The raw nonce the client sent, if any. */
  nonce?: string | null;
  /** Epoch ms (tests). */
  now?: number;
  fetcher?: typeof fetch;
}

// ---- encoding ----

function base64UrlToBytes(s: string): Uint8Array {
  if (!/^[A-Za-z0-9_-]*$/.test(s)) throw new TokenError("bad base64url");
  const bin = atob(s.replace(/-/g, "+").replace(/_/g, "/") + "=".repeat((4 - (s.length % 4)) % 4));
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function jsonPart(part: string): Record<string, unknown> {
  let value: unknown;
  try {
    value = JSON.parse(new TextDecoder().decode(base64UrlToBytes(part)));
  } catch (err) {
    if (err instanceof TokenError) throw err;
    throw new TokenError("bad json");
  }
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new TokenError("bad json");
  return value as Record<string, unknown>;
}

/** SHA-256 of a string, lowercase hex: what a sign-in request carries as its nonce. */
export async function sha256Hex(s: string): Promise<string> {
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s)));
  return Array.from(digest, (b) => b.toString(16).padStart(2, "0")).join("");
}

function constantTimeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

// ---- key sets ----

interface KeySet {
  keys: Map<string, CryptoKey>;
  fetchedAt: number;
  expiresAt: number;
}

const keySets = new Map<string, KeySet>();
const loading = new Map<string, Promise<KeySet>>();

/** Forget every cached key set (tests). */
export function resetJwksCache(): void {
  keySets.clear();
  loading.clear();
}

function maxAgeOf(res: Response): number {
  const m = /(?:^|,)\s*max-age=(\d+)/i.exec(res.headers.get("cache-control") ?? "");
  const seconds = m ? Number(m[1]) : DEFAULT_MAX_AGE_S;
  return Math.min(MAX_MAX_AGE_S, Math.max(MIN_MAX_AGE_S, seconds));
}

async function fetchKeySet(url: string, fetcher: typeof fetch, now: number): Promise<KeySet> {
  let res: Response;
  try {
    res = await fetcher(url, { headers: { accept: "application/json" } });
  } catch (err) {
    throw new JwksUnavailableError(`${url}: ${String(err)}`);
  }
  if (!res.ok) throw new JwksUnavailableError(`${url}: HTTP ${res.status}`);
  const body = (await res.json().catch(() => null)) as { keys?: unknown } | null;
  if (!body || !Array.isArray(body.keys)) throw new JwksUnavailableError(`${url}: no keys`);
  const keys = new Map<string, CryptoKey>();
  for (const raw of body.keys as Record<string, unknown>[]) {
    if (!raw || raw.kty !== "RSA" || typeof raw.kid !== "string" || typeof raw.n !== "string" || typeof raw.e !== "string") continue;
    if (raw.alg !== undefined && raw.alg !== "RS256") continue;
    if (raw.use !== undefined && raw.use !== "sig") continue;
    try {
      const key = await crypto.subtle.importKey(
        "jwk",
        { kty: "RSA", n: raw.n, e: raw.e, alg: "RS256", ext: true },
        { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
        false,
        ["verify"],
      );
      keys.set(raw.kid, key);
    } catch {
      // a malformed key: skip it, the others still work
    }
  }
  return { keys, fetchedAt: now, expiresAt: now + maxAgeOf(res) * 1000 };
}

function loadKeySet(url: string, fetcher: typeof fetch, now: number): Promise<KeySet> {
  const inflight = loading.get(url);
  if (inflight) return inflight;
  const p = fetchKeySet(url, fetcher, now)
    .then((set) => {
      keySets.set(url, set);
      return set;
    })
    .finally(() => loading.delete(url));
  loading.set(url, p);
  return p;
}

async function keyFor(url: string, kid: string, fetcher: typeof fetch, now: number): Promise<CryptoKey> {
  let set = keySets.get(url);
  if (!set || set.expiresAt <= now) set = await loadKeySet(url, fetcher, now);
  let key = set.keys.get(kid);
  // A key id we haven't seen: the provider may have rotated its keys since we fetched.
  if (!key && now - set.fetchedAt >= MIN_REFETCH_MS) {
    set = await loadKeySet(url, fetcher, now);
    key = set.keys.get(kid);
  }
  if (!key) throw new TokenError(`unknown key ${kid}`);
  return key;
}

// ---- verification ----

/** Verifies an ID token and returns its claims; throws TokenError (or JwksUnavailableError). */
export async function verifyIdToken(token: string, opts: VerifyOptions): Promise<IdTokenClaims> {
  const now = opts.now ?? Date.now();
  if (typeof token !== "string" || token.length > MAX_TOKEN_LENGTH) throw new TokenError("bad token");
  const parts = token.split(".");
  if (parts.length !== 3 || parts.some((p) => p.length === 0)) throw new TokenError("not a JWT");
  const [h, p, s] = parts;
  const header = jsonPart(h);
  if (header.alg !== "RS256") throw new TokenError(`alg ${String(header.alg)}`);
  if (typeof header.kid !== "string" || !header.kid) throw new TokenError("no kid");
  const claims = jsonPart(p) as Partial<IdTokenClaims>;

  const key = await keyFor(opts.jwksUrl, header.kid, opts.fetcher ?? fetch, now);
  const ok = await crypto.subtle.verify(
    "RSASSA-PKCS1-v1_5",
    key,
    base64UrlToBytes(s),
    new TextEncoder().encode(`${h}.${p}`),
  );
  if (!ok) throw new TokenError("bad signature");

  if (typeof claims.iss !== "string" || !opts.issuers.includes(claims.iss)) throw new TokenError(`iss ${String(claims.iss)}`);
  const auds = typeof claims.aud === "string" ? [claims.aud] : Array.isArray(claims.aud) ? claims.aud : [];
  if (!auds.some((a) => typeof a === "string" && opts.audiences.includes(a))) throw new TokenError("aud");
  // Several audiences: the party it was issued to must be ours too (OpenID Connect Core 3.1.3.7).
  if (auds.length > 1 && (typeof claims.azp !== "string" || !opts.audiences.includes(claims.azp))) throw new TokenError("azp");
  if (typeof claims.exp !== "number" || claims.exp * 1000 <= now - SKEW_SECONDS * 1000) throw new TokenError("expired");
  if (typeof claims.iat !== "number" || claims.iat * 1000 > now + SKEW_SECONDS * 1000) throw new TokenError("iat in the future");
  if (typeof claims.sub !== "string" || !claims.sub || claims.sub.length > 255) throw new TokenError("sub");

  const raw = opts.nonce ?? null;
  if (typeof claims.nonce === "string" && claims.nonce) {
    if (!raw) throw new TokenError("nonce missing");
    if (!constantTimeEqual(await sha256Hex(raw), claims.nonce.toLowerCase())) throw new TokenError("nonce mismatch");
  } else if (raw) {
    throw new TokenError("token has no nonce");
  }
  return claims as IdTokenClaims;
}
