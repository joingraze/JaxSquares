// The Club Pass (docs/payments.md "Club Pass"): a yearly plan for bars,
// booster clubs, offices and fundraisers that run boards every week. What it
// adds to the Host Pass: club branding on the holder's boards, up to
// CLUB_MAX_COHOSTS co-hosts (shared/cohosts.ts), a players CSV and a TV link
// that rotates the club's boards. Pure: shared by the Worker and the app.

import { mentionsMoney } from "./formats";
import type { ClubBrand } from "./types";

/** The longest club name, in characters. */
export const CLUB_NAME_MAX = 40;

/** A club name is shown on every one of the club's boards, so it's checked like a board name. */
export const CLUB_NAME_MONEY_ERROR = "Club names can't mention money. Try something like 'The Rusty Anchor'.";

/** The logo, as the app uploads it: resized to fit this square, re-encoded, under CLUB_LOGO_MAX_BYTES. */
export const CLUB_LOGO_MAX_SIDE = 256;
export const CLUB_LOGO_MAX_BYTES = 60 * 1024;
export const CLUB_LOGO_TYPES = ["image/webp", "image/png"] as const;
export type ClubLogoType = (typeof CLUB_LOGO_TYPES)[number];

/** The club TV shows each board this long before the next one. */
export const CLUB_TV_ROTATE_MS = 20_000;
/** At most this many of the club's open and live boards go round on its TV. */
export const CLUB_TV_MAX_BOARDS = 12;
/** How the club TV page sends its link's token (never in a URL the server logs). */
export const CLUB_TV_TOKEN_HEADER = "x-club-tv-token";
/** The fragment key of a club TV link: /club/<id>/tv#k=<token>. */
export const CLUB_TV_PARAM = "k";

const CLUB_ID_RE = /^[0-9a-f]{16}$/;
/** A TV link token: 32 random bytes, base64url (43 characters). */
const TV_TOKEN_RE = /^[A-Za-z0-9_-]{43}$/;

export function isClubId(v: unknown): v is string {
  return typeof v === "string" && CLUB_ID_RE.test(v);
}

export function isClubTvToken(v: unknown): v is string {
  return typeof v === "string" && TV_TOKEN_RE.test(v);
}

/**
 * Why a club name can't be used (after trimming), or null. Empty is fine: it
 * takes the branding off the boards.
 */
export function clubNameProblem(name: string): string | null {
  if (Array.from(name).length > CLUB_NAME_MAX) return `Keep the club name to ${CLUB_NAME_MAX} characters.`;
  if (mentionsMoney(name)) return CLUB_NAME_MONEY_ERROR;
  return null;
}

/** The branding a board shows: a named club only (an unnamed one shows nothing). */
export function shownClub(club: ClubBrand | null | undefined): ClubBrand | null {
  return club && club.name.trim() ? club : null;
}

/** The club's logo, cache-busted by its version (`base`: the API origin, "" for same-origin); null with no logo. */
export function clubLogoUrl(club: Pick<ClubBrand, "id" | "hasLogo" | "logoVersion">, base = ""): string | null {
  if (!club.hasLogo) return null;
  const v = club.logoVersion ? `?v=${encodeURIComponent(club.logoVersion)}` : "";
  return `${base}/api/clubs/${encodeURIComponent(club.id)}/logo${v}`;
}

/** The club TV's path with its token in the fragment (kept out of every request log). */
export function clubTvPath(clubId: string, token: string): string {
  return `/club/${encodeURIComponent(clubId)}/tv#${CLUB_TV_PARAM}=${token}`;
}

/** "Hosted by The Rusty Anchor". */
export function hostedByLine(club: Pick<ClubBrand, "name">): string {
  return `Hosted by ${club.name.trim()}`;
}
