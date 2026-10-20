// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  APP_STORE_HOSTS,
  appStoreJwt,
  decodeJwsPayload,
  fetchAppStoreTransaction,
  transactionProblem,
  type AppStoreCredentials,
  type AppStoreTransaction,
} from "./apple";
import { boardAccountToken } from "./boardToken";
import { base64UrlDecode, base64UrlEncode, utf8 } from "./encoding";

async function makeKey(): Promise<{ pem: string; publicKey: CryptoKey }> {
  const pair = (await crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, ["sign", "verify"])) as CryptoKeyPair;
  const der = new Uint8Array((await crypto.subtle.exportKey("pkcs8", pair.privateKey)) as ArrayBuffer);
  const b64 = btoa(String.fromCharCode(...der));
  const pem = `-----BEGIN PRIVATE KEY-----\n${b64.match(/.{1,64}/g)!.join("\n")}\n-----END PRIVATE KEY-----\n`;
  return { pem, publicKey: pair.publicKey };
}

const BUNDLE = "com.jaxsquares.app";
const PRODUCT = "com.jaxsquares.app.board";

/** Shaped like Apple's JWSTransactionDecodedPayload for a consumable bought in the sandbox. */
function transaction(overrides: Partial<AppStoreTransaction> = {}): AppStoreTransaction {
  return {
    transactionId: "2000000812345678",
    originalTransactionId: "2000000812345678",
    bundleId: BUNDLE,
    productId: PRODUCT,
    type: "Consumable",
    quantity: 1,
    purchaseDate: 1_760_000_000_000,
    price: 4990,
    currency: "USD",
    environment: "Sandbox",
    appAccountToken: boardAccountToken("g1")!,
    ...overrides,
  };
}

/** A compact JWS with Apple's header shape. The signature is filler: the server doesn't verify it. */
function jws(payload: unknown): string {
  const header = base64UrlEncode(JSON.stringify({ alg: "ES256", x5c: ["MIIB...leaf", "MIIB...intermediate", "MIIB...root"] }));
  return `${header}.${base64UrlEncode(JSON.stringify(payload))}.${base64UrlEncode(new Uint8Array(64))}`;
}

describe("appStoreJwt", () => {
  it("builds an ES256 JWT with Apple's required header and claims, verifiable with the public key", async () => {
    const { pem, publicKey } = await makeKey();
    const creds: AppStoreCredentials = { keyId: "2X9R4HXF34", issuerId: "57246542-96fe-1a63-e053-0824d011072a", privateKeyPem: pem, bundleId: BUNDLE };
    const token = await appStoreJwt(creds, 1_760_000_000);
    const [h, p, s] = token.split(".");

    expect(JSON.parse(new TextDecoder().decode(base64UrlDecode(h)))).toEqual({ alg: "ES256", kid: "2X9R4HXF34", typ: "JWT" });
    expect(JSON.parse(new TextDecoder().decode(base64UrlDecode(p)))).toEqual({
      iss: "57246542-96fe-1a63-e053-0824d011072a",
      iat: 1_760_000_000,
      exp: 1_760_000_300,
      aud: "appstoreconnect-v1",
      bid: BUNDLE,
    });
    expect(token).not.toMatch(/[=+/]/); // base64url, unpadded

    const sig = base64UrlDecode(s);
    expect(sig.length).toBe(64); // raw r||s, not DER
    const valid = await crypto.subtle.verify({ name: "ECDSA", hash: "SHA-256" }, publicKey, sig, utf8(`${h}.${p}`));
    expect(valid).toBe(true);
  });

  it("accepts a PEM pasted with escaped newlines (as wrangler secrets often are)", async () => {
    const { pem } = await makeKey();
    const escaped = pem.trim().replace(/\n/g, "\\n");
    const token = await appStoreJwt({ keyId: "K", issuerId: "I", privateKeyPem: escaped, bundleId: BUNDLE });
    expect(token.split(".")).toHaveLength(3);
  });
});

describe("decodeJwsPayload", () => {
  it("reads the payload of a signedTransactionInfo", () => {
    expect(decodeJwsPayload<AppStoreTransaction>(jws(transaction())).productId).toBe(PRODUCT);
  });

  it("rejects strings that aren't a compact JWS", () => {
    expect(() => decodeJwsPayload("nope")).toThrow("Malformed JWS");
  });
});

describe("transactionProblem", () => {
  const expected = { transactionId: "2000000812345678", bundleId: BUNDLE, productId: PRODUCT, gameId: "g1" };

  it("accepts a matching, unrevoked purchase for this board", () => {
    expect(transactionProblem(transaction(), expected)).toBeNull();
    expect(transactionProblem(transaction({ appAccountToken: undefined }), expected)).toBeNull();
    // Swift reports UUIDs uppercase; still the same board.
    expect(transactionProblem(transaction({ appAccountToken: boardAccountToken("g1")!.toUpperCase() }), expected)).toBeNull();
  });

  it("rejects the wrong app, product, board, a refund, or a different transaction", () => {
    expect(transactionProblem(transaction({ bundleId: "com.other.app" }), expected)).toMatch(/different app/);
    expect(transactionProblem(transaction({ productId: "com.jaxsquares.app.tip" }), expected)).toMatch(/isn't a JaxSquares board/);
    expect(transactionProblem(transaction({ revocationDate: 1_760_000_100_000, revocationReason: 0 }), expected)).toMatch(/refunded/);
    expect(transactionProblem(transaction({ appAccountToken: boardAccountToken("g2")! }), expected)).toMatch(/different board/);
    expect(transactionProblem(transaction({ transactionId: "1" }), expected)).toMatch(/different purchase/);
  });
});

describe("fetchAppStoreTransaction", () => {
  afterEach(() => vi.unstubAllGlobals());

  async function creds(): Promise<AppStoreCredentials> {
    return { keyId: "K", issuerId: "I", privateKeyPem: (await makeKey()).pem, bundleId: BUNDLE };
  }

  it("asks production first with a bearer JWT", async () => {
    const fetchMock = vi.fn(async () => Response.json({ signedTransactionInfo: jws(transaction({ environment: "Production" })) }));
    vi.stubGlobal("fetch", fetchMock);
    const tx = await fetchAppStoreTransaction(await creds(), "2000000812345678");
    expect(tx?.environment).toBe("Production");
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe(`${APP_STORE_HOSTS.production}/inApps/v1/transactions/2000000812345678`);
    expect((init.headers as Record<string, string>).authorization).toMatch(/^Bearer [\w-]+\.[\w-]+\.[\w-]+$/);
  });

  it("falls back to the sandbox on a production 404", async () => {
    const fetchMock = vi.fn(async (url: string) =>
      url.startsWith(APP_STORE_HOSTS.production)
        ? Response.json({ errorCode: 4040010, errorMessage: "Transaction id not found." }, { status: 404 })
        : Response.json({ signedTransactionInfo: jws(transaction()) }),
    );
    vi.stubGlobal("fetch", fetchMock);
    const tx = await fetchAppStoreTransaction(await creds(), "2000000812345678");
    expect(tx?.environment).toBe("Sandbox");
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[1][0]).toBe(`${APP_STORE_HOSTS.sandbox}/inApps/v1/transactions/2000000812345678`);
  });

  it("returns null when neither environment knows the transaction", async () => {
    vi.stubGlobal("fetch", async () => Response.json({ errorCode: 4040010 }, { status: 404 }));
    expect(await fetchAppStoreTransaction(await creds(), "1")).toBeNull();
  });

  it("throws on auth and server errors instead of falling back", async () => {
    const fetchMock = vi.fn(async () => new Response("", { status: 401 }));
    vi.stubGlobal("fetch", fetchMock);
    await expect(fetchAppStoreTransaction(await creds(), "1")).rejects.toMatchObject({ name: "AppStoreApiError", status: 401 });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
