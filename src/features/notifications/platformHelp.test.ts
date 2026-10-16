import { describe, expect, it } from "vitest";
import { blockedSteps } from "./platformHelp";
import { openedByTap, noteTap, rememberAskDismissed, shouldShowAsk, wasAskDismissed, clearAskDismissals } from "./prefs";

describe("blockedSteps", () => {
  it("points the iOS app and home-screen web app at Settings", () => {
    const app = blockedSteps({ app: "ios", ios: true, standalone: false });
    expect(app[1]).toMatch(/Notifications, then JaxSquares/);
    expect(blockedSteps({ app: null, ios: true, standalone: true })).toEqual(app);
  });

  it("covers Android and plain browsers", () => {
    expect(blockedSteps({ app: "android", ios: false, standalone: false })[0]).toMatch(/Apps/);
    expect(blockedSteps({ app: null, ios: false, standalone: false })[2]).toMatch(/Allow/);
  });

  it("sends an iPhone Safari tab to the Home Screen", () => {
    expect(blockedSteps({ app: null, ios: true, standalone: false })[0]).toMatch(/Home Screen/);
  });
});

describe("never nag", () => {
  it("remembers dismissals per trigger", () => {
    clearAskDismissals();
    expect(shouldShowAsk("claimed", false)).toBe(true);
    rememberAskDismissed("claimed");
    expect(wasAskDismissed("claimed")).toBe(true);
    expect(shouldShowAsk("claimed", false)).toBe(false);
    expect(shouldShowAsk("joined", false)).toBe(true);
    // An explicit tap always opens it.
    expect(shouldShowAsk("claimed", true)).toBe(true);
    clearAskDismissals();
    expect(wasAskDismissed("claimed")).toBe(false);
  });

  it("treats an open right after a tap as explicit", () => {
    noteTap(1_000);
    expect(openedByTap(1_300)).toBe(true);
    expect(openedByTap(2_500)).toBe(false);
  });
});
