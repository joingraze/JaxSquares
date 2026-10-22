// The six soundtracks. Each is a four-chord loop whose last chord leads home:
// bars are counted back from the end card, so the bar before it always plays
// the last chord and the end card lands on `home` with the sting.
// Notes are MIDI numbers; patterns are 16 steps per bar (1 = full velocity).

import type { StyleId } from "./types";

export interface Chord {
  /** Voicing for chords (stabs, pads, keys, strums), low to high. */
  notes: number[];
  bass: number;
}

export interface Style {
  bpm: number;
  /** Delay of odd 16ths, as a share of a 16th. */
  swing: number;
  progression: Chord[];
  home: Chord;
  kick: number[];
  snare: number[];
  clap: number[];
  hat: number[];
  /** Steps where the hat opens up (replaces the closed hat). */
  openHat: number[];
  shaker: number[];
  /** Kick sound: a pop kick or a softer folk stomp. */
  kickKind: "punch" | "stomp" | "boom";
  bass: { steps: number[]; kind: "saw" | "round" | "pluck"; /** semitone offsets per step */ intervals?: number[] };
  chords: { kind: "stab" | "pluck" | "keys" | "strum"; steps: number[]; length: number; pad?: boolean };
  /** Melodic layer once the groove is at full energy. */
  arp?: { kind: "marimba" | "pluck" | "bell"; steps: number[]; /** chord-tone index per step (+3 = up an octave) */ order: number[]; octave: number };
  lead?: { kind: "bell"; bars: [number, number][][] };
  /** The sting on the end card: a rising bell arpeggio. */
  sting: number[];
  crackle?: boolean;
}

const ch = (notes: number[], bass: number): Chord => ({ notes, bass });

export const STYLES: Record<StyleId, Style> = {
  // Launch energy: 128 BPM, the uplifting I–V–vi–IV, four on the floor, 16th hats with open
  // off-beats, a driving octave bass, supersaw stabs, a plucked 16th arp and a bell hook.
  hype: {
    bpm: 128,
    swing: 0,
    progression: [ch([60, 64, 67], 48), ch([59, 62, 67], 43), ch([57, 60, 64], 45), ch([57, 60, 65], 41)], // C G Am F
    home: ch([60, 64, 67], 48),
    kick: [1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0],
    snare: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0.35],
    clap: [0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0],
    hat: [0.35, 0.22, 0.6, 0.22, 0.35, 0.22, 0.6, 0.22, 0.35, 0.22, 0.6, 0.22, 0.35, 0.22, 0.6, 0.3],
    openHat: [2, 6, 10, 14],
    shaker: [],
    kickKind: "punch",
    bass: { steps: [0, 2, 3, 6, 8, 10, 11, 14], kind: "saw", intervals: [0, 12, 12, 12, 0, 12, 12, 12] },
    chords: { kind: "stab", steps: [0, 3, 6, 10, 12], length: 0.18, pad: true },
    arp: { kind: "pluck", steps: [0, 2, 4, 6, 8, 10, 12, 14], order: [0, 1, 2, 3, 2, 1, 2, 4], octave: 12 },
    lead: {
      kind: "bell",
      bars: [
        [[0, 79], [3, 79], [6, 76], [8, 74], [10, 76]], // C: G G E D E
        [[0, 74], [3, 74], [6, 71], [8, 74], [10, 79]], // G: D D B D G
        [[0, 76], [3, 72], [6, 76], [8, 79], [10, 81]], // Am: E C E G A
        [[0, 77], [3, 76], [6, 74], [8, 72], [12, 74]], // F: F E D C D
      ],
    },
    sting: [79, 84, 88, 91],
  },
  // Game-day pop: four on the floor, off-beat bass, supersaw stabs, a bell hook.
  anthem: {
    bpm: 120,
    swing: 0,
    progression: [ch([57, 60, 64], 45), ch([57, 60, 65], 41), ch([55, 60, 64], 48), ch([55, 59, 62], 43)], // Am F C G
    home: ch([55, 60, 64], 48),
    kick: [1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0],
    snare: [],
    clap: [0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0],
    hat: [0.6, 0.3, 0, 0.35, 0.6, 0.3, 0, 0.35, 0.6, 0.3, 0, 0.35, 0.6, 0.3, 0, 0.5],
    openHat: [2, 6, 10, 14],
    shaker: [],
    kickKind: "punch",
    bass: { steps: [0, 2, 6, 10, 14], kind: "saw", intervals: [0, 12, 12, 12, 12] },
    chords: { kind: "stab", steps: [0, 3, 6, 10], length: 0.2, pad: true },
    lead: {
      kind: "bell",
      bars: [
        [[0, 76], [3, 76], [6, 74], [8, 72], [10, 74]], // Am: E E D C D
        [[0, 72], [3, 72], [6, 69], [8, 72], [10, 77]], // F: C C A C F
        [[0, 76], [3, 79], [6, 76], [8, 74], [10, 72]], // C: E G E D C
        [[0, 74], [3, 71], [6, 74], [8, 79], [12, 74]], // G: D B D G D
      ],
    },
    sting: [79, 84, 88, 91],
  },
  // Playful: bouncy kick, shaker, staccato chord plucks, a marimba line.
  bounce: {
    bpm: 124,
    swing: 0.14,
    progression: [ch([55, 59, 62], 43), ch([54, 57, 62], 50), ch([55, 59, 64], 52), ch([55, 60, 64], 48)], // G D Em C
    home: ch([55, 59, 62], 43),
    kick: [1, 0, 0, 0, 0, 0, 0, 0.7, 1, 0, 0, 0, 0, 0, 0, 0],
    snare: [0, 0, 0, 0, 0.8, 0, 0, 0, 0, 0, 0, 0, 0.8, 0, 0, 0.3],
    clap: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0.6, 0, 0, 0],
    hat: [],
    openHat: [],
    shaker: [0.5, 0.25, 0.8, 0.25, 0.5, 0.25, 0.8, 0.25, 0.5, 0.25, 0.8, 0.25, 0.5, 0.25, 0.8, 0.25],
    kickKind: "punch",
    bass: { steps: [0, 6, 8, 11], kind: "round", intervals: [0, 0, 0, 7] },
    chords: { kind: "pluck", steps: [2, 6, 10, 14], length: 0.12 },
    arp: { kind: "marimba", steps: [0, 2, 4, 6, 8, 10, 12, 14], order: [0, 1, 2, 1, 3, 2, 1, 2], octave: 12 },
    sting: [74, 79, 83, 86],
  },
  // Data reveal: half-time drums, a driving eighth-note bass, a ticking arp.
  pulse: {
    bpm: 124,
    swing: 0,
    progression: [ch([57, 62, 65], 38), ch([58, 62, 65], 46), ch([57, 60, 65], 41), ch([55, 60, 64], 36)], // Dm Bb F C
    home: ch([57, 60, 65], 41),
    kick: [1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0],
    snare: [0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0],
    clap: [0, 0, 0, 0, 0, 0, 0, 0, 0.7, 0, 0, 0, 0, 0, 0, 0],
    hat: [0.5, 0, 0.3, 0, 0.5, 0, 0.3, 0, 0.5, 0, 0.3, 0, 0.5, 0, 0.3, 0.3],
    openHat: [],
    shaker: [],
    kickKind: "boom",
    bass: { steps: [0, 2, 4, 6, 8, 10, 12, 14], kind: "saw", intervals: [0, 0, 12, 0, 0, 0, 12, 0] },
    chords: { kind: "keys", steps: [], length: 2, pad: true },
    arp: { kind: "pluck", steps: [0, 2, 3, 6, 8, 10, 11, 14], order: [0, 2, 1, 3, 0, 2, 1, 4], octave: 12 },
    sting: [72, 77, 81, 84],
  },
  // On this day: 90 BPM boom-bap, warm electric piano, a little vinyl.
  retro: {
    bpm: 90,
    swing: 0.22,
    // Fmaj9 Dm9 Gm9 C13
    progression: [ch([52, 57, 60, 67], 41), ch([53, 57, 60, 64], 38), ch([53, 57, 58, 62], 43), ch([52, 57, 58, 62], 36)],
    home: ch([52, 57, 60, 67], 41),
    kick: [1, 0, 0, 0, 0, 0, 0, 0.6, 0, 0, 0.9, 0, 0, 0, 0, 0],
    snare: [0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0],
    clap: [],
    hat: [0.4, 0, 0.25, 0, 0.4, 0, 0.25, 0, 0.4, 0, 0.25, 0, 0.4, 0, 0.25, 0.15],
    openHat: [],
    shaker: [],
    kickKind: "boom",
    bass: { steps: [0, 7, 10], kind: "pluck", intervals: [0, 7, 0] },
    chords: { kind: "keys", steps: [0, 10], length: 1.6 },
    sting: [72, 76, 79, 81],
    crackle: true,
  },
  // Thanksgiving: stomp and clap, strummed guitar, a glockenspiel on top.
  harvest: {
    bpm: 120,
    swing: 0.08,
    progression: [ch([50, 57, 62, 66], 38), ch([43, 50, 55, 59, 67], 43), ch([47, 54, 59, 62], 47), ch([45, 52, 57, 61], 45)], // D G Bm A
    home: ch([50, 57, 62, 66], 38),
    kick: [1, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0],
    snare: [],
    clap: [0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0],
    hat: [],
    openHat: [],
    shaker: [0.5, 0.2, 0.35, 0.2, 0.5, 0.2, 0.35, 0.2, 0.5, 0.2, 0.35, 0.2, 0.5, 0.2, 0.35, 0.2],
    kickKind: "stomp",
    bass: { steps: [0, 8, 14], kind: "round", intervals: [0, 0, 7] },
    // Down on the beats, up on the "and"s: D . D U . U D U
    chords: { kind: "strum", steps: [0, 4, 6, 10, 12, 14], length: 1.2 },
    arp: { kind: "bell", steps: [0, 6, 12], order: [3, 4, 5], octave: 12 },
    sting: [69, 74, 78, 81],
  },
};
