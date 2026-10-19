// "Can this device run this board, and as whom?" in one place, so every screen
// agrees: the host's tools show for the host (this device holds the board's
// admin token: the creator, a signed-in host, a host link) and for its
// co-hosts (this device's public id is in Game.cohostIds). A co-host sends no
// admin token; the server authorizes them by their clientId. Host-only actions
// (inviting or removing co-hosts, deleting the board) check for "host".

import { hostRoleOf, type HostRole } from "../../shared/cohosts";
import type { Game } from "../../shared/types";
import { getAdminToken, getPlayerId, useAdminToken, usePlayerId } from "./identity";

export type { HostRole };

/** This device's role on the board right now (non-reactive; for handlers). */
export function hostRoleNow(game: Pick<Game, "id" | "cohostIds">): HostRole | null {
  return hostRoleOf(game, getPlayerId(), getAdminToken(game.id) !== null);
}

/**
 * React binding: "host", "cohost" or null for the board in `state`. Re-renders
 * when the admin token or this device's player id changes (a refused host
 * link, a sign-in), and with every new state (being made or removed as a co-host).
 */
export function useHostRole(state: { game: Pick<Game, "id" | "cohostIds"> } | null | undefined): HostRole | null {
  const token = useAdminToken(state?.game.id);
  const me = usePlayerId();
  return state ? hostRoleOf(state.game, me, token !== null) : null;
}
