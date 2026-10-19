// Optional email notices for players who don't get push (docs/email.md):
// double opt-in per board, Resend as the sender, one-click unsubscribe.
// Contract: docs/ARCHITECTURE.md.

export { emailRoutes } from "./routes";
export { emailNotices } from "./notices";
export { emailEnabled } from "./config";
export { deleteClientSubscriptionsStatement, mergeClientStatements, pruneSubscriptions } from "./store";
