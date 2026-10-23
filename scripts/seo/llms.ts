// /llms.txt and /llms-full.txt (llmstxt.org): what JaxSquares is and where
// each guide lives, in plain Markdown, for AI assistants that read a site
// rather than render it. llms-full.txt carries every guide's full text, built
// from the same copy as the pages (content.ts), so the two never drift. Pure.

import { HOME_DESCRIPTION } from "./home.ts";
import type { LandingPage, RenderContext } from "./render.ts";
import { LANDING_SLUGS, ORIGIN, SITE_NAME, SOCIAL, pageUrl } from "./site.ts";

const FACTS = [
  "Squares for football (NFL, college), basketball (NBA, WNBA, men's and women's college) and soccer (MLS, NWSL, the Premier League, LaLiga, Liga MX, the Champions League), or any two teams typed in.",
  "On a soccer board every square is a minute of the match, and each goal's minute wins.",
  "The host signs in with Google or Apple, makes a board and texts one link; friends open it in any phone browser and tap their squares. Players never need an app or an account.",
  "Once the board is full, the digits 0 to 9 are drawn at random across the top and down the side, live on every phone.",
  "Boards linked to a real game get live scores automatically; the winning square lights up at each quarter, halftime, the final, or every score.",
  "Free to set up and invite, and players never pay to join or pick squares.",
  "JaxSquares never collects, holds or sends money between players. A square price or prize a host shows is information only.",
  "Not affiliated with or endorsed by any league or team.",
];

const ENTITIES: Record<string, string> = { "&amp;": "&", "&lt;": "<", "&gt;": ">", "&quot;": '"', "&#39;": "'", "&nbsp;": " " };

/** The page's copy as Markdown-ish text: headings, paragraphs, list items and table rows. */
export function htmlToText(html: string): string {
  return html
    .replace(/<(svg|script|style|figure)\b[\s\S]*?<\/\1>/g, "")
    .replace(/<h3[^>]*>/g, "\n\n### ")
    .replace(/<caption[^>]*>/g, "\n\n")
    .replace(/<li[^>]*>/g, "\n- ")
    .replace(/<tr[^>]*>/g, "\n")
    .replace(/<\/t[hd]>\s*<t[hd][^>]*>/g, " | ")
    .replace(/<\/(p|ul|ol|div|table|h3|dl)>/g, "\n\n")
    .replace(/<\/dt>/g, ": ")
    .replace(/<a\s[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/g, (_m, href: string, text: string) =>
      href.startsWith("/") ? `[${text}](${ORIGIN}${href})` : `[${text}](${href})`,
    )
    .replace(/<strong>([\s\S]*?)<\/strong>/g, "**$1**")
    .replace(/<[^>]+>/g, "")
    .replace(/&(?:amp|lt|gt|quot|#39|nbsp);/g, (e) => ENTITIES[e])
    .replace(/[ \t]+/g, " ")
    .replace(/ *\n */g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function ordered(pages: readonly LandingPage[]): LandingPage[] {
  return LANDING_SLUGS.map((slug) => pages.find((p) => p.slug === slug)).filter((p): p is LandingPage => !!p);
}

export function renderLlms(pages: readonly LandingPage[]): string {
  const guides = ordered(pages)
    .map((p) => `- [${p.nav}](${pageUrl(p.slug)}): ${p.blurb}`)
    .join("\n");
  return [
    `# ${SITE_NAME}`,
    "",
    `> ${HOME_DESCRIPTION}`,
    "",
    ...FACTS.map((f) => `- ${f}`),
    "",
    "## Guides",
    "",
    guides,
    "",
    "## App",
    "",
    `- [Make a board](${ORIGIN}/new): pick a game, choose when squares win, and get a link to text the group.`,
    `- [Join with a code](${ORIGIN}/): open the link a friend sent, or enter the board's code.`,
    `- [Support](${ORIGIN}/support): help with boards, invites, scores and notifications.`,
    `- [Terms](${ORIGIN}/terms) and [Privacy](${ORIGIN}/privacy)`,
    `- [Instagram](${SOCIAL.instagram})`,
    "",
    "## Optional",
    "",
    `- [Every guide in full](${ORIGIN}/llms-full.txt): the complete text of the pages above.`,
    "",
  ].join("\n");
}

export function renderLlmsFull(pages: readonly LandingPage[], ctx: RenderContext): string {
  const body = ordered(pages).map((p) => {
    const sections = p.sections.map((s) => `## ${htmlToText(s.h2)}\n\n${htmlToText(typeof s.body === "function" ? s.body(ctx) : s.body)}`);
    const faqs = p.faqs.map((f) => `### ${f.q}\n\n${f.a.trim().replace(/\s*\n\s*\n\s*/g, "\n\n")}`);
    return [
      `# ${htmlToText(p.h1)}`,
      "",
      `Source: ${pageUrl(p.slug)}`,
      "",
      htmlToText(p.lede),
      "",
      ...sections.flatMap((s) => [s, ""]),
      "## Questions people ask",
      "",
      ...faqs.flatMap((f) => [f, ""]),
    ].join("\n");
  });
  return `${renderLlms(pages)}\n---\n\n${body.join("\n---\n\n")}`;
}
