// Brand constants baked into every render. Colors are the app's own tokens
// (src/index.css, "Under the lights"); change copy here and re-render.
export const BRAND = {
  name: "JaxSquares",
  handle: "@jaxsquares",
  url: "jaxsquares.com",
  cta: "Link in bio",
  taglines: ["No app needed", "Free to set up", "Just for fun"],
} as const;

/** Output sizes in device pixels. The stage renders at 1/SCALE in CSS px. */
export const SCALE = 3;
export const REEL = { width: 1080, height: 1920 } as const;
/** Feed posts / carousels: Instagram's profile grid shows 3:4 tiles (since Jan 2025). */
export const PORTRAIT = { width: 1080, height: 1440 } as const;

/**
 * Instagram Reels overlays its UI on the top, bottom and right edges. Key text
 * stays inside these insets (CSS px on the 360×640 stage).
 */
export const REEL_SAFE = { top: 84, bottom: 150, left: 22, right: 48 } as const;

export const COLORS = {
  canvas: "#060c09",
  surface: "#0c1410",
  surface2: "#111a15",
  surface3: "#16211b",
  surface4: "#223029",
  ink: "#f3f7f1",
  muted: "#a3b8ab",
  subtle: "#768d7f",
  volt: "#c6f91f",
  voltLight: "#d5ff52",
  voltDeep: "#aee000",
  gold: "#ffc233",
  goldLight: "#ffd56b",
  flare: "#ff66a6",
  live: "#ff4040",
  sky: "#3ab7ff",
  line: "rgba(255,255,255,0.08)",
  lineStrong: "rgba(255,255,255,0.15)",
} as const;

export const FONTS = {
  display: '"Bricolage Grotesque Variable", "Figtree Variable", system-ui, sans-serif',
  body: '"Figtree Variable", system-ui, sans-serif',
} as const;
