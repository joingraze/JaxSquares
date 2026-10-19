// Brand constants baked into every render. Change these and re-render.
export const BRAND = {
  name: "JaxSquares",
  handle: "@jaxsquares",
  cta: "Link in bio",
  taglines: ["Free", "No app", "No signup"],
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
  pitch950: "#060a16",
  pitch900: "#0b1120",
  pitch800: "#131c30",
  pitch700: "#1e2a44",
  brand: "#22c55e",
  brandLight: "#4ade80",
  accent: "#38bdf8",
  gold: "#fbbf24",
  goldDeep: "#f59e0b",
  rose: "#fb7185",
  text: "#e6edf6",
  muted: "#94a3b8",
} as const;
