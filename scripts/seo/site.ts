// Shared facts for the static landing pages and printables: where the site
// lives, which pages exist, the screenshots and fonts they use, and the words
// they must never contain. Pure data (no IO), so the build, the asset scripts
// and the tests all read the same lists.

export const ORIGIN = "https://jaxsquares.com";
export const SITE_NAME = "JaxSquares";

/** Official profiles: the Organization's `sameAs` in the JSON-LD, and the footers. */
export const SOCIAL = { instagram: "https://www.instagram.com/jaxsquares/" } as const;

/**
 * IndexNow (Bing, Yandex, Seznam, Naver; docs/seo.md): the key published at
 * /<key>.txt that proves the pings scripts/seo/indexnow.ts sends are ours. Not
 * a secret: it only lets a ping name pages on this host.
 */
export const INDEXNOW_KEY = "acc73a4283b98ee0f1ea69ca96071507";

/** Every landing page, in nav order. The hub comes first. */
export const LANDING_SLUGS = [
  "football-squares",
  "big-game-squares",
  "nfl-squares",
  "college-football-squares",
  "basketball-squares",
  "march-madness-squares",
  "printable-football-squares",
  "how-to-play-football-squares",
  "best-football-squares-numbers",
] as const;
export type LandingSlug = (typeof LANDING_SLUGS)[number];

export const HUB: LandingSlug = "football-squares";

/**
 * First path segments the SPA owns (src/App.tsx). A landing page must never
 * shadow one: the asset server answers a matching file before the SPA fallback.
 */
export const SPA_SEGMENTS = ["", "new", "g", "me", "privacy", "terms", "support", "kit"] as const;

/** App pages listed in the sitemap next to the landing pages. */
export const APP_PAGES = ["/", "/terms", "/privacy", "/support"] as const;

/**
 * The homepage: the SPA shell with the homepage's own head and a static
 * version of the welcome screen in #root, for crawlers that don't run
 * JavaScript. The Worker serves it at "/" (and sends /home there).
 */
export const HOME_FILE = "home.html";

/**
 * Every sitemap URL's content hash and the day it last changed. build.ts
 * publishes it; the next deploy's build compares against the live copy, so
 * an unchanged page keeps its lastmod and only changed pages get an IndexNow ping.
 */
export const MANIFEST_PATH = "/seo/pages.json";
export interface PageManifest {
  pages: Record<string, { hash: string; lastmod: string }>;
}

/**
 * Betting vocabulary the product never uses (CLAUDE.md "Product rules"), with
 * the usual inflections. Matched on word boundaries, so "spot" or "better" are fine.
 */
export const BANNED_WORDS =
  /\b(?:bets?|betting|bettors?|wager\w*|pots?|payouts?|pay-outs?|buy[\s-]?ins?|jackpots?|odds|stakes?|gambl\w*)\b/i;

/**
 * The football championship's trademarked name: the pages say "the big game".
 * (The old /super-bowl-squares address redirects to /big-game-squares: worker/index.ts.)
 */
export const TRADEMARKED_EVENT = /super[\s-]?bowl/i;

/** A currency amount ("$5", "€10", "20 USD"). Landing pages never quote one: amounts are the host's to show in the app. */
export const CURRENCY_AMOUNT = /[$€£]\s?\d|\d\s?(?:usd|dollars?|bucks)\b/i;

/** App Store screenshots (docs/app-store/screenshots/6.5), resized to WebP by scripts/seo/images.ts. */
export const SHOT_SOURCE_DIR = "docs/app-store/screenshots/6.5";
export const SHOT_SIZE = { width: 480, height: 1039 } as const;

export interface Shot {
  /** Source PNG in SHOT_SOURCE_DIR. */
  from: string;
  /** Published path. */
  src: string;
  alt: string;
  caption: string;
}

export const SHOTS = {
  make: {
    from: "01-make-a-board.png",
    src: "/seo/shots/make-a-board.webp",
    alt: "The New board screen in JaxSquares: this week's games to link, and a choice of every quarter, halftime and final, final score or every score.",
    caption: "Pick the game and how squares win.",
  },
  invite: {
    from: "02-text-the-link.png",
    src: "/seo/shots/text-the-link.webp",
    alt: "The invite sheet, with the message and link preview friends get in the group chat and a button for a QR code.",
    caption: "Text one link. No download.",
  },
  pick: {
    from: "03-tap-a-square.png",
    src: "/seo/shots/tap-a-square.webp",
    alt: "A 10 by 10 squares board filling up, each claimed square showing a friend's color and emoji.",
    caption: "Friends tap their squares.",
  },
  draw: {
    from: "04-numbers-drawn-live.png",
    src: "/seo/shots/numbers-drawn.webp",
    alt: "The numbers-drawn moment: digits 0 to 9 shuffled across the top and down the side of the board.",
    caption: "Numbers land on every phone.",
  },
  winning: {
    from: "05-whos-winning.png",
    src: "/seo/shots/whos-winning.webp",
    alt: "A live board at halftime with the score, the winning square lit gold and who wins if the next score lands.",
    caption: "Every score lights up a square.",
  },
  home: {
    from: "06-every-board.png",
    src: "/seo/shots/every-board.webp",
    alt: "The Home screen with live boards, boards that need the host and finished boards with their winners.",
    caption: "All your boards on one screen.",
  },
  pinged: {
    from: "07-get-pinged.png",
    src: "/seo/shots/get-pinged.webp",
    alt: "A notification that a square hit at halftime, above the activity inbox listing wins and friends joining.",
    caption: "Get pinged when your square hits.",
  },
} as const satisfies Record<string, Shot>;
export type ShotKey = keyof typeof SHOTS;

/** Self-hosted fonts, copied from @fontsource-variable at build (the app's own files). */
export const FONTS = [
  {
    family: "Figtree Variable",
    weight: "300 900",
    from: "@fontsource-variable/figtree/files/figtree-latin-wght-normal.woff2",
    href: "/seo/fonts/figtree.woff2",
  },
  {
    family: "Bricolage Grotesque Variable",
    weight: "200 800",
    from: "@fontsource-variable/bricolage-grotesque/files/bricolage-grotesque-latin-opsz-normal.woff2",
    href: "/seo/fonts/bricolage-grotesque.woff2",
  },
] as const;

/** The data page's table as a download (scripts/seo/build.ts writes it from scripts/seo/data/nflFinals.ts). */
export const FINALS_CSV = "/seo/data/nfl-final-score-squares.csv";

/** Where a printed sheet's QR code sends people. */
export const PRINT_QR_URL = `${ORIGIN}/new`;
export const PRINT_QR_LABEL = "jaxsquares.com/new";

export interface Printable {
  id: string;
  /** The game the sheet is for: the football printables page lists the football ones, the basketball page its own. */
  sport: "football" | "basketball";
  /** Published PDF path. */
  href: string;
  /** Preview image (first page) published next to the pages. */
  thumb: string;
  /** The preview image's pixel size (the sheet's aspect). */
  thumbSize: { width: number; height: number };
  name: string;
  paper: string;
  blurb: string;
}

export const PRINTABLES = [
  {
    id: "board-10x10-letter",
    sport: "football",
    href: "/printables/football-squares-10x10-letter.pdf",
    thumb: "/seo/printables/football-squares-10x10-letter.webp",
    thumbSize: { width: 560, height: 433 },
    name: "10×10 squares board",
    paper: "US Letter, landscape",
    blurb: "The classic 100-square board, sized for 8.5 × 11 paper.",
  },
  {
    id: "board-10x10-a4",
    sport: "football",
    href: "/printables/football-squares-10x10-a4.pdf",
    thumb: "/seo/printables/football-squares-10x10-a4.webp",
    thumbSize: { width: 560, height: 396 },
    name: "10×10 squares board",
    paper: "A4, landscape",
    blurb: "The same 100-square board, for A4 paper.",
  },
  {
    id: "board-5x5",
    sport: "football",
    href: "/printables/football-squares-5x5.pdf",
    thumb: "/seo/printables/football-squares-5x5.webp",
    thumbSize: { width: 560, height: 433 },
    name: "5×5 squares board",
    paper: "US Letter, landscape",
    blurb: "25 big squares with two number boxes per row and column, for smaller groups.",
  },
  {
    id: "prize-sheet",
    sport: "football",
    href: "/printables/football-squares-prize-sheet.pdf",
    thumb: "/seo/printables/football-squares-prize-sheet.webp",
    thumbSize: { width: 335, height: 433 },
    name: "Quarters prize sheet",
    paper: "US Letter, portrait",
    blurb: "Track the score and the winner at Q1, halftime, Q3 and the final, with lines for your notes.",
  },
  {
    id: "basketball-10x10-letter",
    sport: "basketball",
    href: "/printables/basketball-squares-10x10-letter.pdf",
    thumb: "/seo/printables/basketball-squares-10x10-letter.webp",
    thumbSize: { width: 560, height: 433 },
    name: "Basketball squares board",
    paper: "US Letter, landscape",
    blurb: "A 100-square board with winner lines for each quarter, halftime and the final.",
  },
] as const satisfies readonly Printable[];

export const pageUrl = (slug: string) => `${ORIGIN}/${slug}`;
