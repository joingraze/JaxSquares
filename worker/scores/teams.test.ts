// @vitest-environment node
import { describe, expect, it } from "vitest";
import { NFL_TEAMS, nflTeamName, nflTeamToTeam, searchNflTeams } from "../../shared/teams";

describe("NFL_TEAMS", () => {
  it("has 32 teams with unique abbreviations and names", () => {
    expect(NFL_TEAMS).toHaveLength(32);
    expect(new Set(NFL_TEAMS.map((t) => t.abbr)).size).toBe(32);
    expect(new Set(NFL_TEAMS.map(nflTeamName)).size).toBe(32);
  });

  it("carries names only, never colors", () => {
    for (const t of NFL_TEAMS) expect(Object.keys(t).sort()).toEqual(["abbr", "location", "nickname"]);
  });

  it("converts to a board Team the same way ESPN names linked teams", () => {
    const kc = NFL_TEAMS.find((t) => t.abbr === "KC")!;
    expect(nflTeamToTeam(kc)).toEqual({ name: "Kansas City Chiefs", abbr: "KC" });
  });
});

describe("searchNflTeams", () => {
  const abbrs = (q: string, limit?: number) => searchNflTeams(q, limit).map((t) => t.abbr);

  it("ranks an exact abbreviation first", () => {
    expect(abbrs("ne")[0]).toBe("NE");
    expect(abbrs("SF")[0]).toBe("SF");
  });

  it("matches nicknames and locations by prefix, case-insensitively", () => {
    expect(abbrs("chie")).toEqual(["KC"]);
    expect(abbrs("new york")).toEqual(["NYG", "NYJ"]);
    expect(abbrs("los")).toEqual(["LAC", "LAR"]);
    expect(abbrs("49")).toEqual(["SF"]);
  });

  it("matches later words and substrings after prefixes", () => {
    // "bay" starts a word in Green Bay and Tampa Bay
    expect(abbrs("bay")).toEqual(["GB", "TB"]);
    expect(abbrs("hawk")).toEqual(["SEA"]);
  });

  it("returns the first few teams for an empty query and nothing for a miss", () => {
    expect(abbrs("  ", 3)).toEqual(["ARI", "ATL", "BAL"]);
    expect(abbrs("zzz")).toEqual([]);
  });
});
