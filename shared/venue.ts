// Venue boards (docs/ARCHITECTURE.md "Venue boards"): a bar, restaurant or
// brewery runs a free board for the room and puts up the prizes itself. Pure
// (no IO), shared by the worker and the app:
//   - house rules: a few short lines the host writes ("Must be present to
//     win"), on the board's rules, its TV and the printable;
//   - claim codes: a winner's phone shows a short code the staff check (the
//     host's tools list them; never the TV, so a photo of it claims nothing);
//   - the venue lines a club board with no square price shows: free to play,
//     no purchase necessary, and whose prizes they are.

import type { ClubBrand, GameFormat } from "./types";
import { mentionsMoney } from "./formats";

/** Most house rules a board shows. */
export const HOUSE_RULES_MAX = 4;
/** Longest house rule, in characters. */
export const HOUSE_RULE_MAX_LENGTH = 80;

/** Ideas the editor offers with a tap. None of them asks anyone to buy anything. */
export const HOUSE_RULE_IDEAS: readonly string[] = [
  "Must be present to win",
  "Claim your prize before the next quarter ends",
  "One square per person",
  "21+ only",
  "Staff decisions are final",
] as const;

/** A house rule that mentions money, payment apps or betting. */
export const HOUSE_RULE_MONEY_ERROR = "House rules can't mention money or payment apps. Keep them about how to play and claim.";
/** A house rule that asks players to buy something: boards are free to play. */
export const HOUSE_RULE_PURCHASE_ERROR = "House rules can't ask anyone to buy anything: JaxSquares boards are free to play.";

const PURCHASE = /\b(buy|buying|purchase|purchases|purchased|purchasing|minimum spend|min spend|spend at least|order (?:a|an|one|two|food|drinks?))\b/i;

/** Why a house rule isn't allowed, or null. The API answers 400 with it; the editor checks inline. */
export function houseRuleProblem(text: string): string | null {
  const t = text.trim();
  if (!t) return null;
  if (t.length > HOUSE_RULE_MAX_LENGTH) return `Keep each house rule under ${HOUSE_RULE_MAX_LENGTH} characters.`;
  if (PURCHASE.test(t)) return HOUSE_RULE_PURCHASE_ERROR;
  if (mentionsMoney(t)) return HOUSE_RULE_MONEY_ERROR;
  return null;
}

/** Single-line text: control and bidi characters out, spaces collapsed. */
function oneLine(v: string): string {
  return v
    .replace(/\s+/g, " ")
    .replace(/[\p{Cc}‪-‮⁦-⁩]/gu, "")
    .trim();
}

/** The house rules worth keeping from any input: strings, one line each, non-empty, within the limits (problems are formatError's to report). */
export function cleanHouseRules(input: unknown): string[] {
  if (!Array.isArray(input)) return [];
  return input
    .filter((v): v is string => typeof v === "string")
    .map(oneLine)
    .filter((v) => v.length > 0)
    .slice(0, HOUSE_RULES_MAX)
    .map((v) => Array.from(v).slice(0, HOUSE_RULE_MAX_LENGTH).join(""));
}

/** Strict check of `houseRules` and `claimCodes` in API input: an error message, or null. */
export function venueFormatError(f: Record<string, unknown>): string | null {
  if (f.claimCodes !== undefined && typeof f.claimCodes !== "boolean") return "claimCodes must be true or false";
  if (f.houseRules === undefined) return null;
  if (!Array.isArray(f.houseRules) || f.houseRules.some((r) => typeof r !== "string")) return "House rules must be a list of short lines";
  if (f.houseRules.filter((r) => (r as string).trim()).length > HOUSE_RULES_MAX) return `Up to ${HOUSE_RULES_MAX} house rules.`;
  for (const r of f.houseRules as string[]) {
    const problem = houseRuleProblem(oneLine(r));
    if (problem) return problem;
  }
  return null;
}

/** The venue fields a format keeps (absent when off or empty, so older formats compare unchanged). */
export function venueFields(f: Partial<Record<keyof GameFormat, unknown>>): Pick<GameFormat, "houseRules" | "claimCodes"> {
  const houseRules = cleanHouseRules(f.houseRules);
  return {
    ...(houseRules.length > 0 ? { houseRules } : {}),
    ...(f.claimCodes === true ? { claimCodes: true } : {}),
  };
}

/**
 * What a board says about itself as a venue's: on a club board (a Club Pass
 * holder's, with its name) with no square price, it's free to play and the
 * prizes are the club's. Nothing for other boards.
 */
export function venueLines(game: { format: GameFormat; club?: ClubBrand | null }): string[] {
  const club = game.club?.name.trim();
  if (!club || game.format.squarePrice) return [];
  return ["Free to play · No purchase necessary", `Prizes from ${club}`];
}

// ---- Claim codes ----

/** How a winner collects on a board with claim codes (its rules sheet and TV say it). */
export const CLAIM_LINE = "Winners show their claim code to staff to collect.";

/** Letters and digits that can't be misread across a bar (no 0/O, 1/I/L, 2/Z, 5/S, 8/B). */
export const CLAIM_CODE_ALPHABET = "ACDEFHJKMNPRTUVWXY34679";
export const CLAIM_CODE_LENGTH = 4;

/** A claim code from hash bytes (the worker derives them: worker/claims.ts). */
export function claimCodeFrom(bytes: Uint8Array): string {
  let out = "";
  for (let i = 0; i < CLAIM_CODE_LENGTH; i++) out += CLAIM_CODE_ALPHABET[bytes[i] % CLAIM_CODE_ALPHABET.length];
  return out;
}
