// Request cleaning shared by the core routes (worker/index.ts) and season
// boards (worker/season.ts): single-line text, colors and teams as a client
// sends them. Never throws; anything malformed is dropped.

import type { Team } from "../shared/types";

/** Single-line text: control chars stripped, whitespace collapsed, capped by code points. */
export function cleanText(v: unknown, max: number): string {
  if (typeof v !== "string") return "";
  // Control and bidi-override characters; ZWJ is kept so emoji sequences survive.
  const s = v.replace(/[\p{Cc}\u202a-\u202e\u2066-\u2069]/gu, "").replace(/\s+/g, " ").trim();
  return Array.from(s).slice(0, max).join("").trim();
}

export function cleanColor(v: unknown): string | null {
  return typeof v === "string" && /^#[0-9a-fA-F]{6}$/.test(v) ? v.toLowerCase() : null;
}

export function cleanTeam(v: unknown): Team | null {
  if (!v || typeof v !== "object") return null;
  const t = v as Record<string, unknown>;
  const name = cleanText(t.name, 40);
  if (!name) return null;
  const team: Team = { name };
  const abbr = cleanText(t.abbr, 6).toUpperCase();
  if (/^[A-Z0-9&.]{1,6}$/.test(abbr)) team.abbr = abbr;
  const color = cleanColor(t.color);
  if (color) team.color = color;
  return team;
}
