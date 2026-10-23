// The board's two big-screen / paper views, by path: /g/:id/tv (a TV or laptop
// at a watch party) and /g/:id/print (a printable board for the office).
// Same board link with a suffix, so the Worker's /g/* handling (link preview +
// the board's state on the page) and universal links cover them too.

export type BoardView = "tv" | "print";

/** "/g/k7m2px/tv", "/g/k7m2px/print". */
export function boardViewPath(gameId: string, view: BoardView): string {
  return `/g/${encodeURIComponent(gameId)}/${view}`;
}

/**
 * A board's TV or print view, or a club's TV (/club/:clubId/tv): the shell
 * lays these out full width, without the phone column or route slide.
 */
export function isBoardViewPath(pathname: string): boolean {
  return /^\/g\/[^/]+\/(tv|print)\/?$/i.test(pathname) || isClubTvPath(pathname) || isTvPairPath(pathname);
}

/** A smart TV pairing with a board by code, /tv (src/pages/TvPair.tsx): full screen, TV mode's own theme. */
export function isTvPairPath(pathname: string): boolean {
  return /^\/tv\/?$/i.test(pathname);
}

/** "jaxsquares.com/tv": where a smart TV's browser goes for its code, on the app's public origin (PUBLIC_ORIGIN). */
export function tvPairAddress(origin: string): string {
  return `${new URL(origin).host}/tv`;
}

/** An Annual Pass + Venue holder's TV, /club/:clubId/tv (src/pages/ClubTvView.tsx): TV mode's own theme, like /g/:id/tv. */
export function isClubTvPath(pathname: string): boolean {
  return /^\/club\/[^/]+\/tv\/?$/i.test(pathname);
}
