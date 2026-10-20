// Sign in with Apple token revocation (App Store guideline 5.1.1(v): an app
// that offers account creation must let people delete the account, and an
// app using Sign in with Apple must revoke its tokens when they do).
//
// At sign-in the app sends Apple's one-time authorization code; we exchange it
// at https://appleid.apple.com/auth/token for a refresh token and keep that.
// Deleting the account revokes it at https://appleid.apple.com/auth/revoke.
// Both calls authenticate with a client secret: an ES256 JWT signed with the
// Sign in with Apple key (APPLE_TEAM_ID, APPLE_KEY_ID, APPLE_SIGNIN_PRIVATE_KEY).
// Without those secrets both steps are skipped with a log; sign-in still works.

import type { Env } from "../env";

export const APPLE_TOKEN_URL = "https://appleid.apple.com/auth/token";
export const APPLE_REVOKE_URL = "https://appleid.apple.com/auth/revoke";
const APPLE_AUDIENCE = "https://appleid.apple.com";
/** Client secrets are made per call, so a short life is plenty (Apple allows up to 6 months). */
const SECRET_TTL_S = 300;

const KEY_NAMES = ["APPLE_TEAM_ID", "APPLE_KEY_ID", "APPLE_SIGNIN_PRIVATE_KEY"] as const satisfies readonly (keyof Env)[];

/** Secrets still missing for token exchange and revocation ([] when ready). */
export function missingAppleKey(env: Env): string[] {
  return KEY_NAMES.filter((k) => !env[k]?.trim());
}

function base64Url(bytes: Uint8Array): string {
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

const base64UrlJson = (v: unknown) => base64Url(new TextEncoder().encode(JSON.stringify(v)));

/** PKCS#8 DER from a .p8 PEM, pasted with real newlines or as one line with `\n` escapes. */
function pemToDer(pem: string): Uint8Array {
  const b64 = pem
    .replace(/\\n/g, "\n")
    .replace(/-----(BEGIN|END) PRIVATE KEY-----/g, "")
    .replace(/\s+/g, "");
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

/**
 * The client secret for `clientId` (the bundle id for codes from the iOS app,
 * the Services ID for codes from the web): an ES256 JWT, iss = team id, sub =
 * client id. WebCrypto's ECDSA signature is already JOSE's raw r||s.
 */
export async function appleClientSecret(env: Env, clientId: string, now = Date.now()): Promise<string> {
  const key = await crypto.subtle.importKey(
    "pkcs8",
    pemToDer(env.APPLE_SIGNIN_PRIVATE_KEY ?? ""),
    { name: "ECDSA", namedCurve: "P-256" },
    false,
    ["sign"],
  );
  const iat = Math.floor(now / 1000);
  const signingInput = `${base64UrlJson({ alg: "ES256", kid: env.APPLE_KEY_ID?.trim() })}.${base64UrlJson({
    iss: env.APPLE_TEAM_ID?.trim(),
    iat,
    exp: iat + SECRET_TTL_S,
    aud: APPLE_AUDIENCE,
    sub: clientId,
  })}`;
  const sig = new Uint8Array(await crypto.subtle.sign({ name: "ECDSA", hash: "SHA-256" }, key, new TextEncoder().encode(signingInput)));
  return `${signingInput}.${base64Url(sig)}`;
}

let warnedMissing = false;

function warnMissing(env: Env, what: string): void {
  if (warnedMissing) return;
  warnedMissing = true;
  console.log(`Sign in with Apple ${what} skipped: ${missingAppleKey(env).join(", ")} not set (docs/auth.md)`);
}

/**
 * Exchanges a sign-in's authorization code for a refresh token, or null when
 * the key isn't configured or Apple refused (logged). `redirectUri` only for
 * codes from Sign in with Apple JS.
 */
export async function exchangeAppleCode(
  env: Env,
  input: { code: string; clientId: string; redirectUri?: string | null },
  fetcher: typeof fetch = fetch,
): Promise<string | null> {
  if (missingAppleKey(env).length > 0) {
    warnMissing(env, "token exchange");
    return null;
  }
  const form = new URLSearchParams({
    client_id: input.clientId,
    client_secret: await appleClientSecret(env, input.clientId),
    code: input.code,
    grant_type: "authorization_code",
  });
  if (input.redirectUri) form.set("redirect_uri", input.redirectUri);
  const res = await fetcher(APPLE_TOKEN_URL, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded", accept: "application/json" },
    body: form.toString(),
  });
  const body = (await res.json().catch(() => ({}))) as { refresh_token?: unknown; error?: unknown };
  if (!res.ok || typeof body.refresh_token !== "string") {
    console.error(`Sign in with Apple token exchange failed: ${res.status} ${String(body.error ?? "")}`);
    return null;
  }
  return body.refresh_token;
}

/** Revokes a refresh token. True when Apple accepted it; false (logged) when skipped or refused. */
export async function revokeAppleToken(
  env: Env,
  input: { token: string; clientId: string },
  fetcher: typeof fetch = fetch,
): Promise<boolean> {
  if (missingAppleKey(env).length > 0) {
    warnMissing(env, "token revocation");
    return false;
  }
  const form = new URLSearchParams({
    client_id: input.clientId,
    client_secret: await appleClientSecret(env, input.clientId),
    token: input.token,
    token_type_hint: "refresh_token",
  });
  const res = await fetcher(APPLE_REVOKE_URL, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: form.toString(),
  });
  if (!res.ok) console.error(`Sign in with Apple revoke failed: ${res.status}`);
  return res.ok;
}
