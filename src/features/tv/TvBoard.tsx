// The board for a TV: the app's board (src/features/board, board.css), drawn
// as large as the screen allows. Same team labels, same team-tinted digits,
// same squares (each owner's sticker on their color, first name underneath),
// same gold for winners and the same glow on the square the score points at.
// Only what a room needs differs: sizes from tvLayout (tv.css scales the
// board's fixed bits), nothing to tap, nothing "mine" (the TV is nobody's),
// and a square's name sized to read from across the room (tvCellName).

import { memo, type CSSProperties } from "react";
import type { Game } from "../../../shared/types";
import { TrophyIcon } from "../../components/icons";
import { cx } from "../../components/ui";
import { contrastText, shortTeam } from "../../lib/format";
import type { CellView } from "../board/boardModel";
import "../board/board.css";
import { tvCellName, type TvLayout } from "./tvModel";

export interface TvBoardProps {
  game: Pick<Game, "teamX" | "teamY" | "league" | "status" | "format"> & Partial<Pick<Game, "sport">>;
  cells: CellView[][];
  axis: { x: string[]; y: string[]; drawn: boolean };
  layout: TvLayout;
  /** How the square in play reads: live (red) or the last recorded score. */
  nowKind: "live" | "projected" | null;
}

/** "Q1", "Half", "#3" for an every-score entry (a soccer goal's too). */
function shortWin(label: string): string {
  const m = /^(?:score|goal)\s+(\d+)$/i.exec(label);
  return m ? `#${m[1]}` : label;
}

export function TvBoard({ game, cells, axis, layout, nowKind }: TvBoardProps) {
  const n = cells.length;
  const pair = game.format.boardSize === 25;
  const open = game.status === "open" || game.status === "draft";
  const hotX = new Set<number>();
  const hotY = new Set<number>();
  for (const line of cells) for (const c of line) if (c.live) {
    hotX.add(c.col);
    hotY.add(c.row);
  }
  const sizes = {
    "--band": `${layout.band}px`,
    "--axis": `${layout.axis}px`,
    "--cell": `${layout.cell}px`,
    "--gap": `${layout.gap}px`,
  } as CSSProperties;
  return (
    <div className="tv-board" style={sizes} data-testid="tv-board" data-drawn={axis.drawn} data-final={game.status === "final"}>
      <div aria-hidden />
      {/* A soccer board's squares are minutes: its bands name the minute's ones and tens. */}
      <TeamBand axis="x" name={game.sport === "soccer" ? "Minute · ones" : shortTeam(game.teamX, game.league)} />
      <TeamBand axis="y" name={game.sport === "soccer" ? "Minute · tens" : shortTeam(game.teamY, game.league)} />
      <div
        role="group"
        aria-label={`Board: ${game.teamX.name} across the top, ${game.teamY.name} down the side`}
        className="jx-board tv-jx"
        data-size={n}
        data-open={open}
        data-spot="false"
        data-picking="false"
        data-final={game.status === "final"}
        data-now={nowKind ?? "none"}
        data-drawn={axis.drawn}
        style={{ ...sizes, "--n": n } as CSSProperties}
      >
        <div className="jx-corner" aria-hidden />
        {axis.drawn ? (
          axis.x.map((label, i) => (
            <div key={`x${i}`} aria-hidden className="jx-axis jx-axis-x" data-pair={pair} data-hot={hotX.has(i)} style={{ "--i": i } as CSSProperties}>
              {label}
            </div>
          ))
        ) : (
          // Before the draw: one quiet line instead of a row of question marks, as on the board.
          <div className="jx-axis-strip" data-testid="tv-predraw" style={{ gridColumn: `2 / span ${n}` }}>
            <span>Numbers get drawn when the host locks the board</span>
          </div>
        )}
        {cells.map((line, row) => (
          <div key={row} className="contents">
            <div
              aria-hidden
              className="jx-axis jx-axis-y"
              data-blank={!axis.drawn}
              data-pair={pair}
              data-hot={hotY.has(row)}
              style={{ "--i": row } as CSSProperties}
            >
              {axis.drawn ? axis.y[row] : ""}
            </div>
            {line.map((cell) => (
              <TvSquare key={cell.key} cell={cell} size={layout.cell} sig={signature(cell)} />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

/** The board's team label: the name between two rules, in the team's color. */
function TeamBand({ axis, name }: { axis: "x" | "y"; name: string }) {
  return (
    <div aria-hidden className={cx("tv-team-band", axis === "x" ? "jx-band-x" : "jx-band-y")} data-testid={`tv-band-${axis}`}>
      <span className="tv-team-rule" />
      <span className="tv-team-name-label">{name}</span>
      <span className="tv-team-rule" />
    </div>
  );
}

function signature(c: CellView): string {
  const o = c.owner;
  return [c.state, c.ownerId ?? "", o ? `${o.name}|${o.color}|${o.emoji}` : "", c.wins.map((w) => w.periodKey + (w.reverse ? "r" : "")).join(","), c.live ? "L" : "", c.liveReverse ? "R" : ""].join("~");
}

const TvSquare = memo(
  function TvSquare({ cell, size }: { cell: CellView; size: number; sig: string }) {
    const owner = cell.owner;
    const color = owner?.color ?? "#45594c";
    const named = cell.ownerId !== null;
    const name = named ? tvCellName(owner?.name ?? "", size) : null;
    const lastWin = cell.wins.at(-1) ?? null;
    return (
      <div
        data-testid="tv-cell"
        data-row={cell.row}
        data-col={cell.col}
        // The TV is nobody's: a square someone holds is just taken.
        data-state={cell.state === "mine" ? "taken" : cell.state}
        data-mine={false}
        data-named={named || undefined}
        data-live={cell.live || undefined}
        data-live-reverse={cell.liveReverse || undefined}
        className="jx-cell"
        style={{ "--p": color, "--pi": contrastText(color), "--r": cell.row, "--c": cell.col } as CSSProperties}
      >
        {named && (
          <span className="jx-sticker" data-initials={!owner?.emoji} aria-hidden>
            <span>{owner?.emoji || [...(owner?.name.trim() || "?")][0].toUpperCase()}</span>
          </span>
        )}
        {name && (
          <span className="jx-cell-name" style={{ fontSize: name.size }}>
            {name.text}
          </span>
        )}
        {lastWin && (
          <span aria-hidden className="jx-pip">
            <TrophyIcon size={Math.max(10, Math.round(size * 0.14))} filled />
            <span>{cell.wins.length > 1 ? `×${cell.wins.length}` : shortWin(lastWin.label)}</span>
          </span>
        )}
      </div>
    );
  },
  (a, b) => a.sig === b.sig && a.size === b.size,
);
