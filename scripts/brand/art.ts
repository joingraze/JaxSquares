// JaxSquares brand art, authored as SVG. The app icon is Jax's face (the "face"
// pose of src/components/ui/Jax.tsx) over a dark 3x3 squares board whose top
// right square is lit trophy gold. The mark is the app's LogoMark
// (src/components/ui/Logo.tsx): the same board in volt with the winning square,
// row 2 column 3, lit gold; the favicon, badge and Android foreground use it.
// Everything is drawn on a 1024 canvas and scaled by the caller.

/** Hues from src/index.css ("Under the lights"). */
export const palette = {
  /** pitch-950 / --color-canvas: the app background. */
  canvas: "#060c09",
  pitch900: "#0c1410",
  pitch850: "#111a15",
  pitch800: "#16211b",
  pitch750: "#1b281f",
  /** surface-4: LogoMark's plate. */
  pitch700: "#223029",
  volt300: "#d5ff52",
  /** brand-400: the lighter board tile and every primary action. */
  volt: "#c6f91f",
  /** brand-500: the darker board tile. */
  volt500: "#aee000",
  volt600: "#88b300",
  gold200: "#ffe7a3",
  gold300: "#ffd56b",
  /** gold-400: the lit winning square. */
  gold: "#ffc233",
  gold500: "#ffab0f",
  gold600: "#e08a00",
  ink: "#f3f7f1",
  inkMuted: "#a3b8ab",
  inkSubtle: "#6c8375",
  teamX: "#3ab7ff",
  teamY: "#ff66a6",
  live: "#ff4040",
} as const;

const P = palette;
const CANVAS = 1024;
const CENTER = CANVAS / 2;
/** iOS-style corner radius for icons we round ourselves (PWA "any", desktop installs). */
export const ICON_RADIUS = 0.2237;
/** The winning square, as in LogoMark. */
export const LIT = { row: 1, col: 2 } as const;

const n = (v: number) => Number(v.toFixed(2));

interface BoardGeometry {
  tile: number;
  gap: number;
  /** Left/top edge of the first tile. */
  x0: number;
  radius: number;
}

/**
 * LogoMark's geometry on its 32-unit viewBox (7.2 tiles, 8.3 pitch, rx 2), scaled
 * to 1024 and centered.
 */
const LOGO_TILE = (7.2 / 32) * CANVAS;
const LOGO_GAP = (1.1 / 32) * CANVAS;
const LOGO_BOARD = LOGO_TILE * 3 + LOGO_GAP * 2;
const MARK: BoardGeometry = { tile: LOGO_TILE, gap: LOGO_GAP, x0: (CANVAS - LOGO_BOARD) / 2, radius: (2 / 32) * CANVAS };

const defs = `
  <linearGradient id="jx-volt-a" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0" stop-color="${P.volt300}"/><stop offset="0.55" stop-color="${P.volt}"/><stop offset="1" stop-color="#b9ec12"/>
  </linearGradient>
  <linearGradient id="jx-volt-b" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0" stop-color="#bdee0c"/><stop offset="0.55" stop-color="${P.volt500}"/><stop offset="1" stop-color="#9fcf00"/>
  </linearGradient>
  <linearGradient id="jx-gold" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0" stop-color="#ffdc7a"/><stop offset="0.5" stop-color="${P.gold}"/><stop offset="1" stop-color="#ffb41f"/>
  </linearGradient>
  <linearGradient id="jx-sheen" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0" stop-color="#fff" stop-opacity="0.38"/><stop offset="0.07" stop-color="#fff" stop-opacity="0.1"/><stop offset="0.2" stop-color="#fff" stop-opacity="0"/>
  </linearGradient>
  <filter id="jx-glow" x="-100%" y="-100%" width="300%" height="300%">
    <feGaussianBlur stdDeviation="30"/>
  </filter>
  <filter id="jx-lift" x="-20%" y="-20%" width="140%" height="140%">
    <feDropShadow dx="0" dy="16" stdDeviation="18" flood-color="#000" flood-opacity="0.55"/>
  </filter>`;

function tileRect(g: BoardGeometry, r: number, c: number): { x: number; y: number; attrs: string } {
  const x = g.x0 + c * (g.tile + g.gap);
  const y = g.x0 + r * (g.tile + g.gap);
  return { x, y, attrs: `x="${n(x)}" y="${n(y)}" width="${n(g.tile)}" height="${n(g.tile)}" rx="${n(g.radius)}"` };
}

/** The 3x3 board in canvas units: checkered volt with the winning square lit gold. */
function board(g: BoardGeometry = MARK): string {
  const lit = tileRect(g, LIT.row, LIT.col);
  // The glow sits under the tiles, so it only shows in the gaps around the lit square and past the board's edge.
  let s = `<rect ${lit.attrs} fill="${P.gold}" filter="url(#jx-glow)"/>`;
  let tiles = "";
  for (let r = 0; r < 3; r++) {
    for (let c = 0; c < 3; c++) {
      const { attrs } = tileRect(g, r, c);
      const isLit = r === LIT.row && c === LIT.col;
      const even = (r + c) % 2 === 0;
      tiles += `<rect ${attrs} fill="url(#${isLit ? "jx-gold" : even ? "jx-volt-a" : "jx-volt-b"})"/><rect ${attrs} fill="url(#jx-sheen)"/>`;
    }
  }
  s += `<g filter="url(#jx-lift)">${tiles}</g>`;
  return s;
}

/** The board scaled about the canvas center. */
function mark(scale: number): string {
  const t = n(CENTER * (1 - scale));
  return `<g transform="translate(${t} ${t}) scale(${scale})">${board()}</g>`;
}

function svg(size: number, body: string): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${CANVAS} ${CANVAS}" width="${size}" height="${size}"><defs>${defs}</defs>${body}</svg>`;
}

export type IconShape =
  /** Full-bleed square. iOS, Android adaptive and apple-touch-icon apply their own mask. */
  | "square"
  /** Pre-rounded with transparent corners, for browsers and desktop installs. */
  | "rounded"
  /** Full-bleed with Jax and the lit square inside the 80% safe circle of a PWA maskable icon. */
  | "maskable";

/** Jax's face as drawn by Jax.tsx ("face" pose), 76 wide and 56 tall around 0,0. Fur colors are his. */
const JAX_FACE = (() => {
  const ear =
    `<path d="M-16-21c-10-3-19 4-20 15-1 10 1 18-1 28 2 3 5 3 6 0 2 3 5 3 7 0 2 2 5 2 6-1-1-8-2-18-1-28 1-6 2-10 3-14z" fill="#d98b3d"/>` +
    `<path d="M-25-9c-2 9-2 19-1 27-2-7-3-18 1-27z" fill="#bd7130"/>`;
  return (
    `<g>${ear}</g><g transform="scale(-1 1)">${ear}</g>` +
    `<path d="M-24-2c0-16 12-24 24-24s24 8 24 24c0 14-10 24-24 24S-24 12-24-2z" fill="#f0bf78"/>` +
    `<path d="M-3-25c2-1 4-1 6 0 1 9 3 17 6 25H-9c3-8 5-16 6-25z" fill="#fff5e4"/>` +
    `<ellipse cx="0" cy="9" rx="13" ry="10" fill="#fff5e4"/>` +
    `<ellipse cx="-10" cy="-4" rx="5" ry="5.4" fill="#5a3418"/><ellipse cx="10" cy="-4" rx="5" ry="5.4" fill="#5a3418"/>` +
    `<ellipse cx="-10" cy="-4" rx="4.2" ry="4.6" fill="#1e130c"/><ellipse cx="10" cy="-4" rx="4.2" ry="4.6" fill="#1e130c"/>` +
    `<circle cx="-11.4" cy="-5.6" r="1.4" fill="#fff"/><circle cx="8.6" cy="-5.6" r="1.4" fill="#fff"/>` +
    `<path d="M0 8v3M-6 12c2 2 4 2 6-1 2 3 4 3 6 1" stroke="#6e3f1e" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round" fill="none"/>` +
    `<path d="M-5 3c0-3 10-3 10 0 0 3-3 5-5 5s-5-2-5-5z" fill="#1e130c"/>`
  );
})();

/**
 * Jax's face centered on cx,cy at the given width. A transform rather than a
 * nested <svg>, so page CSS that sizes svg elements (the link preview's) can't
 * stretch it.
 */
const jaxFace = (cx: number, cy: number, width: number) => `<g transform="translate(${n(cx)} ${n(cy)}) scale(${n(width / 76)})">${JAX_FACE}</g>`;

/** The icon's board: dark tiles on a 76 margin with a 34 gap, the top right one lit. */
const ICON_BOARD: BoardGeometry = { tile: 268, gap: 34, x0: 76, radius: 54 };
/** The icon's lit square: top right, so it shows above Jax's ear. */
const ICON_LIT = { row: 0, col: 2 } as const;

/** The board's tiles, the gold glow and Jax, on the full canvas (the backdrop is separate). */
function jaxBoard(): string {
  let s = "";
  for (let r = 0; r < 3; r++) {
    for (let c = 0; c < 3; c++) {
      const { attrs } = tileRect(ICON_BOARD, r, c);
      if (r === ICON_LIT.row && c === ICON_LIT.col) s += `<rect ${attrs} fill="${P.gold}"/>`;
      else s += `<rect ${attrs} fill="${(r + c) % 2 === 0 ? P.pitch800 : P.pitch750}" stroke="#fff" stroke-opacity="0.06" stroke-width="4"/>`;
    }
  }
  s += `<rect width="${CANVAS}" height="${CANVAS}" fill="url(#jx-icon-glow)"/>`;
  s += jaxFace(CENTER, 570, 820);
  return s;
}

const iconDefs = `
  <linearGradient id="jx-icon-bg" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0" stop-color="${P.pitch850}"/><stop offset="1" stop-color="${P.canvas}"/>
  </linearGradient>
  <radialGradient id="jx-icon-glow" cx="0.5" cy="0.58" r="0.42">
    <stop offset="0" stop-color="${P.gold}" stop-opacity="0.28"/><stop offset="1" stop-color="${P.gold}" stop-opacity="0"/>
  </radialGradient>`;

/**
 * Scale per shape. Maskable: the lit square and Jax's ears must sit inside a
 * circle of radius 0.4, so the composition shrinks onto a full-bleed backdrop.
 */
const ICON_SCALE: Record<IconShape, number> = { square: 1, rounded: 1, maskable: 0.7 };

export function iconSvg(shape: IconShape, size = CANVAS): string {
  const scale = ICON_SCALE[shape];
  const t = n(CENTER * (1 - scale));
  const art = scale === 1 ? jaxBoard() : `<g transform="translate(${t} ${t}) scale(${scale})">${jaxBoard()}</g>`;
  let body = `<rect width="${CANVAS}" height="${CANVAS}" fill="url(#jx-icon-bg)"/>${art}`;
  if (shape === "rounded") {
    body = `<clipPath id="jx-icon-round"><rect width="${CANVAS}" height="${CANVAS}" rx="${n(CANVAS * ICON_RADIUS)}"/></clipPath><g clip-path="url(#jx-icon-round)">${body}</g>`;
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${CANVAS} ${CANVAS}" width="${size}" height="${size}"><defs>${iconDefs}</defs>${body}</svg>`;
}

/** Tab-sized icon: Jax's face filling a dark plate with the lit square behind his ear (reads at 16px). */
export function faviconSvg(size = 32): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${CANVAS} ${CANVAS}" width="${size}" height="${size}">` +
    `<rect width="${CANVAS}" height="${CANVAS}" rx="${CANVAS * 0.19}" fill="${P.pitch800}"/>` +
    `<rect x="640" y="64" width="320" height="320" rx="72" fill="${P.gold}"/>` +
    `${jaxFace(CENTER, 573, CANVAS)}</svg>`;
}

/** The LogoMark board alone on transparent. */
export function markSvg(size = CANVAS): string {
  return svg(size, mark(1));
}

/** The app icon's art (board and Jax) on transparent: the Android adaptive foreground. */
export function iconArtSvg(size = CANVAS): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${CANVAS} ${CANVAS}" width="${size}" height="${size}"><defs>${iconDefs}</defs>${jaxBoard()}</svg>`;
}

/**
 * Monochrome notification badge (Android status bar, web push badge). Android
 * keeps only the alpha channel, so the lit square is the one at full strength.
 */
export function badgeSvg(size = 96): string {
  const g: BoardGeometry = { tile: 256, gap: 64, x0: 64, radius: 60 };
  let tiles = "";
  for (let r = 0; r < 3; r++) {
    for (let c = 0; c < 3; c++) {
      const { attrs } = tileRect(g, r, c);
      const isLit = r === LIT.row && c === LIT.col;
      tiles += `<rect ${attrs} fill="#fff" opacity="${isLit ? 1 : 0.5}"/>`;
    }
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${CANVAS} ${CANVAS}" width="${size}" height="${size}">${tiles}</svg>`;
}

/**
 * Launch image: the app icon centered on the app's own canvas, so it picks up
 * where the tapped icon left off and hands off to the web view (same
 * background). The edges are flat canvas color because iOS crops this square to
 * the screen's aspect.
 */
export function splashSvg(size = 2732): string {
  const S = 2732;
  const markSize = 560;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${S} ${S}" width="${size}" height="${size}">
  <defs>
    <radialGradient id="s-halo" cx="0.5" cy="0.5" r="0.3"><stop offset="0" stop-color="${P.gold}" stop-opacity="0.08"/><stop offset="1" stop-color="${P.gold}" stop-opacity="0"/></radialGradient>
  </defs>
  <rect width="${S}" height="${S}" fill="${P.canvas}"/>
  <rect width="${S}" height="${S}" fill="url(#s-halo)"/>
  <g transform="translate(${(S - markSize) / 2} ${(S - markSize) / 2})">${iconSvg("rounded", markSize)}</g>
</svg>`;
}
