import { describe, expect, it } from "vitest";
import {
  contrastRatio,
  contrastText,
  distinctFrom,
  countdown,
  initialsOf,
  luminance,
  pluralize,
  readableTeamColor,
  relativeTime,
  scoreLine,
  shortMatchup,
  shortTeam,
  shortTeamName,
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

describe("team colors on the light theme", () => {
  /** --color-canvas of the light theme (src/index.css). */
  const LIGHT_CANVAS = "#eef2ec";
  const hueOf = (hex: string) => {
    const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
    const max = Math.max(r, g, b);
    const d = max - Math.min(r, g, b);
    if (d === 0) return 0;
    const h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
    return (h * 60 + 360) % 360;
  };

  it("keeps colors that already read on the light canvas, dark jerseys included", () => {
    expect(readableTeamColor("#e31837", "#000", "light")).toBe("#e31837"); // Chiefs red
    expect(readableTeamColor("#041E42", "#000", "light")).toBe("#041e42"); // Cowboys navy: not lifted like on dark
    expect(readableTeamColor("#203731", "#000", "light")).toBe("#203731");
  });

  it("darkens too-light colors to 3:1 against the canvas, keeping the hue", () => {
    for (const bright of ["#ffb612", "#ffc233", "#a5acaf", "#69db7c", "#ffffff"]) {
      const out = readableTeamColor(bright, "#000", "light");
      expect(out).not.toBe(bright);
      expect(contrastRatio(out, LIGHT_CANVAS)).toBeGreaterThanOrEqual(3);
      // The lightest passing shade, not a needless trip to black.
      expect(contrastRatio(out, LIGHT_CANVAS)).toBeLessThan(3.3);
      if (bright !== "#ffffff" && bright !== "#a5acaf") expect(Math.abs(hueOf(out) - hueOf(bright))).toBeLessThan(4);
    }
  });

  it("darkens the stock fallbacks too", () => {
    const out = readableTeamColor(undefined, "#3ab7ff", "light");
    expect(contrastRatio(out, LIGHT_CANVAS)).toBeGreaterThanOrEqual(3);
    expect(readableTeamColor(undefined, "#123456", "dark")).toBe("#123456");
  });

  it("gives teamVars legible colors and matching ink per theme", () => {
    const dark = teamVars({ color: "#ffb612" }, { color: "#041e42" }) as Record<string, string>;
    expect(dark["--team-x"]).toBe("#ffb612");
    expect(dark["--team-x-ink"]).toBe("#060c09");
    expect(luminance(dark["--team-y"])).toBeGreaterThan(luminance("#041e42")); // lifted for the night canvas

    const light = teamVars({ color: "#ffb612" }, { color: "#041e42" }, "light") as Record<string, string>;
    expect(contrastRatio(light["--team-x"], LIGHT_CANVAS)).toBeGreaterThanOrEqual(3);
    expect(light["--team-y"]).toBe("#041e42");
    expect(light["--team-x-ink"]).toBe(contrastText(light["--team-x"]));
    expect(light["--team-y-ink"]).toBe("#ffffff");
  });

  it("swaps a clashing second color for a fallback that also reads on light", () => {
    const y = distinctFrom("#3d5a8a", "#3a5f8f", "light");
    expect(y).not.toBe("#3a5f8f");
    expect(contrastRatio(y, LIGHT_CANVAS)).toBeGreaterThanOrEqual(3);
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

describe("distinctFrom", () => {
  it("keeps team colors that are already easy to tell apart", () => {
    expect(distinctFrom("#e31837", "#00338d")).toBe("#00338d");
  });
  it("swaps a near-identical second team color for a contrasting one", () => {
    const y = distinctFrom("#3d5a8a", "#3a5f8f");
    expect(y).not.toBe("#3a5f8f");
    expect(["#ff66a6", "#ffc233", "#3ab7ff"]).toContain(y);
  });
});

describe("shortTeamName", () => {
  it("uses the NFL nickname", () => {
    expect(shortTeamName({ name: "Kansas City Chiefs", abbr: "KC" }, "nfl")).toBe("Chiefs");
    expect(shortTeamName({ name: "Los Angeles Rams" }, "nfl")).toBe("Rams");
    expect(shortTeamName({ name: "Unknown Team" }, "nfl")).toBe("Unknown Team");
  });

  it("drops the college mascot, including two-word ones", () => {
    expect(shortTeamName({ name: "Georgia Bulldogs" }, "ncaaf")).toBe("Georgia");
    expect(shortTeamName({ name: "Ohio State Buckeyes" }, "ncaaf")).toBe("Ohio State");
    expect(shortTeamName({ name: "Alabama Crimson Tide" }, "ncaaf")).toBe("Alabama");
    expect(shortTeamName({ name: "Penn State Nittany Lions" }, "ncaaf")).toBe("Penn State");
    expect(shortTeamName({ name: "North Texas Mean Green" }, "ncaaf")).toBe("North Texas");
    expect(shortTeamName({ name: "Bowling Green Falcons" }, "ncaaf")).toBe("Bowling Green");
    expect(shortTeamName({ name: "Army" }, "ncaaf")).toBe("Army");
  });

  it("doesn't confuse college abbreviations with NFL ones", () => {
    expect(shortTeamName({ name: "Miami Hurricanes", abbr: "MIA" }, "ncaaf")).toBe("Miami");
  });
});

describe("shortTeam / shortMatchup", () => {
  const game = { name: "Sunday Night Squares", league: "custom" as const, teamX: { name: "Chiefs" }, teamY: { name: "Bills" } };

  it("shortens the matchup to the names people text", () => {
    const packers = { name: "Green Bay Packers", abbr: "GB" };
    const bears = { name: "Chicago Bears", abbr: "CHI" };
    // A typed NFL team is stored with its full name; a linked one too.
    expect(shortMatchup({ ...game, teamX: packers, teamY: bears })).toBe("Packers vs Bears");
    expect(shortMatchup({ ...game, league: "nfl", teamX: packers, teamY: bears })).toBe("Packers vs Bears");
    expect(shortTeam({ name: "Penn State Nittany Lions", abbr: "PSU" }, "ncaaf")).toBe("Penn State");
    expect(shortTeam({ name: "Ohio State Buckeyes", abbr: "OSU" }, "ncaaf")).toBe("Ohio State");
    expect(shortTeam({ name: "Kansas City Chiefs", abbr: "KC" }, "nfl")).toBe("Chiefs");
    // Typed custom teams stay as typed.
    expect(shortMatchup(game)).toBe("Chiefs vs Bills");
    expect(shortMatchup({ ...game, teamX: { name: "The Smiths" }, teamY: { name: "The Joneses" } })).toBe("The Smiths vs The Joneses");
    expect(shortMatchup({ ...game, teamY: { name: " " } })).toBe("Sunday Night Squares");
  });
});
