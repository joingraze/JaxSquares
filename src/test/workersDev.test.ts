// The Worker's workers.dev address: pages there (the app and the landing
// pages) move to the same path on jaxsquares.com before anything loads, and a
// page on jaxsquares.com (or anywhere else) stays put. docs/domain.md.

import { describe, expect, it, vi } from "vitest";
import indexHtml from "../../index.html?raw";
import { PAGES } from "../../scripts/seo/content.ts";
import { renderPage, type JaxPose, type RenderContext } from "../../scripts/seo/render.ts";
import { PRINTABLES } from "../../scripts/seo/site.ts";

const jax = (pose: JaxPose) => `<svg data-pose="${pose}"></svg>`;
const ctx: RenderContext = {
  jax: { cheer: jax("cheer"), sit: jax("sit"), peek: jax("peek") },
  printableSizes: Object.fromEntries(PRINTABLES.map((p) => [p.id, "95 KB"])),
  year: 2026,
};

/** The first inline script in a page, which must be the redirect (it runs before anything else loads). */
function firstScript(html: string): string {
  return /<script>([\s\S]*?)<\/script>/.exec(html)?.[1] ?? "";
}

/** Runs a page's redirect with a fake address; returns where it sent the page, or null. */
function run(script: string, href: string): string | null {
  const url = new URL(href);
  const replace = vi.fn();
  const location = { hostname: url.hostname, pathname: url.pathname, search: url.search, hash: url.hash, replace };
  new Function("location", script)(location);
  return replace.mock.calls[0]?.[0] ?? null;
}

describe("the workers.dev address", () => {
  const app = firstScript(indexHtml);
  const landing = firstScript(renderPage(PAGES[0], PAGES, ctx));

  it("sends the app's pages to the same path on jaxsquares.com", () => {
    expect(app).toContain("workers");
    expect(run(app, "https://jaxsquares.turnoverapp.workers.dev/g/k7m2px?board=1")).toBe("https://jaxsquares.com/g/k7m2px?board=1");
    expect(run(app, "https://jaxsquares.turnoverapp.workers.dev/club/abc/tv#k=secret")).toBe("https://jaxsquares.com/club/abc/tv#k=secret");
    expect(run(app, "https://JAXSQUARES.TURNOVERAPP.WORKERS.DEV/")).toBe("https://jaxsquares.com/");
  });

  it("sends the landing pages there too", () => {
    expect(run(landing, "https://jaxsquares.turnoverapp.workers.dev/football-squares")).toBe("https://jaxsquares.com/football-squares");
  });

  it("leaves jaxsquares.com, local development and look-alike hosts alone", () => {
    for (const script of [app, landing]) {
      expect(run(script, "https://jaxsquares.com/g/k7m2px")).toBeNull();
      expect(run(script, "http://127.0.0.1:5199/")).toBeNull();
      expect(run(script, "https://workers.dev.example.com/")).toBeNull();
    }
  });
});
