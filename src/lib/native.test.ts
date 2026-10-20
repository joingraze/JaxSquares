import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const env = vi.hoisted(() => ({ platform: "web" as "web" | "ios" | "android" }));
const prefs = vi.hoisted(() => new Map<string, string>());
const listeners = vi.hoisted(() => new Map<string, (data: { url: string }) => void>());

vi.mock("@capacitor/core", () => ({
  Capacitor: {
    isNativePlatform: () => env.platform !== "web",
    getPlatform: () => env.platform,
  },
}));
vi.mock("@capacitor/share", () => ({ Share: { share: vi.fn() } }));
vi.mock("@capacitor/haptics", () => ({
  Haptics: {
    impact: vi.fn(async () => {}),
    notification: vi.fn(async () => {}),
    selectionStart: vi.fn(async () => {}),
    selectionChanged: vi.fn(async () => {}),
    selectionEnd: vi.fn(async () => {}),
  },
  ImpactStyle: { Light: "LIGHT", Medium: "MEDIUM", Heavy: "HEAVY" },
  NotificationType: { Success: "SUCCESS", Warning: "WARNING", Error: "ERROR" },
}));
vi.mock("@capacitor/preferences", () => ({
  Preferences: {
    get: vi.fn(async ({ key }: { key: string }) => ({ value: prefs.get(key) ?? null })),
    set: vi.fn(async ({ key, value }: { key: string; value: string }) => void prefs.set(key, value)),
    remove: vi.fn(async ({ key }: { key: string }) => void prefs.delete(key)),
  },
}));
vi.mock("@capacitor/app", () => ({
  App: {
    addListener: vi.fn(async (event: string, cb: (data: { url: string }) => void) => {
      listeners.set(event, cb);
      return { remove: async () => void listeners.delete(event) };
    }),
  },
}));
vi.mock("@capacitor/splash-screen", () => ({ SplashScreen: { hide: vi.fn(async () => {}) } }));
vi.mock("@capacitor/status-bar", () => ({
  StatusBar: { setStyle: vi.fn(async () => {}), setOverlaysWebView: vi.fn(async () => {}) },
  Style: { Dark: "DARK" },
}));

import { Share } from "@capacitor/share";
import { Haptics } from "@capacitor/haptics";
import { Preferences } from "@capacitor/preferences";
import { SplashScreen } from "@capacitor/splash-screen";
import { getStored, haptic, initNative, isNative, pathFromAppUrl, platform, removeStored, setStored, shareLink } from "./native";

function setPointer(coarse: boolean) {
  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    value: (query: string) => ({ matches: coarse && query.includes("coarse"), media: query }),
  });
}

function setNavigator(props: Record<string, unknown>) {
  for (const [key, value] of Object.entries(props)) {
    Object.defineProperty(navigator, key, { configurable: true, writable: true, value });
  }
}

const clipboard = { writeText: vi.fn<(text: string) => Promise<void>>(async () => {}) };
const link = { title: "Join Office Squares", text: "Grab a square", url: "https://jaxsquares.com/g/abc123" };

beforeEach(() => {
  env.platform = "web";
  prefs.clear();
  listeners.clear();
  localStorage.clear();
  vi.clearAllMocks();
  setPointer(true);
  setNavigator({ clipboard, share: undefined, canShare: undefined, vibrate: undefined });
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("pathFromAppUrl", () => {
  it.each([
    ["https://jaxsquares.com/g/abc123", "/g/abc123"],
    ["https://www.jaxsquares.com/g/abc123/?ref=sms#board", "/g/abc123?ref=sms#board"],
    ["https://jaxsquares.com", "/"],
    ["jaxsquares://g/abc123", "/g/abc123"],
    ["jaxsquares:///g/abc123", "/g/abc123"],
    ["jaxsquares://new", "/new"],
  ])("%s -> %s", (input, expected) => {
    expect(pathFromAppUrl(input)).toBe(expected);
  });

  it.each(["https://evil.example/g/abc", "javascript:alert(1)", "not a url", "capacitor://localhost/g/abc"])(
    "ignores %s",
    (input) => {
      expect(pathFromAppUrl(input)).toBeNull();
    },
  );
});

describe("platform", () => {
  it("reports web in a browser", () => {
    expect(isNative()).toBe(false);
    expect(platform()).toBe("web");
  });

  it("reports the native platform inside the app", () => {
    env.platform = "ios";
    expect(isNative()).toBe(true);
    expect(platform()).toBe("ios");
  });
});

describe("shareLink", () => {
  it("uses the native share sheet in the app", async () => {
    env.platform = "ios";
    vi.mocked(Share.share).mockResolvedValueOnce({ activityType: "com.apple.UIKit.activity.Message" });
    await expect(shareLink(link)).resolves.toBe("shared");
    expect(Share.share).toHaveBeenCalledWith(expect.objectContaining({ url: link.url, title: link.title }));
  });

  it("treats closing the native sheet as cancelled, not as an error", async () => {
    env.platform = "ios";
    vi.mocked(Share.share).mockRejectedValueOnce(new Error("Share canceled"));
    await expect(shareLink(link)).resolves.toBe("cancelled");
    expect(clipboard.writeText).not.toHaveBeenCalled();
  });

  it("uses Web Share on a phone browser", async () => {
    const share = vi.fn(async () => {});
    setNavigator({ share });
    await expect(shareLink(link)).resolves.toBe("shared");
    expect(share).toHaveBeenCalledWith(link);
  });

  it("returns cancelled when the web share sheet is dismissed", async () => {
    setNavigator({ share: vi.fn(async () => Promise.reject(new DOMException("dismissed", "AbortError"))) });
    await expect(shareLink(link)).resolves.toBe("cancelled");
  });

  it("copies the link when Web Share is refused", async () => {
    setNavigator({ share: vi.fn(async () => Promise.reject(new DOMException("no gesture", "NotAllowedError"))) });
    await expect(shareLink(link)).resolves.toBe("copied");
    expect(clipboard.writeText).toHaveBeenCalledWith(link.url);
  });

  it("copies on desktop even when Web Share exists", async () => {
    setPointer(false);
    const share = vi.fn(async () => {});
    setNavigator({ share });
    await expect(shareLink(link)).resolves.toBe("copied");
    expect(share).not.toHaveBeenCalled();
  });

  it("falls back to a hidden textarea when the async clipboard is unavailable", async () => {
    setNavigator({ clipboard: { writeText: vi.fn(async () => Promise.reject(new Error("denied"))) } });
    const exec = vi.fn(() => true);
    Object.defineProperty(document, "execCommand", { configurable: true, value: exec });
    await expect(shareLink(link)).resolves.toBe("copied");
    expect(exec).toHaveBeenCalledWith("copy");
    expect(document.querySelector("textarea")).toBeNull();
  });
});

describe("haptic", () => {
  it("maps kinds to native impact / notification feedback", async () => {
    env.platform = "ios";
    await haptic();
    await haptic("heavy");
    await haptic("success");
    expect(Haptics.impact).toHaveBeenNthCalledWith(1, { style: "LIGHT" });
    expect(Haptics.impact).toHaveBeenNthCalledWith(2, { style: "HEAVY" });
    expect(Haptics.notification).toHaveBeenCalledWith({ type: "SUCCESS" });
  });

  it("plays a selection tick as start/changed/end", async () => {
    env.platform = "ios";
    await haptic("selection");
    expect(Haptics.selectionStart).toHaveBeenCalled();
    expect(Haptics.selectionChanged).toHaveBeenCalled();
    expect(Haptics.selectionEnd).toHaveBeenCalled();
  });

  it("only vibrates on the web for moments worth feeling", async () => {
    const vibrate = vi.fn(() => true);
    setNavigator({ vibrate });
    await haptic("light");
    await haptic("selection");
    expect(vibrate).not.toHaveBeenCalled();
    await haptic("success");
    expect(vibrate).toHaveBeenCalledWith([12, 60, 18]);
    expect(Haptics.notification).not.toHaveBeenCalled();
  });

  it("never throws when the native call fails", async () => {
    env.platform = "ios";
    vi.mocked(Haptics.impact).mockRejectedValueOnce(new Error("no engine"));
    await expect(haptic("medium")).resolves.toBeUndefined();
  });
});

describe("persistent storage", () => {
  it("uses localStorage on the web", async () => {
    await setStored("jaxsquares.clientId", "web-id");
    expect(localStorage.getItem("jaxsquares.clientId")).toBe("web-id");
    await expect(getStored("jaxsquares.clientId")).resolves.toBe("web-id");
    await removeStored("jaxsquares.clientId");
    await expect(getStored("jaxsquares.clientId")).resolves.toBeNull();
    expect(Preferences.set).not.toHaveBeenCalled();
  });

  it("keeps working in memory when localStorage throws", async () => {
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new DOMException("quota", "QuotaExceededError");
    });
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new DOMException("denied", "SecurityError");
    });
    await setStored("k", "v");
    await expect(getStored("k")).resolves.toBe("v");
  });

  it("writes through to Preferences in the app and mirrors to localStorage", async () => {
    env.platform = "ios";
    await setStored("jaxsquares.clientId", "device-1");
    expect(prefs.get("jaxsquares.clientId")).toBe("device-1");
    expect(localStorage.getItem("jaxsquares.clientId")).toBe("device-1");
  });

  it("restores localStorage from Preferences after iOS clears WebView storage", async () => {
    env.platform = "ios";
    prefs.set("jaxsquares.clientId", "device-1");
    await expect(getStored("jaxsquares.clientId")).resolves.toBe("device-1");
    expect(localStorage.getItem("jaxsquares.clientId")).toBe("device-1");
  });

  it("adopts a value that only exists in localStorage", async () => {
    env.platform = "ios";
    localStorage.setItem("jaxsquares.clientId", "legacy");
    await expect(getStored("jaxsquares.clientId")).resolves.toBe("legacy");
    expect(prefs.get("jaxsquares.clientId")).toBe("legacy");
  });
});

describe("initNative", () => {
  it("does nothing in a browser", () => {
    const navigate = vi.fn();
    initNative({ navigate })();
    expect(listeners.size).toBe(0);
  });

  it("routes our links into the SPA and hides the splash after paint", async () => {
    env.platform = "ios";
    vi.spyOn(window, "requestAnimationFrame").mockImplementation((cb) => {
      cb(0);
      return 0;
    });
    const navigate = vi.fn();
    const stop = initNative({ navigate });
    await Promise.resolve();
    const open = listeners.get("appUrlOpen");
    expect(open).toBeDefined();
    open?.({ url: "https://jaxsquares.com/g/abc123" });
    open?.({ url: "https://elsewhere.example/g/abc123" });
    expect(navigate).toHaveBeenCalledTimes(1);
    expect(navigate).toHaveBeenCalledWith("/g/abc123");
    expect(SplashScreen.hide).toHaveBeenCalled();
    stop();
  });
});
