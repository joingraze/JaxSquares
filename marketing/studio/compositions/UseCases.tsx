// Use-case Reels: who JaxSquares is for and how it feels to use, cut from the
// use-case clips (marketing/capture/record.mjs: tv-open, tv-game, hoops-*,
// join, sync-*) and the original walkthrough clips. Clip frame numbers below
// were read off the recordings, e.g. the TV's numbers land on tv-game frame 48
// and its winner card on 186.

import type { CSSProperties, ReactNode } from "react";
import type { CompProps } from "../types";
import { Easing, interpolate, spring } from "../lib/anim";
import { clipFrame, type Scene } from "../lib/clips";
import { TEAMS } from "../lib/world";
import { ASSETS } from "../lib/assets";
import { Backdrop } from "../components/Backdrop";
import { clipMoment, cutFrame, Cuts, Phone, type Cut, type PhonePose } from "../components/Phone";
import { Headline } from "../components/Text";
import { POSE_LOW, Sticker, poseTrack } from "../components/Layout";
import { Callout, Confetti, Flash, Tap } from "../components/Effects";
import { EndCard, ScoreBug } from "../components/Brand";
import { COLORS } from "../brand";
import type { AudioSpec } from "../audio/types";

const FPS = 30;

/** Tap ripple at screen point (x, y) when cut `cut` reaches clip frame `clipAt`. */
function TapAt({ frame, cut, clipAt, x, y }: { frame: number; cut: Cut; clipAt: number; x: number; y: number }) {
  return <Tap frame={frame} start={clipMoment(cut, clipAt)} x={x} y={y} />;
}

/** A running clock, like a speedrun timer: clip seconds since `start` (× `rate`), frozen at `stop`. */
function Stopwatch({
  frame,
  start,
  stop,
  rate = 1,
  size = 30,
  style,
}: {
  frame: number;
  start: number;
  stop: number;
  rate?: number;
  size?: number;
  style?: CSSProperties;
}) {
  const t = (Math.max(0, Math.min(frame, stop) - start) / FPS) * rate;
  const done = frame >= stop;
  const pop = done ? 1 + 0.12 * Math.max(0, 1 - (frame - stop) / 10) : 1;
  const sec = Math.floor(t);
  return (
    <div className="flex justify-center" style={style}>
      <span
        className="display inline-flex items-center tabular-nums"
        style={{
          gap: size * 0.3,
          padding: `${size * 0.22}px ${size * 0.55}px`,
          borderRadius: 999,
          fontSize: size,
          lineHeight: 1,
          background: done ? COLORS.gold : "rgba(17,26,21,0.92)",
          color: done ? COLORS.canvas : COLORS.ink,
          border: `1px solid ${done ? COLORS.gold : COLORS.lineStrong}`,
          boxShadow: done ? "0 0 30px rgba(255,194,51,0.45)" : "0 12px 30px rgba(0,0,0,0.5)",
          transform: `scale(${pop})`,
        }}
      >
        <span style={{ fontSize: size * 0.8 }}>⏱</span>
        {`0:${String(sec).padStart(2, "0")}.${Math.floor((t - sec) * 10)}`}
      </span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// TV mode on a wall
// ---------------------------------------------------------------------------

const TV_W = 1280;
const TV_H = 720;

/** TV clips (1280×720) cross-dissolving from cut to cut, `width` CSS px wide. */
function TvCuts({ frame, cuts, width, fade = 5 }: { frame: number; cuts: Cut[]; width: number; fade?: number }) {
  let i = 0;
  while (i + 1 < cuts.length && frame >= cuts[i + 1].at) i++;
  const cur = cuts[i];
  const prev = i > 0 ? cuts[i - 1] : null;
  const t = prev ? Math.min(1, (frame - cur.at) / fade) : 1;
  const img = (cut: Cut, opacity = 1) => (
    <img
      src={clipFrame(cut.scene, cutFrame(cut, frame))}
      alt=""
      className="absolute inset-0"
      style={{ width, height: (width * TV_H) / TV_W, maxWidth: "none", opacity }}
    />
  );
  return (
    <>
      {prev && t < 1 && img(prev)}
      {img(cur, t)}
    </>
  );
}

/** A slim wall-mounted TV: bezel, screen glow on the wall, the clip on screen. */
function WallTv({ frame, cuts, width, left, top }: { frame: number; cuts: Cut[]; width: number; left: number; top: number }) {
  const height = (width * TV_H) / TV_W;
  return (
    <div className="absolute" style={{ left, top, width: width + 10, height: height + 10 }}>
      <div
        className="absolute"
        style={{ inset: -40, borderRadius: 60, background: "radial-gradient(closest-side, rgba(120,200,255,0.20), transparent)", filter: "blur(8px)" }}
      />
      <div
        className="absolute inset-0"
        style={{ borderRadius: 6, background: "#050606", boxShadow: "0 18px 40px rgba(0,0,0,0.7), inset 0 0 0 1px rgba(255,255,255,0.08)" }}
      />
      <div className="absolute overflow-hidden" style={{ left: 5, top: 5, width, height, borderRadius: 2, background: "#000" }}>
        <TvCuts frame={frame} cuts={cuts} width={width} />
        {/* glass sheen */}
        <div className="absolute inset-0" style={{ background: "linear-gradient(115deg, rgba(255,255,255,0.07), transparent 40%)" }} />
      </div>
    </div>
  );
}

/** Warm bulbs on a sagging wire across the top of the room. */
function StringLights({ frame, y = 26, sag = 26 }: { frame: number; y?: number; sag?: number }) {
  const bulbs = 13;
  return (
    <svg className="absolute inset-x-0" style={{ top: 0 }} width={360} height={y + sag + 30} viewBox={`0 0 360 ${y + sag + 30}`}>
      <path d={`M -10 ${y} Q 180 ${y + sag * 2} 370 ${y}`} stroke="#1b130c" strokeWidth={1.5} fill="none" />
      {Array.from({ length: bulbs }, (_, i) => {
        const t = (i + 0.5) / bulbs;
        const x = -10 + t * 380;
        const by = y + 2 * sag * t * (1 - t) * 2 + 5;
        const flicker = 0.82 + 0.18 * Math.sin(frame * 0.21 + i * 1.7);
        return (
          <g key={i} opacity={flicker}>
            <circle cx={x} cy={by} r={13} fill="rgba(255,190,90,0.20)" />
            <circle cx={x} cy={by} r={3.6} fill="#ffd98a" />
          </g>
        );
      })}
    </svg>
  );
}

/** Heads and shoulders against the TV light; arms go up for a winner from `cheer`. */
function Crowd({ frame, cheer, top = 452 }: { frame: number; cheer: number; top?: number }) {
  const people = [
    { x: 44, s: 1.05, d: 0 },
    { x: 128, s: 0.92, d: 4 },
    { x: 222, s: 1.0, d: 2 },
    { x: 312, s: 1.1, d: 6 },
  ];
  return (
    <div className="absolute inset-x-0" style={{ top, height: 640 - top, zIndex: 6 }}>
      {people.map((p, i) => {
        const up = spring(frame - cheer - p.d, FPS, { stiffness: 220, damping: 11 });
        const settle = interpolate(frame, [cheer + 70, cheer + 95], [1, 0.35]);
        const lift = frame >= cheer ? up * settle : 0;
        const bob = Math.sin(frame / 11 + i * 1.9) * 1.6;
        const jump = lift * -12 * Math.abs(Math.sin((frame - cheer) / 4 + i));
        const arm = (side: 1 | -1) => (
          <div
            className="absolute"
            style={{
              left: 60 * p.s + side * 44 * p.s - 8 * p.s,
              top: 80 * p.s,
              width: 16 * p.s,
              height: 100 * p.s,
              borderRadius: 10,
              background: "#070504",
              boxShadow: "0 0 10px rgba(140,200,255,0.22)",
              transformOrigin: "50% 8%",
              // Hanging down at 0, up and out at 1.
              transform: `rotate(${180 + side * (25 + 155 * (1 - lift))}deg)`,
              opacity: lift > 0.02 ? 1 : 0,
            }}
          />
        );
        return (
          <div key={i} className="absolute" style={{ left: p.x - 60 * p.s, top: 30 * (1.1 - p.s) * 4, transform: `translateY(${bob + jump}px)` }}>
            {arm(-1)}
            {arm(1)}
            <div
              className="absolute rounded-full"
              style={{
                left: 60 * p.s - 30 * p.s,
                top: 0,
                width: 60 * p.s,
                height: 68 * p.s,
                background: "#070504",
                boxShadow: "0 -3px 10px rgba(140,200,255,0.18)",
              }}
            />
            <div
              className="absolute"
              style={{
                left: 0,
                top: 64 * p.s,
                width: 120 * p.s,
                height: 140,
                borderRadius: `${46 * p.s}px ${46 * p.s}px 0 0`,
                background: "#070504",
                boxShadow: "0 -4px 14px rgba(140,200,255,0.14)",
              }}
            />
          </div>
        );
      })}
    </div>
  );
}

/** A bar at night: brick, bulbs, a long counter. Children draw on the wall. */
function BarRoom({ frame, children }: { frame: number; children?: ReactNode }) {
  return (
    <div className="absolute inset-0" style={{ background: "#0c0806" }}>
      <div
        className="absolute inset-0"
        style={{
          background: [
            "radial-gradient(300px 220px at 50% 40%, rgba(255,170,80,0.10), transparent 70%)",
            "radial-gradient(200px 160px at 8% 60%, rgba(255,140,60,0.10), transparent 70%)",
            "radial-gradient(200px 160px at 92% 60%, rgba(255,140,60,0.10), transparent 70%)",
          ].join(", "),
        }}
      />
      {/* brick courses */}
      <div
        className="absolute inset-x-0"
        style={{
          top: 0,
          height: 430,
          opacity: 0.5,
          backgroundImage:
            "linear-gradient(rgba(0,0,0,0.55) 1.5px, transparent 1.5px), linear-gradient(90deg, rgba(0,0,0,0.45) 1.5px, transparent 1.5px)",
          backgroundSize: "36px 16px, 36px 32px",
          maskImage: "linear-gradient(to bottom, transparent, black 30%, black 80%, transparent)",
          WebkitMaskImage: "linear-gradient(to bottom, transparent, black 30%, black 80%, transparent)",
        }}
      />
      <StringLights frame={frame} />
      {children}
      {/* the counter */}
      <div
        className="absolute inset-x-0"
        style={{ top: 420, height: 60, background: "linear-gradient(#2c1c11, #1a100a)", boxShadow: "inset 0 2px 0 rgba(255,210,150,0.25)" }}
      />
      <div className="absolute inset-x-0" style={{ top: 480, bottom: 0, background: "linear-gradient(#120b07, #070403)" }} />
    </div>
  );
}

// ---------------------------------------------------------------------------
// u1 Speedrun: a board made and shared, on the clock
// ---------------------------------------------------------------------------

const RUN: Cut = { at: 54, scene: "create", from: 0, speed: 1.6 };
/** Clip frame of the tap on "Text your crew" (the create clip ends on the invite sheet). */
const RUN_SEND = 300;
const RUN_STOP = clipMoment(RUN, RUN_SEND);
const RUN_END = RUN_STOP + 102;
export const RUN_FRAMES = RUN_END + 45;

const RUN_STEPS: { at: number; to: number; text: string }[] = [
  { at: RUN.at, to: clipMoment(RUN, 54), text: "Pick the game" },
  { at: clipMoment(RUN, 56), to: clipMoment(RUN, 82), text: "How squares win" },
  { at: clipMoment(RUN, 84), to: clipMoment(RUN, 122), text: "Prizes, or just for fun" },
  { at: clipMoment(RUN, 126), to: clipMoment(RUN, 156), text: "Name it" },
  { at: clipMoment(RUN, 160), to: clipMoment(RUN, 226), text: "Create" },
];

const RUN_TAPS = [
  { clip: 27, x: 200, y: 573 },
  { clip: 54, x: 220, y: 893 },
  { clip: 80, x: 290, y: 893 },
  { clip: 92, x: 359, y: 289 },
  { clip: 122, x: 290, y: 893 },
  { clip: 156, x: 290, y: 893 },
  { clip: 188, x: 281, y: 853 },
  { clip: RUN_SEND, x: 234, y: 893 },
];

const RUN_REPLIES = [
  { from: "Maya", text: "I'm in 🙋", color: "#ff4f9a", at: RUN_STOP + 34 },
  { from: "Dre", text: "grabbed 3 already", color: "#38b6ff", at: RUN_STOP + 50 },
];

export const RUN_AUDIO: AudioSpec = {
  style: "hype",
  end: RUN_END,
  drops: [0, RUN.at, RUN_STOP],
  sfx: [
    ...RUN_TAPS.map((t) => ({ at: clipMoment(RUN, t.clip), kind: "tap" as const })),
    ...RUN_STEPS.slice(1).map((s) => ({ at: s.at, kind: "tick" as const, gain: 0.8 })),
    { at: clipMoment(RUN, 228), kind: "sparkle" },
    { at: RUN_STOP + 4, kind: "whoosh", gain: 0.7 },
    { at: RUN_STOP + 16, kind: "pop" },
    ...RUN_REPLIES.map((r) => ({ at: r.at, kind: "ding" as const, gain: 0.7 })),
  ],
};

export function Speedrun({ frame }: CompProps) {
  const sent = frame >= RUN_STOP;
  const pose = poseTrack(frame, [
    [-16, POSE_LOW],
    [-14, { cx: 180, top: 176, scale: 0.6 }],
    [RUN_STOP + 6, { cx: 180, top: 372, scale: 0.6 }],
  ]);
  const card = spring(frame - RUN_STOP - 10, FPS, { stiffness: 170, damping: 19 });
  return (
    <div className="absolute inset-0">
      <Backdrop frame={frame} tint={sent ? "gold" : "volt"} />
      <Phone
        {...pose}
        overlay={RUN_TAPS.map((t) => (
          <TapAt key={t.clip} frame={frame} cut={RUN} clipAt={t.clip} x={t.x} y={t.y} />
        ))}
      >
        <Cuts frame={frame} cuts={[RUN]} />
      </Phone>

      {frame < RUN.at && (
        <Headline
          frame={frame}
          landed
          text="Make a squares board|in *10 seconds*"
          size={31}
          exit={RUN.at - 8}
          style={{ position: "absolute", top: 84, left: 0, right: 0, zIndex: 30 }}
        />
      )}
      {frame >= RUN.at - 2 && (
        <Stopwatch
          frame={frame}
          start={RUN.at}
          stop={RUN_STOP}
          rate={RUN.speed}
          size={sent ? 34 : 26}
          style={{
            position: "absolute",
            top: 84,
            left: 0,
            right: 0,
            zIndex: 35,
            opacity: spring(frame - RUN.at + 2, FPS, { stiffness: 220, damping: 18 }),
          }}
        />
      )}
      {RUN_STEPS.map((s, i) => (
        <Sticker key={s.text} frame={frame} start={s.at} end={s.to} step={i + 1} top={130} size={18}>
          {s.text}
        </Sticker>
      ))}
      <Sticker frame={frame} start={clipMoment(RUN, 228)} end={RUN_STOP - 4} top={130} size={18} tone="volt">
        Board's live ✓ Now send it
      </Sticker>

      {sent && (
        <Headline
          frame={frame}
          start={RUN_STOP + 4}
          text="Board's live.|*Link's sent.*"
          size={30}
          style={{ position: "absolute", top: 136, left: 0, right: 0, zIndex: 30 }}
        />
      )}
      {sent && (
        <div
          className="absolute"
          style={{
            left: 34,
            right: 34,
            top: 212,
            zIndex: 30,
            padding: "10px 12px 12px",
            borderRadius: 24,
            background: "#0b0d0c",
            border: `1px solid ${COLORS.line}`,
            boxShadow: "0 30px 60px rgba(0,0,0,0.6)",
            opacity: card,
            transform: `translateY(${(1 - card) * 60}px)`,
          }}
        >
          <div className="text-center" style={{ fontSize: 11, fontWeight: 700, color: COLORS.muted }}>
            🏈 Sunday Crew <span style={{ fontWeight: 500, color: COLORS.subtle }}>· 9 people</span>
          </div>
          <div className="flex flex-col" style={{ gap: 6, marginTop: 8 }}>
            <div className="flex justify-end">
              <div style={{ maxWidth: "84%", borderRadius: 16, background: "#0a84ff", padding: "6px 11px", fontSize: 12.5, lineHeight: 1.3 }}>
                Grab a square on my Hawks vs Wolves board 🏈
              </div>
            </div>
            {RUN_REPLIES.map((r) => {
              const s = spring(frame - r.at, FPS, { stiffness: 300, damping: 20 });
              return (
                <div key={r.from} style={{ opacity: s, transform: `scale(${0.6 + 0.4 * s})`, transformOrigin: "bottom left" }}>
                  <div style={{ margin: "0 0 1px 9px", fontSize: 9.5, fontWeight: 700, color: r.color }}>{r.from}</div>
                  <span className="inline-block" style={{ borderRadius: 16, background: "#262827", padding: "5px 11px", fontSize: 12.5 }}>
                    {r.text}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}
      <EndCard frame={frame} start={RUN_END} line="Your board, live in seconds.|Football or basketball." />
    </div>
  );
}

// ---------------------------------------------------------------------------
// u2 The bar: squares on the TV, the room scans in
// ---------------------------------------------------------------------------

const BAR = {
  open: { at: 0, scene: "tv-open", from: 40, speed: 1 },
  // The full board, then the host draws: the numbers land on clip frame 48.
  draw: { at: 228, scene: "tv-game", from: 30, speed: 1 },
  // Q1 ends: the winner card fills the TV from clip frame 186.
  score: { at: 300, scene: "tv-game", from: 176, speed: 1 },
  end: 450,
} satisfies Record<string, Cut | number>;
const BAR_NUMBERS = clipMoment(BAR.draw, 48);
const BAR_WIN = clipMoment(BAR.score, 186);
export const BAR_FRAMES = 530;

/** A guest's phone: the camera finds the TV's QR code, then the join clip. */
const SCAN = { at: 70, tap: 104 };
const BAR_JOIN: Cut = { at: 112, scene: "join", from: 40, speed: 1.25 };
const BAR_JOINED = clipMoment(BAR_JOIN, 140);
const BAR_PHONE_OUT = 214;

export const BAR_AUDIO: AudioSpec = {
  style: "hype",
  end: BAR.end,
  intro: 0.7,
  builds: [[BAR.draw.at - 12, BAR_NUMBERS]],
  drops: [BAR_NUMBERS, BAR_WIN],
  sfx: [
    { at: 2, kind: "whoosh", gain: 0.6 },
    { at: SCAN.at, kind: "whoosh", gain: 0.6 },
    { at: SCAN.tap - 8, kind: "ding", gain: 0.6 },
    { at: SCAN.tap, kind: "tap" },
    { at: clipMoment(BAR_JOIN, 52), kind: "tap" },
    { at: clipMoment(BAR_JOIN, 122), kind: "tap" },
    { at: BAR_JOINED, kind: "sparkle" },
    { at: BAR.draw.at, kind: "whoosh", gain: 0.7 },
    { at: BAR_NUMBERS, kind: "sparkle" },
    { at: BAR_WIN, kind: "cheer" },
    { at: BAR_WIN + 1, kind: "sparkle" },
  ],
};

/** The QR scan on a guest's phone (screen pts): the TV's code in the viewfinder and the link pill. */
function Viewfinder({ frame }: { frame: number }) {
  // The QR card sits at x 835–1138, y 209–512 of a TV frame: centre it, 250 pts wide.
  const s = 250 / 303;
  const found = spring(frame - SCAN.at - 14, FPS, { stiffness: 240, damping: 18 });
  const drift = Math.sin(frame / 9) * 3;
  return (
    <div className="absolute inset-0 overflow-hidden" style={{ background: "#000" }}>
      <img
        src={clipFrame("tv-open", 40 + frame)}
        alt=""
        className="absolute"
        style={{
          width: TV_W * s,
          height: TV_H * s,
          maxWidth: "none",
          left: 220 - 987 * s + drift,
          top: 400 - 360 * s + drift * 0.6,
          filter: "blur(0.6px) brightness(0.92) contrast(1.05)",
          transform: "rotate(-3deg)",
        }}
      />
      <div className="absolute inset-0" style={{ background: "radial-gradient(closest-side, transparent 55%, rgba(0,0,0,0.55))" }} />
      {/* the camera's QR brackets */}
      {[
        [-1, -1],
        [1, -1],
        [-1, 1],
        [1, 1],
      ].map(([sx, sy]) => (
        <div
          key={`${sx}${sy}`}
          className="absolute"
          style={{
            left: 220 + sx * 140 - (sx < 0 ? 0 : 34),
            top: 400 + sy * 140 - (sy < 0 ? 0 : 34),
            width: 34,
            height: 34,
            borderColor: "#ffd60a",
            borderStyle: "solid",
            borderWidth: `${sy < 0 ? 5 : 0}px ${sx > 0 ? 5 : 0}px ${sy > 0 ? 5 : 0}px ${sx < 0 ? 5 : 0}px`,
            borderRadius: 8,
            opacity: found,
            transform: `scale(${1.3 - 0.3 * found})`,
          }}
        />
      ))}
      <div className="absolute inset-x-0 flex justify-center" style={{ top: 580 }}>
        <span
          className="inline-flex items-center"
          style={{
            gap: 8,
            padding: "10px 18px",
            borderRadius: 999,
            background: "#ffd60a",
            color: "#111",
            fontSize: 20,
            fontWeight: 700,
            opacity: found,
            transform: `scale(${0.7 + 0.3 * found})`,
          }}
        >
          <img src={ASSETS.icon} alt="" style={{ width: 26, height: 26, borderRadius: 7 }} />
          jaxsquares.com
        </span>
      </div>
      <div className="absolute inset-x-0 flex justify-center" style={{ bottom: 70 }}>
        <span style={{ width: 74, height: 74, borderRadius: 999, border: "5px solid #fff", display: "grid", placeItems: "center" }}>
          <span style={{ width: 58, height: 58, borderRadius: 999, background: "#fff" }} />
        </span>
      </div>
    </div>
  );
}

export function BarBigScreen({ frame }: CompProps) {
  // Wide on the room, then in on the TV for the draw and the winner.
  const push = spring(frame - BAR.draw.at + 12, FPS, { stiffness: 90, damping: 20 });
  const cam = (1 + 0.03 * Math.min(1, frame / 200)) * (1 + 0.32 * push);
  const phoneIn = spring(frame - SCAN.at, FPS, { stiffness: 130, damping: 18 });
  const phoneOut = spring(frame - BAR_PHONE_OUT, FPS, { stiffness: 130, damping: 20 });
  const phoneY = 300 + (1 - phoneIn) * 360 + phoneOut * 380;
  const tvCuts = [BAR.open, BAR.draw, BAR.score];
  return (
    <div className="absolute inset-0 overflow-hidden">
      <div className="absolute inset-0" style={{ transform: `scale(${cam})`, transformOrigin: "180px 262px" }}>
        <BarRoom frame={frame}>
          <WallTv frame={frame} cuts={tvCuts} width={250} left={55} top={192} />
        </BarRoom>
        <Confetti frame={frame} start={BAR_WIN} x={180} y={300} count={110} seed={11} />
      </div>
      {/* The room in front of the camera: it stays put while the shot pushes in on the TV. */}
      <Crowd frame={frame} cheer={BAR_WIN} top={470} />
      <Flash frame={frame} at={BAR_WIN} />

      {frame >= SCAN.at - 2 && frame < BAR_PHONE_OUT + 24 && (
        <Phone
          cx={258}
          top={phoneY}
          scale={0.44}
          rotate={6}
          style={{ zIndex: 20 }}
          overlay={
            <>
              <Tap frame={frame} start={SCAN.tap} x={220} y={600} />
              <TapAt frame={frame} cut={BAR_JOIN} clipAt={52} x={147} y={528} />
              <TapAt frame={frame} cut={BAR_JOIN} clipAt={122} x={220} y={805} />
            </>
          }
        >
          {frame < BAR_JOIN.at ? <Viewfinder frame={frame} /> : <Cuts frame={frame} cuts={[BAR_JOIN]} />}
        </Phone>
      )}

      {frame < SCAN.at && (
        <Headline
          frame={frame}
          text="Game night at the bar?|Put the squares *on the TV.*"
          size={27}
          exit={SCAN.at - 8}
          style={{ position: "absolute", top: 84, left: 0, right: 0, zIndex: 30 }}
        />
      )}
      <Sticker frame={frame} start={SCAN.at + 4} end={BAR_JOINED - 6} step={1}>
        Scan the code. No app.
      </Sticker>
      <Sticker frame={frame} start={BAR_JOINED - 2} end={BAR.draw.at - 6} step={2}>
        The board fills up live
      </Sticker>
      <Sticker frame={frame} start={BAR.draw.at + 4} end={BAR.score.at - 6} step={3}>
        Numbers drawn on the TV
      </Sticker>
      <Sticker frame={frame} start={BAR_WIN + 4} end={BAR.end - 4} tone="gold">
        Every winner, up on the TV 🎉
      </Sticker>
      <EndCard frame={frame} start={BAR.end} line="Squares on the big screen.|Bars, parties, game rooms." />
    </div>
  );
}

// ---------------------------------------------------------------------------
// u3 Basketball squares
// ---------------------------------------------------------------------------

const HOOPS = {
  create: { at: 50, scene: "hoops-create", from: 0, speed: 1.4 },
  // Q3 ends on my square on hoops-live clip frame 60.
  live: { at: 246, scene: "hoops-live", from: 20, speed: 1 },
  end: 400,
} satisfies Record<string, Cut | number>;
const HOOPS_WIN = clipMoment(HOOPS.live, 60);
export const HOOPS_FRAMES = HOOPS.end + 45;

const HOOPS_TAPS = [
  { clip: 28, x: 300, y: 255 },
  { clip: 62, x: 200, y: 573 },
  { clip: 84, x: 220, y: 893 },
  { clip: 104, x: 290, y: 893 },
  { clip: 140, x: 359, y: 289 },
  { clip: 162, x: 290, y: 893 },
  { clip: 192, x: 290, y: 893 },
  { clip: 228, x: 281, y: 853 },
];

export const HOOPS_AUDIO: AudioSpec = {
  style: "hype",
  end: HOOPS.end,
  builds: [[HOOPS.live.at + 10, HOOPS_WIN]],
  drops: [0, HOOPS.create.at, HOOPS_WIN],
  sfx: [
    ...[6, 16, 24].map((at) => ({ at, kind: "pop" as const, gain: 0.6 })),
    ...HOOPS_TAPS.map((t) => ({ at: clipMoment(HOOPS.create, t.clip), kind: "tap" as const })),
    { at: clipMoment(HOOPS.create, 240), kind: "sparkle" },
    { at: HOOPS.live.at, kind: "whoosh", gain: 0.7 },
    { at: HOOPS_WIN, kind: "cheer" },
    { at: HOOPS_WIN + 1, kind: "sparkle" },
  ],
};

/** A basketball bouncing in from the right on the hook. */
function Bounce({ frame }: { frame: number }) {
  const t = frame / FPS;
  const x = interpolate(frame, [0, 40], [330, 250], { easing: Easing.out });
  const y = 400 - Math.abs(Math.sin(t * Math.PI * 2.2)) * 120 * Math.exp(-t * 0.9);
  return (
    <div className="absolute" style={{ left: x - 34, top: y - 34, fontSize: 64, lineHeight: 1, zIndex: 31, transform: `rotate(${frame * 9}deg)` }}>
      🏀
    </div>
  );
}

export function HoopsSquares({ frame }: CompProps) {
  const pose = poseTrack(frame, [
    [0, POSE_LOW],
    [HOOPS.create.at - 6, { cx: 180, top: 150, scale: 0.6 }],
    [HOOPS.live.at, { cx: 180, top: 124, scale: 0.68 }],
  ]);
  const live = frame >= HOOPS.live.at;
  return (
    <div className="absolute inset-0">
      <Backdrop frame={frame} tint={frame >= HOOPS_WIN ? "gold" : "flare"} />
      <Phone
        {...pose}
        overlay={HOOPS_TAPS.map((t) => (
          <TapAt key={t.clip} frame={frame} cut={HOOPS.create} clipAt={t.clip} x={t.x} y={t.y} />
        ))}
      >
        <Cuts frame={frame} cuts={[HOOPS.create, HOOPS.live]} />
      </Phone>
      {frame < HOOPS.create.at + 4 && (
        <>
          <Headline
            frame={frame}
            landed
            text="Squares aren't just|for *football.*"
            size={36}
            exit={HOOPS.create.at - 8}
            style={{ position: "absolute", top: 84, left: 0, right: 0, zIndex: 30 }}
          />
          <Bounce frame={frame} />
        </>
      )}
      <Sticker frame={frame} start={HOOPS.create.at + 4} end={clipMoment(HOOPS.create, 70)} step={1}>
        Tap Basketball 🏀
      </Sticker>
      <Sticker frame={frame} start={clipMoment(HOOPS.create, 74)} end={clipMoment(HOOPS.create, 236)} step={2}>
        Tonight's game, five taps
      </Sticker>
      <Sticker frame={frame} start={clipMoment(HOOPS.create, 240)} end={HOOPS.live.at - 6} tone="volt">
        Board's live ✓
      </Sticker>
      {live && (
        <Sticker frame={frame} start={HOOPS.live.at + 4} end={HOOPS_WIN - 4}>
          Live scores, every quarter
        </Sticker>
      )}
      <Sticker frame={frame} start={HOOPS_WIN + 2} end={HOOPS.end - 4} tone="gold">
        Q3 ends on your square 🎉
      </Sticker>
      <Flash frame={frame} at={HOOPS_WIN} />
      <EndCard frame={frame} start={HOOPS.end} line="Basketball squares, live now.|Pro, college or any matchup." />
    </div>
  );
}

// ---------------------------------------------------------------------------
// u4 One score, every phone
// ---------------------------------------------------------------------------

const SYNC_AT = 60;
/** The Q3 score lands on all three phones around clip frame 65. */
const SYNC_LAND = SYNC_AT + 65;
const SYNC_END = SYNC_LAND + 145;
export const SYNC_FRAMES = SYNC_END + 45;

const SYNC_PHONES: { scene: Scene; pose: PhonePose & { rotate: number }; who: string; z: number; delay: number }[] = [
  { scene: "sync-left", pose: { cx: 88, top: 214, scale: 0.36, rotate: -7 }, who: "Dre · host", z: 1, delay: 4 },
  { scene: "sync-right", pose: { cx: 272, top: 214, scale: 0.36, rotate: 7 }, who: "Jordan", z: 1, delay: 8 },
  { scene: "sync-center", pose: { cx: 180, top: 186, scale: 0.42, rotate: 0 }, who: "Maya", z: 2, delay: 0 },
];

export const SYNC_AUDIO: AudioSpec = {
  style: "hype",
  end: SYNC_END,
  builds: [[SYNC_AT + 12, SYNC_LAND]],
  drops: [0, SYNC_AT, SYNC_LAND],
  sfx: [
    { at: 2, kind: "whoosh", gain: 0.6 },
    ...SYNC_PHONES.map((p) => ({ at: SYNC_AT + 6 + p.delay, kind: "pop" as const, gain: 0.6 })),
    { at: SYNC_LAND, kind: "cheer" },
    { at: SYNC_LAND + 1, kind: "sparkle" },
    { at: SYNC_LAND + 6, kind: "ding", gain: 0.6 },
    { at: SYNC_LAND + 9, kind: "ding", gain: 0.5 },
  ],
};

export function EveryPhone({ frame }: CompProps) {
  const landed = frame >= SYNC_LAND;
  const bug = spring(frame - SYNC_AT - 10, FPS, { stiffness: 200, damping: 20 });
  const bugFlash = landed ? Math.max(0, 1 - (frame - SYNC_LAND) / 24) : 0;
  return (
    <div className="absolute inset-0">
      <Backdrop frame={frame} tint={landed ? "gold" : "sky"} />
      {SYNC_PHONES.map((p) => {
        const s = spring(frame + 16 - p.delay, FPS, { stiffness: 120, damping: 18 });
        return (
          <div key={p.scene} className="absolute inset-0" style={{ zIndex: p.z }}>
            <Phone cx={p.pose.cx} top={p.pose.top + (1 - s) * 520} scale={p.pose.scale} rotate={p.pose.rotate}>
              <Cuts frame={frame} cuts={[{ at: SYNC_AT, scene: p.scene, from: 0 }]} />
            </Phone>
          </div>
        );
      })}
      {/* Whose phone is whose, above all three (the side ones sit out past the middle phone). */}
      {SYNC_PHONES.map((p) => {
        const label = spring(frame - SYNC_AT - 6 - p.delay, FPS, { stiffness: 240, damping: 18 });
        const out = p.pose.rotate * 4;
        return (
          <div key={p.who} className="absolute inset-0" style={{ zIndex: 5 }}>
            <div
              className="absolute flex justify-center"
              style={{ left: p.pose.cx - 70 + out, width: 140, top: p.pose.top - 24, opacity: label, transform: `translateY(${(1 - label) * 8}px)` }}
            >
              <span
                className="rounded-full"
                style={{
                  padding: "3px 10px",
                  fontSize: 11.5,
                  fontWeight: 800,
                  background: p.scene === "sync-center" && landed ? COLORS.gold : "rgba(17,26,21,0.92)",
                  color: p.scene === "sync-center" && landed ? COLORS.canvas : COLORS.ink,
                  border: `1px solid ${COLORS.lineStrong}`,
                }}
              >
                {p.who}
              </span>
            </div>
          </div>
        );
      })}
      {frame < SYNC_AT + 4 && (
        <Headline
          frame={frame}
          landed
          text="Squares: one score,|*every phone.*"
          size={40}
          exit={SYNC_AT - 6}
          style={{ position: "absolute", top: 84, left: 0, right: 0, zIndex: 30 }}
        />
      )}
      {frame >= SYNC_AT && frame < SYNC_LAND + 40 && (
        <div className="absolute inset-x-0 flex justify-center" style={{ top: 92, zIndex: 30, opacity: Math.min(bug, interpolate(frame, [SYNC_LAND + 32, SYNC_LAND + 40], [1, 0])) }}>
          <ScoreBug
            teamX={TEAMS.bison}
            teamY={TEAMS.sharks}
            x={landed ? 10 : 6}
            y={13}
            period={landed ? "End of Q3" : "Q3"}
            sub={landed ? "Maya's square" : "3 phones watching"}
            flash={bugFlash}
            width={290}
          />
        </div>
      )}
      <Callout frame={frame} start={SYNC_LAND + 8} end={SYNC_LAND + 70} x={88} y={196} text="Maya wins Q3" color={COLORS.ink} />
      <Callout frame={frame} start={SYNC_LAND + 12} end={SYNC_LAND + 70} x={272} y={196} text="Maya wins Q3" color={COLORS.ink} />
      <Confetti frame={frame} start={SYNC_LAND} x={180} y={260} count={90} seed={5} />
      <Flash frame={frame} at={SYNC_LAND} />
      <Sticker frame={frame} start={SYNC_LAND + 40} end={SYNC_END - 4} tone="gold">
        No refreshing. No math.
      </Sticker>
      <EndCard frame={frame} start={SYNC_END} line="Live on every phone.|Football & basketball squares." />
    </div>
  );
}

// ---------------------------------------------------------------------------
// u5 The office board, minus the spreadsheet
// ---------------------------------------------------------------------------

const OFFICE = {
  freeze: 132,
  invite: { at: 172, scene: "invite", from: 16, speed: 1.15 },
  claim: { at: 270, scene: "claim", from: 20, speed: 1.25 },
  live: { at: 370, scene: "live", from: 40, speed: 1 },
  end: 470,
} satisfies Record<string, Cut | number>;
const OFFICE_Q3 = OFFICE.live.at + 27;
export const OFFICE_FRAMES = 550;

/** Spreadsheet cells as they get typed in: [row, col, text, trouble?]. */
const SHEET_CELLS: [number, number, string, boolean?][] = [
  [1, 2, "Dana"],
  [1, 5, "Kevin"],
  [2, 1, "Raj"],
  [2, 7, "Mo"],
  [3, 3, "Kevin?", true],
  [3, 6, "Lena"],
  [4, 2, "Dana"],
  [4, 8, "Pat"],
  [5, 4, "Raj"],
  [5, 5, "Kevin (2)", true],
  [6, 1, "???", true],
  [6, 7, "Mo"],
  [7, 3, "Lena"],
  [7, 6, "TAKEN", true],
  [8, 2, "Pat"],
  [8, 8, "who??", true],
];
const sheetAt = (i: number) => 10 + Math.round(i * 6.2);

const MAIL = [
  { at: 52, from: "Kevin", text: "RE: RE: RE: squares 🏈" },
  { at: 76, from: "Dana", text: "who has 7–3??" },
  { at: 98, from: "IT", text: "office_squares.xlsx is locked by Kevin" },
];

export const OFFICE_AUDIO: AudioSpec = {
  style: "bounce",
  end: OFFICE.end,
  intro: 0.6,
  breaks: [{ from: OFFICE.freeze, to: OFFICE.invite.at, level: 0 }],
  drops: [OFFICE.invite.at, OFFICE_Q3],
  sfx: [
    ...SHEET_CELLS.map((_, i) => ({ at: sheetAt(i), kind: "tick" as const, gain: 0.5 })),
    ...MAIL.map((m) => ({ at: m.at, kind: "ding" as const, gain: 0.7 })),
    { at: OFFICE.freeze, kind: "stop" },
    { at: OFFICE.freeze + 2, kind: "womp", gain: 0.7 },
    { at: OFFICE.freeze + 18, kind: "pop" },
    { at: OFFICE.claim.at, kind: "whoosh", gain: 0.6 },
    ...[52, 67, 82].map((c) => ({ at: clipMoment(OFFICE.claim, c), kind: "tap" as const })),
    { at: OFFICE.live.at, kind: "whoosh", gain: 0.6 },
    { at: OFFICE_Q3, kind: "cheer" },
    { at: OFFICE_Q3 + 1, kind: "sparkle" },
  ],
};

function Spreadsheet({ frame }: { frame: number }) {
  const freeze = interpolate(frame, [OFFICE.freeze, OFFICE.freeze + 6], [0, 1]);
  const shake = frame > 70 && frame < OFFICE.freeze ? Math.sin(frame * 2.3) * interpolate(frame, [70, OFFICE.freeze], [0, 2]) : 0;
  const away = spring(frame - OFFICE.invite.at + 6, FPS, { stiffness: 140, damping: 20 });
  const cols = "ABCDEFGHIJK".split("");
  const cell = 26;
  return (
    <div
      className="absolute overflow-hidden"
      style={{
        left: 16,
        right: 16,
        top: 168,
        height: 372,
        borderRadius: 14,
        background: "#f4f5f4",
        color: "#1d1f1e",
        boxShadow: "0 40px 80px rgba(0,0,0,0.55)",
        transform: `translateX(${shake}px) rotate(${shake * 0.25}deg) translateY(${away * -680}px)`,
        filter: freeze > 0 ? `grayscale(${freeze}) brightness(${1 - 0.65 * freeze})` : undefined,
      }}
    >
      <div className="flex items-center" style={{ gap: 6, height: 30, padding: "0 10px", background: "#1f7a4c", color: "#fff", fontSize: 11, fontWeight: 700 }}>
        <span style={{ width: 8, height: 8, borderRadius: 9, background: "#ff5f57" }} />
        <span style={{ width: 8, height: 8, borderRadius: 9, background: "#febc2e" }} />
        <span style={{ width: 8, height: 8, borderRadius: 9, background: "#28c840" }} />
        <span style={{ marginLeft: 8 }}>office_squares_FINAL_v7 (2).xlsx</span>
      </div>
      <div style={{ padding: "4px 6px 0 6px" }}>
        <div className="flex" style={{ marginLeft: 22 }}>
          {cols.slice(0, 11).map((c) => (
            <div key={c} className="text-center" style={{ width: cell + 4, fontSize: 9, fontWeight: 700, color: "#7a807d" }}>
              {c}
            </div>
          ))}
        </div>
        {Array.from({ length: 11 }, (_, r) => (
          <div key={r} className="flex">
            <div style={{ width: 22, fontSize: 9, fontWeight: 700, color: "#7a807d", lineHeight: `${cell + 2}px` }}>{r + 1}</div>
            {Array.from({ length: 11 }, (_, c) => {
              const i = SHEET_CELLS.findIndex(([rr, cc]) => rr === r && cc === c);
              const entry = i >= 0 && frame >= sheetAt(i) ? SHEET_CELLS[i] : null;
              const header = (r === 0 && c > 0) || (c === 0 && r > 0);
              return (
                <div
                  key={c}
                  className="overflow-hidden whitespace-nowrap"
                  style={{
                    width: cell + 4,
                    height: cell + 2,
                    border: "1px solid #d9dcda",
                    marginLeft: -1,
                    marginTop: -1,
                    fontSize: 8.5,
                    fontWeight: header ? 800 : 600,
                    lineHeight: `${cell}px`,
                    textAlign: "center",
                    background: entry?.[3] ? "#ffd9d6" : header ? "#e9ecea" : "#fff",
                    color: entry?.[3] ? "#c0271b" : "#1d1f1e",
                  }}
                >
                  {header ? "?" : (entry?.[2] ?? "")}
                </div>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}

function MailBanner({ frame, at, from, text, index }: { frame: number; at: number; from: string; text: string; index: number }) {
  if (frame < at) return null;
  const s = spring(frame - at, FPS, { stiffness: 230, damping: 19 });
  const out = interpolate(frame, [OFFICE.freeze, OFFICE.freeze + 8], [1, 0]);
  return (
    <div
      className="absolute flex items-center"
      style={{
        left: 28,
        right: 28,
        top: 182 + index * 56,
        gap: 10,
        padding: "9px 12px",
        borderRadius: 18,
        zIndex: 25,
        background: "rgba(38,46,42,0.94)",
        border: "1px solid rgba(255,255,255,0.08)",
        boxShadow: "0 16px 34px rgba(0,0,0,0.5)",
        transform: `translateY(${(1 - s) * -40}px) scale(${0.9 + 0.1 * s})`,
        opacity: s * out,
        color: "#fff",
      }}
    >
      <span className="grid place-items-center" style={{ width: 30, height: 30, borderRadius: 8, background: "#2f80ed", fontSize: 16 }}>
        ✉️
      </span>
      <span className="min-w-0">
        <span className="block" style={{ fontSize: 12, fontWeight: 700 }}>
          {from}
        </span>
        <span className="block truncate" style={{ fontSize: 12, color: "rgba(255,255,255,0.85)" }}>
          {text}
        </span>
      </span>
    </div>
  );
}

export function OfficeSquares({ frame }: CompProps) {
  const chaos = frame < OFFICE.freeze;
  const pose = poseTrack(frame, [
    [0, POSE_LOW],
    [OFFICE.invite.at, { cx: 180, top: 150, scale: 0.6 }],
    [OFFICE.claim.at, { cx: 180, top: 124, scale: 0.66 }],
    [OFFICE.live.at, { cx: 180, top: 124, scale: 0.66 }],
  ]);
  return (
    <div className="absolute inset-0">
      <Backdrop frame={frame} tint={chaos ? "flare" : frame >= OFFICE_Q3 ? "gold" : "volt"} />
      {frame < OFFICE.invite.at + 30 && <Spreadsheet frame={frame} />}
      {MAIL.map((m, i) => (
        <MailBanner key={m.at} frame={frame} index={i} {...m} />
      ))}
      {frame >= OFFICE.invite.at - 4 && (
        <Phone
          {...pose}
          overlay={[52, 67, 82].map((c, i) => (
            <TapAt key={c} frame={frame} cut={OFFICE.claim} clipAt={c} x={[330, 147, 257][i]} y={[452, 489, 562][i]} />
          ))}
        >
          <Cuts frame={frame} cuts={[OFFICE.invite, OFFICE.claim, OFFICE.live]} />
        </Phone>
      )}
      {chaos && (
        <Headline
          frame={frame}
          text="Running the office|squares *again?*"
          size={34}
          exit={OFFICE.freeze - 8}
          style={{ position: "absolute", top: 84, left: 0, right: 0, zIndex: 30 }}
        />
      )}
      {frame >= OFFICE.freeze && frame < OFFICE.invite.at && (
        <Headline
          frame={frame}
          start={OFFICE.freeze + 4}
          text="Ditch the spreadsheet.|Send *one link.*"
          size={34}
          style={{ position: "absolute", top: 270, left: 0, right: 0, zIndex: 30 }}
        />
      )}
      <Sticker frame={frame} start={OFFICE.invite.at + 6} end={OFFICE.claim.at - 6} step={1}>
        One link in the team chat
      </Sticker>
      <Sticker frame={frame} start={OFFICE.claim.at + 4} end={OFFICE.live.at - 6} step={2} size={18}>
        Everyone picks from their desk
      </Sticker>
      <Sticker frame={frame} start={OFFICE.live.at + 4} end={OFFICE.end - 4} step={3} tone="gold">
        Winners called. No reply-all.
      </Sticker>
      <Flash frame={frame} at={OFFICE_Q3} />
      <EndCard frame={frame} start={OFFICE.end} line="Office squares, sorted.|Free to set up." />
    </div>
  );
}

// ---------------------------------------------------------------------------
// u6 Join from the link: the friend's side
// ---------------------------------------------------------------------------

const JOIN: Cut = { at: 70, scene: "join", from: 30, speed: 1 };
const JOIN_LINK_TAP = 58;
/** "You're in, Sam!" lands on join clip frame 140. */
const JOIN_IN = clipMoment(JOIN, 140);
const JOIN_END = 300;
export const JOIN_FRAMES = JOIN_END + 45;
/** Keystrokes: S, a, m (join clip). */
const JOIN_KEYS = [86, 91, 96];

export const JOIN_AUDIO: AudioSpec = {
  style: "bounce",
  end: JOIN_END,
  drops: [0, JOIN.at],
  sfx: [
    { at: 22, kind: "pop", gain: 0.6 },
    { at: JOIN_LINK_TAP, kind: "tap" },
    { at: JOIN.at, kind: "whoosh", gain: 0.6 },
    { at: clipMoment(JOIN, 52), kind: "tap" },
    ...JOIN_KEYS.map((k) => ({ at: clipMoment(JOIN, k), kind: "tick" as const, gain: 0.6 })),
    { at: clipMoment(JOIN, 122), kind: "tap" },
    { at: JOIN_IN, kind: "sparkle" },
    { at: clipMoment(JOIN, 186), kind: "tap" },
    { at: clipMoment(JOIN, 214), kind: "tap" },
    { at: clipMoment(JOIN, 220), kind: "pop" },
  ],
};

/** A text thread on the friend's phone (screen pts): Maya's message and the board link. */
function Thread({ frame }: { frame: number }) {
  const msg = spring(frame + 12, FPS, { stiffness: 240, damping: 19 });
  const link = spring(frame - 22, FPS, { stiffness: 240, damping: 19 });
  const press = frame >= JOIN_LINK_TAP && frame < JOIN_LINK_TAP + 8 ? 0.97 : 1;
  return (
    <div className="absolute inset-0" style={{ background: "#000", color: "#fff" }}>
      <div className="absolute inset-x-0 flex flex-col items-center" style={{ top: 70, paddingBottom: 12, borderBottom: "1px solid #1c1c1e" }}>
        <span className="grid place-items-center rounded-full" style={{ width: 56, height: 56, background: "#ff4f9a", fontSize: 28 }}>
          🦄
        </span>
        <span style={{ marginTop: 6, fontSize: 15, fontWeight: 600 }}>Maya</span>
      </div>
      <div className="absolute inset-x-0 flex flex-col" style={{ top: 200, gap: 8, padding: "0 18px" }}>
        <div className="text-center" style={{ fontSize: 12, color: "#8e8e93" }}>
          Today 11:42 AM
        </div>
        <div style={{ opacity: msg, transform: `scale(${0.7 + 0.3 * msg})`, transformOrigin: "bottom left" }}>
          <span className="inline-block" style={{ maxWidth: 300, padding: "9px 14px", borderRadius: 20, background: "#262628", fontSize: 18, lineHeight: 1.3 }}>
            Squares for Saturday? Grab a few 🏈
          </span>
        </div>
        <div style={{ opacity: link, transform: `scale(${(0.7 + 0.3 * link) * press})`, transformOrigin: "bottom left" }}>
          <div className="overflow-hidden" style={{ width: 300, borderRadius: 20, background: "#262628" }}>
            <img src={ASSETS.og} alt="" style={{ display: "block", width: "100%" }} />
            <div style={{ padding: "9px 14px 11px" }}>
              <div style={{ fontSize: 16, fontWeight: 700, lineHeight: 1.2 }}>You're invited to play squares</div>
              <div style={{ fontSize: 13, color: "#8e8e93" }}>jaxsquares.com</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export function JoinFromLink({ frame }: CompProps) {
  const sheet = clipMoment(JOIN, 58);
  const pose = poseTrack(frame, [
    [-16, POSE_LOW],
    [-14, { cx: 180, top: 160, scale: 0.6 }],
    [sheet, { cx: 180, top: -128, scale: 0.72 }],
    [JOIN_IN - 4, { cx: 180, top: 140, scale: 0.62 }],
  ]);
  return (
    <div className="absolute inset-0">
      <Backdrop frame={frame} tint={frame >= JOIN_IN ? "gold" : "volt"} />
      <Phone
        {...pose}
        overlay={
          <>
            <Tap frame={frame} start={JOIN_LINK_TAP} x={170} y={420} />
            <TapAt frame={frame} cut={JOIN} clipAt={52} x={147} y={528} />
            <TapAt frame={frame} cut={JOIN} clipAt={122} x={220} y={805} />
            <TapAt frame={frame} cut={JOIN} clipAt={186} x={370} y={656} />
            <TapAt frame={frame} cut={JOIN} clipAt={214} x={251} y={886} />
          </>
        }
      >
        {frame < JOIN.at ? <Thread frame={frame} /> : <Cuts frame={frame} cuts={[JOIN]} />}
      </Phone>
      {frame < JOIN.at && (
        <Headline
          frame={frame}
          landed
          text="Your friend sent|a *squares link.*"
          size={36}
          exit={JOIN.at - 8}
          style={{ position: "absolute", top: 84, left: 0, right: 0, zIndex: 30 }}
        />
      )}
      {frame >= JOIN.at && (
        <Stopwatch
          frame={frame}
          start={JOIN.at}
          stop={JOIN_IN}
          size={20}
          style={{ position: "absolute", top: 84, right: 56, zIndex: 35, opacity: spring(frame - JOIN.at, FPS, { stiffness: 220, damping: 18 }) }}
        />
      )}
      <Sticker frame={frame} start={JOIN.at + 4} end={sheet - 4} step={1} top={120}>
        Tap a square
      </Sticker>
      <Sticker frame={frame} start={sheet} end={JOIN_IN - 6} step={2} top={120}>
        Type your name. That's it.
      </Sticker>
      <Sticker frame={frame} start={JOIN_IN} end={JOIN_END - 4} tone="gold" top={120}>
        No app. No account. You're in.
      </Sticker>
      <Flash frame={frame} at={JOIN_IN} strength={0.15} />
      <EndCard frame={frame} start={JOIN_END} line="No app. No signup.|Just tap the link." />
    </div>
  );
}
