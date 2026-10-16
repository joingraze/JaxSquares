// The squares grid: team bands along the axes, drawn digits (sticky when
// zoomed), and one button per square. Fit mode shows the whole board at phone
// width; zoom mode magnifies it inside the same square frame and pans.

import { memo, useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import type { Game } from "../../../shared/types";
import { CheckIcon, MinusIcon, TrophyIcon } from "../../components/icons";
import { cx } from "../../components/ui";
import { contrastText, initialsOf } from "../../lib/format";
import type { CellView } from "./boardModel";
import "./board.css";

export interface BoardProps {
  game: Pick<Game, "teamX" | "teamY" | "format">;
  cells: CellView[][];
  axis: { x: string[]; y: string[]; drawn: boolean };
  /** Squares are being claimed: empty squares look tappable. */
  open: boolean;
  zoom: boolean;
  /** Keys to spotlight (a tapped result); everything else dims. */
  spotlight: ReadonlySet<string> | null;
  picking: boolean;
  /** Board is over: non-winning squares step back. */
  final: boolean;
  /** Square to center when zooming in. */
  focusKey: string | null;
  /** Small control at the right end of the top band (the zoom toggle). */
  accessory?: ReactNode;
  onTap: (row: number, col: number, el: HTMLButtonElement) => void;
}

const ZOOM_CELL = 52;
const ZOOM_GAP = 4;
const ZOOM_AXIS = 28;

export function Board({ game, cells, axis, open, zoom, spotlight, picking, final, focusKey, onTap, accessory }: BoardProps) {
  const n = cells.length;
  const scrollerRef = useRef<HTMLDivElement>(null);
  const [fitHeight, setFitHeight] = useState<number | null>(null);
  const [intro, setIntro] = useState(true);

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

  // Zooming in: center the square that matters (selection, mine, live).
  useLayoutEffect(() => {
    const el = scrollerRef.current;
    if (!el || !zoom) return;
    const [row, col] = (focusKey ?? `${Math.floor(n / 2)},${Math.floor(n / 2)}`).split(",").map(Number);
    const step = ZOOM_CELL + ZOOM_GAP;
    const x = ZOOM_AXIS + ZOOM_GAP + col * step + ZOOM_CELL / 2 - el.clientWidth / 2;
    const y = ZOOM_AXIS + ZOOM_GAP + row * step + ZOOM_CELL / 2 - el.clientHeight / 2;
    el.scrollTo({ left: Math.max(0, x), top: Math.max(0, y) });
    // Only when entering zoom; later focus changes shouldn't yank the view.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [zoom]);

  const pair = game.format.boardSize === 25;
  const roomy = zoom || n <= 5;
  const hotX = new Set<number>();
  const hotY = new Set<number>();
  for (const line of cells) for (const c of line) if (c.live) {
    hotX.add(c.col);
    hotY.add(c.row);
  }

  return (
    <div className={cx("grid grid-cols-[14px_minmax(0,1fr)] gap-0.5", accessory ? "grid-rows-[32px_auto]" : "grid-rows-[18px_auto]")}>
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
        style={zoom && fitHeight ? { height: fitHeight } : undefined}
      >
        <div
          role="group"
          aria-label={`Board: ${game.teamX.name} across the top, ${game.teamY.name} down the side`}
          className={cx("jx-board", intro && "jx-board-intro")}
          data-size={n}
          data-zoom={zoom}
          data-open={open}
          data-spot={spotlight ? "true" : "false"}
          data-picking={picking}
          data-final={final}
          style={{ "--n": n } as CSSProperties}
        >
          <div className="jx-corner" aria-hidden />
          {axis.x.map((label, i) => (
            <div
              key={`x${i}`}
              aria-hidden
              className="jx-axis jx-axis-x"
              data-blank={!axis.drawn}
              data-pair={pair}
              data-hot={hotX.has(i)}
              style={{ "--i": i } as CSSProperties}
            >
              {label}
            </div>
          ))}
          {cells.map((line, row) => (
            <Row key={row} index={row} label={axis.y[row]} drawn={axis.drawn} pair={pair} hot={hotY.has(row)}>
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
  else if (c.selected === "release") who = "Your square, selected to release";
  else if (c.mine) who = "Your square";
  else if (c.ownerId) who = `${c.owner?.name ?? "Someone"}'s square`;
  else who = "Open square";
  const wins = c.wins.length ? `. Won ${c.wins.map((w) => (w.reverse ? `${w.label} reverse` : w.label)).join(", ")}` : "";
  const live = c.live ? ". Winning right now" : "";
  return `${who}, ${where}${wins}${live}`;
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
    const winLabel = cell.wins.length ? cell.wins[cell.wins.length - 1].label : null;
    return (
      <button
        type="button"
        data-testid="cell"
        data-row={cell.row}
        data-col={cell.col}
        data-state={cell.state}
        data-mine={cell.mine}
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
            <span>{owner?.emoji || initialsOf(owner?.name ?? "?")}</span>
          </span>
        )}
        {cell.selected === "release" && (
          <span aria-hidden className="absolute inset-0 grid place-items-center">
            <span className="grid h-[58%] w-[58%] place-items-center rounded-full bg-danger-500 text-white shadow-[0_2px_8px_rgb(0_0_0/0.4)]">
              <MinusIcon size={16} strokeWidth={3.4} />
            </span>
          </span>
        )}
        {roomy && showSticker && (
          <span aria-hidden className="jx-cell-name">
            {cell.mine ? "You" : (owner?.name ?? "")}
          </span>
        )}
        {roomy && winLabel && (
          <span aria-hidden className="jx-wintag">
            {winLabel}
          </span>
        )}
        {cell.wins.length > 0 && !roomy && (
          <span aria-hidden className="jx-wincount">
            {cell.wins.length > 1 ? `×${cell.wins.length}` : <TrophyIcon size={9} filled />}
          </span>
        )}
        {cell.wins.length > 1 && roomy && (
          <span aria-hidden className="jx-wincount">
            ×{cell.wins.length}
          </span>
        )}
        {cell.live && roomy && (
          <span aria-hidden className="jx-livetag">
            NOW
          </span>
        )}
      </button>
    );
  },
  (a, b) => a.sig === b.sig && a.spot === b.spot && a.roomy === b.roomy && a.label === b.label && a.onTap === b.onTap,
);
