// Writes the static landing pages into the Vite client build, next to the SPA:
//
//   node --experimental-strip-types scripts/seo/build.ts   (npm run seo:pages)
//
// `npm run build` runs it right after `vite build`, so a copy change ships with
// the next deploy and nothing generated is committed. It writes <slug>.html
// (Workers Static Assets' default html_handling serves /<slug> from it with no
// redirect), home.html (the homepage, served at "/" by the Worker),
// robots.txt, sitemap.xml, llms.txt and llms-full.txt, the data page's CSV,
// the IndexNow key file and the two woff2 fonts, then checks that every local
// link and image on the pages resolves.
//
// Each page's sitemap lastmod is the day its content last changed: the build
// hashes every page into /seo/pages.json, and with SEO_PREVIOUS_MANIFEST (the
// live site's /seo/pages.json, set by the deploy) an unchanged page keeps its
// date. The URLs that changed go to dist/seo-changes.json, outside the
// published files, for scripts/seo/indexnow.ts to ping after the deploy.
//
// The screenshots and printables these pages show are committed under public/
// (scripts/seo/images.ts and printables.ts need Chromium; CI may not have it).

import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { PAGES } from "./content.ts";
import { finalsCsv } from "./finals.ts";
import { homeContent, homeStructuredData, renderHome, HOME_DESCRIPTION, HOME_TITLE } from "./home.ts";
import { renderJaxPoses } from "./jax.ts";
import { renderLlms, renderLlmsFull } from "./llms.ts";
import { renderPage, renderRobots, renderSitemap, sitemapUrls, type RenderContext } from "./render.ts";
import {
  APP_PAGES,
  FINALS_CSV,
  FONTS,
  HOME_FILE,
  INDEXNOW_KEY,
  LANDING_SLUGS,
  MANIFEST_PATH,
  ORIGIN,
  PRINTABLES,
  SPA_SEGMENTS,
  pageUrl,
  type PageManifest,
} from "./site.ts";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const OUT = resolve(ROOT, process.env.SEO_OUT ?? "dist/client");
/** The pages that changed since the live site, for the IndexNow ping. Not published. */
const CHANGES = resolve(OUT, "../seo-changes.json");
const require = createRequire(import.meta.url);

/** The source of each app page in the sitemap: a change to it is a change to the page. */
const APP_PAGE_SOURCES: Record<(typeof APP_PAGES)[number], string> = {
  "/": "src/features/home/Welcome.tsx",
  "/terms": "src/pages/Terms.tsx",
  "/privacy": "src/pages/Privacy.tsx",
  "/support": "src/pages/Support.tsx",
};

function write(rel: string, data: string | Buffer) {
  const file = join(OUT, rel);
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, data);
}

function kb(bytes: number): string {
  return `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

const sha = (text: string) => createHash("sha256").update(text).digest("hex").slice(0, 16);

/** The last commit date (YYYY-MM-DD) touching these paths, when git can say. */
function gitDate(paths: string[]): string | null {
  try {
    const out = execFileSync("git", ["log", "-1", "--format=%cs", "--", ...paths], { cwd: ROOT, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
    return /^\d{4}-\d{2}-\d{2}$/.test(out) ? out : null;
  } catch {
    return null;
  }
}

/** The live site's manifest (a URL or a file), or null: first deploy, offline, or not asked for. */
async function previousManifest(source: string | undefined): Promise<PageManifest | null> {
  if (!source) return null;
  try {
    const text = /^https?:/.test(source)
      ? await fetch(source, { signal: AbortSignal.timeout(10_000) }).then((r) => (r.ok ? r.text() : ""))
      : readFileSync(source, "utf8");
    const parsed = JSON.parse(text) as PageManifest;
    return parsed && typeof parsed.pages === "object" ? parsed : null;
  } catch {
    console.warn(`seo: no previous manifest at ${source}; every page counts as changed`);
    return null;
  }
}

if (!existsSync(join(OUT, "index.html"))) {
  console.error(`seo: ${OUT} has no index.html. Run \`vite build\` first (npm run build does both).`);
  process.exit(1);
}

for (const slug of [...LANDING_SLUGS, HOME_FILE.replace(/\.html$/, "")]) {
  if ((SPA_SEGMENTS as readonly string[]).includes(slug)) throw new Error(`seo: /${slug} would shadow an app route`);
}

const printableSizes: Record<string, string> = {};
for (const p of PRINTABLES) {
  const file = join(ROOT, "public", p.href);
  if (existsSync(file)) printableSizes[p.id] = kb(statSync(file).size);
}

const ctx: RenderContext = { jax: await renderJaxPoses(ROOT), printableSizes, year: new Date().getUTCFullYear() };
const today = process.env.SEO_LASTMOD ?? new Date().toISOString().slice(0, 10);

const pages = PAGES.map((page) => ({ page, html: renderPage(page, PAGES, ctx) }));
for (const { page, html } of pages) write(`${page.slug}.html`, html);
const home = renderHome(readFileSync(join(OUT, "index.html"), "utf8"), PAGES);
write(HOME_FILE, home);
write(FINALS_CSV, finalsCsv());
write("llms.txt", renderLlms(PAGES));
write("llms-full.txt", renderLlmsFull(PAGES, ctx));
write(`${INDEXNOW_KEY}.txt`, INDEXNOW_KEY);
for (const font of FONTS) write(font.href, readFileSync(require.resolve(font.from)));

// What each sitemap URL is made of. The homepage hashes its own content, not the shell (whose
// script names change with every app build); app pages hash their source.
const content = new Map<string, string>();
for (const { page, html } of pages) content.set(pageUrl(page.slug), html.replace(/© \d{4}/, ""));
for (const path of APP_PAGES) {
  const source = readFileSync(join(ROOT, APP_PAGE_SOURCES[path]), "utf8");
  content.set(path === "/" ? `${ORIGIN}/` : `${ORIGIN}${path}`, path === "/" ? HOME_TITLE + HOME_DESCRIPTION + homeContent(PAGES) + JSON.stringify(homeStructuredData()) + source : source);
}

const previous = await previousManifest(process.env.SEO_PREVIOUS_MANIFEST);
const fallbackDate = (url: string) => {
  const appPath = APP_PAGES.find((p) => (p === "/" ? `${ORIGIN}/` : `${ORIGIN}${p}`) === url);
  const paths = appPath ? [APP_PAGE_SOURCES[appPath]] : ["scripts/seo", "public/seo", "public/printables", "shared/weekGames.ts"];
  return gitDate(paths) ?? today;
};
const manifest: PageManifest = { pages: {} };
const changed: string[] = [];
for (const url of sitemapUrls()) {
  const hash = sha(content.get(url) ?? "");
  const before = previous?.pages[url];
  const same = before?.hash === hash;
  manifest.pages[url] = { hash, lastmod: same ? before.lastmod : previous ? today : fallbackDate(url) };
  if (!same) changed.push(url);
}
write(MANIFEST_PATH, `${JSON.stringify(manifest, null, 2)}\n`);
write("robots.txt", renderRobots());
write("sitemap.xml", renderSitemap((url) => manifest.pages[url]?.lastmod ?? today));
writeFileSync(CHANGES, `${JSON.stringify({ previous: previous !== null, changed }, null, 2)}\n`);

// Every local href/src on the pages is a landing page, an app route, or a file in the build.
const appRoutes = new Set<string>([...APP_PAGES, "/new"]);
const landing = new Set(LANDING_SLUGS.map((s) => `/${s}`));
const missing: string[] = [];
for (const { name, html } of [...pages.map((p) => ({ name: `/${p.page.slug}`, html: p.html })), { name: "/ (home.html)", html: home }]) {
  for (const [, path] of html.matchAll(/(?:href|src)="(\/[^"#?]*)/g)) {
    if (landing.has(path) || appRoutes.has(path)) continue;
    if (!existsSync(join(OUT, path))) missing.push(`${name} -> ${path}`);
  }
}
if (missing.length) {
  console.error(`seo: broken local links:\n  ${[...new Set(missing)].join("\n  ")}`);
  process.exit(1);
}

const total = pages.reduce((n, p) => n + Buffer.byteLength(p.html), 0);
console.log(
  `seo: ${pages.length} landing pages (${kb(total)}), the homepage, robots.txt, sitemap.xml, llms.txt and fonts in ${OUT.slice(ROOT.length + 1) || OUT}; ` +
    `${changed.length} of ${sitemapUrls().length} URLs changed${previous ? " since the live site" : ""}`,
);
