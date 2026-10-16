// Test fixtures shaped like ESPN site API responses. ESPN does not publish a
// schema, so these follow the publicly known shape of
//   /apis/site/v2/sports/football/{nfl|college-football}/scoreboard
//   /apis/site/v2/sports/football/{league}/summary?event=ID
// including fields we ignore, so the parser is exercised against realistic noise.
// Scores, ids and dates are invented test data, not real results.

interface TeamFixture {
  id: string;
  location: string;
  name: string;
  abbreviation: string;
  color?: string;
  alternateColor?: string;
}

export const TEAMS = {
  kc: { id: "12", location: "Kansas City", name: "Chiefs", abbreviation: "KC", color: "e31837", alternateColor: "ffb612" },
  buf: { id: "2", location: "Buffalo", name: "Bills", abbreviation: "BUF", color: "00338d", alternateColor: "d50a0a" },
  phi: { id: "21", location: "Philadelphia", name: "Eagles", abbreviation: "PHI", color: "06424d", alternateColor: "000000" },
  dal: { id: "6", location: "Dallas", name: "Cowboys", abbreviation: "DAL", color: "002a5c", alternateColor: "b0b7bc" },
  uga: { id: "61", location: "Georgia", name: "Bulldogs", abbreviation: "UGA", color: "ba0c2f", alternateColor: "000000" },
  // Some college teams come without colors.
  app: { id: "2026", location: "App State", name: "Mountaineers", abbreviation: "APP" },
  tbd: { id: "-1", location: "TBD", name: "TBD", abbreviation: "TBD" },
} satisfies Record<string, TeamFixture>;

function team(t: TeamFixture) {
  return {
    id: t.id,
    uid: `s:20~l:28~t:${t.id}`,
    location: t.location,
    name: t.name,
    abbreviation: t.abbreviation,
    displayName: `${t.location} ${t.name}`,
    shortDisplayName: t.name,
    ...(t.color ? { color: t.color } : {}),
    ...(t.alternateColor ? { alternateColor: t.alternateColor } : {}),
    isActive: true,
    venue: { id: "3622" },
    links: [{ rel: ["clubhouse", "desktop", "team"], href: `https://www.espn.com/nfl/team/_/name/${t.abbreviation.toLowerCase()}` }],
    logo: `https://a.espncdn.com/i/teamlogos/nfl/500/scoreboard/${t.abbreviation.toLowerCase()}.png`,
  };
}

// ---- status objects ----

const ORDINAL = ["", "1st", "2nd", "3rd", "4th"];
const periodLabel = (p: number) => (p <= 4 ? ORDINAL[p] : p === 5 ? "OT" : `${p - 4}OT`);

export interface StatusFixture {
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

export const status = {
  scheduled(): StatusFixture {
    return {
      clock: 0,
      displayClock: "0:00",
      period: 0,
      type: {
        id: "1",
        name: "STATUS_SCHEDULED",
        state: "pre",
        completed: false,
        description: "Scheduled",
        detail: "Sun, October 18th at 1:00 PM EDT",
        shortDetail: "10/18 - 1:00 PM EDT",
      },
    };
  },
  inProgress(period: number, displayClock: string): StatusFixture {
    const [m, s] = displayClock.split(":").map(Number);
    return {
      clock: m * 60 + s,
      displayClock,
      period,
      type: {
        id: "2",
        name: "STATUS_IN_PROGRESS",
        state: "in",
        completed: false,
        description: "In Progress",
        detail: `${displayClock} - ${period <= 4 ? `${ORDINAL[period]} Quarter` : periodLabel(period)}`,
        shortDetail: `${displayClock} - ${periodLabel(period)}`,
      },
    };
  },
  halftime(): StatusFixture {
    return {
      clock: 0,
      displayClock: "0:00",
      period: 2,
      type: {
        id: "23",
        name: "STATUS_HALFTIME",
        state: "in",
        completed: false,
        description: "Halftime",
        detail: "Halftime",
        shortDetail: "Halftime",
      },
    };
  },
  endOfPeriod(period: number): StatusFixture {
    return {
      clock: 0,
      displayClock: "0:00",
      period,
      type: {
        id: "22",
        name: "STATUS_END_PERIOD",
        state: "in",
        completed: false,
        description: "End of Period",
        detail: `End of ${ORDINAL[period]} Quarter`,
        shortDetail: `End of ${ORDINAL[period]}`,
      },
    };
  },
  final(period = 4): StatusFixture {
    const text = period > 4 ? `Final/${periodLabel(period)}` : "Final";
    return {
      clock: 0,
      displayClock: "0:00",
      period,
      type: { id: "3", name: "STATUS_FINAL", state: "post", completed: true, description: "Final", detail: text, shortDetail: text },
    };
  },
  postponed(): StatusFixture {
    return {
      clock: 0,
      displayClock: "0:00",
      period: 0,
      type: {
        id: "6",
        name: "STATUS_POSTPONED",
        state: "post",
        completed: false,
        description: "Postponed",
        detail: "Postponed",
        shortDetail: "Postponed",
      },
    };
  },
};

// ---- scoreboard ----

export interface SideFixture {
  team: TeamFixture;
  /** Points per period; omitted before kickoff, as ESPN does. */
  lines?: number[];
  /** Override the headline score (defaults to the sum of lines). */
  score?: number;
}

export interface EventFixture {
  id: string;
  date: string;
  home: SideFixture;
  away: SideFixture;
  status: StatusFixture;
  neutralSite?: boolean;
}

function competitor(side: SideFixture, homeAway: "home" | "away", order: number, st: StatusFixture) {
  const score = side.score ?? (side.lines ?? []).reduce((a, b) => a + b, 0);
  return {
    id: side.team.id,
    uid: `s:20~l:28~t:${side.team.id}`,
    type: "team",
    order,
    homeAway,
    ...(st.type.completed ? { winner: false } : {}),
    team: team(side.team),
    score: String(score),
    ...(side.lines
      ? { linescores: side.lines.map((v, i) => ({ value: v, displayValue: String(v), period: i + 1 })) }
      : {}),
    statistics: [],
    records: [
      { name: "overall", abbreviation: "Game", type: "total", summary: "4-2" },
      { name: homeAway === "home" ? "Home" : "Road", type: homeAway === "home" ? "home" : "road", summary: "2-1" },
    ],
  };
}

export function scoreboardEvent(e: EventFixture) {
  const home = `${e.home.team.location} ${e.home.team.name}`;
  const away = `${e.away.team.location} ${e.away.team.name}`;
  return {
    id: e.id,
    uid: `s:20~l:28~e:${e.id}`,
    date: e.date,
    name: `${away} at ${home}`,
    shortName: `${e.away.team.abbreviation} @ ${e.home.team.abbreviation}`,
    season: { year: 2026, type: 2, slug: "regular-season" },
    week: { number: 7 },
    competitions: [
      {
        id: e.id,
        uid: `s:20~l:28~e:${e.id}~c:${e.id}`,
        date: e.date,
        attendance: 0,
        type: { id: "1", abbreviation: "STD" },
        timeValid: true,
        neutralSite: e.neutralSite ?? false,
        conferenceCompetition: false,
        playByPlayAvailable: true,
        recent: false,
        venue: { id: "3622", fullName: "Test Stadium", address: { city: "Testville", state: "MO", country: "USA" }, indoor: false },
        competitors: [competitor(e.home, "home", 0, e.status), competitor(e.away, "away", 1, e.status)],
        notes: [],
        status: e.status,
        broadcasts: [{ market: "national", names: ["CBS"] }],
        format: { regulation: { periods: 4 } },
        startDate: e.date,
        geoBroadcasts: [],
      },
    ],
    links: [],
    status: e.status,
  };
}

export function scoreboard(events: EventFixture[]) {
  return {
    leagues: [
      {
        id: "28",
        uid: "s:20~l:28",
        name: "National Football League",
        abbreviation: "NFL",
        slug: "nfl",
        season: { year: 2026, startDate: "2026-08-01T07:00Z", endDate: "2027-02-15T07:59Z", type: { id: "2", type: 2, name: "Regular Season" } },
        calendarType: "list",
        calendarIsWhitelist: true,
      },
    ],
    season: { type: 2, year: 2026 },
    week: { number: 7 },
    events: events.map(scoreboardEvent),
  };
}

// ---- summary ----

/** Summary payloads carry the competition under `header`, with displayValue-only linescores. */
export function summary(e: EventFixture) {
  const comp = scoreboardEvent(e).competitions[0];
  return {
    boxscore: { teams: [], players: [] },
    format: { regulation: { periods: 4, displayName: "Quarter", slug: "quarter", clock: 900 } },
    gameInfo: { venue: comp.venue },
    drives: { previous: [] },
    leaders: [],
    header: {
      id: e.id,
      uid: `s:20~l:28~e:${e.id}`,
      season: { year: 2026, type: 2 },
      timeValid: true,
      competitions: [
        {
          id: e.id,
          uid: comp.uid,
          date: e.date,
          neutralSite: false,
          conferenceCompetition: false,
          boxscoreAvailable: true,
          commentaryAvailable: false,
          liveAvailable: true,
          onWatchESPN: false,
          recent: false,
          competitors: comp.competitors.map((c) => ({
            id: c.id,
            uid: c.uid,
            order: c.order,
            homeAway: c.homeAway,
            team: { ...c.team, nickname: c.team.name, logos: [{ href: c.team.logo }] },
            score: c.score,
            ...(c.linescores ? { linescores: c.linescores.map((ls) => ({ displayValue: ls.displayValue })) } : {}),
            record: [{ type: "total", summary: "4-2", displayValue: "4-2" }],
            possession: false,
          })),
          status: e.status,
          broadcasts: [],
        },
      ],
      league: { id: "28", uid: "s:20~l:28", name: "National Football League", abbreviation: "NFL", slug: "nfl" },
    },
  };
}

/**
 * A complete scoreboard event written out literally (not via the builders above),
 * so the parser is also checked against plain JSON rather than only our helpers.
 */
export const LITERAL_FINAL_EVENT = JSON.parse(`{
  "id": "401772999",
  "uid": "s:20~l:28~e:401772999",
  "date": "2026-10-12T20:25Z",
  "name": "Dallas Cowboys at Philadelphia Eagles",
  "shortName": "DAL @ PHI",
  "season": { "year": 2026, "type": 2, "slug": "regular-season" },
  "week": { "number": 6 },
  "competitions": [{
    "id": "401772999",
    "uid": "s:20~l:28~e:401772999~c:401772999",
    "date": "2026-10-12T20:25Z",
    "attendance": 69796,
    "type": { "id": "1", "abbreviation": "STD" },
    "timeValid": true,
    "neutralSite": false,
    "conferenceCompetition": false,
    "playByPlayAvailable": true,
    "recent": true,
    "venue": { "id": "3806", "fullName": "Test Field", "address": { "city": "Philadelphia", "state": "PA", "country": "USA" }, "indoor": false },
    "competitors": [
      {
        "id": "21", "uid": "s:20~l:28~t:21", "type": "team", "order": 0, "homeAway": "home", "winner": true,
        "team": { "id": "21", "uid": "s:20~l:28~t:21", "location": "Philadelphia", "name": "Eagles", "abbreviation": "PHI",
          "displayName": "Philadelphia Eagles", "shortDisplayName": "Eagles", "color": "06424D", "alternateColor": "000000",
          "isActive": true, "venue": { "id": "3806" }, "links": [], "logo": "https://a.espncdn.com/i/teamlogos/nfl/500/scoreboard/phi.png" },
        "score": "27",
        "linescores": [ { "value": 7.0 }, { "value": 10.0 }, { "value": 0.0 }, { "value": 10.0 } ],
        "statistics": [],
        "records": [ { "name": "overall", "abbreviation": "Game", "type": "total", "summary": "5-1" } ]
      },
      {
        "id": "6", "uid": "s:20~l:28~t:6", "type": "team", "order": 1, "homeAway": "away", "winner": false,
        "team": { "id": "6", "uid": "s:20~l:28~t:6", "location": "Dallas", "name": "Cowboys", "abbreviation": "DAL",
          "displayName": "Dallas Cowboys", "shortDisplayName": "Cowboys", "color": "002A5C", "alternateColor": "B0B7BC",
          "isActive": true, "venue": { "id": "3687" }, "links": [], "logo": "https://a.espncdn.com/i/teamlogos/nfl/500/scoreboard/dal.png" },
        "score": "20",
        "linescores": [ { "value": 3.0 }, { "value": 7.0 }, { "value": 7.0 }, { "value": 3.0 } ],
        "statistics": [],
        "records": [ { "name": "overall", "abbreviation": "Game", "type": "total", "summary": "3-3" } ]
      }
    ],
    "notes": [],
    "situation": { "lastPlay": { "id": "1", "text": "END GAME" } },
    "status": {
      "clock": 0.0, "displayClock": "0:00", "period": 4,
      "type": { "id": "3", "name": "STATUS_FINAL", "state": "post", "completed": true,
        "description": "Final", "detail": "Final", "shortDetail": "Final" }
    },
    "broadcasts": [ { "market": "national", "names": ["FOX"] } ],
    "startDate": "2026-10-12T20:25Z"
  }],
  "links": [],
  "status": {
    "clock": 0.0, "displayClock": "0:00", "period": 4,
    "type": { "id": "3", "name": "STATUS_FINAL", "state": "post", "completed": true,
      "description": "Final", "detail": "Final", "shortDetail": "Final" }
  }
}`);
