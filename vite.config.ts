/// <reference types="vitest/config" />
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { cloudflare } from "@cloudflare/vite-plugin";

// The Cloudflare plugin spins up a Workers runtime for dev/build. It is not
// needed (and slows things down) for the jsdom unit tests, so we skip it there.
const isTest = process.env.VITEST === "true";

export default defineConfig({
  plugins: [react(), tailwindcss(), ...(isTest ? [] : [cloudflare()])],
  test: {
    globals: true,
    environment: "jsdom",
    setupFiles: ["./src/test/setup.ts"],
    exclude: ["**/node_modules/**", "**/dist/**", "**/.wrangler/**"],
  },
});
