import type { ReactNode } from "react";
import type { Composition, CompProps } from "../types";
import { PORTRAIT, REEL, COLORS } from "../brand";
import { Backdrop, type Tint } from "../components/Backdrop";
import { StudioGrid } from "../components/StudioGrid";
import { Headline } from "../components/Text";
import { ScoreBug, BigLogo, Wordmark } from "../components/Brand";
import { claimSequence, claimsMap, drawNumbers } from "../lib/mock";
import { DIGIT_SHARE, GAMES, HITS, SEASONS, TOP_FINALS, pct } from "../lib/stats";
import { heat } from "./BestWorst";
import { Logo } from "../../../src/components/AppShell";
import { Button, Card, Field, Pill, TextInput } from "../../../src/components/ui";

// Carousels render as stills: frame N = slide N. Components that animate are
// given a late frame so they sit at rest.
const REST = 999;
const DIGITS = Array.from({ length: 10 }, (_, i) => i);

function Shell({
  index,
  total,
  tint = "brand",
  children,
}: {
  index: number;
  total: number;
  tint?: Tint;
  children: ReactNode;
}) {
  return (
    <div className="absolute inset-0">
      <Backdrop frame={index * 47} tint={tint} />
      <div className="absolute left-5 top-5 flex items-center gap-2">
        <Logo />
        <span className="text-[15px] font-extrabold tracking-tight">
          Jax<span className="text-brand-400">Squares</span>
        </span>
      </div>
      <div className="absolute right-5 top-[26px] text-[11px] font-bold text-slate-500">
        {index + 1}/{total}
      </div>
      {children}
      <div className="absolute inset-x-0 bottom-4 flex justify-center gap-1.5">
        {Array.from({ length: total }, (_, i) => (
          <span
            key={i}
            className="h-1.5 rounded-full"
            style={{
              width: i === index ? 18 : 6,
              background: i === index ? COLORS.brand : "rgba(255,255,255,0.2)",
            }}
          />
        ))}
      </div>
      {index < total - 1 && (
        <div className="absolute bottom-3 right-5 text-[11px] font-bold text-slate-400">
          Swipe →
        </div>
      )}
    </div>
  );
}

function Title({
  text,
  top = 70,
  size = 34,
  highlight,
}: {
  text: string;
  top?: number;
  size?: number;
  highlight?: string;
}) {
  return (
    <Headline
      frame={REST}
      text={text}
      size={size}
      align="left"
      highlight={highlight}
      style={{ position: "absolute", top, left: 22, right: 22 }}
    />
  );
}

function Body({ children, top }: { children: ReactNode; top: number }) {
  return (
    <p
      className="absolute text-[14.5px] leading-snug text-slate-300"
      style={{ top, left: 22, right: 22 }}
    >
      {children}
    </p>
  );
}

function Step({ n, label }: { n: number; label: string }) {
  return (
    <div className="absolute left-[22px] top-[64px] flex items-center gap-2 text-[11px] font-extrabold uppercase tracking-[0.16em] text-brand-400">
      <span className="grid h-5 w-5 place-items-center rounded-full bg-brand-500 text-[11px] text-pitch-950">
        {n}
      </span>
      {label}
    </div>
  );
}

/**
 * Lays a board out at its natural width, then scales it to `width`. Rows can't
 * shrink below the 16px line height of their number labels, so narrowing a
 * grid directly makes it no shorter and pushes it off the slide.
 */
function ScaledBoard({
  top,
  width,
  natural,
  children,
}: {
  top: number;
  width: number;
  natural: number;
  children: ReactNode;
}) {
  return (
    <div
      className="absolute"
      style={{
        top,
        left: (360 - width) / 2,
        width: natural,
        transform: `scale(${width / natural})`,
        transformOrigin: "top left",
      }}
    >
      {children}
    </div>
  );
}

const DEMO = (() => {
  const numbers = drawNumbers(9);
  const events = claimSequence(42);
  return { numbers, events, claims: claimsMap(events) };
})();

function MiniGrid({
  top,
  width = 290,
  claimsUpTo = 0,
  locked = false,
  hot,
  winner,
}: {
  top: number;
  width?: number;
  claimsUpTo?: number;
  locked?: boolean;
  hot?: { col: number; row: number };
  winner?: string;
}) {
  const claims = new Map(
    [...DEMO.claims].filter(
      ([k]) => (DEMO.events.find((e) => e.key === k)?.order ?? 1) <= claimsUpTo,
    ),
  );
  return (
    <ScaledBoard top={top} width={width} natural={260}>
      <Card className="p-2.5">
        <StudioGrid
          teamX="Jaguars"
          teamY="Titans"
          claims={claims}
          colLabels={locked ? DEMO.numbers.x : DIGITS.map(() => "?")}
          rowLabels={locked ? DEMO.numbers.y : DIGITS.map(() => "?")}
          locked={locked}
          hotCol={hot?.col ?? null}
          hotRow={hot?.row ?? null}
          winners={winner ? new Map([[winner, 1]]) : new Map()}
          dim={winner ? 0.45 : 0}
        />
      </Card>
    </ScaledBoard>
  );
}

function CtaBlock({ top, lines }: { top: number; lines: string[] }) {
  return (
    <div className="absolute flex flex-col gap-2" style={{ top, left: 22, right: 22 }}>
      {lines.map((l) => (
        <div
          key={l}
          className="flex items-start gap-2.5 rounded-xl bg-pitch-900/80 px-3 py-2.5 text-[14px] ring-1 ring-white/5"
        >
          <span className="text-brand-400">✓</span>
          <span>{l}</span>
        </div>
      ))}
      <div className="mt-2 flex items-center justify-center">
        <span className="rounded-2xl bg-brand-500 px-6 py-3 text-[16px] font-extrabold text-pitch-950">
          Link in bio ↗
        </span>
      </div>
    </div>
  );
}

// --- How squares works ------------------------------------------------------

function HowItWorks({ frame: i }: CompProps) {
  const total = 7;
  const x7 = DEMO.numbers.x.indexOf(7);
  const y4 = DEMO.numbers.y.indexOf(4);
  const slides: ReactNode[] = [
    <>
      <Title text="How football|squares *works*" top={78} size={46} />
      <Body top={196}>The 60-second explainer. Save it for game day 📌</Body>
      <MiniGrid top={228} width={198} claimsUpTo={0.7} locked />
    </>,
    <>
      <Step n={1} label="The board" />
      <Title text="100 squares.|*Two teams.*" top={90} />
      <Body top={170}>
        One team runs across the top, the other down the side. Every square pairs one digit from
        each team.
      </Body>
      <MiniGrid top={240} width={190} />
    </>,
    <>
      <Step n={2} label="Claim" />
      <Title text="Friends claim|*their squares.*" top={90} />
      <Body top={170}>
        Everyone picks squares until the board is full. The commissioner can cap how many each
        person gets.
      </Body>
      <MiniGrid top={240} width={190} claimsUpTo={0.65} />
    </>,
    <>
      <Step n={3} label="The draw" />
      <Title text="Then the numbers|get *drawn.*" top={90} />
      <Body top={170}>
        Once the board is full, 0–9 are randomly assigned to every row and column. Nobody knows
        their digits until now.
      </Body>
      <MiniGrid top={240} width={190} claimsUpTo={1} locked />
    </>,
    <>
      <Step n={4} label="Score check" />
      <Title text="Use the *last digit*|of each score." top={90} />
      <Body top={170}>
        At the end of each quarter, look at the last digit of each team's score.
      </Body>
      <div className="absolute inset-x-0 flex justify-center" style={{ top: 238 }}>
        <ScoreBug awayName="Jaguars" homeName="Titans" away={17} home={14} period="Q3" />
      </div>
      <div
        className="absolute inset-x-0 flex items-center justify-center gap-6"
        style={{ top: 312 }}
      >
        {[
          { d: 7, c: COLORS.gold, t: "Jaguars" },
          { d: 4, c: COLORS.accent, t: "Titans" },
        ].map((v) => (
          <div key={v.t} className="flex flex-col items-center">
            <div
              className="font-black-display grid h-[92px] w-[92px] place-items-center rounded-3xl"
              style={{ fontSize: 64, background: v.c, color: COLORS.pitch950 }}
            >
              {v.d}
            </div>
            <div className="mt-2 text-[12px] font-bold text-slate-400">{v.t} digit</div>
          </div>
        ))}
      </div>
    </>,
    <>
      <Step n={5} label="Winner" />
      <Title text="Where they cross|*wins the quarter.*" top={90} />
      <Body top={170}>
        Jaguars 7 across, Titans 4 down. That square takes Q3. Repeat for Q1, Half, Q3 and Final.
      </Body>
      <MiniGrid
        top={240}
        width={190}
        claimsUpTo={1}
        locked
        hot={{ col: x7, row: y4 }}
        winner={`${y4},${x7}`}
      />
    </>,
    <>
      <Title text="Run yours in|*20 seconds.*" top={78} size={40} />
      <CtaBlock
        top={186}
        lines={[
          "Create a board, share one link",
          "Friends claim from any phone, no app",
          "We draw the numbers and call every winner",
          "Free, or track a buy-in. We never touch the money.",
        ]}
      />
    </>,
  ];
  return (
    <Shell index={i} total={total}>
      {slides[i]}
    </Shell>
  );
}

// --- Squares odds -----------------------------------------------------------

function HeatGrid({ top, width = 300 }: { top: number; width?: number }) {
  return (
    <ScaledBoard top={top} width={width} natural={300}>
      <Card className="p-2.5">
        <StudioGrid
          teamX="Team A"
          teamY="Team B"
          claims={new Map()}
          colLabels={DIGITS}
          rowLabels={DIGITS}
          locked
          fill={(row, col) => heat(col, row)}
          label={(row, col) => (
            <span className="text-[8px] font-bold leading-none" style={{ color: "#0b1120" }}>
              {pct(col, row) >= 1
                ? pct(col, row).toFixed(1)
                : pct(col, row).toFixed(2).replace(/^0/, "")}
            </span>
          )}
        />
      </Card>
    </ScaledBoard>
  );
}

function Bars({
  top,
  rows,
}: {
  top: number;
  rows: { label: string; value: number; sub?: string; color: string }[];
}) {
  const max = Math.max(...rows.map((r) => r.value));
  return (
    <div className="absolute flex flex-col gap-2.5" style={{ top, left: 22, right: 22 }}>
      {rows.map((r) => (
        <div key={r.label} className="flex items-center gap-3">
          <div className="font-black-display w-[58px] shrink-0 text-[22px]">{r.label}</div>
          <div className="relative h-8 flex-1 overflow-hidden rounded-lg bg-pitch-800">
            <div
              className="h-full rounded-lg"
              style={{ width: `${(100 * r.value) / max}%`, background: r.color }}
            />
            <span className="absolute inset-y-0 right-2 flex items-center text-[12px] font-bold text-slate-200">
              {r.sub}
            </span>
          </div>
        </div>
      ))}
    </div>
  );
}

function Odds({ frame: i }: CompProps) {
  const total = 6;
  const tiers: { tier: string; digits: number[]; color: string }[] = [
    { tier: "S", digits: [0, 7], color: COLORS.gold },
    { tier: "A", digits: [4, 3], color: COLORS.brandLight },
    { tier: "B", digits: [1, 6], color: COLORS.accent },
    { tier: "C", digits: [8, 9], color: "#a78bfa" },
    { tier: "D", digits: [5, 2], color: COLORS.rose },
  ];
  const pairs: [number, number][] = [];
  for (let x = 0; x < 10; x++) for (let y = x; y < 10; y++) pairs.push([x, y]);
  const rate = ([x, y]: [number, number]) => pct(x, y);
  const sorted = [...pairs].sort((a, b) => rate(b) - rate(a));
  const fmt = (v: number) => (v >= 1 ? `${v.toFixed(1)}%` : `${v.toFixed(2)}%`);
  const slides: ReactNode[] = [
    <>
      <Title text="Every square,|*ranked.*" top={78} size={48} highlight={COLORS.gold} />
      <Body top={196}>
        {GAMES.toLocaleString()} NFL final scores ({SEASONS}). Your 2–2 is cooked. 💀
      </Body>
      <HeatGrid top={228} width={196} />
    </>,
    <>
      <Title text="The *heat map*" top={70} size={32} highlight={COLORS.gold} />
      <Body top={112}>% of NFL finals landing on each square. Brighter = cashes more.</Body>
      <HeatGrid top={150} width={278} />
    </>,
    <>
      <Title text="Digit *tier list*" top={70} size={34} highlight={COLORS.gold} />
      <Body top={116}>Share of final team scores ending in each digit.</Body>
      <div className="absolute flex flex-col gap-2" style={{ top: 150, left: 22, right: 22 }}>
        {tiers.map((t) => (
          <div
            key={t.tier}
            className="flex items-center gap-3 rounded-2xl bg-pitch-900/80 p-2 ring-1 ring-white/5"
          >
            <span
              className="font-black-display grid h-10 w-10 place-items-center rounded-xl text-[22px]"
              style={{ background: t.color, color: COLORS.pitch950 }}
            >
              {t.tier}
            </span>
            {t.digits.map((d) => (
              <div key={d} className="flex flex-1 items-baseline gap-2">
                <span className="font-black-display text-[26px]">{d}</span>
                <span className="text-[13px] font-semibold text-slate-400">
                  {DIGIT_SHARE[d].toFixed(1)}%
                </span>
              </div>
            ))}
          </div>
        ))}
      </div>
    </>,
    <>
      <Title text="The 5 *best* squares" top={70} size={32} highlight={COLORS.gold} />
      <Body top={114}>Either direction. A random square cashes the final 1% of the time.</Body>
      <Bars
        top={170}
        rows={sorted
          .slice(0, 5)
          .map(([x, y]) => ({
            label: `${x}–${y}`,
            value: rate([x, y]),
            sub: fmt(rate([x, y])),
            color: "linear-gradient(90deg,#16a34a,#fbbf24)",
          }))}
      />
    </>,
    <>
      <Title text="The 5 *worst* squares" top={70} size={32} highlight={COLORS.rose} />
      <Body top={114}>
        2–2 hit {HITS[2][2]} times in {GAMES.toLocaleString()} games. That's it.
      </Body>
      <Bars
        top={170}
        rows={sorted
          .slice(-5)
          .reverse()
          .map(([x, y]) => ({
            label: `${x}–${y}`,
            value: rate([x, y]),
            sub: fmt(rate([x, y])),
            color: "linear-gradient(90deg,#9f1239,#fb7185)",
          }))}
      />
    </>,
    <>
      <Title text="Most common|final since 1999" top={70} size={32} />
      <div className="absolute flex flex-col gap-2.5" style={{ top: 160, left: 22, right: 22 }}>
        {TOP_FINALS.slice(0, 3).map(([w, l, n], k) => (
          <div
            key={k}
            className="flex items-center justify-between rounded-2xl bg-pitch-900/80 px-4 py-3 ring-1 ring-white/5"
          >
            <span
              className="font-black-display text-[32px]"
              style={{ color: k === 0 ? COLORS.gold : COLORS.text }}
            >
              {w}–{l}
            </span>
            <span className="text-right text-[13px] text-slate-400">
              {n} games
              <br />
              <span className="font-bold text-slate-200">
                {w % 10}–{l % 10} square
              </span>
            </span>
          </div>
        ))}
      </div>
      <div className="absolute inset-x-0 flex justify-center" style={{ top: 398 }}>
        <span className="font-black-display rounded-2xl bg-brand-500 px-4 py-2.5 text-[17px] text-pitch-950">
          Send this to your pool's 2–2 holder 📲
        </span>
      </div>
    </>,
  ];
  return (
    <Shell index={i} total={total} tint="gold">
      {slides[i]}
    </Shell>
  );
}

// --- Commissioner cheat sheet ----------------------------------------------

function Cheats({ frame: i }: CompProps) {
  const total = 6;
  const slides: ReactNode[] = [
    <>
      <Title text="The squares|commissioner|*cheat sheet*" top={80} size={42} />
      <Body top={240}>5 rules that keep your pool fair, fun, and drama-free. Steal them.</Body>
      <div className="absolute inset-x-0 flex justify-center" style={{ top: 310 }}>
        <span className="text-[72px]">📋</span>
      </div>
    </>,
    <>
      <Step n={1} label="Rule" />
      <Title text="Lock before|*kickoff.*" top={90} size={38} />
      <Body top={186}>
        Fill the board, then lock it. The numbers draw instantly and at random, so nobody can claim
        the good digits after the fact.
      </Body>
      <div className="absolute inset-x-0 flex justify-center" style={{ top: 320 }}>
        <Button className="px-5 py-3.5 text-[16px]">🎲 Lock board & draw numbers</Button>
      </div>
    </>,
    <>
      <Step n={2} label="Rule" />
      <Title text="Cap squares|*per player.*" top={90} size={38} />
      <Body top={186}>
        Set a max so one person can't buy half the board. Ten is a good starting point for a
        10-person pool.
      </Body>
      <div className="absolute" style={{ top: 296, left: 40, right: 40 }}>
        <Card>
          <Field label="Max / player" hint="0 = no limit">
            <TextInput readOnly value="10" className="border-brand-500 ring-2 ring-brand-500/30" />
          </Field>
        </Card>
      </div>
    </>,
    <>
      <Step n={3} label="Rule" />
      <Title text="Pay out every|*quarter.*" top={90} size={38} />
      <Body top={186}>
        Q1, Half, Q3 and Final winners keep everyone watching until the end, even after their team
        is down 20.
      </Body>
      <div className="absolute grid grid-cols-2 gap-2" style={{ top: 296, left: 40, right: 40 }}>
        {["Q1", "Half", "Q3", "Final"].map((p) => (
          <div
            key={p}
            className="rounded-xl bg-pitch-800 px-3 py-2.5 text-center ring-1 ring-white/10"
          >
            <div className="text-[12px] text-slate-400">{p}</div>
            <div className="text-[18px] font-extrabold text-gold-400">🏆</div>
          </div>
        ))}
      </div>
    </>,
    <>
      <Step n={4} label="Rule" />
      <Title text="Office pool?|*Make it free.*" top={90} size={38} />
      <Body top={186}>
        A $0 board is all of the sweat and none of the HR emails. Play for bragging rights, lunch,
        or the trophy on the desk.
      </Body>
      <div className="absolute" style={{ top: 296, left: 40, right: 40 }}>
        <Card>
          <Field label="Price / square" hint="Set 0 for a free pool">
            <TextInput readOnly value="$0" className="border-brand-500 ring-2 ring-brand-500/30" />
          </Field>
          <div className="mt-3">
            <Pill className="bg-brand-500/15 text-brand-400">🏆 Bragging rights only</Pill>
          </div>
        </Card>
      </div>
    </>,
    <>
      <Step n={5} label="Rule" />
      <Title text="Let the board|*do the math.*" top={90} size={38} />
      <CtaBlock
        top={196}
        lines={[
          "No spreadsheet, no whiteboard photo",
          "Winners light up after each quarter",
          "No app or account for your players",
          "We never touch the money",
        ]}
      />
    </>,
  ];
  return (
    <Shell index={i} total={total}>
      {slides[i]}
    </Shell>
  );
}

// --- Thanksgiving playbook --------------------------------------------------

const TG_SLATE = [
  ["WED 8:00", "Packers at Rams", "Netflix"],
  ["THU 1:00", "Bears at Lions", "CBS"],
  ["THU 4:30", "Eagles at Cowboys", "FOX"],
  ["THU 8:20", "Chiefs at Bills", "NBC"],
  ["FRI 3:00", "Broncos at Steelers", "Prime Video"],
  ["FRI 3:30", "Florida at Florida State", "ABC"],
];

function ThanksgivingPlaybook({ frame: i }: CompProps) {
  const total = 6;
  const slides: ReactNode[] = [
    <>
      <Title
        text="The Thanksgiving|*squares playbook*"
        top={80}
        size={38}
        highlight={COLORS.gold}
      />
      <Body top={180}>6 games in 3 days. Here's how to run the board at the family table. 🦃</Body>
      <div className="absolute inset-x-0 flex justify-center" style={{ top: 270 }}>
        <span className="text-[96px]">🦃</span>
      </div>
    </>,
    <>
      <Title text="The *slate*" top={70} size={34} highlight={COLORS.gold} />
      <div className="absolute flex flex-col gap-2" style={{ top: 122, left: 22, right: 22 }}>
        {TG_SLATE.map(([t, g, n]) => (
          <div
            key={g}
            className="flex items-center gap-3 rounded-xl bg-pitch-900/85 px-3 py-2.5 ring-1 ring-white/5"
          >
            <span className="w-[66px] shrink-0 text-[11px] font-extrabold text-gold-400">{t}</span>
            <span className="flex-1 truncate text-[14px] font-bold">{g}</span>
            <span className="text-[11px] text-slate-400">{n}</span>
          </div>
        ))}
        <div className="text-center text-[10px] text-slate-500">All times ET · Nov 25–27, 2026</div>
      </div>
    </>,
    <>
      <Step n={1} label="Play" />
      <Title text="One board|*per game.*" top={90} size={38} highlight={COLORS.gold} />
      <Body top={186}>
        Lions game is the warm-up. Cowboys is the main event. Bills at night is the nightcap. A new
        board takes 20 seconds.
      </Body>
      <MiniGrid top={262} width={170} claimsUpTo={1} locked />
    </>,
    <>
      <Step n={2} label="Play" />
      <Title text="The kids' table|*board is $0.*" top={90} size={38} highlight={COLORS.gold} />
      <Body top={186}>Everyone gets squares. Nobody pays. Winner picks the pie.</Body>
      <div className="absolute" style={{ top: 268, left: 40, right: 40 }}>
        <Card>
          <Field label="Price / square" hint="Set 0 for a free pool">
            <TextInput readOnly value="$0" className="border-brand-500 ring-2 ring-brand-500/30" />
          </Field>
        </Card>
      </div>
    </>,
    <>
      <Step n={3} label="Play" />
      <Title text="Stakes that|*aren't cash.*" top={90} size={38} highlight={COLORS.gold} />
      <div className="absolute flex flex-col gap-2" style={{ top: 190, left: 22, right: 22 }}>
        {[
          "🍽️ Loser does the dishes",
          "🍗 Winner gets the first plate",
          "📺 Q3 winner picks the movie",
          "🦴 Final winner keeps the wishbone",
        ].map((s) => (
          <div
            key={s}
            className="rounded-xl bg-pitch-900/85 px-3.5 py-3 text-[15px] font-semibold ring-1 ring-white/5"
          >
            {s}
          </div>
        ))}
      </div>
    </>,
    <>
      <Title
        text="Drop the link in the|*family group chat.*"
        top={78}
        size={32}
        highlight={COLORS.gold}
      />
      <CtaBlock
        top={178}
        lines={[
          "Grandma can claim from her phone",
          "No app, no account, no spreadsheet",
          "Numbers drawn live at the table",
          "Winners light up every quarter",
        ]}
      />
    </>,
  ];
  return (
    <Shell index={i} total={total} tint="gold">
      {slides[i]}
    </Shell>
  );
}

// --- Story frames (1080×1920) ------------------------------------------------
// The middle band (~y 300–470) is left clear for the native poll / quiz / link
// sticker added in the Instagram app; which sticker goes where is in the plan.

function StoryShell({
  children,
  tint = "brand",
  foot,
}: {
  children: ReactNode;
  tint?: Tint;
  foot?: string;
}) {
  return (
    <div className="absolute inset-0">
      <Backdrop frame={0} tint={tint} />
      <div
        className="absolute inset-x-0 flex items-center justify-center gap-2"
        style={{ top: 70 }}
      >
        <BigLogo size={30} />
        <Wordmark size={20} />
      </div>
      {children}
      <div
        className="absolute inset-x-0 text-center text-[11px] font-semibold text-slate-500"
        style={{ top: 520 }}
      >
        {foot}
      </div>
    </div>
  );
}

function Stories({ frame: i }: CompProps) {
  const big = (t: string, top: number, size = 38, highlight?: string) => (
    <Headline
      frame={REST}
      text={t}
      size={size}
      highlight={highlight}
      style={{ position: "absolute", top, left: 20, right: 20 }}
    />
  );
  const frames: ReactNode[] = [
    <StoryShell key="poll">
      {big("Pick a square 👇", 150, 30)}
      {big("*0–0*  or  *7–7*?", 210, 44, COLORS.gold)}
    </StoryShell>,
    <StoryShell key="poll-a" foot={`${GAMES.toLocaleString()} NFL finals, ${SEASONS}`} tint="gold">
      {big("The answer:", 150, 28)}
      {big(`0–0: *${pct(0, 0).toFixed(1)}%*|7–7: *${pct(7, 7).toFixed(1)}%*`, 205, 42, COLORS.gold)}
      {big("Basically a coin flip.|Both are top-15 squares.", 340, 22)}
    </StoryShell>,
    <StoryShell key="quiz">
      {big("Quiz 🧠", 140, 28)}
      {big("The most common|NFL final score|*since 1999?*", 190, 34)}
    </StoryShell>,
    <StoryShell key="quiz-a" foot="Data: nflverse" tint="gold">
      {big("It's *23–20.*", 160, 44, COLORS.gold)}
      {big(
        `${TOP_FINALS[0][2]} games. Then 20–17 (${TOP_FINALS[1][2]})|and 27–24 (${TOP_FINALS[2][2]}).`,
        240,
        20,
      )}
      {big("Translation: you want|the *3–0* square.", 330, 26)}
    </StoryShell>,
    <StoryShell key="who">{big("Who's running|squares this|*weekend?* 🙋", 150, 38)}</StoryShell>,
    <StoryShell key="checklist">
      {big("Game day|*checklist*", 140, 36)}
      <div className="absolute flex flex-col gap-2" style={{ top: 240, left: 40, right: 40 }}>
        {[
          "✅ Board full",
          "🔒 Lock before kickoff",
          "📲 Link in the group chat",
          "🏆 Winners light up",
        ].map((s) => (
          <div
            key={s}
            className="rounded-xl bg-pitch-900/85 px-4 py-2.5 text-[16px] font-bold ring-1 ring-white/5"
          >
            {s}
          </div>
        ))}
      </div>
    </StoryShell>,
    <StoryShell key="tg" tint="gold">
      {big("Thanksgiving: how many|*boards* are you running? 🦃", 160, 30, COLORS.gold)}
    </StoryShell>,
    <StoryShell key="rate" tint="rose">
      {big("Drop your square.|We'll tell you if|it's *cooked.* 💀", 150, 34, COLORS.rose)}
    </StoryShell>,
  ];
  return frames[i];
}

const stills = (c: Omit<Composition, "fps" | "kind">): Composition => ({
  fps: 30,
  kind: "stills",
  ...c,
});

export const CAROUSELS: Composition[] = [
  stills({
    id: "c1-how-squares-works",
    title: "Carousel: how squares works",
    ...PORTRAIT,
    durationInFrames: 7,
    component: HowItWorks,
  }),
  stills({
    id: "c2-squares-odds",
    title: "Carousel: every square ranked",
    ...PORTRAIT,
    durationInFrames: 6,
    component: Odds,
  }),
  stills({
    id: "c3-commissioner-cheat-sheet",
    title: "Carousel: commissioner cheat sheet",
    ...PORTRAIT,
    durationInFrames: 6,
    component: Cheats,
  }),
  stills({
    id: "c4-thanksgiving-playbook",
    title: "Carousel: Thanksgiving playbook",
    ...PORTRAIT,
    durationInFrames: 6,
    component: ThanksgivingPlaybook,
  }),
];

export const STORIES: Composition[] = [
  stills({
    id: "s-story-frames",
    title: "Story frames",
    ...REEL,
    durationInFrames: 8,
    component: Stories,
  }),
];
