// The board's two big-screen / paper views, by path: /g/:id/tv (a TV or laptop
// at a watch party) and /g/:id/print (a printable board for the office).
// Same board link with a suffix, so the Worker's /g/* handling (link preview +
// the board's state on the page) and universal links cover them too.

export type BoardView = "tv" | "print";

/** "/g/k7m2px/tv", "/g/k7m2px/print". */
export function boardViewPath(gameId: string, view: BoardView): string {
  return `/g/${encodeURIComponent(gameId)}/${view}`;
}

/** A board's TV or print view: the shell lays these out full width, without the phone column or route slide. */
export function isBoardViewPath(pathname: string): boolean {
  return /^\/g\/[^/]+\/(tv|print)\/?$/i.test(pathname);
}
