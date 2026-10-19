// Turns the App Store screenshots (docs/app-store/screenshots/6.5) into the
// small WebP files the landing pages show, at the size SHOT_SIZE declares:
//
//   node --experimental-strip-types scripts/seo/images.ts   (npm run seo:images)
//
// Needs Chromium (CHROMIUM_PATH or Playwright's), so the output is committed
// in public/seo/shots/. Re-run it after regenerating the store screenshots.

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { launch, toWebp } from "./raster.ts";
import { SHOT_SIZE, SHOT_SOURCE_DIR, SHOTS } from "./site.ts";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");

const browser = await launch();
try {
  const page = await browser.newPage();
  for (const shot of Object.values(SHOTS)) {
    const webp = await toWebp(page, readFileSync(join(ROOT, SHOT_SOURCE_DIR, shot.from)), "image/png", SHOT_SIZE.width, SHOT_SIZE.height, 0.78);
    const out = join(ROOT, "public", shot.src);
    mkdirSync(dirname(out), { recursive: true });
    writeFileSync(out, webp);
    console.log(`  public${shot.src} (${Math.round(webp.length / 1024)} KB)`);
  }
} finally {
  await browser.close();
}
