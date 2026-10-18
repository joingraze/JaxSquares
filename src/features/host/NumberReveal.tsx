// The number draw, shown to the host who pulled the lever: a mini board whose
// axis headers spin like slot reels while the draw happens, then land one by
// one (team X left to right, then team Y top to bottom), each with a tick of
// haptics, and finish with confetti in the team colors. Every square keeps its
// owner's emoji so the group can see whose square got which numbers, and the
// host's own squares are the brightest thing on screen. Everyone else simply
// sees their board update live. Reduced motion: the digits just appear.

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { createPortal } from "react-dom";
import type { Game, NumberDraw, Player, Square } from "../../../shared/types";
import { cellKey, gridSize } from "../../../shared/squares";
import { CheckIcon, ShareIcon, XIcon } from "../../components/icons";
import { Button, IconButton, LiveDot, TeamMark, celebrate, cx, prefersReducedMotion, useBottomChrome } from "../../components/ui";
import { lockBackground } from "../../components/ui/modalLock";
import { readableTeamColor, teamVars } from "../../lib/format";
import { haptic } from "../../lib/native";
import { landingOrder, numbersFor } from "./hostModel";
import { useResolvedTheme } from "../../lib/theme";

export interface NumberRevealProps {
  game: Pick<Game, "name" | "teamX" | "teamY" | "format">;
  squares: Square[];
  players: Player[];
  /** This device's public player id (its squares get a volt ring). */
  me: string;
  /** The draw to land on; null while the lock request is in flight. */
  draw: NumberDraw | null;
  /** e.g. "Q1 numbers" when every quarter gets its own draw. */
  drawLabel?: string | null;
  onClose: () => void;
  onShare: () => void;
}

/** Spin at least this long so the draw feels like a draw, even on a fast network. */
const MIN_SPIN_MS = 1100;
const STAGGER_MS = 95;
/** "Your numbers" chips before the rest fold into "and N more". */
const MAX_CHIPS = 10;
const LAND_MS = 720;
const CYCLE = 10;

export function NumberReveal({ game, squares, players, me, draw, drawLabel, onClose, onShare }: NumberRevealProps) {
  const theme = useResolvedTheme();
  const n = gridSize(game.format.boardSize);
  const pair = n === 5;
  const reduced = useMemo(() => prefersReducedMotion(), []);
  const s = useCellSize(n);
  const fs = pair ? Math.round(s * 0.36) : Math.round(s * 0.6);

  const strips = useRef(new Map<string, HTMLSpanElement>());
  const spins = useRef(new Map<string, Animation>());
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const startedAt = useRef(performance.now());
  const [landed, setLanded] = useState<ReadonlySet<string>>(() => new Set());
  const [done, setDone] = useState(false);
  const landing = useRef(false);
  const closeRef = useRef<HTMLButtonElement>(null);
  const footerRef = useRef<HTMLDivElement>(null);
  const [footerH, setFooterH] = useState(0);

  // Background lock (the app root goes inert under the overlay).
  useLayoutEffect(() => lockBackground(), []);

  // Toasts (e.g. "Copied") land above the buttons, not on them. Modal: the tab dock under the overlay doesn't count.
  useLayoutEffect(() => {
    const el = footerRef.current;
    if (!el) return;
    const update = () => setFooterH(el.offsetHeight);
    update();
    if (typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  useBottomChrome(footerH > 0 ? `${footerH}px` : null, true);
  useEffect(() => () => timers.current.forEach(clearTimeout), []);

  // Spin every reel (out of phase with each other) until the draw lands.
  useLayoutEffect(() => {
    if (reduced) return;
    for (const [id, el] of strips.current) {
      if (typeof el.animate !== "function") continue;
      const anim = el.animate([{ transform: "translateY(0)" }, { transform: `translateY(${-CYCLE * s}px)` }], {
        duration: 380 + Math.random() * 160,
        iterations: Infinity,
        iterationStart: Math.random(),
        easing: "linear",
      });
      spins.current.set(id, anim);
    }
    const current = spins.current;
    return () => {
      for (const a of current.values()) a.cancel();
      current.clear();
    };
  }, [reduced, s]);

  const digitsOf = useCallback(
    (axis: "x" | "y", index: number): number[] => (draw ? (axis === "x" ? draw.x[index] : draw.y[index]) ?? [] : []),
    [draw],
  );

  const landReel = useCallback(
    (id: string, digit: number, animate: boolean) => {
      const el = strips.current.get(id);
      if (!el) return;
      const target = -(2 * CYCLE + digit) * s;
      const spin = spins.current.get(id);
      let from = 0;
      const m = /matrix.*\((.+)\)/.exec(getComputedStyle(el).transform);
      if (m) from = Number(m[1].split(",")[5]) || 0;
      spin?.cancel();
      spins.current.delete(id);
      el.dataset.spinning = "false";
      if (!animate || typeof el.animate !== "function") {
        el.style.transform = `translateY(${target}px)`;
        return;
      }
      el.animate(
        [
          { transform: `translateY(${from}px)` },
          { transform: `translateY(${target - s * 0.22}px)`, offset: 0.8 },
          { transform: `translateY(${target}px)` },
        ],
        { duration: LAND_MS, easing: "cubic-bezier(0.2, 0.75, 0.3, 1)", fill: "forwards" },
      );
    },
    [s],
  );

  const finish = useCallback(() => {
    setDone(true);
    void haptic("success");
    void celebrate("cannons", {
      colors: [readableTeamColor(game.teamX.color, "#3ab7ff"), readableTeamColor(game.teamY.color, "#ff66a6"), "#c6f91f", "#ffc233", "#ffffff"],
    });
  }, [game.teamX.color, game.teamY.color]);

  const landAll = useCallback(
    (animate: boolean) => {
      const all = new Set<string>();
      for (const step of landingOrder(n)) {
        const id = `${step.axis}${step.index}`;
        all.add(id);
        digitsOf(step.axis, step.index).forEach((d, k) => landReel(`${id}-${k}`, d, animate));
      }
      setLanded(all);
    },
    [n, digitsOf, landReel],
  );

  // The draw arrived: land the reels in order.
  useEffect(() => {
    if (!draw || landing.current) return;
    landing.current = true;
    if (reduced) {
      landAll(false);
      setDone(true);
      void haptic("success");
      return;
    }
    const wait = Math.max(0, MIN_SPIN_MS - (performance.now() - startedAt.current));
    const order = landingOrder(n);
    order.forEach((step, i) => {
      timers.current.push(
        setTimeout(() => {
          const id = `${step.axis}${step.index}`;
          digitsOf(step.axis, step.index).forEach((d, k) => landReel(`${id}-${k}`, d, true));
          setLanded((prev) => new Set(prev).add(id));
          void haptic(i === order.length - 1 ? "medium" : "selection");
        }, wait + i * STAGGER_MS),
      );
    });
    timers.current.push(setTimeout(finish, wait + (order.length - 1) * STAGGER_MS + LAND_MS));
  }, [draw, reduced, n, digitsOf, landReel, landAll, finish]);

  useEffect(() => {
    if (done) closeRef.current?.focus({ preventScroll: true });
  }, [done]);

  const skip = () => {
    if (!draw || done) return;
    timers.current.forEach(clearTimeout);
    timers.current = [];
    landAll(false);
    finish();
  };

  const owners = useMemo(() => new Map(squares.map((q) => [cellKey(q.row, q.col), q.playerId])), [squares]);
  const people = useMemo(() => new Map(players.map((p) => [p.id, p])), [players]);
  // My squares' numbers: "?" chips while drawing, filled in once everything lands (same size, so nothing jumps).
  const mineCount = squares.filter((q) => q.playerId === me).length;
  const mine = draw && done ? numbersFor({ squares }, draw, me) : Array.from({ length: mineCount }, (_, i) => ({ key: `p${i}`, x: "?", y: "?" }));
  // Two tidy rows of chips; past that, the second row ends with "and N more".
  const shown = mine.length > MAX_CHIPS ? mine.slice(0, MAX_CHIPS - 2) : mine;
  const more = mine.length - shown.length;
  const taken = squares.length;
  const abbr = (t: { abbr?: string; name: string }) => t.abbr || t.name;
  const xLanded = Array.from({ length: n }, (_, i) => landed.has(`x${i}`)).every(Boolean);
  const status = done
    ? "Numbers locked in"
    : !draw
      ? "Jax is shuffling…"
      : xLanded
        ? `Drawing ${abbr(game.teamY)} numbers…`
        : `Drawing ${abbr(game.teamX)} numbers…`;

  const reel = (axis: "x" | "y", index: number) => {
    const id = `${axis}${index}`;
    const isLanded = landed.has(id);
    const count = pair ? 2 : 1;
    return (
      <span key={id} className="hx-axis" data-axis={axis} data-landed={isLanded}>
        {Array.from({ length: count }, (_, k) => (
          <span key={k} className="hx-reel">
            <span
              ref={(el) => {
                if (el) strips.current.set(`${id}-${k}`, el);
                else strips.current.delete(`${id}-${k}`);
              }}
              className="hx-strip"
              data-spinning={!reduced}
              aria-hidden
            >
              {Array.from({ length: CYCLE * 3 + 1 }, (_, i) => (
                <span key={i}>{reduced && !isLanded ? "?" : i % CYCLE}</span>
              ))}
            </span>
          </span>
        ))}
      </span>
    );
  };

  const vars = {
    ...teamVars(game.teamX, game.teamY, theme),
    "--n": n,
    "--s": `${s}px`,
    "--fs": `${fs}px`,
    "--gap": `${pair ? 5 : 3}px`,
  } as CSSProperties;

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="hx-reveal-title"
      style={vars}
      // Above sheets (z-50), under toasts (z-70) so "Link copied" shows over it. The header (with
      // its close button) and the footer stay put; only the middle scrolls on a short screen.
      className="hx-reveal fixed inset-0 z-[60] flex flex-col pt-safe"
      onKeyDown={(e) => {
        if (e.key === "Escape") onClose();
      }}
    >
      <div className="flex h-12 shrink-0 items-center justify-between gap-2 pl-4 pr-2">
        <span className="eyebrow flex min-w-0 items-center gap-2 text-ink-muted">
          {done ? <CheckIcon size={14} strokeWidth={3.2} className="text-ink-brand" /> : <LiveDot tone="gold" />}
          {status}
        </span>
        <span className="flex shrink-0 items-center gap-1">
          {!done && draw && !reduced && (
            <button type="button" onClick={skip} className="pressable rounded-full px-3 py-1.5 text-footnote font-bold text-ink-muted hover:text-ink">
              Skip
            </button>
          )}
          {/* Always a way back to the board, even mid-shuffle: the draw is already saved. */}
          <IconButton data-testid="reveal-close" label="Back to the board" icon={<XIcon size={20} />} onClick={onClose} />
        </span>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
        <div className="flex min-h-full flex-col items-center justify-center gap-5 px-4 py-2">
          <div className="text-center">
            <h2 id="hx-reveal-title" className="font-display text-title-1 font-extrabold text-ink">
              {done ? "The numbers are in!" : "Shuffling the numbers"}
            </h2>
            <p className="mt-1.5 text-subhead text-ink-muted" aria-live="polite">
              {done ? "Jax shuffled them. Everyone on the board sees them now." : `Random 0–9 for each team · ${taken} ${taken === 1 ? "square" : "squares"} in play`}
            </p>
          </div>

          <div className="flex w-full flex-col items-center gap-2.5">
            <div className="flex flex-wrap items-center justify-center gap-x-3 gap-y-1.5 text-footnote font-bold text-ink-muted">
              <span className="flex items-center gap-1.5">
                <TeamMark team={game.teamX} size="sm" />
                across
              </span>
              <span aria-hidden className="text-ink-subtle">·</span>
              <span className="flex items-center gap-1.5">
                <TeamMark team={game.teamY} size="sm" />
                down
              </span>
              {mineCount > 0 && (
                <>
                  <span aria-hidden className="text-ink-subtle">·</span>
                  <span className="flex items-center gap-1.5">
                    <span aria-hidden className="hx-legend-mine" />
                    yours
                  </span>
                </>
              )}
            </div>

            <div className={cx("hx-grid", done && "hx-done")} aria-hidden>
              <span />
              {Array.from({ length: n }, (_, i) => reel("x", i))}
              {Array.from({ length: n }, (_, row) => [
                reel("y", row),
                ...Array.from({ length: n }, (_, col) => {
                  const owner = owners.get(cellKey(row, col)) ?? null;
                  const person = owner ? people.get(owner) : undefined;
                  return (
                    <span
                      key={`${row}-${col}`}
                      className="hx-sq"
                      data-owned={owner !== null}
                      data-mine={owner === me}
                      style={{ "--p": person?.color ?? "#45594c", "--i": row * n + col } as CSSProperties}
                    >
                      {person ? <span className="hx-sq-face">{person.emoji || person.name.slice(0, 1).toUpperCase()}</span> : null}
                    </span>
                  );
                }),
              ])}
            </div>
            {drawLabel && <p className="text-caption font-semibold text-ink-subtle">{drawLabel}</p>}
          </div>

          <p className="sr-only" aria-live="assertive">
            {done && draw
              ? `${game.teamX.name}: ${draw.x.map((d) => d.join(" and ")).join(", ")}. ${game.teamY.name}: ${draw.y.map((d) => d.join(" and ")).join(", ")}.`
              : ""}
          </p>

          {mine.length > 0 && (
            <div className="flex w-full max-w-sm flex-col items-center gap-2">
              <p className="eyebrow text-ink-subtle">Your numbers</p>
              <div className="flex flex-wrap justify-center gap-1.5">
                {shown.map((nb) => (
                  <span key={nb.key} className={cx("flex h-8 items-center gap-1 rounded-full bg-surface-2 p-0.5 pr-1 ring-1 ring-inset ring-line-strong", done && "animate-pop")}>
                    <span className="grid h-7 min-w-7 place-items-center rounded-full bg-team-x px-1.5 font-display text-subhead font-extrabold text-team-x-ink">{nb.x}</span>
                    <span className="grid h-7 min-w-7 place-items-center rounded-full bg-team-y px-1.5 font-display text-subhead font-extrabold text-team-y-ink">{nb.y}</span>
                  </span>
                ))}
                {more > 0 && (
                  <span className="flex h-8 items-center rounded-full bg-surface-2 px-3 text-footnote font-bold text-ink-muted ring-1 ring-inset ring-line-strong">
                    and {more} more
                  </span>
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      <div ref={footerRef} className="shrink-0 px-4 pb-[max(var(--safe-bottom),1rem)] pt-2">
        <div className={cx("flex flex-col gap-1 transition-opacity duration-300", done ? "opacity-100" : "pointer-events-none opacity-0")}>
          <Button ref={closeRef} data-testid="reveal-done" size="lg" block haptic="medium" onClick={onClose} tabIndex={done ? 0 : -1}>
            See the board
          </Button>
          <Button variant="ghost" size="md" block leading={<ShareIcon size={18} />} onClick={onShare} tabIndex={done ? 0 : -1}>
            Tell the group chat
          </Button>
        </div>
      </div>
    </div>,
    document.body,
  );
}

/** Square size that fits the grid (axis + n squares) in the phone's width. */
function useCellSize(n: number): number {
  const compute = () => {
    const w = typeof window === "undefined" ? 390 : window.innerWidth;
    const avail = Math.min(w - 32, 420);
    const gap = n === 5 ? 5 : 3;
    return Math.max(18, Math.min(n === 5 ? 58 : 34, Math.floor((avail - gap * n) / (n + 1))));
  };
  const [s, setS] = useState(compute);
  useEffect(() => {
    const onResize = () => setS(compute());
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [n]);
  return s;
}
