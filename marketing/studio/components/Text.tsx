import type { CSSProperties } from "react";
import { Easing, interpolate, spring } from "../lib/anim";
import { COLORS } from "../brand";

const FPS = 30;

/**
 * Kinetic headline: words spring up one after another. Wrap words in *stars*
 * to highlight them; "|" forces a line break.
 */
export function Headline({
  text,
  frame,
  start = 0,
  exit,
  size = 34,
  stagger = 2.5,
  color = COLORS.text,
  highlight = COLORS.brandLight,
  align = "center",
  style,
}: {
  text: string;
  frame: number;
  start?: number;
  /** Frame at which the headline starts leaving. */
  exit?: number;
  size?: number;
  stagger?: number;
  color?: string;
  highlight?: string;
  align?: "center" | "left";
  style?: CSSProperties;
}) {
  const lines = text.split("|").map((l) => parseLine(l.trim()));
  let wordIndex = 0;
  const out =
    exit === undefined ? 1 : interpolate(frame, [exit, exit + 8], [1, 0], { easing: Easing.in });
  return (
    <div
      className="font-black-display"
      style={{
        fontSize: size,
        lineHeight: 1.04,
        color,
        textAlign: align,
        opacity: out,
        transform: `translateY(${(1 - out) * -14}px)`,
        ...style,
      }}
    >
      {lines.map((words, li) => (
        <div
          key={li}
          style={{
            display: "flex",
            flexWrap: "wrap",
            justifyContent: align === "center" ? "center" : "flex-start",
            columnGap: size * 0.26,
          }}
        >
          {words.map((runs, wi) => {
            const s = spring(frame - start - wordIndex++ * stagger, FPS, {
              stiffness: 220,
              damping: 20,
            });
            return (
              <span
                key={wi}
                style={{
                  display: "inline-block",
                  opacity: Math.min(1, s * 1.4),
                  transform: `translateY(${(1 - s) * size * 0.7}px) scale(${0.9 + 0.1 * s})`,
                }}
              >
                {runs.map((r, ri) => (
                  <span key={ri} style={r.hl ? { color: highlight } : undefined}>
                    {r.text}
                  </span>
                ))}
              </span>
            );
          })}
        </div>
      ))}
    </div>
  );
}

/** Split a line into words, each a list of runs; "*...*" toggles highlight mid-word too. */
function parseLine(line: string): { text: string; hl: boolean }[][] {
  const words: { text: string; hl: boolean }[][] = [];
  let word: { text: string; hl: boolean }[] = [];
  let hl = false;
  const push = (ch: string) => {
    const last = word[word.length - 1];
    if (last && last.hl === hl) last.text += ch;
    else word.push({ text: ch, hl });
  };
  for (const ch of line) {
    if (ch === "*") hl = !hl;
    else if (ch === " ") {
      if (word.length) words.push(word);
      word = [];
    } else push(ch);
  }
  if (word.length) words.push(word);
  return words;
}

/** Small uppercase label above a headline. */
export function Kicker({
  children,
  frame,
  start = 0,
  color = COLORS.brandLight,
  style,
}: {
  children: string;
  frame: number;
  start?: number;
  color?: string;
  style?: CSSProperties;
}) {
  const s = spring(frame - start, FPS, { stiffness: 200, damping: 22 });
  return (
    <div style={{ display: "flex", justifyContent: "center", ...style }}>
      <span
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 6,
          padding: "5px 11px",
          borderRadius: 999,
          fontSize: 10.5,
          fontWeight: 800,
          letterSpacing: "0.14em",
          textTransform: "uppercase",
          color,
          background: "rgba(255,255,255,0.06)",
          border: "1px solid rgba(255,255,255,0.10)",
          opacity: s,
          transform: `translateY(${(1 - s) * 10}px)`,
        }}
      >
        <span style={{ width: 6, height: 6, borderRadius: 999, background: color }} />
        {children}
      </span>
    </div>
  );
}

/** Fade + rise wrapper for any element. */
export function Rise({
  frame,
  start = 0,
  exit,
  distance = 18,
  children,
  style,
}: {
  frame: number;
  start?: number;
  exit?: number;
  distance?: number;
  children: React.ReactNode;
  style?: CSSProperties;
}) {
  const s = spring(frame - start, FPS, { stiffness: 190, damping: 21 });
  const out = exit === undefined ? 1 : interpolate(frame, [exit, exit + 8], [1, 0]);
  return (
    <div
      style={{
        opacity: Math.min(s, out),
        transform: `translateY(${(1 - s) * distance}px)`,
        ...style,
      }}
    >
      {children}
    </div>
  );
}
