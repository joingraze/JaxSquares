// In-memory stand-in for the Workers Cache API, for tests only.

export class MemoryCache {
  readonly entries = new Map<string, { body: string; headers: [string, string][] }>();
  failReads = false;

  async match(key: RequestInfo | URL): Promise<Response | undefined> {
    if (this.failReads) throw new Error("cache read failed");
    const entry = this.entries.get(String(key));
    return entry ? new Response(entry.body, { headers: entry.headers }) : undefined;
  }

  async put(key: RequestInfo | URL, res: Response): Promise<void> {
    this.entries.set(String(key), { body: await res.text(), headers: [...res.headers] });
  }

  asCache(): Cache {
    return this as unknown as Cache;
  }
}
