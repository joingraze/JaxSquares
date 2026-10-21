// TV browsers and pairing a TV with a board (docs/ARCHITECTURE.md "TV mode and
// the printable board"). Pure, shared by the worker (a TV opening a board's
// link lands in TV mode) and the app (a TV opening the home page lands on the
// pairing page, /tv).

/**
 * A smart TV's or a console's browser, by its user agent: Samsung (Tizen),
 * LG (webOS), Sony, Philips, Hisense, Android and Google TV, Fire TV, Xbox,
 * PlayStation and the rest that say "TV".
 */
const TV_AGENT =
  /\b(SMART-?TV|SmartTV|Tizen[^;)]*TV|Web0S|NetCast|BRAVIA|NETTV|HbbTV|VIDAA|Opera TV|GoogleTV|Google TV|Android TV|AFT[A-Z][A-Z0-9]*|Xbox|PlayStation|CrKey|Roku|DTV)\b/i;

export function isTvBrowser(userAgent: string | null | undefined): boolean {
  return !!userAgent && TV_AGENT.test(userAgent);
}

/** Letters and digits that can't be misread across a room (no 0/O, 1/I/L, 2/Z, 5/S, 8/B). */
export const TV_CODE_ALPHABET = "ACDEFHJKMNPRTUVWXY34679";
export const TV_CODE_LENGTH = 4;
/** How long a TV's code works before the TV shows a new one. */
export const TV_CODE_TTL_MS = 15 * 60_000;
/** How often the pairing page asks whether a board was sent. */
export const TV_PAIR_POLL_MS = 2_500;

/** A code as someone types it ("ab c4" -> "ABC4"), or null when it can't be one. */
export function cleanTvCode(input: unknown): string | null {
  if (typeof input !== "string") return null;
  const code = input.replace(/[\s-]+/g, "").toUpperCase();
  return code.length === TV_CODE_LENGTH && [...code].every((ch) => TV_CODE_ALPHABET.includes(ch)) ? code : null;
}

/** A code from random bytes (the worker draws them). */
export function tvCodeFrom(bytes: Uint8Array): string {
  let out = "";
  for (let i = 0; i < TV_CODE_LENGTH; i++) out += TV_CODE_ALPHABET[bytes[i] % TV_CODE_ALPHABET.length];
  return out;
}
