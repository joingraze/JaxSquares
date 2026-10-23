// u7 Soccer squares: every square is a minute. A quick decoder (43' is the
// tens-4 row and the ones-3 column; stoppage time's two rules), then the real
// board: a goal at 45+2' lands on my square 45 (soccer-live clip frame 77,
// read off the recording) and Jax cheers.

import type { CompProps } from "../types";
import { interpolate, spring } from "../lib/anim";
import { Backdrop } from "../components/Backdrop";
import { clipMoment, Cuts, Phone } from "../components/Phone";
import { Headline, Rise } from "../components/Text";
import { POSE_LOW, Panel, Sticker, poseTrack } from "../components/Layout";
import { Flash } from "../components/Effects";
import { EndCard } from "../components/Brand";
import { COLORS } from "../brand";
import type { AudioSpec } from "../audio/types";

const FPS = 30;
const SOCCER = {
  live: { at: 104, scene: "soccer-live", from: 0, speed: 1 },
  end: 336,
} as const;
const SOCCER_GOAL = clipMoment(SOCCER.live, 77);
export const SOCCER_FRAMES = SOCCER.end + 45;
/** The decoder's three lines land here. */
const LINES = [10, 38, 64];

export const SOCCER_AUDIO: AudioSpec = {
  style: "hype",
  end: SOCCER.end,
  builds: [[SOCCER.live.at + 20, SOCCER_GOAL]],
  drops: [0, SOCCER.live.at, SOCCER_GOAL],
  sfx: [
    ...LINES.map((at) => ({ at, kind: "pop" as const, gain: 0.7 })),
    { at: SOCCER.live.at - 4, kind: "whoosh", gain: 0.7 },
    { at: SOCCER_GOAL, kind: "cheer" },
    { at: SOCCER_GOAL + 1, kind: "sparkle" },
  ],
};

/** A ball rolling in under the hook. */
function Roll({ frame }: { frame: number }) {
  const x = interpolate(frame, [0, 36], [380, 300]);
  return (
    <div className="absolute" style={{ left: x - 28, top: 150, fontSize: 52, lineHeight: 1, zIndex: 31, transform: `rotate(${-frame * 8}deg)` }}>
      ⚽
    </div>
  );
}

/** One decoder line: the minute as a match shows it → the square it wins. */
function DecodeLine({ frame, at, minute, square, note }: { frame: number; at: number; minute: string; square: string; note: string }) {
  const s = spring(frame - at, FPS, { stiffness: 220, damping: 16 });
  return (
    <div
      className="flex items-center gap-3"
      style={{ opacity: Math.min(1, s * 1.4), transform: `translateX(${(1 - s) * 40}px)`, padding: "10px 0", borderTop: `1px solid ${COLORS.line}` }}
    >
      <div className="display" style={{ width: 86, fontSize: 30, textAlign: "right", color: COLORS.ink }}>
        {minute}
      </div>
      <div style={{ fontSize: 22, color: COLORS.muted }}>→</div>
      <div
        className="display"
        style={{ minWidth: 58, borderRadius: 12, padding: "4px 10px", fontSize: 28, textAlign: "center", background: COLORS.gold, color: COLORS.canvas }}
      >
        {square}
      </div>
      <div style={{ flex: 1, fontSize: 12.5, fontWeight: 700, lineHeight: 1.3, color: COLORS.muted }}>{note}</div>
    </div>
  );
}

export function SoccerSquares({ frame }: CompProps) {
  const pose = poseTrack(frame, [
    [0, POSE_LOW],
    [SOCCER.live.at - 8, { cx: 180, top: 124, scale: 0.68 }],
  ]);
  const won = frame >= SOCCER_GOAL;
  return (
    <div className="absolute inset-0">
      <Backdrop frame={frame} tint={won ? "gold" : "flare"} />
      <Phone {...pose}>
        <Cuts frame={frame} cuts={[SOCCER.live]} />
      </Phone>
      {frame < SOCCER.live.at && (
        <>
          <Headline
            frame={frame}
            landed
            text="Soccer squares:|every square is a *minute.*"
            size={33}
            exit={SOCCER.live.at - 10}
            style={{ position: "absolute", top: 70, left: 0, right: 0, zIndex: 30 }}
          />
          <Roll frame={frame} />
          <Rise frame={frame} start={4} exit={SOCCER.live.at - 10} style={{ position: "absolute", top: 222, left: 18, right: 18, zIndex: 30 }}>
            <Panel style={{ padding: "6px 16px 4px" }}>
              <DecodeLine frame={frame} at={LINES[0]} minute="43'" square="43" note="Row 4, column 3: the goal's minute wins" />
              <DecodeLine frame={frame} at={LINES[1]} minute="45+2'" square="45" note="First-half stoppage time is the 45th" />
              <DecodeLine frame={frame} at={LINES[2]} minute="90+3'" square="93" note="Second-half stoppage time runs on" />
            </Panel>
          </Rise>
        </>
      )}
      <Sticker frame={frame} start={SOCCER.live.at + 4} end={SOCCER_GOAL - 4}>
        Goal at 45+2' 👀
      </Sticker>
      <Sticker frame={frame} start={SOCCER_GOAL + 2} end={SOCCER.end - 4} tone="gold">
        That's square 45: yours 🎉
      </Sticker>
      <Flash frame={frame} at={SOCCER_GOAL} />
      <EndCard frame={frame} start={SOCCER.end} line="Soccer squares, live now.|Every goal's minute wins." />
    </div>
  );
}
