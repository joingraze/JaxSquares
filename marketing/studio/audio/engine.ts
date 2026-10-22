// Arranges a composition's soundtrack from its AudioSpec and renders it offline.
//
// The bar grid is anchored on the end card: the end card's first frame is a
// downbeat, the bar before it plays the progression's last chord, and the end
// card lands on the home chord with the sting. Energy (0–1) decides which
// layers play: builds take the kick out and add a riser and a snare roll,
// drops bring everything in with an impact, breaks filter or stop the music.

import { seeded } from "../lib/anim";
import { STYLES, type Chord, type Style } from "./styles";
import type { AudioSpec } from "./types";
import * as I from "./instruments";

export const SAMPLE_RATE = 48000;

const mod = (n: number, m: number) => ((n % m) + m) % m;

function hash(s: string): number {
  let h = 2166136261;
  for (const c of s) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
  return h >>> 0;
}

interface Timeline {
  end: number;
  dur: number;
  drops: number[];
  builds: [number, number][];
  breaks: { from: number; to: number; level: number }[];
  intro: number;
}

function energyAt(tl: Timeline, t: number): number {
  if (t >= tl.end) return 0.45;
  for (const b of tl.breaks) if (t >= b.from && t < b.to) return b.level;
  for (const [a, b] of tl.builds) if (t >= a && t < b) return 0.5;
  const firstDrop = tl.drops.length ? Math.min(...tl.drops) : Infinity;
  return t < firstDrop ? tl.intro : 1;
}

/** Chord tone `i` of a chord: indexes wrap up by octaves. */
function tone(chord: Chord, i: number): number {
  const n = chord.notes.length;
  return chord.notes[i % n] + 12 * Math.floor(i / n);
}

/** Mix buses, for soloing one while balancing the mix. */
export type Stem = "drums" | "low" | "pump" | "melody" | "sfx";

export async function renderSoundtrack(
  id: string,
  spec: AudioSpec,
  frames: number,
  fps: number,
  solo?: Stem,
): Promise<AudioBuffer> {
  const style: Style = STYLES[spec.style];
  const T = (f: number) => f / fps;
  const tl: Timeline = {
    end: T(spec.end),
    dur: frames / fps,
    drops: (spec.drops ?? []).map(T),
    builds: (spec.builds ?? []).map(([a, b]) => [T(a), T(b)]),
    breaks: (spec.breaks ?? []).map((b) => ({ from: T(b.from), to: T(b.to), level: b.level ?? 0.35 })),
    intro: spec.intro ?? 0.92,
  };
  const ctx = new OfflineAudioContext(2, Math.round(tl.dur * SAMPLE_RATE), SAMPLE_RATE);
  const rnd = seeded(hash(id));

  // ---- buses: music (drums, pump, melody) → filter → level → master; sfx → master
  // Headroom: the mix peaks well under the soft clipper; loudness is set later (-14 LUFS).
  const master = ctx.createGain();
  master.gain.value = 0.5;
  const comp = ctx.createDynamicsCompressor();
  comp.threshold.value = -24;
  comp.ratio.value = 3;
  comp.attack.value = 0.006;
  comp.release.value = 0.16;
  comp.knee.value = 10;
  const makeup = ctx.createGain();
  makeup.gain.value = 1.6;
  const clip = ctx.createWaveShaper();
  clip.curve = I.softClipCurve(1.4);
  clip.oversample = "4x";
  // Phone-speaker EQ: no rumble a phone can't play, a touch less boom, more air.
  const rumble = ctx.createBiquadFilter();
  rumble.type = "highpass";
  rumble.frequency.value = 38;
  const lowShelf = ctx.createBiquadFilter();
  lowShelf.type = "lowshelf";
  lowShelf.frequency.value = 110;
  lowShelf.gain.value = -4;
  const presence = ctx.createBiquadFilter();
  presence.type = "peaking";
  presence.frequency.value = 3000;
  presence.Q.value = 0.8;
  presence.gain.value = 3;
  const air = ctx.createBiquadFilter();
  air.type = "highshelf";
  air.frequency.value = 6500;
  air.gain.value = 5;
  master
    .connect(rumble)
    .connect(lowShelf)
    .connect(presence)
    .connect(air)
    .connect(comp)
    .connect(makeup)
    .connect(clip)
    .connect(ctx.destination);

  const musicFilter = ctx.createBiquadFilter();
  musicFilter.type = "lowpass";
  musicFilter.frequency.value = 20000;
  musicFilter.Q.value = 0.9;
  const musicLevel = ctx.createGain();
  musicFilter.connect(musicLevel).connect(master);

  const drums = ctx.createGain();
  drums.gain.value = 0.85;
  drums.connect(musicFilter);
  const duck = ctx.createGain();
  duck.connect(musicFilter);
  // Bus levels, balanced by soloing stems (RMS vs drums): bass about -2 dB,
  // chords -4, melody -5, effects -7.
  const pump = ctx.createGain();
  pump.gain.value = 0.6;
  pump.connect(duck);
  const low = ctx.createGain();
  low.gain.value = 0.55;
  low.connect(duck);
  const melody = ctx.createGain();
  melody.gain.value = 1.6;
  melody.connect(musicFilter);
  const sfx = ctx.createGain();
  sfx.gain.value = 0.65;
  sfx.connect(master);
  const verb = ctx.createConvolver();
  verb.buffer = I.reverbImpulse(ctx, rnd);
  const verbReturn = ctx.createGain();
  verbReturn.gain.value = 0.32;
  verb.connect(verbReturn).connect(master);

  const r: I.Rig = { ctx, drums, pump, low, melody, sfx, verb, noise: I.noiseBuffer(ctx, rnd), rnd };
  if (solo) {
    const buses = { drums, low, pump, melody, sfx };
    for (const [k, node] of Object.entries(buses)) if (k !== solo) node.gain.value = 0;
    verbReturn.gain.value = 0;
  }

  // ---- the grid
  const beat = 60 / style.bpm;
  const bar = beat * 4;
  const step = beat / 4;
  const len = style.progression.length;
  const firstBar = Math.floor(-tl.end / bar);
  const kicks: number[] = [];
  const human = () => 0.92 + rnd() * 0.12;

  for (let n = firstBar; tl.end + n * bar < tl.dur; n++) {
    const t0 = tl.end + n * bar;
    const outro = n >= 0;
    const chord = outro ? style.home : style.progression[mod(n, len)];
    const chordIndex = mod(n, len);

    for (let s = 0; s < 16; s++) {
      const t = t0 + s * step + (s % 2 === 1 ? style.swing * step : 0);
      if (t < 0 || t >= tl.dur - 0.05) continue;
      const e = energyAt(tl, t);
      if (e <= 0) continue;

      // Outro: the home chord rings under the sting; just a kick on the one.
      if (outro) {
        if (n === 0 && s === 0) {
          kicks.push(t);
          I.kick(r, t, 1, style.kickKind);
          I.pad(r, t, Math.max(0.5, tl.dur - t - 0.3), chord.notes, 1.2);
        }
        if (s % 4 === 0 && n === 0 && s > 0 && style.shaker.length) I.shaker(r, t, 0.4);
        continue;
      }

      // Drums.
      if (style.kick[s] && e >= 0.55) {
        kicks.push(t);
        I.kick(r, t, style.kick[s] * human(), style.kickKind);
      }
      if (style.snare[s] && e >= 0.45) I.snare(r, t, style.snare[s] * human());
      if (style.clap[s] && e >= 0.45) I.clap(r, t, style.clap[s] * human());
      if (style.hat[s] && e >= 0.3) {
        const open = style.openHat.includes(s) && e >= 0.9;
        I.hat(r, t, style.hat[s] * human() * (open ? 0.9 : 1), open);
      } else if (style.openHat.includes(s) && e >= 0.9) I.hat(r, t, 0.7, true);
      if (style.shaker[s] && e >= 0.3) I.shaker(r, t, style.shaker[s] * human());

      // Bass.
      const bi = style.bass.steps.indexOf(s);
      if (bi >= 0 && e >= 0.4) {
        const next = style.bass.steps[bi + 1] ?? 16;
        const dur = Math.min((next - s) * step * 0.9, beat);
        I.bass(r, t, dur, chord.bass + (style.bass.intervals?.[bi] ?? 0), human(), style.bass.kind);
      }

      // Chords.
      if (s === 0 && style.chords.pad) I.pad(r, t, bar - 0.05, chord.notes, e >= 0.5 ? 1 : 1.4);
      const ci = style.chords.steps.indexOf(s);
      if (ci >= 0 && e >= 0.5) {
        const k = style.chords.kind;
        if (k === "stab") I.stab(r, t, style.chords.length, chord.notes, human());
        else if (k === "pluck") I.pluck(r, t, chord.notes.map((m) => m + 12), 0.9 * human(), style.chords.length);
        else if (k === "keys") I.keys(r, t, Math.min(style.chords.length * beat, bar), chord.notes, human());
        else I.strum(r, t, chord.notes, human(), s % 4 === 0, style.chords.length);
      } else if (ci >= 0 && style.chords.kind === "keys" && s === 0 && e > 0) {
        I.keys(r, t, bar, chord.notes, 0.8);
      }

      // Melody once the groove is all in.
      if (style.arp && e >= 0.9) {
        const ai = style.arp.steps.indexOf(s);
        if (ai >= 0) {
          const m = tone(chord, style.arp.order[ai]) + style.arp.octave;
          if (style.arp.kind === "marimba") I.marimba(r, t, m, human());
          else if (style.arp.kind === "pluck") I.pluck(r, t, [m], 0.55 * human(), 0.18, melody);
          else I.bell(r, t, m, 1.1 * human(), 1);
        }
      }
      if (style.lead && e >= 0.95) {
        for (const [ls, m] of style.lead.bars[chordIndex]) if (ls === s) I.bell(r, t, m, human(), 1.1);
      }
    }
  }

  // ---- builds, drops, the sting
  for (const [a, b] of tl.builds) {
    I.riser(r, a, b);
    I.roll(r, Math.max(a, b - bar), b);
  }
  for (const d of tl.drops) {
    I.impact(r, d, 0.9);
    if (!kicks.some((k) => Math.abs(k - d) < 0.03)) {
      kicks.push(d);
      I.kick(r, d, 1, style.kickKind);
    }
  }
  if (tl.end < tl.dur) {
    I.impact(r, tl.end, 0.7);
    style.sting.forEach((m, i) => I.bell(r, tl.end + 0.05 + i * 0.09, m, 1.3, i === style.sting.length - 1 ? 2.2 : 1.2, r.sfx));
  }
  if (style.crackle) I.crackle(r, 0, tl.dur);

  // ---- sound effects
  const scale = [...style.home.notes.map((m) => m + 12), style.home.notes[0] + 14];
  for (const fx of spec.sfx ?? []) {
    const t = T(fx.at);
    if (t >= 0 && t < tl.dur) I.sfx(r, fx.kind, t, fx.gain ?? 1, scale);
  }

  // ---- automation: sidechain duck, break/build filtering, fade in and out
  kicks.sort((a, b) => a - b);
  duck.gain.setValueAtTime(1, 0);
  kicks.forEach((k, i) => {
    const next = kicks[i + 1] ?? Infinity;
    if (next - k < 0.03) return;
    duck.gain.setValueAtTime(1, k);
    duck.gain.linearRampToValueAtTime(0.45, k + 0.01);
    duck.gain.linearRampToValueAtTime(1, k + Math.min(0.24, next - k - 0.01));
  });

  type Seg = { from: number; to: number; kind: "break" | "build"; level: number };
  const segs: Seg[] = [
    ...tl.breaks.map((b) => ({ ...b, kind: "break" as const })),
    ...tl.builds.map(([from, to]) => ({ from, to, kind: "build" as const, level: 0.5 })),
  ].sort((a, b) => a.from - b.from);
  const f = musicFilter.frequency;
  const lvl = musicLevel.gain;
  f.setValueAtTime(20000, 0);
  lvl.setValueAtTime(0, 0);
  lvl.linearRampToValueAtTime(1, 0.04);
  for (const sg of segs) {
    if (sg.kind === "build") {
      f.setValueAtTime(20000, sg.from);
      f.exponentialRampToValueAtTime(650, sg.from + 0.2);
      f.exponentialRampToValueAtTime(20000, sg.to);
    } else if (sg.level <= 0) {
      lvl.setValueAtTime(1, sg.from);
      lvl.linearRampToValueAtTime(0, sg.from + 0.04);
      lvl.setValueAtTime(0, sg.to - 0.01);
      lvl.linearRampToValueAtTime(1, sg.to);
    } else {
      f.setValueAtTime(20000, sg.from);
      f.exponentialRampToValueAtTime(1100, sg.from + 0.25);
      f.setValueAtTime(1100, sg.to - 0.06);
      f.exponentialRampToValueAtTime(20000, sg.to);
    }
  }
  const fadeAt = Math.max(tl.end + 0.5, tl.dur - 0.6);
  master.gain.setValueAtTime(0.5, fadeAt);
  master.gain.linearRampToValueAtTime(0, tl.dur);

  return ctx.startRendering();
}

/** 32-bit float stereo WAV, base64 (it crosses into Node through CDP). */
export function wavBase64(buf: AudioBuffer): string {
  const ch = buf.numberOfChannels;
  const n = buf.length;
  const bytes = new ArrayBuffer(44 + n * ch * 4);
  const v = new DataView(bytes);
  const w = (o: number, s: string) => [...s].forEach((c, i) => v.setUint8(o + i, c.charCodeAt(0)));
  w(0, "RIFF");
  v.setUint32(4, 36 + n * ch * 4, true);
  w(8, "WAVE");
  w(12, "fmt ");
  v.setUint32(16, 16, true);
  v.setUint16(20, 3, true); // IEEE float
  v.setUint16(22, ch, true);
  v.setUint32(24, buf.sampleRate, true);
  v.setUint32(28, buf.sampleRate * ch * 4, true);
  v.setUint16(32, ch * 4, true);
  v.setUint16(34, 32, true);
  w(36, "data");
  v.setUint32(40, n * ch * 4, true);
  const data = [...Array(ch)].map((_, c) => buf.getChannelData(c));
  let o = 44;
  for (let i = 0; i < n; i++) for (let c = 0; c < ch; c++, o += 4) v.setFloat32(o, data[c][i], true);
  const u8 = new Uint8Array(bytes);
  let s = "";
  for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode(...u8.subarray(i, i + 0x8000));
  return btoa(s);
}
