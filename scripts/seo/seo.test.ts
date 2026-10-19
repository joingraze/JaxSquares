/// <reference lib="dom" />
/// <reference lib="dom.iterable" />
// The landing pages and printables: every page is findable (title, description,
// canonical, one H1, parseable JSON-LD), links to the app, and never uses
// betting vocabulary or quotes an amount.

import { describe, expect, it } from "vitest";
import { encodeQr, isDark } from "../../src/features/invite/qr.ts";
import { PAGES } from "./content.ts";
import { SHEETS, qrSvg, sheetHtml, type SheetAssets, type SheetKind } from "./print.ts";
import { renderPage, renderRobots, renderSitemap, type JaxPose, type RenderContext } from "./render.ts";
import { APP_PAGES, BANNED_WORDS, CURRENCY_AMOUNT, HUB, LANDING_SLUGS, ORIGIN, PRINTABLES, SPA_SEGMENTS, pageUrl } from "./site.ts";

const jax = (pose: JaxPose) =>
  `<svg width="120" height="124" viewBox="0 0 128 132" role="img" class="shrink-0" data-pose="${pose}"><title>Jax</title><rect/></svg>`;
const ctx: RenderContext = {
  jax: { cheer: jax("cheer"), sit: jax("sit"), peek: jax("peek") },
  printableSizes: Object.fromEntries(PRINTABLES.map((p) => [p.id, "95 KB"])),
  year: 2026,
};

const rendered = PAGES.map((page) => {
  const html = renderPage(page, PAGES, ctx);
  return { page, html, doc: new DOMParser().parseFromString(html, "text/html") };
});

const meta = (doc: Document, sel: string) => doc.querySelector(sel)?.getAttribute("content") ?? "";
const words = (text: string) => text.split(/\s+/).filter((w) => /\w/.test(w)).length;
const jsonLd = (doc: Document) =>
  [...doc.querySelectorAll('script[type="application/ld+json"]')].map((s) => JSON.parse(s.textContent ?? "") as Record<string, unknown>);
const types = (doc: Document) => jsonLd(doc).map((d) => d["@type"]);

describe("landing pages", () => {
  it("has one page per slug, none shadowing an app route", () => {
    expect(PAGES.map((p) => p.slug)).toEqual([...LANDING_SLUGS]);
    for (const slug of LANDING_SLUGS) expect(SPA_SEGMENTS).not.toContain(slug.split("/")[0]);
  });

  it.each(rendered.map((r) => [r.page.slug, r] as const))("%s has a title, description, canonical, Open Graph and one H1", (slug, { doc }) => {
    const title = doc.querySelector("title")?.textContent ?? "";
    expect(title.length).toBeGreaterThan(20);
    expect(title.length).toBeLessThanOrEqual(70);
    expect(title).toMatch(/JaxSquares$/);
    const description = meta(doc, 'meta[name="description"]');
    expect(description.length).toBeGreaterThanOrEqual(70);
    expect(description.length).toBeLessThanOrEqual(170);
    expect(doc.querySelectorAll('link[rel="canonical"]')).toHaveLength(1);
    expect(doc.querySelector('link[rel="canonical"]')?.getAttribute("href")).toBe(`${ORIGIN}/${slug}`);
    expect(meta(doc, 'meta[property="og:url"]')).toBe(`${ORIGIN}/${slug}`);
    expect(meta(doc, 'meta[property="og:title"]')).toBe(title);
    expect(meta(doc, 'meta[property="og:image"]')).toBe(`${ORIGIN}/og-image.png`);
    expect(doc.querySelectorAll("h1")).toHaveLength(1);
    expect(doc.documentElement.lang).toBe("en");
  });

  it("gives every page its own title, description and H1", () => {
    for (const sel of ["title", "h1"]) {
      const texts = rendered.map((r) => r.doc.querySelector(sel)?.textContent);
      expect(new Set(texts).size).toBe(rendered.length);
    }
    expect(new Set(rendered.map((r) => meta(r.doc, 'meta[name="description"]'))).size).toBe(rendered.length);
  });

  it.each(rendered.map((r) => [r.page.slug, r] as const))("%s has parseable JSON-LD whose FAQ matches the page", (slug, { page, doc }) => {
    const data = jsonLd(doc);
    expect(data.length).toBeGreaterThan(0);
    for (const d of data) expect(d["@context"]).toBe("https://schema.org");
    const faq = data.find((d) => d["@type"] === "FAQPage") as { mainEntity: { name: string; acceptedAnswer: { text: string } }[] };
    expect(faq.mainEntity.length).toBeGreaterThanOrEqual(4);
    const visible = [...doc.querySelectorAll(".faq summary")].map((s) => s.textContent);
    expect(faq.mainEntity.map((q) => q.name)).toEqual(visible);
    for (const q of faq.mainEntity) expect(q.acceptedAnswer.text.length).toBeGreaterThan(40);

    if (slug === HUB) {
      expect(types(doc)).toEqual(expect.arrayContaining(["Organization", "WebSite"]));
    } else {
      const crumbs = data.find((d) => d["@type"] === "BreadcrumbList") as { itemListElement: { item: string }[] };
      expect(crumbs.itemListElement.map((i) => i.item)).toEqual([pageUrl(HUB), pageUrl(slug)]);
    }
    if (page.howTo) {
      const howTo = data.find((d) => d["@type"] === "HowTo") as { step: { name: string; url: string }[] };
      expect(howTo.step.length).toBe(page.howTo.steps.length);
      for (const step of howTo.step) expect(doc.getElementById(step.url.split("#")[1])?.textContent).toContain(step.name);
    }
  });

  it("puts HowTo JSON-LD on the how-to page only", () => {
    const withHowTo = rendered.filter((r) => types(r.doc).includes("HowTo")).map((r) => r.page.slug);
    expect(withHowTo).toEqual(["how-to-play-football-squares"]);
  });

  it.each(rendered.map((r) => [r.page.slug, r] as const))("%s has real copy and both calls to action", (_slug, { doc }) => {
    expect(words(doc.querySelector("main")?.textContent ?? "")).toBeGreaterThanOrEqual(600);
    const links = [...doc.querySelectorAll("main a")].map((a) => [a.getAttribute("href"), a.textContent?.trim()]);
    expect(links).toContainEqual(["/new", "Make a board"]);
    expect(links).toContainEqual(["/", "Join with a code"]);
  });

  it("links the pages to each other and to Terms, Privacy and Support", () => {
    for (const { page, doc } of rendered) {
      const hrefs = new Set([...doc.querySelectorAll("a")].map((a) => a.getAttribute("href")));
      for (const slug of LANDING_SLUGS) expect(hrefs).toContain(`/${slug}`);
      for (const path of ["/terms", "/privacy", "/support"]) expect(hrefs).toContain(path);
      // Linked from the copy too, not just the footer.
      const inMain = [...doc.querySelectorAll(".content a")].map((a) => a.getAttribute("href"));
      expect(inMain.filter((h) => h !== `/${page.slug}` && LANDING_SLUGS.some((s) => h === `/${s}`)).length).toBeGreaterThanOrEqual(3);
    }
  });

  it("carries the NFL line on the Super Bowl and NFL pages", () => {
    for (const { page, doc } of rendered) {
      const footer = doc.querySelector("footer")?.textContent ?? "";
      if (page.slug === "super-bowl-squares" || page.slug === "nfl-squares") {
        expect(footer).toContain("JaxSquares isn't affiliated with or endorsed by the NFL.");
      }
      expect(footer).toContain("never collects, holds or sends money between players");
    }
  });

  it("sizes and describes every image, and lazy-loads the screenshots", () => {
    for (const { doc } of rendered) {
      for (const img of doc.querySelectorAll("img")) {
        expect(img.getAttribute("width")).toMatch(/^\d+$/);
        expect(img.getAttribute("height")).toMatch(/^\d+$/);
        expect(img.hasAttribute("alt")).toBe(true);
      }
      for (const img of doc.querySelectorAll(".shot img, .printable img")) expect(img.getAttribute("loading")).toBe("lazy");
      for (const img of doc.querySelectorAll(".shot img")) expect(img.getAttribute("alt")?.length).toBeGreaterThan(20);
    }
  });

  it("loads nothing from other origins and runs no external script", () => {
    for (const { html, doc } of rendered) {
      expect(doc.querySelectorAll("script[src], link[rel=stylesheet]")).toHaveLength(0);
      expect(html).not.toMatch(/fonts\.(googleapis|gstatic)\.com/);
      for (const el of doc.querySelectorAll("[src]")) expect(el.getAttribute("src")).toMatch(/^\//);
      const inline = [...doc.querySelectorAll("script:not([type])")].map((s) => s.textContent ?? "");
      expect(inline).toHaveLength(1);
      expect(inline[0].length).toBeLessThan(200);
    }
  });

  it("never uses betting words or quotes an amount", () => {
    for (const { page, html, doc } of rendered) {
      expect({ slug: page.slug, match: BANNED_WORDS.exec(html)?.[0] ?? null }).toEqual({ slug: page.slug, match: null });
      expect({ slug: page.slug, match: CURRENCY_AMOUNT.exec(doc.body.textContent ?? "")?.[0] ?? null }).toEqual({ slug: page.slug, match: null });
    }
    for (const text of [renderRobots(), renderSitemap("2026-01-01")]) expect(text).not.toMatch(BANNED_WORDS);
  });

  it("catches the banned words on word boundaries only", () => {
    for (const bad of ["Place a bet", "the pot", "payouts", "buy-in", "jackpot", "the odds", "high stakes", "no gambling", "wagering"]) {
      expect(bad).toMatch(BANNED_WORDS);
    }
    for (const fine of ["a spot on the board", "better luck", "between friends", "alphabet", "potluck"]) expect(fine).not.toMatch(BANNED_WORDS);
  });
});

describe("robots.txt and sitemap.xml", () => {
  it("allows everything and points to the sitemap", () => {
    expect(renderRobots()).toBe(`User-agent: *\nAllow: /\n\nSitemap: ${ORIGIN}/sitemap.xml\n`);
  });

  it("lists the landing pages and the app's public pages with lastmod", () => {
    const xml = new DOMParser().parseFromString(renderSitemap("2026-01-15"), "application/xml");
    const locs = [...xml.getElementsByTagName("loc")].map((l) => l.textContent);
    expect(locs).toEqual([...LANDING_SLUGS.map(pageUrl), ...APP_PAGES.map((p) => `${ORIGIN}${p}`)]);
    expect([...xml.getElementsByTagName("lastmod")].every((l) => l.textContent === "2026-01-15")).toBe(true);
  });
});

describe("printables", () => {
  const assets: SheetAssets = { fonts: { display: "data:,", body: "data:," }, icon: "<svg></svg>", jax: jax("sit") };

  it.each(Object.keys(SHEETS) as SheetKind[])("%s has team lines, amount lines and the live-board QR", (kind) => {
    const doc = new DOMParser().parseFromString(sheetHtml(kind, assets), "text/html");
    const text = doc.body.textContent ?? "";
    for (const label of ["Team across the top", "Team down the side", "Square price", "Prizes", "Run this board live", "jaxsquares.com/new"]) {
      expect(text).toContain(label);
    }
    expect(doc.querySelector("svg[aria-label^='QR code']")).not.toBeNull();
    expect(sheetHtml(kind, assets)).not.toMatch(BANNED_WORDS);
    expect(text).not.toMatch(CURRENCY_AMOUNT);
  });

  it("has a blank number box for every row and column", () => {
    const count = (kind: SheetKind) => new DOMParser().parseFromString(sheetHtml(kind, assets), "text/html").querySelectorAll("td.n").length;
    expect(count("board-10x10-letter")).toBe(20);
    expect(count("board-10x10-a4")).toBe(20);
    expect(count("board-5x5")).toBe(10);
  });

  it("matches each printable on the page to a sheet", () => {
    for (const p of PRINTABLES) expect(p.href).toBe(`/printables/${SHEETS[p.id as SheetKind].file}.pdf`);
  });

  it("draws exactly the QR modules for the new-board page", () => {
    const url = "https://jaxsquares.com/new";
    const qr = encodeQr(url);
    const svg = qrSvg(url, 1);
    const quiet = 2;
    expect(svg).toContain(`viewBox="0 0 ${qr.size + quiet * 2} ${qr.size + quiet * 2}"`);
    const drawn = new Set<string>();
    for (const [, x, y, w] of svg.matchAll(/M(\d+) (\d+)h(\d+)v1h-\d+z/g)) {
      for (let i = 0; i < Number(w); i++) drawn.add(`${Number(x) - quiet + i},${Number(y) - quiet}`);
    }
    for (let y = 0; y < qr.size; y++) {
      for (let x = 0; x < qr.size; x++) expect(drawn.has(`${x},${y}`)).toBe(isDark(qr, x, y));
    }
  });
});
