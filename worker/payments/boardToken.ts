// Binds an App Store purchase to the board it pays for. The iOS app passes this
// UUID as StoreKit's appAccountToken; Apple echoes it back in the signed
// transaction. Because the game id is encoded (not hashed) in it, an app that was
// killed between paying and activating can find the board again on next launch.
// Mirrored in src/lib/checkout.ts; payments tests assert both stay identical.

const MARKER = "6a73"; // "js"
const MAX_ID_BYTES = 13; // 32 hex digits - marker (4) - length (2) = 26 = 13 bytes

/** UUID-shaped token for a game id, or null if the id is too long to encode. */
export function boardAccountToken(gameId: string): string | null {
  const bytes = new TextEncoder().encode(gameId);
  if (bytes.length === 0 || bytes.length > MAX_ID_BYTES) return null;
  let hex = MARKER + bytes.length.toString(16).padStart(2, "0");
  for (const b of bytes) hex += b.toString(16).padStart(2, "0");
  hex = hex.padEnd(32, "0");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

/** The game id inside a token from boardAccountToken (any case), or null for any other UUID. */
export function gameIdFromAccountToken(token: string): string | null {
  const hex = token.replace(/-/g, "").toLowerCase();
  if (!/^[0-9a-f]{32}$/.test(hex) || !hex.startsWith(MARKER)) return null;
  const len = parseInt(hex.slice(4, 6), 16);
  if (len < 1 || len > MAX_ID_BYTES) return null;
  if (!/^0*$/.test(hex.slice(6 + len * 2))) return null;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) bytes[i] = parseInt(hex.slice(6 + i * 2, 8 + i * 2), 16);
  try {
    return new TextDecoder("utf-8", { fatal: true, ignoreBOM: false }).decode(bytes);
  } catch {
    return null;
  }
}
