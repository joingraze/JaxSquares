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
  APPLE_BUNDLE_ID?: string;
  APPLE_TEAM_ID?: string;
  IAP_PRODUCT_ID?: string;

  // ---- Push ----
  VAPID_PUBLIC_KEY?: string;
  VAPID_PRIVATE_KEY?: string;
  VAPID_SUBJECT?: string;
  /** Firebase service account JSON for FCM HTTP v1 (native iOS + Android pushes). */
  FCM_SERVICE_ACCOUNT?: string;
}
