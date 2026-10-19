// What the server accepts as a club logo. The app resizes and re-encodes the
// picture in the browser (at most 256x256, WebP or PNG, under 60 KB); the
// server doesn't trust that: it checks the declared type, the bytes' magic
// numbers (and that they agree), the size and the dimensions in the image's
// own header before storing it. Nothing else (SVG, GIF, JPEG, HTML posing as
// an image) is ever stored or served. Pure.

import { CLUB_LOGO_MAX_BYTES, CLUB_LOGO_MAX_SIDE, type ClubLogoType } from "../../shared/clubs";

export type LogoCheck =
  | { ok: true; type: ClubLogoType; width: number; height: number }
  | { ok: false; status: 400 | 413 | 415; error: string };

export const LOGO_ERRORS = {
  empty: "Pick a picture for the logo.",
  tooBig: "That logo is too big. Pick a smaller picture.",
  type: "The logo has to be a PNG or WebP picture.",
  mismatch: "That file isn't the picture it says it is.",
  broken: "That picture couldn't be read. Try another one.",
  size: `The logo can be at most ${CLUB_LOGO_MAX_SIDE}×${CLUB_LOGO_MAX_SIDE}.`,
} as const;

const PNG_MAGIC = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

const ascii = (b: Uint8Array, at: number, text: string) => Array.from(text).every((ch, i) => b[at + i] === ch.charCodeAt(0));
const u32be = (b: Uint8Array, at: number) => ((b[at] << 24) | (b[at + 1] << 16) | (b[at + 2] << 8) | b[at + 3]) >>> 0;
const u32le = (b: Uint8Array, at: number) => (b[at] | (b[at + 1] << 8) | (b[at + 2] << 16) | (b[at + 3] << 24)) >>> 0;
const u24le = (b: Uint8Array, at: number) => b[at] | (b[at + 1] << 8) | (b[at + 2] << 16);
const u16le = (b: Uint8Array, at: number) => b[at] | (b[at + 1] << 8);

/** The image type its first bytes say, or null for anything else. */
export function sniffLogoType(b: Uint8Array): ClubLogoType | null {
  if (b.length >= 8 && PNG_MAGIC.every((v, i) => b[i] === v)) return "image/png";
  if (b.length >= 12 && ascii(b, 0, "RIFF") && ascii(b, 8, "WEBP")) return "image/webp";
  return null;
}

/** A PNG's size from its IHDR chunk (always first), or null. */
function pngSize(b: Uint8Array): { width: number; height: number } | null {
  if (b.length < 24 || !ascii(b, 12, "IHDR") || u32be(b, 8) !== 13) return null;
  return { width: u32be(b, 16), height: u32be(b, 20) };
}

/** A WebP's size from its first chunk (VP8X canvas, VP8L or VP8 frame header), or null. */
function webpSize(b: Uint8Array): { width: number; height: number } | null {
  if (b.length < 30 || u32le(b, 4) + 8 > b.length) return null;
  if (ascii(b, 12, "VP8X")) return { width: u24le(b, 24) + 1, height: u24le(b, 27) + 1 };
  if (ascii(b, 12, "VP8L")) {
    if (b[20] !== 0x2f) return null;
    const bits = u32le(b, 21);
    return { width: (bits & 0x3fff) + 1, height: ((bits >>> 14) & 0x3fff) + 1 };
  }
  if (ascii(b, 12, "VP8 ")) {
    if (b[23] !== 0x9d || b[24] !== 0x01 || b[25] !== 0x2a) return null;
    return { width: u16le(b, 26) & 0x3fff, height: u16le(b, 28) & 0x3fff };
  }
  return null;
}

/** Checks an uploaded logo: `declared` is the request's Content-Type. */
export function checkLogo(bytes: Uint8Array, declared: string | null | undefined): LogoCheck {
  if (bytes.length === 0) return { ok: false, status: 400, error: LOGO_ERRORS.empty };
  if (bytes.length > CLUB_LOGO_MAX_BYTES) return { ok: false, status: 413, error: LOGO_ERRORS.tooBig };
  const type = (declared ?? "").split(";")[0].trim().toLowerCase();
  if (type !== "image/png" && type !== "image/webp") return { ok: false, status: 415, error: LOGO_ERRORS.type };
  const sniffed = sniffLogoType(bytes);
  if (!sniffed) return { ok: false, status: 415, error: LOGO_ERRORS.type };
  if (sniffed !== type) return { ok: false, status: 400, error: LOGO_ERRORS.mismatch };
  const size = sniffed === "image/png" ? pngSize(bytes) : webpSize(bytes);
  if (!size || size.width < 1 || size.height < 1) return { ok: false, status: 400, error: LOGO_ERRORS.broken };
  if (size.width > CLUB_LOGO_MAX_SIDE || size.height > CLUB_LOGO_MAX_SIDE) return { ok: false, status: 400, error: LOGO_ERRORS.size };
  return { ok: true, type: sniffed, ...size };
}

/** The logo's version: SHA-256 of its bytes, 16 hex (its ETag and the URL's ?v=). */
export async function logoEtag(bytes: Uint8Array): Promise<string> {
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", bytes as Uint8Array<ArrayBuffer>));
  return Array.from(digest.slice(0, 8), (x) => x.toString(16).padStart(2, "0")).join("");
}
