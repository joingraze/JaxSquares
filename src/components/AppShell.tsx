import type { ReactNode } from "react";
import { Link } from "react-router-dom";

/** Mobile-first centered column with a sticky brand header. */
export function AppShell({ children }: { children: ReactNode }) {
  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-md flex-col">
      <header className="safe-top sticky top-0 z-20 border-b border-white/5 bg-pitch-950/80 px-4 pb-3 backdrop-blur">
        <Link to="/" className="flex items-center gap-2">
          <Logo />
          <span className="text-lg font-extrabold tracking-tight">
            Jax<span className="text-brand-400">Squares</span>
          </span>
        </Link>
      </header>
      <main className="safe-bottom flex-1 px-4 py-5">{children}</main>
    </div>
  );
}

/*
 * The J² ("Jax Squared") mark. Outlines are traced from Inter Display Black on
 * a 100×100 grid so the logo is identical on every device; public/favicon.svg
 * uses the same paths.
 */
export const LOGO_J_PATH =
  "M38.28 80.96C51.71 80.96 59.17 74.30 59.17 62.37L59.17 23.04L43.26 23.04L43.26 62.06C43.26 65.73 41.38 67.80 38.02 67.80C34.65 67.80 32.77 65.73 32.77 62.06L32.77 57.39L18.08 57.39L18.08 61.91C18.08 74.15 25.31 80.96 38.28 80.96Z";
export const LOGO_TWO_PATH =
  "M61.78 46.18L81.92 46.18L81.92 40.52L71.71 40.52L71.71 40.48L75.95 37.03C79.43 34.20 81.85 31.82 81.85 27.90C81.85 22.69 77.62 19.54 71.81 19.54C65.46 19.54 61.52 23.32 61.52 29.43L68.23 29.43C68.23 26.70 69.67 25.17 71.80 25.17C73.75 25.17 75.05 26.44 75.05 28.30C75.05 30.57 73.10 31.95 71.64 33.13L61.78 41.08Z";

export function Logo({ size = 32, tile = "#131c30" }: { size?: number; tile?: string }) {
  return (
    <svg viewBox="0 0 100 100" width={size} height={size} className="shrink-0" aria-hidden="true">
      <rect width="100" height="100" rx="24" fill={tile} />
      <path d={LOGO_J_PATH} fill="#f8fafc" />
      <path d={LOGO_TWO_PATH} fill="#22c55e" />
    </svg>
  );
}
