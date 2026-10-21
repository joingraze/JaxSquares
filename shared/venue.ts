// Venue boards (docs/ARCHITECTURE.md "Venue boards"): a bar, restaurant or
// brewery runs a free board for the room and puts up the prizes itself. Pure
// (no IO), shared by the worker and the app:
//   - venue mode (`format.venue`): free to play (never a square price), and
//     the create flow starts it just for fun, one square per person, with
//     claim codes and five minutes to collect (`VENUE_DEFAULTS`);
//   - house rules: a few short lines the host writes ("Must be present to
//     win"), on the board's rules sheet and its TV;
//   - claim codes: a winner's phone shows a short code the staff check (the
//     host's tools list them; never the TV, so a photo of it claims nothing),
//     with a countdown when the board gives winners a few minutes to collect,
//     and either side marks the prize collected (`collectedFor`);
//   - the venue lines a venue's or club's free board shows: free to play, no
//     purchase necessary, and whose prizes they are.

import type { ClubBrand, GameFormat, GameState, PrizeCollected } from "./types";
import { mentionsMoney } from "./formats";

/** Most house rules a board shows. */
export const HOUSE_RULES_MAX = 4;
/** Longest house rule, in characters. */
export const HOUSE_RULE_MAX_LENGTH = 80;

/** Ideas the editor offers with a tap. None of them asks anyone to buy anything. */
export const HOUSE_RULE_IDEAS: readonly string[] = [
  "Must be present to win",
  "Claim your prize before the next quarter ends",
  "21+ only",
  "Staff decisions are final",
] as const;

/** A house rule that mentions money, payment apps or betting. */
export const HOUSE_RULE_MONEY_ERROR = "House rules can't mention money or payment apps. Keep them about how to play and claim.";
/** A house rule that asks players to buy something: boards are free to play. */
export const HOUSE_RULE_PURCHASE_ERROR = "House rules can't ask anyone to buy anything: JaxSquares boards are free to play.";

/**
 * A house rule about how many squares each person gets: that's the board's
 * squares-per-person setting (`Game.maxPerPlayer`), which the app enforces and
 * the rules sheet and TV show from it, so a rule can't say otherwise.
 */
export const SQUARE_LIMIT_HINT = "That's the squares-per-person setting (Final touches, or Edit board later): the board and TV show it for you.";

const COUNT = String.raw`(?:\d+|a|an|one|two|three|four|five|six|seven|eight|nine|ten|single)`;
const SQUARE_LIMIT = new RegExp(
  [
    String.raw`\b${COUNT}\s+squares?\s+(?:per|each|a|max|maximum|limit|only|apiece)\b`,
    String.raw`\bsquares?\s+(?:per|a)\s+(?:person|player|guest|customer|table|head|entry)\b`,
    String.raw`\b(?:max|maximum|limit|up to|no more than|at most|only)\s+(?:of\s+)?${COUNT}?\s*squares?\b`,
  ].join("|"),
  "i",
);

/** True for a house rule that sets a squares-per-person limit ("One square per person", "Max 2 squares"). */
export function isSquareLimitRule(text: string): boolean {
  return SQUARE_LIMIT.test(text);
}

/** The house rules a board shows: never one about the squares limit (the setting shows that). */
export function shownHouseRules(format: Pick<GameFormat, "houseRules">): string[] {
  return (format.houseRules ?? []).filter((r) => !isSquareLimitRule(r));
}

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

/** The house rules worth keeping from any input: strings, one line each, non-empty, never a squares limit, within the limits (problems are formatError's to report). */
export function cleanHouseRules(input: unknown): string[] {
  if (!Array.isArray(input)) return [];
  return input
    .filter((v): v is string => typeof v === "string")
    .map(oneLine)
    .filter((v) => v.length > 0 && !isSquareLimitRule(v))
    .slice(0, HOUSE_RULES_MAX)
    .map((v) => Array.from(v).slice(0, HOUSE_RULE_MAX_LENGTH).join(""));
}

/** A venue board with a square price: venue boards are free to play. */
export const VENUE_PRICE_ERROR = "A venue board is free to play: no square price.";

/** The "time to collect" choices the editor offers, in minutes. */
export const CLAIM_MINUTES_CHOICES: readonly number[] = [5, 10, 15];
/** Longest time to collect the API takes, in minutes. */
export const CLAIM_MINUTES_MAX = 120;
/** The winner's phone marking a prize collected after their time's up: the host still can. */
export const CLAIM_EXPIRED_ERROR = "Time's up to collect on this phone. Staff can still mark it collected in Host tools.";
/** A winner's own phone can still mark a prize collected this long after the time's up (clocks drift). */
export const CLAIM_GRACE_MS = 60_000;

/** What venue mode starts a board with (the host can change each). The squares-per-player cap isn't in the format: one square each. */
export const VENUE_DEFAULTS = {
  maxPerPlayer: 1,
  claimMinutes: 5,
  houseRules: ["Must be present to win"],
} as const;

/** Strict check of the venue fields in API input: an error message, or null. */
export function venueFormatError(f: Record<string, unknown>): string | null {
  if (f.venue !== undefined && typeof f.venue !== "boolean") return "venue must be true or false";
  if (f.venue === true && typeof f.squarePrice === "number" && f.squarePrice > 0) return VENUE_PRICE_ERROR;
  if (f.claimMinutes !== undefined && f.claimMinutes !== null) {
    const m = f.claimMinutes;
    if (typeof m !== "number" || !Number.isInteger(m) || m < 1 || m > CLAIM_MINUTES_MAX) return `Time to collect must be 1 to ${CLAIM_MINUTES_MAX} minutes`;
  }
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
export function venueFields(f: Partial<Record<keyof GameFormat, unknown>>): Pick<GameFormat, "houseRules" | "claimCodes" | "claimMinutes" | "venue"> {
  const houseRules = cleanHouseRules(f.houseRules);
  const codes = f.claimCodes === true;
  const minutes = typeof f.claimMinutes === "number" && Number.isInteger(f.claimMinutes) && f.claimMinutes >= 1 && f.claimMinutes <= CLAIM_MINUTES_MAX ? f.claimMinutes : null;
  return {
    ...(houseRules.length > 0 ? { houseRules } : {}),
    ...(codes ? { claimCodes: true } : {}),
    ...(codes && minutes ? { claimMinutes: minutes } : {}),
    ...(f.venue === true ? { venue: true } : {}),
  };
}

/**
 * What a board says about itself as a venue's: a venue board, or a club
 * board (a Club Pass holder's, with its name), with no square price is free
 * to play, and a club's prizes are the club's. Nothing for other boards.
 */
export function venueLines(game: { format: GameFormat; club?: ClubBrand | null }): string[] {
  if (!game.club?.name.trim() && !game.format.venue) return [];
  return freeToPlayLines(game);
}

/** "Free to play · No purchase necessary" (and a club's "Prizes from …") for any board with no square price; none with one. The TV shows them when its host turns "Free to play" on. */
export function freeToPlayLines(game: { format: GameFormat; club?: ClubBrand | null }): string[] {
  if (game.format.squarePrice) return [];
  const club = game.club?.name.trim();
  return ["Free to play · No purchase necessary", ...(club ? [`Prizes from ${club}`] : [])];
}

// ---- Collecting a prize ----

/** When a moment's winner was decided: the host's pick, else its score (a correction starts the clock again). */
export function decidedAt(state: Pick<GameState, "scores" | "manualWinners">, periodKey: string): number | null {
  const pick = state.manualWinners.find((m) => m.periodKey === periodKey);
  if (pick) return pick.updatedAt;
  return state.scores.find((s) => s.periodKey === periodKey)?.updatedAt ?? null;
}

/** When a winner's time to collect runs out (epoch ms), or null when the board gives no limit. */
export function claimDeadline(state: Pick<GameState, "game" | "scores" | "manualWinners">, periodKey: string): number | null {
  const minutes = state.game.format.claimCodes ? state.game.format.claimMinutes : undefined;
  const at = minutes ? decidedAt(state, periodKey) : null;
  return minutes && at !== null ? at + minutes * 60_000 : null;
}

/** The award's prize as handed over to `playerId`, or null (not collected, or collected by a winner a corrected score replaced). */
export function collectedFor(state: Pick<GameState, "collected">, periodKey: string, reverse: boolean, playerId: string | null | undefined): PrizeCollected | null {
  if (!playerId) return null;
  return state.collected?.find((c) => c.periodKey === periodKey && c.reverse === reverse && c.playerId === playerId) ?? null;
}

/** "4:05" for a countdown (never below 0:00). */
export function countdownText(ms: number): string {
  const s = Math.max(0, Math.ceil(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

// ---- Claim codes ----

/** How a winner collects on a board with claim codes (its rules sheet and TV say it). */
export const CLAIM_LINE = "Winners show staff the winning pass on their phone to collect.";

/** Letters and digits that can't be misread across a bar (no 0/O, 1/I/L, 2/Z, 5/S, 8/B). */
export const CLAIM_CODE_ALPHABET = "ACDEFHJKMNPRTUVWXY34679";
export const CLAIM_CODE_LENGTH = 4;

/** A claim code from hash bytes (the worker derives them: worker/claims.ts). */
export function claimCodeFrom(bytes: Uint8Array): string {
  let out = "";
  for (let i = 0; i < CLAIM_CODE_LENGTH; i++) out += CLAIM_CODE_ALPHABET[bytes[i] % CLAIM_CODE_ALPHABET.length];
  return out;
}
