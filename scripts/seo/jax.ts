// Jax, rendered from the app's own component (src/components/ui/Jax.tsx) to
// static SVG: Vite loads the TSX for SSR and React renders the markup, so the
// pages and printables always show the same dog as the app.

import type { JaxPose } from "./render.ts";

export const JAX_POSES: readonly JaxPose[] = ["cheer", "sit", "peek"];
/** The width every pose is rendered at; the page template rescales from it. */
export const JAX_RENDER_SIZE = 120;

export async function renderJaxPoses(root: string): Promise<Record<JaxPose, string>> {
  const { createServer } = await import("vite");
  const { createElement } = await import("react");
  const { renderToStaticMarkup } = await import("react-dom/server");
  const vite = await createServer({
    root,
    configFile: false,
    logLevel: "error",
    appType: "custom",
    server: { middlewareMode: true, hmr: false, watch: null },
    esbuild: { jsx: "automatic" },
    optimizeDeps: { noDiscovery: true, include: [] },
  });
  try {
    const { Jax } = await vite.ssrLoadModule("/src/components/ui/Jax.tsx");
    const out = {} as Record<JaxPose, string>;
    for (const pose of JAX_POSES) {
      out[pose] = renderToStaticMarkup(createElement(Jax, { pose, size: JAX_RENDER_SIZE, title: "Jax" }));
      if (!out[pose].startsWith("<svg")) throw new Error(`Jax ${pose} didn't render to SVG`);
    }
    return out;
  } finally {
    await vite.close();
  }
}
