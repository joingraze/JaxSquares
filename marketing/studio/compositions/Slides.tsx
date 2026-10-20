import type { ReactNode } from "react";
import type { Composition, CompProps } from "../types";
import { BRAND, COLORS, PORTRAIT, REEL } from "../brand";
import { Backdrop, type Tint } from "../components/Backdrop";
import { AppBoard, DataBoard } from "../components/AppBoard";
import { ClipCrop } from "../components/Phone";
import { Headline } from "../components/Text";
import { Lockup, ScoreBug } from "../components/Brand";
import { Panel } from "../components/Layout";
import { boardOf, digitsOf, TEAMS } from "../lib/world";
import { ASSETS } from "../lib/assets";
import { DIGIT_SHARE, GAMES, HITS, SEASONS, TOP_FINALS, pct } from "../lib/stats";
import { DIGIT_TEAMS, heat, heatInk, pctLabel } from "./BestWorst";
import { SLATE, namedTeam } from "./Templates";
import { Jax } from "../../../src/components/ui";

// Carousels render as stills: frame N = slide N. Animated pieces get a late
// frame so they sit at rest.
const REST = 999;

function Shell({ index, total, tint = "volt", children }: { index: number; total: number; tint?: Tint; children: ReactNode }) {
  return (
    <div className="absolute inset-0">
      <Backdrop frame={index * 47} tint={tint} />
      <div className="absolute" style={{ left: 20, top: 20 }}>
        <Lockup size={16} />
      </div>
      <div className="absolute" style={{ right: 20, top: 25, fontSize: 11, fontWeight: 700, color: COLORS.subtle }}>
        {index + 1}/{total}
      </div>
      {children}
      <div className="absolute inset-x-0 flex justify-center" style={{ bottom: 16, gap: 6 }}>
        {Array.from({ length: total }, (_, i) => (
          <span
            key={i}
            className="rounded-full"
            style={{ height: 6, width: i === index ? 18 : 6, background: i === index ? COLORS.volt : "rgba(255,255,255,0.2)" }}
          />
        ))}
      </div>
      {index < total - 1 && (
        <div className="absolute" style={{ right: 20, bottom: 12, fontSize: 11, fontWeight: 700, color: COLORS.muted }}>
          Swipe →
        </div>
      )}
    </div>
  );
}

function Title({ text, top = 70, size = 34, highlight }: { text: string; top?: number; size?: number; highlight?: string }) {
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
    <p className="absolute" style={{ top, left: 22, right: 22, fontSize: 14.5, lineHeight: 1.38, color: COLORS.muted }}>
      {children}
    </p>
  );
}

function Step({ n, label, color = COLORS.volt }: { n: number; label: string; color?: string }) {
  return (
    <div
      className="absolute flex items-center"
      style={{ left: 22, top: 64, gap: 8, fontSize: 11, fontWeight: 800, letterSpacing: "0.16em", textTransform: "uppercase", color }}
    >
      <span className="grid place-items-center rounded-full" style={{ width: 20, height: 20, fontSize: 11, background: color, color: COLORS.canvas }}>
        {n}
      </span>
      {label}
    </div>
  );
}

function Centered({ top, children }: { top: number; children: ReactNode }) {
  return (
    <div className="absolute inset-x-0 flex justify-center" style={{ top }}>
      {children}
    </div>
  );
}

function CtaBlock({ top, lines, note }: { top: number; lines: string[]; note?: string }) {
  return (
    <div className="absolute flex flex-col" style={{ top, left: 22, right: 22, gap: 8 }}>
      {lines.map((l) => (
        <div
          key={l}
          className="flex items-start"
          style={{ gap: 10, padding: "10px 12px", borderRadius: 14, fontSize: 14, background: "rgba(12,20,16,0.85)", border: `1px solid ${COLORS.line}` }}
        >
          <span style={{ color: COLORS.volt, fontWeight: 800 }}>✓</span>
          <span>{l}</span>
        </div>
      ))}
      <div className="flex flex-col items-center" style={{ marginTop: 10, gap: 6 }}>
        <span className="display" style={{ borderRadius: 16, padding: "11px 24px", fontSize: 18, background: COLORS.volt, color: COLORS.canvas }}>
          {BRAND.url}
        </span>
        {note && <span style={{ fontSize: 11, fontWeight: 600, color: COLORS.subtle }}>{note}</span>}
      </div>
    </div>
  );
}

// --- How squares works ------------------------------------------------------

const DEMO = (() => {
  const all = [...boardOf(42)];
  return { all, x: digitsOf(9), y: digitsOf(19) };
})();

function MiniBoard({
  top,
  width = 200,
  fill = 0,
  drawn = false,
  win,
}: {
  top: number;
  width?: number;
  fill?: number;
  drawn?: boolean;
  win?: { x: number; y: number };
}) {
  const owners = new Map(DEMO.all.slice(0, Math.round(100 * fill)));
  const key = win ? `${DEMO.y.indexOf(win.y)},${DEMO.x.indexOf(win.x)}` : null;
  return (
    <Centered top={top}>
      <AppBoard
        width={width}
        teamX={TEAMS.hawks}
        teamY={TEAMS.wolves}
        owners={owners}
        axis={drawn ? { x: DEMO.x.map(String), y: DEMO.y.map(String) } : null}
        open={!drawn}
        wins={key ? new Map([[key, ["Q3"]]]) : undefined}
        final={key !== null}
      />
    </Centered>
  );
}

function HowItWorks({ frame: i }: CompProps) {
  const slides: ReactNode[] = [
    <>
      <Title text="How football|squares *works*" top={78} size={46} />
      <Body top={196}>The 60-second explainer. Save it for game day 📌</Body>
      <MiniBoard top={240} width={210} fill={0.7} drawn />
    </>,
    <>
      <Step n={1} label="The board" />
      <Title text="100 squares.|*Two teams.*" top={90} />
      <Body top={170}>One team runs across the top, the other down the side. Every square pairs one digit from each team.</Body>
      <MiniBoard top={252} />
    </>,
    <>
      <Step n={2} label="Pick" />
      <Title text="Friends pick|*their squares.*" top={90} />
      <Body top={170}>Everyone grabs squares from their own phone until the board is full. The host can cap how many each person gets.</Body>
      <MiniBoard top={252} fill={0.65} />
    </>,
    <>
      <Step n={3} label="The draw" />
      <Title text="Then the numbers|get *drawn.*" top={90} />
      <Body top={170}>Once the board is full, 0–9 get shuffled onto the rows and columns. Nobody knows their digits until now.</Body>
      <MiniBoard top={252} fill={1} drawn />
    </>,
    <>
      <Step n={4} label="Score check" />
      <Title text="Use the *last digit*|of each score." top={90} />
      <Body top={170}>At the end of each quarter, look at the last digit of each team's score.</Body>
      <Centered top={236}>
        <ScoreBug teamX={TEAMS.hawks} teamY={TEAMS.wolves} x={17} y={14} period="End of Q3" width={300} />
      </Centered>
      <div className="absolute inset-x-0 flex items-center justify-center" style={{ top: 322, gap: 24 }}>
        {[
          { d: 7, c: TEAMS.hawks.color, t: "Hawks digit" },
          { d: 4, c: TEAMS.wolves.color, t: "Wolves digit" },
        ].map((v) => (
          <div key={v.t} className="flex flex-col items-center">
            <div className="display grid place-items-center" style={{ width: 92, height: 92, borderRadius: 26, fontSize: 64, background: v.c, color: COLORS.canvas }}>
              {v.d}
            </div>
            <div style={{ marginTop: 8, fontSize: 12, fontWeight: 700, color: COLORS.muted }}>{v.t}</div>
          </div>
        ))}
      </div>
    </>,
    <>
      <Step n={5} label="Winner" color={COLORS.gold} />
      <Title text="Where they cross|*wins the quarter.*" top={90} highlight={COLORS.gold} />
      <Body top={170}>Hawks 7 across, Wolves 4 down. That square takes Q3. Same for Q1, Half and the Final.</Body>
      <MiniBoard top={252} fill={1} drawn win={{ x: 7, y: 4 }} />
    </>,
    <>
      <Title text="Run yours in|*30 seconds.*" top={78} size={40} />
      <CtaBlock
        top={166}
        lines={["Pick the game, text one link", "Friends pick from any phone. No app.", "Jax draws the numbers, live", "Live scores call every winner"]}
        note="Free to set up · Just for fun"
      />
    </>,
  ];
  return (
    <Shell index={i} total={slides.length}>
      {slides[i]}
    </Shell>
  );
}

// --- Every square, ranked ---------------------------------------------------

function HeatBoard({ top, width = 300 }: { top: number; width?: number }) {
  return (
    <Centered top={top}>
      <DataBoard
        width={width}
        teamX={DIGIT_TEAMS.x}
        teamY={DIGIT_TEAMS.y}
        fill={(row, col) => heat(col, row)}
        label={(row, col) => (
          <span style={{ fontSize: 10.5, fontWeight: 800, color: heatInk(col, row) }}>{pctLabel(col, row)}</span>
        )}
      />
    </Centered>
  );
}

function Bars({ top, rows }: { top: number; rows: { label: string; value: number; sub: string; color: string }[] }) {
  const max = Math.max(...rows.map((r) => r.value));
  return (
    <div className="absolute flex flex-col" style={{ top, left: 22, right: 22, gap: 10 }}>
      {rows.map((r) => (
        <div key={r.label} className="flex items-center" style={{ gap: 12 }}>
          <div className="display shrink-0" style={{ width: 58, fontSize: 22 }}>
            {r.label}
          </div>
          <div className="relative flex-1 overflow-hidden" style={{ height: 32, borderRadius: 10, background: COLORS.surface3 }}>
            <div style={{ height: "100%", borderRadius: 10, width: `${(100 * r.value) / max}%`, background: r.color }} />
            <span className="absolute inset-y-0 flex items-center" style={{ right: 8, fontSize: 12, fontWeight: 700, color: COLORS.ink }}>
              {r.sub}
            </span>
          </div>
        </div>
      ))}
    </div>
  );
}

function Ranked({ frame: i }: CompProps) {
  const tiers: { tier: string; digits: number[]; color: string }[] = [
    { tier: "S", digits: [0, 7], color: COLORS.gold },
    { tier: "A", digits: [4, 3], color: COLORS.volt },
    { tier: "B", digits: [1, 6], color: COLORS.sky },
    { tier: "C", digits: [8, 9], color: "#9b6bff" },
    { tier: "D", digits: [5, 2], color: COLORS.flare },
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
      <HeatBoard top={246} width={200} />
    </>,
    <>
      <Title text="The *heat map*" top={70} size={32} highlight={COLORS.gold} />
      <Body top={112}>% of NFL finals landing on each square. Brighter = hits more often.</Body>
      <HeatBoard top={156} width={290} />
    </>,
    <>
      <Title text="Digit *tier list*" top={70} size={34} highlight={COLORS.gold} />
      <Body top={116}>Share of final team scores ending in each digit.</Body>
      <div className="absolute flex flex-col" style={{ top: 152, left: 22, right: 22, gap: 8 }}>
        {tiers.map((t) => (
          <div key={t.tier} className="flex items-center" style={{ gap: 12, padding: 8, borderRadius: 18, background: "rgba(12,20,16,0.85)", border: `1px solid ${COLORS.line}` }}>
            <span className="display grid place-items-center" style={{ width: 40, height: 40, borderRadius: 12, fontSize: 22, background: t.color, color: COLORS.canvas }}>
              {t.tier}
            </span>
            {t.digits.map((d) => (
              <div key={d} className="flex flex-1 items-baseline" style={{ gap: 8 }}>
                <span className="display" style={{ fontSize: 26 }}>
                  {d}
                </span>
                <span style={{ fontSize: 13, fontWeight: 600, color: COLORS.muted }}>{DIGIT_SHARE[d].toFixed(1)}%</span>
              </div>
            ))}
          </div>
        ))}
      </div>
    </>,
    <>
      <Title text="The 5 *best* squares" top={70} size={32} highlight={COLORS.gold} />
      <Body top={114}>Either direction. A random square hits the final 1% of the time.</Body>
      <Bars
        top={172}
        rows={sorted.slice(0, 5).map(([x, y]) => ({
          label: `${x}–${y}`,
          value: rate([x, y]),
          sub: fmt(rate([x, y])),
          color: `linear-gradient(90deg, ${COLORS.voltDeep}, ${COLORS.gold})`,
        }))}
      />
    </>,
    <>
      <Title text="The 5 *worst* squares" top={70} size={32} highlight={COLORS.flare} />
      <Body top={114}>
        2–2 hit {HITS[2][2]} times in {GAMES.toLocaleString()} games. That's it.
      </Body>
      <Bars
        top={172}
        rows={sorted
          .slice(-5)
          .reverse()
          .map(([x, y]) => ({
            label: `${x}–${y}`,
            value: rate([x, y]),
            sub: fmt(rate([x, y])),
            color: `linear-gradient(90deg, #8a1f4c, ${COLORS.flare})`,
          }))}
      />
    </>,
    <>
      <Title text="Most common|final since 1999" top={70} size={32} />
      <div className="absolute flex flex-col" style={{ top: 160, left: 22, right: 22, gap: 10 }}>
        {TOP_FINALS.slice(0, 3).map(([w, l, n], k) => (
          <div
            key={k}
            className="flex items-center justify-between"
            style={{ padding: "12px 16px", borderRadius: 18, background: "rgba(12,20,16,0.85)", border: `1px solid ${COLORS.line}` }}
          >
            <span className="display" style={{ fontSize: 32, color: k === 0 ? COLORS.gold : COLORS.ink }}>
              {w}–{l}
            </span>
            <span className="text-right" style={{ fontSize: 13, color: COLORS.muted }}>
              {n} games
              <br />
              <span style={{ fontWeight: 700, color: COLORS.ink }}>
                {w % 10}–{l % 10} square
              </span>
            </span>
          </div>
        ))}
      </div>
      <Centered top={398}>
        <span className="display" style={{ borderRadius: 16, padding: "10px 16px", fontSize: 17, background: COLORS.volt, color: COLORS.canvas }}>
          Send this to your board's 2–2 holder 📲
        </span>
      </Centered>
    </>,
  ];
  return (
    <Shell index={i} total={slides.length} tint="gold">
      {slides[i]}
    </Shell>
  );
}

// --- Host cheat sheet -------------------------------------------------------

/** A crop of the real app, centered under a slide's copy. */
function AppCrop({ top, ...crop }: { top: number } & Parameters<typeof ClipCrop>[0]) {
  return (
    <Centered top={top}>
      <ClipCrop {...crop} />
    </Centered>
  );
}

function Cheats({ frame: i }: CompProps) {
  const slides: ReactNode[] = [
    <>
      <Title text="The squares|host|*cheat sheet*" top={80} size={42} />
      <Body top={238}>5 rules that keep your board fair, fun, and drama-free. Steal them.</Body>
      <Centered top={300}>
        <Jax pose="sit" size={150} />
      </Centered>
    </>,
    <>
      <Step n={1} label="Rule" />
      <Title text="Draw before|*kickoff.*" top={90} size={38} />
      <Body top={182}>Fill the board, then lock it. Jax shuffles the numbers live for everyone, so nobody grabs the good digits after the fact.</Body>
      <AppCrop top={268} scene="draw" at={70} y0={575} y1={880} width={250} />
    </>,
    <>
      <Step n={2} label="Rule" />
      <Title text="Cap squares|*per player.*" top={90} size={38} />
      <Body top={182}>Set a max so one person can't grab half the board. Ten each is a good start for a 10-person board.</Body>
      <AppCrop top={268} scene="create" at={150} y0={140} y1={430} width={260} />
    </>,
    <>
      <Step n={3} label="Rule" />
      <Title text="Winners|*every quarter.*" top={90} size={38} />
      <Body top={182}>Q1, Half, Q3 and Final winners keep everyone watching until the end, even when their team is down 20.</Body>
      <AppCrop top={270} scene="create" at={60} y0={150} y1={400} width={280} />
    </>,
    <>
      <Step n={4} label="Rule" />
      <Title text="Office board?|*Just for fun.*" top={90} size={38} />
      <Body top={182}>Pick Just for fun: no square price, no amounts. Add notes like “Loser buys wings.”</Body>
      <AppCrop top={248} scene="create" at={125} y0={150} y1={490} width={250} />
    </>,
    <>
      <Step n={5} label="Rule" />
      <Title text="Let the board|*do the math.*" top={90} size={38} />
      <CtaBlock
        top={190}
        lines={["No spreadsheet, no whiteboard photo", "Live scores call every winner", "No app or account for your players", "Prizes are whatever you say"]}
      />
    </>,
  ];
  return (
    <Shell index={i} total={slides.length}>
      {slides[i]}
    </Shell>
  );
}

// --- Thanksgiving playbook --------------------------------------------------

function ThanksgivingPlaybook({ frame: i }: CompProps) {
  const owners = new Map(DEMO.all);
  const slides: ReactNode[] = [
    <>
      <Title text="The Thanksgiving|*squares playbook*" top={80} size={38} highlight={COLORS.gold} />
      <Body top={180}>6 games in 3 days. Here's how to run the board at the family table. 🦃</Body>
      <Centered top={266}>
        <span style={{ fontSize: 96 }}>🦃</span>
      </Centered>
    </>,
    <>
      <Title text="The *slate*" top={70} size={34} highlight={COLORS.gold} />
      <div className="absolute flex flex-col" style={{ top: 122, left: 22, right: 22, gap: 8 }}>
        {SLATE.map((g) => (
          <div
            key={g.game}
            className="flex items-center"
            style={{ gap: 12, padding: "10px 12px", borderRadius: 14, background: "rgba(12,20,16,0.88)", border: `1px solid ${COLORS.line}` }}
          >
            <span className="shrink-0" style={{ width: 66, fontSize: 11, fontWeight: 800, color: COLORS.gold }}>
              {g.day} {g.time.replace(" PM", "")}
            </span>
            <span className="flex-1 truncate" style={{ fontSize: 14, fontWeight: 700 }}>
              {g.game}
            </span>
            <span style={{ fontSize: 11, color: COLORS.muted }}>{g.net}</span>
          </div>
        ))}
        <div className="text-center" style={{ fontSize: 10, color: COLORS.subtle }}>
          All times ET (PM) · Nov 25–27, 2026
        </div>
      </div>
    </>,
    <>
      <Step n={1} label="Play" color={COLORS.gold} />
      <Title text="One board|*per game.*" top={90} size={38} highlight={COLORS.gold} />
      <Body top={182}>Lions game is the warm-up. Cowboys is the main event. Bills at night is the nightcap. A new board takes 30 seconds.</Body>
      <Centered top={268}>
        <AppBoard
          width={176}
          teamX={namedTeam("Bears", "x")}
          teamY={namedTeam("Lions", "y")}
          owners={owners}
          axis={{ x: DEMO.x.map(String), y: DEMO.y.map(String) }}
        />
      </Centered>
    </>,
    <>
      <Step n={2} label="Play" color={COLORS.gold} />
      <Title text="Kids' table board?|*Just for fun.*" top={90} size={36} highlight={COLORS.gold} />
      <Body top={182}>Everyone gets squares. Winner picks the pie.</Body>
      <AppCrop top={240} scene="create" at={125} y0={150} y1={490} width={260} />
    </>,
    <>
      <Step n={3} label="Play" color={COLORS.gold} />
      <Title text="Prizes that|*aren't cash.*" top={90} size={38} highlight={COLORS.gold} />
      <div className="absolute flex flex-col" style={{ top: 190, left: 22, right: 22, gap: 8 }}>
        {["🍽️ Loser does the dishes", "🍗 Winner gets the first plate", "📺 Q3 winner picks the movie", "🦴 Final winner keeps the wishbone"].map((s) => (
          <div key={s} style={{ padding: "12px 14px", borderRadius: 14, fontSize: 15, fontWeight: 600, background: "rgba(12,20,16,0.88)", border: `1px solid ${COLORS.line}` }}>
            {s}
          </div>
        ))}
      </div>
    </>,
    <>
      <Title text="Drop the link in the|*family group chat.*" top={78} size={32} highlight={COLORS.gold} />
      <CtaBlock
        top={176}
        lines={["Grandma can pick from her phone", "No app, no account, no spreadsheet", "Numbers drawn live at the table", "Winners light up every quarter"]}
      />
    </>,
  ];
  return (
    <Shell index={i} total={slides.length} tint="gold">
      {slides[i]}
    </Shell>
  );
}

// --- Story frames (1080×1920) ------------------------------------------------
// The middle band (~y 300–470) is left clear for the native poll / quiz / link
// sticker added in the Instagram app; which sticker goes where is in the plan.

function StoryShell({ children, tint = "volt", foot }: { children: ReactNode; tint?: Tint; foot?: string }) {
  return (
    <div className="absolute inset-0">
      <Backdrop frame={0} tint={tint} />
      <div className="absolute inset-x-0 flex justify-center" style={{ top: 70 }}>
        <Lockup size={20} />
      </div>
      {children}
      <div className="absolute inset-x-0 text-center" style={{ top: 520, fontSize: 11, fontWeight: 600, color: COLORS.subtle }}>
        {foot}
      </div>
    </div>
  );
}

function Stories({ frame: i }: CompProps) {
  const big = (t: string, top: number, size = 38, highlight?: string) => (
    <Headline frame={REST} text={t} size={size} highlight={highlight} style={{ position: "absolute", top, left: 20, right: 20 }} />
  );
  const frames: ReactNode[] = [
    <StoryShell key="poll">
      {big("Pick a square 👇", 150, 30)}
      {big("*0–0*  or  *7–7*?", 210, 44, COLORS.gold)}
    </StoryShell>,
    <StoryShell key="poll-a" foot={`${GAMES.toLocaleString()} NFL finals, ${SEASONS}`} tint="gold">
      {big("The answer:", 150, 28)}
      {big(`0–0: *${pct(0, 0).toFixed(1)}%*|7–7: *${pct(7, 7).toFixed(1)}%*`, 205, 42, COLORS.gold)}
      {big("Basically a coin flip.|Both are top-10 squares.", 340, 22)}
    </StoryShell>,
    <StoryShell key="quiz">
      {big("Quiz 🧠", 140, 28)}
      {big("The most common|NFL final score|*since 1999?*", 190, 34)}
    </StoryShell>,
    <StoryShell key="quiz-a" foot="Data: nflverse" tint="gold">
      {big("It's *23–20.*", 160, 44, COLORS.gold)}
      {big(`${TOP_FINALS[0][2]} games. Then 20–17 (${TOP_FINALS[1][2]})|and 27–24 (${TOP_FINALS[2][2]}).`, 240, 20)}
      {big("Translation: you want|the *3–0* square.", 330, 26)}
    </StoryShell>,
    <StoryShell key="who">
      {big("Who's running|squares this|*weekend?* 🙋", 150, 38)}
      <Centered top={478}>
        <Jax pose="peek" size={120} />
      </Centered>
    </StoryShell>,
    <StoryShell key="checklist">
      {big("Game day|*checklist*", 140, 36)}
      <div className="absolute flex flex-col" style={{ top: 240, left: 40, right: 40, gap: 8 }}>
        {["✅ Board full", "🎲 Draw before kickoff", "📲 Link in the group chat", "🏆 Winners light up"].map((s) => (
          <Panel key={s} style={{ padding: "10px 16px", borderRadius: 14, fontSize: 16, fontWeight: 700 }}>
            {s}
          </Panel>
        ))}
      </div>
    </StoryShell>,
    <StoryShell key="tg" tint="gold">
      {big("Thanksgiving: how many|*boards* are you running? 🦃", 160, 30, COLORS.gold)}
    </StoryShell>,
    <StoryShell key="rate" tint="flare">
      {big("Drop your square.|We'll tell you if|it's *cooked.* 💀", 150, 34, COLORS.flare)}
    </StoryShell>,
  ];
  return frames[i];
}

// --- Profile picture (1080×1080) --------------------------------------------
// Instagram crops to a circle. 01: the app icon (Jax over the board), sized so
// the board's corner squares clear the crop. 02: the website's 3×3 mark.

function ProfilePicture({ frame: i }: CompProps) {
  return (
    <div className="absolute inset-0 grid place-items-center" style={{ background: `linear-gradient(180deg, ${COLORS.surface2}, ${COLORS.canvas})` }}>
      {i === 0 ? (
        <img src={ASSETS.icon} alt="" style={{ width: 293, height: 293 }} />
      ) : (
        <div className="absolute inset-0 grid place-items-center" style={{ background: "radial-gradient(circle at 50% 56%, rgba(255,194,51,.18), transparent 55%)" }}>
          <img src={ASSETS.mark} alt="" style={{ width: 263, height: 263 }} />
        </div>
      )}
    </div>
  );
}

const stills = (c: Omit<Composition, "fps" | "kind">): Composition => ({ fps: 30, kind: "stills", ...c });

export const CAROUSELS: Composition[] = [
  stills({ id: "c1-how-squares-works", title: "Carousel: how squares works", ...PORTRAIT, durationInFrames: 7, component: HowItWorks }),
  stills({ id: "c2-every-square-ranked", title: "Carousel: every square ranked", ...PORTRAIT, durationInFrames: 6, component: Ranked }),
  stills({ id: "c3-host-cheat-sheet", title: "Carousel: host cheat sheet", ...PORTRAIT, durationInFrames: 6, component: Cheats }),
  stills({ id: "c4-thanksgiving-playbook", title: "Carousel: Thanksgiving playbook", ...PORTRAIT, durationInFrames: 6, component: ThanksgivingPlaybook }),
];

export const STORIES: Composition[] = [
  stills({ id: "s-story-frames", title: "Story frames", ...REEL, durationInFrames: 8, component: Stories }),
];

export const PROFILE: Composition = stills({
  id: "p-profile-picture",
  title: "Profile picture (Jax icon, mark)",
  width: 1080,
  height: 1080,
  durationInFrames: 2,
  component: ProfilePicture,
});
