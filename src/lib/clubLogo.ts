// A club logo, made in the browser from whatever picture the holder picks
// (a photo, a PNG, a JPEG): drawn to fit within 256x256 and re-encoded as WebP
// (PNG where the browser can't encode WebP, e.g. older Safari), stepping the
// quality, then the size, down until it's under 60 KB. The server checks it
// again (worker/clubs/logo.ts): type, magic bytes, size and dimensions.

import { CLUB_LOGO_MAX_BYTES, CLUB_LOGO_MAX_SIDE } from "../../shared/clubs";

export const LOGO_TOO_DETAILED = "That picture has too much detail for a logo. Try a simpler one.";
export const LOGO_UNREADABLE = "That picture couldn't be opened. Try a PNG or JPEG.";

/** The size to draw a `width`x`height` picture at so it fits within `max`x`max`, never enlarged. */
export function fitWithin(width: number, height: number, max: number): { width: number; height: number } {
  if (!(width > 0) || !(height > 0)) return { width: max, height: max };
  const scale = Math.min(1, max / Math.max(width, height));
  return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)) };
}

/** The sides to try, largest first, and the WebP qualities at each. */
export const LOGO_STEPS = {
  sides: [CLUB_LOGO_MAX_SIDE, 192, 128, 96],
  webpQualities: [0.9, 0.8, 0.7, 0.55],
};

type Picture = { width: number; height: number; source: CanvasImageSource; close?: () => void };

async function decode(file: Blob): Promise<Picture> {
  if (typeof createImageBitmap === "function") {
    try {
      const bitmap = await createImageBitmap(file);
      return { width: bitmap.width, height: bitmap.height, source: bitmap, close: () => bitmap.close() };
    } catch {
      // Fall back to an <img> (some formats decode only there).
    }
  }
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.decoding = "async";
    img.src = url;
    await img.decode();
    return { width: img.naturalWidth, height: img.naturalHeight, source: img };
  } catch {
    throw new Error(LOGO_UNREADABLE);
  } finally {
    URL.revokeObjectURL(url);
  }
}

function toBlob(canvas: HTMLCanvasElement, type: string, quality?: number): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob(resolve, type, quality));
}

/** The picture as a logo the server takes, or an Error with a message the holder can read. */
export async function prepareLogo(file: Blob): Promise<Blob> {
  const picture = await decode(file);
  try {
    for (const side of LOGO_STEPS.sides) {
      const size = fitWithin(picture.width, picture.height, side);
      const canvas = document.createElement("canvas");
      canvas.width = size.width;
      canvas.height = size.height;
      const ctx = canvas.getContext("2d");
      if (!ctx) throw new Error(LOGO_UNREADABLE);
      ctx.imageSmoothingQuality = "high";
      ctx.drawImage(picture.source, 0, 0, size.width, size.height);
      for (const quality of LOGO_STEPS.webpQualities) {
        const webp = await toBlob(canvas, "image/webp", quality);
        // A browser that can't encode WebP hands back a PNG instead: try PNG below.
        if (!webp || webp.type !== "image/webp") break;
        if (webp.size <= CLUB_LOGO_MAX_BYTES) return webp;
      }
      const png = await toBlob(canvas, "image/png");
      if (png && png.type === "image/png" && png.size <= CLUB_LOGO_MAX_BYTES) return png;
    }
  } finally {
    picture.close?.();
  }
  throw new Error(LOGO_TOO_DETAILED);
}
