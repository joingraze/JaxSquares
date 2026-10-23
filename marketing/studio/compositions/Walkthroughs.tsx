// Reels cut from real-app clips (marketing/capture/record.mjs). Clip frame
// numbers below were read off the recordings: e.g. the draw clip's "Draw the
// numbers" tap lands on clip frame 84 and "The numbers are in!" on 195.

import type { CompProps } from "../types";
import { interpolate, spring } from "../lib/anim";
import { Backdrop } from "../components/Backdrop";
import { clipMoment, Cuts, Phone, type Cut, type PhonePose } from "../components/Phone";
import { Headline, Kicker, Rise } from "../components/Text";
import { Panel, POSE_FULL, POSE_LOW, Sticker, poseTrack } from "../components/Layout";
import { Confetti, Flash, PushBanner, Tap } from "../components/Effects";
import { EndCard } from "../components/Brand";
import { Jax } from "../../../src/components/ui";
import { COLORS } from "../brand";
import type { AudioSpec } from "../audio/types";

const FPS = 30;

/** Tap ripple at screen point (x, y) when cut `cut` reaches clip frame `clipAt`. */
function TapAt({ frame, cut, clipAt, x, y }: { frame: number; cut: Cut; clipAt: number; x: number; y: number }) {
  return <Tap frame={frame} start={clipMoment(cut, clipAt)} x={x} y={y} />;
}

/** Pushed in on the board, the top of the screen just under the caption. */
const POSE_BOARD: PhonePose = { cx: 180, top: 124, scale: 0.66 };

// ---------------------------------------------------------------------------
// 01 How it works: the payoff first (a live score lands), then pick → link → friends → draw
// ---------------------------------------------------------------------------

const HOW = {
  // Cold open on the payoff: the Q3 score lands on live clip frame 67.
  open: { at: 0, scene: "live", from: 52, speed: 1 },
  pick: { at: 50, scene: "create", from: 10, speed: 1.6 },
  // Straight from the game to "Setting up your board…" and the invite sheet: no rules or prize screens.
  invite: { at: 78, scene: "create", from: 190, speed: 1.3 },
  claim: { at: 140, scene: "claim", from: 20, speed: 1.5 },
  draw: { at: 215, scene: "draw", from: 70, speed: 1.6 },
  end: 320,
} satisfies Record<string, Cut | number>;
const HOW_HIT = clipMoment(HOW.open, 67);
const HOW_NUMBERS = clipMoment(HOW.draw, 195);

export const HOW_FRAMES = HOW.end + 45;

export const HOW_AUDIO: AudioSpec = {
  style: "hype",
  end: HOW.end,
  // The shuffle (draw clip 90) builds into "The numbers are in!" (195).
  builds: [[clipMoment(HOW.draw, 90), HOW_NUMBERS]],
  drops: [0, HOW_NUMBERS],
  sfx: [
    { at: HOW_HIT, kind: "cheer" },
    { at: HOW_HIT + 1, kind: "sparkle" },
    { at: HOW.pick.at, kind: "whoosh", gain: 0.7 },
    { at: clipMoment(HOW.pick, 27), kind: "tap" },
    { at: HOW.invite.at, kind: "whoosh", gain: 0.6 },
    { at: clipMoment(HOW.invite, 228), kind: "sparkle" },
    { at: HOW.claim.at, kind: "whoosh", gain: 0.7 },
    ...[52, 67, 82].map((c) => ({ at: clipMoment(HOW.claim, c), kind: "tap" as const })),
    { at: HOW.draw.at, kind: "whoosh", gain: 0.7 },
    { at: clipMoment(HOW.draw, 84), kind: "tap" },
    { at: HOW_NUMBERS, kind: "sparkle" },
  ],
};

export function HowItWorks({ frame }: CompProps) {
  const pose = poseTrack(frame, [
    [0, { cx: 180, top: 168, scale: 0.6 }],
    [HOW.pick.at, POSE_FULL],
    [HOW.claim.at, POSE_BOARD],
    [HOW.draw.at, POSE_FULL],
    [HOW.draw.at + 20, { cx: 180, top: 112, scale: 0.68 }],
  ]);
  return (
    <div className="absolute inset-0">
      <Backdrop frame={frame} tint={frame < HOW.pick.at ? "gold" : "volt"} />
      <Phone
        {...pose}
        overlay={
          <>
            <TapAt frame={frame} cut={HOW.pick} clipAt={27} x={200} y={573} />
            <TapAt frame={frame} cut={HOW.claim} clipAt={52} x={330} y={452} />
            <TapAt frame={frame} cut={HOW.claim} clipAt={67} x={147} y={489} />
            <TapAt frame={frame} cut={HOW.claim} clipAt={82} x={257} y={562} />
            <TapAt frame={frame} cut={HOW.draw} clipAt={84} x={220} y={841} />
          </>
        }
      >
        <Cuts frame={frame} cuts={[HOW.open, HOW.pick, HOW.invite, HOW.claim, HOW.draw]} />
      </Phone>

      {frame < HOW.pick.at && (
        <Headline
          frame={frame}
          landed
          text="Football & basketball|squares in *30 seconds.*"
          size={31}
          exit={HOW.pick.at - 8}
          style={{ position: "absolute", top: 84, left: 0, right: 0, zIndex: 30 }}
        />
      )}
      <Flash frame={frame} at={HOW_HIT} />
      <Sticker frame={frame} start={HOW.pick.at + 2} end={HOW.invite.at - 4} step={1}>
        Pick the game
      </Sticker>
      <Sticker frame={frame} start={HOW.invite.at + 2} end={HOW.claim.at - 6} step={2}>
        Text your crew one link
      </Sticker>
      <Sticker frame={frame} start={HOW.claim.at + 4} end={HOW.draw.at - 6} step={3}>
        Friends pick from any phone
      </Sticker>
      <Sticker frame={frame} start={HOW.draw.at + 4} end={HOW.end - 4} step={4} tone="gold">
        Jax draws. Scores do the rest.
      </Sticker>
      <EndCard frame={frame} start={HOW.end} />
    </div>
  );
}

// ---------------------------------------------------------------------------
// 02 Let Jax pick
// ---------------------------------------------------------------------------

const JAX_CUT: Cut = { at: 60, scene: "jax", from: 0, speed: 1 };
const JAX_STORY = 250;
const JAX_END = 318;
export const JAX_FRAMES = JAX_END + 45;

export const JAX_AUDIO: AudioSpec = {
  style: "bounce",
  end: JAX_END,
  // Jax's 5 squares land on clip frame 102; "Meet Jax" sits on a softer groove.
  drops: [0, clipMoment(JAX_CUT, 102)],
  breaks: [{ from: JAX_STORY, to: JAX_END, level: 0.4 }],
  sfx: [
    { at: 6, kind: "pop" },
    { at: JAX_CUT.at - 6, kind: "whoosh", gain: 0.7 },
    ...[37, 67, 93].map((c) => ({ at: clipMoment(JAX_CUT, c), kind: "tap" as const })),
    { at: clipMoment(JAX_CUT, 102), kind: "sparkle" },
    { at: JAX_STORY + 4, kind: "pop" },
  ],
};

export function LetJaxPick({ frame }: CompProps) {
  const pose = poseTrack(frame, [
    [0, POSE_LOW],
    [JAX_CUT.at - 6, POSE_FULL],
    // Up while the "How many squares?" sheet is open (clip 42–96), so its buttons stay in frame.
    [JAX_CUT.at + 40, { cx: 180, top: 40, scale: 0.6 }],
    [JAX_CUT.at + 100, { cx: 180, top: 120, scale: 0.63 }],
    [JAX_STORY, { cx: 180, top: 300, scale: 0.6 }],
  ]);
  const jaxIn = spring(frame + 20, FPS, { stiffness: 200, damping: 12 });
  const jaxOut = interpolate(frame, [JAX_CUT.at - 12, JAX_CUT.at], [1, 0]);
  const phoneOut = interpolate(frame, [JAX_STORY, JAX_STORY + 10], [1, 0]);
  return (
    <div className="absolute inset-0">
      <Backdrop frame={frame} tint="gold" />
      {frame < JAX_CUT.at && (
        <div
          className="absolute inset-x-0 flex justify-center"
          style={{
            top: 300,
            opacity: jaxOut,
            transform: `translateY(${(1 - jaxIn) * 80}px) scale(${0.5 + 0.5 * jaxIn})`,
          }}
        >
          <Jax pose="sit" size={190} />
        </div>
      )}
      {frame < JAX_CUT.at && (
        <Headline
          frame={frame}
          landed
          text="Can't pick a square?|*Let Jax pick.* 🐶"
          size={33}
          exit={JAX_CUT.at - 10}
          highlight={COLORS.gold}
          style={{ position: "absolute", top: 108, left: 0, right: 0 }}
        />
      )}
      <div style={{ opacity: phoneOut }}>
        <Phone
          {...pose}
          overlay={
            <>
              <TapAt frame={frame} cut={JAX_CUT} clipAt={37} x={367} y={296} />
              <TapAt frame={frame} cut={JAX_CUT} clipAt={67} x={274} y={777} />
              <TapAt frame={frame} cut={JAX_CUT} clipAt={93} x={220} y={892} />
            </>
          }
        >
          <Cuts frame={frame} cuts={[JAX_CUT]} />
        </Phone>
      </div>
      <Sticker frame={frame} start={JAX_CUT.at + 4} end={JAX_CUT.at + 52}>
        Tap “Let Jax pick”
      </Sticker>
      <Sticker frame={frame} start={JAX_CUT.at + 56} end={JAX_CUT.at + 98}>
        Choose how many
      </Sticker>
      <Sticker frame={frame} start={JAX_CUT.at + 102} end={JAX_STORY - 4} tone="gold">
        5 random squares. Done.
      </Sticker>
      {frame >= JAX_STORY && frame < JAX_END + 6 && (
        <div className="absolute inset-x-0 flex flex-col items-center" style={{ top: 150 }}>
          <Rise frame={frame} start={JAX_STORY + 4}>
            <Jax pose="face" size={120} />
          </Rise>
          <Headline
            frame={frame}
            start={JAX_STORY + 10}
            text="Meet *Jax.*"
            size={44}
            highlight={COLORS.gold}
            style={{ marginTop: 16 }}
          />
          <Rise frame={frame} start={JAX_STORY + 22} style={{ marginTop: 18, padding: "0 30px" }}>
            <Panel style={{ padding: "14px 18px", textAlign: "center" }}>
              <div style={{ fontSize: 16, fontWeight: 700, lineHeight: 1.35, color: COLORS.ink }}>
                JaxSquares is named after him.
                <br />
                He picks at random. No favorites.
              </div>
            </Panel>
          </Rise>
        </div>
      )}
      <EndCard frame={frame} start={JAX_END} line="Let Jax pick.|Squares in one tap." tint="gold" />
    </div>
  );
}

// ---------------------------------------------------------------------------
// 03 The draw
// ---------------------------------------------------------------------------

const DRAW_CUT: Cut = { at: 10, scene: "draw", from: 0, speed: 1 };
const DRAW_END = 330;
export const DRAW_FRAMES = DRAW_END + 45;

export const DRAW_AUDIO: AudioSpec = {
  style: "hype",
  end: DRAW_END,
  // Tap "Draw the numbers" (clip 84), the shuffle (90) builds into "The numbers are in!" (195).
  builds: [[clipMoment(DRAW_CUT, 90), clipMoment(DRAW_CUT, 195)]],
  drops: [0, clipMoment(DRAW_CUT, 195)],
  sfx: [
    { at: clipMoment(DRAW_CUT, 40), kind: "whoosh", gain: 0.6 },
    { at: clipMoment(DRAW_CUT, 84), kind: "tap" },
    { at: clipMoment(DRAW_CUT, 195), kind: "sparkle" },
    { at: clipMoment(DRAW_CUT, 195), kind: "cheer", gain: 0.6 },
  ],
};

export function TheDraw({ frame }: CompProps) {
  const pose = poseTrack(frame, [
    [-14, POSE_LOW],
    [-12, POSE_FULL],
    [98, { cx: 180, top: 118, scale: 0.7 }],
  ]);
  const inAt = DRAW_CUT.at + 195;
  return (
    <div className="absolute inset-0">
      <Backdrop frame={frame} tint={frame >= inAt ? "gold" : "volt"} />
      <Phone {...pose} overlay={<TapAt frame={frame} cut={DRAW_CUT} clipAt={84} x={220} y={841} />}>
        <Cuts frame={frame} cuts={[DRAW_CUT]} />
      </Phone>
      {frame < 96 && (
        <Headline
          frame={frame}
          landed
          text="POV: your squares board|is full and you hit *Draw*"
          size={28}
          exit={88}
          style={{ position: "absolute", top: 84, left: 0, right: 0, zIndex: 30 }}
        />
      )}
      <Sticker frame={frame} start={102} end={inAt - 6}>
        Jax shuffles 0–9 for each team
      </Sticker>
      <Sticker frame={frame} start={inAt + 2} end={DRAW_END - 4} tone="gold">
        Everyone sees it. Live.
      </Sticker>
      <Confetti frame={frame} start={inAt} x={180} y={250} count={70} seed={4} />
      <EndCard frame={frame} start={DRAW_END} line="Numbers drawn live.|No hat. No drama." />
    </div>
  );
}

// ---------------------------------------------------------------------------
// 06 Winners light up
// ---------------------------------------------------------------------------

const WIN = {
  live: { at: 66, scene: "live", from: 30, speed: 1 },
  home: { at: 190, scene: "home", from: 0, speed: 1.25 },
  end: 380,
} satisfies Record<string, Cut | number>;
export const WINNERS_FRAMES = WIN.end + 45;

const WIN_HIT = clipMoment(WIN.live, 67);
export const WINNERS_AUDIO: AudioSpec = {
  style: "hype",
  end: WIN.end,
  builds: [[WIN.live.at + 4, WIN_HIT]],
  drops: [0, WIN_HIT],
  sfx: [
    { at: 2, kind: "ding" },
    { at: WIN.live.at - 8, kind: "whoosh", gain: 0.7 },
    { at: WIN_HIT, kind: "cheer" },
    { at: WIN_HIT + 1, kind: "sparkle" },
    { at: WIN.home.at, kind: "whoosh", gain: 0.7 },
    // The Activity sheet opens around home clip frame 120.
    { at: clipMoment(WIN.home, 120), kind: "pop" },
  ],
};

export function WinnersLightUp({ frame }: CompProps) {
  const pose = poseTrack(frame, [
    [0, POSE_LOW],
    [WIN.live.at - 8, POSE_BOARD],
    [WIN.home.at, POSE_FULL],
  ]);
  const hit = WIN_HIT;
  return (
    <div className="absolute inset-0">
      <Backdrop frame={frame} tint="gold" />
      {frame < WIN.live.at && (
        <Headline
          frame={frame}
          landed
          text="That feeling when|*your square hits* 🎉"
          size={31}
          exit={WIN.live.at - 10}
          highlight={COLORS.gold}
          style={{ position: "absolute", top: 120, left: 0, right: 0 }}
        />
      )}
      <PushBanner
        frame={frame}
        start={-8}
        end={WIN.live.at - 8}
        top={250}
        width={318}
        title="Sunday Squares"
        body="🎉 Your square hit at the end of Q3! 🏆 Winner skips dish duty"
      />
      <Phone {...pose}>
        <Cuts frame={frame} cuts={[WIN.live, WIN.home]} />
      </Phone>
      <Sticker frame={frame} start={WIN.live.at + 2} end={hit - 2}>
        Live scores, built in
      </Sticker>
      <Sticker frame={frame} start={hit + 2} end={WIN.home.at - 6} tone="gold">
        Winners called automatically
      </Sticker>
      <Sticker frame={frame} start={WIN.home.at + 4} end={WIN.home.at + 96}>
        Every board on one screen
      </Sticker>
      <Sticker frame={frame} start={WIN.home.at + 100} end={WIN.end - 4} tone="gold">
        Every hit, in your Activity
      </Sticker>
      <Flash frame={frame} at={hit} />
      <EndCard frame={frame} start={WIN.end} line="Live scores built in.|Winners called for you." tint="gold" />
    </div>
  );
}

// ---------------------------------------------------------------------------
// 07 Feature rundown
// ---------------------------------------------------------------------------

interface Beat {
  kicker: string;
  text: string;
  cut: Omit<Cut, "at">;
  pose: PhonePose;
}

const BEATS: Beat[] = [
  {
    kicker: "Players",
    text: "No app to *download.*",
    cut: { scene: "invite", from: 58, speed: 1 },
    pose: { cx: 180, top: 150, scale: 0.6 },
  },
  {
    kicker: "Same room",
    text: "Scan the code. *You're in.*",
    cut: { scene: "invite", from: 148, speed: 0.8 },
    pose: { cx: 180, top: 110, scale: 0.72 },
  },
  {
    kicker: "Can't decide?",
    text: "Let *Jax* pick.",
    cut: { scene: "jax", from: 34, speed: 1.4 },
    pose: { cx: 180, top: 150, scale: 0.6 },
  },
  {
    kicker: "Prizes",
    text: "Prize notes, or *just for fun.*",
    cut: { scene: "create", from: 70, speed: 1 },
    pose: { cx: 180, top: 120, scale: 0.7 },
  },
  {
    kicker: "Game time",
    text: "Scores update *themselves.*",
    cut: { scene: "live", from: 40, speed: 1 },
    pose: { cx: 180, top: 120, scale: 0.68 },
  },
  {
    kicker: "Every board",
    text: "One home for *game day.*",
    cut: { scene: "home", from: 0, speed: 1 },
    pose: { cx: 180, top: 150, scale: 0.6 },
  },
];
const BEAT = 84;
const FEATURES_END = BEATS.length * BEAT;
export const FEATURES_FRAMES = FEATURES_END + 80;

export const FEATURES_AUDIO: AudioSpec = {
  style: "hype",
  end: FEATURES_END,
  drops: [BEAT],
  sfx: BEATS.slice(1).map((_, k) => ({ at: (k + 1) * BEAT, kind: "whoosh" as const, gain: 0.6 })),
};

export function Features({ frame }: CompProps) {
  const i = Math.min(BEATS.length - 1, Math.floor(frame / BEAT));
  const cuts = BEATS.map((b, k) => ({ ...b.cut, at: k * BEAT }));
  const pose = poseTrack(frame, [[0, POSE_LOW], ...BEATS.map((b, k): [number, PhonePose] => [k * BEAT, b.pose])]);
  const beatStart = i * BEAT;
  return (
    <div className="absolute inset-0">
      <Backdrop frame={frame} tint={i % 2 ? "sky" : "volt"} />
      <Phone {...pose}>
        <Cuts frame={frame} cuts={cuts} fade={6} />
      </Phone>
      {frame < FEATURES_END && (
        <div key={i} className="absolute inset-x-0" style={{ top: 78, zIndex: 30 }}>
          <Kicker frame={frame} start={beatStart + 2}>
            {BEATS[i].kicker}
          </Kicker>
          <Headline
            frame={frame}
            start={beatStart + 4}
            exit={beatStart + BEAT - 8}
            text={BEATS[i].text}
            size={27}
            style={{ marginTop: 8, padding: "0 18px" }}
          />
        </div>
      )}
      <div
        className="absolute inset-x-0 top-0"
        style={{
          height: 170,
          zIndex: 20,
          background: `linear-gradient(to bottom, ${COLORS.canvas} 55%, rgba(6,12,9,0))`,
          opacity: frame < FEATURES_END ? 1 : 0,
        }}
      />
      <EndCard frame={frame} start={FEATURES_END} line="Football & basketball squares.|Free to set up." />
    </div>
  );
}
