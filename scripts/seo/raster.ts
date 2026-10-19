/// <reference lib="dom" />
// Image helpers for the asset scripts (images.ts, printables.ts): Chromium's own
// canvas does the resizing and the WebP encoding, so there's no image library
// to install.

import type { Browser, Page } from "@playwright/test";
import { existsSync } from "node:fs";

/** The sandbox's Chromium if present, else CHROMIUM_PATH, else Playwright's own download. */
export function chromiumPath(): string | undefined {
  if (process.env.CHROMIUM_PATH) return process.env.CHROMIUM_PATH;
  const sandbox = "/opt/pw-browsers/chromium-1194/chrome-linux/chrome";
  return existsSync(sandbox) ? sandbox : undefined;
}

export async function launch(): Promise<Browser> {
  const { chromium } = await import("@playwright/test");
  return chromium.launch({ executablePath: chromiumPath() });
}

/**
 * Resize an image to exactly width x height (halving first for a clean
 * downscale) and encode it as WebP.
 */
export async function toWebp(page: Page, input: Buffer, mime: string, width: number, height: number, quality = 0.8): Promise<Buffer> {
  const dataUrl = `data:${mime};base64,${input.toString("base64")}`;
  const b64 = await page.evaluate(
    async ({ dataUrl, width, height, quality }) => {
      const img = new Image();
      img.src = dataUrl;
      await img.decode();
      let src: CanvasImageSource = img;
      let w = img.naturalWidth;
      let h = img.naturalHeight;
      const step = (cw: number, ch: number) => {
        const c = document.createElement("canvas");
        c.width = cw;
        c.height = ch;
        const g = c.getContext("2d")!;
        g.imageSmoothingEnabled = true;
        g.imageSmoothingQuality = "high";
        g.drawImage(src, 0, 0, cw, ch);
        return c;
      };
      while (w / 2 >= width) {
        src = step(Math.round(w / 2), Math.round(h / 2));
        w = Math.round(w / 2);
        h = Math.round(h / 2);
      }
      return step(width, height).toDataURL("image/webp", quality).split(",")[1];
    },
    { dataUrl, width, height, quality },
  );
  return Buffer.from(b64, "base64");
}
