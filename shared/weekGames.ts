// "This week's games" on the NFL, college football and basketball landing
// pages. The static page (scripts/seo/content.ts) carries an evergreen
// fallback between two markers; the Worker (worker/weekGames.ts) swaps in the
// real games from the schedule, so the page names this week's matchups for
// search engines and AI crawlers that never run JavaScript.
//
// Type imports only: the SEO build runs this file in Node as is.

import type { LinkedLeague } from "./sports";

/** The landing pages that list games, and the leagues each one shows, in order. */
export const WEEK_PAGES = {
  "nfl-squares": ["nfl"],
  "college-football-squares": ["ncaaf"],
  "basketball-squares": ["nba", "ncaab", "wnba", "ncaaw"],
} as const satisfies Record<string, readonly LinkedLeague[]>;
export type WeekPage = keyof typeof WEEK_PAGES;

export const WEEK_START = "<!--week-games-->";
export const WEEK_END = "<!--/week-games-->";
export const WEEK_ID = "week-games";

export function isWeekPage(slug: string): slug is WeekPage {
  return Object.prototype.hasOwnProperty.call(WEEK_PAGES, slug);
}

/** The slot the build writes: the fallback HTML between the markers. */
export function weekSlot(fallbackHtml: string): string {
  return `<div class="week" id="${WEEK_ID}">${WEEK_START}${fallbackHtml}${WEEK_END}</div>`;
}

/** The page with the list in place of the fallback, or null when the page has no slot. */
export function injectWeek(html: string, listHtml: string): string | null {
  const start = html.indexOf(WEEK_START);
  const end = html.indexOf(WEEK_END, start);
  if (start < 0 || end < 0) return null;
  return html.slice(0, start + WEEK_START.length) + listHtml + html.slice(end);
}
