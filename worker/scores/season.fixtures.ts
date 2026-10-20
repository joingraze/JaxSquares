// Test-only: ESPN's teams list and a team's schedule, in the shape ESPN's
// site API answers (fields we don't read trimmed; see espn.ts "A team's
// season"). The sandbox can't reach ESPN, so these stand in for it; the probe
// (espn.probe.ts) checks the real thing parses the same way.

export interface FixtureTeam {
  id: string;
  abbreviation: string;
  displayName: string;
  shortDisplayName: string;
  location: string;
  name: string;
  color?: string;
  logo?: string;
}

export const NFL: Record<"jax" | "mia" | "hou" | "ten" | "ind" | "kc", FixtureTeam> = {
  jax: { id: "30", abbreviation: "JAX", displayName: "Jacksonville Jaguars", shortDisplayName: "Jaguars", location: "Jacksonville", name: "Jaguars", color: "007487", logo: "https://a.espncdn.com/i/teamlogos/nfl/500/jax.png" },
  mia: { id: "15", abbreviation: "MIA", displayName: "Miami Dolphins", shortDisplayName: "Dolphins", location: "Miami", name: "Dolphins", color: "008e97", logo: "https://a.espncdn.com/i/teamlogos/nfl/500/mia.png" },
  hou: { id: "34", abbreviation: "HOU", displayName: "Houston Texans", shortDisplayName: "Texans", location: "Houston", name: "Texans", color: "03202f", logo: "https://a.espncdn.com/i/teamlogos/nfl/500/hou.png" },
  ten: { id: "10", abbreviation: "TEN", displayName: "Tennessee Titans", shortDisplayName: "Titans", location: "Tennessee", name: "Titans", color: "4b92db", logo: "https://a.espncdn.com/i/teamlogos/nfl/500/ten.png" },
  ind: { id: "11", abbreviation: "IND", displayName: "Indianapolis Colts", shortDisplayName: "Colts", location: "Indianapolis", name: "Colts", color: "003b75", logo: "https://a.espncdn.com/i/teamlogos/nfl/500/ind.png" },
  kc: { id: "12", abbreviation: "KC", displayName: "Kansas City Chiefs", shortDisplayName: "Chiefs", location: "Kansas City", name: "Chiefs", color: "e31837", logo: "https://a.espncdn.com/i/teamlogos/nfl/500/kc.png" },
};

export const NBA: Record<"lal" | "bos" | "gs", FixtureTeam> = {
  lal: { id: "13", abbreviation: "LAL", displayName: "Los Angeles Lakers", shortDisplayName: "Lakers", location: "Los Angeles", name: "Lakers", color: "552583", logo: "https://a.espncdn.com/i/teamlogos/nba/500/lal.png" },
  bos: { id: "2", abbreviation: "BOS", displayName: "Boston Celtics", shortDisplayName: "Celtics", location: "Boston", name: "Celtics", color: "008348", logo: "https://a.espncdn.com/i/teamlogos/nba/500/bos.png" },
  gs: { id: "9", abbreviation: "GS", displayName: "Golden State Warriors", shortDisplayName: "Warriors", location: "Golden State", name: "Warriors", color: "1d428a", logo: "https://a.espncdn.com/i/teamlogos/nba/500/gs.png" },
};

/** GET .../teams: the league's teams. */
export function teamsList(teams: FixtureTeam[]): unknown {
  return {
    sports: [
      {
        id: "20",
        name: "Football",
        leagues: [
          {
            id: "28",
            name: "National Football League",
            abbreviation: "NFL",
            teams: teams.map((t) => ({
              team: {
                id: t.id,
                uid: `s:20~l:28~t:${t.id}`,
                slug: t.displayName.toLowerCase().replace(/\s+/g, "-"),
                abbreviation: t.abbreviation,
                displayName: t.displayName,
                shortDisplayName: t.shortDisplayName,
                name: t.name,
                nickname: t.shortDisplayName,
                location: t.location,
                color: t.color,
                alternateColor: "ffffff",
                isActive: true,
                isAllStar: false,
                logos: t.logo ? [{ href: t.logo, alt: "", rel: ["full", "default"], width: 500, height: 500 }] : [],
              },
            })),
            year: 2026,
          },
        ],
      },
    ],
  };
}

export interface ScheduleGame {
  id: string;
  date: number;
  home: FixtureTeam;
  away: FixtureTeam;
  /** 2 regular season, 3 postseason. */
  seasonType?: number;
  week?: { number: number; text: string };
  state?: "pre" | "in" | "post";
  score?: { home: number; away: number };
}

const competitor = (t: FixtureTeam, homeAway: "home" | "away", score: number | undefined, winner: boolean | undefined) => ({
  id: t.id,
  type: "team",
  order: homeAway === "home" ? 0 : 1,
  homeAway,
  ...(winner === undefined ? {} : { winner }),
  team: {
    id: t.id,
    location: t.location,
    nickname: t.shortDisplayName,
    abbreviation: t.abbreviation,
    displayName: t.displayName,
    shortDisplayName: t.shortDisplayName,
    logos: t.logo ? [{ href: t.logo, rel: ["full", "default"], width: 500, height: 500 }] : [],
    links: [],
  },
  ...(score === undefined ? {} : { score: { value: score, displayValue: String(score) } }),
});

/** GET .../teams/<id>/schedule?season=<year>&seasontype=<n>. */
export function teamSchedule(team: FixtureTeam, year: number, games: ScheduleGame[], seasonType = 2): unknown {
  return {
    timestamp: "2026-10-19T12:00:00Z",
    status: "success",
    season: { year, type: seasonType, name: seasonType === 3 ? "Postseason" : "Regular Season", displayName: String(year) },
    team: {
      id: team.id,
      abbreviation: team.abbreviation,
      location: team.location,
      name: team.name,
      displayName: team.displayName,
      clubhouse: `https://www.espn.com/nfl/team/_/name/${team.abbreviation.toLowerCase()}`,
      color: team.color,
      logo: team.logo,
      recordSummary: "4-2",
      seasonSummary: `${year} Regular Season`,
      standingSummary: "1st in AFC South",
    },
    events: games.map((g) => {
      const state = g.state ?? "pre";
      const done = state === "post";
      const date = new Date(g.date).toISOString().replace(/:\d\d\.\d+Z$/, "Z");
      return {
        id: g.id,
        date,
        name: `${g.away.displayName} at ${g.home.displayName}`,
        shortName: `${g.away.abbreviation} @ ${g.home.abbreviation}`,
        season: { year, displayName: String(year) },
        seasonType: { id: String(g.seasonType ?? seasonType), type: g.seasonType ?? seasonType, name: "Regular Season", abbreviation: "reg" },
        ...(g.week ? { week: g.week } : {}),
        timeValid: true,
        competitions: [
          {
            id: g.id,
            date,
            attendance: 0,
            timeValid: true,
            neutralSite: false,
            boxscoreAvailable: done,
            venue: { fullName: "EverBank Stadium", address: { city: "Jacksonville", state: "FL" } },
            competitors: [
              competitor(g.home, "home", done ? g.score?.home : undefined, done ? (g.score?.home ?? 0) > (g.score?.away ?? 0) : undefined),
              competitor(g.away, "away", done ? g.score?.away : undefined, done ? (g.score?.away ?? 0) > (g.score?.home ?? 0) : undefined),
            ],
            notes: [],
            status: {
              clock: 0,
              displayClock: "0:00",
              period: done ? 4 : 0,
              type: {
                id: done ? "3" : "1",
                name: done ? "STATUS_FINAL" : state === "in" ? "STATUS_IN_PROGRESS" : "STATUS_SCHEDULED",
                state,
                completed: done,
                description: done ? "Final" : "Scheduled",
                detail: done ? "Final" : "Sun, October 26th at 1:00 PM EDT",
                shortDetail: done ? "Final" : "10/26 - 1:00 PM EDT",
              },
            },
          },
        ],
        links: [],
      };
    }),
    requestedSeason: { year, type: seasonType, name: seasonType === 3 ? "Postseason" : "Regular Season", displayName: String(year) },
    byeWeek: 8,
  };
}
