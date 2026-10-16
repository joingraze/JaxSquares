// What the notifications ask says, tailored to what just happened and to the
// board it's about: the host who just made a board hears about friends joining
// and the board filling up; a player who just claimed sees their own board and
// (once drawn) their own numbers in the preview. Pure, tested in askCopy.test.ts.

import { periodPhrase } from "../../../shared/formats";
import type { GameState } from "../../../shared/types";
import { myNumbers, teamShort } from "./activity";
import type { AskTrigger } from "./prefs";

export interface AskCopy {
  title: string;
  body: string;
  /** Title of the preview banners (the board's name). */
  boardName: string;
  /** Two lock-screen banners: the one underneath, then the one on top. */
  lines: readonly [back: string, front: string];
  /** Exactly what you'll get, as a short checklist. */
  scope: string[];
}

/** A believable football score ending in this digit, so a preview reads like a real game. */
const SCORE_FOR_DIGIT = [10, 21, 12, 3, 14, 17, 6, 7, 28, 9];
const scoreEnding = (digit: string): number => SCORE_FOR_DIGIT[Number(digit)] ?? Number(digit);

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

function playerLines(state: GameState | null, me: string): [string, string] {
  if (!state) return ["🔢 Numbers are in. Find your squares.", `🎉 Your square hit ${periodPhrase("q1").moment}! 🏆`];
  const x = teamShort(state.game.teamX);
  const y = teamShort(state.game.teamY);
  const first = state.game.periods[0];
  const when = (first ? periodPhrase(first.key, first.label) : periodPhrase("q1")).moment;
  const mine = state.squares.filter((s) => s.playerId === me).length;
  const pairs = myNumbers(state, me);
  if (pairs && pairs.length > 0) {
    const p = pairs[0];
    return [`🔢 Numbers are in. You've got ${x} ${p.x} · ${y} ${p.y}`, `🎉 ${x} ${scoreEnding(p.x)} – ${y} ${scoreEnding(p.y)} ${when}. Your square hits! 🏆`];
  }
  const back = mine > 0 ? `🔢 Numbers are in. Find your ${mine === 1 ? "square" : plural(mine, "square")}.` : "🔢 Numbers are in. Find your squares.";
  return [back, `🎉 ${x} 7 – ${y} 3 ${when}. Your square hits! 🏆`];
}

function hostLines(state: GameState | null, me: string): [string, string] {
  const friend = state?.players.find((p) => p.id !== me);
  const players = Math.max(2, state?.players.length ?? 2);
  const back = friend
    ? `${friend.emoji || "👋"} ${friend.name} joined your board. ${players} players in.`
    : "👋 A friend joined your board. 2 players in.";
  return [back, "🙌 Board's full. Time to draw the numbers."];
}

export function askCopy(trigger: AskTrigger, state: GameState | null, me: string): AskCopy {
  const boardName = state?.game.name ?? "JaxSquares";
  const isHost = trigger === "created" || (!!state && state.game.hostPlayerId === me);
  const mine = state ? state.squares.filter((s) => s.playerId === me).length : 0;
  const kickoff = !!state?.game.linkedEvent;
  // Numbers already drawn: the next pings are the results, not the draw.
  const drawn = !!state && state.game.status !== "open" && state.game.status !== "draft";
  const results = state ? state.game.periods.map((p) => periodPhrase(p.key, p.label).short) : [];
  const playerScope = [
    drawn
      ? results.length > 0 && results.length <= 4
        ? `Who wins ${results.slice(0, -1).join(", ")}${results.length > 1 ? " & " : ""}${results[results.length - 1]}`
        : "Every winning square"
      : kickoff
        ? "Kickoff and numbers drawn"
        : "Numbers drawn",
    mine > 1 ? `Any of your ${mine} squares hitting` : "Your square hitting",
    "The final whistle",
  ];

  if (trigger === "created") {
    return {
      title: "Know when your crew shows up",
      body: "We'll ping you as friends join, when the board fills up and when it's time to draw.",
      boardName,
      lines: hostLines(state, me),
      scope: ["Friends joining (quietly)", "Board's full: time to draw", "Numbers drawn and every winning square"],
    };
  }

  if (trigger === "home" && isHost && state?.game.status === "open") {
    return {
      title: "Know when it's time to draw",
      body: "Pings when friends join, when your board fills up and when a square hits.",
      boardName,
      lines: hostLines(state, me),
      scope: ["Friends joining (quietly)", "Board's full: time to draw", "Every winning square"],
    };
  }

  const lines = playerLines(state, me);
  if (trigger === "claimed") {
    return {
      title: "Want a ping when your square hits?",
      body:
        mine > 1
          ? `We'll buzz you when the numbers drop and the moment one of your ${mine} squares wins.`
          : "We'll buzz you when the numbers drop and the moment your square wins.",
      boardName,
      lines,
      scope: playerScope,
    };
  }
  if (trigger === "joined" && !drawn) {
    return {
      title: "Get a ping when the numbers drop",
      body: "Then another the moment your square hits. Nothing else.",
      boardName,
      lines,
      scope: playerScope,
    };
  }
  return {
    title: "Get pinged when your square hits",
    body: drawn
      ? `Numbers are in on ${boardName}. We'll buzz you the moment ${mine > 1 ? "one of your squares" : "your square"} hits.`
      : "Numbers drawn, kickoff and every one of your squares that wins. Nothing else.",
    boardName,
    lines,
    scope: playerScope,
  };
}
