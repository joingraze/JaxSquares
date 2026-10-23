// Payments module: the host paying JaxSquares for a board (its host fee, and
// the Venue add-on on a venue board), due when they draw its numbers, or a
// yearly Annual Pass that covers that on every board they host (with the Venue
// add-on, web only, venue boards and the venue features of worker/clubs too).
// Prices: shared/pricing.ts. See docs/payments.md for setup and
// docs/ARCHITECTURE.md for the contract.
export { paymentsRoutes } from "./routes";
export { boardPrices, getPaymentConfig } from "./config";
export { activeClubPass, activePass, clubPassOf, hostPassOf, passCover } from "./pass";
export { endWebPassRenewals } from "./passStripe";
export { mergeClientStatements } from "./store";
