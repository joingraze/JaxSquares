// The landing page template: head (title, description, canonical, Open Graph,
// JSON-LD), the shared header and footer, the hero, the content sections, the
// FAQ, the call to action and links to the other guides. Plus robots.txt and
// sitemap.xml. Pure string building; scripts/seo/build.ts does the IO.

import { boardDiagram, ctas, esc } from "./blocks.ts";
import { APP_PAGES, HUB, LANDING_SLUGS, ORIGIN, SITE_NAME, pageUrl, type LandingSlug } from "./site.ts";
import { CSS } from "./styles.ts";

export type JaxPose = "cheer" | "sit" | "peek";

export interface RenderContext {
  /** Static SVG for each Jax pose (rendered from src/components/ui/Jax.tsx at build). */
  jax: Record<JaxPose, string>;
  /** PDF size labels per printable id ("64 KB"). */
  printableSizes: Record<string, string>;
  year: number;
}

export interface Faq {
  q: string;
  /** Plain text; blank lines separate paragraphs. The same text goes into the FAQPage JSON-LD. */
  a: string;
}

export interface Section {
  id: string;
  h2: string;
  /** HTML (scripts/seo/blocks.ts helpers), or a function of the build context. */
  body: string | ((ctx: RenderContext) => string);
}

export interface HowTo {
  name: string;
  description: string;
  steps: { name: string; text: string }[];
}

export interface LandingPage {
  slug: LandingSlug;
  /** Short name in navs, breadcrumbs and related links. */
  nav: string;
  /** One line for the related-pages cards. */
  blurb: string;
  title: string;
  description: string;
  eyebrow: string;
  /** May wrap words in <span class="hl"> for the volt highlight. */
  h1: string;
  lede: string;
  hero: { jax: JaxPose; win: { x: number; y: number }; art: string };
  sections: Section[];
  faqs: Faq[];
  howTo?: HowTo;
  /** The "not affiliated with the NFL" line in the footer. */
  nflNotice?: boolean;
  related: LandingSlug[];
  cta: { h2: string; text: string };
}

const NOTE_FREE = "Free to set up and invite. No app or account needed.";
const NFL_NOTICE = "JaxSquares isn't affiliated with or endorsed by the NFL.";
const MONEY_NOTICE =
  "JaxSquares never collects, holds or sends money between players. A square price or prize a host shows is information only.";
const OG_IMAGE = `${ORIGIN}/og-image.png`;
const HEADER_NAV: LandingSlug[] = ["how-to-play-football-squares", "super-bowl-squares", "printable-football-squares"];
const HEADER_LABELS: Partial<Record<LandingSlug, string>> = {
  "how-to-play-football-squares": "How to play",
  "super-bowl-squares": "Super Bowl",
  "printable-football-squares": "Printables",
};

/** Lets the page follow the app's saved Appearance (src/lib/theme.ts); without one, the phone's setting. */
const THEME_BOOT =
  `<script>try{var t=localStorage.getItem("jaxsquares.theme");` +
  `if(t==="dark"||t==="light")document.documentElement.setAttribute("data-theme",t)}catch(e){}</script>`;

/** JSON for a <script type="application/ld+json">: "<" escaped so text can never close the tag. */
function ldScript(data: object): string {
  return `<script type="application/ld+json">${JSON.stringify(data).replace(/</g, "\\u003c")}</script>`;
}

const plain = (text: string) => text.trim().replace(/\s*\n\s*\n\s*/g, " ").replace(/\s+/g, " ");

export function structuredData(page: LandingPage, all: readonly LandingPage[]): object[] {
  const url = pageUrl(page.slug);
  const out: object[] = [];
  if (page.slug === HUB) {
    out.push({
      "@context": "https://schema.org",
      "@type": "Organization",
      "@id": `${ORIGIN}/#organization`,
      name: SITE_NAME,
      url: `${ORIGIN}/`,
      logo: `${ORIGIN}/icons/icon-512.png`,
    });
    out.push({
      "@context": "https://schema.org",
      "@type": "WebSite",
      "@id": `${ORIGIN}/#website`,
      name: SITE_NAME,
      url: `${ORIGIN}/`,
      publisher: { "@id": `${ORIGIN}/#organization` },
    });
  } else {
    const hub = all.find((p) => p.slug === HUB);
    out.push({
      "@context": "https://schema.org",
      "@type": "BreadcrumbList",
      itemListElement: [
        { "@type": "ListItem", position: 1, name: hub?.nav ?? "Football squares", item: pageUrl(HUB) },
        { "@type": "ListItem", position: 2, name: page.nav, item: url },
      ],
    });
  }
  if (page.howTo) {
    out.push({
      "@context": "https://schema.org",
      "@type": "HowTo",
      name: page.howTo.name,
      description: page.howTo.description,
      image: OG_IMAGE,
      step: page.howTo.steps.map((s, i) => ({
        "@type": "HowToStep",
        position: i + 1,
        name: s.name,
        text: s.text,
        url: `${url}#step-${i + 1}`,
      })),
    });
  }
  out.push({
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: page.faqs.map((f) => ({
      "@type": "Question",
      name: f.q,
      acceptedAnswer: { "@type": "Answer", text: plain(f.a) },
    })),
  });
  return out;
}

function head(page: LandingPage, all: readonly LandingPage[]): string {
  const url = pageUrl(page.slug);
  const t = esc(page.title);
  const d = esc(page.description);
  return [
    `<meta charset="utf-8">`,
    `<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">`,
    `<title>${t}</title>`,
    `<meta name="description" content="${d}">`,
    `<link rel="canonical" href="${url}">`,
    `<meta name="theme-color" content="#060c09" media="(prefers-color-scheme: dark)">`,
    `<meta name="theme-color" content="#eef2ec" media="(prefers-color-scheme: light)">`,
    `<meta name="color-scheme" content="dark light">`,
    `<meta name="format-detection" content="telephone=no">`,
    `<link rel="icon" href="/favicon.ico" sizes="32x32">`,
    `<link rel="icon" href="/favicon.svg" type="image/svg+xml">`,
    `<link rel="apple-touch-icon" href="/apple-touch-icon.png">`,
    `<meta property="og:type" content="website">`,
    `<meta property="og:site_name" content="${SITE_NAME}">`,
    `<meta property="og:title" content="${t}">`,
    `<meta property="og:description" content="${d}">`,
    `<meta property="og:url" content="${url}">`,
    `<meta property="og:image" content="${OG_IMAGE}">`,
    `<meta property="og:image:width" content="1200">`,
    `<meta property="og:image:height" content="630">`,
    `<meta property="og:image:alt" content="JaxSquares football squares board">`,
    `<meta name="twitter:card" content="summary_large_image">`,
    `<meta name="twitter:title" content="${t}">`,
    `<meta name="twitter:description" content="${d}">`,
    `<meta name="twitter:image" content="${OG_IMAGE}">`,
    `<link rel="preload" href="/seo/fonts/figtree.woff2" as="font" type="font/woff2" crossorigin>`,
    `<link rel="preload" href="/seo/fonts/bricolage-grotesque.woff2" as="font" type="font/woff2" crossorigin>`,
    THEME_BOOT,
    `<style>${CSS}</style>`,
    ...structuredData(page, all).map(ldScript),
  ].join("\n");
}

/** Brand link: the app icon (Jax over the board) and the wordmark. */
const brand = `<a class="brand" href="/${HUB}"><img src="/icons/icon.svg" width="34" height="34" alt=""><span>Jax<span>Squares</span></span></a>`;

function header(page: LandingPage): string {
  const nav = HEADER_NAV.map((slug) => {
    const current = slug === page.slug ? ` aria-current="page"` : "";
    return `<a href="/${slug}"${current}>${HEADER_LABELS[slug]}</a>`;
  }).join("");
  return (
    `<a class="skip" href="#main">Skip to content</a>` +
    `<header class="top"><div class="wrap">${brand}<nav aria-label="Guides">${nav}</nav>` +
    `<a class="btn btn-sm" href="/new">Make a board</a></div></header>`
  );
}

/** Jax's SVG with our class and size, decorative (the copy next to him says it all). */
function jaxArt(svg: string, width: number): string {
  return svg
    .replace(/<svg width="\d+" height="(\d+)"/, (_m, h: string) => `<svg width="${width}" height="${Math.round((Number(h) * width) / 120)}"`)
    .replace(/ role="img"/, ` aria-hidden="true" focusable="false"`)
    .replace(/<title>[^<]*<\/title>/, "")
    .replace(/class="shrink-0"/, `class="jax"`);
}

function hero(page: LandingPage, all: readonly LandingPage[], ctx: RenderContext): string {
  const hub = all.find((p) => p.slug === HUB);
  const crumbs =
    page.slug === HUB
      ? ""
      : `<nav class="crumbs" aria-label="Breadcrumb"><a href="/${HUB}">${esc(hub?.nav ?? "Football squares")}</a> › <span aria-current="page">${esc(page.nav)}</span></nav>`;
  return (
    `<section class="hero"><div class="wrap"><div>${crumbs}` +
    `<p class="eyebrow">${esc(page.eyebrow)}</p><h1>${page.h1}</h1><p class="lede">${page.lede}</p>` +
    `${ctas()}<p class="fine">${NOTE_FREE}</p></div>` +
    `<div class="hero-art">${boardDiagram({ id: "hero-board", win: page.hero.win, title: page.hero.art })}${jaxArt(ctx.jax[page.hero.jax], 120)}</div>` +
    `</div></section>`
  );
}

function faqSection(page: LandingPage): string {
  const items = page.faqs
    .map((f) => {
      const body = f.a
        .trim()
        .split(/\n\s*\n/)
        .map((p) => `<p>${esc(plain(p))}</p>`)
        .join("");
      return `<details><summary>${esc(f.q)}</summary>${body}</details>`;
    })
    .join("");
  return `<section class="section faq" aria-labelledby="faq"><h2 id="faq">Questions people ask</h2>${items}</section>`;
}

function ctaSection(page: LandingPage, ctx: RenderContext): string {
  return (
    `<section class="card cta" aria-labelledby="cta">${jaxArt(ctx.jax.peek, 132)}` +
    `<h2 id="cta">${page.cta.h2}</h2><p>${page.cta.text}</p>${ctas()}<p class="fine">${NOTE_FREE}</p></section>`
  );
}

function relatedSection(page: LandingPage, all: readonly LandingPage[]): string {
  const cards = page.related
    .map((slug) => all.find((p) => p.slug === slug))
    .filter((p): p is LandingPage => !!p)
    .map((p) => `<a class="card" href="/${p.slug}"><strong>${esc(p.nav)}</strong>${esc(p.blurb)}</a>`)
    .join("");
  return `<nav class="section" aria-labelledby="more"><h2 id="more">More squares guides</h2><div class="related">${cards}</div></nav>`;
}

function footer(page: LandingPage, all: readonly LandingPage[], ctx: RenderContext): string {
  const guides = LANDING_SLUGS.map((slug) => all.find((p) => p.slug === slug))
    .filter((p): p is LandingPage => !!p)
    .map((p) => `<li><a href="/${p.slug}">${esc(p.nav)}</a></li>`)
    .join("");
  const app = [
    ["/new", "Make a board"],
    ["/", "Join with a code"],
    ["/support", "Support"],
    ["/terms", "Terms"],
    ["/privacy", "Privacy"],
  ]
    .map(([href, label]) => `<li><a href="${href}">${label}</a></li>`)
    .join("");
  return (
    `<footer class="foot"><div class="wrap"><div class="foot-grid">` +
    `<div>${brand}<p class="foot-note">Football squares, live with your crew. Make a board, text the link, and every score lands on every phone.</p></div>` +
    `<nav aria-labelledby="f-guides"><h2 id="f-guides">Guides</h2><ul>${guides}</ul></nav>` +
    `<nav aria-labelledby="f-app"><h2 id="f-app">JaxSquares</h2><ul>${app}</ul></nav></div>` +
    `<p class="foot-note">${MONEY_NOTICE}</p>` +
    (page.nflNotice ? `<p class="foot-note">${NFL_NOTICE}</p>` : "") +
    `<p class="foot-note">© ${ctx.year} ${SITE_NAME}</p></div></footer>`
  );
}

function sectionHtml(s: Section, ctx: RenderContext): string {
  const body = typeof s.body === "function" ? s.body(ctx) : s.body;
  return `<section class="section" aria-labelledby="${s.id}"><h2 id="${s.id}">${s.h2}</h2>${body}</section>`;
}

export function renderPage(page: LandingPage, all: readonly LandingPage[], ctx: RenderContext): string {
  return (
    `<!doctype html>\n<html lang="en">\n<head>\n${head(page, all)}\n</head>\n<body>\n` +
    `${header(page)}\n<main id="main">${hero(page, all, ctx)}<div class="wrap"><div class="content">` +
    page.sections.map((s) => sectionHtml(s, ctx)).join("") +
    faqSection(page) +
    ctaSection(page, ctx) +
    relatedSection(page, all) +
    `</div></div></main>\n${footer(page, all, ctx)}\n</body>\n</html>\n`
  );
}

export function renderRobots(): string {
  return `User-agent: *\nAllow: /\n\nSitemap: ${ORIGIN}/sitemap.xml\n`;
}

/** Landing pages first (the hub at top priority), then the app's public pages. `lastmod`: the build date (YYYY-MM-DD). */
export function renderSitemap(lastmod: string): string {
  const urls = [...LANDING_SLUGS.map((s) => pageUrl(s)), ...APP_PAGES.map((p) => (p === "/" ? `${ORIGIN}/` : `${ORIGIN}${p}`))];
  const body = urls.map((u) => `  <url><loc>${u}</loc><lastmod>${lastmod}</lastmod></url>`).join("\n");
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${body}\n</urlset>\n`;
}
