// Optional sign-in (Sign in with Apple / Google): an account keeps a person's
// boards on every device. Model and setup: docs/auth.md; contract:
// docs/ARCHITECTURE.md. Owns worker/auth/store.ts (its D1 tables).
export { authRoutes } from "./routes";
export { authConfig } from "./config";
// freshLink: a device's account link, read fresh (the Host Pass's web checkout
// needs an account; worker/payments imports it from ./canonical directly, which
// keeps the two modules' routers free of an import cycle).
export { canonicalClientId, freshLink, SIGNED_IN_HEADER, signedInHint } from "./canonical";
