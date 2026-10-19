// The create flow's season helpers (features/create/model.ts): the season's
// axes and name, the games it covers (not started, capped), what Next waits
// for, the POST body, Review's fee line; and the season draft in wizard.ts.

import { describe, expect, it } from "vitest";
import { defaultFormat, withRules } from "../../../shared/formats";
import { MAX_SEASON_GAMES } from "../../../shared/season";
import type { ScheduleEvent, SeasonTeam } from "../../../shared/types";
import {
  blockersOf,
  buildCreateInput,
  createFeeLine,
  matchupTeams,
  seasonBoardName,
  seasonEventMatchup,
  seasonGamesAhead,
  seasonInputOf,
  seasonMatchupLabel,
  type SeasonMatchup,
} from "./model";
import { loadDraft, saveDraft, type WizardDraft } from "./wizard";

const NOW = Date.UTC(2026, 8, 1, 12);
const DAY = 86_400_000;
const JAX: SeasonTeam = { id: "30", name: "Jacksonville Jaguars", shortName: "Jaguars", abbr: "JAX", color: "#006778", logo: "https://a.espncdn.com/i/teamlogos/nfl/500/jax.png" };

const ev = (id: string, days: number, over: Partial<ScheduleEvent> = {}): ScheduleEvent => ({
  eventId: id,
  league: "nfl",
  name: "Miami Dolphins at Jacksonville Jaguars",
  shortName: "MIA @ JAX",
  startsAt: NOW + days * DAY,
  away: { name: "Miami Dolphins", abbr: "MIA" },
  home: { name: "Jacksonville Jaguars", abbr: "JAX" },
  awayId: "15",
  homeId: "30",
  state: days < 0 ? "post" : "pre",
  ...over,
});

const teamSeason = (over: Partial<SeasonMatchup> = {}): SeasonMatchup => ({
  kind: "season",
  league: "nfl",
  scope: "team",
  numbers: "same",
  team: JAX,
  year: 2026,
  events: [ev("p1", -7), ev("s1", 3, { label: "Week 2" }), ev("s2", 10, { away: { name: "Jacksonville Jaguars", abbr: "JAX" }, home: { name: "Houston Texans", abbr: "HOU" }, awayId: "30", homeId: "34" })],
  ...over,
});

const host = { name: "Jordan", color: "#ff6b35", emoji: "🏈" };

describe("a season matchup", () => {
  it("puts the team across the top and Opponent down the side (picked games: Away and Home)", () => {
    expect(matchupTeams(teamSeason(), {})).toMatchObject({ teamX: { name: "Jacksonville Jaguars" }, teamY: { name: "Opponent", abbr: "OPP" }, league: "nfl", linkedEvent: null });
    expect(matchupTeams(teamSeason({ scope: "games", team: null }), {})).toMatchObject({ teamX: { name: "Away" }, teamY: { name: "Home" } });
    // A team's season with no team yet isn't a matchup.
    expect(matchupTeams(teamSeason({ team: null }), {})).toBeNull();
  });

  it("covers the games not started yet, up to the cap", () => {
    expect(seasonGamesAhead(teamSeason(), NOW).map((e) => e.eventId)).toEqual(["s1", "s2"]);
    const many = Array.from({ length: MAX_SEASON_GAMES + 5 }, (_, i) => ev(`g${i}`, i + 1));
    expect(seasonGamesAhead({ events: many }, NOW)).toHaveLength(MAX_SEASON_GAMES);
  });

  it("is named for the team or the league", () => {
    expect(seasonMatchupLabel(teamSeason(), NOW)).toBe("Jaguars 2026 season");
    expect(seasonMatchupLabel(teamSeason({ scope: "games", team: null, year: null }), NOW)).toBe("2 NFL games");
    expect(seasonBoardName(teamSeason())).toBe("Jaguars Season Squares");
    expect(seasonBoardName({ scope: "games", team: null, league: "ncaaf" })).toBe("College Season Squares");
  });

  it("lists a game from the team's side, or away at home", () => {
    const [home, away] = seasonGamesAhead(teamSeason(), NOW);
    expect(seasonEventMatchup(home, JAX)).toBe("vs MIA");
    expect(seasonEventMatchup(away, JAX)).toBe("@ HOU");
    expect(seasonEventMatchup(home, null)).toBe("MIA @ JAX");
  });

  it("holds Next for a team, its schedule, and at least one game ahead", () => {
    const at = (m: SeasonMatchup) => blockersOf({ matchup: m, kickoff: null, hostName: null, format: withRules(defaultFormat()), name: "", now: NOW })[0]?.label;
    expect(at(teamSeason({ team: null }))).toBe("Pick a team to continue");
    expect(at(teamSeason({ events: [], pending: "loading" }))).toBe("Loading the team's games");
    expect(at(teamSeason({ events: [], pending: "error" }))).toBe("Couldn't load the team's games. Try again");
    expect(at(teamSeason({ events: [ev("p1", -7)] }))).toBe("No games left this season. Pick another team");
    expect(at(teamSeason({ scope: "games", team: null, events: [] }))).toBe("Pick at least one game to continue");
    expect(at(teamSeason())).toBeUndefined();
  });

  it("sends the season with only the games ahead, kept as the board keeps them", () => {
    const input = seasonInputOf(teamSeason({ numbers: "fresh" }), NOW);
    expect(input).toMatchObject({ scope: "team", numbers: "fresh", team: { id: "30" }, year: 2026 });
    expect(input.events).toEqual([
      { eventId: "s1", startsAt: NOW + 3 * DAY, home: { name: "Jacksonville Jaguars", abbr: "JAX" }, away: { name: "Miami Dolphins", abbr: "MIA" }, homeId: "30", awayId: "15", label: "Week 2" },
      expect.objectContaining({ eventId: "s2", homeId: "34", awayId: "30" }),
    ]);
    // Picked games carry no team.
    expect(seasonInputOf(teamSeason({ scope: "games", team: null }), NOW)).not.toHaveProperty("team");

    const body = buildCreateInput({ matchup: teamSeason(), colors: {}, kickoff: null, format: withRules(defaultFormat()), prizeChoice: null, name: "", maxPerPlayer: 0, host, now: NOW })!;
    expect(body.name).toBe("Jaguars Season Squares");
    expect(body.season?.events).toHaveLength(2);
    expect(body).not.toHaveProperty("fromGameId");
  });

  it("says the season's fee is once for the whole season", () => {
    expect(createFeeLine("$14.99", true)).toBe("Free to set up and invite. Free to draw with up to 5 players, $14.99 for the whole season with more.");
    expect(createFeeLine(null, true)).toBe("Free to set up and invite. Free to draw with up to 5 players; bigger seasons have one host fee when you draw.");
  });
});

describe("the season draft", () => {
  const memory = () => {
    const m = new Map<string, string>();
    return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v), removeItem: (k: string) => void m.delete(k) };
  };
  const base: WizardDraft = {
    tab: "nfl",
    tabTouched: true,
    picked: {},
    custom: { x: "", y: "" },
    kickoff: null,
    format: withRules(defaultFormat()),
    prizeChoice: null,
    prizesAuto: true,
    name: "",
    nameTouched: false,
    maxPerPlayer: 0,
    hostName: "Jordan",
  };

  it("keeps the season's scope, numbers, team and the picks not started yet", () => {
    const store = memory();
    saveDraft(
      { ...base, boardScope: "season", seasonScope: "games", seasonNumbers: "fresh", seasonTeams: { nfl: JAX }, seasonPicks: { nfl: [ev("old", -1), ev("s1", 2)] } },
      NOW,
      store,
    );
    const back = loadDraft(NOW, store)!;
    expect(back).toMatchObject({ boardScope: "season", seasonScope: "games", seasonNumbers: "fresh" });
    expect(back.seasonTeams?.nfl).toEqual(JAX);
    expect(back.seasonPicks?.nfl?.map((e) => e.eventId)).toEqual(["s1"]);
  });

  it("drops a team that isn't the provider's or a logo off its CDN", () => {
    const store = memory();
    saveDraft({ ...base, seasonTeams: { nfl: { ...JAX, logo: "https://evil.example/x.png" }, nba: { id: "../x", name: "Nope" } } }, NOW, store);
    const back = loadDraft(NOW, store)!;
    expect(back.seasonTeams?.nfl).toEqual({ ...JAX, logo: undefined });
    expect(back.seasonTeams?.nba).toBeUndefined();
  });

  it("reads an older draft back as it was, and never a season for another board for a game", () => {
    const store = memory();
    saveDraft(base, NOW, store);
    expect(loadDraft(NOW, store)).toEqual({ ...base, sport: "football", sportTouched: false });
    saveDraft({ ...base, from: "k7m2px", boardScope: "season" } as WizardDraft, NOW, store);
    expect(loadDraft(NOW, store)?.boardScope).toBeUndefined();
  });
});
