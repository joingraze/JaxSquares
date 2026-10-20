// Test fixtures shaped like ESPN site API responses for basketball:
//   /apis/site/v2/sports/basketball/{nba|wnba|mens-college-basketball|womens-college-basketball}/scoreboard
//   /apis/site/v2/sports/basketball/{league}/summary?event=ID
// The same competition shape as football (espn.fixtures.ts), with basketball's
// own status text: "5:32 - 3rd" in a quarter, "12:41 - 2nd Half" in men's
// college, "Halftime", "End of 1st", "Final/OT", a clock in tenths in the last
// minute ("45.2"), and three-digit scores. Includes fields we ignore, so the
// parser sees realistic noise. Scores, ids and dates are invented test data.

interface TeamFixture {
  id: string;
  location: string;
  name: string;
  abbreviation: string;
  color?: string;
  alternateColor?: string;
}

export const BB_TEAMS = {
  lal: { id: "13", location: "Los Angeles", name: "Lakers", abbreviation: "LAL", color: "552583", alternateColor: "fdb927" },
  bos: { id: "2", location: "Boston", name: "Celtics", abbreviation: "BOS", color: "008348", alternateColor: "ffffff" },
  gs: { id: "9", location: "Golden State", name: "Warriors", abbreviation: "GS", color: "1d428a", alternateColor: "ffc72c" },
  lv: { id: "17", location: "Las Vegas", name: "Aces", abbreviation: "LV", color: "000000", alternateColor: "a7a8aa" },
  nyl: { id: "9", location: "New York", name: "Liberty", abbreviation: "NY", color: "86cebc", alternateColor: "000000" },
  duke: { id: "150", location: "Duke", name: "Blue Devils", abbreviation: "DUKE", color: "00539b", alternateColor: "ffffff" },
  unc: { id: "153", location: "North Carolina", name: "Tar Heels", abbreviation: "UNC", color: "7bafd4", alternateColor: "13294b" },
  // Some college teams come without colors.
  vermont: { id: "261", location: "Vermont", name: "Catamounts", abbreviation: "UVM" },
  uconn: { id: "41", location: "UConn", name: "Huskies", abbreviation: "CONN", color: "000e2f", alternateColor: "ffffff" },
  sc: { id: "2579", location: "South Carolina", name: "Gamecocks", abbreviation: "SC", color: "73000a", alternateColor: "000000" },
  tbd: { id: "-2", location: "TBD", name: "TBD", abbreviation: "TBD" },
} satisfies Record<string, TeamFixture>;

export type BasketballPath = "nba" | "wnba" | "mens-college-basketball" | "womens-college-basketball";

function team(t: TeamFixture, path: BasketballPath) {
  return {
    id: t.id,
    uid: `s:40~l:46~t:${t.id}`,
    location: t.location,
    name: t.name,
    abbreviation: t.abbreviation,
    displayName: `${t.location} ${t.name}`,
    shortDisplayName: t.name,
    ...(t.color ? { color: t.color } : {}),
    ...(t.alternateColor ? { alternateColor: t.alternateColor } : {}),
    isActive: true,
    venue: { id: "1000" },
    links: [{ rel: ["clubhouse", "desktop", "team"], href: `https://www.espn.com/${path}/team/_/name/${t.abbreviation.toLowerCase()}` }],
    logo: `https://a.espncdn.com/i/teamlogos/${path === "nba" || path === "wnba" ? path : "ncaa"}/500/scoreboard/${t.id}.png`,
  };
}

// ---- status objects ----

const ORDINAL = ["", "1st", "2nd", "3rd", "4th"];

export interface BbStatusFixture {
  clock: number;
  displayClock: string;
  period: number;
  type: {
    id: string;
    name: string;
    state: "pre" | "in" | "post";
    completed: boolean;
    description: string;
    detail: string;
    shortDetail: string;
  };
}

/** Periods as a league plays them: four quarters, or two halves (men's college). */
export type Split = "quarters" | "halves";

function periodWord(period: number, split: Split, long: boolean): string {
  const regulation = split === "halves" ? 2 : 4;
  if (period > regulation) return period === regulation + 1 ? "OT" : `${period - regulation}OT`;
  if (split === "halves") return `${ORDINAL[period]} Half`;
  return long ? `${ORDINAL[period]} Quarter` : ORDINAL[period];
}

/** "45.2" in the last minute, "5:32" before it (ESPN's basketball clock). */
function clockSeconds(displayClock: string): number {
  if (displayClock.includes(":")) {
    const [m, s] = displayClock.split(":").map(Number);
    return m * 60 + s;
  }
  return Number(displayClock);
}

export const bbStatus = {
  scheduled(detail = "Fri, March 20th at 7:30 PM EDT", shortDetail = "3/20 - 7:30 PM EDT"): BbStatusFixture {
    return {
      clock: 0,
      displayClock: "0.0",
      period: 0,
      type: { id: "1", name: "STATUS_SCHEDULED", state: "pre", completed: false, description: "Scheduled", detail, shortDetail },
    };
  },
  inProgress(period: number, displayClock: string, split: Split = "quarters"): BbStatusFixture {
    return {
      clock: clockSeconds(displayClock),
      displayClock,
      period,
      type: {
        id: "2",
        name: "STATUS_IN_PROGRESS",
        state: "in",
        completed: false,
        description: "In Progress",
        detail: `${displayClock} - ${periodWord(period, split, true)}`,
        shortDetail: `${displayClock} - ${periodWord(period, split, false)}`,
      },
    };
  },
  /** Halftime: period 2 in a game of quarters, period 1 in a game of halves. */
  halftime(split: Split = "quarters"): BbStatusFixture {
    return {
      clock: 0,
      displayClock: "0.0",
      period: split === "halves" ? 1 : 2,
      type: { id: "23", name: "STATUS_HALFTIME", state: "in", completed: false, description: "Halftime", detail: "Halftime", shortDetail: "Halftime" },
    };
  },
  endOfPeriod(period: number, split: Split = "quarters"): BbStatusFixture {
    return {
      clock: 0,
      displayClock: "0.0",
      period,
      type: {
        id: "22",
        name: "STATUS_END_PERIOD",
        state: "in",
        completed: false,
        description: "End of Period",
        detail: `End of ${periodWord(period, split, true)}`,
        shortDetail: `End of ${periodWord(period, split, false)}`,
      },
    };
  },
  final(period: number, split: Split = "quarters"): BbStatusFixture {
    const regulation = split === "halves" ? 2 : 4;
    const text = period > regulation ? `Final/${periodWord(period, split, false)}` : "Final";
    return {
      clock: 0,
      displayClock: "0.0",
      period,
      type: { id: "3", name: "STATUS_FINAL", state: "post", completed: true, description: "Final", detail: text, shortDetail: text },
    };
  },
};

// ---- scoreboard ----

export interface BbSideFixture {
  team: TeamFixture;
  /** Points per period; omitted before tip-off, as ESPN does. */
  lines?: number[];
  /** Override the headline score (defaults to the sum of lines). */
  score?: number;
  /** College poll rank (ESPN sends 99 when unranked). */
  rank?: number;
}

export interface BbEventFixture {
  id: string;
  date: string;
  home: BbSideFixture;
  away: BbSideFixture;
  status: BbStatusFixture;
  neutralSite?: boolean;
  venue?: { fullName: string; address: { city?: string; state?: string; country?: string } };
  /** A tournament note ("Men's Basketball Championship - South Region - 1st Round"). */
  note?: string;
}

function competitor(side: BbSideFixture, homeAway: "home" | "away", order: number, st: BbStatusFixture, path: BasketballPath) {
  const score = side.score ?? (side.lines ?? []).reduce((a, b) => a + b, 0);
  return {
    id: side.team.id,
    uid: `s:40~l:46~t:${side.team.id}`,
    type: "team",
    order,
    homeAway,
    ...(st.type.completed ? { winner: false } : {}),
    team: team(side.team, path),
    curatedRank: { current: side.rank ?? 99 },
    score: String(score),
    ...(side.lines ? { linescores: side.lines.map((v, i) => ({ value: v, displayValue: String(v), period: i + 1 })) } : {}),
    statistics: [{ name: "rebounds", abbreviation: "REB", displayValue: "41" }],
    leaders: [],
    records: [{ name: "overall", abbreviation: "Game", type: "total", summary: "41-23" }],
  };
}

export function bbScoreboardEvent(e: BbEventFixture, path: BasketballPath = "nba") {
  const home = `${e.home.team.location} ${e.home.team.name}`;
  const away = `${e.away.team.location} ${e.away.team.name}`;
  const halves = path === "mens-college-basketball";
  return {
    id: e.id,
    uid: `s:40~l:46~e:${e.id}`,
    date: e.date,
    name: `${away} at ${home}`,
    shortName: `${e.away.team.abbreviation} @ ${e.home.team.abbreviation}`,
    season: { year: 2026, type: path === "nba" || path === "wnba" ? 2 : 3, slug: "regular-season" },
    competitions: [
      {
        id: e.id,
        uid: `s:40~l:46~e:${e.id}~c:${e.id}`,
        date: e.date,
        attendance: 18997,
        type: { id: "1", abbreviation: "STD" },
        timeValid: true,
        neutralSite: e.neutralSite ?? false,
        conferenceCompetition: false,
        playByPlayAvailable: true,
        recent: false,
        venue: { id: "1000", indoor: true, ...(e.venue ?? { fullName: "Test Arena", address: { city: "Testville", state: "CA", country: "USA" } }) },
        competitors: [competitor(e.home, "home", 0, e.status, path), competitor(e.away, "away", 1, e.status, path)],
        notes: e.note ? [{ type: "event", headline: e.note }] : [],
        status: e.status,
        broadcasts: [{ market: "national", names: ["ESPN"] }],
        format: { regulation: { periods: halves ? 2 : 4 } },
        tournamentId: halves ? 22 : undefined,
        startDate: e.date,
        geoBroadcasts: [],
      },
    ],
    links: [],
    status: e.status,
  };
}

/** A basketball scoreboard response for one day (`day.date`); its calendar is a list of game days, no weeks. */
export function bbScoreboard(events: BbEventFixture[], path: BasketballPath = "nba", day = "2026-03-20") {
  return {
    leagues: [
      {
        id: "46",
        uid: "s:40~l:46",
        name: path === "nba" ? "National Basketball Association" : "Basketball",
        abbreviation: path === "nba" ? "NBA" : path.toUpperCase(),
        slug: path,
        season: { year: 2026, startDate: "2025-10-01T07:00Z", endDate: "2026-06-30T06:59Z", type: { id: "2", type: 2, name: "Regular Season" } },
        calendarType: "day",
        calendarIsWhitelist: true,
        calendar: ["2026-03-19T07:00Z", "2026-03-20T07:00Z", "2026-03-21T07:00Z"],
      },
    ],
    season: { type: 2, year: 2026 },
    day: { date: day },
    events: events.map((e) => bbScoreboardEvent(e, path)),
  };
}

/** Summary payloads carry the competition under `header`, with displayValue-only linescores. */
export function bbSummary(e: BbEventFixture, path: BasketballPath = "nba") {
  const comp = bbScoreboardEvent(e, path).competitions[0];
  return {
    boxscore: { teams: [], players: [] },
    format: { regulation: { periods: path === "mens-college-basketball" ? 2 : 4, displayName: path === "mens-college-basketball" ? "Half" : "Quarter" } },
    gameInfo: { venue: comp.venue },
    plays: [],
    header: {
      id: e.id,
      uid: `s:40~l:46~e:${e.id}`,
      season: { year: 2026, type: 2 },
      competitions: [
        {
          id: e.id,
          date: e.date,
          neutralSite: comp.neutralSite,
          competitors: comp.competitors.map((c) => ({
            id: c.id,
            homeAway: c.homeAway,
            team: { ...c.team, nickname: c.team.name },
            score: c.score,
            ...(c.linescores ? { linescores: c.linescores.map((ls) => ({ displayValue: ls.displayValue })) } : {}),
          })),
          status: e.status,
        },
      ],
      league: { id: "46", slug: path },
    },
  };
}

/**
 * An NBA final in overtime written out literally (not via the builders), so
 * the parser is also checked against plain JSON: 4 quarters and an OT period,
 * three-digit scores.
 */
export const LITERAL_NBA_OT_FINAL = JSON.parse(`{
  "id": "401705123",
  "uid": "s:40~l:46~e:401705123",
  "date": "2026-03-21T02:30Z",
  "name": "Boston Celtics at Los Angeles Lakers",
  "shortName": "BOS @ LAL",
  "season": { "year": 2026, "type": 2, "slug": "regular-season" },
  "competitions": [{
    "id": "401705123",
    "date": "2026-03-21T02:30Z",
    "attendance": 18997,
    "neutralSite": false,
    "venue": { "id": "1000", "fullName": "Crypto.com Arena", "address": { "city": "Los Angeles", "state": "CA" }, "indoor": true },
    "competitors": [
      {
        "id": "13", "homeAway": "home", "order": 0, "winner": true,
        "team": { "id": "13", "location": "Los Angeles", "name": "Lakers", "abbreviation": "LAL",
          "displayName": "Los Angeles Lakers", "shortDisplayName": "Lakers", "color": "552583", "alternateColor": "FDB927" },
        "score": "121",
        "linescores": [ { "value": 28.0, "displayValue": "28", "period": 1 }, { "value": 31.0, "displayValue": "31", "period": 2 },
          { "value": 24.0, "displayValue": "24", "period": 3 }, { "value": 27.0, "displayValue": "27", "period": 4 },
          { "value": 11.0, "displayValue": "11", "period": 5 } ],
        "statistics": [], "records": [ { "name": "overall", "type": "total", "summary": "44-27" } ]
      },
      {
        "id": "2", "homeAway": "away", "order": 1, "winner": false,
        "team": { "id": "2", "location": "Boston", "name": "Celtics", "abbreviation": "BOS",
          "displayName": "Boston Celtics", "shortDisplayName": "Celtics", "color": "008348", "alternateColor": "FFFFFF" },
        "score": "117",
        "linescores": [ { "value": 30.0, "displayValue": "30", "period": 1 }, { "value": 26.0, "displayValue": "26", "period": 2 },
          { "value": 29.0, "displayValue": "29", "period": 3 }, { "value": 25.0, "displayValue": "25", "period": 4 },
          { "value": 7.0, "displayValue": "7", "period": 5 } ],
        "statistics": [], "records": [ { "name": "overall", "type": "total", "summary": "51-20" } ]
      }
    ],
    "status": {
      "clock": 0.0, "displayClock": "0.0", "period": 5,
      "type": { "id": "3", "name": "STATUS_FINAL", "state": "post", "completed": true,
        "description": "Final", "detail": "Final/OT", "shortDetail": "Final/OT" }
    },
    "broadcasts": [ { "market": "national", "names": ["ESPN"] } ]
  }],
  "status": {
    "clock": 0.0, "displayClock": "0.0", "period": 5,
    "type": { "id": "3", "name": "STATUS_FINAL", "state": "post", "completed": true,
      "description": "Final", "detail": "Final/OT", "shortDetail": "Final/OT" }
  }
}`);

/**
 * A men's college tournament game at halftime written out literally: two
 * halves, so halftime is period 1 and only the 1st half has a linescore.
 */
export const LITERAL_NCAAM_HALFTIME = JSON.parse(`{
  "id": "401745001",
  "date": "2026-03-20T16:15Z",
  "name": "Vermont Catamounts at Duke Blue Devils",
  "shortName": "UVM VS DUKE",
  "competitions": [{
    "id": "401745001",
    "date": "2026-03-20T16:15Z",
    "neutralSite": true,
    "venue": { "id": "4001", "fullName": "Lenovo Center", "address": { "city": "Raleigh", "state": "NC" } },
    "notes": [ { "type": "event", "headline": "Men's Basketball Championship - East Region - 1st Round" } ],
    "competitors": [
      {
        "id": "150", "homeAway": "home", "order": 0,
        "team": { "id": "150", "location": "Duke", "name": "Blue Devils", "abbreviation": "DUKE",
          "displayName": "Duke Blue Devils", "color": "00539B" },
        "curatedRank": { "current": 2 },
        "score": "41",
        "linescores": [ { "value": 41.0, "displayValue": "41", "period": 1 } ]
      },
      {
        "id": "261", "homeAway": "away", "order": 1,
        "team": { "id": "261", "location": "Vermont", "name": "Catamounts", "abbreviation": "UVM",
          "displayName": "Vermont Catamounts" },
        "curatedRank": { "current": 99 },
        "score": "33",
        "linescores": [ { "value": 33.0, "displayValue": "33", "period": 1 } ]
      }
    ],
    "status": {
      "clock": 0.0, "displayClock": "0.0", "period": 1,
      "type": { "id": "23", "name": "STATUS_HALFTIME", "state": "in", "completed": false,
        "description": "Halftime", "detail": "Halftime", "shortDetail": "Halftime" }
    }
  }],
  "status": {
    "clock": 0.0, "displayClock": "0.0", "period": 1,
    "type": { "id": "23", "name": "STATUS_HALFTIME", "state": "in", "completed": false,
      "description": "Halftime", "detail": "Halftime", "shortDetail": "Halftime" }
  }
}`);
