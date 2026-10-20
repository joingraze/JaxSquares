import type { ReactNode } from "react";
import type { Composition, CompProps } from "../types";
import { COLORS } from "../brand";
import { LOGO_J_PATH, LOGO_TWO_PATH } from "../../../src/components/AppShell";

// Instagram profile picture: 1080×1080, shown as a circle (110pt on the profile,
// ~32pt next to comments). Everything sits inside the inscribed circle with
// margin, and each mark is a single bold shape so it still reads at 32pt.
// Option 1 is the app's J² logo; the old 2×2 colored-square mark was dropped
// because it read as the Microsoft logo.

const SIZE = 360; // stage CSS px (×3 = 1080)
const NAVY = `radial-gradient(circle at 50% 30%, #17223b 0%, ${COLORS.pitch900} 55%, ${COLORS.pitch950} 100%)`;

function Ground({ children, background = NAVY }: { children: ReactNode; background?: string }) {
  return (
    <div className="absolute inset-0 grid place-items-center" style={{ background }}>
      {children}
    </div>
  );
}

/** J² — "Jax Squared": the app logo's outlines without the tile. */
function Monogram() {
  return (
    <Ground>
      <svg viewBox="0 0 100 100" width={SIZE * 0.86} height={SIZE * 0.86} aria-hidden="true">
        <path d={LOGO_J_PATH} fill="#f8fafc" />
        <path d={LOGO_TWO_PATH} fill={COLORS.brand} />
      </svg>
    </Ground>
  );
}

/** A slice of the board: the winning square lit where its row and column cross. */
function WinningSquare() {
  const n = 4;
  const hot = { row: 1, col: 2 };
  const board = SIZE * 0.56;
  const gap = SIZE * 0.022;
  const cell = (board - gap * (n - 1)) / n;
  return (
    <Ground>
      <div className="grid" style={{ gridTemplateColumns: `repeat(${n}, ${cell}px)`, gap }}>
        {Array.from({ length: n * n }, (_, i) => {
          const row = Math.floor(i / n);
          const col = i % n;
          const isHot = row === hot.row && col === hot.col;
          return (
            <div
              key={i}
              style={{
                width: cell,
                height: cell,
                borderRadius: cell * 0.22,
                background: isHot
                  ? COLORS.gold
                  : col === hot.col
                    ? "rgba(251,191,36,0.30)"
                    : row === hot.row
                      ? "rgba(56,189,248,0.30)"
                      : COLORS.pitch700,
                boxShadow: isHot ? `0 0 ${cell * 0.55}px rgba(251,191,36,0.75)` : undefined,
              }}
            />
          );
        })}
      </div>
    </Ground>
  );
}

/** A football, squared: brand-green tile with white laces and end stripes. */
function SquareFootball() {
  const tile = SIZE * 0.56;
  const white = "#f8fafc";
  const laceH = tile * 0.055;
  return (
    <Ground>
      <div
        className="relative"
        style={{
          width: tile,
          height: tile,
          borderRadius: tile * 0.26,
          background: `linear-gradient(160deg, #34d673, ${COLORS.brand} 55%, #15a34a)`,
          boxShadow: "inset 0 -10px 0 rgba(0,0,0,0.14), 0 18px 40px rgba(0,0,0,0.45)",
        }}
      >
        {[0.17, 0.83].map((x) => (
          <span
            key={x}
            className="absolute"
            style={{
              left: `${x * 100}%`,
              top: "14%",
              bottom: "14%",
              width: tile * 0.05,
              transform: "translateX(-50%)",
              borderRadius: 99,
              background: white,
            }}
          />
        ))}
        <span
          className="absolute"
          style={{
            left: "50%",
            top: "50%",
            width: tile * 0.46,
            height: laceH,
            transform: "translate(-50%,-50%)",
            borderRadius: 99,
            background: white,
          }}
        />
        {Array.from({ length: 5 }, (_, i) => (
          <span
            key={i}
            className="absolute"
            style={{
              left: `${50 + (i - 2) * 9.2}%`,
              top: "50%",
              width: laceH,
              height: tile * 0.2,
              transform: "translate(-50%,-50%)",
              borderRadius: 99,
              background: white,
            }}
          />
        ))}
      </div>
    </Ground>
  );
}

const OPTIONS = [Monogram, WinningSquare, SquareFootball];

function ProfilePicture({ frame }: CompProps) {
  const Option = OPTIONS[Math.min(frame, OPTIONS.length - 1)];
  return <Option />;
}

export const PROFILE: Composition = {
  id: "p-profile-picture",
  title: "Profile picture (3 options)",
  width: 1080,
  height: 1080,
  fps: 30,
  kind: "stills",
  durationInFrames: OPTIONS.length,
  component: ProfilePicture,
};
