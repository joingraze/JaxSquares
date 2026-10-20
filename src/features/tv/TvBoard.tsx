// The board for a TV: read-only, sized to the screen (tvLayout), team bands in
// the teams' colors, the drawn digits big on both edges, and each square's
// owner by first name (or initials) on their color. The square the score
// points at right now glows; earlier winners keep a gold ring and a trophy.

import { memo, type CSSProperties } from "react";
import type { Game } from "../../../shared/types";
import { TrophyIcon } from "../../components/icons";
import { cx } from "../../components/ui";
import { shortTeam } from "../../lib/format";
import type { CellView } from "../board/boardModel";
import { tvCellName, type TvLayout } from "./tvModel";

export interface TvBoardProps {
  game: Pick<Game, "teamX" | "teamY" | "league" | "status">;
  cells: CellView[][];
  axis: { x: string[]; y: string[]; drawn: boolean };
  layout: TvLayout;
  /** How the square in play reads: live (red) or the last recorded score (volt). */
  nowKind: "live" | "projected" | null;
}

/** "Q1", "Half", "#3" for an every-score entry. */
function shortWin(label: string): string {
  const m = /^score\s+(\d+)$/i.exec(label);
  return m ? `#${m[1]}` : label;
}

export function TvBoard({ game, cells, axis, layout, nowKind }: TvBoardProps) {
  const n = cells.length;
  const hotX = new Set<number>();
  const hotY = new Set<number>();
  for (const line of cells) for (const c of line) if (c.live) {
    hotX.add(c.col);
    hotY.add(c.row);
  }
  const style = {
    "--n": n,
    "--band": `${layout.band}px`,
    "--axis": `${layout.axis}px`,
    "--cell": `${layout.cell}px`,
    "--gap": `${layout.gap}px`,
  } as CSSProperties;
  return (
    <div
      role="group"
      aria-label={`Board: ${game.teamX.name} across the top, ${game.teamY.name} down the side`}
      data-testid="tv-board"
      data-size={n}
      data-drawn={axis.drawn}
      data-final={game.status === "final"}
      data-now={nowKind ?? "none"}
      className="tv-board"
      style={style}
    >
      <div className="tv-band tv-band-x" aria-hidden>
        <span>{shortTeam(game.teamX, game.league)}</span>
      </div>
      <div className="tv-band tv-band-y" aria-hidden>
        <span>{shortTeam(game.teamY, game.league)}</span>
      </div>
      {axis.drawn ? (
        <>
          {axis.x.map((label, i) => (
            <div key={`x${i}`} aria-hidden className="tv-axis tv-axis-x" data-hot={hotX.has(i)} style={{ gridColumn: i + 3 } as CSSProperties}>
              {label}
            </div>
          ))}
          {axis.y.map((label, i) => (
            <div key={`y${i}`} aria-hidden className="tv-axis tv-axis-y" data-hot={hotY.has(i)} style={{ gridRow: i + 3 } as CSSProperties}>
              {label}
            </div>
          ))}
        </>
      ) : (
        // Before the draw: one quiet line instead of a row of question marks.
        <>
          <div className="tv-axis-strip tv-axis-strip-x" data-testid="tv-predraw">
            <span>Numbers get drawn when the host locks the board</span>
          </div>
          <div className="tv-axis-strip tv-axis-strip-y" aria-hidden />
        </>
      )}
      {cells.flat().map((cell) => (
        <TvSquare key={cell.key} cell={cell} size={layout.cell} sig={signature(cell)} />
      ))}
    </div>
  );
}

function signature(c: CellView): string {
  const o = c.owner;
  return [c.state, c.ownerId ?? "", o ? `${o.name}|${o.color}` : "", c.wins.map((w) => w.periodKey + (w.reverse ? "r" : "")).join(","), c.live ? "L" : "", c.liveReverse ? "R" : ""].join("~");
}

const TvSquare = memo(
  function TvSquare({ cell, size }: { cell: CellView; size: number; sig: string }) {
    const owner = cell.owner;
    const label = owner ? tvCellName(owner.name, size) : cell.ownerId ? tvCellName("?", size) : null;
    const lastWin = cell.wins.at(-1) ?? null;
    return (
      <div
        data-testid="tv-cell"
        data-row={cell.row}
        data-col={cell.col}
        data-state={cell.state === "mine" ? "taken" : cell.state}
        data-live={cell.live || undefined}
        data-live-reverse={cell.liveReverse || undefined}
        className={cx("tv-cell", label?.initials && "tv-cell-initials")}
        style={{ "--p": owner?.color ?? "#45594c", gridRow: cell.row + 3, gridColumn: cell.col + 3 } as CSSProperties}
      >
        {label && (
          <span className="tv-name" style={{ fontSize: label.size }}>
            {label.text}
          </span>
        )}
        {lastWin && (
          <span className="tv-pip" aria-hidden>
            <TrophyIcon size={Math.max(10, Math.round(size * 0.16))} filled />
            <span>{cell.wins.length > 1 ? `×${cell.wins.length}` : shortWin(lastWin.label)}</span>
          </span>
        )}
      </div>
    );
  },
  (a, b) => a.sig === b.sig && a.size === b.size,
);
