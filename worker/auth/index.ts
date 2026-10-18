// Optional sign-in (Sign in with Apple / Google): an account keeps a person's
// boards on every device. Model and setup: docs/auth.md; contract:
// docs/ARCHITECTURE.md. Owns worker/auth/store.ts (its D1 tables).
export { authRoutes } from "./routes";
export { authConfig } from "./config";
export { canonicalClientId, SIGNED_IN_HEADER, signedInHint } from "./canonical";
