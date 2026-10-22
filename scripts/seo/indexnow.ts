// After a deploy: tells IndexNow (Bing, and through it ChatGPT search, plus
// Yandex, Seznam and Naver) which pages changed, so they're recrawled within
// hours instead of whenever the crawler comes round. Google doesn't take
// IndexNow; it reads the sitemap's lastmod (docs/seo.md).
//
//   node --experimental-strip-types scripts/seo/indexnow.ts   (deploy.yml, after the deploy)
//
// Reads dist/seo-changes.json (written by build.ts) and first checks that the
// live site serves the key file, since IndexNow rejects a ping it can't verify.
// Never fails: a missed ping only means a slower recrawl.

import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { INDEXNOW_KEY, ORIGIN } from "./site.ts";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const CHANGES = resolve(ROOT, process.env.SEO_CHANGES ?? "dist/seo-changes.json");
const ENDPOINT = "https://api.indexnow.org/indexnow";

/** The ping's body, per the IndexNow protocol. */
export function indexNowBody(urls: string[]): { host: string; key: string; keyLocation: string; urlList: string[] } {
  return { host: new URL(ORIGIN).host, key: INDEXNOW_KEY, keyLocation: `${ORIGIN}/${INDEXNOW_KEY}.txt`, urlList: urls };
}

async function main(): Promise<void> {
  if (!existsSync(CHANGES)) {
    console.log("indexnow: no dist/seo-changes.json (run the build first); nothing to ping");
    return;
  }
  const { changed } = JSON.parse(readFileSync(CHANGES, "utf8")) as { changed: string[] };
  const urls = changed.filter((u) => u.startsWith(`${ORIGIN}/`) || u === ORIGIN);
  if (urls.length === 0) {
    console.log("indexnow: no page changed; nothing to ping");
    return;
  }
  const key = await fetch(`${ORIGIN}/${INDEXNOW_KEY}.txt`, { signal: AbortSignal.timeout(10_000) })
    .then((r) => (r.ok ? r.text() : ""))
    .catch(() => "");
  if (key.trim() !== INDEXNOW_KEY) {
    console.log(`indexnow: ${ORIGIN}/${INDEXNOW_KEY}.txt isn't live yet (custom domain?); skipping the ping`);
    return;
  }
  const res = await fetch(ENDPOINT, {
    method: "POST",
    headers: { "content-type": "application/json; charset=utf-8" },
    body: JSON.stringify(indexNowBody(urls)),
    signal: AbortSignal.timeout(15_000),
  });
  // 200: accepted; 202: accepted, key check pending.
  console.log(`indexnow: ${res.status} for ${urls.length} URL${urls.length === 1 ? "" : "s"}:\n  ${urls.join("\n  ")}`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await main().catch((err: unknown) => console.warn("indexnow: ping failed", err));
}
