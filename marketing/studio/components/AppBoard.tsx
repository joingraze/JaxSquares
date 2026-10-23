import type { CSSProperties, ReactNode } from "react";
import { Board } from "../../../src/features/board/Board";
import type { CellView } from "../../../src/features/board/boardModel";
import { teamVars } from "../../../src/lib/format";
import type { Game, Player } from "../../../shared/types";
import { ME, type Person, type Team } from "../lib/world";

/** The app lays the board out at phone width; the studio scales that to fit. */
const NATURAL = 400;
/** Natural height of a 10×10 board at NATURAL width (band + axis + rows). */
export const BOARD_ASPECT = 404 / 400;

export interface BoardSpec {
  teamX: Team;
  teamY: Team;
  /** Cell key "row,col" → owner. */
  owners?: Map<string, Person>;
  /** Drawn digits (strings, so a rolling digit can be passed mid-draw); null before the draw. */
  axis?: { x: string[]; y: string[] } | null;
  /** The square the score points at right now. */
  live?: string | null;
  nowKind?: "live" | "projected";
  /** Cell key → labels of the moments it won ("Q1", "Half"...). */
  wins?: Map<string, string[]>;
  final?: boolean;
  spotlight?: Set<string> | null;
  /** Squares still open for picking (empties look tappable). */
  open?: boolean;
  /** Keys picked but not yet claimed (volt check). */
  selected?: Set<string>;
}

const noop = () => {};

function player(p: Person): Player {
  return { id: p.name, name: p.name, color: p.color, emoji: p.emoji, joinedAt: 0, isHost: p === ME };
}

function cellsOf(spec: BoardSpec): CellView[][] {
  const rows: CellView[][] = [];
  for (let row = 0; row < 10; row++) {
    const line: CellView[] = [];
    for (let col = 0; col < 10; col++) {
      const key = `${row},${col}`;
      const owner = spec.owners?.get(key) ?? null;
      const mine = owner?.name === ME.name;
      const wins = (spec.wins?.get(key) ?? []).map((label) => ({ periodKey: label.toLowerCase(), label, reverse: false }));
      const selected = !owner && spec.selected?.has(key) ? ("claim" as const) : null;
      line.push({
        row,
        col,
        key,
        state: selected ? "selected" : wins.length ? "winner" : mine ? "mine" : owner ? "taken" : "empty",
        owner: owner ? player(owner) : null,
        ownerId: owner?.name ?? null,
        mine,
        selected,
        wins,
        live: key === spec.live,
        liveReverse: false,
      });
    }
    rows.push(line);
  }
  return rows;
}

/** The app's real board component (src/features/board/Board.tsx), `width` CSS px wide. */
export function AppBoard({ width, style, ...spec }: BoardSpec & { width: number; style?: CSSProperties }) {
  // Board reads only the size and the team names from the game.
  const game: Pick<Game, "teamX" | "teamY" | "format" | "league"> = {
    teamX: spec.teamX,
    teamY: spec.teamY,
    league: "custom",
    format: { boardSize: 100, periods: "quarters", reverse: false, freshNumbers: false },
  };
  const axis = spec.axis ?? null;
  return (
    <div style={{ width, height: width * BOARD_ASPECT, ...style }}>
      <div
        style={{
          width: NATURAL,
          transform: `scale(${width / NATURAL})`,
          transformOrigin: "top left",
          ...teamVars(spec.teamX, spec.teamY, "dark"),
        }}
      >
        <Board
          game={game}
          cells={cellsOf(spec)}
          axis={{ x: axis?.x ?? [], y: axis?.y ?? [], drawn: axis !== null }}
          open={spec.open ?? false}
          zoom={false}
          spotlight={spec.spotlight ?? null}
          picking={false}
          final={spec.final ?? false}
          focusKey={null}
          nowKind={spec.live ? (spec.nowKind ?? "live") : null}
          onTap={noop}
        />
      </div>
    </div>
  );
}

/**
 * A data board in the app's board styling (same grid, axis chips and square
 * shapes) where each square shows a value instead of a player: heat maps,
 * "which square" diagrams.
 */
export function DataBoard({
  width,
  teamX,
  teamY,
  bandX,
  bandY,
  fill,
  label,
  hot,
  ring,
  dim = 0,
  style,
}: {
  width: number;
  teamX: Team;
  teamY: Team;
  /** Band captions (default: team names). */
  bandX?: string;
  bandY?: string;
  /** Background for square (row = team Y digit, col = team X digit). */
  fill?: (row: number, col: number) => string | undefined;
  label?: (row: number, col: number) => ReactNode;
  /** Crosshair digits. */
  hot?: { col: number; row: number } | null;
  /** Squares that glow gold, with 0..1 strength. */
  ring?: Map<string, number>;
  /** 0..1: how far everything without a ring steps back. */
  dim?: number;
  style?: CSSProperties;
}) {
  const digits = Array.from({ length: 10 }, (_, i) => i);
  const band = (axis: "x" | "y", name: string) => (
    <div
      className={`flex min-w-0 flex-1 items-center justify-center gap-2 overflow-hidden ${axis === "x" ? "jx-band-x" : "jx-band-y"}`}
    >
      <span className="h-px flex-1 bg-current opacity-35" />
      <span className="eyebrow max-w-[70%] truncate">{name}</span>
      <span className="h-px flex-1 bg-current opacity-35" />
    </div>
  );
  return (
    <div style={{ width, height: width * BOARD_ASPECT, ...style }}>
      <div
        style={{
          width: NATURAL,
          transform: `scale(${width / NATURAL})`,
          transformOrigin: "top left",
          ...teamVars(teamX, teamY, "dark"),
        }}
      >
        <div className="jx-board-wrap grid grid-cols-[14px_minmax(0,1fr)] grid-rows-[18px_auto] gap-0.5">
          <div />
          <div className="relative flex min-w-0 items-center">{band("x", bandX ?? teamX.name)}</div>
          {band("y", bandY ?? teamY.name)}
          <div className="jx-board-scroller">
            <div className="jx-board" data-size={10} data-drawn style={{ "--n": 10 } as CSSProperties}>
              <div className="jx-corner" />
              {digits.map((d) => (
                <div key={`x${d}`} className="jx-axis jx-axis-x" data-hot={hot?.col === d} style={{ "--i": d } as CSSProperties}>
                  {d}
                </div>
              ))}
              {digits.map((row) => (
                <div key={row} className="contents">
                  <div className="jx-axis jx-axis-y" data-hot={hot?.row === row} style={{ "--i": row } as CSSProperties}>
                    {row}
                  </div>
                  {digits.map((col) => {
                    const g = ring?.get(`${row},${col}`) ?? 0;
                    const bg = fill?.(row, col);
                    return (
                      <div
                        key={col}
                        className="jx-cell"
                        style={{
                          background: g > 0 ? `color-mix(in srgb, #ffc233 ${Math.round(g * 100)}%, ${bg ?? "transparent"})` : bg,
                          opacity: g > 0 ? 1 : 1 - dim * 0.75,
                          boxShadow: g > 0 ? `0 0 ${18 * g}px rgba(255,194,51,${0.7 * g}), inset 0 0 0 2px rgba(255,214,107,${g})` : undefined,
                          transform: g > 0 ? `scale(${1 + 0.12 * g})` : undefined,
                          zIndex: g > 0 ? 5 : undefined,
                        }}
                      >
                        {label?.(row, col)}
                      </div>
                    );
                  })}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/** Center of square (row, col) of a 10×10 board drawn `width` px wide, relative to its top-left. */
export function cellCenter(row: number, col: number, width: number): { x: number; y: number } {
  const k = width / NATURAL;
  const cell = (NATURAL - 16 - 22 - 2 * 10) / 10;
  return {
    x: k * (16 + 22 + 2 + col * (cell + 2) + cell / 2),
    y: k * (20 + 22 + 2 + row * (cell + 2) + cell / 2),
  };
}
