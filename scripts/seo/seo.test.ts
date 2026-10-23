/// <reference lib="dom" />
/// <reference lib="dom.iterable" />
// The landing pages and printables: every page is findable (title, description,
// canonical, one H1, parseable JSON-LD), links to the app, and never uses
// betting vocabulary or quotes an amount.

import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { WEEK_END, WEEK_ID, WEEK_PAGES, WEEK_START, injectWeek } from "../../shared/weekGames.ts";
import { encodeQr, isDark } from "../../src/features/invite/qr.ts";
import { PAGES } from "./content.ts";
import { GAMES, PCT, RANKED, finalsCsv } from "./finals.ts";
import { HOME_DESCRIPTION, HOME_TITLE, renderHome } from "./home.ts";
import { indexNowBody } from "./indexnow.ts";
import { htmlToText, renderLlms, renderLlmsFull } from "./llms.ts";
import { SHEETS, qrSvg, sheetHtml, type SheetAssets, type SheetKind } from "./print.ts";
import { renderPage, renderRobots, renderSitemap, type JaxPose, type RenderContext } from "./render.ts";
import {
  APP_PAGES,
  BANNED_WORDS,
  CURRENCY_AMOUNT,
  FINALS_CSV,
  HUB,
  INDEXNOW_KEY,
  LANDING_SLUGS,
  ORIGIN,
  PRINTABLES,
  SOCIAL,
  SPA_SEGMENTS,
  TRADEMARKED_EVENT,
  pageUrl,
} from "./site.ts";
import { boardMinute as appBoardMinute } from "../../shared/soccer.ts";
import { boardMinute, countMinutes } from "./soccerStats.ts";
import { countFinals } from "./stats.ts";

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
      const org = data.find((d) => d["@type"] === "Organization") as { sameAs: string[] };
      expect(org.sameAs).toContain(SOCIAL.instagram);
    } else if (slug === "basketball-squares" || slug === "soccer-squares") {
      // Heads its sport's pages: no breadcrumbs, like the hub.
      expect(types(doc)).not.toContain("BreadcrumbList");
      expect(doc.querySelector(".crumbs")).toBeNull();
    } else {
      const parent = slug === "march-madness-squares" ? "basketball-squares" : HUB;
      const crumbs = data.find((d) => d["@type"] === "BreadcrumbList") as { itemListElement: { item: string }[] };
      expect(crumbs.itemListElement.map((i) => i.item)).toEqual([pageUrl(parent), pageUrl(slug)]);
      expect(doc.querySelector(".crumbs a")?.getAttribute("href")).toBe(`/${parent}`);
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

  it("links the pages to each other and to Pricing, Terms, Privacy and Support", () => {
    for (const { page, doc } of rendered) {
      const hrefs = new Set([...doc.querySelectorAll("a")].map((a) => a.getAttribute("href")));
      for (const slug of LANDING_SLUGS) expect(hrefs).toContain(`/${slug}`);
      for (const path of ["/pricing", "/terms", "/privacy", "/support"]) expect(hrefs).toContain(path);
      // Linked from the copy too, not just the footer.
      const inMain = [...doc.querySelectorAll(".content a")].map((a) => a.getAttribute("href"));
      expect(inMain.filter((h) => h !== `/${page.slug}` && LANDING_SLUGS.some((s) => h === `/${s}`)).length).toBeGreaterThanOrEqual(3);
    }
  });

  it("carries the NFL line on the big game and NFL pages", () => {
    for (const { page, doc } of rendered) {
      const footer = doc.querySelector("footer")?.textContent ?? "";
      if (page.slug === "big-game-squares" || page.slug === "nfl-squares") {
        expect(footer).toContain("JaxSquares isn't affiliated with or endorsed by the NFL.");
      }
      expect(footer).toContain("never collects, holds or sends money between players");
    }
  });

  it("carries the NBA line on the basketball page and the NCAA line on the basketball and March Madness pages", () => {
    const footer = (slug: string) => rendered.find((r) => r.page.slug === slug)?.doc.querySelector("footer")?.textContent ?? "";
    expect(footer("basketball-squares")).toContain("JaxSquares isn't affiliated with or endorsed by the NBA or the WNBA.");
    for (const slug of ["basketball-squares", "march-madness-squares"]) {
      expect(footer(slug)).toContain("JaxSquares isn't affiliated with or endorsed by the NCAA.");
    }
    expect(footer("football-squares")).not.toContain("NCAA");
  });

  it("carries the soccer leagues' line on the soccer page only", () => {
    const line = "JaxSquares isn't affiliated with or endorsed by MLS, the NWSL, the Premier League, LaLiga, Liga MX or UEFA.";
    for (const { page, doc } of rendered) {
      const footer = doc.querySelector("footer")?.textContent ?? "";
      if (page.slug === "soccer-squares") expect(footer).toContain(line);
      else expect(footer).not.toContain(line);
    }
  });

  it("explains the minute board, stoppage time and a goalless match on the soccer page", () => {
    const page = rendered.find((r) => r.page.slug === "soccer-squares")!;
    const text = page.doc.querySelector("main")?.textContent ?? "";
    expect(text).toMatch(/43rd minute/);
    expect(text).toMatch(/45\+2' wins for the 45 square/);
    expect(text).toMatch(/90\+3' is the 93rd minute/);
    expect(text).toMatch(/00 square/);
    // The hero board is labeled with the minute's digits, not team names.
    expect(page.doc.querySelector(".hero-art svg")?.textContent).toContain("MINUTE · TENS");
    // Trademarked tournament names stay off the page.
    expect(page.html).not.toMatch(/world cup|euros?\b|copa/i);
  });

  it("keeps football out of the basketball and soccer pages' share image text and lists only their own printable", () => {
    for (const { page, doc } of rendered) {
      const alt = meta(doc, 'meta[property="og:image:alt"]');
      const cards = [...doc.querySelectorAll(".printable a[download]")].map((a) => a.getAttribute("href"));
      if (["basketball-squares", "march-madness-squares", "soccer-squares"].includes(page.slug)) {
        expect(alt).not.toMatch(/football/i);
        expect(doc.querySelector("h1")?.textContent).not.toMatch(/football/i);
      } else {
        expect(alt).toBe("JaxSquares football squares board");
      }
      if (page.slug === "basketball-squares") expect(cards).toEqual(["/printables/basketball-squares-10x10-letter.pdf"]);
      if (page.slug === "soccer-squares") expect(cards).toEqual(["/printables/soccer-squares-10x10-letter.pdf"]);
      if (page.slug === "printable-football-squares") {
        expect(cards).toHaveLength(4);
        expect(cards.every((href) => href?.startsWith("/printables/football-squares-"))).toBe(true);
      }
    }
  });

  it("names the tournament only to describe it, and says the men's games are halves", () => {
    const march = rendered.find((r) => r.page.slug === "march-madness-squares")!;
    const text = march.doc.querySelector("main")?.textContent ?? "";
    expect(text).toMatch(/two 20-minute halves/);
    expect(text).toMatch(/four 10-minute quarters/);
    // Other tournament round names are the NCAA's marks too: the copy doesn't lean on them.
    expect(march.html).not.toMatch(/Final Four|Elite Eight|Sweet 16|Sweet Sixteen|Selection Sunday|First Four|Big Dance/);
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
      // Two tiny inline scripts: the workers.dev redirect (first, so it runs before anything) and the theme.
      const inline = [...doc.querySelectorAll("script:not([type])")].map((s) => s.textContent ?? "");
      expect(inline).toHaveLength(2);
      expect(inline[0]).toContain("workers");
      for (const script of inline) expect(script.length).toBeLessThan(200);
    }
  });

  it("never uses betting words or quotes an amount", () => {
    for (const { page, html, doc } of rendered) {
      expect({ slug: page.slug, match: BANNED_WORDS.exec(html)?.[0] ?? null }).toEqual({ slug: page.slug, match: null });
      expect({ slug: page.slug, match: CURRENCY_AMOUNT.exec(doc.body.textContent ?? "")?.[0] ?? null }).toEqual({ slug: page.slug, match: null });
    }
    for (const text of [renderRobots(), renderSitemap("2026-01-01")]) expect(text).not.toMatch(BANNED_WORDS);
  });

  it("says the big game, never the championship's trademarked name", () => {
    for (const { page, html } of rendered) {
      expect({ slug: page.slug, match: TRADEMARKED_EVENT.exec(html)?.[0] ?? null }).toEqual({ slug: page.slug, match: null });
    }
    for (const text of [renderRobots(), renderSitemap("2026-01-01")]) expect(text).not.toMatch(TRADEMARKED_EVENT);
    for (const name of ["Super Bowl", "super-bowl", "SUPERBOWL"]) expect(name).toMatch(TRADEMARKED_EVENT);
  });

  it("catches the banned words on word boundaries only", () => {
    for (const bad of ["Place a bet", "the pot", "payouts", "buy-in", "jackpot", "the odds", "high stakes", "no gambling", "wagering"]) {
      expect(bad).toMatch(BANNED_WORDS);
    }
    for (const fine of ["a spot on the board", "better luck", "between friends", "alphabet", "potluck"]) expect(fine).not.toMatch(BANNED_WORDS);
  });
});

describe("robots.txt and sitemap.xml", () => {
  it("allows every page to every crawler, keeps out the API and points to the sitemap", () => {
    expect(renderRobots()).toBe(`User-agent: *\nAllow: /\nDisallow: /api/\n\nSitemap: ${ORIGIN}/sitemap.xml\n`);
  });

  it("dates each URL by when its page last changed", () => {
    const xml = new DOMParser().parseFromString(renderSitemap((url) => (url === `${ORIGIN}/` ? "2026-10-01" : "2026-09-15")), "application/xml");
    const dates = Object.fromEntries([...xml.getElementsByTagName("url")].map((u) => [u.querySelector("loc")?.textContent, u.querySelector("lastmod")?.textContent]));
    expect(dates[`${ORIGIN}/`]).toBe("2026-10-01");
    expect(dates[pageUrl(HUB)]).toBe("2026-09-15");
  });

  it("lists the landing pages and the app's public pages with lastmod", () => {
    const xml = new DOMParser().parseFromString(renderSitemap("2026-01-15"), "application/xml");
    const locs = [...xml.getElementsByTagName("loc")].map((l) => l.textContent);
    expect(locs).toEqual([...LANDING_SLUGS.map(pageUrl), ...APP_PAGES.map((p) => `${ORIGIN}${p}`)]);
    expect([...xml.getElementsByTagName("lastmod")].every((l) => l.textContent === "2026-01-15")).toBe(true);
  });
});

describe("this week's games", () => {
  it("gives each listing page one slot, with a fallback the Worker can replace", () => {
    for (const { page, html } of rendered) {
      const listed = Object.keys(WEEK_PAGES).includes(page.slug);
      expect({ slug: page.slug, slots: html.split(WEEK_START).length - 1 }).toEqual({ slug: page.slug, slots: listed ? 1 : 0 });
      if (!listed) continue;
      const doc = new DOMParser().parseFromString(html, "text/html");
      expect(doc.getElementById(WEEK_ID)?.textContent?.length).toBeGreaterThan(80);
      const swapped = injectWeek(html, `<ul class="games"><li>Hawks at Wolves</li></ul>`)!;
      expect(swapped).toContain(`${WEEK_START}<ul class="games"><li>Hawks at Wolves</li></ul>${WEEK_END}`);
      expect(new DOMParser().parseFromString(swapped, "text/html").querySelectorAll("h1")).toHaveLength(1);
    }
    expect(injectWeek("<p>no slot</p>", "<ul></ul>")).toBeNull();
  });
});

describe("the data page", () => {
  const data = rendered.find((r) => r.page.slug === "best-football-squares-numbers")!;

  it("ranks the squares from the data, best first, and offers the table as CSV", () => {
    expect(RANKED).toHaveLength(55);
    expect(RANKED[0].pct).toBeGreaterThan(RANKED[54].pct);
    expect(PCT.flat().reduce((a, b) => a + b, 0)).toBeCloseTo(100, 6);
    const csv = finalsCsv().trim().split("\n");
    expect(csv).toHaveLength(101);
    expect(csv[0]).toMatch(/^top_digit,side_digit,/);
    expect(data.doc.querySelector(`a[href="${FINALS_CSV}"]`)).not.toBeNull();
    // The full board, digit by digit.
    expect(data.doc.querySelectorAll("table.heat tbody td")).toHaveLength(100);
  });

  it("describes itself as a Dataset with a CSV download", () => {
    const dataset = jsonLd(data.doc).find((d) => d["@type"] === "Dataset") as {
      description: string;
      distribution: { contentUrl: string; encodingFormat: string }[];
      temporalCoverage: string;
    };
    expect(dataset.description.length).toBeGreaterThan(50);
    expect(dataset.description).toContain(GAMES.toLocaleString("en-US"));
    expect(dataset.distribution).toEqual([{ "@type": "DataDownload", encodingFormat: "text/csv", contentUrl: `${ORIGIN}${FINALS_CSV}` }]);
    expect(dataset.temporalCoverage).toMatch(/^\d{4}-09\/\d{4}-02$/);
    expect(rendered.filter((r) => types(r.doc).includes("Dataset")).map((r) => r.page.slug)).toEqual(["best-football-squares-numbers"]);
  });

  it("says chance, never odds, and carries the NFL line", () => {
    expect(data.html).not.toMatch(BANNED_WORDS);
    expect(data.doc.querySelector("footer")?.textContent).toContain("JaxSquares isn't affiliated with or endorsed by the NFL.");
  });
});

describe("the homepage", () => {
  // The source index.html: vite build only adds its script and style tags.
  const shell = readFileSync("index.html", "utf8");
  const html = renderHome(shell, PAGES);
  const doc = new DOMParser().parseFromString(html, "text/html");

  it("has its own title, description, canonical and link preview", () => {
    expect(doc.title).toBe(HOME_TITLE);
    expect(HOME_TITLE.length).toBeLessThanOrEqual(70);
    expect(HOME_DESCRIPTION.length).toBeGreaterThanOrEqual(70);
    expect(HOME_DESCRIPTION.length).toBeLessThanOrEqual(170);
    expect(meta(doc, 'meta[name="description"]')).toBe(HOME_DESCRIPTION);
    expect(doc.querySelector('link[rel="canonical"]')?.getAttribute("href")).toBe(`${ORIGIN}/`);
    expect(meta(doc, 'meta[property="og:title"]')).not.toMatch(/invited/i);
    expect(meta(doc, 'meta[name="twitter:title"]')).toBe(meta(doc, 'meta[property="og:title"]'));
    expect(meta(doc, 'meta[property="og:description"]')).toBe(HOME_DESCRIPTION);
  });

  it("says who runs it and what the app is", () => {
    expect(types(doc)).toEqual(["Organization", "WebSite", "WebApplication"]);
    const org = jsonLd(doc)[0] as { sameAs: string[]; "@id": string };
    expect(org.sameAs).toEqual([SOCIAL.instagram]);
    // The same entity as the hub's.
    const hub = rendered.find((r) => r.page.slug === HUB)!;
    expect(jsonLd(hub.doc).find((d) => d["@type"] === "Organization")?.["@id"]).toBe(org["@id"]);
  });

  it("puts the welcome screen in #root for crawlers, hidden once the app's scripts run", () => {
    const root = doc.getElementById("root")!;
    expect(root.querySelectorAll("h1")).toHaveLength(1);
    expect(root.querySelector("h1")?.textContent).toBe("Sports squares, live with your crew.");
    expect(root.textContent).toContain("Football, basketball or soccer:");
    const hrefs = [...root.querySelectorAll("a")].map((a) => a.getAttribute("href"));
    expect(hrefs).toContain("/new");
    for (const slug of LANDING_SLUGS) expect(hrefs).toContain(`/${slug}`);
    expect(html).toContain("html[data-theme] .prerender{display:none}");
    // The theme script that sets data-theme is still there, ahead of the content.
    expect(html.indexOf('id="theme-boot"')).toBeLessThan(html.indexOf('class="prerender"'));
    expect(root.textContent).toContain("never collects, holds or sends money between players");
    expect(root.textContent).toContain("isn't affiliated with or endorsed by any league or team");
  });

  it("never uses betting words, quotes an amount or names the big game", () => {
    expect(html).not.toMatch(BANNED_WORDS);
    expect(doc.body.textContent).not.toMatch(CURRENCY_AMOUNT);
    expect(html).not.toMatch(TRADEMARKED_EVENT);
  });

  it("breaks the build when the shell changes shape", () => {
    expect(() => renderHome(shell.replace('<div id="root"></div>', "<main></main>"), PAGES)).toThrow(/root/);
  });
});

describe("llms.txt", () => {
  const llms = renderLlms(PAGES);
  const full = renderLlmsFull(PAGES, ctx);

  it("says what JaxSquares is and links every guide", () => {
    expect(llms).toMatch(/^# JaxSquares\n\n> /);
    for (const slug of LANDING_SLUGS) expect(llms).toContain(`(${pageUrl(slug)})`);
    expect(llms).toContain(`${ORIGIN}/llms-full.txt`);
  });

  it("carries every guide's full text, links made absolute", () => {
    for (const page of PAGES) {
      expect(full).toContain(`Source: ${pageUrl(page.slug)}`);
      for (const f of page.faqs) expect(full).toContain(`### ${f.q}`);
    }
    expect(full).not.toMatch(/<[a-z][^>]*>/i);
    expect(full).not.toMatch(/\]\(\//);
    expect(htmlToText(`<p>Hi <a href="/new">there</a> &amp; <strong>you</strong></p>`)).toBe(`Hi [there](${ORIGIN}/new) & **you**`);
  });

  it("never uses betting words, quotes an amount or names the big game", () => {
    for (const text of [llms, full]) {
      expect(text).not.toMatch(BANNED_WORDS);
      expect(text).not.toMatch(CURRENCY_AMOUNT);
      expect(text).not.toMatch(TRADEMARKED_EVENT);
    }
  });
});

describe("IndexNow", () => {
  it("pings for this host with the published key", () => {
    expect(INDEXNOW_KEY).toMatch(/^[a-zA-Z0-9-]{8,128}$/);
    expect(indexNowBody([`${ORIGIN}/nfl-squares`])).toEqual({
      host: "jaxsquares.com",
      key: INDEXNOW_KEY,
      keyLocation: `${ORIGIN}/${INDEXNOW_KEY}.txt`,
      urlList: [`${ORIGIN}/nfl-squares`],
    });
  });
});

describe("the final-score stats", () => {
  const csv = [
    "game_id,season,game_type,home_score,away_score",
    "a,2024,REG,17,10",
    "b,2024,REG,24,17",
    "c,2024,SB,27,20",
    // A season in progress (no final game yet) is left out.
    "d,2025,REG,3,0",
    // Not played yet.
    "e,2024,REG,,",
  ].join("\n");

  it("counts completed seasons only, averaging each square over both orientations", () => {
    const s = countFinals(csv);
    expect(s.games).toBe(3);
    expect([s.firstSeason, s.lastSeason]).toEqual(["2024", "2024"]);
    // 17-10 and 27-20 land on home 7, away 0: half of each to 7-0, half to 0-7. 24-17 is 4-7.
    expect(s.hits[7][0]).toBe(1);
    expect(s.hits[0][7]).toBe(1);
    expect(s.hits[4][7]).toBe(0.5);
    expect(s.hits[7][4]).toBe(0.5);
    expect(s.hits.flat().reduce((a, b) => a + b, 0)).toBe(3);
    expect(s.digitShare[7]).toBe(50);
    expect(s.topFinals[0]).toEqual([17, 10, 1]);
  });
});

describe("the soccer-square stats", () => {
  it("puts a goal on the same square the app does", () => {
    for (let minute = 0; minute <= 130; minute++) {
      for (const added of [0, 1, 4, 13]) expect([minute, added, boardMinute(minute, added)]).toEqual([minute, added, appBoardMinute(minute, added)]);
    }
  });

  it("counts every goal, stoppage time and goalless matches, and refuses a match missing a goal's minute", () => {
    const s = countMinutes([
      {
        year: 2026,
        matches: [
          { team1: "A", team2: "B", score: { ft: [2, 1] }, goals1: [{ minute: "45+3" }, { minute: "90+2" }], goals2: [{ minute: 7 }] },
          { team1: "C", team2: "D", score: { ft: [0, 0], et: [1, 0] }, goals1: [{ minute: "105+1" }], goals2: [] },
          { team1: "E", team2: "F", score: [0, 0] },
        ],
      },
    ]);
    expect([s.matches, s.goals, s.noGoalMatches, s.firstHalfStoppage, s.secondHalfStoppage, s.extraTime]).toEqual([3, 4, 1, 1, 1, 1]);
    expect([45, 92, 7, 5].map((m) => s.squareGoals[m])).toEqual([1, 1, 1, 1]);
    expect(() => countMinutes([{ year: 2026, matches: [{ team1: "A", team2: "B", score: { ft: [1, 0] }, goals1: [] }] }])).toThrow(/lists 0 goals/);
  });
});

describe("printables", () => {
  const assets: SheetAssets = { fonts: { display: "data:,", body: "data:," }, icon: "<svg></svg>", jax: jax("sit") };

  it.each(Object.keys(SHEETS) as SheetKind[])("%s has team lines, amount lines and the live-board QR", (kind) => {
    const doc = new DOMParser().parseFromString(sheetHtml(kind, assets), "text/html");
    const text = doc.body.textContent ?? "";
    const bands = kind === "soccer-10x10-letter" ? ["Minute · ones", "Minute · tens", "Match"] : ["Team across the top", "Team down the side"];
    for (const label of [...bands, "Square price", "Prizes", "Run this board live", "jaxsquares.com/new"]) {
      expect(text).toContain(label);
    }
    expect(doc.querySelector("svg[aria-label^='QR code']")).not.toBeNull();
    expect(sheetHtml(kind, assets)).not.toMatch(BANNED_WORDS);
    expect(sheetHtml(kind, assets)).not.toMatch(TRADEMARKED_EVENT);
    expect(text).not.toMatch(CURRENCY_AMOUNT);
  });

  it("has a blank number box for every row and column", () => {
    const count = (kind: SheetKind) => new DOMParser().parseFromString(sheetHtml(kind, assets), "text/html").querySelectorAll("td.n").length;
    expect(count("board-10x10-letter")).toBe(20);
    expect(count("board-10x10-a4")).toBe(20);
    expect(count("board-5x5")).toBe(10);
    expect(count("basketball-10x10-letter")).toBe(20);
    expect(count("soccer-10x10-letter")).toBe(20);
  });

  it("matches each printable on the page to a sheet", () => {
    for (const p of PRINTABLES) expect(p.href).toBe(`/printables/${SHEETS[p.id as SheetKind].file}.pdf`);
  });

  it("heads the basketball board as basketball and tells a game of halves which lines to use", () => {
    const doc = new DOMParser().parseFromString(sheetHtml("basketball-10x10-letter", assets), "text/html");
    expect(doc.querySelector("h1")?.textContent).toBe("Basketball squares");
    expect(doc.body.textContent).toContain("Use the Half and Final lines");
    expect(new DOMParser().parseFromString(sheetHtml("board-10x10-letter", assets), "text/html").querySelector("h1")?.textContent).toBe("Football squares");
  });

  it("heads the soccer board as soccer, with lines for the goals and the stoppage-time rules", () => {
    const doc = new DOMParser().parseFromString(sheetHtml("soccer-10x10-letter", assets), "text/html");
    expect(doc.querySelector("h1")?.textContent).toBe("Soccer squares");
    const text = doc.body.textContent ?? "";
    for (const label of ["1st goal", "Each goal", "Last goal", "Minute", "45th minute", "00 wins"]) expect(text).toContain(label);
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
