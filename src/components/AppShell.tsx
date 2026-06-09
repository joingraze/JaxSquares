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

export function Logo() {
  return (
    <span className="grid h-8 w-8 grid-cols-2 grid-rows-2 gap-0.5 rounded-lg bg-pitch-800 p-1">
      <span className="rounded-sm bg-brand-500" />
      <span className="rounded-sm bg-accent-500" />
      <span className="rounded-sm bg-gold-500" />
      <span className="rounded-sm bg-rose-500" />
    </span>
  );
}
