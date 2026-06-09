import { useMemo } from "react";
import type { Game, Square } from "../../shared/types";
import { GRID_SIZE, cellKey } from "../../shared/squares";
import { initialsOf } from "../lib/format";

const RANGE = Array.from({ length: GRID_SIZE }, (_, i) => i);

export interface GridProps {
  game: Game;
  squares: Square[];
  myClientId: string;
  selected: Set<string>;
  /** grid coords (row,col) that won a period, for highlighting. */
  winningCells: Set<string>;
  onCellTap: (row: number, col: number) => void;
}

export function SquaresGrid({
  game,
  squares,
  myClientId,
  selected,
  winningCells,
  onCellTap,
}: GridProps) {
  const byCell = useMemo(() => {
    const m = new Map<string, Square>();
    for (const s of squares) m.set(cellKey(s.row, s.col), s);
    return m;
  }, [squares]);

  const locked = game.status === "locked";
  const colNum = (col: number) => (game.xNumbers ? game.xNumbers[col] : null);
  const rowNum = (row: number) => (game.yNumbers ? game.yNumbers[row] : null);

  return (
    <div className="select-none">
      {/* Team labels */}
      <div className="mb-1 flex items-center justify-between text-xs font-semibold">
        <span className="text-accent-400">↓ {game.teamY}</span>
        <span className="text-gold-400">{game.teamX} →</span>
      </div>

      <div
        className="grid gap-[2px]"
        style={{ gridTemplateColumns: `1.4rem repeat(${GRID_SIZE}, minmax(0, 1fr))` }}
      >
        {/* Corner */}
        <div />
        {/* Column number headers */}
        {RANGE.map((col) => (
          <div
            key={`ch-${col}`}
            className="grid aspect-square place-items-center rounded-md bg-gold-500/15 text-xs font-bold text-gold-300"
          >
            {locked ? colNum(col) : "?"}
          </div>
        ))}

        {RANGE.map((row) => (
          <Row
            key={`r-${row}`}
            row={row}
            rowLabel={locked ? rowNum(row) : "?"}
            byCell={byCell}
            myClientId={myClientId}
            selected={selected}
            winningCells={winningCells}
            locked={locked}
            onCellTap={onCellTap}
          />
        ))}
      </div>
    </div>
  );
}

function Row({
  row,
  rowLabel,
  byCell,
  myClientId,
  selected,
  winningCells,
  locked,
  onCellTap,
}: {
  row: number;
  rowLabel: number | "?" | null;
  byCell: Map<string, Square>;
  myClientId: string;
  selected: Set<string>;
  winningCells: Set<string>;
  locked: boolean;
  onCellTap: (row: number, col: number) => void;
}) {
  return (
    <>
      <div className="grid aspect-square place-items-center rounded-md bg-accent-500/15 text-xs font-bold text-accent-300">
        {rowLabel}
      </div>
      {RANGE.map((col) => {
        const key = cellKey(row, col);
        const sq = byCell.get(key);
        const mine = sq?.clientId === myClientId;
        const isSelected = selected.has(key);
        const isWinner = winningCells.has(key);
        return (
          <button
            key={key}
            type="button"
            onClick={() => onCellTap(row, col)}
            aria-label={sq ? `${sq.playerName}'s square` : `Empty square ${row},${col}`}
            className={cellClass({ sq: !!sq, mine, isSelected, isWinner, locked })}
            style={sq ? { backgroundColor: sq.playerColor, color: "#0b1120" } : undefined}
          >
            <span className="truncate px-0.5 text-[10px] font-bold leading-none">
              {isSelected && !sq ? "✓" : sq ? initialsOf(sq.playerName) : ""}
            </span>
          </button>
        );
      })}
    </>
  );
}

function cellClass({
  sq,
  mine,
  isSelected,
  isWinner,
  locked,
}: {
  sq: boolean;
  mine: boolean;
  isSelected: boolean;
  isWinner: boolean;
  locked: boolean;
}): string {
  const base =
    "relative grid aspect-square place-items-center overflow-hidden rounded-md text-center transition active:scale-95";
  const ring = isWinner
    ? " ring-2 ring-gold-400 ring-offset-1 ring-offset-pitch-950 animate-pop"
    : isSelected
      ? " ring-2 ring-brand-400"
      : mine
        ? " ring-1 ring-white/60"
        : "";
  const fill = sq
    ? ""
    : isSelected
      ? " bg-brand-500/30"
      : locked
        ? " bg-pitch-800"
        : " bg-pitch-700 hover:bg-pitch-600";
  return base + fill + ring;
}
