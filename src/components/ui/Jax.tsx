// Jax, the dog JaxSquares is named after, as a small flat illustration.
// Fur colors are fixed (they're his); the ground, the board edge and the z's
// use theme tokens so he sits right on the dark canvas and on the light one.
// Hand-built shapes, no raster; every pose is a few KB. Browse them at /kit.

import { cx } from "./cx";
import "./jax.css";

/**
 * sit: the hero (his photo). peek: head and paws over a board's edge, for
 * "nothing here" screens. cheer: a win. sleep: quiet states. face: just his
 * head, for small spots like a button.
 */
export type JaxPose = "sit" | "peek" | "cheer" | "sleep" | "face";

export interface JaxProps {
  pose?: JaxPose;
  /** Rendered width in px; the height follows the pose's shape. */
  size?: number;
  /** Accessible name. Omit it when the art is decorative (the default). */
  title?: string;
  className?: string;
}

/** His colors. */
const C = {
  coat: "#f0bf78",
  coatMid: "#e8b06a",
  coatShade: "#dc9d55",
  ear: "#d98b3d",
  earShade: "#bd7130",
  cream: "#fff5e4",
  creamShade: "#f1dcbc",
  dark: "#1e130c",
  line: "#6e3f1e",
  harness: "#8c5332",
  harnessShade: "#73411f",
  trim: "#17110d",
};

const GROUND = "var(--color-line-strong)";

function Sit() {
  return (
    <>
      <ellipse cx="64" cy="122" rx="38" ry="4" fill={GROUND} />
      {/* tail: a feathered plume curling up behind him */}
      <path d="M94 108c9 0 17-6 20-16 3-1 4-4 3-7 3-2 3-6 0-8 1-3-1-6-4-6-7 1-11 10-21 19z" fill={C.coat} />
      <path d="M113 71c3 0 5 3 4 6 3 2 3 6 0 8 1 3 0 6-3 7-1-7-2-14-1-21z" fill={C.cream} />
      {/* haunch + torso */}
      <ellipse cx="86" cy="102" rx="20" ry="18" fill={C.coatMid} />
      <path d="M42 58c-9 12-10 26-5 34h48c5-8 6-20-3-32z" fill={C.coat} />
      {/* harness strap over the shoulder (the ear covers its top) */}
      <path d="M80 76l10-15" stroke={C.trim} strokeWidth="7" strokeLinecap="round" />
      <path d="M80 76l10-15" stroke={C.harness} strokeWidth="3.6" strokeLinecap="round" />
      {/* belly in shadow behind the front legs */}
      <path d="M46 86h37l3 34H48z" fill={C.coatShade} />
      <rect x="59" y="85" width="12" height="35" rx="6" fill={C.coatMid} />
      <rect x="39" y="84" width="14" height="36" rx="7" fill={C.coat} />
      {/* harness: quilted chest plate with black trim */}
      <path d="M39 75c12 6 29 6 43-3l3 14c-14 9-31 10-44 5z" fill={C.harness} stroke={C.trim} strokeWidth="2.2" strokeLinejoin="round" />
      <path d="M42 83c12 4 27 4 41-3" stroke={C.harnessShade} strokeWidth="1.2" strokeDasharray="2.4 2" fill="none" />
      {/* chest ruff, fluffing over the harness */}
      <path d="M41 52c9-5 27-5 37 1 3 7 3 14 1 21-2 2-4 1-5-1-2 3-5 4-7 1-2 3-5 4-7 1-2 3-5 4-7 0-2 3-5 3-7 0-2 2-4 2-5 0-3-2-4-7-1-10-3-3-3-9 1-13z" fill={C.cream} />
      <ellipse cx="65.5" cy="119" rx="7" ry="4.2" fill={C.cream} />
      <ellipse cx="46" cy="119" rx="7.8" ry="4.5" fill={C.cream} />
      <ellipse cx="91" cy="120" rx="7" ry="4" fill={C.cream} />
      <path d="M44 117v3M48 117v3M63.5 117v3M67.5 117v3" stroke={C.creamShade} strokeWidth="1.2" strokeLinecap="round" />
      <SideHead />
    </>
  );
}

/** His head in three-quarter view, looking left (the photo's pose). Asleep: eyes closed. */
function SideHead({ asleep = false }: { asleep?: boolean }) {
  return (
    <>
      <path d="M46 17c-9-3-17 3-20 12s-2 17-6 25c2 2 5 2 6 0 1 2 4 3 6 0 4-8 8-20 14-37z" fill={C.earShade} />
      <path d="M37 31c1-14 14-22 26-21 13 1 22 11 21 25-1 13-9 23-22 25-11 1-19-2-23-8-4-6-4-15-2-21z" fill={C.coat} />
      <path d="M59 11c2-4 6-5 9-4-3 1-4 3-4 5z" fill={C.coat} />
      <path d="M52 12c3-1 7 0 8 2-3 6-5 14-5 22-3 3-9 4-14 3 4-8 8-18 11-27z" fill={C.cream} />
      <path d="M42 37c-8 0-15 4-15 9 0 6 7 10 17 10 8 0 12-4 11-10-1-5-6-9-13-9z" fill={C.cream} />
      {/* near ear: long, wavy, feathered at the tips */}
      <path d="M64 15c10-5 22-3 26 7 4 8 2 16 5 24 3 8 1 16 0 22-2 3-5 2-6 0-1 3-5 4-7 1-2 3-6 2-7-1-3-6-2-14-4-22-2-10-1-20-7-31z" fill={C.ear} />
      <path d="M70 24c4 10 5 24 6 38-2-2-3-10-4-18-1-8-1-14-2-20z" fill={C.earShade} />
      {asleep ? (
        <path d="M54 34c2 3 8 3 10 0M40 33c1 2 4 2 6 0" stroke={C.dark} strokeWidth="2" strokeLinecap="round" fill="none" />
      ) : (
        <>
          <ellipse cx="60" cy="33" rx="5.4" ry="5.8" fill="#5a3418" />
          <ellipse cx="60" cy="33" rx="4.5" ry="4.9" fill={C.dark} />
          <ellipse cx="44.5" cy="32" rx="3" ry="3.6" fill={C.dark} />
          <circle cx="58.5" cy="31.3" r="1.5" fill="#fff" />
          <circle cx="43.6" cy="30.8" r="0.9" fill="#fff" />
        </>
      )}
      <path d="M26 42c0-3 4-4 7-3 2 1 2 5 0 7-2 1-6 1-7-1z" fill={C.dark} />
      <path d="M31 49c3 3 8 4 14 2" stroke={C.line} strokeWidth="1.4" strokeLinecap="round" fill="none" />
    </>
  );
}

/** Curled up for a nap, tail wrapped round, chin on his paws. */
function Sleep() {
  return (
    <>
      <ellipse cx="76" cy="79" rx="56" ry="4" fill={GROUND} />
      <path
        className="jx-zz"
        d="M14 20h7l-7 7h7M25 7h5l-5 5h5"
        stroke="var(--color-ink-subtle)"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
      <g className="jx-breathe">
        <path d="M52 77c-4-27 12-47 38-47 24 0 40 16 38 34-1 8-6 13-14 13z" fill={C.coat} />
        <ellipse cx="108" cy="57" rx="18" ry="15" fill={C.coatMid} />
        <path d="M71 32c6 12 6 30 2 45h7c4-15 4-33-2-46z" fill={C.harness} stroke={C.trim} strokeWidth="2" strokeLinejoin="round" />
      </g>
      {/* tail, wrapped round the front */}
      <path d="M127 63c2 10-7 17-21 17H80c-6 0-8-4-5-7 2 1 4 0 5-2 2 2 5 1 6-1 2 2 5 1 6-1 12 1 26 0 35-6z" fill={C.creamShade} />
      <path d="M80 80c-6 0-8-4-5-7 2 1 4 0 5-2 2 2 5 1 6-1 1 4 0 8-2 10z" fill={C.cream} />
      <ellipse cx="28" cy="75" rx="9" ry="4.6" fill={C.cream} />
      <ellipse cx="43" cy="76.5" rx="8.5" ry="4.4" fill={C.creamShade} />
      <g transform="translate(42 50) rotate(10) scale(0.8) translate(-60 -36)">
        <SideHead asleep />
      </g>
    </>
  );
}

/** One hanging ear for the front-facing head (the left; the right is mirrored). */
const EAR_FRONT = "M-16-21c-10-3-19 4-20 15-1 10 1 18-1 28 2 3 5 3 6 0 2 3 5 3 7 0 2 2 5 2 6-1-1-8-2-18-1-28 1-6 2-10 3-14z";

/** Front-facing head centered on 0,0: eyes open, or squeezed shut with a big open grin. */
function FrontHead({ happy = false }: { happy?: boolean }) {
  // Happy: the ears fly up and out.
  const ear = happy ? "rotate(42 -17 -19)" : undefined;
  return (
    <>
      {[ear, `scale(-1 1)${ear ? ` ${ear}` : ""}`].map((t, i) => (
        <g key={i} transform={t}>
          <path d={EAR_FRONT} fill={C.ear} />
          <path d="M-25-9c-2 9-2 19-1 27-2-7-3-18 1-27z" fill={C.earShade} />
        </g>
      ))}
      <path d="M-24-2c0-16 12-24 24-24s24 8 24 24c0 14-10 24-24 24S-24 12-24-2z" fill={C.coat} />
      <path d="M-3-25c2-1 4-1 6 0 1 9 3 17 6 25H-9c3-8 5-16 6-25z" fill={C.cream} />
      <ellipse cx="0" cy="9" rx="13" ry="10" fill={C.cream} />
      {happy ? (
        <>
          <path d="M-15-3c2-4 7-4 9 0M6-3c2-4 7-4 9 0" stroke={C.dark} strokeWidth="2.4" strokeLinecap="round" fill="none" />
          <path d="M-7 11c2 9 12 9 14 0z" fill="#5b2318" />
          <path d="M-3.6 15.4c1-2.6 6.2-2.6 7.2 0-.6 2.8-6.6 2.8-7.2 0z" fill="#f2828c" />
        </>
      ) : (
        <>
          <ellipse cx="-10" cy="-4" rx="5" ry="5.4" fill="#5a3418" />
          <ellipse cx="10" cy="-4" rx="5" ry="5.4" fill="#5a3418" />
          <ellipse cx="-10" cy="-4" rx="4.2" ry="4.6" fill={C.dark} />
          <ellipse cx="10" cy="-4" rx="4.2" ry="4.6" fill={C.dark} />
          <circle cx="-11.4" cy="-5.6" r="1.4" fill="#fff" />
          <circle cx="8.6" cy="-5.6" r="1.4" fill="#fff" />
          <path d="M0 8v3M-6 12c2 2 4 2 6-1 2 3 4 3 6 1" stroke={C.line} strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" fill="none" />
        </>
      )}
      <path d="M-5 3c0-3 10-3 10 0 0 3-3 5-5 5s-5-2-5-5z" fill={C.dark} />
    </>
  );
}

/** Head and front paws over the edge of a squares board. */
function Peek() {
  return (
    <>
      <path d="M40 56c8-4 32-4 40 0l2 20H38z" fill={C.coatMid} />
      <path d="M44 55c8-3 24-3 32 0 0 5-1 9-2 12-2 1-3 0-4-1-1 2-4 2-5 0-1 2-4 2-5 0-1 2-4 2-5 0-1 1-3 1-4-1-1-3-2-6-2-10z" fill={C.cream} />
      <rect x="33" y="54" width="15" height="26" rx="7.5" fill={C.coat} />
      <rect x="72" y="54" width="15" height="26" rx="7.5" fill={C.coat} />
      <g transform="translate(60 36) rotate(-6)">
        <FrontHead />
      </g>
      {/* the board's edge: its frame and the top row of squares */}
      <rect x="2" y="74" width="116" height="40" rx="9" fill="var(--color-surface-3)" stroke="var(--color-line-strong)" />
      {[0, 1, 2, 3, 4, 5].map((i) => (
        <rect key={i} x={8 + i * 18.2} y="80" width="14.6" height="16" rx="3" fill="var(--color-surface-4)" />
      ))}
      <ellipse cx="40.5" cy="81.5" rx="9" ry="3" fill={GROUND} />
      <ellipse cx="79.5" cy="81.5" rx="9" ry="3" fill={GROUND} />
      <ellipse cx="40.5" cy="77" rx="9.5" ry="6" fill={C.cream} />
      <ellipse cx="79.5" cy="77" rx="9.5" ry="6" fill={C.cream} />
      <path d="M38 75v3.4M43 75v3.4M77 75v3.4M82 75v3.4" stroke={C.creamShade} strokeWidth="1.3" strokeLinecap="round" />
    </>
  );
}

/** Confetti in the celebration colors (fixed scales, same in both themes). */
const CONFETTI: [number, number, number, string][] = [
  [12, 30, 20, "var(--color-brand-400)"],
  [117, 24, -25, "var(--color-gold-400)"],
  [15, 72, -15, "var(--color-gold-400)"],
  [117, 54, 30, "var(--color-brand-400)"],
  [30, 98, 40, "var(--color-accent-400)"],
  [64, 3, 10, "var(--color-brand-400)"],
];

/** Up on his hind legs, paws in the air, ears flying. */
function Cheer() {
  return (
    <>
      {CONFETTI.map(([x, y, r, fill], i) => (
        <rect key={i} x={x - 3} y={y - 3} width="6" height="6" rx="1.5" fill={fill} transform={`rotate(${r} ${x} ${y})`} />
      ))}
      <ellipse cx="64" cy="127" rx="24" ry="3.5" fill={GROUND} />
      {/* tail, wagging */}
      <path d="M80 102c10 0 19-6 22-16 3-1 4-4 3-7 3-2 3-6 0-8 1-3-1-6-4-6-7 1-11 10-23 20z" fill={C.coat} />
      <path d="M101 65c3 0 5 3 4 6 3 2 3 6 0 8 1 3 0 6-3 7-1-7-2-14-1-21z" fill={C.cream} />
      <rect x="46" y="98" width="14" height="20" rx="7" fill={C.coatShade} />
      <rect x="68" y="98" width="14" height="20" rx="7" fill={C.coatShade} />
      <path d="M48 62c-9 12-10 32-3 46h38c7-14 6-34-3-46z" fill={C.coat} />
      {/* hips and a pale belly, so he reads standing up */}
      <ellipse cx="49" cy="101" rx="8.5" ry="10" fill={C.coatMid} />
      <ellipse cx="79" cy="101" rx="8.5" ry="10" fill={C.coatMid} />
      <ellipse cx="64" cy="100" rx="7.5" ry="9.5" fill={C.creamShade} />
      <path d="M49 70L31 49M79 70l18-21" stroke={C.coat} strokeWidth="13" strokeLinecap="round" />
      <path d="M45 72c12 5 26 5 38 0l1 12c-13 5-27 5-40 0z" fill={C.harness} stroke={C.trim} strokeWidth="2.2" strokeLinejoin="round" />
      <path d="M47 79c11 4 23 4 34 0" stroke={C.harnessShade} strokeWidth="1.2" strokeDasharray="2.4 2" fill="none" />
      <path d="M47 58c9-4 25-4 34 0-1 6-3 11-6 15-2 1-3 0-4-1-1 2-4 3-5 0-2 3-4 3-6 0-1 3-4 2-5 0-1 1-3 1-4-1-2-4-4-9-4-13z" fill={C.cream} />
      <ellipse cx="53" cy="118" rx="8" ry="4.6" fill={C.cream} />
      <ellipse cx="75" cy="118" rx="8" ry="4.6" fill={C.cream} />
      <circle cx="30" cy="47" r="7.5" fill={C.cream} />
      <circle cx="98" cy="47" r="7.5" fill={C.cream} />
      <path d="M27 43.5l1.6 2.4M31.4 42.6l.4 2.8M101 43.5l-1.6 2.4M96.6 42.6l-.4 2.8" stroke={C.creamShade} strokeWidth="1.3" strokeLinecap="round" />
      <g transform="translate(64 36) rotate(4)">
        <FrontHead happy />
      </g>
    </>
  );
}

const POSES: Record<JaxPose, { viewBox: string; w: number; h: number; art: (props: object) => JSX.Element }> = {
  sit: { viewBox: "0 0 128 130", w: 128, h: 130, art: Sit },
  peek: { viewBox: "0 0 120 92", w: 120, h: 92, art: Peek },
  cheer: { viewBox: "0 0 128 132", w: 128, h: 132, art: Cheer },
  sleep: { viewBox: "0 0 140 84", w: 140, h: 84, art: Sleep },
  face: { viewBox: "-38 -28 76 56", w: 76, h: 56, art: FrontHead },
};

export function Jax({ pose = "sit", size = 120, title, className }: JaxProps) {
  const p = POSES[pose];
  const Art = p.art;
  return (
    <svg
      width={size}
      height={Math.round((size * p.h) / p.w)}
      viewBox={p.viewBox}
      role={title ? "img" : undefined}
      aria-hidden={title ? undefined : true}
      className={cx("shrink-0", className)}
      data-pose={pose}
    >
      {title && <title>{title}</title>}
      <Art />
    </svg>
  );
}
