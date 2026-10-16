// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest";
import { cached } from "./cache";
import { MemoryCache } from "./testCache";

const KEY = "https://site.api.espn.com/test?jx=1";

afterEach(() => vi.restoreAllMocks());

function setup(start = 1_000_000) {
  const cache = new MemoryCache();
  let t = start;
  const clock = { now: () => t, advance: (ms: number) => (t += ms) };
  vi.spyOn(console, "warn").mockImplementation(() => {});
  return { cache, clock };
}

describe("cached", () => {
  it("loads on a miss, then serves hits within the TTL without loading", async () => {
    const { cache, clock } = setup();
    const load = vi.fn(async () => ({ n: 1 }));
    const opts = { key: KEY, ttlSeconds: 10, load, cache: cache.asCache(), now: clock.now };

    expect(await cached(opts)).toEqual({ value: { n: 1 }, fetchedAt: 1_000_000 });
    clock.advance(9_000);
    expect(await cached(opts)).toEqual({ value: { n: 1 }, fetchedAt: 1_000_000 });
    expect(load).toHaveBeenCalledTimes(1);

    const stored = cache.entries.get(KEY)!;
    expect(new Headers(stored.headers).get("cache-control")).toBe("public, max-age=10");
  });

  it("reloads once the TTL has passed", async () => {
    const { cache, clock } = setup();
    let n = 0;
    const opts = { key: KEY, ttlSeconds: 10, load: async () => ++n, cache: cache.asCache(), now: clock.now };
    await cached(opts);
    clock.advance(10_000);
    expect((await cached(opts))?.value).toBe(2);
  });

  it("serves a stale value when the refresh fails inside the stale window", async () => {
    const { cache, clock } = setup();
    const base = { key: KEY, ttlSeconds: 10, staleSeconds: 60, cache: cache.asCache(), now: clock.now };
    await cached({ ...base, load: async () => "old" });
    expect(new Headers(cache.entries.get(KEY)!.headers).get("cache-control")).toBe("public, max-age=70");

    clock.advance(30_000);
    const failing = async (): Promise<string> => {
      throw new Error("upstream down");
    };
    expect(await cached({ ...base, load: failing })).toEqual({ value: "old", fetchedAt: 1_000_000 });

    clock.advance(40_000); // 70s old: past ttl + stale
    expect(await cached({ ...base, load: failing })).toBeNull();
  });

  it("returns null when loading fails and nothing is cached", async () => {
    const { cache, clock } = setup();
    const result = await cached({
      key: KEY,
      ttlSeconds: 10,
      cache: cache.asCache(),
      now: clock.now,
      load: async () => {
        throw new Error("timeout");
      },
    });
    expect(result).toBeNull();
  });

  it("still loads when the cache itself fails or is absent", async () => {
    const { cache, clock } = setup();
    cache.failReads = true;
    expect((await cached({ key: KEY, ttlSeconds: 10, cache: cache.asCache(), now: clock.now, load: async () => 1 }))?.value).toBe(1);
    expect((await cached({ key: KEY, ttlSeconds: 10, cache: null, now: clock.now, load: async () => 2 }))?.value).toBe(2);
  });
});
