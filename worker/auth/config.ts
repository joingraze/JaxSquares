// Which sign-in providers are set up, from the public client ids in
// wrangler.jsonc "vars" (docs/auth.md). Not secrets: the app needs them to
// start a sign-in, so GET /api/config hands them out.

import type { AuthConfig, AuthProvider } from "../../shared/types";
import type { Env } from "../env";
import { APPLE_ISSUERS, APPLE_JWKS_URL, GOOGLE_ISSUERS, GOOGLE_JWKS_URL } from "./jwt";

/** The iOS app's bundle id (capacitor.config.ts appId) when APPLE_BUNDLE_ID isn't set; payments and the AASA file use the same default. */
export const DEFAULT_APPLE_BUNDLE_ID = "com.jaxsquares.app";

const clean = (v: string | undefined): string | null => v?.trim() || null;

export function appleBundleId(env: Env): string {
  return clean(env.APPLE_BUNDLE_ID) ?? DEFAULT_APPLE_BUNDLE_ID;
}

/** For GET /api/config: what the app may offer on each platform. */
export function authConfig(env: Env): AuthConfig {
  return {
    googleWebClientId: clean(env.GOOGLE_WEB_CLIENT_ID),
    googleIosClientId: clean(env.GOOGLE_IOS_CLIENT_ID),
    appleServicesId: clean(env.APPLE_SERVICES_ID),
    appleNative: true,
  };
}

export interface ProviderSetup {
  jwksUrl: string;
  issuers: readonly string[];
  /** Accepted token audiences; empty = the provider isn't set up (its route answers 503). */
  audiences: string[];
}

/**
 * How to verify a provider's ID tokens. Google: the web and iOS OAuth client
 * ids. Apple: the bundle id (native Sign in with Apple) and the Services ID
 * (Sign in with Apple JS on the web).
 */
export function providerSetup(env: Env, provider: AuthProvider): ProviderSetup {
  if (provider === "google") {
    const audiences = [clean(env.GOOGLE_WEB_CLIENT_ID), clean(env.GOOGLE_IOS_CLIENT_ID)].filter((v): v is string => !!v);
    return { jwksUrl: GOOGLE_JWKS_URL, issuers: GOOGLE_ISSUERS, audiences };
  }
  const audiences = [appleBundleId(env), clean(env.APPLE_SERVICES_ID)].filter((v): v is string => !!v);
  return { jwksUrl: APPLE_JWKS_URL, issuers: APPLE_ISSUERS, audiences };
}

export const PROVIDER_NAME: Record<AuthProvider, string> = { apple: "Apple", google: "Google" };
