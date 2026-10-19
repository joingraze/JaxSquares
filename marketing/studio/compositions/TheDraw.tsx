import { useMemo } from "react";
import type { CompProps } from "../types";
import { interpolate } from "../lib/anim";
import { Backdrop } from "../components/Backdrop";
import { Phone } from "../components/Phone";
import { GameScreen } from "../components/Screens";
import { Headline } from "../components/Text";
import { Callout, RollingDigit, Tap } from "../components/Effects";
import { EndCard } from "../components/Brand";
import { POSE_GRID, Sticker, TopFade, cellCenter, toStage } from "../components/Layout";
import { claimSequence, claimsMap, drawNumbers, forceWinner, PLAYERS } from "../lib/mock";
import { pct } from "../lib/stats";
import { Button } from "../../../src/components/ui";
import { COLORS } from "../brand";

export const DRAW_FRAMES = 375;
const LOCK = 40;
const REVEAL = 214;
const END = 312;

/** POV: the commissioner hits Lock and the digits slot-machine onto a full board. */
export function TheDraw({ frame }: CompProps) {
  const numbers = useMemo(() => drawNumbers(21), []);
  const { claims, best, worst } = useMemo(() => {
    const claims = claimsMap(claimSequence(7));
    const best = forceWinner(claims, numbers, { x: 0, y: 7 }, PLAYERS[0]);
    const worst = forceWinner(claims, numbers, { x: 2, y: 2 }, PLAYERS[7]);
    return { claims, best, worst };
  }, [numbers]);

  const push = interpolate(frame, [0, END], [0, 1]);
  const pose = {
    ...POSE_GRID,
    scale: POSE_GRID.scale + 0.02 * push,
    top: POSE_GRID.top + 16 - 6 * push,
  };
  const locked = frame >= LOCK + 150;

  const colLabels = numbers.x.map((d, c) => (
    <RollingDigit
      key={c}
      frame={frame}
      start={LOCK + 22}
      land={LOCK + 46 + c * 7}
      value={d}
      seed={c}
    />
  ));
  const rowLabels = numbers.y.map((d, r) => (
    <RollingDigit
      key={r}
      frame={frame}
      start={LOCK + 26}
      land={LOCK + 64 + r * 7}
      value={d}
      seed={r + 4}
    />
  ));

  const winners = new Map<string, number>();
  if (frame >= REVEAL) winners.set(best, Math.min(1, (frame - REVEAL) / 6));
  if (frame >= REVEAL + 40) winners.set(worst, Math.min(1, (frame - REVEAL - 40) / 6));

  const at = (key: string) => {
    const [row, col] = key.split(",").map(Number);
    const c = cellCenter(row, col);
    return toStage(pose, c.x, c.y);
  };
  const b = at(best);
  const w = at(worst);

  return (
    <div className="absolute inset-0">
      <Backdrop frame={frame} tint="gold" />
      <Phone {...pose}>
        <GameScreen
          name="Sunday Squares 🏈"
          claimed={100}
          pricePerSquare={5}
          locked={locked}
          grid={{
            teamX: "Jaguars",
            teamY: "Titans",
            claims,
            colLabels,
            rowLabels,
            winners,
            dim: frame >= REVEAL ? 0.55 : 0,
          }}
        />
      </Phone>
      <TopFade height={150} />

      {frame < LOCK + 150 && (
        <Headline
          frame={frame}
          text="POV: the board is full|and you hit *LOCK*"
          size={30}
          exit={LOCK + 140}
          style={{ position: "absolute", top: 88, left: 0, right: 0, zIndex: 30 }}
        />
      )}
      <Sticker frame={frame} start={LOCK + 152} end={END - 4} tone="gold">
        Who got the good ones? 👀
      </Sticker>

      {frame >= LOCK - 18 && frame < LOCK + 22 && (
        <div
          className="absolute left-1/2"
          style={{
            top: 450,
            zIndex: 35,
            transform: `translateX(-50%) scale(${interpolate(frame, [LOCK - 18, LOCK - 10, LOCK + 12, LOCK + 20], [0.6, 1, 1, 0.6])})`,
            opacity: interpolate(frame, [LOCK - 18, LOCK - 12, LOCK + 12, LOCK + 20], [0, 1, 1, 0]),
          }}
        >
          <Button className="whitespace-nowrap px-5 py-3 text-[15px] shadow-2xl shadow-black/60">
            {frame < LOCK ? "🎲 Lock board & draw numbers" : "Drawing…"}
          </Button>
        </div>
      )}
      <Tap frame={frame} start={LOCK - 2} x={180} y={472} />

      <Callout
        frame={frame}
        start={REVEAL + 6}
        end={END - 4}
        x={Math.min(Math.max(b.x, 110), 250)}
        y={b.y - 30}
        text={`Maya: 0–7 🔥 (${pct(0, 7).toFixed(1)}%)`}
        color={COLORS.brandLight}
      />
      <Callout
        frame={frame}
        start={REVEAL + 46}
        end={END - 4}
        x={Math.min(Math.max(w.x, 110), 250)}
        y={w.y + 30}
        text={`Big Mike: 2–2 💀 (${pct(2, 2).toFixed(2)}%)`}
        color={COLORS.rose}
      />

      <EndCard
        frame={frame}
        start={END}
        line="Numbers drawn live.|No hat, no cups, no drama."
        tint="gold"
      />
    </div>
  );
}
