import { useMemo } from "react";
import type { CompProps } from "../types";
import { Easing, interpolate, spring } from "../lib/anim";
import { Backdrop } from "../components/Backdrop";
import { StudioGrid } from "../components/StudioGrid";
import { Headline, Kicker, Rise } from "../components/Text";
import { Callout, RollingDigit } from "../components/Effects";
import { EndCard, ScoreBug } from "../components/Brand";
import { Sticker } from "../components/Layout";
import { claimSequence, claimsMap, drawNumbers } from "../lib/mock";
import { pct } from "../lib/stats";
import { Card } from "../../../src/components/ui";
import { lastDigit } from "../../../shared/squares";
import { COLORS } from "../brand";

const FPS = 30;
const DIGITS = Array.from({ length: 10 }, (_, i) => i);

// ---------------------------------------------------------------------------
// Matchup: "run a board for this game"
// ---------------------------------------------------------------------------

export interface MatchupProps {
  kicker: string;
  /** Top team (columns). */
  away: string;
  /** Side team (rows). */
  home: string;
  joiner?: "at" | "vs";
  hook: string;
  detail: string;
  endLine: string;
  seed?: number;
}

export const MATCHUP_FRAMES = 300;

export function makeMatchup(p: MatchupProps) {
  return function Matchup({ frame }: CompProps) {
    const numbers = useMemo(() => drawNumbers(p.seed ?? 3), []);
    const events = useMemo(() => claimSequence(p.seed ?? 3), []);
    const claims = useMemo(() => claimsMap(events), [events]);

    const shrink = spring(frame - 44, FPS, { stiffness: 120, damping: 20 });
    const titleTop = interpolate(shrink, [0, 1], [170, 118]);
    const titleScale = interpolate(shrink, [0, 1], [1, 0.62]);
    const gridIn = spring(frame - 52, FPS, { stiffness: 140, damping: 20 });
    const appear = (key: string) => {
      const e = events.find((ev) => ev.key === key)!;
      return Math.max(0, Math.min(1, (frame - (64 + Easing.inOut(e.order) * 70)) / 5));
    };
    const name = (t: string, color: string) => (
      <div
        className="font-black-display uppercase"
        style={{ fontSize: Math.min(52, 300 / (t.length * 0.6)), lineHeight: 0.98, color }}
      >
        {t}
      </div>
    );

    return (
      <div className="absolute inset-0">
        <Backdrop frame={frame} tint="accent" />
        <Kicker
          frame={frame}
          start={0}
          style={{ position: "absolute", top: 90, left: 0, right: 0 }}
          color={COLORS.gold}
        >
          {p.kicker}
        </Kicker>
        <div
          className="absolute inset-x-0 flex flex-col items-center text-center"
          style={{
            top: titleTop,
            transform: `scale(${titleScale})`,
            transformOrigin: "top center",
          }}
        >
          <Rise frame={frame} start={2}>
            {name(p.away, COLORS.gold)}
          </Rise>
          <Rise frame={frame} start={6}>
            <div className="my-1 text-[18px] font-extrabold uppercase tracking-[0.3em] text-slate-400">
              {p.joiner ?? "at"}
            </div>
          </Rise>
          <Rise frame={frame} start={10}>
            {name(p.home, COLORS.accent)}
          </Rise>
        </div>

        <div
          className="absolute"
          style={{
            left: 34,
            right: 34,
            top: 222,
            opacity: gridIn * interpolate(frame, [198, 208], [1, 0.35]),
            transform: `translateY(${(1 - gridIn) * 60}px)`,
          }}
        >
          <Card className="p-2.5">
            <StudioGrid
              teamX={p.away}
              teamY={p.home}
              claims={claims}
              appear={appear}
              colLabels={numbers.x.map((d, c) => (
                <RollingDigit
                  key={c}
                  frame={frame}
                  start={150}
                  land={160 + c * 3}
                  value={d}
                  seed={c}
                />
              ))}
              rowLabels={numbers.y.map((d, r) => (
                <RollingDigit
                  key={r}
                  frame={frame}
                  start={152}
                  land={166 + r * 3}
                  value={d}
                  seed={r + 3}
                />
              ))}
              locked={frame > 196}
            />
          </Card>
        </div>

        <Sticker frame={frame} start={198} end={MATCHUP_FRAMES - 52} top={340} tone="brand">
          {p.hook}
        </Sticker>
        {frame >= 206 && (
          <Rise
            frame={frame}
            start={206}
            exit={MATCHUP_FRAMES - 52}
            style={{ position: "absolute", top: 404, left: 0, right: 0, zIndex: 31 }}
          >
            <div className="text-center text-[13px] font-bold text-slate-200">
              <span className="rounded-full bg-pitch-900/90 px-3 py-1.5 ring-1 ring-white/10">
                {p.detail}
              </span>
            </div>
          </Rise>
        )}
        <EndCard frame={frame} start={MATCHUP_FRAMES - 44} line={p.endLine} tint="accent" />
      </div>
    );
  };
}

// ---------------------------------------------------------------------------
// On This Day: a historic final score, and the square it paid
// ---------------------------------------------------------------------------

export interface OnThisDayProps {
  month: string;
  day: number;
  year: number;
  fact: string;
  winner: { name: string; score: number };
  loser: { name: string; score: number };
  note: string;
  tag?: string;
}

export const OTD_FRAMES = 330;

export function makeOnThisDay(p: OnThisDayProps) {
  return function OnThisDay({ frame }: CompProps) {
    const x = lastDigit(p.winner.score);
    const y = lastDigit(p.loser.score);
    const phase = spring(frame - 118, FPS, { stiffness: 110, damping: 20 });
    const card = spring(frame - 2, FPS, { stiffness: 200, damping: 14 });
    const bugTop = interpolate(phase, [0, 1], [338, 96]);
    const gridIn = spring(frame - 132, FPS, { stiffness: 140, damping: 20 });
    const glow = frame >= 170 ? Math.min(1, (frame - 170) / 6) : 0;
    const crossT = interpolate(frame, [150, 168], [0, 1]);

    return (
      <div className="absolute inset-0">
        <Backdrop frame={frame} tint="gold" />

        {/* Phase A: date + fact */}
        <div
          className="absolute inset-x-0"
          style={{ top: 0, opacity: 1 - phase, transform: `translateY(${-phase * 40}px)` }}
        >
          <Kicker
            frame={frame}
            start={0}
            style={{ position: "absolute", top: 88, left: 0, right: 0 }}
            color={COLORS.gold}
          >
            {p.tag ?? "On this day"}
          </Kicker>
          <div className="absolute inset-x-0 flex justify-center" style={{ top: 122 }}>
            <div
              className="overflow-hidden rounded-2xl text-center"
              style={{
                width: 118,
                background: "#f8fafc",
                color: COLORS.pitch950,
                transform: `scale(${card}) rotate(${(1 - card) * -8}deg)`,
                boxShadow: "0 18px 40px rgba(0,0,0,0.5)",
              }}
            >
              <div
                className="py-1 text-[13px] font-extrabold tracking-[0.2em] text-white"
                style={{ background: COLORS.rose }}
              >
                {p.month}
              </div>
              <div className="font-black-display" style={{ fontSize: 50, lineHeight: 1.05 }}>
                {p.day}
              </div>
              <div className="pb-1.5 text-[13px] font-bold text-slate-500">{p.year}</div>
            </div>
          </div>
          <Headline
            frame={frame}
            start={14}
            text={p.fact}
            size={25}
            style={{ position: "absolute", top: 254, left: 18, right: 18 }}
            highlight={COLORS.gold}
          />
        </div>

        {/* Final score: drops in, then rides to the top */}
        {frame >= 70 && (
          <div
            className="absolute inset-x-0 flex justify-center"
            style={{ top: bugTop, zIndex: 20 }}
          >
            <div
              style={{
                transform: `scale(${spring(frame - 70, FPS, { stiffness: 240, damping: 15 })})`,
              }}
            >
              <ScoreBug
                awayName={p.winner.name}
                homeName={p.loser.name}
                away={p.winner.score}
                home={p.loser.score}
                period="Final"
                flash={interpolate(frame, [150, 156, 176], [0, 1, 0])}
              />
            </div>
          </div>
        )}

        {/* Phase B: the square it paid */}
        {frame >= 126 && (
          <div
            className="absolute"
            style={{
              // Narrow enough that row 9 clears the note card below.
              left: 70,
              right: 70,
              top: 160,
              opacity: gridIn,
              transform: `translateY(${(1 - gridIn) * 40}px)`,
            }}
          >
            <Card className="p-2.5">
              <StudioGrid
                teamX={p.winner.name}
                teamY={p.loser.name}
                claims={new Map()}
                colLabels={DIGITS}
                rowLabels={DIGITS}
                locked
                hotCol={crossT >= 1 ? x : null}
                hotRow={crossT >= 1 ? y : null}
                winners={glow > 0 ? new Map([[`${y},${x}`, glow]]) : new Map()}
                dim={glow * 0.5}
              />
            </Card>
          </div>
        )}
        {frame >= 176 && frame < OTD_FRAMES - 44 && (
          <Callout
            frame={frame}
            start={176}
            x={180}
            y={150 + 0}
            text={`The ${x}–${y} square cashed 💰`}
            color={COLORS.gold}
          />
        )}
        {frame >= 200 && (
          <Rise
            frame={frame}
            start={200}
            exit={OTD_FRAMES - 52}
            style={{ position: "absolute", top: 466, left: 24, right: 24, zIndex: 31 }}
          >
            <div className="rounded-2xl bg-pitch-900/90 px-4 py-3 text-center ring-1 ring-white/10">
              <div className="text-[13.5px] font-semibold leading-snug text-slate-200">
                {p.note}
              </div>
              <div className="mt-1 text-[11px] font-bold text-gold-400">
                {x}–{y} lands on {pct(x, y).toFixed(1)}% of NFL finals since 1999
              </div>
            </div>
          </Rise>
        )}
        <EndCard
          frame={frame}
          start={OTD_FRAMES - 44}
          line="What square would|you have had?"
          tint="gold"
        />
      </div>
    );
  };
}

// ---------------------------------------------------------------------------
// Thanksgiving slate
// ---------------------------------------------------------------------------

export const THANKSGIVING_FRAMES = 420;

const SLATE = [
  {
    day: "WED",
    time: "8:00 PM",
    game: "Packers at Rams",
    net: "Netflix",
    tag: "1st-ever Thanksgiving Eve game",
  },
  { day: "THU", time: "1:00 PM", game: "Bears at Lions", net: "CBS" },
  { day: "THU", time: "4:30 PM", game: "Eagles at Cowboys", net: "FOX" },
  { day: "THU", time: "8:20 PM", game: "Chiefs at Bills", net: "NBC" },
  { day: "FRI", time: "3:00 PM", game: "Broncos at Steelers", net: "Prime Video" },
  { day: "FRI", time: "3:30 PM", game: "Florida at Florida State", net: "ABC", college: true },
];

export function Thanksgiving({ frame }: CompProps) {
  const rowAt = (i: number) => 54 + i * 16;
  const listOut = interpolate(frame, [250, 260], [1, 0]);
  return (
    <div className="absolute inset-0">
      <Backdrop frame={frame} tint="gold" />
      <Headline
        frame={frame}
        text="6 games. 3 days.|*6 squares boards.* 🦃"
        size={31}
        exit={250}
        highlight={COLORS.gold}
        style={{ position: "absolute", top: 88, left: 0, right: 0 }}
      />
      <div
        className="absolute flex flex-col gap-2"
        style={{ left: 20, right: 20, top: 172, opacity: listOut }}
      >
        {SLATE.map((g, i) => {
          const s = spring(frame - rowAt(i), FPS, { stiffness: 220, damping: 19 });
          return (
            <div
              key={g.game}
              className="flex items-center gap-3 rounded-2xl px-3 py-2.5 ring-1"
              style={{
                background: g.college ? "rgba(56,189,248,0.10)" : "rgba(19,28,48,0.92)",
                boxShadow: "0 10px 24px rgba(0,0,0,0.35)",
                transform: `translateX(${(1 - s) * 260}px)`,
                opacity: s,
                borderColor: "rgba(255,255,255,0.08)",
              }}
            >
              <div className="w-[52px] shrink-0 text-center">
                <div
                  className="text-[11px] font-extrabold tracking-wider"
                  style={{ color: g.day === "THU" ? COLORS.gold : COLORS.accent }}
                >
                  {g.day}
                </div>
                <div className="text-[11px] font-semibold text-slate-400">{g.time}</div>
              </div>
              <div className="min-w-0 flex-1">
                <div className="truncate text-[15px] font-extrabold">{g.game}</div>
                <div className="truncate text-[11px] text-slate-400">
                  {g.net}
                  {g.tag ? ` · ${g.tag}` : g.college ? " · college rivalry bonus" : ""}
                </div>
              </div>
              <span className="shrink-0 text-lg">{g.college ? "🏟️" : "🏈"}</span>
            </div>
          );
        })}
        <div className="mt-1 text-center text-[10px] text-slate-500">All times ET</div>
      </div>

      <Sticker frame={frame} start={258} end={330} top={210} tone="light">
        Kids' table? Make it a $0 board.
      </Sticker>
      <Sticker frame={frame} start={282} end={330} top={300} tone="gold">
        Loser does the dishes. 🍽️
      </Sticker>
      {frame >= 290 && frame < 340 && (
        <div
          className="absolute inset-x-0 text-center"
          style={{
            top: 370,
            fontSize: 64,
            transform: `scale(${spring(frame - 290, FPS, { stiffness: 220, damping: 12 })})`,
          }}
        >
          🦃
        </div>
      )}
      <EndCard
        frame={frame}
        start={340}
        line="Thanksgiving squares.|One link per game."
        tint="gold"
      />
    </div>
  );
}
