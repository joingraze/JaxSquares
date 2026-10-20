// Prints the free football squares templates to PDF, plus a WebP preview of
// each for the printables page:
//
//   node --experimental-strip-types scripts/seo/printables.ts   (npm run seo:printables)
//
// Needs Chromium (CHROMIUM_PATH or Playwright's), which CI may not have, so the
// output is committed: public/printables/*.pdf and public/seo/printables/*.webp.
// Re-run it after changing scripts/seo/print.ts, the fonts or the icon.

import type { Page } from "@playwright/test";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { renderJaxPoses } from "./jax.ts";
import { SHEETS, sheetHtml, type SheetAssets, type SheetKind } from "./print.ts";
import { launch, toWebp } from "./raster.ts";
import { FONTS, PRINTABLES } from "./site.ts";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const require = createRequire(import.meta.url);
/** Keep each PDF light enough to download on a phone. */
const MAX_PDF_BYTES = 150 * 1024;

function write(rel: string, data: Buffer) {
  const file = join(ROOT, rel);
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, data);
  console.log(`  ${rel} (${Math.round(data.length / 1024)} KB)`);
}

const fontUrl = (from: string) => `data:font/woff2;base64,${readFileSync(require.resolve(from)).toString("base64")}`;
const [body, display] = FONTS;
const assets: SheetAssets = {
  fonts: { display: fontUrl(display.from), body: fontUrl(body.from) },
  icon: readFileSync(join(ROOT, "public/icons/icon.svg"), "utf8").trim(),
  jax: (await renderJaxPoses(ROOT)).sit,
};

async function load(page: Page, kind: SheetKind) {
  const { paper } = SHEETS[kind];
  await page.setViewportSize({ width: Math.round(paper.width * 96), height: Math.round(paper.height * 96) });
  await page.setContent(sheetHtml(kind, assets), { waitUntil: "load" });
  await page.evaluate(() => document.fonts.ready);
}

const browser = await launch();
try {
  const pdfPage = await browser.newPage();
  const shotPage = await browser.newPage({ deviceScaleFactor: 2 });
  const encoder = await browser.newPage();
  const tooBig: string[] = [];
  for (const printable of PRINTABLES) {
    const kind = printable.id as SheetKind;
    await load(pdfPage, kind);
    const pdf = await pdfPage.pdf({ preferCSSPageSize: true, printBackground: true });
    if (pdf.length > MAX_PDF_BYTES) tooBig.push(`${printable.href} is ${Math.round(pdf.length / 1024)} KB`);
    write(join("public", printable.href), pdf);

    await load(shotPage, kind);
    const png = await shotPage.locator(".sheet").screenshot();
    const { width, height } = printable.thumbSize;
    write(join("public", printable.thumb), await toWebp(encoder, png, "image/png", width, height, 0.85));
  }
  if (tooBig.length) throw new Error(`PDFs over ${MAX_PDF_BYTES / 1024} KB:\n  ${tooBig.join("\n  ")}`);
} finally {
  await browser.close();
}
