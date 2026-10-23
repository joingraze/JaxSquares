// What a composition asks of its soundtrack. Times are composition frames, so
// cues come from the same constants that drive the visuals.

export type StyleId = "hype" | "anthem" | "bounce" | "pulse" | "retro" | "harvest";

export type SfxKind =
  | "tap" // a finger on a button
  | "pop" // a chat bubble, a sticker, a card landing
  | "whoosh" // a cut or a big move
  | "ding" // a push notification
  | "sparkle" // confetti
  | "impact" // a title slam (drops get one automatically)
  | "tick" // a rolling digit
  | "womp" // sad trombone-ish, for the 2–2 square
  | "stop" // record stop: the music cuts out
  | "cheer"; // a crowd swell

export interface AudioSpec {
  style: StyleId;
  /** The end card's first frame: the music lands on its home chord and the sting plays. */
  end: number;
  /** Frames where the groove drops in at full energy, with an impact. */
  drops?: number[];
  /** [from, to]: a riser and snare roll, the groove filtered and building. */
  builds?: [number, number][];
  /** Stretches where the groove thins out (level 0: the music stops). */
  breaks?: { from: number; to: number; level?: number }[];
  sfx?: { at: number; kind: SfxKind; gain?: number }[];
  /** Energy before the first drop, 0–1 (default 0.92: the full groove and arp from the first frame, the lead hook saved for the drop). */
  intro?: number;
}
