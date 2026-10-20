import { describe, expect, it } from "vitest";
import type { SeasonGame, SeasonStanding } from "../../../shared/types";
import { payToDrawLabel } from "../host/hostModel";
import {
  defaultSeasonTab,
  gameTag,
  gamesLine,
  myPlaceLine,
  ordinal,
  playedLine,
  podium,
  scheduleSections,
  seasonFactsLine,
  seasonMatchup,
  standingAmount,
  winnerNames,
  winnersLine,
  winsLine,
  wonGame,
} from "./seasonView";

const NOW = Date.UTC(2026, 9, 18, 17);
const HOUR = 3_600_000;

const game = (index: number, over: Partial<SeasonGame> = {}): SeasonGame => ({
  id: `c${index}`,
  eventId: `e${index}`,
  index,
  startsAt: NOW + (index - 2) * 168 * HOUR,
  teamX: { name: "Jacksonville Jaguars", abbr: "JAX" },
  teamY: { name: "Houston Texans", abbr: "HOU" },
  status: "locked",
  live: null,
  score: null,
  winners: [],
  ...over,
});

const row = (playerId: string, rank: number, wins: number, games = wins, amount: number | null = null): SeasonStanding => ({ playerId, rank, wins, games, amount });

describe("the season page", () => {
  it("opens on the squares while they're picked, then on the schedule", () => {
    expect(defaultSeasonTab("open")).toBe("squares");
    expect(defaultSeasonTab("draft")).toBe("squares");
    expect(defaultSeasonTab("locked")).toBe("schedule");
    expect(defaultSeasonTab("final")).toBe("schedule");
  });

  it("splits the schedule into the game on now or next, the ones after, and the played ones latest first", () => {
    const games = [
      game(1, { status: "final", live: "post" }),
      game(2, { live: "in", startsAt: NOW - HOUR }),
      game(3),
      game(4),
      game(0, { status: "final", startsAt: NOW - 400 * HOUR }),
    ];
    const { current, upcoming, played } = scheduleSections(games, NOW);
    expect(current?.index).toBe(2);
    expect(upcoming.map((g) => g.index)).toEqual([3, 4]);
    expect(played.map((g) => g.index)).toEqual([1, 0]);
  });

  it("names games, winners and wins", () => {
    expect(seasonMatchup(game(1))).toBe("JAX vs HOU");
    expect(gameTag(game(3, { label: "Week 8" }))).toBe("Game 3 · Week 8");
    expect(gameTag(game(18))).toBe("Game 18");
    const players = [
      { id: "a", name: "Ana Diaz" },
      { id: "b", name: "Ben" },
    ];
    expect(winnerNames([], players, "a")).toBe("Nobody");
    expect(winnerNames(["a", "b"], players, "a")).toBe("You & Ben");
    expect(winnerNames(["gone"], players, "a")).toBe("Someone");
    const played = game(1, {
      winners: [
        { periodKey: "q1", label: "Q1", playerIds: ["b"] },
        { periodKey: "q2", label: "Half", playerIds: [] },
        { periodKey: "final", label: "Final", playerIds: ["a"] },
      ],
    });
    expect(winnersLine(played, players, "a")).toBe("Q1 Ben · Half Nobody · Final You");
    expect(winnersLine(game(2), players, "a")).toBeNull();
    expect(wonGame(played, "a")).toBe(true);
    expect(wonGame(played, "")).toBe(false);
    expect(winsLine(0)).toBe("No wins yet");
    expect(winsLine(1)).toBe("1 win");
    expect(winsLine(4)).toBe("4 wins");
    expect(gamesLine(0)).toBeNull();
    expect(gamesLine(2)).toBe("in 2 games");
  });

  it("places me in the standings, ties included", () => {
    const standings = [row("a", 1, 3), row("b", 1, 3), row("c", 3, 1), row("d", 4, 0)];
    expect(myPlaceLine(standings, "a")).toBe("You're tied 1st of 4");
    expect(myPlaceLine(standings, "c")).toBe("You're 3rd of 4");
    expect(myPlaceLine(standings, "z")).toBeNull();
    expect([1, 2, 3, 4, 11, 12, 13, 21, 22, 101].map(ordinal)).toEqual(["1st", "2nd", "3rd", "4th", "11th", "12th", "13th", "21st", "22nd", "101st"]);
    // The top 3 with a win.
    expect(podium(standings).map((r) => r.playerId)).toEqual(["a", "b", "c"]);
    expect(podium([row("a", 1, 2), row("b", 2, 0)]).map((r) => r.playerId)).toEqual(["a"]);
  });

  it("shows a standing's total in the board's unit, or nothing without amounts", () => {
    expect(standingAmount(row("a", 1, 2, 2, 150), "$")).toBe("$150");
    expect(standingAmount(row("a", 1, 2, 2, 40), "pts")).toBe("40 pts");
    expect(standingAmount(row("a", 1, 2), "$")).toBeNull();
  });

  it("sums the season up in a line", () => {
    expect(seasonFactsLine({ games: [game(1), game(2)], numbers: "same", scope: "team" })).toBe("2 games so far · Same numbers all season");
    expect(seasonFactsLine({ games: [game(1)], numbers: "fresh", scope: "games" })).toBe("1 game · New numbers every game");
    expect(playedLine([game(1), game(2)])).toBeNull();
    expect(playedLine([game(1, { status: "final" }), game(2)])).toBe("1 of 2 played");
  });

  it("says the season's fee is for the season on the host's draw button", () => {
    expect(payToDrawLabel("$14.99", true)).toBe("Draw the numbers · $14.99 for the season");
    expect(payToDrawLabel("$4.99")).toBe("Draw the numbers · $4.99");
    expect(payToDrawLabel(null, true)).toBe("Draw the numbers");
  });
});
