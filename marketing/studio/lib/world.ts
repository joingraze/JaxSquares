// The fictional world shared with the App Store screenshots and the recorded
// clips (mirrors scripts/store/seed.mjs): made-up teams and people, prize notes
// that never mention money.

import { seeded } from "./anim";

export interface Team {
  name: string;
  abbr: string;
  color: string;
}

export interface Person {
  name: string;
  color: string;
  emoji: string;
}

export const TEAMS = {
  hawks: { name: "Harbor Hawks", abbr: "HAR", color: "#3ab7ff" },
  wolves: { name: "Ridge Wolves", abbr: "RDG", color: "#ff66a6" },
  comets: { name: "Bay Comets", abbr: "BAY", color: "#9b6bff" },
  foxes: { name: "Mesa Foxes", abbr: "MSA", color: "#ff8a3d" },
  otters: { name: "Lakeside Otters", abbr: "LAK", color: "#1fd1c1" },
  stags: { name: "Summit Stags", abbr: "SUM", color: "#ff4757" },
} satisfies Record<string, Team>;

export const ME: Person = { name: "Jordan", color: "#ff6b35", emoji: "🏈" };

export const FRIENDS: Person[] = [
  { name: "Maya", color: "#ff4f9a", emoji: "🦄" },
  { name: "Dre", color: "#38b6ff", emoji: "🐻" },
  { name: "Priya", color: "#ffd23f", emoji: "🌮" },
  { name: "Luis", color: "#34d07b", emoji: "🦖" },
  { name: "Tess", color: "#9b6bff", emoji: "🥳" },
  { name: "Omar", color: "#ffa26b", emoji: "🚀" },
  { name: "Kim", color: "#1fd1c1", emoji: "🍕" },
  { name: "Sam", color: "#5b74ff", emoji: "🦈" },
  { name: "Ava", color: "#ff4757", emoji: "👑" },
  { name: "Ben", color: "#e6ede8", emoji: "🐐" },
];

export const PEOPLE: Person[] = [ME, ...FRIENDS];

/** A full or partly full board, deterministic per seed: cell key → person. */
export function boardOf(seed: number, fill = 1): Map<string, Person> {
  const rnd = seeded(seed);
  const cells: string[] = [];
  for (let r = 0; r < 10; r++) for (let c = 0; c < 10; c++) cells.push(`${r},${c}`);
  for (let i = cells.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [cells[i], cells[j]] = [cells[j], cells[i]];
  }
  const out = new Map<string, Person>();
  cells.slice(0, Math.round(100 * fill)).forEach((k, i) => out.set(k, PEOPLE[i % PEOPLE.length]));
  return out;
}

/** Fisher–Yates digits 0–9 for a board's axis. */
export function digitsOf(seed: number): number[] {
  const rnd = seeded(seed);
  const d = Array.from({ length: 10 }, (_, i) => i);
  for (let i = d.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [d[i], d[j]] = [d[j], d[i]];
  }
  return d;
}
