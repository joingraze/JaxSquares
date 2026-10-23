// Co-hosts: up to MAX_COHOSTS players the host invites to run a board with them
// (docs/ARCHITECTURE.md "Co-hosts"). A co-host can do every host action except
// remove the host, remove other co-hosts, invite co-hosts or delete the board.
// They authorize by their (canonical) clientId, never by the host's admin
// token. Pure: shared by the Worker and the app.

import type { Game } from "./types";

/**
 * Most co-hosts a board can have: the default, for every board that isn't a
 * venue's (no venue mode, no Venue add-on on its host's Annual Pass).
 */
export const MAX_COHOSTS = 3;

/**
 * Most co-hosts on a venue's board, for its staff: a venue board (venue mode,
 * whose Venue add-on is paid at the draw), or any board of a host whose Annual
 * Pass has the Venue add-on (docs/payments.md "Pricing").
 */
export const CLUB_MAX_COHOSTS = 10;

/** The board's plan, as far as co-hosts go: a venue's, or anything else. */
export type CohostPlan = "club" | null;

/** Most co-hosts a board can have under its host's plan. The one place the limits live. */
export function cohostLimit(plan: CohostPlan): number {
  return plan === "club" ? CLUB_MAX_COHOSTS : MAX_COHOSTS;
}

/** The board's co-host limit: a venue board's, or `Game.club` (there while its host's pass has the Venue add-on). */
export function cohostLimitOf(game: Pick<Game, "club"> & { format?: Pick<Game["format"], "venue"> }): number {
  return cohostLimit(game.club || game.format?.venue === true ? "club" : null);
}

/** How long a co-host invite link works. Each link works once. */
export const COHOST_INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

/** The query param of a co-host invite link: `/g/<id>?cohost=<token>`. */
export const COHOST_PARAM = "cohost";

/** How this device stands with a board it can run: its host (the admin token) or a co-host. */
export type HostRole = "host" | "cohost";

/** A co-host invite token as its link carries it: 32 random bytes, base64url (43 characters). */
const TOKEN_RE = /^[A-Za-z0-9_-]{43}$/;

export function isCohostToken(v: unknown): v is string {
  return typeof v === "string" && TOKEN_RE.test(v);
}

/** Public player ids of the board's co-hosts (empty for an older state that doesn't carry them). */
export function cohostIdsOf(game: Pick<Game, "cohostIds">): string[] {
  return Array.isArray(game.cohostIds) ? game.cohostIds : [];
}

/** Whether `playerId` (a public id) co-hosts the board. */
export function isCohostOf(game: Pick<Game, "cohostIds">, playerId: string): boolean {
  return !!playerId && cohostIdsOf(game).includes(playerId);
}

/** Whether the host can invite another co-host (the board has fewer than its plan allows: cohostLimitOf). */
export function hasCohostRoom(game: Pick<Game, "cohostIds" | "club"> & { format?: Pick<Game["format"], "venue"> }): boolean {
  return cohostIdsOf(game).length < cohostLimitOf(game);
}

/**
 * This device's role on a board: "host" while it holds the board's admin token
 * (the host, or a host link), "cohost" when its public id is one of the
 * board's co-hosts, else null. The server decides for real; this only picks
 * what the app shows.
 */
export function hostRoleOf(game: Pick<Game, "cohostIds">, me: string, hasAdminToken: boolean): HostRole | null {
  if (hasAdminToken) return "host";
  return isCohostOf(game, me) ? "cohost" : null;
}
