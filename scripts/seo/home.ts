// The homepage (home.html, served at "/" by the Worker): the built SPA shell
// (dist/client/index.html) with the homepage's own title, description,
// canonical and JSON-LD, and a static version of the welcome screen inside
// #root for crawlers that don't run JavaScript (most AI crawlers). React
// replaces it on start, and it's hidden as soon as the theme script runs, so
// people never see it flash; what it says matches the welcome screen
// (src/features/home/Welcome.tsx). The plain shell (index.html) stays the
// fallback for every app route, so none of this leaks onto boards.

import { esc } from "./blocks.ts";
import { organizationLd, websiteLd, type LandingPage } from "./render.ts";
import { HOME_FILE, LANDING_SLUGS, ORIGIN, SITE_NAME, SOCIAL } from "./site.ts";

export { HOME_FILE };

export const HOME_TITLE = "JaxSquares: Football & Basketball Squares, Live on Every Phone";
export const HOME_DESCRIPTION =
  "Football and basketball squares on every phone. Make a board, text one link, friends tap their squares, and live scores light up each winner. Free to set up.";
/** The link preview's headline: the homepage isn't an invite. */
const HOME_SHARE_TITLE = "Football & basketball squares, live on every phone";

const MONEY_NOTICE =
  "JaxSquares never collects, holds or sends money between players. A square price or prize a host shows is information only.";
const AFFILIATION = "JaxSquares isn't affiliated with or endorsed by any league or team.";

/** For crawlers only: the theme script sets data-theme as soon as JavaScript runs, and then the app draws the screen. */
const PRERENDER_CSS =
  `html[data-theme] .prerender{display:none}` +
  `.prerender{max-width:40rem;margin:0 auto;padding:24px 16px 48px;color:#f3f7f1;font:17px/1.55 system-ui,-apple-system,"Segoe UI",Roboto,sans-serif}` +
  `.prerender a{color:#d5ff52}.prerender h1{font-size:2.25rem;line-height:1.1;margin:.5rem 0}` +
  `.prerender h2{font-size:1.25rem;margin:2rem 0 .5rem}.prerender li{margin:.375rem 0}.prerender .fine{font-size:.875rem;color:#a3b8ab}`;

function ldScript(data: object): string {
  return `<script type="application/ld+json">${JSON.stringify(data).replace(/</g, "\\u003c")}</script>`;
}

/** The app itself, for search engines and assistants describing what JaxSquares is. */
export function webApplicationLd(): object {
  return {
    "@context": "https://schema.org",
    "@type": "WebApplication",
    "@id": `${ORIGIN}/#app`,
    name: SITE_NAME,
    url: `${ORIGIN}/`,
    description: HOME_DESCRIPTION,
    applicationCategory: "GameApplication",
    operatingSystem: "Any",
    browserRequirements: "Requires JavaScript",
    publisher: { "@id": `${ORIGIN}/#organization` },
  };
}

export function homeStructuredData(): object[] {
  return [organizationLd(), websiteLd(), webApplicationLd()];
}

/** The welcome screen as static HTML, plus how it works and the guides. */
export function homeContent(pages: readonly LandingPage[]): string {
  const guides = LANDING_SLUGS.map((slug) => pages.find((p) => p.slug === slug))
    .filter((p): p is LandingPage => !!p)
    .map((p) => `<li><a href="/${p.slug}">${esc(p.nav)}</a>: ${esc(p.blurb)}</li>`)
    .join("");
  return (
    `<div class="prerender"><header><a href="/"><strong>${SITE_NAME}</strong></a></header><main>` +
    `<h1>Sports squares, live with your crew.</h1>` +
    `<p>Football and basketball. Make a board, text the link, and watch the squares fill up. Scores and winners land live.</p>` +
    `<p><a href="/new">Make a board</a> · <a href="/how-to-play-football-squares">How to play squares</a></p>` +
    `<p class="fine">Friends join from a link, no account needed. Free to set up and invite.</p>` +
    `<h2>How it works</h2><ol>` +
    `<li><strong>Make a board.</strong> Sign in with Google or Apple, pick an NFL, college football, NBA, WNBA or college basketball game (or type in any two teams), and choose when squares win: every quarter, halftime, the final or every score.</li>` +
    `<li><strong>Text one link.</strong> Friends open it in their phone's browser and tap their squares. Players never need an app or an account.</li>` +
    `<li><strong>Draw the numbers.</strong> Once the board is full, Jax shuffles the digits 0 to 9 across the top and down the side, live on every phone.</li>` +
    `<li><strong>Watch it live.</strong> Scores fill in on their own, and the winning square lights up for everyone the moment each quarter ends.</li>` +
    `</ol>` +
    `<h2>Squares guides</h2><ul>${guides}</ul>` +
    `<h2>Good to know</h2><ul>` +
    `<li>Free to set up and invite, and players never pay to join or pick squares.</li>` +
    `<li>${MONEY_NOTICE}</li>` +
    `<li>${AFFILIATION}</li>` +
    `</ul>` +
    `<p class="fine"><a href="/support">Support</a> · <a href="/terms">Terms</a> · <a href="/privacy">Privacy</a> · <a href="${SOCIAL.instagram}" rel="me">Instagram</a></p>` +
    `</main></div>`
  );
}

/** Swap a pattern that must be in the shell; a missing one breaks the build instead of shipping a half-done homepage. */
function swap(html: string, pattern: RegExp, replacement: string, what: string): string {
  if (!pattern.test(html)) throw new Error(`home: index.html has no ${what}`);
  return html.replace(pattern, replacement);
}

const metaContent = (attr: "name" | "property", key: string) => new RegExp(`(<meta\\s+${attr}="${key}"\\s+content=")[^"]*(")`);

/** home.html from the built index.html. */
export function renderHome(indexHtml: string, pages: readonly LandingPage[]): string {
  let html = indexHtml;
  html = swap(html, /<title>[^<]*<\/title>/, `<title>${esc(HOME_TITLE)}</title>`, "<title>");
  html = swap(html, metaContent("name", "description"), `$1${esc(HOME_DESCRIPTION)}$2`, "description");
  html = swap(html, metaContent("property", "og:title"), `$1${esc(HOME_SHARE_TITLE)}$2`, "og:title");
  html = swap(html, metaContent("property", "og:description"), `$1${esc(HOME_DESCRIPTION)}$2`, "og:description");
  html = swap(html, metaContent("name", "twitter:title"), `$1${esc(HOME_SHARE_TITLE)}$2`, "twitter:title");
  html = swap(html, metaContent("name", "twitter:description"), `$1${esc(HOME_DESCRIPTION)}$2`, "twitter:description");
  const head = [`<link rel="canonical" href="${ORIGIN}/">`, `<style>${PRERENDER_CSS}</style>`, ...homeStructuredData().map(ldScript)];
  html = swap(html, /<\/head>/, `${head.join("\n")}\n</head>`, "</head>");
  html = swap(html, /<div id="root"><\/div>/, `<div id="root">${homeContent(pages)}</div>`, `<div id="root">`);
  return html;
}
