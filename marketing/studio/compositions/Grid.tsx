// The launch grid: nine posts that turn the profile into the JaxSquares mark,
// a 3×3 board in volt with the winning square in gold (src/components/ui/Logo.tsx).
// Each tile is a whole board square that reads on its own in the feed, and each
// post is a carousel whose second slide shows the real app behind its claim.
// Instagram fills the grid newest-first from the top left, so these are the
// account's first nine posts, bottom-right first, one row a day.

import type { Composition, CompProps } from "../types";
import { BRAND, COLORS, PORTRAIT, REEL } from "../brand";
import { ClipCrop } from "../components/Phone";
import { Panel } from "../components/Layout";
import { ASSETS } from "../lib/assets";
import { seeded } from "../lib/anim";
import type { Scene } from "../lib/clips";
import { Centered, REST, Shell, StoryShell, Title } from "./Slides";
import { Headline } from "../components/Text";
import { Lockup } from "../components/Brand";
import { Jax } from "../../../src/components/ui";

const TILE_W = 360;
const TILE_H = 480;
/** The board's gutter: half of it on each side of every tile. */
const MARGIN = 20;

type Art = { emoji: string } | { jax: true } | { trophy: true } | { url: true } | { digits: true };

interface Crop {
  scene: Scene;
  at: number;
  y0: number;
  y1: number;
}

export interface GridTile {
  id: string;
  /** Post order, 1 = first posted (bottom right). */
  order: number;
  row: number;
  col: number;
  art: Art;
  headline: string;
  sub: string;
  /** The launch Reel this tile is the cover of (r-grid-covers): what the strip under the tile says. */
  watch: string;
  proof?: { title: string; crops: Crop[]; note: string; width?: number } | { title: string; steps: string[] };
}

export const GRID: GridTile[] = [
  {
    id: "g1-jaxsquares-is-live",
    order: 1,
    row: 2,
    col: 2,
    art: { url: true },
    headline: "JaxSquares is live.",
    sub: "The squares app for football and basketball games.",
    watch: "How it works in 30 seconds",
    proof: {
      title: "What's *JaxSquares?*",
      steps: [
        "Pick a football or basketball game",
        "Text your crew one link. They pick squares from their phone.",
        "Jax draws the numbers. Live scores call every winner.",
      ],
    },
  },
  {
    id: "g2-scores-update-themselves",
    order: 2,
    row: 2,
    col: 1,
    art: { emoji: "📺" },
    headline: "Scores update themselves.",
    sub: "NFL, NBA and college games score on their own.",
    watch: "One score, every phone",
    proof: {
      title: "Live scores, *built in*",
      crops: [{ scene: "live", at: 30, y0: 100, y1: 372 }],
      note: "The board always knows who's winning, and what's next.",
    },
  },
  {
    id: "g3-jax-draws-the-numbers",
    order: 3,
    row: 2,
    col: 0,
    art: { digits: true },
    headline: "Jax draws the numbers.",
    sub: "Shuffled live, in front of everyone.",
    watch: "POV: you hit Draw",
    proof: {
      title: "Shuffled live. *No hat.*",
      crops: [{ scene: "draw", at: 250, y0: 120, y1: 620 }],
      note: "0–9 for each team, drawn the moment the board locks.",
      width: 262,
    },
  },
  {
    id: "g4-your-square-hits",
    order: 4,
    row: 1,
    col: 2,
    art: { trophy: true },
    headline: "Your square hits.",
    sub: "Winners light up as the game goes.",
    watch: "Winners light up",
    proof: {
      title: "Winners called *for you*",
      crops: [{ scene: "live", at: 100, y0: 100, y1: 560 }],
      note: "Prizes are whatever you say: wings, dish duty, bragging rights.",
      width: 268,
    },
  },
  {
    id: "g5-meet-jax",
    order: 5,
    row: 1,
    col: 1,
    art: { jax: true },
    headline: "Meet Jax.",
    sub: "JaxSquares is named after him.",
    watch: "Let Jax pick",
    proof: {
      title: "Can't decide? *Let Jax pick.*",
      crops: [{ scene: "jax", at: 150, y0: 262, y1: 760 }],
      note: "He grabs random open squares for you. No favorites.",
      width: 262,
    },
  },
  {
    id: "g6-text-one-link",
    order: 6,
    row: 1,
    col: 0,
    art: { emoji: "💬" },
    headline: "Text one link.",
    sub: "Everyone picks from their own phone.",
    watch: "Every squares group chat",
    proof: {
      title: "One link in the *group chat*",
      crops: [{ scene: "create", at: 300, y0: 172, y1: 652 }],
      note: "No spreadsheet. No whiteboard photo. No “who has row 4?”",
      width: 272,
    },
  },
  {
    id: "g7-free-to-set-up",
    order: 7,
    row: 0,
    col: 2,
    art: { emoji: "✨" },
    headline: "Free to set up.",
    sub: "Players never pay a thing.",
    watch: "Squares board speedrun",
    proof: {
      title: "Free to set up *and invite*",
      crops: [
        { scene: "create", at: 175, y0: 452, y1: 556 },
        { scene: "create", at: 175, y0: 826, y1: 930 },
      ],
      note: "Players never pay. Up to 5 players draw free; bigger boards are $4.99 for the host (or one Host Pass).",
    },
  },
  {
    id: "g8-no-app-needed",
    order: 8,
    row: 0,
    col: 1,
    art: { emoji: "📲" },
    headline: "No app needed.",
    sub: "Tap the link or scan the code.",
    watch: "Join from the link",
    proof: {
      title: "No download. *No account.*",
      crops: [{ scene: "invite", at: 180, y0: 160, y1: 690 }],
      note: "Friends tap the link and pick. Same room? They scan the code.",
      width: 262,
    },
  },
  {
    id: "g9-football-and-basketball",
    order: 9,
    row: 0,
    col: 0,
    art: { emoji: "🏈🏀" },
    headline: "Football and basketball squares.",
    sub: "Set up in 30 seconds. Live now.",
    watch: "Basketball squares",
    proof: {
      title: "Football or basketball. *Your pick.*",
      crops: [{ scene: "create", at: 10, y0: 118, y1: 560 }],
      note: "NFL, NBA and college games score themselves. Or type in any matchup.",
      width: 270,
    },
  },
];

/** The mark's fills: checkered volt, the winning square in gold. */
function fillOf(t: GridTile): { bg: string; shade: string } {
  if (t.row === 1 && t.col === 2) return { bg: COLORS.gold, shade: "#f2ad12" };
  return (t.row + t.col) % 2 ? { bg: COLORS.voltDeep, shade: "#9ccc00" } : { bg: COLORS.volt, shade: "#b5e816" };
}

const INK = COLORS.canvas;

function TileArt({ art }: { art: Art }) {
  if ("jax" in art) return <Jax pose="sit" size={176} />;
  if ("digits" in art) {
    // The draw as the app shows it: 0–9 shuffled for each team, in the axis colors.
    const rows = [
      { color: COLORS.sky, digits: [7, 0, 3, 9, 4] },
      { color: COLORS.flare, digits: [2, 8, 5, 1, 6] },
    ];
    return (
      <div
        className="flex flex-col"
        style={{ gap: 6, padding: 14, borderRadius: 26, background: INK, boxShadow: "inset 0 -5px 0 rgba(255,255,255,0.06), 0 10px 24px rgba(6,12,9,0.25)" }}
      >
        {rows.map((r) => (
          <div key={r.color} className="flex" style={{ gap: 6 }}>
            {r.digits.map((d) => (
              <span
                key={d}
                className="display grid place-items-center"
                style={{
                  width: 36,
                  height: 36,
                  borderRadius: 9,
                  fontSize: 22,
                  color: "#fff",
                  background: r.color,
                  boxShadow: "inset 0 -3px 0 rgba(0,0,0,0.18), inset 0 2px 0 rgba(255,255,255,0.3)",
                }}
              >
                {d}
              </span>
            ))}
          </div>
        ))}
      </div>
    );
  }
  if ("url" in art) {
    return (
      <div className="flex flex-col items-center" style={{ gap: 14 }}>
        <img src={ASSETS.mark} alt="" style={{ width: 92, height: 92, filter: "drop-shadow(0 8px 16px rgba(6,12,9,0.25))" }} />
        <span className="display" style={{ padding: "10px 18px", borderRadius: 999, background: INK, color: COLORS.volt, fontSize: 22, letterSpacing: "-0.02em" }}>
          {BRAND.url}
        </span>
      </div>
    );
  }
  const emoji = "trophy" in art ? "🏆" : art.emoji;
  return (
    <span
      className="grid place-items-center rounded-full"
      style={{
        width: 128,
        height: 128,
        background: INK,
        fontSize: [...emoji].length > 1 ? 46 : 68,
        boxShadow: "inset 0 -5px 0 rgba(255,255,255,0.06), 0 10px 24px rgba(6,12,9,0.25)",
      }}
    >
      <span style={{ transform: "translateY(3px)", letterSpacing: 2 }}>{emoji}</span>
    </span>
  );
}

/** The 3×3 mark in miniature, with this tile's square lit. */
function MiniMap({ tile }: { tile: GridTile }) {
  return (
    <div className="grid" style={{ gridTemplateColumns: "repeat(3, 11px)", gap: 3 }}>
      {Array.from({ length: 9 }, (_, i) => {
        const here = Math.floor(i / 3) === tile.row && i % 3 === tile.col;
        return <span key={i} style={{ width: 11, height: 11, borderRadius: 3, background: here ? INK : "rgba(6,12,9,0.18)" }} />;
      })}
    </div>
  );
}

/** Confetti for the winning square, in the app's colors (deterministic). */
function GoldConfetti() {
  const rnd = seeded(9);
  const colors = [INK, "#ffffff", COLORS.flare, COLORS.sky, COLORS.volt];
  return (
    <>
      {Array.from({ length: 26 }, (_, i) => {
        const x = 30 + rnd() * 260;
        const y = 50 + rnd() * 180; // clear of the label
        const w = 5 + rnd() * 6;
        return (
          <span
            key={i}
            className="absolute"
            style={{
              left: x,
              top: y,
              width: w,
              height: w * (0.45 + rnd() * 0.5),
              borderRadius: rnd() > 0.6 ? 999 : 2,
              background: colors[i % colors.length],
              opacity: 0.8,
              transform: `rotate(${rnd() * 180}deg)`,
            }}
          />
        );
      })}
    </>
  );
}

/** One square of the launch grid, 360×480 (1080×1440). */
export function Tile({ tile }: { tile: GridTile }) {
  const { bg, shade } = fillOf(tile);
  return (
    <div className="absolute inset-0" style={{ background: COLORS.canvas, width: TILE_W, height: TILE_H }}>
      <div
        className="absolute overflow-hidden"
        style={{
          left: MARGIN,
          top: MARGIN,
          width: TILE_W - 2 * MARGIN,
          height: TILE_H - 2 * MARGIN,
          borderRadius: 64,
          background: `linear-gradient(170deg, ${bg} 55%, ${shade})`,
          boxShadow: "inset 0 -8px 0 rgba(0,0,0,0.12), inset 0 5px 0 rgba(255,255,255,0.35)",
        }}
      >
        {"trophy" in tile.art && <GoldConfetti />}
        <div className="absolute inset-x-0 flex justify-center" style={{ top: 26 }}>
          {/* The brand, not the posting order: on the finished grid the order would read backwards. */}
          <span style={{ fontSize: 10.5, fontWeight: 800, letterSpacing: "0.22em", color: "rgba(6,12,9,0.6)" }}>
            JAXSQUARES
          </span>
        </div>
        <div className="absolute inset-x-0 flex flex-col items-center" style={{ top: "jax" in tile.art ? 58 : 76, padding: "0 22px" }}>
          <TileArt art={tile.art} />
          <div
            className="display text-center"
            style={{ marginTop: "jax" in tile.art ? 10 : 24, fontSize: tile.headline.length > 26 ? 31 : tile.headline.length > 18 ? 34 : 40, lineHeight: 0.98, color: INK }}
          >
            {tile.headline}
          </div>
          <div className="text-center" style={{ marginTop: 10, fontSize: 15, fontWeight: 600, lineHeight: 1.3, color: "rgba(6,12,9,0.72)", textWrap: "balance" }}>
            {tile.sub}
          </div>
        </div>
        <div className="absolute inset-x-0 flex justify-center" style={{ bottom: 24 }}>
          <MiniMap tile={tile} />
        </div>
      </div>
    </div>
  );
}

/** A tile drawn at `width` px (it keeps its 3:4 shape). */
function TileAt({ tile, width }: { tile: GridTile; width: number }) {
  return (
    <div className="relative overflow-hidden" style={{ width, height: (width * TILE_H) / TILE_W }}>
      <div className="absolute left-0 top-0" style={{ width: TILE_W, height: TILE_H, transform: `scale(${width / TILE_W})`, transformOrigin: "top left" }}>
        <Tile tile={tile} />
      </div>
    </div>
  );
}

/** Slide 2: the real app behind the tile's claim. */
function Proof({ tile }: { tile: GridTile }) {
  const p = tile.proof!;
  return (
    <Shell index={1} total={2} tint={tile.row === 1 && tile.col === 2 ? "gold" : "volt"}>
      <Title text={p.title} top={58} size={26} highlight={tile.row === 1 && tile.col === 2 ? COLORS.gold : undefined} />
      {"steps" in p ? (
        <div className="absolute flex flex-col" style={{ top: 132, left: 22, right: 22, gap: 10 }}>
          {p.steps.map((s, i) => (
            <Panel key={s} style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 14px", borderRadius: 16 }}>
              <span className="display grid shrink-0 place-items-center rounded-full" style={{ width: 30, height: 30, fontSize: 16, background: COLORS.volt, color: INK }}>
                {i + 1}
              </span>
              <span style={{ fontSize: 15, fontWeight: 600, lineHeight: 1.3 }}>{s}</span>
            </Panel>
          ))}
          <div className="flex flex-col items-center" style={{ marginTop: 20, gap: 8 }}>
            <span className="display" style={{ borderRadius: 16, padding: "12px 26px", fontSize: 20, background: COLORS.volt, color: INK }}>
              {BRAND.url}
            </span>
            <span style={{ fontSize: 12, fontWeight: 600, color: COLORS.subtle }}>Link in bio · Free to set up</span>
          </div>
        </div>
      ) : (
        <div className="absolute inset-x-0 flex flex-col items-center" style={{ top: 118, gap: 10 }}>
          {p.crops.map((c, i) => (
            <ClipCrop key={i} scene={c.scene} at={c.at} y0={c.y0} y1={c.y1} width={cropWidth(p)} />
          ))}
          <p className="text-center" style={{ margin: "6px 30px 0", fontSize: 13.5, fontWeight: 600, lineHeight: 1.35, color: COLORS.muted }}>
            {p.note}
          </p>
        </div>
      )}
    </Shell>
  );
}

/** Crops share one width that keeps them (and the note under them) clear of the page dots. */
function cropWidth(p: { crops: Crop[]; width?: number }): number {
  const pts = p.crops.reduce((sum, c) => sum + c.y1 - c.y0, 0);
  return Math.min(p.width ?? 290, (262 * 440) / pts);
}

function makeTilePost(tile: GridTile) {
  return function TilePost({ frame }: CompProps) {
    return frame === 0 ? <Tile tile={tile} /> : <Proof tile={tile} />;
  };
}

// ---------------------------------------------------------------- previews

/** The launch grid as the profile shows it: 3 columns, hairline gutters, newest at the top left. */
function GridBoard({ width, upTo = 9 }: { width: number; upTo?: number }) {
  const gap = 2;
  const w = (width - 2 * gap) / 3;
  const h = (w * TILE_H) / TILE_W;
  return (
    <div style={{ width }}>
      <div className="grid" style={{ gridTemplateColumns: `repeat(3, ${w}px)`, gap }}>
        {Array.from({ length: 9 }, (_, i) => {
          const tile = GRID.find((t) => t.row * 3 + t.col === i)!;
          return tile.order <= upTo ? (
            <TileAt key={i} tile={tile} width={w} />
          ) : (
            <OpenSquare key={i} width={w} height={h} />
          );
        })}
      </div>
    </div>
  );
}

/** An unclaimed square, as the app draws one: dark, with a "+". */
function OpenSquare({ width, height }: { width: number; height: number }) {
  const m = (MARGIN * width) / TILE_W;
  return (
    <div className="relative" style={{ width, height, background: COLORS.canvas }}>
      <div
        className="absolute grid place-items-center"
        style={{
          inset: m,
          borderRadius: (64 * width) / TILE_W,
          background: "rgba(243,247,241,0.05)",
          border: `${Math.max(1, width / 120)}px dashed rgba(243,247,241,0.22)`,
          color: "rgba(243,247,241,0.45)",
          fontSize: width * 0.3,
          fontWeight: 300,
        }}
      >
        +
      </div>
    </div>
  );
}

/** The profile once the grid is up: the picture, the name, the nine squares. */
function GridPreview() {
  return (
    <div className="absolute inset-0" style={{ background: "#000" }}>
      <div className="absolute flex items-center" style={{ left: 18, top: 22, gap: 14 }}>
        {/* p-profile-picture/01 as Instagram crops it: the icon at 81% on the dark gradient, in a circle. */}
        <span
          className="grid place-items-center overflow-hidden rounded-full"
          style={{ width: 74, height: 74, background: `linear-gradient(180deg, ${COLORS.surface2}, ${COLORS.canvas})` }}
        >
          <img src={ASSETS.icon} alt="" style={{ width: "81.5%", height: "81.5%" }} />
        </span>
        <div>
          <div style={{ fontSize: 16, fontWeight: 800 }}>{BRAND.handle.slice(1)}</div>
          <div style={{ fontSize: 13, color: "rgba(255,255,255,0.75)" }}>JaxSquares · Sports Squares</div>
          <div style={{ fontSize: 12, color: "rgba(255,255,255,0.55)" }}>Sports & Recreation</div>
        </div>
      </div>
      <div className="absolute" style={{ left: 4, top: 116 }}>
        <GridBoard width={352} />
      </div>
    </div>
  );
}

/** Story frames as the board fills up: after squares 3, 6 and 9. */
function GridStories({ frame: i }: CompProps) {
  const steps = [
    { upTo: 3, title: "The board is *open.*", sub: "3 of 9 squares claimed. A new one every day: watch our grid fill up 🟩" },
    { upTo: 6, title: "6 of 9 squares *claimed* 👀", sub: "Three to go. Next one drops tomorrow." },
    { upTo: 9, title: "Board's *full.* 🟩", sub: "That's our logo, by the way. Make your board: link in bio." },
  ];
  const s = steps[i];
  return (
    <StoryShell>
      <Headline frame={REST} text={s.title} size={34} style={{ position: "absolute", top: 118, left: 20, right: 20 }} />
      <Centered top={186}>
        <GridBoard width={258} upTo={s.upTo} />
      </Centered>
      <p className="absolute text-center" style={{ top: 548, left: 34, right: 34, fontSize: 15, fontWeight: 600, lineHeight: 1.35, color: COLORS.muted }}>
        {s.sub}
      </p>
    </StoryShell>
  );
}

/** Highlight covers: Instagram shows the middle as a circle, so the icon sits dead center. */
const HIGHLIGHTS = [
  { name: "How it works", mark: true },
  { name: "Square stats", emoji: "📊" },
  { name: "Game days", emoji: "🏈" },
  { name: "Thanksgiving", emoji: "🦃" },
];

function HighlightCovers({ frame: i }: CompProps) {
  const h = HIGHLIGHTS[i];
  return (
    <div className="absolute inset-0 grid place-items-center" style={{ background: COLORS.canvas }}>
      <span
        className="grid place-items-center rounded-full"
        style={{
          width: 230,
          height: 230,
          background: `linear-gradient(170deg, ${COLORS.volt} 55%, #b5e816)`,
          boxShadow: "inset 0 -8px 0 rgba(0,0,0,0.12), inset 0 5px 0 rgba(255,255,255,0.35)",
        }}
      >
        {h.mark ? (
          <span className="grid place-items-center rounded-full" style={{ width: 132, height: 132, background: COLORS.canvas }}>
            <img src={ASSETS.mark} alt="" style={{ width: 92, height: 92 }} />
          </span>
        ) : (
          <span style={{ fontSize: 110, lineHeight: 1, transform: "translateY(4px)" }}>{h.emoji}</span>
        )}
      </span>
    </div>
  );
}

/**
 * The launch grid as Reel covers (1080×1920): each tile sits in the middle 3:4, the part the
 * profile grid shows, so nine Reels make the logo. Above and below only show in full-screen views.
 */
function GridCovers({ frame: i }: CompProps) {
  const tile = GRID.find((t) => t.order === i + 1)!;
  const gold = "trophy" in tile.art;
  return (
    <div className="absolute inset-0" style={{ background: COLORS.canvas }}>
      <div
        className="absolute inset-0"
        style={{ background: `radial-gradient(260px 200px at 50% 50%, ${gold ? "rgba(255,194,51,.16)" : "rgba(214,255,120,.12)"}, transparent 70%)` }}
      />
      <div className="absolute inset-x-0 flex justify-center" style={{ top: 30 }}>
        <Lockup size={20} />
      </div>
      <div className="absolute left-0" style={{ top: 80, width: TILE_W, height: TILE_H }}>
        <Tile tile={tile} />
      </div>
      <div className="absolute inset-x-0 flex justify-center" style={{ top: 576 }}>
        <span
          className="inline-flex items-center rounded-full"
          style={{ gap: 7, padding: "7px 14px", fontSize: 14, fontWeight: 700, background: "rgba(255,255,255,0.08)", color: COLORS.ink, border: `1px solid ${COLORS.lineStrong}` }}
        >
          <span style={{ color: gold ? COLORS.gold : COLORS.volt }}>▶</span>
          {tile.watch}
        </span>
      </div>
    </div>
  );
}

const stills = (c: Omit<Composition, "fps" | "kind">): Composition => ({ fps: 30, kind: "stills", ...c });

export const GRID_POSTS: Composition[] = [
  ...GRID.filter((t) => t.proof).map((t) =>
    stills({ id: t.id, title: `Grid ${t.order}/9: ${t.headline}`, ...PORTRAIT, durationInFrames: 2, component: makeTilePost(t) }),
  ),
  stills({ id: "g-grid-preview", title: "Launch grid: profile preview", ...REEL, durationInFrames: 1, component: GridPreview }),
  stills({ id: "r-grid-covers", title: "Launch grid: Reel covers (9)", ...REEL, durationInFrames: 9, component: GridCovers }),
  stills({ id: "s-grid-progress", title: "Story frames: the grid fills up", ...REEL, durationInFrames: 3, component: GridStories }),
  stills({ id: "p-highlight-covers", title: "Highlight covers (4)", ...REEL, durationInFrames: 4, component: HighlightCovers }),
];
