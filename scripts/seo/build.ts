// Writes the static landing pages into the Vite client build, next to the SPA:
//
//   node --experimental-strip-types scripts/seo/build.ts   (npm run seo:pages)
//
// `npm run build` runs it right after `vite build`, so a copy change ships with
// the next deploy and nothing generated is committed. It writes <slug>.html
// (Workers Static Assets' default html_handling serves /<slug> from it with no
// redirect), robots.txt, sitemap.xml and the two woff2 fonts, then checks that
// every local link and image on the pages resolves.
//
// The screenshots and printables these pages show are committed under public/
// (scripts/seo/images.ts and printables.ts need Chromium; CI may not have it).

import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { PAGES } from "./content.ts";
import { renderJaxPoses } from "./jax.ts";
import { renderPage, renderRobots, renderSitemap, type RenderContext } from "./render.ts";
import { APP_PAGES, FONTS, LANDING_SLUGS, PRINTABLES, SPA_SEGMENTS } from "./site.ts";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const OUT = resolve(ROOT, process.env.SEO_OUT ?? "dist/client");
const require = createRequire(import.meta.url);

function write(rel: string, data: string | Buffer) {
  const file = join(OUT, rel);
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, data);
}

function kb(bytes: number): string {
  return `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

if (!existsSync(join(OUT, "index.html"))) {
  console.error(`seo: ${OUT} has no index.html. Run \`vite build\` first (npm run build does both).`);
  process.exit(1);
}

for (const slug of LANDING_SLUGS) {
  if ((SPA_SEGMENTS as readonly string[]).includes(slug)) throw new Error(`seo: /${slug} would shadow an app route`);
}

const printableSizes: Record<string, string> = {};
for (const p of PRINTABLES) {
  const file = join(ROOT, "public", p.href);
  if (existsSync(file)) printableSizes[p.id] = kb(statSync(file).size);
}

const ctx: RenderContext = { jax: await renderJaxPoses(ROOT), printableSizes, year: new Date().getUTCFullYear() };
const lastmod = process.env.SEO_LASTMOD ?? new Date().toISOString().slice(0, 10);

const pages = PAGES.map((page) => ({ page, html: renderPage(page, PAGES, ctx) }));
for (const { page, html } of pages) write(`${page.slug}.html`, html);
write("robots.txt", renderRobots());
write("sitemap.xml", renderSitemap(lastmod));
for (const font of FONTS) write(font.href, readFileSync(require.resolve(font.from)));

// Every local href/src on the pages is a landing page, an app route, or a file in the build.
const appRoutes = new Set<string>([...APP_PAGES, "/new"]);
const landing = new Set(LANDING_SLUGS.map((s) => `/${s}`));
const missing: string[] = [];
for (const { page, html } of pages) {
  for (const [, path] of html.matchAll(/(?:href|src)="(\/[^"#?]*)/g)) {
    if (landing.has(path) || appRoutes.has(path)) continue;
    if (!existsSync(join(OUT, path))) missing.push(`/${page.slug} -> ${path}`);
  }
}
if (missing.length) {
  console.error(`seo: broken local links:\n  ${[...new Set(missing)].join("\n  ")}`);
  process.exit(1);
}

const total = pages.reduce((n, p) => n + Buffer.byteLength(p.html), 0);
console.log(`seo: ${pages.length} landing pages (${kb(total)}), robots.txt, sitemap.xml and fonts in ${OUT.slice(ROOT.length + 1) || OUT}`);
