import type { MatchupProps, OnThisDayProps } from "./Templates";

// Schedule facts: nflverse 2026 schedule + network/time confirmations from 2026
// sources (see marketing/launch-plan/research/). Team names are used only to
// identify games: no logos or team colors (see namedTeam in Templates.tsx).
export const MATCHUPS: { id: string; title: string; props: MatchupProps }[] = [
  {
    id: "m1-mnf-cowboys-eagles",
    title: "Matchup: MNF Cowboys at Eagles (Oct 26)",
    props: {
      kicker: "Monday Night · Oct 26",
      away: "Cowboys",
      home: "Eagles",
      hook: "Launch night. Run the board.",
      detail: "8:15 PM ET · ESPN / ABC",
      endLine: "Cowboys–Eagles squares|in 20 seconds.",
      seed: 11,
    },
  },
  {
    id: "m2-florida-georgia",
    title: "Matchup: Florida vs Georgia (Oct 31)",
    props: {
      kicker: "Sat Oct 31 · 3:30 PM ET",
      away: "Florida",
      home: "Georgia",
      joiner: "vs",
      hook: "It left Jax. Your board didn't.",
      detail: "In Atlanta this year · ABC",
      endLine: "Cocktail Party squares|from anywhere.",
      seed: 12,
    },
  },
  {
    id: "m3-colts-jaguars",
    title: "Matchup: Colts at Jaguars (Nov 1)",
    props: {
      kicker: "Sunday · Nov 1 · 1:00 PM ET",
      away: "Colts",
      home: "Jaguars",
      hook: "The Jags are home. Fill the board.",
      detail: "EverBank Stadium · CBS",
      endLine: "Sunday squares|in 20 seconds.",
      seed: 13,
    },
  },
  {
    id: "m4-tnf-jaguars-ravens",
    title: "Matchup: TNF Jaguars at Ravens (Nov 5)",
    props: {
      kicker: "Thursday Night · Nov 5",
      away: "Jaguars",
      home: "Ravens",
      hook: "Jags in primetime. Run it.",
      detail: "8:15 PM ET · Prime Video",
      endLine: "Thursday night squares|in 20 seconds.",
      seed: 14,
    },
  },
  {
    id: "m5-miami-notre-dame",
    title: "Matchup: Miami at Notre Dame (Nov 7)",
    props: {
      kicker: "Saturday · Nov 7 · 7:30 PM ET",
      away: "Miami",
      home: "Notre Dame",
      hook: "Saturday night. Board's open.",
      detail: "NBC · Peacock",
      endLine: "College squares|in 20 seconds.",
      seed: 15,
    },
  },
  {
    id: "m6-snf-mexico-city",
    title: "Matchup: SNF Vikings vs 49ers, Mexico City (Nov 22)",
    props: {
      kicker: "Sunday Night · Nov 22",
      away: "Vikings",
      home: "49ers",
      joiner: "vs",
      hook: "Squares go to Mexico City 🇲🇽",
      detail: "8:20 PM ET · NBC · Estadio Banorte",
      endLine: "Sunday night squares|in 20 seconds.",
      seed: 16,
    },
  },
  {
    id: "m7-thanksgiving-eve",
    title: "Matchup: Thanksgiving Eve Packers at Rams (Nov 25)",
    props: {
      kicker: "Thanksgiving Eve · Wed Nov 25",
      away: "Packers",
      home: "Rams",
      hook: "First-ever Thanksgiving Eve game.",
      detail: "8:00 PM ET · Netflix",
      endLine: "Thanksgiving Eve squares|in 20 seconds.",
      seed: 17,
    },
  },
];

// Every final score below was checked against Pro Football Hall of Fame / team /
// league sources, and against nflverse for games since 1999.
export const ON_THIS_DAY: { id: string; title: string; props: OnThisDayProps }[] = [
  {
    id: "otd1-oct27-emmitt",
    title: "On this day: Oct 27, 2002 — Emmitt's record",
    props: {
      month: "OCT",
      day: 27,
      year: 2002,
      fact: "Ex-Gator *Emmitt Smith*|breaks Walter Payton's|rushing record",
      winner: { name: "Seahawks", score: 17, abbr: "SEA" },
      loser: { name: "Cowboys", score: 14, abbr: "DAL" },
      note: "Emmitt made history. Dallas still lost. The 7–4 square didn't care.",
    },
  },
  {
    id: "otd2-nov02-cam-little",
    title: "On this day: Nov 2, 2025 — Cam Little 68-yarder",
    props: {
      month: "NOV",
      day: 2,
      year: 2025,
      tag: "1 year ago today",
      fact: "Cam Little drills an|NFL-record *68-yard*|field goal",
      winner: { name: "Jaguars", score: 30, abbr: "JAX" },
      loser: { name: "Raiders", score: 29, abbr: "LV" },
      note: "A record kick in a 30–29 overtime win in Las Vegas.",
    },
  },
  {
    id: "otd3-nov08-dempsey",
    title: "On this day: Nov 8, 1970 — Dempsey's 63-yarder",
    props: {
      month: "NOV",
      day: 8,
      year: 1970,
      fact: "Tom Dempsey's *63-yarder*|wins it at the gun",
      winner: { name: "Saints", score: 19, abbr: "NO" },
      loser: { name: "Lions", score: 17, abbr: "DET" },
      note: "19–17 strikes again: same final as the Miracle at the Meadowlands (1978).",
    },
  },
  {
    id: "otd4-nov19-rams-chiefs",
    title: "On this day: Nov 19, 2018 — Rams 54, Chiefs 51",
    props: {
      month: "NOV",
      day: 19,
      year: 2018,
      fact: "The first NFL game with|*both teams over 50*",
      winner: { name: "Rams", score: 54, abbr: "LA" },
      loser: { name: "Chiefs", score: 51, abbr: "KC" },
      note: "105 points on Monday Night — still the highest-scoring MNF game.",
    },
  },
  {
    id: "otd5-nov20-the-play",
    title: "On this day: Nov 20, 1982 — The Play",
    props: {
      month: "NOV",
      day: 20,
      year: 1982,
      fact: "*The Play:* five laterals|through the Stanford band",
      winner: { name: "Cal", score: 25, abbr: "CAL" },
      loser: { name: "Stanford", score: 20, abbr: "STAN" },
      note: "Stanford led 20–19 with 4 seconds left. The winning square flipped from 9–0 to 5–0 on the last play.",
    },
  },
  {
    id: "otd6-nov26-grange",
    title: "On this day: Nov 26, 1925 — Red Grange's Thanksgiving debut",
    props: {
      month: "NOV",
      day: 26,
      year: 1925,
      tag: "Thanksgiving, 101 years ago",
      fact: "Red Grange makes his|NFL debut *on Thanksgiving*",
      winner: { name: "Bears", score: 0, abbr: "CHI" },
      loser: { name: "Cardinals", score: 0, abbr: "CHC" },
      note: "A 0–0 tie, so the same square won every quarter.",
    },
  },
];
