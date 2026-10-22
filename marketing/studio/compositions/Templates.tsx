import { useMemo } from "react";
import type { CompProps } from "../types";
import { interpolate, spring } from "../lib/anim";
import { Backdrop } from "../components/Backdrop";
import { AppBoard, cellCenter } from "../components/AppBoard";
import { Headline, Kicker, Rise } from "../components/Text";
import { Callout, Flash, rollingDigit } from "../components/Effects";
import { EndCard, ScoreBug } from "../components/Brand";
import { Panel, Sticker } from "../components/Layout";
import { boardOf, digitsOf, type Team } from "../lib/world";
import { pct } from "../lib/stats";
import { lastDigit } from "../../../shared/squares";
import { COLORS } from "../brand";
import type { AudioSpec } from "../audio/types";

const FPS = 30;
const DIGITS = Array.from({ length: 10 }, (_, i) => i);

/**
 * Real teams appear by name only, to say which game a board is for: no logos,
 * no team colors. The board's two neutral axis colors stand in.
 */
export function namedTeam(name: string, side: "x" | "y", abbr?: string): Team {
  return { name, abbr: abbr ?? name.slice(0, 3).toUpperCase(), color: side === "x" ? COLORS.sky : COLORS.flare };
}

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

export const MATCHUP_AUDIO: AudioSpec = {
  style: "hype",
  end: MATCHUP_FRAMES - 44,
  intro: 0.75,
  // The draw rolls from 150; every digit lands with a tick; the hook sticker drops at 198.
  builds: [[150, 198]],
  drops: [198],
  sfx: [
    { at: 2, kind: "impact", gain: 0.55 },
    { at: 46, kind: "whoosh", gain: 0.6 },
    ...Array.from({ length: 10 }, (_, i) => [160 + i * 3, 166 + i * 3])
      .flat()
      .map((at) => ({ at, kind: "tick" as const, gain: 0.7 })),
    { at: 206, kind: "pop", gain: 0.7 },
  ],
};

export function makeMatchup(p: MatchupProps) {
  return function Matchup({ frame }: CompProps) {
    const seed = p.seed ?? 3;
    const teams = useMemo(() => ({ x: namedTeam(p.away, "x"), y: namedTeam(p.home, "y") }), []);
    const all = useMemo(() => [...boardOf(seed)], [seed]);
    const digits = useMemo(() => ({ x: digitsOf(seed * 7), y: digitsOf(seed * 13) }), [seed]);

    const shrink = spring(frame - 44, FPS, { stiffness: 120, damping: 20 });
    const titleTop = interpolate(shrink, [0, 1], [176, 116]);
    const titleScale = interpolate(shrink, [0, 1], [1, 0.6]);
    const gridIn = spring(frame - 52, FPS, { stiffness: 140, damping: 20 });
    const claimed = Math.round(100 * interpolate(frame, [64, 140], [0, 1]));
    const owners = new Map(all.slice(0, claimed));
    const axis =
      frame >= 150
        ? {
            x: DIGITS.map((i) => rollingDigit(frame, 150, 160 + i * 3, digits.x[i], i)),
            y: DIGITS.map((i) => rollingDigit(frame, 152, 166 + i * 3, digits.y[i], i + 3)),
          }
        : null;
    const name = (t: string, color: string) => (
      <div className="display uppercase" style={{ fontSize: Math.min(54, 310 / (t.length * 0.62)), lineHeight: 0.98, color }}>
        {t}
      </div>
    );

    return (
      <div className="absolute inset-0">
        <Backdrop frame={frame} tint="sky" />
        <Kicker frame={frame} start={0} style={{ position: "absolute", top: 88, left: 0, right: 0 }} color={COLORS.gold}>
          {p.kicker}
        </Kicker>
        <div
          className="absolute inset-x-0 flex flex-col items-center text-center"
          style={{ top: titleTop, transform: `scale(${titleScale})`, transformOrigin: "top center" }}
        >
          <Rise frame={frame} start={2}>
            {name(p.away, COLORS.sky)}
          </Rise>
          <Rise frame={frame} start={6}>
            <div style={{ margin: "4px 0", fontSize: 18, fontWeight: 800, letterSpacing: "0.3em", textTransform: "uppercase", color: COLORS.subtle }}>
              {p.joiner ?? "at"}
            </div>
          </Rise>
          <Rise frame={frame} start={10}>
            {name(p.home, COLORS.flare)}
          </Rise>
        </div>

        <div
          className="absolute"
          style={{
            left: 28,
            top: 226,
            opacity: gridIn * interpolate(frame, [198, 208], [1, 0.4]),
            transform: `translateY(${(1 - gridIn) * 60}px)`,
          }}
        >
          <AppBoard width={304} teamX={teams.x} teamY={teams.y} owners={owners} axis={axis} open={frame < 150} />
        </div>

        <Sticker frame={frame} start={198} end={MATCHUP_FRAMES - 52} top={330} tone="volt">
          {p.hook}
        </Sticker>
        {frame >= 206 && (
          <Rise
            frame={frame}
            start={206}
            exit={MATCHUP_FRAMES - 52}
            style={{ position: "absolute", top: 396, left: 0, right: 0, zIndex: 31 }}
          >
            <div className="text-center">
              <span
                className="rounded-full"
                style={{ padding: "6px 12px", fontSize: 13, fontWeight: 700, background: "rgba(12,20,16,0.92)", border: `1px solid ${COLORS.lineStrong}` }}
              >
                {p.detail}
              </span>
            </div>
          </Rise>
        )}
        <EndCard frame={frame} start={MATCHUP_FRAMES - 44} line={p.endLine} tint="sky" />
      </div>
    );
  };
}

// ---------------------------------------------------------------------------
// On This Day: a historic final score, and the square it landed on
// ---------------------------------------------------------------------------

export interface OnThisDayProps {
  month: string;
  day: number;
  year: number;
  fact: string;
  winner: { name: string; score: number; abbr?: string };
  loser: { name: string; score: number; abbr?: string };
  note: string;
  tag?: string;
}

export const OTD_FRAMES = 330;

export const OTD_AUDIO: AudioSpec = {
  style: "retro",
  end: OTD_FRAMES - 44,
  // Date card, the final score slams in (70), the board (118), the crosshair (150), the square lights (172).
  drops: [172],
  sfx: [
    { at: 2, kind: "pop" },
    { at: 70, kind: "impact", gain: 0.45 },
    { at: 118, kind: "whoosh", gain: 0.6 },
    { at: 150, kind: "tick" },
    { at: 172, kind: "sparkle" },
    { at: 178, kind: "pop", gain: 0.7 },
    { at: 200, kind: "pop", gain: 0.5 },
  ],
};
const OTD_BOARD = { left: 52, top: 168, width: 256 };

export function makeOnThisDay(p: OnThisDayProps) {
  return function OnThisDay({ frame }: CompProps) {
    const x = lastDigit(p.winner.score);
    const y = lastDigit(p.loser.score);
    const teams = useMemo(
      () => ({ x: namedTeam(p.winner.name, "x", p.winner.abbr), y: namedTeam(p.loser.name, "y", p.loser.abbr) }),
      [],
    );
    const owners = useMemo(() => boardOf(p.day * 31 + p.year), []);
    const phase = spring(frame - 118, FPS, { stiffness: 110, damping: 20 });
    const card = spring(frame - 2, FPS, { stiffness: 200, damping: 14 });
    const bugTop = interpolate(phase, [0, 1], [340, 92]);
    const gridIn = spring(frame - 132, FPS, { stiffness: 140, damping: 20 });
    const key = `${y},${x}`;
    const lit = frame >= 172;
    const c = cellCenter(y, x, OTD_BOARD.width);

    return (
      <div className="absolute inset-0">
        <Backdrop frame={frame} tint="gold" />

        {/* Phase A: date + fact */}
        <div className="absolute inset-x-0" style={{ top: 0, opacity: 1 - phase, transform: `translateY(${-phase * 40}px)` }}>
          <Kicker frame={frame} start={0} style={{ position: "absolute", top: 86, left: 0, right: 0 }} color={COLORS.gold}>
            {p.tag ?? "On this day"}
          </Kicker>
          <div className="absolute inset-x-0 flex justify-center" style={{ top: 120 }}>
            <div
              className="overflow-hidden text-center"
              style={{
                width: 120,
                borderRadius: 22,
                background: COLORS.surface3,
                border: `1px solid ${COLORS.lineStrong}`,
                transform: `scale(${card}) rotate(${(1 - card) * -8}deg)`,
                boxShadow: "0 18px 40px rgba(0,0,0,0.5)",
              }}
            >
              <div style={{ padding: "4px 0", fontSize: 13, fontWeight: 800, letterSpacing: "0.2em", background: COLORS.gold, color: COLORS.canvas }}>
                {p.month}
              </div>
              <div className="display" style={{ fontSize: 52, lineHeight: 1.05 }}>
                {p.day}
              </div>
              <div style={{ paddingBottom: 6, fontSize: 13, fontWeight: 700, color: COLORS.muted }}>{p.year}</div>
            </div>
          </div>
          <Headline
            frame={frame}
            start={14}
            text={p.fact}
            size={25}
            highlight={COLORS.gold}
            style={{ position: "absolute", top: 256, left: 18, right: 18 }}
          />
        </div>

        {/* Final score: drops in, then rides to the top */}
        {frame >= 70 && (
          <div className="absolute inset-x-0 flex justify-center" style={{ top: bugTop, zIndex: 20 }}>
            <div style={{ transform: `scale(${spring(frame - 70, FPS, { stiffness: 240, damping: 15 })})` }}>
              <ScoreBug
                teamX={teams.x}
                teamY={teams.y}
                x={p.winner.score}
                y={p.loser.score}
                period="Final"
                flash={interpolate(frame, [150, 156, 176], [0, 1, 0])}
              />
            </div>
          </div>
        )}

        {/* Phase B: the square it landed on */}
        {frame >= 126 && (
          <div
            className="absolute"
            style={{
              left: OTD_BOARD.left,
              top: OTD_BOARD.top,
              opacity: gridIn,
              transform: `translateY(${(1 - gridIn) * 40}px)`,
            }}
          >
            <AppBoard
              width={OTD_BOARD.width}
              teamX={teams.x}
              teamY={teams.y}
              owners={owners}
              axis={{ x: DIGITS.map(String), y: DIGITS.map(String) }}
              live={frame >= 150 && !lit ? key : null}
              wins={lit ? new Map([[key, ["Final"]]]) : undefined}
              final={lit}
            />
          </div>
        )}
        <Flash frame={frame} at={172} strength={0.18} />
        {frame >= 178 && frame < OTD_FRAMES - 44 && (
          <Callout
            frame={frame}
            start={178}
            x={Math.min(Math.max(OTD_BOARD.left + c.x, 110), 250)}
            y={OTD_BOARD.top + c.y - 30}
            text={`The ${x}–${y} square took it 🏆`}
            color={COLORS.gold}
          />
        )}
        {frame >= 200 && (
          <Rise frame={frame} start={200} exit={OTD_FRAMES - 52} style={{ position: "absolute", top: 446, left: 22, right: 22, zIndex: 31 }}>
            <Panel style={{ padding: "12px 16px", textAlign: "center" }}>
              <div style={{ fontSize: 13.5, fontWeight: 600, lineHeight: 1.35, color: COLORS.ink }}>{p.note}</div>
              <div style={{ marginTop: 4, fontSize: 11, fontWeight: 700, color: COLORS.gold }}>
                {x}–{y} lands on {pct(x, y).toFixed(1)}% of NFL finals since 1999
              </div>
            </Panel>
          </Rise>
        )}
        <EndCard frame={frame} start={OTD_FRAMES - 44} line="What square would|you have had?" tint="gold" />
      </div>
    );
  };
}

// ---------------------------------------------------------------------------
// Thanksgiving slate
// ---------------------------------------------------------------------------

export const THANKSGIVING_FRAMES = 420;
const TG_ROW_AT = (i: number) => 54 + i * 16;

export const THANKSGIVING_AUDIO: AudioSpec = {
  style: "harvest",
  end: 340,
  drops: [258],
  sfx: [
    ...Array.from({ length: 6 }, (_, i) => ({ at: TG_ROW_AT(i), kind: "pop" as const, gain: 0.6 })),
    { at: 282, kind: "pop" },
    { at: 290, kind: "pop" },
  ],
};

/** 2026 Thanksgiving week (times ET): see marketing/launch-plan/research/. */
export const SLATE = [
  { day: "WED", time: "8:00 PM", game: "Packers at Rams", net: "Netflix", tag: "1st-ever Thanksgiving Eve game" },
  { day: "THU", time: "1:00 PM", game: "Bears at Lions", net: "CBS" },
  { day: "THU", time: "4:30 PM", game: "Eagles at Cowboys", net: "FOX" },
  { day: "THU", time: "8:20 PM", game: "Chiefs at Bills", net: "NBC" },
  { day: "FRI", time: "3:00 PM", game: "Broncos at Steelers", net: "Prime Video" },
  { day: "FRI", time: "3:30 PM", game: "Florida at Florida State", net: "ABC", college: true },
];

export function Thanksgiving({ frame }: CompProps) {
  const rowAt = TG_ROW_AT;
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
        style={{ position: "absolute", top: 86, left: 0, right: 0 }}
      />
      <div className="absolute flex flex-col" style={{ left: 20, right: 20, top: 172, gap: 8, opacity: listOut }}>
        {SLATE.map((g, i) => {
          const s = spring(frame - rowAt(i), FPS, { stiffness: 220, damping: 19 });
          return (
            <div
              key={g.game}
              className="flex items-center"
              style={{
                gap: 12,
                padding: "10px 12px",
                borderRadius: 18,
                background: g.college ? "rgba(58,183,255,0.10)" : COLORS.surface2,
                border: `1px solid ${COLORS.line}`,
                boxShadow: "0 10px 24px rgba(0,0,0,0.35)",
                transform: `translateX(${(1 - s) * 260}px)`,
                opacity: s,
              }}
            >
              <div className="shrink-0 text-center" style={{ width: 54 }}>
                <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: "0.08em", color: g.day === "THU" ? COLORS.gold : COLORS.voltLight }}>
                  {g.day}
                </div>
                <div style={{ fontSize: 11, fontWeight: 600, color: COLORS.muted }}>{g.time}</div>
              </div>
              <div className="min-w-0 flex-1">
                <div className="display truncate" style={{ fontSize: 16, letterSpacing: "-0.02em" }}>
                  {g.game}
                </div>
                <div className="truncate" style={{ fontSize: 11, color: COLORS.muted }}>
                  {g.net}
                  {g.tag ? ` · ${g.tag}` : g.college ? " · rivalry Friday" : ""}
                </div>
              </div>
              <span className="shrink-0" style={{ fontSize: 18 }}>
                {g.college ? "🏟️" : "🏈"}
              </span>
            </div>
          );
        })}
        <div className="text-center" style={{ marginTop: 2, fontSize: 10, color: COLORS.subtle }}>
          All times ET
        </div>
      </div>

      <Sticker frame={frame} start={258} end={330} top={206}>
        Kids' table? Make it just for fun.
      </Sticker>
      <Sticker frame={frame} start={282} end={330} top={296} tone="gold">
        Loser does the dishes. 🍽️
      </Sticker>
      {frame >= 290 && frame < 340 && (
        <div
          className="absolute inset-x-0 text-center"
          style={{ top: 370, fontSize: 64, transform: `scale(${spring(frame - 290, FPS, { stiffness: 220, damping: 12 })})` }}
        >
          🦃
        </div>
      )}
      <EndCard frame={frame} start={340} line="Thanksgiving squares.|One link per game." tint="gold" />
    </div>
  );
}
