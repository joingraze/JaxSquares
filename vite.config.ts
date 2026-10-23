/// <reference types="vitest/config" />
import { defineConfig, type Plugin } from "vite";
import type { OutputBundle, OutputChunk } from "rollup";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { cloudflare } from "@cloudflare/vite-plugin";

// The Cloudflare plugin spins up a Workers runtime for dev/build. It is not
// needed (and slows things down) for the jsdom unit tests, so we skip it there.
const isTest = process.env.VITEST === "true";

/**
 * Screens are lazy chunks (src/App.tsx). Without help, the opened screen's chunk would only be
 * requested after the main bundle has downloaded and run. This injects a tiny inline script into
 * index.html that matches the URL being opened and preloads that screen's JS (and CSS) right away,
 * in parallel with the main bundle. Keep the paths in sync with the routes in src/App.tsx.
 */
const ROUTE_CHUNKS: { path: string; page: string }[] = [
  { path: "^/$", page: "src/pages/Home.tsx" },
  { path: "^/new$", page: "src/pages/CreateGame.tsx" },
  { path: "^/g/[^/]+$", page: "src/pages/GameView.tsx" },
  { path: "^/g/[^/]+/tv$", page: "src/pages/TvView.tsx" },
  { path: "^/g/[^/]+/print$", page: "src/pages/PrintView.tsx" },
  { path: "^/club/[^/]+/tv$", page: "src/pages/ClubTvView.tsx" },
  { path: "^/tv$", page: "src/pages/TvPair.tsx" },
  { path: "^/me$", page: "src/pages/Profile.tsx" },
  { path: "^/privacy$", page: "src/pages/Privacy.tsx" },
  { path: "^/terms$", page: "src/pages/Terms.tsx" },
  { path: "^/support$", page: "src/pages/Support.tsx" },
];

function routePreload(): Plugin {
  return {
    name: "jaxsquares:route-preload",
    apply: "build",
    transformIndexHtml: {
      order: "post",
      handler(html, ctx) {
        const bundle: OutputBundle | undefined = ctx.bundle;
        if (!bundle) return html;
        const chunks = Object.values(bundle).filter((c): c is OutputChunk => c.type === "chunk");
        const byFile = new Map(chunks.map((c) => [c.fileName, c]));
        // Everything the entry already loads (itself and its static imports).
        const closure = (start: OutputChunk[]) => {
          const seen = new Set<string>();
          const walk = (c: OutputChunk) => {
            if (seen.has(c.fileName)) return;
            seen.add(c.fileName);
            for (const f of c.imports) {
              const dep = byFile.get(f);
              if (dep) walk(dep);
            }
          };
          start.forEach(walk);
          return seen;
        };
        const entryFiles = closure(chunks.filter((c) => c.isEntry));
        const cssOf = (files: Iterable<string>) =>
          [...files].flatMap((f) => [...(byFile.get(f)?.viteMetadata?.importedCss ?? [])]);
        const entryCss = new Set(cssOf(entryFiles));
        const url = (f: string) => `/${f}`;
        const table: [string, string[], string[]][] = [];
        for (const { path, page } of ROUTE_CHUNKS) {
          const isPage = (m: string | null) => !!m && m.replace(/\\/g, "/").endsWith(`/${page}`);
          // The screen's own chunk (its dynamic-import facade), else whichever chunk Rollup put the module in.
          const chunk = chunks.find((c) => isPage(c.facadeModuleId)) ?? chunks.find((c) => c.moduleIds.some(isPage));
          if (!chunk) throw new Error(`route-preload: no chunk for ${page}`);
          const files = [...closure([chunk])].filter((f) => !entryFiles.has(f));
          const css = [...new Set(cssOf(files))].filter((f) => !entryCss.has(f));
          table.push([path, files.map(url), css.map(url)]);
        }
        const script =
          `<script>(function(){var p=location.pathname.replace(/\\/+$/,"")||"/",r=${JSON.stringify(table)},d=document;` +
          `function a(h,rel,as){var l=d.createElement("link");l.rel=rel;if(as)l.as=as;l.crossOrigin="";l.href=h;d.head.appendChild(l)}` +
          `for(var i=0;i<r.length;i++)if(new RegExp(r[i][0],"i").test(p)){r[i][1].forEach(function(h){a(h,"modulepreload")});` +
          `r[i][2].forEach(function(h){a(h,"preload","style")});break}})()</script>\n    `;
        const at = html.indexOf("<script type=\"module\"");
        return at < 0 ? html.replace("</head>", `${script}</head>`) : html.slice(0, at) + script + html.slice(at);
      },
    },
  };
}

export default defineConfig({
  define: {
    "import.meta.env.VITE_APP_VERSION": JSON.stringify(process.env.npm_package_version ?? "0.1.0"),
  },
  plugins: [react(), tailwindcss(), routePreload(), ...(isTest ? [] : [cloudflare()])],
  test: {
    globals: true,
    environment: "jsdom",
    setupFiles: ["./src/test/setup.ts"],
    // .claude/worktrees holds agents' scratch checkouts of this repo.
    exclude: ["**/node_modules/**", "**/dist/**", "**/.wrangler/**", "**/.claude/**"],
  },
});
