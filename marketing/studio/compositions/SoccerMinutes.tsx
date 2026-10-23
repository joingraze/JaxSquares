import type { CompProps } from "../types";
import { interpolate, spring } from "../lib/anim";
import { Backdrop } from "../components/Backdrop";
import { DataBoard, cellCenter } from "../components/AppBoard";
import { Headline, Kicker, Rise } from "../components/Text";
import { Callout, Flash } from "../components/Effects";
import { EndCard } from "../components/Brand";
import { Panel } from "../components/Layout";
import { GOALS, MATCHES, NO_GOAL_MATCHES, SECOND_HALF_STOPPAGE, SQUARE_GOALS, YEARS } from "../lib/soccerStats";
import { COLORS } from "../brand";
import type { AudioSpec } from "../audio/types";

// Data Reel: which soccer square (minute) wins, from every goal of the last
// three men's world championships (openfootball, public domain). The
// tournament isn't named: like "the big game", its name is a trademark.

export const SOCCER_MINUTES_FRAMES = 505;
const FPS = 30;
const MAX = Math.max(...SQUARE_GOALS);
const AVERAGE = GOALS / 100;
const T = { fill: 16, s45: 120, row90: 214, zero: 306, every: 388, end: 460 };
const BOARD = { left: 16, top: 190, width: 328 };
const AXES = {
  x: { name: "Ones digit", abbr: "1s", color: "#3ab7ff" },
  y: { name: "Tens digit", abbr: "10s", color: "#ff66a6" },
};

export const SOCCER_MINUTES_AUDIO: AudioSpec = {
  style: "pulse",
  end: T.end,
  intro: 0.7,
  drops: [T.s45, T.every],
  builds: [[T.zero + 30, T.every]],
  sfx: [
    { at: T.fill, kind: "sparkle", gain: 0.6 },
    { at: T.s45 + 10, kind: "pop" },
    { at: T.row90 + 10, kind: "pop" },
    { at: T.zero + 10, kind: "pop" },
    { at: T.every + 4, kind: "whoosh", gain: 0.7 },
  ],
};

/** A minute's square (00-99) by its row (tens digit) and column (ones digit). */
const minuteOf = (row: number, col: number) => row * 10 + col;

/** Heat for a minute's goals: faint volt → volt → gold. `t` fades it in. */
function heat(minute: number, t = 1): string {
  const v = Math.pow(SQUARE_GOALS[minute] / MAX, 0.7);
  const a = (0.1 + 0.9 * v) * t;
  return v > 0.62 ? `rgba(255,194,51,${a.toFixed(3)})` : `rgba(198,249,31,${a.toFixed(3)})`;
}

export function SoccerMinutes({ frame }: CompProps) {
  const spot = frame >= T.s45 && frame < T.every ? (frame < T.row90 ? "45" : frame < T.zero ? "90s" : "00") : null;
  const dim = spot ? interpolate(frame, [T.s45, T.s45 + 10], [0, 0.6]) : frame >= T.every ? 0.8 : 0;
  const grow = (start: number) => Math.min(1, Math.max(0, (frame - start - 4) / 6));

  const ring = new Map<string, number>();
  if (spot === "45") ring.set("4,5", grow(T.s45));
  if (spot === "90s") for (let col = 0; col < 10; col++) ring.set(`9,${col}`, grow(T.row90 + col));
  if (spot === "00") ring.set("0,0", grow(T.zero));

  // Squares fill in a diagonal sweep.
  const fillT = (row: number, col: number) => interpolate(frame, [T.fill + (row + col) * 2.2, T.fill + (row + col) * 2.2 + 8], [0, 1]);
  const at = (row: number, col: number) => {
    const c = cellCenter(row, col, BOARD.width);
    return { x: BOARD.left + c.x, y: BOARD.top + c.y };
  };
  const p45 = at(4, 5);
  const p93 = at(9, 3);
  const p00 = at(0, 0);
  const pop = spring(frame - T.every - 6, FPS, { stiffness: 200, damping: 14 });
  const times45 = (SQUARE_GOALS[45] / AVERAGE).toFixed(1).replace(/\.0$/, "");
  const noGoalPct = Math.round((100 * NO_GOAL_MATCHES) / MATCHES);
  const footnote = interpolate(frame, [T.s45 + 24, T.s45 + 30, T.zero - 8, T.zero], [1, 0, 0, 1]);

  return (
    <div className="absolute inset-0">
      <Backdrop frame={frame} tint="gold" />

      {frame < T.s45 && (
        <Headline
          frame={frame}
          landed
          text="Soccer squares:|which *minute* wins? ⚽"
          size={32}
          exit={T.s45 - 10}
          highlight={COLORS.gold}
          style={{ position: "absolute", top: 84, left: 0, right: 0 }}
        />
      )}
      {frame < T.s45 && frame > 40 && (
        <Kicker frame={frame} start={40} style={{ position: "absolute", top: 156, left: 0, right: 0 }} color={COLORS.gold}>
          {`${GOALS} goals · ${YEARS[0]}–${YEARS[YEARS.length - 1]}`}
        </Kicker>
      )}
      {spot === "45" && (
        <Headline
          frame={frame}
          start={T.s45}
          exit={T.row90 - 8}
          text="Best square:|*45*"
          size={30}
          highlight={COLORS.gold}
          style={{ position: "absolute", top: 88, left: 0, right: 0 }}
        />
      )}
      {spot === "90s" && (
        <Headline
          frame={frame}
          start={T.row90}
          exit={T.zero - 8}
          text="Stoppage time:|the *90s* stay hot"
          size={28}
          highlight={COLORS.gold}
          style={{ position: "absolute", top: 88, left: 0, right: 0 }}
        />
      )}
      {spot === "00" && (
        <Headline
          frame={frame}
          start={T.zero}
          exit={T.every - 8}
          text="No goals?|*00* wins"
          size={30}
          highlight={COLORS.gold}
          style={{ position: "absolute", top: 88, left: 0, right: 0 }}
        />
      )}

      <div className="absolute" style={{ left: BOARD.left, top: BOARD.top, opacity: interpolate(frame, [0, 10], [0, 1]) }}>
        <DataBoard
          width={BOARD.width}
          teamX={AXES.x}
          teamY={AXES.y}
          bandX="Minute: ones digit"
          bandY="Minute: tens digit"
          ring={ring}
          dim={dim}
          fill={(row, col) => {
            const t = fillT(row, col);
            return t > 0 ? heat(minuteOf(row, col), t) : undefined;
          }}
          label={(row, col) => {
            const m = minuteOf(row, col);
            const hot = Math.pow(SQUARE_GOALS[m] / MAX, 0.7) > 0.5;
            return (
              <span style={{ fontSize: 10.5, fontWeight: 800, color: hot ? COLORS.canvas : COLORS.ink, opacity: fillT(row, col) }}>
                {String(m).padStart(2, "0")}
              </span>
            );
          }}
        />
        <Rise frame={frame} start={T.fill + 30}>
          {/* Steps aside while an explainer panel sits over it. */}
          <p style={{ marginTop: 8, textAlign: "center", fontSize: 10.5, fontWeight: 600, color: COLORS.muted, lineHeight: 1.4, opacity: footnote }}>
            {GOALS} goals by minute · men's world championship, {YEARS[0]}–{YEARS[YEARS.length - 1]}
            <br />
            Source: openfootball (public match data)
          </p>
        </Rise>
      </div>

      {spot === "45" && (
        <Callout
          frame={frame}
          start={T.s45 + 10}
          x={Math.min(p45.x + 40, 250)}
          y={p45.y - 30}
          text={`${SQUARE_GOALS[45]} goals: ${times45}× an average square`}
          color={COLORS.gold}
        />
      )}
      {spot === "45" && frame >= T.s45 + 30 && (
        <Rise frame={frame} start={T.s45 + 30} exit={T.row90 - 8} style={{ position: "absolute", top: 548, left: 22, right: 22, zIndex: 31 }}>
          <Panel style={{ padding: "12px 16px", textAlign: "center" }}>
            <div style={{ fontSize: 14, fontWeight: 600, lineHeight: 1.35, color: COLORS.ink }}>
              First-half stoppage time all counts as the 45th minute: 45+2' is square 45.
            </div>
          </Panel>
        </Rise>
      )}
      {spot === "90s" && (
        <Callout
          frame={frame}
          start={T.row90 + 10}
          x={Math.min(p93.x + 40, 250)}
          y={p93.y - 30}
          text={`${SECOND_HALF_STOPPAGE} goals after the 90th`}
          color={COLORS.gold}
        />
      )}
      {spot === "90s" && frame >= T.row90 + 30 && (
        <Rise frame={frame} start={T.row90 + 30} exit={T.zero - 8} style={{ position: "absolute", top: 548, left: 22, right: 22, zIndex: 31 }}>
          <Panel style={{ padding: "12px 16px", textAlign: "center" }}>
            <div style={{ fontSize: 14, fontWeight: 600, lineHeight: 1.35, color: COLORS.ink }}>
              Second-half stoppage time runs on: 90+3' is square 93.
            </div>
          </Panel>
        </Rise>
      )}
      {spot === "00" && (
        <Callout
          frame={frame}
          start={T.zero + 10}
          x={Math.max(p00.x + 90, 140)}
          y={p00.y + 36}
          text={`${NO_GOAL_MATCHES} of ${MATCHES} matches (${noGoalPct}%)`}
          color={COLORS.gold}
        />
      )}

      {frame >= T.every && frame < T.end && (
        <div className="absolute inset-x-0 flex flex-col items-center" style={{ top: 250, zIndex: 40 }}>
          <Panel style={{ padding: "20px 26px", textAlign: "center", transform: `scale(${pop})` }}>
            <div className="display" style={{ fontSize: 26, lineHeight: 1.1 }}>
              All 100 squares
            </div>
            <div className="display" style={{ fontSize: 26, lineHeight: 1.15, color: COLORS.gold }}>
              won at least once
            </div>
          </Panel>
          <Rise frame={frame} start={T.every + 24} style={{ marginTop: 18 }}>
            <div className="display" style={{ borderRadius: 16, padding: "10px 16px", fontSize: 19, background: COLORS.volt, color: COLORS.canvas }}>
              Send this to your soccer group chat 📲
            </div>
          </Rise>
        </div>
      )}
      <Flash frame={frame} at={T.every} strength={0.25} />
      <EndCard frame={frame} start={T.end} line="Soccer squares, live now.|Every goal's minute wins." tint="gold" />
    </div>
  );
}
