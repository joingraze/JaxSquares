// What TV mode shows (docs/ARCHITECTURE.md "TV mode and the printable
// board"): the host picks, per board, from Host tools or the TV's own
// "Display" button, and every TV on the board follows at once. Pure (no IO),
// shared by the worker (validating PATCH /api/games/:id `tv`) and the app.
//
// A part the host never touched shows as its default: everything on, except
// "Free to play", which a venue's or club's board starts with.

import type { Game, TvDisplay, TvPart } from "./types";

/** Every part, in the order the settings list them. */
export const TV_PARTS: readonly TvPart[] = ["prizes", "amounts", "houseRules", "freeToPlay", "now", "winners", "upcoming", "celebrations"];

/** How the settings name each part. */
export const TV_PART_INFO: Record<TvPart, { label: string; description: string }> = {
  prizes: { label: "Prizes", description: "What each quarter wins, and each winner's prize" },
  amounts: { label: "Amounts", description: "Prize amounts and the square price" },
  houseRules: { label: "House rules", description: "Your house rules, and how winners collect" },
  freeToPlay: { label: "Free to play", description: "\"Free to play · No purchase necessary\" on a board with no square price" },
  now: { label: "Who's winning right now", description: "The square the score points at" },
  winners: { label: "Winners so far", description: "Each winner, their score and prize" },
  upcoming: { label: "Still to play", description: "What's left, and what each wins" },
  celebrations: { label: "Winner celebrations", description: "A big card, confetti and Jax when someone wins" },
};

type TvGame = Pick<Game, "format"> & Partial<Pick<Game, "club" | "tv">>;

/** A part's default: on, except "Free to play", which only a venue's or a named club's board starts with. */
export function tvDefault(part: TvPart, game: TvGame): boolean {
  if (part === "freeToPlay") return !!game.format.venue || !!game.club?.name.trim();
  return true;
}

/** Whether TV mode shows `part`: the host's choice (`display`, else the board's own), else the default. */
export function tvShows(game: TvGame, part: TvPart, display: TvDisplay | null | undefined = game.tv): boolean {
  return display?.[part] ?? tvDefault(part, game);
}

/** Every part's on/off for a board (the TV reads this once per render). */
export type TvShow = Record<TvPart, boolean>;

export function tvShowAll(game: TvGame, display: TvDisplay | null | undefined = game.tv): TvShow {
  return Object.fromEntries(TV_PARTS.map((p) => [p, tvShows(game, p, display)])) as TvShow;
}

const isPart = (k: string): k is TvPart => (TV_PARTS as readonly string[]).includes(k);

/** Strict check of PATCH /api/games/:id `tv`: an error message, or null. */
export function tvDisplayError(input: unknown): string | null {
  if (!input || typeof input !== "object" || Array.isArray(input)) return "tv must be an object of on/off choices";
  for (const [k, v] of Object.entries(input)) {
    if (!isPart(k)) return `Unknown TV part: ${k.slice(0, 20)}`;
    if (typeof v !== "boolean") return `${k} must be true or false`;
  }
  return null;
}

/** The choices worth keeping: known parts, booleans only (after tvDisplayError, nothing is dropped). */
export function cleanTvDisplay(input: unknown): TvDisplay {
  if (!input || typeof input !== "object") return {};
  const out: TvDisplay = {};
  for (const [k, v] of Object.entries(input)) if (isPart(k) && typeof v === "boolean") out[k] = v;
  return out;
}
