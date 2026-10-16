// JaxSquares brand art, authored as SVG. The mark is the app's LogoMark
// (src/components/ui/Logo.tsx): a 3x3 squares board in volt with the winning
// square, row 2 column 3, lit trophy gold. Everything is drawn on a 1024 canvas
// and scaled by the caller.

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
 * to 1024 and centered. The plate is the icon background.
 */
const LOGO_TILE = (7.2 / 32) * CANVAS;
const LOGO_GAP = (1.1 / 32) * CANVAS;
const LOGO_BOARD = LOGO_TILE * 3 + LOGO_GAP * 2;
const MARK: BoardGeometry = { tile: LOGO_TILE, gap: LOGO_GAP, x0: (CANVAS - LOGO_BOARD) / 2, radius: (2 / 32) * CANVAS };

/**
 * Tab-sized board snapped to whole pixels: at 16px it is 4px tiles with 1px gaps
 * and a 1px margin (64 canvas units per pixel), at 32px 8/2/2, at 48px 12/3/3.
 */
const TINY: BoardGeometry = { tile: 256, gap: 64, x0: 64, radius: 56 };

const defs = `
  <linearGradient id="jx-bg" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0" stop-color="${P.pitch850}"/><stop offset="0.7" stop-color="${P.canvas}"/>
  </linearGradient>
  <radialGradient id="jx-flood-l" cx="0.08" cy="-0.06" r="0.8">
    <stop offset="0" stop-color="#d6ff78" stop-opacity="0.1"/><stop offset="1" stop-color="#d6ff78" stop-opacity="0"/>
  </radialGradient>
  <radialGradient id="jx-flood-r" cx="0.92" cy="-0.06" r="0.8">
    <stop offset="0" stop-color="#d6ff78" stop-opacity="0.07"/><stop offset="1" stop-color="#d6ff78" stop-opacity="0"/>
  </radialGradient>
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

type TileStyle =
  /** Gradients, sheen and the gold glow: app icons, splash, link preview. */
  | "rich"
  /** Solid tokens only: favicons, where every pixel counts. */
  | "flat";

function tileRect(g: BoardGeometry, r: number, c: number): { x: number; y: number; attrs: string } {
  const x = g.x0 + c * (g.tile + g.gap);
  const y = g.x0 + r * (g.tile + g.gap);
  return { x, y, attrs: `x="${n(x)}" y="${n(y)}" width="${n(g.tile)}" height="${n(g.tile)}" rx="${n(g.radius)}"` };
}

/** The 3x3 board in canvas units: checkered volt with the winning square lit gold. */
function board(style: TileStyle, g: BoardGeometry = MARK): string {
  const lit = tileRect(g, LIT.row, LIT.col);
  // The glow sits under the tiles, so it only shows in the gaps around the lit square and past the board's edge.
  let s = style === "rich" ? `<rect ${lit.attrs} fill="${P.gold}" filter="url(#jx-glow)"/>` : "";
  let tiles = "";
  for (let r = 0; r < 3; r++) {
    for (let c = 0; c < 3; c++) {
      const { attrs } = tileRect(g, r, c);
      const isLit = r === LIT.row && c === LIT.col;
      const even = (r + c) % 2 === 0;
      if (style === "flat") {
        tiles += `<rect ${attrs} fill="${isLit ? P.gold : even ? P.volt : P.volt500}"/>`;
      } else {
        tiles += `<rect ${attrs} fill="url(#${isLit ? "jx-gold" : even ? "jx-volt-a" : "jx-volt-b"})"/><rect ${attrs} fill="url(#jx-sheen)"/>`;
      }
    }
  }
  s += style === "rich" ? `<g filter="url(#jx-lift)">${tiles}</g>` : tiles;
  return s;
}

/** The board scaled about the canvas center. */
function mark(scale: number, style: TileStyle = "rich"): string {
  const t = n(CENTER * (1 - scale));
  return `<g transform="translate(${t} ${t}) scale(${scale})">${board(style)}</g>`;
}

function svg(size: number, body: string): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${CANVAS} ${CANVAS}" width="${size}" height="${size}"><defs>${defs}</defs>${body}</svg>`;
}

/** Night pitch with the two floodlight towers the app's backdrop uses. */
const background = (radius: number) =>
  `<rect width="${CANVAS}" height="${CANVAS}" rx="${radius}" fill="url(#jx-bg)"/>` +
  `<rect width="${CANVAS}" height="${CANVAS}" rx="${radius}" fill="url(#jx-flood-l)"/>` +
  `<rect width="${CANVAS}" height="${CANVAS}" rx="${radius}" fill="url(#jx-flood-r)"/>`;

export type IconShape =
  /** Full-bleed square. iOS, Android adaptive and apple-touch-icon apply their own mask. */
  | "square"
  /** Pre-rounded with transparent corners, for browsers and desktop installs. */
  | "rounded"
  /** Full-bleed with the board inside the 80% safe circle of a PWA maskable icon. */
  | "maskable";

/** Board scale per shape. Maskable: the board's corners must sit inside a circle of radius 0.4. */
const MARK_SCALE: Record<IconShape, number> = { square: 0.9, rounded: 0.92, maskable: 0.74 };

export function iconSvg(shape: IconShape, size = CANVAS): string {
  const radius = shape === "rounded" ? CANVAS * ICON_RADIUS : 0;
  return svg(size, background(radius) + mark(MARK_SCALE[shape]));
}

/** Tab-sized icon: the same board on a dark plate, solid colors, snapped to whole pixels at 16/32/48px. */
export function faviconSvg(size = 32): string {
  return svg(size, `<rect width="${CANVAS}" height="${CANVAS}" rx="${CANVAS * 0.19}" fill="${P.canvas}"/>` + board("flat", TINY));
}

/** The board alone on transparent (Android adaptive foreground, in-app use). */
export function markSvg(size = CANVAS): string {
  return svg(size, mark(1));
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
 * Launch image: the board centered on the app's own canvas, so the hand-off to
 * the web view (same background) is seamless. The edges are flat canvas color
 * because iOS crops this square to the screen's aspect.
 */
export function splashSvg(size = 2732): string {
  const S = 2732;
  const markSize = 500;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${S} ${S}" width="${size}" height="${size}">
  <defs>
    <radialGradient id="s-halo" cx="0.5" cy="0.5" r="0.3"><stop offset="0" stop-color="#d6ff78" stop-opacity="0.09"/><stop offset="1" stop-color="#d6ff78" stop-opacity="0"/></radialGradient>
  </defs>
  <rect width="${S}" height="${S}" fill="${P.canvas}"/>
  <rect width="${S}" height="${S}" fill="url(#s-halo)"/>
  <g transform="translate(${(S - markSize) / 2} ${(S - markSize) / 2})">${markSvg(markSize)}</g>
</svg>`;
}
