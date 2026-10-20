import type { CompProps } from "../types";
import { interpolate, spring } from "../lib/anim";
import { Backdrop } from "../components/Backdrop";
import { DataBoard, cellCenter } from "../components/AppBoard";
import { Headline, Kicker, Rise } from "../components/Text";
import { Callout, Flash } from "../components/Effects";
import { EndCard } from "../components/Brand";
import { Panel } from "../components/Layout";
import { GAMES, HITS, SEASONS, pct } from "../lib/stats";
import { COLORS } from "../brand";

export const BEST_WORST_FRAMES = 500;
const FPS = 30;
const MAX = Math.max(...HITS.flat());

/** Generic axes for the data boards: no teams, just "which digit". */
export const DIGIT_TEAMS = {
  x: { name: "Team A last digit", abbr: "A", color: "#3ab7ff" },
  y: { name: "Team B last digit", abbr: "B", color: "#ff66a6" },
};

/** Heat for a square's share of finals: faint volt → volt → gold. `t` fades it in. */
export function heat(x: number, y: number, t = 1): string {
  const v = Math.pow(HITS[x][y] / MAX, 0.6);
  const a = (0.1 + 0.9 * v) * t;
  return v > 0.62 ? `rgba(255,194,51,${a.toFixed(3)})` : `rgba(198,249,31,${a.toFixed(3)})`;
}

/** "3.6", ".05": a square's share of finals, short enough for a square. */
export function pctLabel(x: number, y: number): string {
  const v = pct(x, y);
  return v >= 1 ? v.toFixed(1) : v.toFixed(2).replace(/^0/, "");
}

/** Ink that reads on a heat square. */
export function heatInk(x: number, y: number): string {
  return Math.pow(HITS[x][y] / MAX, 0.6) > 0.42 ? COLORS.canvas : COLORS.ink;
}

const BEST = { x: 0, y: 7 };
const WORST = { x: 2, y: 2 };
const T = { fill: 18, best: 128, worst: 214, compare: 300, send: 372, end: 420 };
const BOARD = { left: 16, top: 190, width: 328 };

/** Data Reel: the best and worst squares from every NFL final since 1999. */
export function BestWorst({ frame }: CompProps) {
  const ratio = Math.round(pct(BEST.x, BEST.y) / pct(WORST.x, WORST.y));
  const spot = frame >= T.best && frame < T.compare ? (frame < T.worst ? "best" : "worst") : null;
  const dim = spot ? interpolate(frame, [T.best, T.best + 10], [0, 0.6]) : frame >= T.compare ? 0.8 : 0;

  const ring = new Map<string, number>();
  if (spot === "best") {
    const g = Math.min(1, Math.max(0, (frame - T.best - 4) / 6));
    ring.set(`${BEST.y},${BEST.x}`, g).set(`${BEST.x},${BEST.y}`, g);
  }
  if (spot === "worst") ring.set(`${WORST.y},${WORST.x}`, Math.min(1, Math.max(0, (frame - T.worst - 4) / 6)));

  // Squares fill in a diagonal sweep.
  const fillT = (row: number, col: number) =>
    interpolate(frame, [T.fill + (row + col) * 2.2, T.fill + (row + col) * 2.2 + 8], [0, 1]);
  const at = (row: number, col: number) => {
    const c = cellCenter(row, col, BOARD.width);
    return { x: BOARD.left + c.x, y: BOARD.top + c.y };
  };
  const bestPos = at(BEST.y, BEST.x);
  const worstPos = at(WORST.y, WORST.x);
  const pop = spring(frame - T.compare - 6, FPS, { stiffness: 200, damping: 14 });

  return (
    <div className="absolute inset-0">
      <Backdrop frame={frame} tint={frame >= T.worst && frame < T.compare ? "flare" : "gold"} />

      {frame < T.best && (
        <Headline
          frame={frame}
          text="You drew *2–2*?|I have bad news 💀"
          size={33}
          exit={T.best - 10}
          highlight={COLORS.flare}
          style={{ position: "absolute", top: 84, left: 0, right: 0 }}
        />
      )}
      {frame < T.best && frame > 60 && (
        <Kicker frame={frame} start={60} style={{ position: "absolute", top: 156, left: 0, right: 0 }} color={COLORS.gold}>
          {`Every NFL final · ${SEASONS}`}
        </Kicker>
      )}
      {spot === "best" && (
        <Headline
          frame={frame}
          start={T.best}
          exit={T.worst - 8}
          text="Best square in football:|*0–7* (either way)"
          size={28}
          highlight={COLORS.gold}
          style={{ position: "absolute", top: 88, left: 0, right: 0 }}
        />
      )}
      {spot === "worst" && (
        <Headline
          frame={frame}
          start={T.worst}
          exit={T.compare - 8}
          text="Worst square:|*2–2* 💀"
          size={30}
          highlight={COLORS.flare}
          style={{ position: "absolute", top: 88, left: 0, right: 0 }}
        />
      )}

      <div className="absolute" style={{ left: BOARD.left, top: BOARD.top, opacity: interpolate(frame, [0, 10], [0, 1]) }}>
        <DataBoard
          width={BOARD.width}
          teamX={DIGIT_TEAMS.x}
          teamY={DIGIT_TEAMS.y}
          ring={ring}
          dim={dim}
          fill={(row, col) => {
            const t = fillT(row, col);
            return t > 0 ? heat(col, row, t) : undefined;
          }}
          label={(row, col) => (
            <span style={{ fontSize: 10.5, fontWeight: 800, color: heatInk(col, row), opacity: fillT(row, col) }}>
              {pctLabel(col, row)}
            </span>
          )}
        />
        <Rise frame={frame} start={T.fill + 30}>
          <p style={{ marginTop: 8, textAlign: "center", fontSize: 10.5, fontWeight: 600, color: COLORS.muted }}>
            % of NFL final scores landing on each square · {GAMES.toLocaleString()} games, {SEASONS}
          </p>
        </Rise>
      </div>

      {spot === "best" && (
        <Callout
          frame={frame}
          start={T.best + 10}
          x={bestPos.x + 60}
          y={bestPos.y - 30}
          text={`Hits ${pct(BEST.x, BEST.y).toFixed(1)}% of finals`}
          color={COLORS.gold}
        />
      )}
      {spot === "worst" && (
        <Callout
          frame={frame}
          start={T.worst + 10}
          x={worstPos.x + 76}
          y={worstPos.y - 30}
          text={`Hit ${HITS[WORST.x][WORST.y]} times in ${GAMES.toLocaleString()} games`}
          color={COLORS.flare}
        />
      )}

      {frame >= T.compare && frame < T.end && (
        <div className="absolute inset-x-0 flex flex-col items-center" style={{ top: 250, zIndex: 40 }}>
          <Panel style={{ padding: "20px 26px", textAlign: "center", transform: `scale(${pop})` }}>
            <div className="display" style={{ fontSize: 26, lineHeight: 1.1 }}>
              0–7 shows up
            </div>
            <div className="display" style={{ fontSize: 78, lineHeight: 1, color: COLORS.gold }}>
              {ratio}×
            </div>
            <div className="display" style={{ fontSize: 22, lineHeight: 1.15 }}>
              more often than 2–2
            </div>
          </Panel>
          {frame >= T.send && (
            <Rise frame={frame} start={T.send} style={{ marginTop: 18 }}>
              <div
                className="display"
                style={{ borderRadius: 16, padding: "10px 16px", fontSize: 20, background: COLORS.volt, color: COLORS.canvas }}
              >
                Send this to whoever got 2–2 📲
              </div>
            </Rise>
          )}
        </div>
      )}
      <Flash frame={frame} at={T.compare} strength={0.25} />
      <EndCard frame={frame} start={T.end} line="Squares are pure luck.|The board's on us." tint="gold" />
    </div>
  );
}
