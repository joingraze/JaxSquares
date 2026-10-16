// The squares grid: team bands along the axes, drawn digits (sticky when
// zoomed), and one button per square. Fit mode shows the whole board at phone
// width; zoom mode magnifies it inside the same square frame and pans on whole
// squares. A two-finger pinch zooms in and out. The square the score points at
// right now leads the board; earlier winners shrink to trophy pips.

import { memo, useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import type { Game } from "../../../shared/types";
import { CheckIcon, MinusIcon, TrophyIcon } from "../../components/icons";
import { cx } from "../../components/ui";
import { contrastText } from "../../lib/format";
import type { CellView } from "./boardModel";
import "./board.css";

/** A short note pinned to one square: whose it is, or why a tap didn't take. */
export interface BoardCallout {
  key: string;
  tone?: "neutral" | "win" | "brand" | "warn";
  children: ReactNode;
}

export interface BoardProps {
  game: Pick<Game, "teamX" | "teamY" | "format">;
  cells: CellView[][];
  axis: { x: string[]; y: string[]; drawn: boolean };
  /** Squares are being claimed: empty squares look tappable. */
  open: boolean;
  zoom: boolean;
  /** Keys to spotlight (a tapped result, a player's squares); everything else dims. */
  spotlight: ReadonlySet<string> | null;
  picking: boolean;
  /** Board is over: winners take the gold, everything else steps back. */
  final: boolean;
  /** Square to center when zooming in. */
  focusKey: string | null;
  /** How the "now" square reads: red and pulsing during a live game, white when it's the last recorded score. */
  nowKind?: "live" | "projected" | null;
  callout?: BoardCallout | null;
  /** Small control at the right end of the top band (the zoom toggle). */
  accessory?: ReactNode;
  /** Two-finger pinch: spreading zooms in (on the square under the fingers), pinching fits the board. */
  onPinch?: (zoomIn: boolean) => void;
  onTap: (row: number, col: number, el: HTMLButtonElement) => void;
}

/** Whole columns visible when zoomed (cell size follows from the board width). */
const ZOOM_COLUMNS = 6;

export function Board({
  game,
  cells,
  axis,
  open,
  zoom,
  spotlight,
  picking,
  final,
  focusKey,
  nowKind = null,
  callout = null,
  onTap,
  onPinch,
  accessory,
}: BoardProps) {
  const n = cells.length;
  const wrapRef = useRef<HTMLDivElement>(null);
  const scrollerRef = useRef<HTMLDivElement>(null);
  const boardRef = useRef<HTMLDivElement>(null);
  const [fitHeight, setFitHeight] = useState<number | null>(null);
  const [intro, setIntro] = useState(true);
  const pinchFocus = useRef<string | null>(null);
  const zoomRef = useRef(zoom);
  zoomRef.current = zoom;
  const onPinchRef = useRef(onPinch);
  onPinchRef.current = onPinch;

  useEffect(() => {
    const t = setTimeout(() => setIntro(false), 1100);
    return () => clearTimeout(t);
  }, []);

  // Remember the fit-mode height so zooming keeps the same square footprint.
  useLayoutEffect(() => {
    const el = scrollerRef.current;
    if (!el || zoom) return;
    const update = () => setFitHeight(el.offsetHeight);
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, [zoom, n]);

  // Zooming in: frame the square that matters (pinch point, selection, now, mine) on whole squares.
  useLayoutEffect(() => {
    const el = scrollerRef.current;
    const board = boardRef.current;
    if (!el || !board || !zoom) return;
    const key = pinchFocus.current ?? focusKey ?? `${Math.floor(n / 2)},${Math.floor(n / 2)}`;
    pinchFocus.current = null;
    const [row, col] = key.split(",").map(Number);
    const first = board.querySelector<HTMLElement>('[data-row="0"][data-col="0"]');
    const right = board.querySelector<HTMLElement>('[data-row="0"][data-col="1"]');
    const below = board.querySelector<HTMLElement>('[data-row="1"][data-col="0"]');
    if (!first || !right || !below) return;
    const stepX = right.offsetLeft - first.offsetLeft;
    const stepY = below.offsetTop - first.offsetTop;
    const visCols = Math.max(1, Math.floor((el.clientWidth - first.offsetLeft + 1) / stepX));
    const visRows = Math.max(1, Math.floor((el.clientHeight - first.offsetTop + 1) / stepY));
    const firstCol = Math.min(Math.max(0, col - Math.floor((visCols - 1) / 2)), Math.max(0, n - visCols));
    const firstRow = Math.min(Math.max(0, row - Math.floor((visRows - 1) / 2)), Math.max(0, n - visRows));
    el.scrollTo({ left: firstCol * stepX, top: firstRow * stepY });
    // Only when entering zoom; later focus changes shouldn't yank the view.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [zoom]);

  // Pinch to zoom (the page itself doesn't pinch here: touch-action on the wrapper).
  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    let start: { d: number; x: number; y: number } | null = null;
    let fired = false;
    const dist = (t: TouchList) => Math.hypot(t[0].clientX - t[1].clientX, t[0].clientY - t[1].clientY);
    const onStart = (e: TouchEvent) => {
      if (e.touches.length !== 2) return;
      start = {
        d: Math.max(1, dist(e.touches)),
        x: (e.touches[0].clientX + e.touches[1].clientX) / 2,
        y: (e.touches[0].clientY + e.touches[1].clientY) / 2,
      };
      fired = false;
    };
    const onMove = (e: TouchEvent) => {
      if (!start || fired || e.touches.length !== 2 || !onPinchRef.current) return;
      const ratio = dist(e.touches) / start.d;
      if (ratio > 1.2 && !zoomRef.current) {
        fired = true;
        const hit = document.elementFromPoint(start.x, start.y)?.closest<HTMLElement>('[data-testid="cell"]');
        pinchFocus.current = hit ? `${hit.dataset.row},${hit.dataset.col}` : null;
        onPinchRef.current(true);
      } else if (ratio < 0.83 && zoomRef.current) {
        fired = true;
        onPinchRef.current(false);
      }
    };
    const onEnd = (e: TouchEvent) => {
      if (e.touches.length < 2) start = null;
    };
    el.addEventListener("touchstart", onStart, { passive: true });
    el.addEventListener("touchmove", onMove, { passive: true });
    el.addEventListener("touchend", onEnd, { passive: true });
    el.addEventListener("touchcancel", onEnd, { passive: true });
    return () => {
      el.removeEventListener("touchstart", onStart);
      el.removeEventListener("touchmove", onMove);
      el.removeEventListener("touchend", onEnd);
      el.removeEventListener("touchcancel", onEnd);
    };
  }, []);

  const pair = game.format.boardSize === 25;
  const roomy = zoom || n <= 5;
  const hotX = new Set<number>();
  const hotY = new Set<number>();
  for (const line of cells) for (const c of line) if (c.live) {
    hotX.add(c.col);
    hotY.add(c.row);
  }
  const calloutCell = callout ? cells.flat().find((c) => c.key === callout.key) : undefined;
  const calloutRef = useRef<HTMLDivElement>(null);

  // Keep the callout on screen: slide it sideways (the pointer stays on the square).
  useLayoutEffect(() => {
    const el = calloutRef.current;
    if (!el) return;
    el.style.setProperty("--dx", "0px");
    // Measure unscaled (it pops in from 90%): the center is the same either way.
    const r = el.getBoundingClientRect();
    const center = r.left + r.width / 2;
    const left = center - el.offsetWidth / 2;
    const right = center + el.offsetWidth / 2;
    const edge = 10;
    const vw = document.documentElement.clientWidth;
    const dx = left < edge ? edge - left : right > vw - edge ? vw - edge - right : 0;
    el.style.setProperty("--dx", `${Math.round(dx)}px`);
  }, [callout, zoom]);

  return (
    <div
      ref={wrapRef}
      className={cx("jx-board-wrap grid grid-cols-[14px_minmax(0,1fr)] gap-0.5", accessory ? "grid-rows-[32px_auto]" : "grid-rows-[18px_auto]")}
    >
      <div aria-hidden />
      <div className="relative flex min-w-0 items-center">
        <div className={cx("flex min-w-0 flex-1 items-center", !!accessory && "px-[4.5rem]")}>
          <TeamBand axis="x" name={game.teamX.name} />
        </div>
        {accessory && <div className="absolute inset-y-0 right-0 flex items-center">{accessory}</div>}
      </div>
      <TeamBand axis="y" name={game.teamY.name} />
      <div
        ref={scrollerRef}
        className={cx("jx-board-scroller", zoom ? "overflow-auto scrollbar-none" : "overflow-visible")}
        data-zoom={zoom}
        style={zoom && fitHeight ? { height: fitHeight } : undefined}
      >
        <div
          ref={boardRef}
          role="group"
          aria-label={`Board: ${game.teamX.name} across the top, ${game.teamY.name} down the side`}
          className={cx("jx-board", intro && "jx-board-intro")}
          data-size={n}
          data-zoom={zoom}
          data-open={open}
          data-spot={spotlight ? "true" : "false"}
          data-picking={picking}
          data-final={final}
          data-now={nowKind ?? "none"}
          data-drawn={axis.drawn}
          style={{ "--n": n, "--zoom-cols": ZOOM_COLUMNS } as CSSProperties}
        >
          <div className="jx-corner" aria-hidden />
          {axis.drawn ? (
            axis.x.map((label, i) => (
              <div
                key={`x${i}`}
                aria-hidden
                className="jx-axis jx-axis-x"
                data-pair={pair}
                data-hot={hotX.has(i)}
                style={{ "--i": i } as CSSProperties}
              >
                {label}
              </div>
            ))
          ) : (
            // Before the draw: one quiet line instead of a row of question marks.
            <div className="jx-axis-strip" style={{ gridColumn: `2 / span ${n}` }}>
              <span>Numbers get drawn when the host locks the board</span>
            </div>
          )}
          {cells.map((line, row) => (
            <Row key={row} index={row} label={axis.drawn ? axis.y[row] : ""} drawn={axis.drawn} pair={pair} hot={hotY.has(row)}>
              {line.map((cell) => (
                <Square
                  key={cell.key}
                  cell={cell}
                  sig={signature(cell)}
                  spot={spotlight?.has(cell.key) ?? false}
                  roomy={roomy}
                  label={cellLabel(cell, game, axis)}
                  onTap={onTap}
                />
              ))}
            </Row>
          ))}
          {callout && calloutCell && (
            <div
              key={callout.key}
              ref={calloutRef}
              role="status"
              className="jx-callout"
              data-tone={callout.tone ?? "neutral"}
              data-side={calloutCell.row < 2 ? "below" : "above"}
              style={{ "--r": calloutCell.row, "--c": calloutCell.col } as CSSProperties}
            >
              {callout.children}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function Row({
  index,
  label,
  drawn,
  pair,
  hot,
  children,
}: {
  index: number;
  label: string;
  drawn: boolean;
  pair: boolean;
  hot: boolean;
  children: ReactNode;
}) {
  // `display: contents` keeps one CSS grid for the whole board.
  return (
    <div className="contents">
      <div
        aria-hidden
        className="jx-axis jx-axis-y"
        data-blank={!drawn}
        data-pair={pair}
        data-hot={hot}
        style={{ "--i": index } as CSSProperties}
      >
        {label}
      </div>
      {children}
    </div>
  );
}

function TeamBand({ axis, name }: { axis: "x" | "y"; name: string }) {
  return (
    <div
      aria-hidden
      className={cx(
        "flex min-w-0 flex-1 items-center justify-center gap-2 overflow-hidden",
        axis === "x" ? "jx-band-x" : "jx-band-y",
      )}
    >
      <span className="h-px flex-1 bg-current opacity-35" />
      <span className="eyebrow max-w-[70%] truncate">{name}</span>
      <span className="h-px flex-1 bg-current opacity-35" />
    </div>
  );
}

function signature(c: CellView): string {
  const o = c.owner;
  return [
    c.state,
    c.ownerId ?? "",
    o ? `${o.name}|${o.color}|${o.emoji}` : "",
    c.selected ?? "",
    c.wins.map((w) => `${w.periodKey}${w.reverse ? "r" : ""}`).join(","),
    c.live ? "L" : "",
    c.liveReverse ? "R" : "",
    c.mine ? "M" : "",
  ].join("~");
}

function cellLabel(c: CellView, game: BoardProps["game"], axis: BoardProps["axis"]): string {
  const where = axis.drawn
    ? `${game.teamX.abbr || game.teamX.name} ${axis.x[c.col]}, ${game.teamY.abbr || game.teamY.name} ${axis.y[c.row]}`
    : `row ${c.row + 1}, column ${c.col + 1}`;
  let who: string;
  if (c.selected === "claim") who = "Selected";
  else if (c.selected === "release") who = "Your square, selected to give back";
  else if (c.mine) who = "Your square";
  else if (c.ownerId) who = `${c.owner?.name ?? "Someone"}'s square`;
  else who = "Open square";
  const wins = c.wins.length ? `. Won ${c.wins.map((w) => (w.reverse ? `${w.label} reverse` : w.label)).join(", ")}` : "";
  const live = c.live ? ". The score points here right now" : "";
  return `${who}, ${where}${wins}${live}`;
}

/** First name, as short as a square can hold. */
function shortName(name: string): string {
  return name.trim().split(/\s+/)[0] ?? "";
}

/** "Q1", "Half", or "#3" for an every-score entry ("Score 3"). */
function shortWin(label: string): string {
  const m = /^score\s+(\d+)$/i.exec(label);
  return m ? `#${m[1]}` : label;
}

interface SquareProps {
  cell: CellView;
  /** Everything that affects rendering, so memo can skip unchanged squares. */
  sig: string;
  spot: boolean;
  roomy: boolean;
  label: string;
  onTap: BoardProps["onTap"];
}

const Square = memo(
  function Square({ cell, spot, roomy, label, onTap }: SquareProps) {
    const owner = cell.owner;
    const color = owner?.color ?? "#45594c";
    const style = {
      "--p": color,
      "--pi": contrastText(color),
      "--r": cell.row,
      "--c": cell.col,
    } as CSSProperties;
    const showSticker = cell.ownerId !== null && cell.selected !== "claim";
    const name = cell.mine ? "You" : shortName(owner?.name ?? "");
    const lastWin = cell.wins.length ? cell.wins[cell.wins.length - 1] : null;
    return (
      <button
        type="button"
        data-testid="cell"
        data-row={cell.row}
        data-col={cell.col}
        data-state={cell.state}
        data-mine={cell.mine}
        data-named={showSticker || undefined}
        data-release={cell.selected === "release" || undefined}
        data-live={cell.live || undefined}
        data-live-reverse={cell.liveReverse || undefined}
        data-spot={spot || undefined}
        aria-label={label}
        aria-pressed={cell.selected ? true : undefined}
        onClick={(e) => onTap(cell.row, cell.col, e.currentTarget)}
        className={cx("jx-cell", roomy && "jx-cell-roomy")}
        style={style}
      >
        {cell.selected === "claim" && <CheckIcon className="jx-check" strokeWidth={3.2} />}
        {showSticker && (
          <span className="jx-sticker" data-initials={!owner?.emoji} aria-hidden>
            <span>{owner?.emoji || [...(owner?.name.trim() || "?")][0].toUpperCase()}</span>
          </span>
        )}
        {cell.selected === "release" && (
          <span aria-hidden className="absolute inset-0 grid place-items-center">
            <span className="grid h-[58%] w-[58%] place-items-center rounded-full bg-danger-500 text-white shadow-[0_2px_8px_rgb(0_0_0/0.4)]">
              <MinusIcon size={16} strokeWidth={3.4} />
            </span>
          </span>
        )}
        {showSticker && name && (
          <span aria-hidden className="jx-cell-name">
            {name}
          </span>
        )}
        {lastWin && (
          <span aria-hidden className="jx-pip">
            <TrophyIcon size={roomy ? 10 : 8} filled />
            {roomy && <span>{cell.wins.length > 1 ? `×${cell.wins.length}` : shortWin(lastWin.label)}</span>}
            {!roomy && cell.wins.length > 1 && <span>{cell.wins.length}</span>}
          </span>
        )}
      </button>
    );
  },
  (a, b) => a.sig === b.sig && a.spot === b.spot && a.roomy === b.roomy && a.label === b.label && a.onTap === b.onTap,
);
