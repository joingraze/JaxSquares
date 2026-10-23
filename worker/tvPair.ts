// Pairing a TV with a board (shared/tvBrowser.ts, migration 0021): the TV's
// secret, what D1 keeps of it, and a fresh code. The routes are in index.ts.

import { tvCodeFrom } from "../shared/tvBrowser";

/** The TV's own secret: 24 random bytes, base64url (32 characters). Only that TV can ask what it was sent. */
export function newTvToken(): string {
  let bin = "";
  for (const b of crypto.getRandomValues(new Uint8Array(24))) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/** What D1 keeps of a TV's secret: a SHA-256 (hex). */
export async function tvTokenHash(token: string): Promise<string> {
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(`jaxsquares:tv:${token}`)));
  return Array.from(digest, (b) => b.toString(16).padStart(2, "0")).join("");
}

/** A fresh random code (taken ones are retried by the caller). */
export function drawTvCode(): string {
  return tvCodeFrom(crypto.getRandomValues(new Uint8Array(8)));
}
