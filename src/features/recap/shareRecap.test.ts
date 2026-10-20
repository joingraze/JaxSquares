// Sending the recap: the PNG through the Web Share API where files can be
// shared; the board's link through the native share sheet in the iOS app
// (it can't share this file); a download otherwise. A cancel is a cancel.

import { describe, expect, it, vi } from "vitest";
import { recapFileName, recapShareMode, shareRecap, type RecapShareDeps } from "./shareRecap";

const input = {
  blob: new Blob([new Uint8Array([137, 80, 78, 71])], { type: "image/png" }),
  fileName: recapFileName("k7m2px"),
  title: "Office Squares",
  text: "Final: Chiefs 27, Bills 24 · 3 winners on Office Squares 🏈",
  url: "https://jaxsquares.com/g/k7m2px",
};

function deps(over: Partial<RecapShareDeps> = {}): RecapShareDeps & { download: ReturnType<typeof vi.fn>; shareLink: ReturnType<typeof vi.fn> } {
  return {
    native: false,
    shareLink: vi.fn(async () => "shared" as const),
    download: vi.fn(),
    ...over,
  } as RecapShareDeps & { download: ReturnType<typeof vi.fn>; shareLink: ReturnType<typeof vi.fn> };
}

describe("shareRecap", () => {
  it("shares the PNG as a file where the browser can", async () => {
    const share = vi.fn<(data: ShareData) => Promise<void>>(async () => {});
    const d = deps({ share, canShare: (data) => !!data.files?.length });
    expect(recapShareMode(d)).toBe("files");
    expect(await shareRecap(input, d)).toBe("shared");
    const data = share.mock.calls[0][0];
    expect(data.files?.[0]).toBeInstanceOf(File);
    expect(data.files?.[0].name).toBe("jaxsquares-recap-k7m2px.png");
    expect(data.files?.[0].type).toBe("image/png");
    expect(data.text).toBe(input.text);
    expect(d.download).not.toHaveBeenCalled();
    expect(d.shareLink).not.toHaveBeenCalled();
  });

  it("is cancelled when the person backs out of the share sheet", async () => {
    const d = deps({ share: vi.fn(async () => Promise.reject(new DOMException("Share canceled", "AbortError"))), canShare: () => true });
    expect(await shareRecap(input, d)).toBe("cancelled");
    expect(d.download).not.toHaveBeenCalled();
  });

  it("saves the image on the web when files can't be shared (or the share fails)", async () => {
    const noFiles = deps({ share: vi.fn(async () => {}), canShare: () => false });
    expect(recapShareMode(noFiles)).toBe("save");
    expect(await shareRecap(input, noFiles)).toBe("saved");
    expect(noFiles.download).toHaveBeenCalledWith(input.blob, "jaxsquares-recap-k7m2px.png");
    expect(noFiles.share).not.toHaveBeenCalled();

    // No Web Share at all (a desktop browser without it).
    const none = deps();
    expect(recapShareMode(none)).toBe("save");
    expect(await shareRecap(input, none)).toBe("saved");

    // The share sheet refused (the tap's gesture ran out): saved instead.
    const refused = deps({ share: vi.fn(async () => Promise.reject(new DOMException("No gesture", "NotAllowedError"))), canShare: () => true });
    expect(await shareRecap(input, refused)).toBe("saved");
  });

  it("falls back to the board's link through the native share sheet in the iOS app", async () => {
    const d = deps({ native: true });
    expect(recapShareMode(d)).toBe("link");
    expect(await shareRecap(input, d)).toBe("link");
    expect(d.shareLink).toHaveBeenCalledWith({ title: "Office Squares", text: input.text, url: "https://jaxsquares.com/g/k7m2px" });
    expect(d.download).not.toHaveBeenCalled();

    d.shareLink.mockResolvedValueOnce("copied");
    expect(await shareRecap(input, d)).toBe("link-copied");
    d.shareLink.mockResolvedValueOnce("cancelled");
    expect(await shareRecap(input, d)).toBe("cancelled");
  });

  it("uses the web view's file share in the app when it has one", async () => {
    const share = vi.fn(async () => {});
    const d = deps({ native: true, share, canShare: () => true });
    expect(recapShareMode(d)).toBe("files");
    expect(await shareRecap(input, d)).toBe("shared");
    expect(d.shareLink).not.toHaveBeenCalled();
  });

  it("names the file after the board", () => {
    expect(recapFileName("k7m2px")).toBe("jaxsquares-recap-k7m2px.png");
    expect(recapFileName("../x")).toBe("jaxsquares-recap-x.png");
  });
});
