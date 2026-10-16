// Bindings, vars and secrets available to the Worker. Optional entries are
// unset in local dev; every integration must degrade gracefully without them.

export interface Env {
  DB: D1Database;
  ASSETS: Fetcher;
  /** One Durable Object per game: holds live sockets and polls live scores. */
  GAME_ROOM: DurableObjectNamespace;

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

  // ---- Android app links (/.well-known/assetlinks.json) ----
  /** Android application id (default "com.jaxsquares.app"). */
  ANDROID_PACKAGE?: string;
  /** Comma-separated SHA-256 signing-cert fingerprints ("AA:BB:..."), e.g. upload key + Play app signing key. */
  ANDROID_SHA256_CERT_FINGERPRINTS?: string;

  // ---- Push ----
  VAPID_PUBLIC_KEY?: string;
  VAPID_PRIVATE_KEY?: string;
  VAPID_SUBJECT?: string;
  /** Firebase service account JSON for FCM HTTP v1 (native iOS + Android pushes). */
  FCM_SERVICE_ACCOUNT?: string;
}
