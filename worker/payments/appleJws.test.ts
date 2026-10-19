// @vitest-environment node
// The x5c chain check for App Store signed data, against real certificates and
// signatures (a stand-in chain from testCerts.ts; production trusts only Apple's root).
import { describe, expect, it } from "vitest";
import { APPLE_LEAF_MARKER, APPLE_ROOT_CA_G3_SHA256, AppleJwsError, verifyAppleJws } from "./appleJws";
import { base64UrlDecode, base64UrlEncode } from "./encoding";
import { makeCert, makeChain, signJws, type TestChain } from "./testCerts";
import { parseCertificate } from "./x509";

const PAYLOAD = { notificationType: "DID_RENEW", signedDate: Date.now(), data: { bundleId: "com.jaxsquares.app" } };

async function rejects(jws: string, chain: TestChain, reason: RegExp) {
  await expect(verifyAppleJws(jws, { rootSha256: chain.rootSha256 })).rejects.toThrow(reason);
  await expect(verifyAppleJws(jws, { rootSha256: chain.rootSha256 })).rejects.toBeInstanceOf(AppleJwsError);
}

describe("verifyAppleJws", () => {
  it("pins Apple Root CA - G3 by its published SHA-256", () => {
    expect(APPLE_ROOT_CA_G3_SHA256).toBe("63343abfb89a6a03ebb57e9b3f5fa7be7c4f5c756f3017b3a8c488c3653e9179");
  });

  it("returns the payload of a JWS signed by a leaf that chains to the trusted root", async () => {
    const chain = await makeChain();
    const jws = await signJws(PAYLOAD, chain);
    expect(await verifyAppleJws(jws, { rootSha256: chain.rootSha256 })).toEqual(PAYLOAD);
  });

  it("refuses a chain that doesn't end at Apple's root (the default trust)", async () => {
    const chain = await makeChain();
    await expect(verifyAppleJws(await signJws(PAYLOAD, chain))).rejects.toThrow(/not Apple's root/);
  });

  it("refuses a tampered payload or signature", async () => {
    const chain = await makeChain();
    const [h, , s] = (await signJws(PAYLOAD, chain)).split(".");
    await rejects(`${h}.${base64UrlEncode(JSON.stringify({ ...PAYLOAD, notificationType: "REFUND" }))}.${s}`, chain, /signature doesn't verify/);
    const sig = base64UrlDecode(s);
    sig[10] ^= 0xff;
    await rejects(`${h}.${(await signJws(PAYLOAD, chain)).split(".")[1]}.${base64UrlEncode(sig)}`, chain, /signature doesn't verify/);
  });

  it("refuses a leaf signed by a key that isn't the intermediate's (a broken chain)", async () => {
    const stranger = (await crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-384" }, false, ["sign"])) as CryptoKeyPair;
    const chain = await makeChain({ leaf: { signWith: stranger.privateKey } });
    await rejects(await signJws(PAYLOAD, chain), chain, /leaf not issued by the intermediate/);
  });

  it("refuses an intermediate the root didn't sign", async () => {
    const chain = await makeChain();
    const otherRoot = await makeCert({ cn: "Test Root CA - G3", curve: "P-384", ca: true });
    const forged = { ...chain, x5c: [chain.x5c[0], chain.x5c[1], btoa(String.fromCharCode(...otherRoot.der))] };
    const rootSha256 = Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", otherRoot.der as Uint8Array<ArrayBuffer>)), (b) =>
      b.toString(16).padStart(2, "0"),
    ).join("");
    await expect(verifyAppleJws(await signJws(PAYLOAD, forged), { rootSha256 })).rejects.toThrow(/intermediate not issued by the root/);
  });

  it("needs Apple's marker extensions and a CA intermediate", async () => {
    const noLeafMarker = await makeChain({ leaf: { markers: [] } });
    await rejects(await signJws(PAYLOAD, noLeafMarker), noLeafMarker, /leaf isn't App Store signing/);
    const noIntermediateMarker = await makeChain({ intermediate: { markers: [] } });
    await rejects(await signJws(PAYLOAD, noIntermediateMarker), noIntermediateMarker, /intermediate isn't Apple's/);
    const notCa = await makeChain({ intermediate: { ca: false } });
    await rejects(await signJws(PAYLOAD, notCa), notCa, /intermediate isn't a CA/);
  });

  it("checks every certificate is valid at the payload's signedDate", async () => {
    const day = 24 * 60 * 60_000;
    const chain = await makeChain({ leaf: { notBefore: Date.now() - 10 * day, notAfter: Date.now() - day } });
    await rejects(await signJws(PAYLOAD, chain), chain, /not valid at signedDate/);
    // Signed while it was valid: still good (Apple's offline check uses signedDate).
    const signedThen = { ...PAYLOAD, signedDate: Date.now() - 2 * day };
    expect(await verifyAppleJws(await signJws(signedThen, chain), { rootSha256: chain.rootSha256 })).toEqual(signedThen);
  });

  it("refuses anything that isn't ES256 with exactly three certificates", async () => {
    const chain = await makeChain();
    await rejects(await signJws(PAYLOAD, chain, { alg: "none" }), chain, /alg isn't ES256/);
    await rejects(await signJws(PAYLOAD, chain, { x5c: chain.x5c.slice(0, 2) }), chain, /three certificates/);
    await rejects(await signJws(PAYLOAD, chain, { x5c: [chain.x5c[0], "bm9wZQ==", chain.x5c[2]] }), chain, /unreadable certificate/);
    await rejects("not.a-jws", chain, /not a compact JWS/);
  });
});

describe("parseCertificate", () => {
  it("reads the names, validity, key curve and extensions", async () => {
    const chain = await makeChain();
    const leaf = parseCertificate(chain.leaf.der);
    const intermediate = parseCertificate(chain.intermediate.der);
    expect(leaf.curve).toBe("1.2.840.10045.3.1.7");
    expect(intermediate.curve).toBe("1.3.132.0.34");
    expect(leaf.extensions.has(APPLE_LEAF_MARKER)).toBe(true);
    expect(intermediate.isCa).toBe(true);
    expect(leaf.isCa).toBe(false);
    expect(leaf.issuer).toEqual(intermediate.subject);
    expect(leaf.notBefore).toBeLessThan(Date.now());
    expect(leaf.notAfter).toBeGreaterThan(Date.now());
  });

  it("throws on bytes that aren't a certificate", () => {
    expect(() => parseCertificate(new Uint8Array([0x30, 0x05, 0x01]))).toThrow();
    expect(() => parseCertificate(new Uint8Array([0x04, 0x00]))).toThrow();
  });
});
