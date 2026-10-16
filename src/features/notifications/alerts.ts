// Live alerts on the board: one per moment, built on describeActivity.
//
// The feed lists every event; a live alert is what a fan sees pop up while
// watching, so it follows stricter rules:
// - One alert per moment. The Final's winner, the final whistle and "you won
//   Q1, Half & Q3" are one summary card, not three pills.
// - Don't repeat the board. When my own square hits, the board's gold "You won"
//   banner already says it: `banner: true` tells the board to skip the alert
//   (or fold its detail into the banner).
// - Low-value chatter collapses: claims and joins share one running count
//   ("Maya & Sam grabbed 9 squares · 49 left") under the same `key`, so each
//   new one replaces the last instead of stacking.
// - Every alert says whose news it is (`subject`), carries the score or my
//   numbers as a chip, and names the square to jump to on tap (`cell`).
//
// Pure and unit-tested (alerts.test.ts). BoardAlert.tsx renders it.

import { periodPhrase } from "../../../shared/formats";
import { squaresLeft } from "../../../shared/squares";
import type { Activity, GameState } from "../../../shared/types";
import {
  BURST_WINDOW_MS,
  SCARCE_LEFT,
  atMoment,
  capitalize,
  describeActivity,
  ids,
  int,
  joinNames,
  myWinsPhrase,
  nameOf,
  scoreChipFor,
  str,
  cellOf,
  type ActivityAnnouncement,
} from "./activity";

export type AlertKind = "picks" | "people" | "numbers" | "score" | "win" | "my-win" | "final" | "other";

export interface BoardAlert extends ActivityAnnouncement {
  /** Same key = the same running story: a newer alert replaces the shown one in place. */
  key: string;
  kind: AlertKind;
  /** Short headline ("Dre wins at the end of Q3"). `text` stays the full one-line sentence. */
  title: string;
  /** Second line under the headline (a prize note, "49 left", "You won Half"). */
  detail?: string;
  /** The board's "You won" banner already says this: skip the alert, or fold it into the banner. */
  banner?: boolean;
  /** How long it stays up (ms). Game moments linger; chatter doesn't. */
  duration: number;
}

const CHATTER_MS = 2400;
const MOMENT_MS = 4200;
const FINAL_MS = 6000;
/** A final whistle written within this long of a Final winner belongs to the same moment. */
const SAME_MOMENT_MS = 5_000;

type Data = Record<string, unknown>;

/** The final whistle that goes with this activity and will get its own summary card (not one I blew myself). */
function finalWhistleNear(a: Activity, state: GameState, me: string): Activity | undefined {
  return state.activity.find((x) => x.type === "final" && x.actor !== me && Math.abs(x.at - a.at) <= SAME_MOMENT_MS);
}

/** The winner activity for the Final that goes with this whistle, if any. */
function finalWinnerNear(a: Activity, state: GameState): Activity | undefined {
  return state.activity.find(
    (x) => x.type === "winner" && str((x.data as Data).periodKey) === "final" && Math.abs(x.at - a.at) <= SAME_MOMENT_MS,
  );
}

/** Claims by people other than me in the burst ending at `a`. */
function picksBurst(a: Activity, state: GameState, me: string): { people: string[]; squares: number } {
  const recent = state.activity.filter(
    (x) => x.type === "claimed" && x.actor && x.actor !== me && x.at <= a.at && a.at - x.at <= BURST_WINDOW_MS,
  );
  if (!recent.some((x) => x.id === a.id)) recent.push(a);
  // Newest first, so the latest picker leads the sentence.
  recent.sort((x, y) => y.at - x.at);
  const people = [...new Set(recent.map((x) => x.actor).filter((x): x is string => !!x))];
  const squares = recent.reduce((n, x) => n + Math.max(1, int((x.data as Data).count, 1)), 0);
  return { people, squares };
}

function namesShort(state: GameState, people: string[]): string {
  const names = people.map((id) => nameOf(state, id));
  if (names.length <= 2) return joinNames(names);
  return `${names[0]}, ${names[1]} & ${names.length - 2} more`;
}

function leftLine(state: GameState): string | undefined {
  if (state.game.status !== "open") return undefined;
  const left = squaresLeft(state);
  if (left === 0) return "Board's full 🔥";
  return left <= SCARCE_LEFT ? `Only ${left} left` : `${left} left`;
}

/** The live alert for an activity, or null when it shouldn't pop up. */
export function boardAlert(a: Activity, state: GameState, me: string): BoardAlert | null {
  const ann = describeActivity(a, state, me);
  if (!ann) return null;
  const d = a.data as Data;

  switch (a.type) {
    case "claimed": {
      const { people, squares } = picksBurst(a, state, me);
      const left = squaresLeft(state);
      const full = state.game.status === "open" && left === 0;
      return {
        ...ann,
        key: "picks",
        kind: "picks",
        title: full
          ? `${nameOf(state, a.actor)} grabbed the last ${Math.max(1, int(d.count, 1)) === 1 ? "square" : "squares"}`
          : `${namesShort(state, people)} grabbed ${squares === 1 ? "a square" : `${squares} squares`}`,
        detail: leftLine(state),
        duration: full ? MOMENT_MS : CHATTER_MS,
      };
    }

    case "released":
    case "joined": {
      const players = state.players.length;
      return {
        ...ann,
        key: a.type === "joined" ? "people" : "picks",
        kind: a.type === "joined" ? "people" : "picks",
        title: a.type === "joined" ? `${str(d.name) ?? nameOf(state, a.actor)} joined` : ann.text.replace(/ 👀.*$/, ""),
        detail: a.type === "joined" ? `${players} ${players === 1 ? "player" : "players"}${leftLine(state) ? ` · ${leftLine(state)}` : ""}` : leftLine(state),
        duration: CHATTER_MS,
      };
    }

    case "locked": {
      const kickoff = d.auto === true;
      const findLine = ann.chip ? undefined : ann.text.match(/Find your.*$/)?.[0];
      return {
        ...ann,
        key: "numbers",
        kind: "numbers",
        title: kickoff ? "Kickoff! Numbers are in" : "Numbers are in",
        detail: ann.chip ? undefined : findLine ?? "Tap to see the board",
        duration: MOMENT_MS,
      };
    }

    case "score": {
      const periodKey = str(d.periodKey) ?? "";
      const { moment } = periodPhrase(periodKey, str(d.label) ?? periodKey);
      // A typed-in Final score also blows the whistle: the summary card speaks for both.
      if (periodKey === "final" && finalWhistleNear(a, state, me)) return null;
      return {
        ...ann,
        key: `moment:${periodKey}`,
        kind: "score",
        title: /^s\d+$/.test(periodKey) ? "Score!" : periodKey === "final" ? "Final" : moment ? capitalize(moment) : "Score",
        duration: MOMENT_MS,
      };
    }

    case "winner": {
      const periodKey = str(d.periodKey) ?? "";
      const when = atMoment(periodKey, str(d.label) ?? periodKey);
      // The final whistle's summary card covers the Final's winner.
      if (periodKey === "final" && finalWhistleNear(a, state, me)) return null;
      const winners = ids(d.playerIds);
      const prize = str(d.prize) ?? undefined;
      if (winners.includes(me)) {
        const others = winners.filter((id) => id !== me);
        return {
          ...ann,
          key: `moment:${periodKey}`,
          kind: "my-win",
          title: others.length ? `You and ${joinNames(others.map((id) => nameOf(state, id)))} hit${when}!` : `Your square hit${when}!`,
          detail: prize,
          banner: true,
          duration: MOMENT_MS,
        };
      }
      if (winners.length === 0) {
        return { ...ann, key: `moment:${periodKey}`, kind: "score", title: `Nobody had the square${when}`, detail: "Empty square", duration: MOMENT_MS };
      }
      return {
        ...ann,
        key: `moment:${periodKey}`,
        kind: "win",
        title: `${joinNames(winners.map((id) => nameOf(state, id)))} ${winners.length > 1 ? "win" : "wins"}${when}`,
        detail: prize,
        duration: MOMENT_MS,
      };
    }

    case "final": {
      // One summary card: the Final's winner, the final score and how I did.
      const fin = finalWinnerNear(a, state);
      const finWinners = fin ? ids((fin.data as Data).playerIds) : [];
      const iWonFinal = finWinners.includes(me);
      const mine = myWinsPhrase(state, me);
      const chip = scoreChipFor(state, "final", "Final") ?? ann.chip;
      const cell = fin ? cellOf((fin.data as Data).cell) : undefined;
      let title: string;
      let detail: string | undefined;
      let subject = ann.subject;
      if (iWonFinal) {
        title = `Your square hit${atMoment("final", "Final")}! 🏁`;
        detail = mine && mine !== "Final" ? `You won ${mine}` : (str((fin!.data as Data).prize) ?? "That's a wrap");
        subject = { kind: "me" };
      } else if (finWinners.length > 0) {
        title = `${joinNames(finWinners.map((id) => nameOf(state, id)))} ${finWinners.length > 1 ? "win" : "wins"}${atMoment("final", "Final")} 🏁`;
        detail = mine ? `You won ${mine}` : "That's a wrap. See who won each round";
        subject = { kind: "player", id: finWinners[0] };
      } else {
        title = "That's a wrap 🏁";
        detail = mine ? `You won ${mine}` : ann.text.replace(/^That's a wrap! 🏁 /, "");
      }
      return {
        ...ann,
        tone: mine ? "win" : ann.tone,
        // My Final win already fills the gold banner; everyone else still wants the summary.
        banner: iWonFinal,
        key: "moment:final",
        kind: "final",
        title,
        detail,
        subject,
        chip,
        cell,
        duration: FINAL_MS,
      };
    }

    default:
      return { ...ann, key: a.type, kind: "other", title: ann.text, duration: CHATTER_MS };
  }
}
