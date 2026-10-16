import { useMemo } from "react";
import { encodeQr, inFinder, isDark, type QrCode as QrMatrix } from "./qr";

export interface QrCodeProps {
  value: string;
  /** Rendered width/height in CSS px. */
  size: number;
  /** Modules of light margin around the symbol (the "quiet zone"). */
  quiet?: number;
  fg?: string;
  bg?: string;
  className?: string;
  /** Accessible name; the code is decorative when omitted. */
  label?: string;
}

/** Dark modules as one path of horizontal runs (finder patterns excluded: they are drawn as rounded eyes). */
export function modulesPath(qr: QrMatrix, offset: number): string {
  const parts: string[] = [];
  for (let y = 0; y < qr.size; y++) {
    let x = 0;
    while (x < qr.size) {
      if (!isDark(qr, x, y) || inFinder(qr.size, x, y)) {
        x++;
        continue;
      }
      const start = x;
      while (x < qr.size && isDark(qr, x, y) && !inFinder(qr.size, x, y)) x++;
      parts.push(`M${start + offset} ${y + offset}h${x - start}v1h${start - x}z`);
    }
  }
  return parts.join("");
}

/** One finder "eye": a rounded 7x7 ring around a rounded 3x3 pupil. */
function eyePath(x: number, y: number): string {
  const ring = roundedRect(x, y, 7, 7, 2) + roundedRect(x + 1, y + 1, 5, 5, 1.25);
  return ring + roundedRect(x + 2, y + 2, 3, 3, 0.9);
}

function roundedRect(x: number, y: number, w: number, h: number, r: number): string {
  return (
    `M${x + r} ${y}h${w - 2 * r}a${r} ${r} 0 0 1 ${r} ${r}v${h - 2 * r}a${r} ${r} 0 0 1 ${-r} ${r}` +
    `h${-(w - 2 * r)}a${r} ${r} 0 0 1 ${-r} ${-r}v${-(h - 2 * r)}a${r} ${r} 0 0 1 ${r} ${-r}z`
  );
}

/** A scannable QR code (byte mode, level M) as crisp inline SVG. */
export function QrCode({ value, size, quiet = 2, fg = "#060c09", bg = "#ffffff", className, label }: QrCodeProps) {
  const qr = useMemo(() => {
    try {
      return encodeQr(value);
    } catch {
      return null;
    }
  }, [value]);
  if (!qr) return null;

  const span = qr.size + quiet * 2;
  const n = qr.size;
  const eyes = eyePath(quiet, quiet) + eyePath(quiet + n - 7, quiet) + eyePath(quiet, quiet + n - 7);

  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox={`0 0 ${span} ${span}`}
      width={size}
      height={size}
      role={label ? "img" : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
      className={className}
      data-qr-version={qr.version}
    >
      <rect width={span} height={span} fill={bg} />
      <path d={modulesPath(qr, quiet)} fill={fg} shapeRendering="crispEdges" />
      <path d={eyes} fill={fg} fillRule="evenodd" />
    </svg>
  );
}
