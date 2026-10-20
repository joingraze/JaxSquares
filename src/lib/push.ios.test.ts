import { afterEach, describe, expect, it, vi } from "vitest";
import { getPushState } from "./push";

// An iPhone Safari tab: no web push until JaxSquares is on the Home Screen.
const IPHONE_SAFARI = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.5 Mobile/15E148 Safari/604.1";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("an iPhone Safari tab", () => {
  it("never sends the player to the Home Screen app, whose storage is apart from Safari's (unsupported, not needs-install)", async () => {
    vi.spyOn(navigator, "userAgent", "get").mockReturnValue(IPHONE_SAFARI);
    vi.stubGlobal("matchMedia", () => ({ matches: false }));
    expect("PushManager" in window).toBe(false);
    expect(await getPushState()).toBe("unsupported");
  });
});
