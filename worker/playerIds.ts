// clientId -> public player id (shared/playerId.ts), memoized per isolate.
//
// The clientId is the only credential a player has, so it stays in D1 and in
// request headers; every payload the Worker sends (state, socket messages,
// summaries, activity) names players by this derived id instead.

import { derivePlayerId } from "../shared/playerId";

/** Plenty for every player on every board an isolate serves; cleared wholesale past it. */
const CACHE_MAX = 10_000;
const cache = new Map<string, string>();

export async function playerIdOf(clientId: string): Promise<string> {
  const hit = cache.get(clientId);
  if (hit) return hit;
  const id = await derivePlayerId(clientId);
  if (cache.size >= CACHE_MAX) cache.clear();
  cache.set(clientId, id);
  return id;
}

/** clientId -> player id for every distinct id given. */
export async function playerIdMap(clientIds: Iterable<string>): Promise<Map<string, string>> {
  const unique = [...new Set(clientIds)];
  const ids = await Promise.all(unique.map(playerIdOf));
  return new Map(unique.map((c, i) => [c, ids[i]]));
}
