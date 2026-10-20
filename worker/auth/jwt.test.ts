// @vitest-environment node
// ID token verification (worker/auth/jwt.ts) with locally generated RSA keys
// and a mocked JWKS endpoint.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { APPLE_ISSUERS, GOOGLE_ISSUERS, JwksUnavailableError, TokenError, resetJwksCache, verifyIdToken, type VerifyOptions } from "./jwt";
import { claimsAt, makeIssuer, sha256HexOf, type TestIssuer } from "./testTokens";

const NOW = Date.UTC(2026, 9, 18, 18, 0, 0);
const JWKS = "https://keys.test/jwks";
const AUD = "web-client.apps.googleusercontent.com";

let issuer: TestIssuer;
let fetcher: ReturnType<typeof vi.fn>;

const jwksResponse = (body: unknown, maxAge = 3600) =>
  new Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/json", "cache-control": `public, max-age=${maxAge}` } });

function opts(over: Partial<VerifyOptions> = {}): VerifyOptions {
  return { jwksUrl: JWKS, issuers: GOOGLE_ISSUERS, audiences: [AUD, "ios-client.apps.googleusercontent.com"], now: NOW, fetcher: fetcher as unknown as typeof fetch, ...over };
}

const google = (over: Record<string, unknown> = {}) =>
  claimsAt(NOW, { iss: "https://accounts.google.com", aud: AUD, sub: "1234567890", email: "maya@example.com", email_verified: true, ...over });

/** The verification error's reason ("" if it passed). */
async function reasonOf(p: Promise<unknown>): Promise<string> {
  try {
    await p;
    return "";
  } catch (err) {
    if (err instanceof TokenError) return err.reason;
    throw err;
  }
}

beforeEach(async () => {
  resetJwksCache();
  issuer ??= await makeIssuer();
  fetcher = vi.fn(async () => jwksResponse(issuer.jwks));
});

describe("verifyIdToken", () => {
  it("accepts a good token and returns its claims", async () => {
    const claims = await verifyIdToken(await issuer.sign(google()), opts());
    expect(claims).toMatchObject({ sub: "1234567890", email: "maya@example.com", aud: AUD });
    expect(fetcher).toHaveBeenCalledWith(JWKS, expect.anything());
  });

  it("accepts either Google issuer spelling and any of our audiences", async () => {
    await expect(verifyIdToken(await issuer.sign(google({ iss: "accounts.google.com" })), opts())).resolves.toBeTruthy();
    await expect(verifyIdToken(await issuer.sign(google({ aud: "ios-client.apps.googleusercontent.com" })), opts())).resolves.toBeTruthy();
  });

  it("refuses a token for someone else's client (aud)", async () => {
    expect(await reasonOf(verifyIdToken(await issuer.sign(google({ aud: "another-app.apps.googleusercontent.com" })), opts()))).toBe("aud");
    // Several audiences need one of ours as the authorized party.
    expect(await reasonOf(verifyIdToken(await issuer.sign(google({ aud: [AUD, "other"], azp: "other" })), opts()))).toBe("azp");
    expect(await reasonOf(verifyIdToken(await issuer.sign(google()), opts({ audiences: [] })))).toBe("aud");
  });

  it("refuses the wrong issuer", async () => {
    expect(await reasonOf(verifyIdToken(await issuer.sign(google({ iss: "https://evil.example" })), opts()))).toMatch(/^iss/);
    // An Apple token isn't a Google token, even signed by a key we'd trust.
    expect(await reasonOf(verifyIdToken(await issuer.sign(google({ iss: APPLE_ISSUERS[0] })), opts()))).toMatch(/^iss/);
  });

  it("refuses an expired token, allowing a minute of clock skew", async () => {
    const iat = Math.floor(NOW / 1000) - 7200;
    expect(await reasonOf(verifyIdToken(await issuer.sign(google({ iat, exp: iat + 3600 })), opts()))).toBe("expired");
    const justNow = Math.floor(NOW / 1000) - 30;
    await expect(verifyIdToken(await issuer.sign(google({ iat: justNow - 3600, exp: justNow })), opts())).resolves.toBeTruthy();
    expect(await reasonOf(verifyIdToken(await issuer.sign(google({ iat: Math.floor(NOW / 1000) + 600 })), opts()))).toBe("iat in the future");
  });

  it("refuses a bad signature", async () => {
    const forger = await makeIssuer(issuer.kid); // same key id, different key
    expect(await reasonOf(verifyIdToken(await forger.sign(google()), opts()))).toBe("bad signature");
    // Claims swapped under a real signature.
    const [h, , s] = (await issuer.sign(google())).split(".");
    const p = (await issuer.sign(google({ sub: "someone-else" }))).split(".")[1];
    expect(await reasonOf(verifyIdToken(`${h}.${p}.${s}`, opts()))).toBe("bad signature");
  });

  it("refuses unsigned or non-RS256 tokens and garbage", async () => {
    const token = await issuer.sign(google(), { alg: "none" });
    expect(await reasonOf(verifyIdToken(token, opts()))).toBe("alg none");
    expect(await reasonOf(verifyIdToken(await issuer.sign(google(), { alg: "HS256" }), opts()))).toBe("alg HS256");
    expect(await reasonOf(verifyIdToken("a!b.c.d", opts()))).toBe("bad base64url");
    expect(await reasonOf(verifyIdToken("abc.def.ghi", opts()))).toBe("bad json");
    expect(await reasonOf(verifyIdToken("abc", opts()))).toBe("not a JWT");
    expect(await reasonOf(verifyIdToken(await issuer.sign(google({ sub: "" })), opts()))).toBe("sub");
  });

  it("checks the nonce: the token carries the SHA-256 of the raw nonce the app sends", async () => {
    const raw = "a-fresh-random-nonce";
    const token = await issuer.sign(google({ nonce: await sha256HexOf(raw) }));
    await expect(verifyIdToken(token, opts({ nonce: raw }))).resolves.toBeTruthy();
    expect(await reasonOf(verifyIdToken(token, opts({ nonce: "some-other-nonce" })))).toBe("nonce mismatch");
    // A thief sees only the hash: sending it as the raw nonce fails.
    expect(await reasonOf(verifyIdToken(token, opts({ nonce: await sha256HexOf(raw) })))).toBe("nonce mismatch");
    expect(await reasonOf(verifyIdToken(token, opts()))).toBe("nonce missing");
    // A nonce sent for a token minted without one.
    expect(await reasonOf(verifyIdToken(await issuer.sign(google()), opts({ nonce: raw })))).toBe("token has no nonce");
  });

  it("caches the key set for its max-age, and refetches early for an unknown key (rotation)", async () => {
    await verifyIdToken(await issuer.sign(google()), opts());
    await verifyIdToken(await issuer.sign(google()), opts({ now: NOW + 30 * 60_000 }));
    expect(fetcher).toHaveBeenCalledTimes(1);
    // Past max-age: fetched again.
    await verifyIdToken(await issuer.sign(google(claimsAt(NOW + 2 * 3600_000))), opts({ now: NOW + 2 * 3600_000 }));
    expect(fetcher).toHaveBeenCalledTimes(2);

    // The provider rotates: a new key id shows up in a refetch.
    const rotated = await makeIssuer("test-key-2");
    fetcher.mockImplementation(async () => jwksResponse({ keys: [...issuer.jwks.keys, ...rotated.jwks.keys] }));
    const later = NOW + 2 * 3600_000 + 5 * 60_000;
    await expect(verifyIdToken(await rotated.sign(google(claimsAt(later))), opts({ now: later }))).resolves.toBeTruthy();
    expect(fetcher).toHaveBeenCalledTimes(3);
    // A key id nobody has: no more than one refetch a minute.
    const stranger = await makeIssuer("nobody");
    expect(await reasonOf(verifyIdToken(await stranger.sign(google(claimsAt(later))), opts({ now: later + 1000 })))).toBe("unknown key nobody");
    expect(fetcher).toHaveBeenCalledTimes(3);
  });

  it("reports the provider being unreachable separately from a bad token", async () => {
    fetcher.mockImplementation(async () => new Response("down", { status: 503 }));
    await expect(verifyIdToken(await issuer.sign(google()), opts())).rejects.toBeInstanceOf(JwksUnavailableError);
    fetcher.mockImplementation(async () => {
      throw new TypeError("network");
    });
    await expect(verifyIdToken(await issuer.sign(google()), opts())).rejects.toBeInstanceOf(JwksUnavailableError);
  });
});
