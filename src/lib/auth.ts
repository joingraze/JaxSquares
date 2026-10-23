// Optional sign-in (docs/auth.md): Sign in with Apple / Google links this
// device to an account, and the account's boards follow it to every device.
// Playing never needs it.
//
// The provider part (Apple's and Google's SDKs, the native plugin) lives in
// authSdk.ts and only loads when a sign-in button shows. This module holds
// the flows around it:
//   completeSignIn(provider, input)  -> POST /api/auth/:provider, then adopt who the server says we are
//   addSignIn(provider, input)       -> POST /api/auth/:provider/link: Apple or Google joins this account
//   refreshMe()                      -> GET /api/me on start: refresh the player id and host tokens
//   signOut() / deleteAccount()      -> the server first, then the device starts fresh
//
// The device's clientId never changes on sign-in: the server maps it to the
// account. It does change on sign-out (wipeIdentity), so the old one, which
// acted as the account, is never sent again.

import { useEffect, useState } from "react";
import { sha256 } from "../../shared/playerId";
import type { AuthConfig, AuthProvider, MeResponse, SignInInput } from "../../shared/types";
import { api } from "./api";
import { forgetSignedInBefore, hasProfileName, isSignedIn, saveAdminTokens, setCohostGames, setProfile, setServerIdentity, wipeIdentity } from "./identity";
import { resetMyGames } from "./live";
import { platform, type Platform } from "./native";
import { clearMutedCache, currentPushTarget, syncPush } from "./push";
import { applyMePass, resetHostPass } from "./hostPassStore";

export type { AuthProvider };

/** The person closed the provider's sheet: not an error worth a toast. */
export class SignInCancelled extends Error {
  constructor() {
    super("Sign-in cancelled");
    this.name = "SignInCancelled";
  }
}

export const PROVIDER_LABEL: Record<AuthProvider, string> = { apple: "Apple", google: "Google" };

// ---- Which providers to offer ----

/**
 * The Google iOS client id this iOS build was made for (VITE_GOOGLE_IOS_CLIENT_ID
 * at build time, set together with its reversed id as a URL scheme in
 * Info.plist: docs/auth.md). Google's SDK crashes the app when that scheme is
 * missing, so a build only offers Google when the server's id matches its own;
 * turning Google on in wrangler.jsonc never reaches builds made without it.
 */
const IOS_GOOGLE_CLIENT_ID: string = String(import.meta.env.VITE_GOOGLE_IOS_CLIENT_ID ?? "").trim();

/**
 * The sign-in buttons for a platform, in order. The iOS app offers Apple first
 * (App Store guideline 4.8: Sign in with Apple wherever another sign-in is
 * offered, and it's the one iPhone people expect). Android isn't shipped yet.
 */
export function providersFor(config: AuthConfig | null | undefined, on: Platform, iosGoogleClientId = IOS_GOOGLE_CLIENT_ID): AuthProvider[] {
  if (!config) return [];
  if (on === "ios") {
    const google = !!config.googleIosClientId && config.googleIosClientId === iosGoogleClientId;
    return [config.appleNative && ("apple" as const), google && ("google" as const)].filter((p): p is AuthProvider => !!p);
  }
  if (on === "web") return [config.googleWebClientId && ("google" as const), config.appleServicesId && ("apple" as const)].filter((p): p is AuthProvider => !!p);
  return [];
}

const CONFIG_TTL_MS = 5 * 60_000;
let configCache: { at: number; promise: Promise<AuthConfig | null> } | null = null;

/** The server's sign-in setup (GET /api/config), reused for a few minutes; null when unknown (offline, older server). */
export function loadAuthConfig(): Promise<AuthConfig | null> {
  if (!configCache || Date.now() - configCache.at > CONFIG_TTL_MS) {
    const entry = {
      at: Date.now(),
      promise: api.config().then(
        (c) => c.auth ?? null,
        () => {
          if (configCache === entry) configCache = null;
          return null;
        },
      ),
    };
    configCache = entry;
  }
  return configCache.promise;
}

/** Tests. */
export function resetAuthConfig(): void {
  configCache = null;
}

/** React binding: the server's sign-in setup and this platform's providers (empty until known, or when none is set up). */
export function useAuthSetup(): { config: AuthConfig | null; providers: AuthProvider[]; ready: boolean } {
  const [config, setConfig] = useState<AuthConfig | null | undefined>(undefined);
  useEffect(() => {
    let alive = true;
    void loadAuthConfig().then((c) => alive && setConfig(c));
    return () => {
      alive = false;
    };
  }, []);
  return { config: config ?? null, providers: providersFor(config, platform()), ready: config !== undefined };
}

// ---- Nonces ----

function base64Url(bytes: Uint8Array): string {
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/**
 * A fresh nonce: the provider gets `hashed` (SHA-256, lowercase hex) and puts
 * it in the ID token; the server gets `raw` and checks the hash, so a token
 * seen elsewhere can't be replayed. Synchronous, so a web sign-in can start
 * inside the tap (Safari blocks popups opened after an await).
 */
export function newNonce(): { raw: string; hashed: string } {
  const raw = base64Url(crypto.getRandomValues(new Uint8Array(32)));
  const hashed = Array.from(sha256(new TextEncoder().encode(raw)), (b) => b.toString(16).padStart(2, "0")).join("");
  return { raw, hashed };
}

// ---- Who the server says we are ----

/** Bumped on every sign-in and sign-out, so a GET /api/me that started before one doesn't undo it. */
let epoch = 0;

/**
 * Adopts a MeResponse: the (account's) public id and account, the admin tokens
 * of the boards it hosts (stored like the creator's device stores them, so
 * host tools show), the boards it co-hosts (no token: the server knows them by
 * the account, and each board's state says it), and its last profile on a
 * device that has none. Refreshes Home when anything changed. Returns whether it did.
 */
export function applyMe(me: MeResponse, requestedAt?: number): boolean {
  applyMePass(me.hostPass, requestedAt, me.clubPass);
  let changed = setServerIdentity(me.playerId, me.account);
  if (saveAdminTokens(me.hostTokens ?? {}) > 0) changed = true;
  // An older server leaves it out: keep what's held.
  if (me.cohostGames && setCohostGames(me.cohostGames)) changed = true;
  if (me.profile?.name && !hasProfileName()) setProfile(me.profile);
  if (changed) resetMyGames();
  return changed;
}

/** Signs in with what the provider handed back: the server links this device and merges its boards into the account. */
export async function completeSignIn(provider: AuthProvider, input: SignInInput): Promise<MeResponse> {
  const requestedAt = Date.now();
  const me = await api.signIn(provider, input);
  epoch++;
  applyMe(me, requestedAt);
  return me;
}

/**
 * Adds Apple or Google to the account this device is signed in to, so either
 * one signs in anywhere. When that sign-in already has its own account the
 * server answers 409 with ACCOUNT_EXISTS_CODE (an ApiError); resend with
 * `combine: true` once the person agrees, and that account's boards, devices
 * and sign-ins move into this one.
 */
export async function addSignIn(provider: AuthProvider, input: SignInInput): Promise<MeResponse> {
  const requestedAt = Date.now();
  const me = await api.addSignIn(provider, input);
  epoch++;
  applyMe(me, requestedAt);
  return me;
}

/**
 * GET /api/me (on start): refresh the player id, host tokens and account. A
 * device that thought it was signed in but isn't any more (signed out or
 * deleted from another device) starts fresh, like signing out here. Offline
 * or an error: nothing changes.
 */
export async function refreshMe(): Promise<void> {
  const started = epoch;
  const wasSignedIn = isSignedIn();
  let me: MeResponse;
  const requestedAt = Date.now();
  try {
    me = await api.me();
  } catch {
    return;
  }
  if (started !== epoch) return;
  if (wasSignedIn && !me.account) {
    startFresh();
    return;
  }
  applyMe(me, requestedAt);
}

/** The device forgets who it was: a new clientId, no boards, no account; then push re-registers as the new self. */
function startFresh(): void {
  epoch++;
  wipeIdentity();
  resetHostPass();
  clearMutedCache();
  resetMyGames(true);
  void syncPush(true);
}

/**
 * Signs this device out. The server drops its link (and this device's push
 * registration from the account) first; then the device starts fresh. Throws
 * (and changes nothing here) if the server can't be reached.
 */
export async function signOut(): Promise<void> {
  const target = await currentPushTarget();
  await api.signOut(target ?? {});
  startFresh();
}

/** Deletes the account (the server revokes the Apple token too); then this device starts fresh, with nothing to sign back in to. */
export async function deleteAccount(): Promise<void> {
  await api.deleteAccount();
  startFresh();
  forgetSignedInBefore();
}
