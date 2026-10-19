import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { fileURLToPath } from "node:url";

// Standalone Vite app that renders the marketing videos. It reuses the product's
// components and theme from ../../src but needs none of the Cloudflare tooling.
export default defineConfig({
  root: fileURLToPath(new URL(".", import.meta.url)),
  plugins: [react(), tailwindcss()],
  server: { port: 5199 },
  logLevel: "warn",
});
