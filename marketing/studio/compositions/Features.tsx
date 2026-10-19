import type { ReactNode } from "react";
import type { CompProps } from "../types";
import { interpolate, spring } from "../lib/anim";
import { Backdrop } from "../components/Backdrop";
import { Headline, Kicker } from "../components/Text";
import { EndCard } from "../components/Brand";
import { PlayerBar } from "../../../src/components/PlayerBar";
import { Card, Field, Pill, TextInput } from "../../../src/components/ui";
import { PLAYER_COLORS } from "../../../src/lib/identity";
import { COLORS } from "../brand";

export const FEATURES_FRAMES = 384;
const FPS = 30;
const LEN = 52;

interface Beat {
  kicker: string;
  text: string;
  visual: (f: number) => ReactNode;
}

const BEATS: Beat[] = [
  {
    kicker: "Players",
    text: "No app to *download.*",
    visual: (f) => (
      <div className="flex flex-col items-center gap-3">
        <div className="flex items-center gap-2 rounded-full bg-pitch-800 px-4 py-2.5 text-[14px] text-slate-300 ring-1 ring-white/10">
          🔗 <span className="font-semibold text-white">Join my squares pool</span>
        </div>
        <div className="text-3xl" style={{ transform: `translateY(${Math.sin(f / 4) * 4}px)` }}>
          👆
        </div>
        <div className="text-[13px] text-slate-400">Tap the link. You're in.</div>
      </div>
    ),
  },
  {
    kicker: "Players",
    text: "No accounts.|No *passwords.*",
    visual: (f) => (
      <div className="w-[300px]">
        <PlayerBar
          name={"Maya".slice(0, Math.max(0, Math.floor(f / 3)))}
          color={PLAYER_COLORS[Math.min(7, Math.floor(f / 6)) % 8]}
          onName={() => {}}
          onColor={() => {}}
        />
        <p className="mt-2 text-center text-[13px] text-slate-400">
          Your name + a color. That's it.
        </p>
      </div>
    ),
  },
  {
    kicker: "Commissioner",
    text: "Free pool?|Set it to *$0.*",
    visual: () => (
      <Card className="w-[290px]">
        <Field label="Price / square" hint="Set 0 for a free pool">
          <TextInput readOnly value="$0" className="border-brand-500 ring-2 ring-brand-500/30" />
        </Field>
        <div className="mt-3 flex gap-2">
          <Pill className="bg-brand-500/15 text-brand-400">🏆 Bragging rights only</Pill>
        </div>
      </Card>
    ),
  },
  {
    kicker: "Any game",
    text: "Not just *football.*",
    visual: (f) => (
      <div className="flex gap-2.5">
        {["🏈", "🏀", "⚾", "🏒", "⚽"].map((e, i) => (
          <span
            key={e}
            className="grid h-12 w-12 place-items-center rounded-2xl bg-pitch-800 text-[26px] ring-1 ring-white/10"
            style={{
              transform: `scale(${spring(f - 6 - i * 3, FPS, { stiffness: 260, damping: 14 })})`,
            }}
          >
            {e}
          </span>
        ))}
      </div>
    ),
  },
  {
    kicker: "Commissioner",
    text: "Cap squares|*per player.*",
    visual: () => (
      <Card className="w-[290px]">
        <Field label="Max / player" hint="Stops one person from buying half the board">
          <TextInput readOnly value="10" className="border-brand-500 ring-2 ring-brand-500/30" />
        </Field>
      </Card>
    ),
  },
  {
    kicker: "Game time",
    text: "Winners called|*automatically.*",
    visual: (f) => (
      <div
        className="flex w-[300px] items-center justify-between rounded-xl bg-pitch-800/90 px-3 py-2.5 ring-2 ring-gold-400"
        style={{ boxShadow: `0 0 ${10 + 6 * Math.sin(f / 3)}px rgba(251,191,36,0.6)` }}
      >
        <div>
          <div className="text-sm font-semibold">
            Final <span className="text-xs text-slate-500">Jaguars 27 – 24 Titans</span>
          </div>
          <div className="text-sm font-bold text-brand-400">Jordan</div>
        </div>
        <span className="rounded-lg bg-brand-500/15 px-2.5 py-1 text-sm font-bold text-brand-400">
          🏆 Winner
        </span>
      </div>
    ),
  },
];

const END = BEATS.length * LEN + 6;

/** Rapid-fire feature rundown. */
export function Features({ frame }: CompProps) {
  const i = Math.min(BEATS.length - 1, Math.floor(frame / LEN));
  const local = frame - i * LEN;
  const beat = BEATS[i];
  const vis = spring(local - 6, FPS, { stiffness: 200, damping: 18 });
  const out = interpolate(local, [LEN - 7, LEN], [1, 0]);
  return (
    <div className="absolute inset-0">
      <Backdrop frame={frame} tint={i % 2 ? "accent" : "brand"} />
      {frame < END && (
        <>
          <div className="absolute inset-x-0 flex justify-center gap-1.5" style={{ top: 92 }}>
            {BEATS.map((_, j) => (
              <span
                key={j}
                className="h-1 rounded-full"
                style={{
                  width: j === i ? 26 : 10,
                  background: j <= i ? COLORS.brand : "rgba(255,255,255,0.15)",
                }}
              />
            ))}
          </div>
          <Kicker
            key={`k${i}`}
            frame={local}
            start={0}
            style={{ position: "absolute", top: 118, left: 0, right: 0 }}
          >
            {beat.kicker}
          </Kicker>
          <Headline
            key={`h${i}`}
            frame={local}
            start={2}
            exit={LEN - 7}
            text={beat.text}
            size={40}
            style={{ position: "absolute", top: 156, left: 0, right: 0 }}
          />
          <div
            className="absolute inset-x-0 flex justify-center"
            style={{
              top: 300,
              opacity: Math.min(vis, out),
              transform: `translateY(${(1 - vis) * 24}px)`,
            }}
          >
            {beat.visual(local)}
          </div>
        </>
      )}
      <EndCard frame={frame} start={END} line="Squares for any game.|Free to run." />
    </div>
  );
}
