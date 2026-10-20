// How a board talks about its game: "Kickoff" or "Tip-off", "the final
// whistle" or "the final buzzer". Board-level copy (the scorebug, pushes, the
// TV view, link previews) reads these through the board's sport; the app's
// own brand stays "football squares". Pure, no imports beyond types, so both
// shared/formats.ts and shared/sports.ts can use it.

import type { Sport } from "./types";

export interface SportWords {
  /** The start of the game, capitalized: "Kickoff", "Tip-off". */
  start: string;
  /** Mid-sentence: "kickoff", "tip-off". */
  startLower: string;
  /** The verb, capitalized: "Kicks off", "Tips off". */
  starts: string;
  /** Under way any moment now, capitalized: "Kicking off", "Tipping off". */
  starting: string;
  /** The end of the game mid-sentence: "the final whistle", "the final buzzer". */
  end: string;
  /** The sport as a word: "football", "basketball". */
  noun: string;
  emoji: string;
}

export const SPORT_WORDS: Record<Sport, SportWords> = {
  football: { start: "Kickoff", startLower: "kickoff", starts: "Kicks off", starting: "Kicking off", end: "the final whistle", noun: "football", emoji: "🏈" },
  basketball: { start: "Tip-off", startLower: "tip-off", starts: "Tips off", starting: "Tipping off", end: "the final buzzer", noun: "basketball", emoji: "🏀" },
  soccer: { start: "Kickoff", startLower: "kickoff", starts: "Kicks off", starting: "Kicking off", end: "the final whistle", noun: "soccer", emoji: "⚽" },
  baseball: { start: "First pitch", startLower: "first pitch", starts: "Starts", starting: "Starting", end: "the final out", noun: "baseball", emoji: "⚾" },
  hockey: { start: "Puck drop", startLower: "puck drop", starts: "Starts", starting: "Starting", end: "the final horn", noun: "hockey", emoji: "🏒" },
  other: { start: "Start", startLower: "the start", starts: "Starts", starting: "Starting", end: "the end", noun: "game", emoji: "⏱️" },
};

/** The board's words; a board without a sport (older fixtures) is football. */
export function sportWords(sport?: Sport | null): SportWords {
  return (sport && SPORT_WORDS[sport]) || SPORT_WORDS.football;
}

/**
 * A football sentence in the board's words: "kickoff" -> "tip-off", "kicks
 * off" -> "tips off" (case kept at the start). Football's comes back as is.
 * For shared messages written once, like the kickoff errors.
 */
export function inSportWords(text: string, sport?: Sport | null): string {
  const w = sportWords(sport);
  if (w === SPORT_WORDS.football) return text;
  const lower = (s: string) => s[0].toLowerCase() + s.slice(1);
  return text
    .replace(/\bKicks off\b/g, w.starts)
    .replace(/\bkicks off\b/g, lower(w.starts))
    .replace(/\bKickoff\b/g, w.start)
    .replace(/\bkickoff\b/g, w.startLower);
}
