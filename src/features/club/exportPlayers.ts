// Sending a Club Pass board's players CSV (GET /api/games/:id/export.csv):
// a download on the web; in the iOS app, the share sheet. The app's share
// plugin only takes file:// URLs (and writing a file needs a plugin the app
// doesn't ship), so there the web view's own file share is used when it has
// one, else the CSV's text goes through the native share sheet (Mail, Notes,
// Files, Messages...).

import { downloadPlayersCsv, type PlayersCsv } from "../../lib/club";
import { isNative, shareTextNative } from "../../lib/native";

/** How it went: shared (share sheet), saved (download), or nothing. */
export type ExportOutcome = "shared" | "saved" | "cancelled";

export interface ExportDeps {
  native: boolean;
  share?: (data: ShareData) => Promise<void>;
  canShare?: (data: ShareData) => boolean;
  /** The native share sheet with text (Capacitor's Share). */
  shareText: (opts: { title: string; text: string }) => Promise<void>;
  download: (blob: Blob, fileName: string) => void;
}

function isAbort(err: unknown): boolean {
  if (err instanceof DOMException && err.name === "AbortError") return true;
  return /cancel|abort/i.test(err instanceof Error ? err.message : String(err));
}

/** A blob's text (FileReader where Blob.text() is missing: older web views). */
function blobText(blob: Blob): Promise<string> {
  if (typeof blob.text === "function") return blob.text();
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ""));
    reader.onerror = () => reject(reader.error);
    reader.readAsText(blob);
  });
}

/** Saves a blob as a file through a temporary link. */
export function saveBlob(blob: Blob, fileName: string): void {
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

export function browserExportDeps(): ExportDeps {
  const nav = typeof navigator === "undefined" ? undefined : navigator;
  return {
    native: isNative(),
    share: typeof nav?.share === "function" ? (data) => nav.share(data) : undefined,
    canShare: typeof nav?.canShare === "function" ? (data) => nav.canShare(data) : undefined,
    shareText: shareTextNative,
    download: saveBlob,
  };
}

/** Sends the CSV: the share sheet in the native app (a file where the web view can share one, else its text), a download on the web. */
export async function sendPlayersCsv(csv: PlayersCsv, boardName: string, deps: ExportDeps = browserExportDeps()): Promise<ExportOutcome> {
  const title = `${boardName} players`;
  if (!deps.native) {
    deps.download(csv.blob, csv.fileName);
    return "saved";
  }
  const file = typeof File === "undefined" ? null : new File([csv.blob], csv.fileName, { type: "text/csv" });
  if (file && deps.share && deps.canShare?.({ files: [file] })) {
    try {
      await deps.share({ files: [file], title });
      return "shared";
    } catch (err) {
      if (isAbort(err)) return "cancelled";
      // NotAllowedError (the tap's gesture expired while the list loaded): the native sheet below needs none.
    }
  }
  try {
    await deps.shareText({ title, text: (await blobText(csv.blob)).replace(/^\uFEFF/, "") });
    return "shared";
  } catch (err) {
    if (isAbort(err)) return "cancelled";
    throw err;
  }
}

/** Fetches the board's players CSV and sends it (see sendPlayersCsv). */
export async function exportPlayers(gameId: string, boardName: string, deps?: ExportDeps): Promise<ExportOutcome> {
  return sendPlayersCsv(await downloadPlayersCsv(gameId), boardName, deps);
}
