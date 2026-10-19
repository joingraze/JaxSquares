import { useMemo } from "react";
import type { CompProps } from "../types";
import { Easing, interpolate } from "../lib/anim";
import { Backdrop } from "../components/Backdrop";
import { Phone } from "../components/Phone";
import { GameScreen } from "../components/Screens";
import { Headline } from "../components/Text";
import { Callout, Confetti } from "../components/Effects";
import { EndCard, ScoreBug } from "../components/Brand";
import { POSE_GRID, TopFade, cellCenter, toStage } from "../components/Layout";
import { claimSequence, claimsMap, drawNumbers, forceWinner, PLAYERS } from "../lib/mock";
import { Results } from "../../../src/components/Results";
import { DEFAULT_FOOTBALL_PERIODS, type GameState } from "../../../shared/types";
import { COLORS } from "../brand";

export const WINNERS_FRAMES = 450;

const PERIODS = [
  { key: "q1", label: "Q1", x: 7, y: 3, player: PLAYERS[0], payout: 100 },
  { key: "q2", label: "HALF", x: 14, y: 10, player: PLAYERS[2], payout: 100 },
  { key: "q3", label: "Q3", x: 21, y: 13, player: PLAYERS[3], payout: 100 },
  { key: "final", label: "FINAL", x: 27, y: 24, player: PLAYERS[1], payout: 200 },
];
const START = 48;
const STEP = 64;
const SCROLL = START + STEP * 4 + 10;
const END = 380;

/** Enter the score each quarter; the board calls the winner. */
export function Winners({ frame }: CompProps) {
  const numbers = useMemo(() => drawNumbers(9), []);
  const { claims, keys, squares } = useMemo(() => {
    const claims = claimsMap(claimSequence(42));
    const keys = PERIODS.map((p) => forceWinner(claims, numbers, p, p.player));
    const squares = [...claims].map(([k, c]) => {
      const [row, col] = k.split(",").map(Number);
      return { row, col, playerName: c.name, playerColor: c.color, clientId: c.name };
    });
    return { claims, keys, squares };
  }, [numbers]);

  const idx = Math.min(3, Math.floor((frame - START) / STEP));
  const period = idx >= 0 ? PERIODS[idx] : null;
  const local = idx >= 0 ? frame - START - idx * STEP : 0;

  const winners = new Map<string, number>();
  PERIODS.forEach((_, i) => {
    const at = START + i * STEP + 14;
    if (frame >= at) winners.set(keys[i], i === idx ? Math.min(1, (frame - at) / 6) : 0.35);
  });
  const hot =
    period && local >= 8
      ? { col: numbers.x.indexOf(period.x % 10), row: numbers.y.indexOf(period.y % 10) }
      : null;

  const scroll = interpolate(frame, [SCROLL, SCROLL + 24], [0, 290], { easing: Easing.inOut });
  const pose = { ...POSE_GRID, top: POSE_GRID.top + 16 };

  const state: GameState = {
    game: {
      id: "demo",
      name: "Sunday Squares 🏈",
      sport: "football",
      teamX: "Jaguars",
      teamY: "Titans",
      pricePerSquare: 5,
      maxPerPlayer: 0,
      periods: DEFAULT_FOOTBALL_PERIODS,
      payouts: { q1: 100, q2: 100, q3: 100, final: 200 },
      xNumbers: numbers.x,
      yNumbers: numbers.y,
      status: "locked",
      createdAt: 0,
    },
    squares,
    scores: PERIODS.filter((_, i) => frame >= START + i * STEP + 14).map((p) => ({
      periodKey: p.key,
      scoreX: p.x,
      scoreY: p.y,
    })),
  };

  return (
    <div className="absolute inset-0">
      <Backdrop frame={frame} tint="gold" />
      <Phone {...pose}>
        <GameScreen
          name="Sunday Squares 🏈"
          claimed={100}
          pricePerSquare={5}
          locked
          scroll={scroll}
          grid={{
            teamX: "Jaguars",
            teamY: "Titans",
            claims,
            colLabels: numbers.x,
            rowLabels: numbers.y,
            winners,
            hotCol: hot?.col ?? null,
            hotRow: hot?.row ?? null,
            dim: period && frame < SCROLL ? 0.5 : 0,
          }}
          below={<Results state={state} />}
        />
      </Phone>
      <TopFade height={150} />

      {frame < START + 6 && (
        <Headline
          frame={frame}
          text="Who won the quarter?|*The board knows.*"
          size={31}
          exit={START - 6}
          style={{ position: "absolute", top: 88, left: 0, right: 0, zIndex: 30 }}
        />
      )}
      {period && frame < END && (
        <div className="absolute inset-x-0 flex justify-center" style={{ top: 100, zIndex: 30 }}>
          <ScoreBug
            awayName="Jaguars"
            homeName="Titans"
            away={period.x}
            home={period.y}
            period={period.label}
            flash={interpolate(local, [0, 4, 22], [0, 1, 0])}
          />
        </div>
      )}

      {PERIODS.map((p, i) => {
        const [row, col] = keys[i].split(",").map(Number);
        const c = cellCenter(row, col);
        const pos = toStage(pose, c.x, c.y - scroll);
        const at = START + i * STEP + 20;
        return (
          <Callout
            key={p.key}
            frame={frame}
            start={at}
            end={i < 3 ? at + STEP - 22 : SCROLL - 2}
            x={Math.min(Math.max(pos.x, 96), 264)}
            y={pos.y - 30}
            text={`🏆 ${p.label === "HALF" ? "Half" : p.label === "FINAL" ? "Final" : p.label} · ${p.player.name} +$${p.payout}`}
            color={COLORS.gold}
          />
        );
      })}
      <Confetti frame={frame} start={START + STEP * 3 + 18} x={180} y={330} count={110} />

      <EndCard frame={frame} start={END} line="Enter the score.|We call the winners." tint="gold" />
    </div>
  );
}
