// Pure helpers for a season board's page (src/features/season): which games
// go where on its schedule, how a game's winners and a player's standing read,
// and the one-line summaries. No React, no IO (tested in seasonView.test.ts).
// Amounts here are in-app only, like every amount: the page shows them, never
// a push, a preview or share text.

import { formatAmount } from "../../../shared/formats";
import { currentSeasonGame, SEASON_NUMBERS_INFO } from "../../../shared/season";
import type { AmountUnit, Player, SeasonGame, SeasonStanding, SeasonState, Team } from "../../../shared/types";

/** The season page's tabs. */
export type SeasonTab = "squares" | "schedule" | "standings";

/** Where the page opens: the squares while they're picked, then the schedule. */
export function defaultSeasonTab(status: string): SeasonTab {
  return status === "open" || status === "draft" ? "squares" : "schedule";
}

/** The schedule in three parts: the game on now or next, the ones after it, and the ones played (latest first). */
export function scheduleSections(games: readonly SeasonGame[], now: number): { current: SeasonGame | null; upcoming: SeasonGame[]; played: SeasonGame[] } {
  const current = currentSeasonGame(games, now);
  const played = games.filter((g) => g !== current && (g.status === "final" || g.live === "post")).sort((a, b) => b.startsAt - a.startsAt);
  const playedSet = new Set(played);
  const upcoming = games.filter((g) => g !== current && !playedSet.has(g)).sort((a, b) => a.startsAt - b.startsAt);
  return { current, upcoming, played };
}

const short = (t: Team) => t.abbr?.trim() || t.name.trim();

/** "JAX vs HOU". */
export function seasonMatchup(game: Pick<SeasonGame, "teamX" | "teamY">): string {
  return `${short(game.teamX)} vs ${short(game.teamY)}`;
}

/** "Game 3 · Week 8", "Game 18 · Wild Card", "Game 4". */
export function gameTag(game: Pick<SeasonGame, "index" | "label">): string {
  return game.label ? `Game ${game.index} · ${game.label}` : `Game ${game.index}`;
}

/** A moment's winners by first name ("Ana", "Ana & Ben"), or "Nobody" for an empty square. */
export function winnerNames(playerIds: readonly string[], players: readonly Pick<Player, "id" | "name">[], me: string): string {
  if (playerIds.length === 0) return "Nobody";
  const names = playerIds.map((id) => (id === me ? "You" : players.find((p) => p.id === id)?.name.split(" ")[0] || "Someone"));
  return names.join(" & ");
}

/** A played (or playing) game's winners in one line: "Q1 Ana · Half You · Q3 Nobody · Final Ben". */
export function winnersLine(game: Pick<SeasonGame, "winners">, players: readonly Pick<Player, "id" | "name">[], me: string): string | null {
  if (game.winners.length === 0) return null;
  return game.winners.map((w) => `${w.label} ${winnerNames(w.playerIds, players, me)}`).join(" · ");
}

/** Whether I won anything in this game. */
export function wonGame(game: Pick<SeasonGame, "winners">, me: string): boolean {
  return !!me && game.winners.some((w) => w.playerIds.includes(me));
}

/** "3 wins", "1 win", "No wins yet". */
export function winsLine(wins: number): string {
  if (wins <= 0) return "No wins yet";
  return `${wins} ${wins === 1 ? "win" : "wins"}`;
}

/** A standing's detail: "in 2 games", or null without wins. */
export function gamesLine(games: number): string | null {
  return games > 0 ? `in ${games} ${games === 1 ? "game" : "games"}` : null;
}

/** A standing's total, in the board's unit (in-app only), or null when the board shows no amounts. */
export function standingAmount(row: Pick<SeasonStanding, "amount">, unit: AmountUnit): string | null {
  return row.amount === null ? null : formatAmount(row.amount, unit);
}

/** My place in the standings: "You're 2nd of 12", "You're tied 1st of 12", or null when I hold no squares. */
export function myPlaceLine(standings: readonly SeasonStanding[], me: string): string | null {
  const mine = standings.find((r) => r.playerId === me);
  if (!mine) return null;
  const tied = standings.filter((r) => r.rank === mine.rank).length > 1;
  return `You're ${tied ? "tied " : ""}${ordinal(mine.rank)} of ${standings.length}`;
}

/** 1st, 2nd, 3rd, 4th, 11th, 21st... */
export function ordinal(n: number): string {
  const tens = n % 100;
  if (tens >= 11 && tens <= 13) return `${n}th`;
  const suffix = { 1: "st", 2: "nd", 3: "rd" }[n % 10] ?? "th";
  return `${n}${suffix}`;
}

/** The season header's facts: "17 games · Same numbers all season" (or "6 games so far" before a team's playoffs are known). */
export function seasonFactsLine(season: Pick<SeasonState, "games" | "numbers" | "scope">): string {
  const n = season.games.length;
  const games = `${n} ${n === 1 ? "game" : "games"}${season.scope === "team" ? " so far" : ""}`;
  return `${games} · ${SEASON_NUMBERS_INFO[season.numbers].label}`;
}

/** How far along the season is: "4 of 17 played", or null before any game is over. */
export function playedLine(games: readonly Pick<SeasonGame, "status">[]): string | null {
  const played = games.filter((g) => g.status === "final").length;
  return played > 0 ? `${played} of ${games.length} played` : null;
}

/** The top of the standings for a season recap: the top 3 with at least one win. */
export function podium(standings: readonly SeasonStanding[]): SeasonStanding[] {
  return standings.filter((r) => r.wins > 0).slice(0, 3);
}
