import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const here = fileURLToPath(new URL(".", import.meta.url));
const repo = fileURLToPath(new URL("../..", import.meta.url));
const APP_CSS = "virtual:app.css";

/**
 * The studio renders with the app's own design system: this serves
 * src/index.css (tokens, fonts, base styles) re-pointed at the studio's and the
 * app components' sources. The app's copy excludes marketing/ so studio
 * classes never land in the production bundle.
 */
function appCss(): Plugin {
  // A real-looking .css path so the CSS pipeline (and Tailwind) picks it up.
  const resolved = `${here}__app.css`;
  return {
    name: "jaxsquares-app-css",
    resolveId: (id) => (id === APP_CSS ? resolved : null),
    load(id) {
      if (id !== resolved) return null;
      const css = readFileSync(`${repo}src/index.css`, "utf8")
        .replace('@import "tailwindcss";', `@import "tailwindcss" source(none);\n@source "${here}";\n@source "${repo}src";`)
        .replace(/^@source not .*$/m, "");
      this.addWatchFile(`${repo}src/index.css`);
      return css;
    },
  };
}

// Standalone Vite app that renders the marketing videos from the app's own
// components and from real-app clips (marketing/capture/record.mjs).
export default defineConfig({
  root: here,
  // Serves marketing/out, so clips are at /clips/<scene>/00001.jpg.
  publicDir: fileURLToPath(new URL("../out", import.meta.url)),
  plugins: [appCss(), react(), tailwindcss()],
  server: { port: 5199, fs: { allow: [repo] } },
  logLevel: "warn",
});
