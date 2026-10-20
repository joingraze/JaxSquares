// Web Audio instruments for the soundtracks, rendered offline (OfflineAudioContext)
// so a mix is deterministic: every noise source draws from one seeded buffer.
// Bass and kicks carry upper harmonics on purpose: phone speakers drop most of
// what's below ~120 Hz.

export const mtof = (m: number) => 440 * Math.pow(2, (m - 69) / 12);

export interface Rig {
  ctx: BaseAudioContext;
  /** Drums. */
  drums: AudioNode;
  /** Chords: ducked by the kick. */
  pump: AudioNode;
  /** Bass: ducked by the kick too. */
  low: AudioNode;
  /** Melodic lines that ride over the pump. */
  melody: AudioNode;
  /** Sound effects (not filtered or ducked with the music). */
  sfx: AudioNode;
  /** Reverb send. */
  verb: AudioNode;
  noise: AudioBuffer;
  rnd: () => number;
}

function env(g: GainNode, t: number, peak: number, attack: number, hold: number, release: number) {
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(peak, t + attack);
  if (hold > 0) g.gain.setValueAtTime(peak, t + attack + hold);
  g.gain.exponentialRampToValueAtTime(0.0001, t + attack + hold + release);
}

function gain(r: Rig, value = 1): GainNode {
  const g = r.ctx.createGain();
  g.gain.value = value;
  return g;
}

function send(r: Rig, node: AudioNode, amount: number) {
  if (amount <= 0) return;
  const s = gain(r, amount);
  node.connect(s).connect(r.verb);
}

function noiseSource(r: Rig, t: number, dur: number): AudioBufferSourceNode {
  const src = r.ctx.createBufferSource();
  src.buffer = r.noise;
  src.loop = true;
  const offset = r.rnd() * (r.noise.duration - 0.5);
  src.start(t, offset);
  src.stop(t + dur);
  return src;
}

function filter(r: Rig, type: BiquadFilterType, freq: number, q = 0.7): BiquadFilterNode {
  const f = r.ctx.createBiquadFilter();
  f.type = type;
  f.frequency.value = freq;
  f.Q.value = q;
  return f;
}

function osc(r: Rig, type: OscillatorType, freq: number, t: number, dur: number, detune = 0): OscillatorNode {
  const o = r.ctx.createOscillator();
  o.type = type;
  o.frequency.value = freq;
  o.detune.value = detune;
  o.start(t);
  o.stop(t + dur);
  return o;
}

function panner(r: Rig, pan: number): StereoPannerNode {
  const p = r.ctx.createStereoPanner();
  p.pan.value = pan;
  return p;
}

// ---------------------------------------------------------------- drums

export function kick(r: Rig, t: number, v: number, kind: "punch" | "stomp" | "boom" = "punch") {
  const [f0, f1, len] = kind === "stomp" ? [120, 55, 0.3] : kind === "boom" ? [140, 52, 0.34] : [170, 56, 0.26];
  const o = osc(r, "sine", f0, t, len + 0.05);
  o.frequency.setValueAtTime(f0, t);
  o.frequency.exponentialRampToValueAtTime(f1, t + 0.09);
  const g = gain(r, 0);
  env(g, t, 0.55 * v, 0.002, 0.015, len);
  // A little drive gives the kick harmonics a phone can play.
  const drive = r.ctx.createWaveShaper();
  drive.curve = softClipCurve(2.2);
  o.connect(g).connect(drive).connect(r.drums);
  // Beater click.
  const n = noiseSource(r, t, 0.02);
  const hp = filter(r, "highpass", kind === "stomp" ? 1200 : 3000);
  const cg = gain(r, 0);
  env(cg, t, (kind === "stomp" ? 0.3 : 0.2) * v, 0.0005, 0, 0.014);
  n.connect(hp).connect(cg).connect(r.drums);
  if (kind === "stomp") send(r, g, 0.25);
}

export function snare(r: Rig, t: number, v: number) {
  const n = noiseSource(r, t, 0.3);
  const bp = filter(r, "bandpass", 1900, 0.8);
  const g = gain(r, 0);
  env(g, t, 0.55 * v, 0.001, 0.01, 0.17);
  n.connect(bp).connect(g).connect(r.drums);
  send(r, g, 0.18);
  const body = osc(r, "triangle", 190, t, 0.15);
  body.frequency.exponentialRampToValueAtTime(160, t + 0.08);
  const bg = gain(r, 0);
  env(bg, t, 0.4 * v, 0.001, 0, 0.09);
  body.connect(bg).connect(r.drums);
}

export function clap(r: Rig, t: number, v: number) {
  const n = noiseSource(r, t, 0.35);
  const bp = filter(r, "bandpass", 1250, 1.1);
  const g = gain(r, 0);
  // Three quick hands, then the room.
  g.gain.setValueAtTime(0, t);
  for (const d of [0, 0.011, 0.022]) {
    g.gain.setValueAtTime(0.5 * v, t + d);
    g.gain.exponentialRampToValueAtTime(0.08 * v, t + d + 0.009);
  }
  g.gain.setValueAtTime(0.45 * v, t + 0.032);
  g.gain.exponentialRampToValueAtTime(0.0001, t + 0.22);
  n.connect(bp).connect(g).connect(r.drums);
  send(r, g, 0.3);
}

export function hat(r: Rig, t: number, v: number, open = false) {
  const len = open ? 0.26 : 0.045;
  const n = noiseSource(r, t, len + 0.02);
  const hp = filter(r, "highpass", 7800);
  const pk = filter(r, "peaking", 10000, 1);
  pk.gain.value = 4;
  const g = gain(r, 0);
  env(g, t, 0.32 * v, 0.001, 0, len);
  n.connect(hp).connect(pk).connect(g).connect(panner(r, 0.18)).connect(r.drums);
}

export function shaker(r: Rig, t: number, v: number) {
  const n = noiseSource(r, t, 0.1);
  const bp = filter(r, "bandpass", 6200, 1.4);
  const g = gain(r, 0);
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(0.24 * v, t + 0.012);
  g.gain.exponentialRampToValueAtTime(0.0001, t + 0.075);
  n.connect(bp).connect(g).connect(panner(r, -0.22)).connect(r.drums);
}

export function crash(r: Rig, t: number, v: number, dest?: AudioNode) {
  const n = noiseSource(r, t, 2.2);
  const hp = filter(r, "highpass", 4200);
  const g = gain(r, 0);
  env(g, t, 0.2 * v, 0.002, 0, 1.9);
  n.connect(hp).connect(g).connect(dest ?? r.drums);
  send(r, g, 0.25);
}

/** A snare roll that speeds up into `to`. */
export function roll(r: Rig, from: number, to: number) {
  let t = from;
  while (t < to - 0.01) {
    const p = (t - from) / (to - from);
    snare(r, t, 0.25 + 0.6 * p);
    t += p < 0.5 ? 0.25 : p < 0.8 ? 0.125 : 0.0625;
  }
}

/** Faint vinyl crackle for the retro tracks. */
export function crackle(r: Rig, from: number, to: number) {
  const n = noiseSource(r, from, to - from);
  const bp = filter(r, "bandpass", 3200, 0.6);
  const g = gain(r, 0.012);
  n.connect(bp).connect(g).connect(r.drums);
  for (let t = from; t < to; t += 0.03 + r.rnd() * 0.25) {
    const c = noiseSource(r, t, 0.006);
    const cg = gain(r, 0);
    env(cg, t, 0.03 + r.rnd() * 0.05, 0.0005, 0, 0.004);
    c.connect(filter(r, "highpass", 2000)).connect(cg).connect(r.drums);
  }
}

// ---------------------------------------------------------------- bass

export function bass(r: Rig, t: number, dur: number, midi: number, v: number, kind: "saw" | "round" | "pluck") {
  const f = mtof(midi);
  const g = gain(r, 0);
  if (kind === "saw") {
    const a = osc(r, "sawtooth", f, t, dur + 0.1);
    const b = osc(r, "square", f, t, dur + 0.1, 8);
    const bg = gain(r, 0.4);
    const lp = filter(r, "lowpass", 300, 3);
    lp.frequency.setValueAtTime(300, t);
    lp.frequency.linearRampToValueAtTime(1800, t + 0.012);
    lp.frequency.exponentialRampToValueAtTime(600, t + Math.min(dur, 0.25));
    a.connect(lp);
    b.connect(bg).connect(lp);
    lp.connect(g);
    env(g, t, 0.24 * v, 0.004, Math.max(0, dur - 0.08), 0.06);
  } else if (kind === "round") {
    const a = osc(r, "triangle", f, t, dur + 0.2);
    const h = osc(r, "sine", f * 2, t, dur + 0.2);
    const hg = gain(r, 0.3);
    a.connect(g);
    h.connect(hg).connect(g);
    env(g, t, 0.36 * v, 0.006, Math.max(0, dur - 0.12), 0.12);
  } else {
    // Upright-ish: a plucked triangle with a thumpy start.
    const a = osc(r, "triangle", f, t, 0.9);
    const h = osc(r, "sine", f * 2, t, 0.3);
    const hg = gain(r, 0);
    env(hg, t, 0.25 * v, 0.002, 0, 0.12);
    h.connect(hg).connect(r.low);
    a.connect(g);
    env(g, t, 0.38 * v, 0.003, 0.02, 0.6);
  }
  g.connect(r.low);
}

// ---------------------------------------------------------------- chords

/** Supersaw stab: three detuned saws per note through a closing filter. */
export function stab(r: Rig, t: number, dur: number, notes: number[], v: number) {
  const lp = filter(r, "lowpass", 6000, 1);
  lp.frequency.setValueAtTime(7000, t);
  lp.frequency.exponentialRampToValueAtTime(2200, t + dur);
  const g = gain(r, 0);
  env(g, t, 0.13 * v, 0.004, dur * 0.4, dur * 0.6 + 0.08);
  notes.forEach((m, i) => {
    for (const d of [-11, 0, 11]) {
      const o = osc(r, "sawtooth", mtof(m), t, dur + 0.2, d + (r.rnd() - 0.5) * 4);
      o.connect(panner(r, (i - 1) * 0.3 + d / 40)).connect(lp);
    }
  });
  lp.connect(g).connect(r.pump);
  send(r, g, 0.22);
}

/** Soft sustained pad under everything. */
export function pad(r: Rig, t: number, dur: number, notes: number[], v: number) {
  const lp = filter(r, "lowpass", 2600, 0.4);
  const g = gain(r, 0);
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(0.05 * v, t + Math.min(0.3, dur / 3));
  g.gain.setValueAtTime(0.05 * v, t + Math.max(0.3, dur - 0.1));
  g.gain.linearRampToValueAtTime(0, t + dur + 0.5);
  notes.forEach((m) => {
    for (const d of [-7, 7]) osc(r, "sawtooth", mtof(m), t, dur + 0.6, d).connect(lp);
    osc(r, "triangle", mtof(m + 12), t, dur + 0.6).connect(lp);
  });
  lp.connect(g).connect(r.pump);
  send(r, g, 0.4);
}

/** Short synth pluck (chords or single notes). */
export function pluck(r: Rig, t: number, notes: number[], v: number, len = 0.3, dest?: AudioNode) {
  const lp = filter(r, "lowpass", 4000, 2);
  lp.frequency.setValueAtTime(5200, t);
  lp.frequency.exponentialRampToValueAtTime(600, t + len);
  const g = gain(r, 0);
  env(g, t, 0.16 * v, 0.002, 0, len + 0.1);
  for (const m of notes) {
    osc(r, "sawtooth", mtof(m), t, len + 0.2).connect(lp);
    osc(r, "square", mtof(m), t, len + 0.2, 7).connect(lp);
  }
  lp.connect(g).connect(dest ?? r.pump);
  send(r, g, 0.25);
}

/** Electric piano: two-operator FM with a decaying bell tine, and a slow tremolo. */
export function keys(r: Rig, t: number, dur: number, notes: number[], v: number) {
  const out = gain(r, 1);
  const trem = osc(r, "sine", 4.6, t, dur + 1);
  const tg = gain(r, 0.12);
  trem.connect(tg).connect(out.gain);
  for (const m of notes) {
    const f = mtof(m);
    const car = osc(r, "sine", f, t, dur + 0.8);
    const mod = osc(r, "sine", f, t, dur + 0.8);
    const mg = gain(r, 0);
    mg.gain.setValueAtTime(f * 1.6, t);
    mg.gain.exponentialRampToValueAtTime(f * 0.15, t + 1.2);
    mod.connect(mg).connect(car.frequency);
    const g = gain(r, 0);
    env(g, t, 0.12 * v, 0.004, Math.max(0, dur - 0.4), 0.7);
    car.connect(g).connect(out);
    const tine = osc(r, "sine", f * 4, t, 0.4);
    const tgn = gain(r, 0);
    env(tgn, t, 0.035 * v, 0.001, 0, 0.25);
    tine.connect(tgn).connect(out);
  }
  out.connect(r.pump);
  send(r, out, 0.3);
}

// Karplus–Strong strings, synthesized in JS (a feedback DelayNode can't go
// below one render quantum, too long for guitar pitches). Cached per note.
const strings = new WeakMap<BaseAudioContext, Map<number, AudioBuffer>>();

function stringBuffer(r: Rig, midi: number): AudioBuffer {
  let cache = strings.get(r.ctx);
  if (!cache) strings.set(r.ctx, (cache = new Map()));
  const hit = cache.get(midi);
  if (hit) return hit;
  const sr = r.ctx.sampleRate;
  const len = Math.round(sr * 1.8);
  const buf = r.ctx.createBuffer(1, len, sr);
  const y = buf.getChannelData(0);
  // Loop delay = n + d samples of interpolated delay + 0.5 from the averaging
  // filter, which adds up to exactly one period: the string stays in tune.
  const period = sr / mtof(midi);
  const n = Math.floor(period - 0.5);
  const d = period - 0.5 - n;
  // Pluck: a burst of slightly low-passed noise.
  let prev = 0;
  for (let i = 0; i < n + 2; i++) {
    const w = r.rnd() * 2 - 1;
    prev = prev * 0.5 + w * 0.5;
    y[i] = prev;
  }
  const decay = 0.996 - Math.max(0, midi - 60) * 0.0004;
  const tap = (i: number) => (1 - d) * y[i - n] + d * y[i - n - 1];
  for (let i = n + 2; i < len; i++) y[i] = decay * 0.5 * (tap(i) + tap(i - 1));
  cache.set(midi, buf);
  return buf;
}

/** A strummed chord: strings 12 ms apart, down (low → high) or up. */
export function strum(r: Rig, t: number, notes: number[], v: number, down: boolean, len = 1.2) {
  const order = down ? notes : [...notes].reverse().slice(0, 3);
  const g = gain(r, 0.34 * v * (down ? 1 : 0.65));
  const tone = filter(r, "lowpass", down ? 6500 : 5000, 0.5);
  order.forEach((m, i) => {
    const src = r.ctx.createBufferSource();
    src.buffer = stringBuffer(r, m);
    const sg = gain(r, 0);
    const st = t + i * 0.012;
    sg.gain.setValueAtTime(1, st);
    sg.gain.setValueAtTime(1, st + len);
    sg.gain.linearRampToValueAtTime(0, st + len + 0.08);
    src.connect(sg).connect(panner(r, (i / Math.max(1, order.length - 1) - 0.5) * 0.5)).connect(tone);
    src.start(st);
    src.stop(st + len + 0.1);
  });
  tone.connect(g).connect(r.pump);
  send(r, g, 0.18);
}

// ---------------------------------------------------------------- melodic

export function marimba(r: Rig, t: number, midi: number, v: number, dest?: AudioNode) {
  const f = mtof(midi);
  const g = gain(r, 0);
  env(g, t, 0.26 * v, 0.001, 0, 0.45);
  osc(r, "sine", f, t, 0.6).connect(g);
  const h = osc(r, "sine", f * 4, t, 0.15);
  const hg = gain(r, 0);
  env(hg, t, 0.07 * v, 0.0005, 0, 0.06);
  h.connect(hg).connect(g);
  g.connect(dest ?? r.melody);
  send(r, g, 0.2);
}

/** FM bell / glockenspiel. */
export function bell(r: Rig, t: number, midi: number, v: number, len = 1.4, dest?: AudioNode) {
  const f = mtof(midi);
  const car = osc(r, "sine", f, t, len + 0.1);
  const mod = osc(r, "sine", f * 3.5, t, len + 0.1);
  const mg = gain(r, 0);
  mg.gain.setValueAtTime(f * 2.2, t);
  mg.gain.exponentialRampToValueAtTime(f * 0.05, t + len * 0.6);
  mod.connect(mg).connect(car.frequency);
  const g = gain(r, 0);
  env(g, t, 0.16 * v, 0.001, 0, len);
  car.connect(g).connect(dest ?? r.melody);
  send(r, g, 0.35);
}

// ---------------------------------------------------------------- effects

export function riser(r: Rig, from: number, to: number) {
  const dur = to - from;
  const n = noiseSource(r, from, dur + 0.05);
  const bp = filter(r, "bandpass", 300, 1.2);
  bp.frequency.setValueAtTime(300, from);
  bp.frequency.exponentialRampToValueAtTime(7000, to);
  const g = gain(r, 0);
  g.gain.setValueAtTime(0, from);
  g.gain.linearRampToValueAtTime(0.16, to - 0.02);
  g.gain.linearRampToValueAtTime(0, to + 0.03);
  n.connect(bp).connect(g).connect(r.sfx);
  send(r, g, 0.3);
  // A pitch climbing an octave under the noise.
  const o = osc(r, "sawtooth", 220, from, dur + 0.05);
  o.frequency.setValueAtTime(220, from);
  o.frequency.exponentialRampToValueAtTime(880, to);
  const lp = filter(r, "lowpass", 1800);
  const og = gain(r, 0);
  og.gain.setValueAtTime(0, from);
  og.gain.linearRampToValueAtTime(0.035, to - 0.02);
  og.gain.linearRampToValueAtTime(0, to + 0.03);
  o.connect(lp).connect(og).connect(r.sfx);
}

export function impact(r: Rig, t: number, v = 1) {
  const o = osc(r, "sine", 90, t, 1.0);
  o.frequency.setValueAtTime(90, t);
  o.frequency.exponentialRampToValueAtTime(45, t + 0.6);
  const g = gain(r, 0);
  env(g, t, 0.38 * v, 0.002, 0.04, 0.7);
  const drive = r.ctx.createWaveShaper();
  drive.curve = softClipCurve(3);
  o.connect(g).connect(drive).connect(r.sfx);
  const n = noiseSource(r, t, 0.6);
  const lp = filter(r, "lowpass", 2200);
  const ng = gain(r, 0);
  env(ng, t, 0.4 * v, 0.001, 0, 0.4);
  n.connect(lp).connect(ng).connect(r.sfx);
  send(r, ng, 0.5);
  crash(r, t, 0.8 * v, r.sfx);
}

export function sfx(r: Rig, kind: string, t: number, v = 1, scale: number[] = [72, 74, 76, 79, 81]) {
  switch (kind) {
    case "tap": {
      const o = osc(r, "sine", 1500, t, 0.06);
      o.frequency.exponentialRampToValueAtTime(760, t + 0.03);
      const g = gain(r, 0);
      env(g, t, 0.11 * v, 0.0005, 0, 0.045);
      o.connect(g).connect(r.sfx);
      break;
    }
    case "pop": {
      const o = osc(r, "sine", 420, t, 0.1);
      o.frequency.exponentialRampToValueAtTime(1050, t + 0.05);
      const g = gain(r, 0);
      env(g, t, 0.16 * v, 0.001, 0, 0.07);
      o.connect(g).connect(r.sfx);
      break;
    }
    case "whoosh": {
      const n = noiseSource(r, t, 0.6);
      const bp = filter(r, "bandpass", 350, 0.9);
      bp.frequency.setValueAtTime(350, t);
      bp.frequency.exponentialRampToValueAtTime(3200, t + 0.22);
      bp.frequency.exponentialRampToValueAtTime(700, t + 0.5);
      const g = gain(r, 0);
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(0.2 * v, t + 0.2);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.5);
      const p = r.ctx.createStereoPanner();
      p.pan.setValueAtTime(-0.7, t);
      p.pan.linearRampToValueAtTime(0.7, t + 0.5);
      n.connect(bp).connect(g).connect(p).connect(r.sfx);
      break;
    }
    case "ding":
      bell(r, t, 88, 1.6 * v, 1.2, r.sfx);
      bell(r, t + 0.09, 95, 1.3 * v, 1.4, r.sfx);
      break;
    case "sparkle":
      for (let i = 0; i < 7; i++) {
        const m = scale[Math.floor(r.rnd() * scale.length)] + 12 * (1 + Math.floor(r.rnd() * 2));
        bell(r, t + i * 0.07 + r.rnd() * 0.03, m, 0.55 * v, 0.6, r.sfx);
      }
      break;
    case "impact":
      impact(r, t, v);
      break;
    case "tick": {
      const n = noiseSource(r, t, 0.01);
      const g = gain(r, 0);
      env(g, t, 0.09 * v, 0.0005, 0, 0.006);
      n.connect(filter(r, "highpass", 2600)).connect(g).connect(r.sfx);
      break;
    }
    case "womp": {
      // Four sinking notes, the last one wobbling.
      const lp = filter(r, "lowpass", 900, 1);
      const g = gain(r, 0.2 * v);
      [55, 54, 53, 52].forEach((m, i) => {
        const st = t + i * 0.3;
        const len = i === 3 ? 0.8 : 0.26;
        const o = osc(r, "sawtooth", mtof(m), st, len + 0.05);
        if (i === 3) {
          const lfo = osc(r, "sine", 6, st, len + 0.05);
          const lg = gain(r, 18);
          lfo.connect(lg).connect(o.detune);
        }
        const ng = gain(r, 0);
        env(ng, st, 1, 0.02, len - 0.06, 0.05);
        o.connect(ng).connect(lp);
      });
      lp.connect(g).connect(r.sfx);
      break;
    }
    case "stop": {
      const o = osc(r, "sawtooth", 330, t, 0.5);
      o.frequency.exponentialRampToValueAtTime(30, t + 0.45);
      const lp = filter(r, "lowpass", 1200);
      const g = gain(r, 0);
      env(g, t, 0.18 * v, 0.002, 0.2, 0.25);
      o.connect(lp).connect(g).connect(r.sfx);
      break;
    }
    case "cheer": {
      // A crowd swell: bands of noise, each fluttering at its own rate.
      const out = gain(r, 0);
      out.gain.setValueAtTime(0, t);
      out.gain.linearRampToValueAtTime(0.3 * v, t + 0.35);
      out.gain.linearRampToValueAtTime(0.22 * v, t + 1.2);
      out.gain.linearRampToValueAtTime(0, t + 2.4);
      for (const f of [480, 720, 1050, 1500, 2100, 2900]) {
        const n = noiseSource(r, t, 2.5);
        const bp = filter(r, "bandpass", f, 1.4);
        const g = gain(r, 0.5);
        const lfo = osc(r, "sine", 3 + r.rnd() * 6, t, 2.5);
        const lg = gain(r, 0.35);
        lfo.connect(lg).connect(g.gain);
        n.connect(bp).connect(g).connect(out);
      }
      out.connect(r.sfx);
      send(r, out, 0.4);
      break;
    }
  }
}

// ---------------------------------------------------------------- utilities

export function softClipCurve(amount: number): Float32Array<ArrayBuffer> {
  const n = 2048;
  const curve = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const x = (i / (n - 1)) * 2 - 1;
    curve[i] = Math.tanh(amount * x) / Math.tanh(amount);
  }
  return curve;
}

/** A generated stereo hall: decaying noise that darkens as it fades. */
export function reverbImpulse(ctx: BaseAudioContext, rnd: () => number, seconds = 2.2): AudioBuffer {
  const sr = ctx.sampleRate;
  const len = Math.round(sr * seconds);
  const ir = ctx.createBuffer(2, len, sr);
  for (let c = 0; c < 2; c++) {
    const d = ir.getChannelData(c);
    let lp = 0;
    for (let i = 0; i < len; i++) {
      const p = i / len;
      const k = 0.15 + 0.8 * p; // more smoothing (darker) later in the tail
      lp = lp * k + (rnd() * 2 - 1) * (1 - k);
      d[i] = lp * Math.pow(1 - p, 2.4) * (i < sr * 0.012 ? i / (sr * 0.012) : 1);
    }
  }
  return ir;
}

export function noiseBuffer(ctx: BaseAudioContext, rnd: () => number, seconds = 3): AudioBuffer {
  const buf = ctx.createBuffer(1, Math.round(ctx.sampleRate * seconds), ctx.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = rnd() * 2 - 1;
  return buf;
}
