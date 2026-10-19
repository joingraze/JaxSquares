import { useMemo } from "react";
import type { CompProps } from "../types";
import { Easing, interpolate, typed } from "../lib/anim";
import { Backdrop } from "../components/Backdrop";
import { Phone } from "../components/Phone";
import { CreateScreen, GameScreen, ShareSheet, type CreateValues } from "../components/Screens";
import { Headline } from "../components/Text";
import { Callout, RollingDigit, Tap, Toast } from "../components/Effects";
import { EndCard, ScoreBug } from "../components/Brand";
import {
  POSE_FULL,
  POSE_GRID,
  Sticker,
  TopFade,
  cellCenter,
  poseAt,
  toStage,
} from "../components/Layout";
import { claimSequence, claimsMap, drawNumbers, forceWinner, PLAYERS } from "../lib/mock";
import { Button } from "../../../src/components/ui";
import { winningCell } from "../../../shared/squares";
import { COLORS } from "../brand";

const FPS = 30;
export const HERO_FRAMES = 690;

const TEAM_X = "Jaguars";
const TEAM_Y = "Titans";
const SCORES = [
  { label: "Q1", x: 7, y: 3, player: PLAYERS[0] },
  { label: "HALF", x: 14, y: 10, player: PLAYERS[2] },
];

// Timeline (frames @30fps)
const T = {
  createIn: 48,
  share: 178,
  claims: 252,
  lock: 392,
  score: 490,
  end: 620,
};

/** "How it works" walkthrough. `price` 0 renders the free-pool variant. */
export function makeHero(price: number) {
  return function Hero({ frame }: CompProps) {
    const numbers = useMemo(() => drawNumbers(9), []);
    const { claims, events, winnerKeys } = useMemo(() => {
      const events = claimSequence(42);
      const claims = claimsMap(events);
      const winnerKeys = SCORES.map((s) => forceWinner(claims, numbers, s, s.player));
      return { claims, events, winnerKeys };
    }, [numbers]);

    // ----- phone pose -----
    const rise = interpolate(frame, [6, 30], [640, POSE_FULL.top], { easing: Easing.out });
    let pose = { ...POSE_FULL, top: frame < 30 ? rise : POSE_FULL.top };
    if (frame >= T.claims) pose = poseAt(frame, T.claims, POSE_FULL, POSE_GRID);

    // ----- create form -----
    const tf = (from: number, text: string, cps = 22) =>
      typed(text, Math.max(0, frame - from), FPS, cps);
    const values: CreateValues = {
      name: tf(56, "Sunday Squares 🏈"),
      teamX: tf(88, TEAM_X),
      teamY: tf(102, TEAM_Y),
      price: tf(116, String(price)),
      maxPerPlayer: "0",
      payouts:
        price > 0
          ? [tf(136, "100"), tf(143, "100"), tf(150, "100"), tf(157, "200")]
          : ["", "", "", ""],
      focus:
        frame < 86
          ? 0
          : frame < 101
            ? 1
            : frame < 114
              ? 2
              : frame < 124
                ? 3
                : price > 0 && frame < 164
                  ? 5 + Math.min(3, Math.floor((frame - 136) / 7))
                  : undefined,
    };
    const createScroll = interpolate(frame, [124, 136], [0, 260], { easing: Easing.inOut });
    const pressed = frame >= 170 && frame < 176 ? 1 : 0;

    // ----- claims -----
    const claimT = (key: string) => {
      const e = events.find((ev) => ev.key === key);
      // Winner squares are re-assigned in claimsMap; they still appear in sequence.
      const order = e ? e.order : 0.5;
      const at = T.claims + 16 + Easing.inOut(order) * 110;
      return Math.max(0, Math.min(1.08, (frame - at) / 6));
    };
    const claimed = frame < T.claims ? 0 : events.filter((e) => claimT(e.key) > 0.5).length;

    // ----- lock & draw -----
    const locked = frame >= T.lock + 84;
    const colLabels = numbers.x.map((d, c) => (
      <RollingDigit
        key={c}
        frame={frame}
        start={T.lock + 24}
        land={T.lock + 40 + c * 4}
        value={d}
        seed={c}
      />
    ));
    const rowLabels = numbers.y.map((d, r) => (
      <RollingDigit
        key={r}
        frame={frame}
        start={T.lock + 28}
        land={T.lock + 50 + r * 4}
        value={d}
        seed={r + 5}
      />
    ));

    // ----- scoring -----
    const qIndex = frame >= T.score + 66 ? 1 : frame >= T.score + 8 ? 0 : -1;
    const score = qIndex >= 0 ? SCORES[qIndex] : null;
    const hot = score
      ? winningCell({ scoreX: score.x, scoreY: score.y }, numbers.x, numbers.y)
      : null;
    const winners = new Map<string, number>();
    SCORES.forEach((_, i) => {
      const at = T.score + 20 + i * 58;
      if (frame >= at) winners.set(winnerKeys[i], Math.min(1, (frame - at) / 6));
    });

    const sharePos = { x: 318, y: 140 };
    const groupPos = { x: 57, y: 455 };
    const showCreate = frame < T.share;

    return (
      <div className="absolute inset-0">
        <Backdrop frame={frame} />

        <Phone
          {...pose}
          overlay={
            <>
              <ShareSheet
                frame={frame}
                start={T.share + 22}
                end={T.share + 58}
                gameName="Sunday Squares 🏈"
                picked={frame >= T.share + 50}
              />
              <Tap frame={frame} start={170} x={187} y={535} />
              <Tap frame={frame} start={T.share + 14} x={sharePos.x} y={sharePos.y} />
              <Tap frame={frame} start={T.share + 48} x={groupPos.x} y={groupPos.y} />
              <Toast
                frame={frame}
                start={T.claims + 34}
                end={T.claims + 64}
                title="Maya joined Sunday Squares"
                body="Claimed 8 squares · 0-7 please 🙏"
                icon="🟦"
                top={196}
              />
              <Toast
                frame={frame}
                start={T.claims + 76}
                end={T.claims + 108}
                title="Big Mike joined Sunday Squares"
                body="Claimed 14 squares 😤"
                icon="🟨"
                top={196}
              />
            </>
          }
        >
          {showCreate ? (
            <div style={{ opacity: interpolate(frame, [T.share - 6, T.share], [1, 0]) }}>
              <CreateScreen values={values} scroll={createScroll} pressed={pressed} />
            </div>
          ) : (
            <div style={{ opacity: interpolate(frame, [T.share, T.share + 8], [0, 1]) }}>
              <GameScreen
                name="Sunday Squares 🏈"
                claimed={claimed}
                pricePerSquare={price}
                locked={locked}
                grid={{
                  teamX: TEAM_X,
                  teamY: TEAM_Y,
                  claims,
                  appear: (k) => (frame < T.claims ? 0 : claimT(k)),
                  colLabels,
                  rowLabels,
                  winners,
                  hotCol: hot && frame >= T.score + 14 ? hot.col : null,
                  hotRow: hot && frame >= T.score + 14 ? hot.row : null,
                  dim: frame >= T.score + 14 ? 0.5 : 0,
                }}
              />
            </div>
          )}
        </Phone>

        <TopFade opacity={interpolate(frame, [T.claims, T.claims + 20], [0, 1])} />

        {/* Hook */}
        {frame < 60 && (
          <Headline
            frame={frame}
            text={
              price > 0
                ? "Run a squares pool|in *20 seconds*"
                : "A free squares pool|in *20 seconds*"
            }
            size={36}
            exit={44}
            style={{ position: "absolute", top: 86, left: 0, right: 0, zIndex: 30 }}
          />
        )}

        <Sticker frame={frame} start={T.createIn + 2} end={T.share - 6} step={1}>
          Create a board
        </Sticker>
        <Sticker frame={frame} start={T.share + 4} end={T.claims - 6} step={2}>
          Share one link
        </Sticker>
        <Sticker frame={frame} start={T.claims + 4} end={T.lock - 6} step={3}>
          Friends claim from any phone
        </Sticker>
        <Sticker frame={frame} start={T.lock + 2} end={T.score - 6} step={4}>
          Lock it. Numbers draw live.
        </Sticker>
        <Sticker frame={frame} start={T.score + 2} end={T.end} step={5} tone="gold">
          Winners light up. Automatically.
        </Sticker>

        {/* Commissioner lock button */}
        {frame >= T.lock + 2 && frame < T.lock + 40 && (
          <div
            className="absolute left-1/2"
            style={{
              top: 452,
              zIndex: 35,
              transform: `translateX(-50%) scale(${interpolate(frame, [T.lock + 2, T.lock + 10, T.lock + 30, T.lock + 38], [0.6, 1, 1, 0.6])})`,
              opacity: interpolate(
                frame,
                [T.lock + 2, T.lock + 8, T.lock + 30, T.lock + 38],
                [0, 1, 1, 0],
              ),
            }}
          >
            <Button className="whitespace-nowrap px-5 py-3 text-[15px] shadow-2xl shadow-black/60">
              {frame < T.lock + 18 ? "🎲 Lock board & draw numbers" : "Drawing…"}
            </Button>
          </div>
        )}
        <Tap frame={frame} start={T.lock + 16} x={180} y={474} />

        {/* Score bug over the pills row */}
        {score && (
          <div
            className="absolute left-1/2"
            style={{ top: 156, zIndex: 30, transform: "translateX(-50%) scale(0.9)" }}
          >
            <ScoreBug
              awayName={TEAM_X}
              homeName={TEAM_Y}
              away={score.x}
              home={score.y}
              period={score.label}
              flash={interpolate(frame - (T.score + 8 + qIndex * 58), [0, 4, 20], [0, 1, 0])}
            />
          </div>
        )}

        {SCORES.map((s, i) => {
          const at = T.score + 26 + i * 58;
          const key = winnerKeys[i];
          const [row, col] = key.split(",").map(Number);
          const c = cellCenter(row, col);
          const p = toStage(pose, c.x, c.y);
          const payout = price > 0 ? 100 : 0;
          return (
            <Callout
              key={s.label}
              frame={frame}
              start={at}
              end={i === 0 ? T.score + 64 : T.end - 4}
              x={Math.min(Math.max(p.x, 92), 268)}
              y={p.y - 30}
              text={`🏆 ${s.label === "HALF" ? "Half" : s.label} · ${s.player.name}${payout ? ` +$${payout}` : " · bragging rights"}`}
              color={COLORS.gold}
            />
          );
        })}

        <EndCard
          frame={frame}
          start={T.end}
          line={
            price > 0 ? "Run your squares pool|in 20 seconds." : "Free squares pools|for any game."
          }
        />
      </div>
    );
  };
}
