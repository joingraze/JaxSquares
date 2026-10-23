// The 32 NFL teams (and, for a custom basketball board, the 30 NBA teams), for
// custom-matchup autocomplete when the live schedule is unavailable. A custom
// soccer board takes any two sides as typed (no list).
// Abbreviations match ESPN's so a custom board reads the same as a linked one.
// Colors are intentionally absent: we only use colors from live data.

import type { Sport, Team } from "./types";

export interface NflTeam {
  location: string;
  nickname: string;
  abbr: string;
}

/** A pro team in a custom matchup's suggestions (NFL or NBA): the same shape. */
export type ProTeam = NflTeam;

/** The 30 NBA teams, as ESPN names and abbreviates them ("LA Clippers", "GS", "NY", "UTAH"). */
export const NBA_TEAMS: readonly ProTeam[] = [
  { location: "Atlanta", nickname: "Hawks", abbr: "ATL" },
  { location: "Boston", nickname: "Celtics", abbr: "BOS" },
  { location: "Brooklyn", nickname: "Nets", abbr: "BKN" },
  { location: "Charlotte", nickname: "Hornets", abbr: "CHA" },
  { location: "Chicago", nickname: "Bulls", abbr: "CHI" },
  { location: "Cleveland", nickname: "Cavaliers", abbr: "CLE" },
  { location: "Dallas", nickname: "Mavericks", abbr: "DAL" },
  { location: "Denver", nickname: "Nuggets", abbr: "DEN" },
  { location: "Detroit", nickname: "Pistons", abbr: "DET" },
  { location: "Golden State", nickname: "Warriors", abbr: "GS" },
  { location: "Houston", nickname: "Rockets", abbr: "HOU" },
  { location: "Indiana", nickname: "Pacers", abbr: "IND" },
  { location: "LA", nickname: "Clippers", abbr: "LAC" },
  { location: "Los Angeles", nickname: "Lakers", abbr: "LAL" },
  { location: "Memphis", nickname: "Grizzlies", abbr: "MEM" },
  { location: "Miami", nickname: "Heat", abbr: "MIA" },
  { location: "Milwaukee", nickname: "Bucks", abbr: "MIL" },
  { location: "Minnesota", nickname: "Timberwolves", abbr: "MIN" },
  { location: "New Orleans", nickname: "Pelicans", abbr: "NO" },
  { location: "New York", nickname: "Knicks", abbr: "NY" },
  { location: "Oklahoma City", nickname: "Thunder", abbr: "OKC" },
  { location: "Orlando", nickname: "Magic", abbr: "ORL" },
  { location: "Philadelphia", nickname: "76ers", abbr: "PHI" },
  { location: "Phoenix", nickname: "Suns", abbr: "PHX" },
  { location: "Portland", nickname: "Trail Blazers", abbr: "POR" },
  { location: "Sacramento", nickname: "Kings", abbr: "SAC" },
  { location: "San Antonio", nickname: "Spurs", abbr: "SA" },
  { location: "Toronto", nickname: "Raptors", abbr: "TOR" },
  { location: "Utah", nickname: "Jazz", abbr: "UTAH" },
  { location: "Washington", nickname: "Wizards", abbr: "WSH" },
];

/** The teams a custom board suggests: the NBA's on a basketball board, none on a soccer board (any two sides), else the NFL's. */
export function teamsForSport(sport?: Sport | null): readonly ProTeam[] {
  if (sport === "soccer") return [];
  return sport === "basketball" ? NBA_TEAMS : NFL_TEAMS;
}

export const NFL_TEAMS: readonly NflTeam[] = [
  { location: "Arizona", nickname: "Cardinals", abbr: "ARI" },
  { location: "Atlanta", nickname: "Falcons", abbr: "ATL" },
  { location: "Baltimore", nickname: "Ravens", abbr: "BAL" },
  { location: "Buffalo", nickname: "Bills", abbr: "BUF" },
  { location: "Carolina", nickname: "Panthers", abbr: "CAR" },
  { location: "Chicago", nickname: "Bears", abbr: "CHI" },
  { location: "Cincinnati", nickname: "Bengals", abbr: "CIN" },
  { location: "Cleveland", nickname: "Browns", abbr: "CLE" },
  { location: "Dallas", nickname: "Cowboys", abbr: "DAL" },
  { location: "Denver", nickname: "Broncos", abbr: "DEN" },
  { location: "Detroit", nickname: "Lions", abbr: "DET" },
  { location: "Green Bay", nickname: "Packers", abbr: "GB" },
  { location: "Houston", nickname: "Texans", abbr: "HOU" },
  { location: "Indianapolis", nickname: "Colts", abbr: "IND" },
  { location: "Jacksonville", nickname: "Jaguars", abbr: "JAX" },
  { location: "Kansas City", nickname: "Chiefs", abbr: "KC" },
  { location: "Las Vegas", nickname: "Raiders", abbr: "LV" },
  { location: "Los Angeles", nickname: "Chargers", abbr: "LAC" },
  { location: "Los Angeles", nickname: "Rams", abbr: "LAR" },
  { location: "Miami", nickname: "Dolphins", abbr: "MIA" },
  { location: "Minnesota", nickname: "Vikings", abbr: "MIN" },
  { location: "New England", nickname: "Patriots", abbr: "NE" },
  { location: "New Orleans", nickname: "Saints", abbr: "NO" },
  { location: "New York", nickname: "Giants", abbr: "NYG" },
  { location: "New York", nickname: "Jets", abbr: "NYJ" },
  { location: "Philadelphia", nickname: "Eagles", abbr: "PHI" },
  { location: "Pittsburgh", nickname: "Steelers", abbr: "PIT" },
  { location: "San Francisco", nickname: "49ers", abbr: "SF" },
  { location: "Seattle", nickname: "Seahawks", abbr: "SEA" },
  { location: "Tampa Bay", nickname: "Buccaneers", abbr: "TB" },
  { location: "Tennessee", nickname: "Titans", abbr: "TEN" },
  { location: "Washington", nickname: "Commanders", abbr: "WSH" },
];

/** "Kansas City Chiefs" — the same form ESPN's displayName uses for linked boards. */
export function nflTeamName(t: NflTeam): string {
  return `${t.location} ${t.nickname}`;
}

export function nflTeamToTeam(t: NflTeam): Team {
  return { name: nflTeamName(t), abbr: t.abbr };
}

/**
 * Autocomplete matches, best first: exact abbreviation, then the nickname or full
 * name starting with the query, then any word or the abbreviation starting with
 * it, then the query anywhere in the name. Ties keep alphabetical order.
 */
export function searchNflTeams(query: string, limit = 8): NflTeam[] {
  return searchTeams(query, limit, NFL_TEAMS);
}

/** searchNflTeams over any list of teams (the NBA's for a custom basketball board). */
export function searchTeams(query: string, limit = 8, teams: readonly ProTeam[] = NFL_TEAMS): ProTeam[] {
  const q = query.trim().toLowerCase();
  if (!q) return teams.slice(0, limit);
  const ranked: { team: NflTeam; rank: number }[] = [];
  for (const team of teams) {
    const name = nflTeamName(team).toLowerCase();
    const abbr = team.abbr.toLowerCase();
    let rank: number;
    if (abbr === q) rank = 0;
    else if (team.nickname.toLowerCase().startsWith(q) || name.startsWith(q)) rank = 1;
    else if (abbr.startsWith(q) || name.split(" ").some((w) => w.startsWith(q))) rank = 2;
    else if (name.includes(q)) rank = 3;
    else continue;
    ranked.push({ team, rank });
  }
  // Array.prototype.sort is stable, so equal ranks stay in list order.
  return ranked.sort((a, b) => a.rank - b.rank).slice(0, limit).map((r) => r.team);
}
