import { describe, expect, it } from "vitest";
import {
  contrastText,
  countdown,
  initialsOf,
  luminance,
  pluralize,
  readableTeamColor,
  relativeTime,
  scoreLine,
  teamVars,
  withAlpha,
} from "../lib/format";

describe("names", () => {
  it("makes initials", () => {
    expect(initialsOf("")).toBe("?");
    expect(initialsOf("jax")).toBe("JA");
    expect(initialsOf("Sam  Lee")).toBe("SL");
    expect(initialsOf("Mary Jo Smith")).toBe("MS");
  });

  it("pluralizes", () => {
    expect(pluralize(1, "square")).toBe("1 square");
    expect(pluralize(3, "square")).toBe("3 squares");
    expect(pluralize(1200, "fan")).toBe("1,200 fans");
  });
});

describe("colors", () => {
  it("picks readable text on a background", () => {
    expect(contrastText("#ffffff")).toBe("#060c09");
    expect(contrastText("#c6f91f")).toBe("#060c09");
    expect(contrastText("#000000")).toBe("#ffffff");
    expect(contrastText("#e31837")).toBe("#ffffff");
  });

  it("formats alpha", () => {
    expect(withAlpha("#ff0000", 0.5)).toBe("rgb(255 0 0 / 0.5)");
    expect(withAlpha("#f00", 2)).toBe("rgb(255 0 0 / 1)");
    expect(withAlpha("nope", 0.5)).toBe("nope");
  });

  it("lifts dark team colors but keeps their hue", () => {
    expect(readableTeamColor("#e31837", "#000")).toBe("#e31837");
    expect(readableTeamColor(undefined, "#123456")).toBe("#123456");
    const gb = readableTeamColor("#203731", "#000"); // Green Bay green
    expect(luminance(gb)).toBeGreaterThan(luminance("#203731"));
    const [r, g, b] = [1, 3, 5].map((i) => parseInt(gb.slice(i, i + 2), 16));
    expect(g).toBeGreaterThan(r);
    expect(g).toBeGreaterThan(b);
  });

  it("exposes team colors as CSS variables", () => {
    const vars = teamVars({ color: "#e31837" }, {}) as Record<string, string>;
    expect(vars["--team-x"]).toBe("#e31837");
    expect(vars["--team-x-ink"]).toBe("#ffffff");
    expect(vars["--team-y"]).toBe("#ff66a6");
  });
});

describe("time", () => {
  const now = new Date(2026, 9, 16, 20, 0).getTime();

  it("formats relative times", () => {
    expect(relativeTime(now - 10_000, now)).toBe("just now");
    expect(relativeTime(now - 5 * 60_000, now)).toBe("5m ago");
    expect(relativeTime(now - 3 * 3600_000, now)).toBe("3h ago");
    expect(relativeTime(new Date(2026, 9, 15, 9).getTime(), now)).toBe("Yesterday");
  });

  it("formats countdowns", () => {
    expect(countdown(0)).toBe("now");
    expect(countdown(30_000)).toBe("<1m");
    expect(countdown(45 * 60_000)).toBe("45m");
    expect(countdown(3 * 3600_000 + 12 * 60_000)).toBe("3h 12m");
    expect(countdown(2 * 86400_000 + 4 * 3600_000)).toBe("2d 4h");
  });

  it("formats a score line with an en dash", () => {
    expect(scoreLine(21, 14)).toBe("21–14");
  });
});
