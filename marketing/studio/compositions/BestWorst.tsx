import type { CompProps } from "../types";
import { Easing, interpolate, spring } from "../lib/anim";
import { Backdrop } from "../components/Backdrop";
import { StudioGrid } from "../components/StudioGrid";
import { Headline, Kicker, Rise } from "../components/Text";
import { Callout } from "../components/Effects";
import { EndCard } from "../components/Brand";
import { GAMES, HITS, SEASONS, pct } from "../lib/stats";
import { Card } from "../../../src/components/ui";
import { COLORS } from "../brand";

export const BEST_WORST_FRAMES = 480;
const FPS = 30;
const DIGITS = Array.from({ length: 10 }, (_, i) => i);
const MAX = Math.max(...HITS.flat());

/** Heat color for a square's hit rate: pitch → green → gold. */
export function heat(x: number, y: number): string {
  const t = Math.pow(HITS[x][y] / MAX, 0.6);
  const a = 0.12 + 0.88 * t;
  return t > 0.62 ? `rgba(251,191,36,${a})` : `rgba(34,197,94,${a})`;
}

const BEST = { x: 0, y: 7 };
const WORST = { x: 2, y: 2 };
const T = { fill: 18, best: 128, worst: 214, compare: 300, send: 372, end: 420 };

/** Data Reel: the best and worst squares from every NFL final since 1999. */
export function BestWorst({ frame }: CompProps) {
  const ratio = Math.round(pct(BEST.x, BEST.y) / pct(WORST.x, WORST.y));
  const spot = frame >= T.best && frame < T.compare ? (frame < T.worst ? "best" : "worst") : null;
  const dim = spot
    ? interpolate(frame, [T.best, T.best + 10], [0, 0.6])
    : frame >= T.compare
      ? 0.7
      : 0;

  const winners = new Map<string, number>();
  if (spot === "best") {
    const g = Math.min(1, (frame - T.best - 4) / 6);
    winners.set(`${BEST.y},${BEST.x}`, g).set(`${BEST.x},${BEST.y}`, g);
  }
  if (spot === "worst")
    winners.set(`${WORST.y},${WORST.x}`, Math.min(1, (frame - T.worst - 4) / 6));

  // Cells fill in a diagonal sweep.
  const fillT = (row: number, col: number) =>
    interpolate(frame, [T.fill + (row + col) * 2.2, T.fill + (row + col) * 2.2 + 8], [0, 1]);

  const gridTop = 186;
  // Stage geometry of the grid (CSS px) for callouts: Card p-3 at x=16..344.
  const cell = (row: number, col: number) => {
    const inner = 328 - 2 - 24;
    const size = (inner - 22.4 - 20) / 10;
    return {
      x: 16 + 1 + 12 + 22.4 + 2 + col * (size + 2) + size / 2,
      y: gridTop + 1 + 12 + 20 + (size + 2) + row * (size + 2) + size / 2,
    };
  };
  const bestPos = cell(BEST.y, BEST.x);
  const worstPos = cell(WORST.y, WORST.x);
  const pop = spring(frame - T.compare - 6, FPS, { stiffness: 200, damping: 14 });

  return (
    <div className="absolute inset-0">
      <Backdrop frame={frame} tint={frame >= T.worst && frame < T.compare ? "rose" : "gold"} />

      {frame < T.best && (
        <Headline
          frame={frame}
          text="You drew *2–2*?|I have bad news 💀"
          size={33}
          exit={T.best - 10}
          highlight={COLORS.rose}
          style={{ position: "absolute", top: 86, left: 0, right: 0 }}
        />
      )}
      {spot === "best" && (
        <Headline
          frame={frame}
          start={T.best}
          exit={T.worst - 8}
          text="Best square in football:|*0–7* (either way)"
          size={28}
          style={{ position: "absolute", top: 90, left: 0, right: 0 }}
        />
      )}
      {spot === "worst" && (
        <Headline
          frame={frame}
          start={T.worst}
          exit={T.compare - 8}
          text="Worst square:|*2–2* 💀"
          size={30}
          highlight={COLORS.rose}
          style={{ position: "absolute", top: 90, left: 0, right: 0 }}
        />
      )}

      <div
        className="absolute"
        style={{ left: 16, right: 16, top: gridTop, opacity: interpolate(frame, [0, 10], [0, 1]) }}
      >
        <Card className="p-3">
          <StudioGrid
            teamX="Team A last digit"
            teamY="Team B last digit"
            claims={new Map()}
            colLabels={DIGITS}
            rowLabels={DIGITS}
            locked
            winners={winners}
            dim={dim}
            fill={(row, col) => {
              const t = fillT(row, col);
              return t > 0
                ? heat(col, row).replace(
                    /,([\d.]+)\)$/,
                    (_, a) => `,${(Number(a) * t).toFixed(3)})`,
                  )
                : undefined;
            }}
            label={(row, col) => (
              <span
                className="text-[8.5px] font-bold leading-none"
                style={{ color: "#0b1120", opacity: fillT(row, col) * 0.9 }}
              >
                {pct(col, row) >= 1
                  ? pct(col, row).toFixed(1)
                  : pct(col, row).toFixed(2).replace(/^0/, "")}
              </span>
            )}
          />
        </Card>
        <Rise frame={frame} start={T.fill + 30}>
          <p className="mt-2 text-center text-[10.5px] font-semibold text-slate-400">
            % of NFL final scores landing on each square · {GAMES.toLocaleString()} games, {SEASONS}
          </p>
        </Rise>
      </div>

      {spot === "best" && (
        <Callout
          frame={frame}
          start={T.best + 10}
          x={bestPos.x + 40}
          y={bestPos.y - 34}
          text={`Cashes ${pct(BEST.x, BEST.y).toFixed(1)}% of the time`}
          color={COLORS.gold}
        />
      )}
      {spot === "worst" && (
        <Callout
          frame={frame}
          start={T.worst + 10}
          x={worstPos.x + 70}
          y={worstPos.y - 34}
          text={`Hit ${HITS[WORST.x][WORST.y]} times in ${GAMES.toLocaleString()} games`}
          color={COLORS.rose}
        />
      )}

      {frame >= T.compare && frame < T.end && (
        <div
          className="absolute inset-x-0 flex flex-col items-center"
          style={{ top: 250, zIndex: 40 }}
        >
          <div
            className="rounded-3xl px-6 py-5 text-center"
            style={{
              background: "rgba(11,17,32,0.94)",
              border: "1px solid rgba(255,255,255,0.1)",
              boxShadow: "0 30px 60px rgba(0,0,0,0.6)",
              transform: `scale(${pop})`,
            }}
          >
            <div className="font-black-display" style={{ fontSize: 26, lineHeight: 1.1 }}>
              0–7 is
            </div>
            <div
              className="font-black-display"
              style={{ fontSize: 76, lineHeight: 1, color: COLORS.gold }}
            >
              {ratio}×
            </div>
            <div className="font-black-display" style={{ fontSize: 22, lineHeight: 1.15 }}>
              more likely than 2–2
            </div>
          </div>
          {frame >= T.send && (
            <Rise frame={frame} start={T.send} style={{ marginTop: 18 }}>
              <div
                className="font-black-display rounded-2xl px-4 py-2.5 text-center"
                style={{ background: COLORS.brand, color: COLORS.pitch950, fontSize: 20 }}
              >
                Send this to whoever got 2–2 📲
              </div>
            </Rise>
          )}
        </div>
      )}

      {frame < T.best && frame > 60 && (
        <Kicker
          frame={frame}
          start={60}
          style={{ position: "absolute", top: 150, left: 0, right: 0 }}
          color={COLORS.gold}
        >
          {`Every NFL final · ${SEASONS}`}
        </Kicker>
      )}

      <EndCard frame={frame} start={T.end} line="Know your odds|before the draw." tint="gold" />
      {frame >= T.compare - 4 && frame < T.compare + 6 && (
        <div
          className="absolute inset-0"
          style={{
            background: "#fff",
            opacity: interpolate(frame, [T.compare - 4, T.compare, T.compare + 6], [0, 0.25, 0], {
              easing: Easing.out,
            }),
            zIndex: 50,
          }}
        />
      )}
    </div>
  );
}
