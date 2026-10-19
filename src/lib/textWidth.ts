// How wide a short text sets in the app's UI face (Figtree, bold), in ems,
// without a DOM: the TV board and the printed board use it to pick a size a
// name fits at. Advances measured from Figtree Variable at weight 700 and
// rounded up; anything outside Latin letters and digits is assumed wide.

const LOWER = [0.59, 0.63, 0.59, 0.63, 0.6, 0.4, 0.64, 0.63, 0.28, 0.28, 0.58, 0.28, 0.92, 0.63, 0.62, 0.63, 0.63, 0.41, 0.56, 0.37, 0.63, 0.6, 0.85, 0.58, 0.61, 0.58];
const UPPER = [0.75, 0.67, 0.74, 0.73, 0.61, 0.59, 0.75, 0.75, 0.29, 0.59, 0.72, 0.57, 0.94, 0.77, 0.78, 0.65, 0.78, 0.66, 0.66, 0.67, 0.74, 0.75, 1.04, 0.74, 0.74, 0.67];
const DIGITS = [0.68, 0.44, 0.63, 0.65, 0.68, 0.64, 0.65, 0.59, 0.66, 0.65];
/** Headroom on top of the measured advances (heavier weights, rendering differences). */
const SAFETY = 1.04;

/** One glyph's advance, in ems. */
export function glyphEm(ch: string): number {
  const c = ch.codePointAt(0) ?? 0;
  if (c >= 97 && c <= 122) return LOWER[c - 97];
  if (c >= 65 && c <= 90) return UPPER[c - 65];
  if (c >= 48 && c <= 57) return DIGITS[c - 48];
  if (ch === " ") return 0.24;
  if (".,'’:;!|".includes(ch)) return 0.34;
  if ("-–()".includes(ch)) return 0.48;
  if (ch === "…") return 1.01;
  // Accented letters and other scripts read about like a capital; emoji and symbols are wide.
  return /\p{L}/u.test(ch) ? 0.72 : 1.1;
}

/** A text's width in ems, with a little headroom. */
export function textEm(text: string): number {
  let em = 0;
  for (const ch of text) em += glyphEm(ch);
  return em * SAFETY;
}
