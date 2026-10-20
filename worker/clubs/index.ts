// Clubs module: what the Club Pass turns on for its holder's club (docs/payments.md
// "Club Pass"): the club's name and logo on the holder's boards, the club TV
// that rotates their open and live boards, and the players CSV. The pass itself
// (selling it, keeping it current, what "active" means) is the payments
// module's; this module owns the clubs table (worker/clubs/store.ts).
export { clubRoutes } from "./routes";
export { clubBrandOf, forgetClubBrand } from "./brand";
export { csvFilename, playersCsv } from "./csv";
export { deleteOwnerStatement, mergeClientStatements } from "./store";
