import { describe, expect, it } from "vitest";
import { avatarInitial } from "./Avatar";
import { BOTTOM_CHROME_BASE, getBottomChromeOffset, setBottomChrome } from "./bottomChrome";
import { buttonStyles, hasTextColor } from "./buttonStyles";

describe("buttonStyles", () => {
  it("keeps the variant's text color by default", () => {
    expect(buttonStyles({ variant: "ghost" })).toContain("text-ink");
    expect(buttonStyles({ variant: "primary" })).toContain("text-ink-inverse");
  });

  it("lets a className text color replace the variant's", () => {
    const cls = buttonStyles({ variant: "ghost", className: "text-brand-400" }).split(/\s+/);
    expect(cls).toContain("text-brand-400");
    expect(cls).not.toContain("text-ink");
    expect(buttonStyles({ variant: "secondary", className: "!text-gold-200" }).split(/\s+/)).not.toContain("text-ink");
  });

  it("doesn't mistake sizes, alignment or hover colors for a text color", () => {
    expect(hasTextColor("text-subhead text-center hover:text-brand-300")).toBe(false);
    expect(hasTextColor("text-[#fff]")).toBe(true);
    expect(hasTextColor("text-white/80")).toBe(true);
    expect(buttonStyles({ variant: "ghost", className: "text-footnote" }).split(/\s+/)).toContain("text-ink");
  });

  it("has an outline variant and a 44pt-tall sm size", () => {
    expect(buttonStyles({ variant: "outline" })).toContain("ring-line-strong");
    expect(buttonStyles({ size: "sm" }).split(/\s+/)).toContain("h-11");
  });
});

describe("avatarInitial", () => {
  it("is one letter, uppercased", () => {
    expect(avatarInitial("Tess")).toBe("T");
    expect(avatarInitial("  maya lopez ")).toBe("M");
    expect(avatarInitial("élodie")).toBe("É");
    expect(avatarInitial("")).toBe("?");
  });
});

describe("bottom chrome", () => {
  it("is the safe-area base with nothing registered, the max of everything otherwise", () => {
    expect(getBottomChromeOffset()).toBe(BOTTOM_CHROME_BASE);
    setBottomChrome("dock", { offset: "80px", modal: false });
    setBottomChrome("bar", { offset: "150px", modal: false });
    expect(getBottomChromeOffset()).toBe(`max(${BOTTOM_CHROME_BASE}, 80px, 150px)`);
  });

  it("counts only the open sheet while one is up", () => {
    setBottomChrome("sheet", { offset: "90px", modal: true });
    expect(getBottomChromeOffset()).toBe(`max(${BOTTOM_CHROME_BASE}, 90px)`);
    setBottomChrome("sheet", null);
    setBottomChrome("dock", null);
    setBottomChrome("bar", null);
    expect(getBottomChromeOffset()).toBe(BOTTOM_CHROME_BASE);
  });
});
