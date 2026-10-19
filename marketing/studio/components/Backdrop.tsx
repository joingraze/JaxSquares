import { COLORS } from "../brand";

const GLOWS = {
  brand: "rgba(34,197,94,0.24)",
  gold: "rgba(251,191,36,0.22)",
  accent: "rgba(56,189,248,0.22)",
  rose: "rgba(251,113,133,0.2)",
} as const;

export type Tint = keyof typeof GLOWS;

/** Full-bleed brand background: the app's pitch-dark gradient plus a drifting 10×10 grid motif. */
export function Backdrop({ frame, tint = "brand" }: { frame: number; tint?: Tint }) {
  const drift = (frame * 0.12) % 36;
  return (
    <div className="absolute inset-0" style={{ background: COLORS.pitch950 }}>
      <div
        className="absolute inset-0"
        style={{
          background: [
            `radial-gradient(440px 320px at 50% -8%, ${GLOWS[tint]}, transparent 65%)`,
            "radial-gradient(320px 260px at 108% 24%, rgba(56,189,248,0.14), transparent 60%)",
            "radial-gradient(300px 260px at -12% 88%, rgba(245,158,11,0.10), transparent 60%)",
          ].join(", "),
        }}
      />
      <div
        className="absolute inset-0"
        style={{
          backgroundImage:
            "linear-gradient(rgba(255,255,255,0.04) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.04) 1px, transparent 1px)",
          backgroundSize: "36px 36px",
          backgroundPosition: `${drift}px ${drift}px`,
          maskImage: "radial-gradient(ellipse at 50% 40%, black 25%, transparent 78%)",
          WebkitMaskImage: "radial-gradient(ellipse at 50% 40%, black 25%, transparent 78%)",
        }}
      />
    </div>
  );
}
