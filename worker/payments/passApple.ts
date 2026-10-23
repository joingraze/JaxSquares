// The Annual Pass in the iOS app: the App Store auto-renewable subscription
// com.jaxsquares.app.hostpass.yearly (group "Annual Pass"). A purchase or a
// restore is verified with the App Store Server API (the transaction, then
// the subscription's status by originalTransactionId) and attached to the
// requesting identity; App Store Server Notifications V2 keep it current
// (renewals, expirations, refunds). See docs/payments.md "Annual Pass".

import type { HostPassTransaction } from "../../shared/types";
import type { Env } from "../env";
import {
  fetchAppStoreTransaction,
  fetchSubscriptionStatus,
  type AppStoreCredentials,
  type AppStoreRenewalInfo,
  type AppStoreTransaction,
} from "./apple";
import { verifyAppleJws } from "./appleJws";
import { iapHostPassProductId } from "./config";
import { applePassStatus } from "./pass";
import * as store from "./store";

export function appStoreCredentials(env: Env): AppStoreCredentials | null {
  const keyId = env.APPLE_IAP_KEY_ID?.trim();
  const issuerId = env.APPLE_IAP_ISSUER_ID?.trim();
  const privateKeyPem = env.APPLE_IAP_PRIVATE_KEY?.trim();
  const bundleId = env.APPLE_BUNDLE_ID?.trim();
  return keyId && issuerId && privateKeyPem && bundleId ? { keyId, issuerId, privateKeyPem, bundleId } : null;
}

/** What an App Store subscription says about the pass, as of `eventAt`. */
export function applePassState(
  status: number | undefined,
  tx: AppStoreTransaction,
  renewal: AppStoreRenewalInfo | null,
  eventAt: number,
  fallbackAutoRenew = false,
): store.PassState {
  let ours = applePassStatus(status) ?? (tx.expiresDate && tx.expiresDate > eventAt ? "active" : "ended");
  if (tx.revocationDate) ours = "revoked";
  const graceEnd = status === 4 ? renewal?.gracePeriodExpiresDate : undefined;
  return {
    status: ours,
    currentPeriodEnd: graceEnd ?? tx.expiresDate ?? null,
    autoRenew: renewal ? renewal.autoRenewStatus === 1 : fallbackAutoRenew,
    livemode: tx.environment === "Production",
    eventAt,
  };
}

export type AttachOutcome =
  | { ok: true; row: store.PassRow }
  | { ok: false; status: 400 | 409; error: string };

const NOT_YOURS =
  "This App Store subscription is linked to another JaxSquares player. Update the app, then tap Restore purchases on this device to move it here.";

/**
 * Verifies an App Store purchase (or restored transaction) of the pass and
 * attaches it to `clientId`. A subscription another identity already holds
 * moves here only with StoreKit's signed `jws` for it, verified up to Apple's
 * root (appleJws.ts): a transaction id alone isn't proof it's yours. Throws
 * AppStoreApiError when Apple can't be reached.
 */
export async function attachAppleTransaction(
  env: Env,
  creds: AppStoreCredentials,
  clientId: string,
  input: HostPassTransaction,
  now = Date.now(),
): Promise<AttachOutcome> {
  const tx = await fetchAppStoreTransaction(creds, input.transactionId);
  if (!tx) return { ok: false, status: 400, error: "Apple has no record of that purchase" };
  if (tx.bundleId !== creds.bundleId) return { ok: false, status: 400, error: "That purchase belongs to a different app" };
  if (tx.productId !== iapHostPassProductId(env)) return { ok: false, status: 400, error: "That purchase isn't the Annual Pass" };
  const original = String(tx.originalTransactionId ?? tx.transactionId);
  const current = await fetchSubscriptionStatus(creds, original, tx.environment);
  const state = current ? applePassState(current.status, current.transaction, current.renewal, now) : applePassState(undefined, tx, null, now);

  const held = await store.passByExternalId(env.DB, original);
  let moveTo = false;
  if (held && held.clientId !== clientId) {
    if (!input.jws || !(await provesOwnership(input.jws, creds.bundleId, original))) return { ok: false, status: 409, error: NOT_YOURS };
    moveTo = true;
  }
  const row = await store.upsertPass(env.DB, { clientId, provider: "iap", externalId: original, ...state }, { moveTo, now });
  return { ok: true, row };
}

/** StoreKit's signed transaction (from the device) is Apple's, for this app and this subscription. */
async function provesOwnership(jws: string, bundleId: string, originalTransactionId: string): Promise<boolean> {
  try {
    const signed = await verifyAppleJws<AppStoreTransaction>(jws);
    return signed.bundleId === bundleId && String(signed.originalTransactionId ?? signed.transactionId) === originalTransactionId;
  } catch (err) {
    console.log(`restore proof refused: ${err instanceof Error ? err.message : String(err)}`);
    return false;
  }
}

/** The fields of an App Store Server Notification V2 (ResponseBodyV2DecodedPayload) we read. */
export interface AppleNotification {
  notificationType?: string;
  subtype?: string;
  notificationUUID?: string;
  signedDate?: number;
  data?: {
    bundleId?: string;
    environment?: string;
    signedTransactionInfo?: string;
    signedRenewalInfo?: string;
    /** Auto-renewable subscriptions: 1 active, 2 expired, 3 billing retry, 4 grace period, 5 revoked. */
    status?: number;
  };
}

/** The status a notification implies when it doesn't carry one (older payloads). */
function statusFromType(n: AppleNotification, tx: AppStoreTransaction, now: number): number {
  switch (n.notificationType) {
    case "EXPIRED":
    case "GRACE_PERIOD_EXPIRED":
      return 2;
    case "REFUND":
    case "REVOKE":
      return 5;
    case "DID_FAIL_TO_RENEW":
      return n.subtype === "GRACE_PERIOD" ? 4 : 3;
    default:
      return tx.expiresDate && tx.expiresDate > now ? 1 : 2;
  }
}

export type NotificationOutcome = "updated" | "ignored";

/**
 * An App Store Server Notification V2: verifies the signed payload and the
 * transaction and renewal info inside it (appleJws.ts), and stores the pass's
 * new state (renewed, auto-renew turned off or on, billing retry or grace
 * period, expired, refunded or revoked). A notification signed before the
 * stored state is late and changes nothing. Ignored: other apps, the board
 * consumable, TEST notifications and subscriptions not attached to anyone yet
 * (the app's own confirm attaches those). Throws AppleJwsError when a
 * signature doesn't check out.
 */
export async function handleAppleNotification(env: Env, signedPayload: string, now = Date.now()): Promise<NotificationOutcome> {
  const n = await verifyAppleJws<AppleNotification>(signedPayload);
  const data = n.data;
  const bundleId = env.APPLE_BUNDLE_ID?.trim() || "com.jaxsquares.app";
  if (!data?.signedTransactionInfo || data.bundleId !== bundleId) return "ignored";
  const tx = await verifyAppleJws<AppStoreTransaction>(data.signedTransactionInfo);
  if (tx.productId !== iapHostPassProductId(env) || tx.bundleId !== bundleId) return "ignored";
  const renewal = data.signedRenewalInfo ? await verifyAppleJws<AppStoreRenewalInfo>(data.signedRenewalInfo) : null;
  const eventAt = typeof n.signedDate === "number" ? n.signedDate : now;
  const original = String(tx.originalTransactionId ?? tx.transactionId);
  const known = await store.passByExternalId(env.DB, original);
  if (!known) return "ignored";
  const state = applePassState(data.status ?? statusFromType(n, tx, eventAt), tx, renewal, eventAt, known.autoRenew);
  await store.updatePass(env.DB, original, state, now);
  return "updated";
}
