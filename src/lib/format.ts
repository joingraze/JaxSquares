// Display helpers shared by screens: names, colors, times and counts.
// Pure functions (no React, no IO) so they are easy to test.

import type { CSSProperties } from "react";
import type { GameStatus, Team } from "../../shared/types";

// ---- Names ----

export function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return [...parts[0]].slice(0, 2).join("").toUpperCase();
  return ([...parts[0]][0] + [...parts[parts.length - 1]][0]).toUpperCase();
}

export function pluralize(n: number, one: string, many = `${one}s`): string {
  return `${n.toLocaleString("en-US")} ${n === 1 ? one : many}`;
}

// ---- Colors ----

const HEX_RE = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i;

export function isHexColor(value: unknown): value is string {
  return typeof value === "string" && HEX_RE.test(value);
}

function rgbOf(hex: string): [number, number, number] | null {
  if (!isHexColor(hex)) return null;
  let h = hex.slice(1);
  if (h.length === 3) h = [...h].map((c) => c + c).join("");
  const n = parseInt(h, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/** WCAG relative luminance (0 = black, 1 = white). */
export function luminance(hex: string): number {
  const rgb = rgbOf(hex);
  if (!rgb) return 0;
  const [r, g, b] = rgb.map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

const INK_DARK = "#060c09";
const INK_LIGHT = "#ffffff";

/** Text color with the better contrast on top of `bg`. */
export function contrastText(bg: string): string {
  const l = luminance(bg);
  const whiteText = 1.05 / (l + 0.05);
  const darkText = (l + 0.05) / (luminance(INK_DARK) + 0.05);
  return darkText >= whiteText ? INK_DARK : INK_LIGHT;
}

export function withAlpha(hex: string, alpha: number): string {
  const rgb = rgbOf(hex);
  if (!rgb) return hex;
  return `rgb(${rgb[0]} ${rgb[1]} ${rgb[2]} / ${Math.max(0, Math.min(1, alpha))})`;
}

/**
 * Team colors as CSS variables for a board container, so `bg-team-x`,
 * `text-team-y-ink` etc. work underneath it. Very dark team colors are lifted
 * so they still read on the night background.
 */
export function teamVars(teamX: Pick<Team, "color">, teamY: Pick<Team, "color">): CSSProperties {
  const x = readableTeamColor(teamX.color, "#3ab7ff");
  const y = distinctFrom(x, readableTeamColor(teamY.color, "#ff66a6"));
  return {
    "--team-x": x,
    "--team-y": y,
    "--team-x-ink": contrastText(x),
    "--team-y-ink": contrastText(y),
  } as CSSProperties;
}

/** Below this RGB distance two team colors read as the same (e.g. two navy jerseys). */
const TEAM_MIN_DISTANCE = 90;

/**
 * Team Y's color, swapped for a contrasting fallback when it's too close to
 * team X's (Cowboys vs Giants are both navy), so the axes stay tellable apart.
 */
export function distinctFrom(x: string, y: string): string {
  const distance = (a: string, b: string) => {
    const [ar, ag, ab] = rgbOf(a) ?? [0, 0, 0];
    const [br, bg, bb] = rgbOf(b) ?? [0, 0, 0];
    return Math.hypot(ar - br, ag - bg, ab - bb);
  };
  if (distance(x, y) >= TEAM_MIN_DISTANCE) return y;
  return ["#ff66a6", "#ffc233", "#3ab7ff"].find((c) => distance(x, c) >= TEAM_MIN_DISTANCE) ?? y;
}

/** Minimum HSL lightness for a team color on the night canvas. */
const TEAM_MIN_LIGHTNESS = 0.34;

/**
 * A team color that stays visible on the dark canvas: navy, black and forest
 * green jerseys are lifted in lightness while keeping their hue and saturation,
 * so Green Bay still reads green rather than grey.
 */
export function readableTeamColor(color: string | undefined, fallback: string): string {
  if (!isHexColor(color)) return fallback;
  const [r, g, b] = rgbOf(color)!.map((v) => v / 255);
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (l >= TEAM_MIN_LIGHTNESS) return color.toLowerCase();
  const d = max - min;
  const s = d === 0 ? 0 : d / (1 - Math.abs(2 * l - 1));
  let h = 0;
  if (d !== 0) {
    if (max === r) h = ((g - b) / d) % 6;
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
  }
  return hslToHex(h * 60, s, TEAM_MIN_LIGHTNESS);
}

function hslToHex(h: number, s: number, l: number): string {
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const hp = (((h % 360) + 360) % 360) / 60;
  const x = c * (1 - Math.abs((hp % 2) - 1));
  const [r1, g1, b1] =
    hp < 1 ? [c, x, 0] : hp < 2 ? [x, c, 0] : hp < 3 ? [0, c, x] : hp < 4 ? [0, x, c] : hp < 5 ? [x, 0, c] : [c, 0, x];
  const m = l - c / 2;
  return `#${[r1, g1, b1].map((v) => Math.round((v + m) * 255).toString(16).padStart(2, "0")).join("")}`;
}

// ---- Time ----

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

function startOfDay(ts: number): number {
  const d = new Date(ts);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

/** "just now", "5m ago", "3h ago", "Yesterday", "Mon", "Oct 3". */
export function relativeTime(ts: number, now = Date.now()): string {
  const diff = now - ts;
  if (diff < 45_000) return "just now";
  if (diff < HOUR) return `${Math.round(diff / MINUTE)}m ago`;
  if (diff < 12 * HOUR) return `${Math.round(diff / HOUR)}h ago`;
  const days = Math.round((startOfDay(now) - startOfDay(ts)) / DAY);
  if (days <= 0) return `${Math.round(diff / HOUR)}h ago`;
  if (days === 1) return "Yesterday";
  if (days < 7) return new Date(ts).toLocaleDateString("en-US", { weekday: "short" });
  return new Date(ts).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

/** Kickoff label: "Today 8:20 PM", "Tomorrow 1:00 PM", "Sun 4:25 PM", "Oct 26 · 1:00 PM". */
export function kickoffLabel(ts: number, now = Date.now()): string {
  const time = new Date(ts).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
  const days = Math.round((startOfDay(ts) - startOfDay(now)) / DAY);
  if (days === 0) return `Today ${time}`;
  if (days === 1) return `Tomorrow ${time}`;
  if (days > 1 && days < 7) return `${new Date(ts).toLocaleDateString("en-US", { weekday: "short" })} ${time}`;
  return `${new Date(ts).toLocaleDateString("en-US", { month: "short", day: "numeric" })} · ${time}`;
}

/** Compact countdown: "2d 4h", "3h 12m", "45m", "<1m". */
export function countdown(ms: number): string {
  if (ms <= 0) return "now";
  const d = Math.floor(ms / DAY);
  const h = Math.floor((ms % DAY) / HOUR);
  const m = Math.floor((ms % HOUR) / MINUTE);
  if (d > 0) return `${d}d ${h}h`;
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m`;
  return "<1m";
}

// ---- Game ----

/** "21–14" with an en dash; X (columns) first to match the board. */
export function scoreLine(scoreX: number, scoreY: number): string {
  return `${scoreX}–${scoreY}`;
}

export const STATUS_LABEL: Record<GameStatus, string> = {
  draft: "Draft",
  open: "Picking squares",
  locked: "Numbers drawn",
  final: "Final",
};
