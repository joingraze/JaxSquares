// Payments module: the host paying JaxSquares the fee for a board, due when
// they draw its numbers, or a yearly Host Pass (or the web-only Club Pass,
// which adds the club features of worker/clubs) that covers that fee on every
// board they host. See docs/payments.md for setup and docs/ARCHITECTURE.md for
// the contract.
export { paymentsRoutes } from "./routes";
export { getPaymentConfig } from "./config";
export { activeClubPass, activePass, clubPassOf, holdersOfActivePass, hostPassOf } from "./pass";
export { endWebPassRenewals } from "./passStripe";
export { mergeClientStatements } from "./store";
