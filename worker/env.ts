// Bindings, vars and secrets available to the Worker. Optional entries are
// unset in local dev; every integration must degrade gracefully without them.
//
// This file only declares names. Never put values here (it is committed):
// - Plain settings (APP_ORIGIN, BOARD_PRICE_CENTS, IAP_PRODUCT_ID, PAYMENTS_MODE,
//   HOST_PASS_PRICE_CENTS, STRIPE_HOST_PASS_PRICE_ID, IAP_HOST_PASS_PRODUCT_ID,
//   the sign-in client ids, EMAIL_FROM) go in wrangler.jsonc "vars".
// - Secrets (Stripe, Apple IAP key, Sign in with Apple key, VAPID private key,
//   FCM service account, the Resend API key, the email token secret) go in
//   Cloudflare with `npx wrangler secret put NAME` (or the dashboard:
//   Workers -> jaxsquares -> Settings -> Variables and Secrets).
// - Local dev values go in .dev.vars (gitignored; see .dev.vars.example).
// - CLOUDFLARE_API_TOKEN is a deploy credential for wrangler, not a Worker
//   setting: it lives in the GitHub repo secret / the Claude cloud environment.

export interface Env {
  DB: D1Database;
  ASSETS: Fetcher;
  /** One Durable Object per game: holds live sockets and polls live scores. */
  GAME_ROOM: DurableObjectNamespace;
  /** One Durable Object per league that every ESPN request goes through (worker/scores/hub.ts). */
  SCORE_HUB?: DurableObjectNamespace;

  /** Public origin, e.g. "https://jaxsquares.com". Used in invite links and pushes. */
  APP_ORIGIN?: string;

  // ---- Payments ----
  /** "live" to charge for real; anything else runs the no-charge test checkout. */
  PAYMENTS_MODE?: string;
  /** Price to create one board, in cents. */
  BOARD_PRICE_CENTS?: string;
  STRIPE_SECRET_KEY?: string;
  STRIPE_PUBLISHABLE_KEY?: string;
  STRIPE_WEBHOOK_SECRET?: string;
  /** App Store Connect in-app purchase API key (for verifying IAP transactions). */
  APPLE_IAP_KEY_ID?: string;
  APPLE_IAP_ISSUER_ID?: string;
  APPLE_IAP_PRIVATE_KEY?: string;
  /** iOS bundle id (default "com.jaxsquares.app"); also used in apple-app-site-association. */
  APPLE_BUNDLE_ID?: string;
  /** Apple developer team id, for apple-app-site-association (universal links). */
  APPLE_TEAM_ID?: string;
  IAP_PRODUCT_ID?: string;

  // ---- The Host Pass (a yearly subscription covering the host fee of every board its holder hosts) ----
  /** The web price per year in cents (default 999). Must match the Stripe Price. */
  HOST_PASS_PRICE_CENTS?: string;
  /** The Stripe Price id of the yearly Host Pass (price_...). Unset: the web doesn't sell the pass in live mode. */
  STRIPE_HOST_PASS_PRICE_ID?: string;
  /** App Store product id of the auto-renewable subscription (default "com.jaxsquares.app.hostpass.yearly"). */
  IAP_HOST_PASS_PRODUCT_ID?: string;

  // ---- Android app links (/.well-known/assetlinks.json) ----
  /** Android application id (default "com.jaxsquares.app"). */
  ANDROID_PACKAGE?: string;
  /** Comma-separated SHA-256 signing-cert fingerprints ("AA:BB:..."), e.g. upload key + Play app signing key. */
  ANDROID_SHA256_CERT_FINGERPRINTS?: string;

  // ---- Optional sign-in (docs/auth.md) ----
  // Public OAuth client ids go in wrangler.jsonc "vars" (they aren't secrets);
  // a provider whose id is empty is hidden in the app and its route answers 503.
  // Native Sign in with Apple uses APPLE_BUNDLE_ID (above, default
  // "com.jaxsquares.app") as its audience.
  /** Google OAuth "Web application" client id: Sign in with Google on the web. */
  GOOGLE_WEB_CLIENT_ID?: string;
  /** Google OAuth "iOS" client id: Sign in with Google in the iOS app. */
  GOOGLE_IOS_CLIENT_ID?: string;
  /** Apple Services ID: Sign in with Apple JS on the web. */
  APPLE_SERVICES_ID?: string;
  /**
   * Sign in with Apple key (secrets), with APPLE_TEAM_ID: exchanges a sign-in's
   * authorization code for a refresh token and revokes it when the account is
   * deleted. Without them sign-in still works; revocation is skipped (logged).
   */
  APPLE_KEY_ID?: string;
  APPLE_SIGNIN_PRIVATE_KEY?: string;

  // ---- Push ----
  VAPID_PUBLIC_KEY?: string;
  VAPID_PRIVATE_KEY?: string;
  VAPID_SUBJECT?: string;
  /** Firebase service account JSON for FCM HTTP v1 (native iOS + Android pushes). */
  FCM_SERVICE_ACCOUNT?: string;

  // ---- Email notices (docs/email.md) ----
  // All three set = the opt-in shows in the app (AppConfig.emailEnabled);
  // otherwise it's hidden and the email routes answer 503.
  /** Resend API key (secret, re_...): sends through https://api.resend.com. */
  RESEND_API_KEY?: string;
  /** Sender (wrangler.jsonc var): "JaxSquares <notices@jaxsquares.com>", or just the address. Empty = off. */
  EMAIL_FROM?: string;
  /** Secret, 32+ random characters: signs unsubscribe links and keys addresses (HMAC). Rotating it breaks old links. */
  EMAIL_TOKEN_SECRET?: string;
}
