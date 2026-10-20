// Reels cut from real-app clips (marketing/capture/record.mjs). Clip frame
// numbers below were read off the recordings: e.g. the draw clip's "Draw the
// numbers" tap lands on clip frame 84 and "The numbers are in!" on 195.

import type { CompProps } from "../types";
import { interpolate, spring } from "../lib/anim";
import { Backdrop } from "../components/Backdrop";
import { Cuts, Phone, type Cut, type PhonePose } from "../components/Phone";
import { Headline, Kicker, Rise } from "../components/Text";
import { Panel, POSE_FULL, POSE_LOW, Sticker, poseTrack } from "../components/Layout";
import { Confetti, Flash, PushBanner, Tap } from "../components/Effects";
import { EndCard } from "../components/Brand";
import { Jax } from "../../../src/components/ui";
import { COLORS } from "../brand";

const FPS = 30;

/** Tap ripple at screen point (x, y) when cut `cut` reaches clip frame `clipAt`. */
function TapAt({ frame, cut, clipAt, x, y }: { frame: number; cut: Cut; clipAt: number; x: number; y: number }) {
  const start = cut.at + (clipAt - (cut.from ?? 0)) / (cut.speed ?? 1);
  return <Tap frame={frame} start={Math.round(start)} x={x} y={y} />;
}

/** Pushed in on the board, the top of the screen just under the caption. */
const POSE_BOARD: PhonePose = { cx: 180, top: 124, scale: 0.66 };

// ---------------------------------------------------------------------------
// 01 How it works: create → invite → claim → draw → live
// ---------------------------------------------------------------------------

const HOW = {
  create: { at: 0, scene: "create", from: 0, speed: 1.5 },
  // Skips the board's loading skeleton (clip 222–228) straight to the invite sheet.
  invite: { at: 146, scene: "create", from: 229, speed: 1.2 },
  claim: { at: 215, scene: "claim", from: 20, speed: 1.25 },
  draw: { at: 340, scene: "draw", from: 30, speed: 1.5 },
  live: { at: 490, scene: "live", from: 40, speed: 1 },
  end: 600,
} satisfies Record<string, Cut | number>;

export const HOW_FRAMES = 690;

export function HowItWorks({ frame }: CompProps) {
  const pose = poseTrack(frame, [
    [0, POSE_LOW],
    [4, POSE_FULL],
    [HOW.claim.at, POSE_BOARD],
    [HOW.draw.at, POSE_FULL],
    [HOW.draw.at + 26, { cx: 180, top: 112, scale: 0.68 }],
    [HOW.live.at, POSE_BOARD],
  ]);
  return (
    <div className="absolute inset-0">
      <Backdrop frame={frame} tint={frame >= HOW.live.at ? "gold" : "volt"} />
      <Phone
        {...pose}
        overlay={
          <>
            <TapAt frame={frame} cut={HOW.create} clipAt={186} x={281} y={853} />
            <TapAt frame={frame} cut={HOW.claim} clipAt={52} x={330} y={452} />
            <TapAt frame={frame} cut={HOW.claim} clipAt={67} x={147} y={489} />
            <TapAt frame={frame} cut={HOW.claim} clipAt={82} x={257} y={562} />
            <TapAt frame={frame} cut={HOW.draw} clipAt={84} x={220} y={841} />
          </>
        }
      >
        <Cuts frame={frame} cuts={[HOW.create, HOW.invite, HOW.claim, HOW.draw, HOW.live]} />
      </Phone>

      {frame < 52 && (
        <Headline
          frame={frame}
          text="Squares for any game.|Set up in *30 seconds.*"
          size={31}
          exit={42}
          style={{ position: "absolute", top: 84, left: 0, right: 0, zIndex: 30 }}
        />
      )}
      <Sticker frame={frame} start={50} end={HOW.invite.at + 8} step={1}>
        Pick the game & rules
      </Sticker>
      <Sticker frame={frame} start={HOW.invite.at + 12} end={HOW.claim.at - 6} step={2}>
        Text your crew one link
      </Sticker>
      <Sticker frame={frame} start={HOW.claim.at + 4} end={HOW.draw.at - 6} step={3}>
        Friends pick from any phone
      </Sticker>
      <Sticker frame={frame} start={HOW.draw.at + 4} end={HOW.live.at - 6} step={4}>
        Jax draws the numbers
      </Sticker>
      <Sticker frame={frame} start={HOW.live.at + 4} end={HOW.end - 4} step={5} tone="gold">
        Live scores. Winners light up.
      </Sticker>
      <Flash frame={frame} at={HOW.live.at + 27} />
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
export const JAX_FRAMES = 400;

export function LetJaxPick({ frame }: CompProps) {
  const pose = poseTrack(frame, [
    [0, POSE_LOW],
    [JAX_CUT.at - 6, POSE_FULL],
    // Up while the "How many squares?" sheet is open (clip 42–96), so its buttons stay in frame.
    [JAX_CUT.at + 40, { cx: 180, top: 40, scale: 0.6 }],
    [JAX_CUT.at + 100, { cx: 180, top: 120, scale: 0.63 }],
    [JAX_STORY, { cx: 180, top: 300, scale: 0.6 }],
  ]);
  const jaxIn = spring(frame - 6, FPS, { stiffness: 200, damping: 12 });
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
export const DRAW_FRAMES = 410;

export function TheDraw({ frame }: CompProps) {
  const pose = poseTrack(frame, [
    [0, POSE_LOW],
    [2, POSE_FULL],
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
          text="POV: the board is full|and you hit *Draw*"
          size={30}
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
export const WINNERS_FRAMES = 460;

export function WinnersLightUp({ frame }: CompProps) {
  const pose = poseTrack(frame, [
    [0, POSE_LOW],
    [WIN.live.at - 8, POSE_BOARD],
    [WIN.home.at, POSE_FULL],
  ]);
  const hit = WIN.live.at + (67 - 30);
  return (
    <div className="absolute inset-0">
      <Backdrop frame={frame} tint="gold" />
      {frame < WIN.live.at && (
        <Headline
          frame={frame}
          text="That feeling when|*your square hits* 🎉"
          size={31}
          exit={WIN.live.at - 10}
          highlight={COLORS.gold}
          style={{ position: "absolute", top: 120, left: 0, right: 0 }}
        />
      )}
      <PushBanner
        frame={frame}
        start={14}
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
    cut: { scene: "create", from: 80, speed: 1 },
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
      <EndCard frame={frame} start={FEATURES_END} line="Squares for any game.|Free to set up." />
    </div>
  );
}
