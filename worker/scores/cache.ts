// Small read-through cache on the Workers Cache API (per colo). Every board linked
// to the same game, and every visitor to the schedule picker, shares one upstream
// fetch per TTL. We store our parsed, trimmed JSON rather than ESPN's raw payload,
// so a hit is a few KB to read instead of a megabyte to re-parse.
//
// Freshness is tracked with our own header instead of relying on eviction, which
// lets an entry outlive its TTL and be served as a fallback when upstream fails.
//
// No in-isolate de-duplication of concurrent misses on purpose: sharing one
// promise across request contexts (e.g. two Durable Objects in one isolate) can
// hang the waiter if the originating request is cancelled.

const FETCHED_AT = "x-jax-fetched-at";

export interface CachedValue<T> {
  value: T;
  /** When the value was fetched from upstream, epoch ms. */
  fetchedAt: number;
}

export interface CachedOptions<T> {
  /** Cache key; any absolute http(s) URL. Include a version for the stored shape. */
  key: string;
  ttlSeconds: number;
  /** Extra seconds an expired value may be served when a refresh fails. */
  staleSeconds?: number;
  /** Fetches and parses from upstream; throws on any failure. */
  load: () => Promise<T>;
  /** Defaults to caches.default; null disables caching. Injectable for tests. */
  cache?: Cache | null;
  now?: () => number;
}

function defaultCache(): Cache | null {
  try {
    return typeof caches !== "undefined" && caches.default ? caches.default : null;
  } catch {
    return null;
  }
}

/** Returns the cached or freshly loaded value, a stale value if loading fails, or null. */
export async function cached<T>(opts: CachedOptions<T>): Promise<CachedValue<T> | null> {
  const now = opts.now ?? Date.now;
  const cache = opts.cache === undefined ? defaultCache() : opts.cache;
  const ttlMs = opts.ttlSeconds * 1000;
  const keepSeconds = opts.ttlSeconds + (opts.staleSeconds ?? 0);
  let stale: CachedValue<T> | null = null;

  if (cache) {
    try {
      const hit = await cache.match(opts.key);
      if (hit) {
        const fetchedAt = Number(hit.headers.get(FETCHED_AT));
        const value = (await hit.json()) as T;
        const age = now() - fetchedAt;
        if (Number.isFinite(fetchedAt) && age < ttlMs) return { value, fetchedAt };
        if (Number.isFinite(fetchedAt) && age < keepSeconds * 1000) stale = { value, fetchedAt };
      }
    } catch (err) {
      console.warn("scores cache read failed", err);
    }
  }

  let fresh: CachedValue<T>;
  try {
    fresh = { value: await opts.load(), fetchedAt: now() };
  } catch (err) {
    console.warn(`scores upstream failed for ${opts.key}`, err);
    return stale;
  }

  if (cache) {
    try {
      await cache.put(
        opts.key,
        new Response(JSON.stringify(fresh.value), {
          headers: {
            "content-type": "application/json",
            "cache-control": `public, max-age=${keepSeconds}`,
            [FETCHED_AT]: String(fresh.fetchedAt),
          },
        }),
      );
    } catch (err) {
      console.warn("scores cache write failed", err);
    }
  }
  return fresh;
}
