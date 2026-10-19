// The Host Pass state this device knows (src/lib/useHostPass.ts is the React
// side). Kept apart from the checkout code so startup (GET /api/me primes it,
// sign-out clears it) doesn't load the checkout bundle.

import type { HostPass, HostPassOffer, HostPassState } from "../../shared/types";

export interface HostPassSnapshot {
  pass: HostPass | null;
  offer: HostPassOffer | null;
  /** The server has answered at least once for this identity. */
  loaded: boolean;
}

const EMPTY: HostPassSnapshot = { pass: null, offer: null, loaded: false };
let snapshot: HostPassSnapshot = EMPTY;
/** Bumped on every reset, so an answer for the previous identity is dropped. */
let generation = 0;
const listeners = new Set<() => void>();

function set(next: HostPassSnapshot): void {
  snapshot = next;
  for (const l of listeners) l();
}

export function subscribeHostPass(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export const getHostPassSnapshot = (): HostPassSnapshot => snapshot;

/** Which identity the state belongs to: an answer started before a reset is stale. */
export const hostPassGeneration = (): number => generation;

/** When the last pass route's answer arrived: a GET /api/me asked before it is older news. */
let answeredAt = 0;

/** The server's word on the pass (a pass route's answer, or GET /api/payments/pass). */
export function setHostPassState(state: HostPassState): void {
  answeredAt = Date.now();
  set({ pass: state.pass, offer: state.offer, loaded: true });
}

/**
 * GET /api/me's `hostPass` (startup, sign-in): the pass without the offer.
 * Absent (an older server) changes nothing, and neither does an answer to a
 * request made before a pass route answered (`requestedAt`): a purchase that
 * landed meanwhile isn't undone.
 */
export function applyMePass(pass: HostPass | null | undefined, requestedAt?: number): void {
  if (pass === undefined || (requestedAt !== undefined && requestedAt < answeredAt)) return;
  set({ ...snapshot, pass, loaded: true });
}

/** Sign-out: the next identity starts with no pass. */
export function resetHostPass(): void {
  generation++;
  set(EMPTY);
}

/** Whether the identity's pass covers the host fee right now. */
export function hasActivePass(): boolean {
  return snapshot.pass?.active === true;
}
