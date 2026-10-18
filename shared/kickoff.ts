// A board's kickoff time. A linked board's comes from its event (ESPN); a
// custom board's is whatever the host set (optional: null = no set time).
// Pure, shared by the worker (validation) and the client (the picker, the
// board). Times are epoch ms; the client shows them in the device's zone.

import type { Game } from "./types";

const DAY_MS = 24 * 60 * 60 * 1000;

/** How far back a custom kickoff may be: a game that started today can still get a board. */
export const KICKOFF_PAST_MS = DAY_MS;
/** How far ahead a custom kickoff may be. */
export const KICKOFF_FUTURE_MS = 366 * DAY_MS;

export const KICKOFF_ERRORS = {
  invalid: "Kickoff must be a date and time, or no set time.",
  past: "That kickoff has passed. Pick a time that's still to come.",
  future: "Pick a kickoff within the next year.",
  linked: "A linked game's kickoff comes from its schedule.",
} as const;

/**
 * What's wrong with a custom kickoff, or null when it's fine: null (no set
 * time), or a time from about a day ago to a year ahead.
 */
export function kickoffProblem(v: unknown, now: number): string | null {
  if (v === null) return null;
  if (typeof v !== "number" || !Number.isFinite(v)) return KICKOFF_ERRORS.invalid;
  if (v < now - KICKOFF_PAST_MS) return KICKOFF_ERRORS.past;
  if (v > now + KICKOFF_FUTURE_MS) return KICKOFF_ERRORS.future;
  return null;
}

/** When the board's game kicks off: the linked event's time, else the host's (null = no set time). */
export function gameKickoff(game: Pick<Game, "linkedEvent" | "startsAt">): number | null {
  return game.linkedEvent?.startsAt ?? game.startsAt ?? null;
}
