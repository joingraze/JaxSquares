// The welcome illustration: a little squares board mid-game that also shows
// how squares works. The score bug's last digits (4 and 7) light up the
// matching column and row, and the square where they cross glows gold.
// Friends' squares pop in and toasts slide by. Pure CSS (home.css); still
// under reduced motion.

import type { CSSProperties } from "react";
import { TrophyIcon } from "../../components/icons";
import { cx } from "../../components/ui";
import "./home.css";

const N = 10;
const X_DIGITS = [7, 3, 0, 9, 4, 1, 8, 2, 6, 5];
const Y_DIGITS = [4, 8, 1, 6, 0, 3, 9, 5, 2, 7];
const TEAM_X = "#e31837";
const TEAM_Y = "#2563eb";
/** Muted so the gold winner and your volt squares carry the picture. */
const FRIENDS = ["#ff6b35", "#1fd1c1", "#9b6bff", "#ff4f9a", "#38b6ff"];
/** Score 24-27: X digit 4 is column 4, Y digit 7 is row 9. */
const WIN = { row: 9, col: 4 };
/** Cells that pop in on a loop, in order (negative delays: a few are already in on first paint). */
const POPS = [23, 57, 81, 12, 66, 38, 90, 45, 5, 74];

type Cell = { kind: "empty" | "taken" | "mine" | "win" | "pop"; color?: string; delay?: number };

function hash(i: number): number {
  let h = (i + 1) * 2654435761;
  h ^= h >>> 13;
  return (h >>> 0) % 997;
}

const CELLS: Cell[] = Array.from({ length: N * N }, (_, i) => {
  const row = Math.floor(i / N);
  const col = i % N;
  if (row === WIN.row && col === WIN.col) return { kind: "win" };
  const pop = POPS.indexOf(i);
  if (pop !== -1) return { kind: "pop", color: FRIENDS[pop % FRIENDS.length], delay: -3 + pop * 0.7 };
  const h = hash(i);
  if (h % 10 < 4) return { kind: "empty" };
  if (h % 9 === 0) return { kind: "mine" };
  return { kind: "taken", color: FRIENDS[h % FRIENDS.length] };
});

export function MiniBoard({ className }: { className?: string }) {
  return (
    <div
      aria-hidden
      // As big as the screen allows: everything else on the welcome needs about 27rem of height.
      className={cx("mb-wrap relative mx-auto w-full max-w-[min(24rem,calc(100dvh-27rem))] min-w-[12rem] select-none", className)}
    >
      <div className="mb-glow absolute -inset-10 rounded-full" />

      <div className="mb-board relative rounded-[1.25rem] bg-surface-2 p-2 shadow-float ring-1 ring-inset ring-line-strong">
        <div className="grid grid-cols-[repeat(11,minmax(0,1fr))] gap-[3px]">
          <span className="grid aspect-square place-items-center">
            <span className="h-1.5 w-1.5 rounded-full bg-brand-400" />
          </span>
          {X_DIGITS.map((d, col) => (
            <Axis key={`x${d}`} digit={d} color={TEAM_X} hot={col === WIN.col} />
          ))}
          {Array.from({ length: N }, (_, row) => [
            <Axis key={`y${row}`} digit={Y_DIGITS[row]} color={TEAM_Y} hot={row === WIN.row} />,
            ...CELLS.slice(row * N, row * N + N).map((c, col) => (
              <MiniCell key={`${row}-${col}`} cell={c} lane={row === WIN.row || col === WIN.col} />
            )),
          ])}
        </div>
      </div>

      {/* Live score bug: the last digits are what decide the square. */}
      <div className="mb-bug glass absolute -top-5 left-1/2 flex -translate-x-1/2 items-center gap-2 whitespace-nowrap rounded-full py-1.5 pl-2 pr-3 shadow-float ring-1 ring-inset ring-line-strong">
        <span className="flex items-center gap-1 rounded-full bg-live-500 px-1.5 py-0.5 text-[0.5625rem] font-black uppercase tracking-wider text-white">
          <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-white" />
          Live
        </span>
        <span className="rounded-md px-1 text-[0.625rem] font-black text-white" style={{ background: TEAM_X }}>
          HAW
        </span>
        <span className="font-display text-callout font-extrabold tabular-nums text-ink">
          2<span className="text-ink-gold">4</span>
          <span className="mx-1 text-ink-subtle">–</span>2<span className="text-ink-gold">7</span>
        </span>
        <span className="rounded-md px-1 text-[0.625rem] font-black text-white" style={{ background: TEAM_Y }}>
          RID
        </span>
        <span className="text-[0.625rem] font-bold text-ink-muted">Q3</span>
      </div>

      {/* Activity toasts */}
      <div className="mb-toast mb-toast-a glass absolute -left-3 top-[38%] flex items-center gap-2 rounded-2xl py-1.5 pl-1.5 pr-3 shadow-float ring-1 ring-inset ring-line-strong">
        <span className="grid h-6 w-6 place-items-center rounded-full text-[0.8rem]" style={{ background: "#ff6b35" }}>
          🦊
        </span>
        <span className="text-[0.6875rem] font-bold text-ink">Maya grabbed 3 squares</span>
      </div>
      <div className="mb-toast mb-toast-b absolute -right-3 bottom-[4%] flex items-center gap-2 rounded-2xl bg-gold-400 py-1.5 pl-1.5 pr-3 text-ink-inverse shadow-glow-gold">
        <span className="grid h-6 w-6 place-items-center rounded-full bg-white/40 text-[0.8rem]">🏆</span>
        <span className="text-[0.6875rem] font-extrabold">Your square hits!</span>
      </div>
    </div>
  );
}

function Axis({ digit, color, hot }: { digit: number; color: string; hot: boolean }) {
  return (
    <span
      className={cx(
        "grid aspect-square place-items-center rounded-[5px] font-display text-[0.6875rem] font-extrabold text-white",
        hot ? "relative z-10 scale-110 text-ink-inverse shadow-[0_0_0_2px_var(--color-gold-400),0_0_12px_rgb(255_194_51/0.6)]" : "opacity-85",
      )}
      style={{ background: hot ? "var(--color-gold-400)" : color }}
    >
      {digit}
    </span>
  );
}

function MiniCell({ cell, lane }: { cell: Cell; lane: boolean }) {
  const base = "aspect-square rounded-[5px]";
  const emptyBg = lane ? "bg-gold-400/12 ring-1 ring-inset ring-gold-line/15" : "bg-ink/[0.045] ring-1 ring-inset ring-ink/[0.04]";
  if (cell.kind === "empty") return <span className={cx(base, emptyBg)} />;
  if (cell.kind === "win") {
    return (
      <span className={cx(base, "mb-win relative z-10 grid place-items-center bg-gold-400 text-ink-inverse")}>
        <TrophyIcon size={11} strokeWidth={2.6} />
      </span>
    );
  }
  if (cell.kind === "mine") return <span className={cx(base, "bg-brand-400 shadow-[inset_0_-2px_0_rgb(0_0_0/0.18)]")} />;
  const style: CSSProperties = { background: cell.color };
  if (cell.kind === "pop") {
    return (
      <span className={cx(base, "relative", emptyBg)}>
        <span className="mb-pop absolute inset-0 rounded-[5px] opacity-70" style={{ ...style, animationDelay: `${cell.delay}s` }} />
      </span>
    );
  }
  return <span className={cx(base, lane ? "opacity-90" : "opacity-75", "shadow-[inset_0_-2px_0_rgb(0_0_0/0.18)]")} style={style} />;
}
