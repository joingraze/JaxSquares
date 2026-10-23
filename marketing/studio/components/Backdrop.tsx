import { COLORS } from "../brand";

const GLOWS = {
  volt: "214,255,120",
  gold: "255,194,51",
  flare: "255,102,166",
  sky: "58,183,255",
} as const;

export type Tint = keyof typeof GLOWS;

/**
 * Night turf: the canvas of the App Store art (scripts/store/frames.mjs), with
 * volt light from the top corners and a glow in the tint behind the content.
 */
export function Backdrop({ frame, tint = "volt", glowY = 62 }: { frame: number; tint?: Tint; glowY?: number }) {
  const drift = (frame * 0.1) % 40;
  return (
    <div className="absolute inset-0" style={{ background: COLORS.canvas }}>
      <div
        className="absolute inset-0"
        style={{
          background: [
            "radial-gradient(270px 210px at -4% -6%, rgba(214,255,120,.17), transparent 70%)",
            "radial-gradient(270px 210px at 104% -6%, rgba(214,255,120,.10), transparent 70%)",
            `radial-gradient(360px 300px at 50% ${glowY}%, rgba(${GLOWS[tint]},.14), transparent 68%)`,
          ].join(", "),
        }}
      />
      <div
        className="absolute inset-0"
        style={{
          backgroundImage:
            "linear-gradient(rgba(255,255,255,0.035) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.035) 1px, transparent 1px)",
          backgroundSize: "40px 40px",
          backgroundPosition: `${drift}px ${drift}px`,
          maskImage: "radial-gradient(ellipse at 50% 35%, black 20%, transparent 75%)",
          WebkitMaskImage: "radial-gradient(ellipse at 50% 35%, black 20%, transparent 75%)",
        }}
      />
    </div>
  );
}
