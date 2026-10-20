// Test-only: an RSA key pair standing in for Apple's or Google's, a JWKS
// response for it, and ID tokens signed with it (or tampered with).

export interface TestIssuer {
  kid: string;
  jwks: { keys: Record<string, unknown>[] };
  sign(claims: Record<string, unknown>, header?: Record<string, unknown>): Promise<string>;
}

function base64Url(bytes: Uint8Array): string {
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

const part = (v: unknown) => base64Url(new TextEncoder().encode(JSON.stringify(v)));

export async function sha256HexOf(s: string): Promise<string> {
  const d = new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s)));
  return Array.from(d, (b) => b.toString(16).padStart(2, "0")).join("");
}

export async function makeIssuer(kid = "test-key-1"): Promise<TestIssuer> {
  const pair = (await crypto.subtle.generateKey(
    { name: "RSASSA-PKCS1-v1_5", modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: "SHA-256" },
    true,
    ["sign", "verify"],
  )) as CryptoKeyPair;
  const jwk = (await crypto.subtle.exportKey("jwk", pair.publicKey)) as JsonWebKey;
  return {
    kid,
    jwks: { keys: [{ kty: "RSA", n: jwk.n, e: jwk.e, alg: "RS256", use: "sig", kid }] },
    async sign(claims, header = {}) {
      const input = `${part({ alg: "RS256", kid, typ: "JWT", ...header })}.${part(claims)}`;
      const sig = new Uint8Array(await crypto.subtle.sign("RSASSA-PKCS1-v1_5", pair.privateKey, new TextEncoder().encode(input)));
      return `${input}.${base64Url(sig)}`;
    },
  };
}

/** Standard claims for a token issued `now` (epoch ms), valid for an hour. */
export function claimsAt(now: number, over: Record<string, unknown> = {}): Record<string, unknown> {
  const iat = Math.floor(now / 1000);
  return { iat, exp: iat + 3600, ...over };
}
