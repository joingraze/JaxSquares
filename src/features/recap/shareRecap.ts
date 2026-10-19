// Sending the recap card: the PNG itself through the Web Share API where the
// browser can share files (phones, and desktop Safari and Chrome); otherwise
// the board's link, or a download of the image.
//
// The iOS app's share path (@capacitor/share) only takes file:// URLs, and
// writing the PNG into the app's cache needs @capacitor/filesystem, which the
// app doesn't ship. So in the app the image goes through the web view's own
// file share when it has one, and otherwise the board's link goes through the
// native share sheet (shareLink), with the recap's words.

import { isNative, shareLink, type ShareOutcome } from "../../lib/native";

/** What happened: the image went out, it was saved, the link went out instead (or was copied), or nothing. */
export type RecapShareOutcome = "shared" | "saved" | "link" | "link-copied" | "cancelled";

/** What "Share the recap" does on this device. */
export type RecapShareMode = "files" | "link" | "save";

export interface RecapShareDeps {
  /** The Web Share API, when there is one. */
  share?: (data: ShareData) => Promise<void>;
  canShare?: (data: ShareData) => boolean;
  /** The native app (its share sheet takes links, not this image). */
  native: boolean;
  shareLink: (opts: { title: string; text: string; url: string }) => Promise<ShareOutcome>;
  /** Saves the PNG on this device (a download). */
  download: (blob: Blob, fileName: string) => void;
}

export function browserShareDeps(): RecapShareDeps {
  const nav = typeof navigator === "undefined" ? undefined : navigator;
  return {
    share: typeof nav?.share === "function" ? (data) => nav.share(data) : undefined,
    canShare: typeof nav?.canShare === "function" ? (data) => nav.canShare(data) : undefined,
    native: isNative(),
    shareLink,
    download: downloadBlob,
  };
}

/** A tiny PNG stand-in, to ask the browser whether it can share image files at all. */
const PROBE = typeof File === "undefined" ? null : new File([new Uint8Array(8)], "recap.png", { type: "image/png" });

function canShareFiles(deps: RecapShareDeps, file: File | null): boolean {
  if (!file || !deps.share || !deps.canShare) return false;
  try {
    return deps.canShare({ files: [file] });
  } catch {
    return false;
  }
}

/** Share the image where it can go out as a file; else the link in the native app; else save it. */
export function recapShareMode(deps: RecapShareDeps): RecapShareMode {
  if (canShareFiles(deps, PROBE)) return "files";
  return deps.native ? "link" : "save";
}

function isAbort(err: unknown): boolean {
  if (err instanceof DOMException && err.name === "AbortError") return true;
  return /cancel|abort/i.test(err instanceof Error ? err.message : String(err));
}

export interface RecapShareInput {
  blob: Blob;
  fileName: string;
  /** The board's name. */
  title: string;
  /** recapShareText: the score and how many won, never an amount. */
  text: string;
  /** The board's link (the fallback in the native app). */
  url: string;
}

/**
 * Sends the recap: the PNG through the share sheet when the device can share
 * files; else, in the native app, the board's link with the recap's words;
 * else a download. Call it straight from the tap (Web Share needs the gesture).
 */
export async function shareRecap(input: RecapShareInput, deps: RecapShareDeps = browserShareDeps()): Promise<RecapShareOutcome> {
  const file = typeof File === "undefined" ? null : new File([input.blob], input.fileName, { type: "image/png" });
  if (file && deps.share && canShareFiles(deps, file)) {
    try {
      await deps.share({ files: [file], title: input.title, text: input.text });
      return "shared";
    } catch (err) {
      if (isAbort(err)) return "cancelled";
      // NotAllowedError (the gesture expired) or a target that failed: fall back below.
    }
  }
  if (deps.native) {
    const outcome = await deps.shareLink({ title: input.title, text: input.text, url: input.url });
    return outcome === "shared" ? "link" : outcome === "copied" ? "link-copied" : "cancelled";
  }
  deps.download(input.blob, input.fileName);
  return "saved";
}

/** Saves a blob as a file through a temporary link. */
export function downloadBlob(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  a.rel = "noopener";
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

/** "jaxsquares-recap-k7m2px.png". */
export function recapFileName(gameId: string): string {
  return `jaxsquares-recap-${gameId.replace(/[^a-z0-9]/gi, "")}.png`;
}
