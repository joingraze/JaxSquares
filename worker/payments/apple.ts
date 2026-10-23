// Apple In-App Purchase verification via the App Store Server API.
// Docs: https://developer.apple.com/documentation/appstoreserverapi/get-transaction-info
//       https://developer.apple.com/documentation/appstoreserverapi/generating-json-web-tokens-for-api-requests

import { gameIdFromAccountToken } from "./boardToken";
import { base64ToBytes, base64UrlDecode, base64UrlEncode, utf8 } from "./encoding";

export const APP_STORE_HOSTS = {
  production: "https://api.storekit.itunes.apple.com",
  sandbox: "https://api.storekit-sandbox.itunes.apple.com",
} as const;

/** Apple rejects tokens that live longer than an hour; a few minutes is plenty for one request. */
const JWT_TTL_SEC = 5 * 60;

export interface AppStoreCredentials {
  keyId: string;
  issuerId: string;
  /** Contents of the .p8 file (PKCS#8 PEM). Escaped "\n" sequences are accepted. */
  privateKeyPem: string;
  bundleId: string;
}

/** The fields of JWSTransactionDecodedPayload we rely on. */
export interface AppStoreTransaction {
  transactionId: string;
  originalTransactionId?: string;
  bundleId: string;
  productId: string;
  type?: string;
  quantity?: number;
  purchaseDate?: number;
  /** Milliunits of `currency`, e.g. 4990 = 4.99. */
  price?: number;
  currency?: string;
  environment?: "Production" | "Sandbox" | string;
  appAccountToken?: string;
  revocationDate?: number;
  revocationReason?: number;
  /** Auto-renewable subscriptions: when this period ends (epoch ms). */
  expiresDate?: number;
  /** When Apple signed it (epoch ms). */
  signedDate?: number;
}

/** The fields of JWSRenewalInfoDecodedPayload we rely on. */
export interface AppStoreRenewalInfo {
  originalTransactionId?: string;
  productId?: string;
  /** 1 = renews at the end of the period, 0 = turned off. */
  autoRenewStatus?: number;
  /** In a billing grace period: access lasts until then (epoch ms). */
  gracePeriodExpiresDate?: number;
  isInBillingRetryPeriod?: boolean;
  environment?: string;
  signedDate?: number;
}

/** One subscription's state from the App Store Server API (Get All Subscription Statuses). */
export interface AppStoreSubscriptionStatus {
  /** 1 active, 2 expired, 3 billing retry, 4 billing grace period, 5 revoked. */
  status: number;
  transaction: AppStoreTransaction;
  renewal: AppStoreRenewalInfo | null;
}

export class AppStoreApiError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
    this.name = "AppStoreApiError";
  }
}

export function pemToPkcs8(pem: string): Uint8Array<ArrayBuffer> {
  const body = pem
    .replace(/\\n/g, "\n")
    .replace(/-----(BEGIN|END) [A-Z ]+-----/g, "")
    .replace(/\s+/g, "");
  return base64ToBytes(body);
}

export function importAppStoreKey(pem: string): Promise<CryptoKey> {
  return crypto.subtle.importKey("pkcs8", pemToPkcs8(pem), { name: "ECDSA", namedCurve: "P-256" }, false, ["sign"]);
}

/**
 * ES256 JWT for the App Store Server API. WebCrypto's ECDSA output is already the
 * raw r||s form JWS wants, so no DER conversion is needed.
 */
export async function appStoreJwt(creds: AppStoreCredentials, nowSec = Math.floor(Date.now() / 1000)): Promise<string> {
  const header = { alg: "ES256", kid: creds.keyId, typ: "JWT" };
  const payload = {
    iss: creds.issuerId,
    iat: nowSec,
    exp: nowSec + JWT_TTL_SEC,
    aud: "appstoreconnect-v1",
    bid: creds.bundleId,
  };
  const signingInput = `${base64UrlEncode(JSON.stringify(header))}.${base64UrlEncode(JSON.stringify(payload))}`;
  const key = await importAppStoreKey(creds.privateKeyPem);
  const sig = await crypto.subtle.sign({ name: "ECDSA", hash: "SHA-256" }, key, utf8(signingInput));
  return `${signingInput}.${base64UrlEncode(new Uint8Array(sig))}`;
}

/** The payload of a compact JWS. Signature is not checked: callers only use JWS received over TLS from Apple. */
export function decodeJwsPayload<T>(jws: string): T {
  const parts = jws.split(".");
  if (parts.length !== 3) throw new Error("Malformed JWS");
  return JSON.parse(new TextDecoder().decode(base64UrlDecode(parts[1]))) as T;
}

/**
 * Looks a transaction up in production, then in the sandbox on 404 (TestFlight
 * and App Review buy in the sandbox even against a production server). Null when
 * neither environment knows it.
 */
export async function fetchAppStoreTransaction(
  creds: AppStoreCredentials,
  transactionId: string,
): Promise<AppStoreTransaction | null> {
  const jwt = await appStoreJwt(creds);
  for (const host of [APP_STORE_HOSTS.production, APP_STORE_HOSTS.sandbox]) {
    const res = await fetch(`${host}/inApps/v1/transactions/${encodeURIComponent(transactionId)}`, {
      headers: { authorization: `Bearer ${jwt}` },
    });
    if (res.status === 404) continue;
    if (!res.ok) {
      const detail = (await res.json().catch(() => null)) as { errorMessage?: string } | null;
      throw new AppStoreApiError(detail?.errorMessage ?? `App Store request failed (${res.status})`, res.status);
    }
    const data = (await res.json()) as { signedTransactionInfo?: string };
    if (!data.signedTransactionInfo) throw new AppStoreApiError("App Store response had no transaction", 502);
    return decodeJwsPayload<AppStoreTransaction>(data.signedTransactionInfo);
  }
  return null;
}

interface StatusResponse {
  data?: {
    lastTransactions?: { originalTransactionId?: string; status?: number; signedTransactionInfo?: string; signedRenewalInfo?: string }[];
  }[];
}

/**
 * The current state of an auto-renewable subscription (the Annual Pass) by its
 * originalTransactionId, from the environment the purchase was made in: its
 * status, latest transaction (expiry, refund) and renewal info (auto-renew,
 * grace period). Null when Apple doesn't know it there. Like the transaction
 * lookup, it comes straight from Apple over TLS, so the JWS inside isn't
 * re-verified.
 * Docs: https://developer.apple.com/documentation/appstoreserverapi/get-all-subscription-statuses
 */
export async function fetchSubscriptionStatus(
  creds: AppStoreCredentials,
  originalTransactionId: string,
  environment: string | undefined,
): Promise<AppStoreSubscriptionStatus | null> {
  const host = environment === "Sandbox" ? APP_STORE_HOSTS.sandbox : APP_STORE_HOSTS.production;
  const res = await fetch(`${host}/inApps/v1/subscriptions/${encodeURIComponent(originalTransactionId)}`, {
    headers: { authorization: `Bearer ${await appStoreJwt(creds)}` },
  });
  if (res.status === 404) return null;
  if (!res.ok) {
    const detail = (await res.json().catch(() => null)) as { errorMessage?: string } | null;
    throw new AppStoreApiError(detail?.errorMessage ?? `App Store request failed (${res.status})`, res.status);
  }
  const body = (await res.json()) as StatusResponse;
  for (const group of body.data ?? []) {
    for (const last of group.lastTransactions ?? []) {
      if (String(last.originalTransactionId) !== originalTransactionId || !last.signedTransactionInfo) continue;
      return {
        status: Number(last.status),
        transaction: decodeJwsPayload<AppStoreTransaction>(last.signedTransactionInfo),
        renewal: last.signedRenewalInfo ? decodeJwsPayload<AppStoreRenewalInfo>(last.signedRenewalInfo) : null,
      };
    }
  }
  return null;
}

export interface ExpectedPurchase {
  transactionId: string;
  bundleId: string;
  productId: string;
  gameId: string;
}

/** Why a verified transaction can't pay for this board, or null if it can. Messages are shown to the host. */
export function transactionProblem(tx: AppStoreTransaction, expected: ExpectedPurchase): string | null {
  if (String(tx.transactionId) !== expected.transactionId) return "Apple returned a different purchase";
  if (tx.bundleId !== expected.bundleId) return "That purchase belongs to a different app";
  if (tx.productId !== expected.productId) return "That purchase isn't a JaxSquares board";
  if (tx.revocationDate) return "That purchase was refunded";
  if (tx.appAccountToken) {
    const boundTo = gameIdFromAccountToken(tx.appAccountToken);
    if (boundTo !== null && boundTo !== expected.gameId) return "That purchase was for a different board";
  }
  return null;
}
