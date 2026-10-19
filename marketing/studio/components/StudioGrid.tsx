import type { ReactNode } from "react";
import { GRID_SIZE, cellKey } from "../../../shared/squares";
import { initialsOf } from "../../../src/lib/format";

const RANGE = Array.from({ length: GRID_SIZE }, (_, i) => i);

export interface Claim {
  name: string;
  color: string;
}

export interface StudioGridProps {
  teamX: string;
  teamY: string;
  claims: Map<string, Claim>;
  /** Appear progress per claimed cell, 0 → 1 (springy values above 1 overshoot). */
  appear?: (key: string) => number;
  colLabels: ReactNode[];
  rowLabels: ReactNode[];
  locked?: boolean;
  /** Glow intensity 0 → 1 for winning cells. */
  winners?: Map<string, number>;
  selected?: Set<string>;
  mine?: Set<string>;
  /** Header digits to spotlight (the digits a period landed on). */
  hotCol?: number | null;
  hotRow?: number | null;
  /** 0 → 1: dims every cell that isn't a winner, for spotlight moments. */
  dim?: number;
  /** Per-cell background override (heatmaps). */
  fill?: (row: number, col: number) => string | undefined;
  /** Per-cell label override (heatmaps). */
  label?: (row: number, col: number) => ReactNode;
}

/**
 * Frame-animatable mirror of src/components/SquaresGrid.tsx. Same markup and
 * Tailwind classes, so renders match the app, plus hooks for pop-ins, header
 * spotlights and winner glows.
 */
export function StudioGrid({
  teamX,
  teamY,
  claims,
  appear = () => 1,
  colLabels,
  rowLabels,
  locked = false,
  winners = new Map(),
  selected = new Set(),
  mine = new Set(),
  hotCol = null,
  hotRow = null,
  dim = 0,
  fill,
  label,
}: StudioGridProps) {
  return (
    <div className="select-none">
      <div className="mb-1 flex items-center justify-between text-xs font-semibold">
        <span className="text-accent-400">↓ {teamY}</span>
        <span className="text-gold-400">{teamX} →</span>
      </div>

      <div
        className="grid gap-[2px]"
        style={{ gridTemplateColumns: `1.4rem repeat(${GRID_SIZE}, minmax(0, 1fr))` }}
      >
        <div />
        {RANGE.map((col) => (
          <div
            key={`ch-${col}`}
            className="grid aspect-square place-items-center rounded-md bg-gold-500/15 text-xs font-bold text-gold-300"
            style={
              hotCol === col
                ? {
                    background: "#fbbf24",
                    color: "#0b1120",
                    boxShadow: "0 0 12px rgba(251,191,36,0.8)",
                  }
                : undefined
            }
          >
            {colLabels[col]}
          </div>
        ))}

        {RANGE.map((row) => (
          <Row
            key={`r-${row}`}
            row={row}
            {...{
              rowLabels,
              claims,
              appear,
              locked,
              winners,
              selected,
              mine,
              hotRow,
              dim,
              fill,
              label,
            }}
          />
        ))}
      </div>
    </div>
  );
}

function Row({
  row,
  rowLabels,
  claims,
  appear,
  locked,
  winners,
  selected,
  mine,
  hotRow,
  dim,
  fill,
  label,
}: Required<
  Pick<
    StudioGridProps,
    "rowLabels" | "claims" | "appear" | "locked" | "winners" | "selected" | "mine" | "dim"
  >
> &
  Pick<StudioGridProps, "fill" | "label" | "hotRow"> & { row: number }) {
  return (
    <>
      <div
        className="grid aspect-square place-items-center rounded-md bg-accent-500/15 text-xs font-bold text-accent-300"
        style={
          hotRow === row
            ? {
                background: "#38bdf8",
                color: "#0b1120",
                boxShadow: "0 0 12px rgba(56,189,248,0.8)",
              }
            : undefined
        }
      >
        {rowLabels[row]}
      </div>
      {RANGE.map((col) => {
        const key = cellKey(row, col);
        const sq = claims.get(key);
        const t = sq ? appear(key) : 0;
        const glow = winners.get(key) ?? 0;
        const isSelected = selected.has(key) && !sq;
        const ring =
          glow > 0
            ? " ring-2 ring-gold-400 ring-offset-1 ring-offset-pitch-950"
            : isSelected
              ? " ring-2 ring-brand-400"
              : mine.has(key) && t >= 1
                ? " ring-1 ring-white/60"
                : "";
        const base = isSelected ? " bg-brand-500/30" : locked ? " bg-pitch-800" : " bg-pitch-700";
        const custom = fill?.(row, col);
        return (
          <div
            key={key}
            className={
              "relative grid aspect-square place-items-center rounded-md text-center" + base + ring
            }
            style={{
              opacity: glow > 0 ? 1 : 1 - dim * 0.75,
              transform: glow > 0 ? `scale(${1 + 0.18 * glow})` : undefined,
              zIndex: glow > 0 ? 2 : undefined,
              boxShadow:
                glow > 0
                  ? `0 0 ${16 * glow}px ${5 * glow}px rgba(251,191,36,${0.75 * glow})`
                  : undefined,
              background: custom,
            }}
          >
            {sq && t > 0 && (
              <span
                className="absolute inset-0 grid place-items-center overflow-hidden rounded-md"
                style={{
                  backgroundColor: sq.color,
                  color: "#0b1120",
                  transform: `scale(${t})`,
                  opacity: Math.min(1, t * 2),
                }}
              >
                <span className="truncate px-0.5 text-[10px] font-bold leading-none">
                  {initialsOf(sq.name)}
                </span>
              </span>
            )}
            {isSelected && <span className="text-[10px] font-bold leading-none">✓</span>}
            {label?.(row, col)}
          </div>
        );
      })}
    </>
  );
}
