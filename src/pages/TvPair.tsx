// jaxsquares.com/tv: pairing a TV with a board, for a smart TV's browser (a
// TV opening the home page lands here, src/main.tsx). The TV shows a short
// code (shared/tvBrowser.ts); anyone with the board's link enters it (the
// share sheet's "Show on TV", or Host tools) and the TV opens that board's TV
// mode. It asks every few seconds with its own secret (only it can learn what
// it was sent), takes a new code when this one runs out, and keeps the screen
// awake while it waits. Exit from the board's TV mode comes back here, to a
// new code.

import { useEffect, useState, type CSSProperties } from "react";
import { useNavigate } from "react-router-dom";
import { TV_PAIR_POLL_MS } from "../../shared/tvBrowser";
import { LogoMark } from "../components/ui";
import { useTvTheme, useWakeLock } from "../features/tv/screen";
import "../features/tv/tv.css";
import { ApiError, api, errorMessage } from "../lib/api";

interface Pairing {
  code: string;
  token: string;
  expiresAt: number;
}

/** A failed code request tries again this long after. */
const RETRY_MS = 5_000;

function useUnit(): number {
  const read = () => Math.min(window.innerWidth || 1280, window.innerHeight || 720) / 100;
  const [unit, setUnit] = useState(read);
  useEffect(() => {
    const onResize = () => setUnit(read());
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);
  return unit;
}

export default function TvPair() {
  const navigate = useNavigate();
  useTvTheme();
  useWakeLock();
  const unit = useUnit();
  const [pairing, setPairing] = useState<Pairing | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  // Bumped for a new code: on first load, when one runs out, and after a failed request.
  const [round, setRound] = useState(0);

  useEffect(() => {
    let alive = true;
    let retry: ReturnType<typeof setTimeout> | null = null;
    api.tvPairStart().then(
      (p) => {
        if (!alive) return;
        setProblem(null);
        setPairing(p);
      },
      (err: unknown) => {
        if (!alive) return;
        setProblem(errorMessage(err));
        retry = setTimeout(() => setRound((n) => n + 1), RETRY_MS);
      },
    );
    return () => {
      alive = false;
      if (retry) clearTimeout(retry);
    };
  }, [round]);

  useEffect(() => {
    if (!pairing) return;
    let alive = true;
    const fresh = () => {
      setPairing(null);
      setRound((n) => n + 1);
    };
    const tick = async () => {
      if (Date.now() >= pairing.expiresAt) return fresh();
      try {
        const res = await api.tvPairPoll(pairing.code, pairing.token);
        if (!alive) return;
        setProblem(null);
        // Pushed, so the board's Exit comes back here for a new code.
        if (res.gameId) navigate(`/g/${encodeURIComponent(res.gameId)}/tv`);
      } catch (err) {
        if (!alive) return;
        if (err instanceof ApiError && err.status === 404) fresh();
        else setProblem("Can't reach JaxSquares right now. Still trying…");
      }
    };
    const timer = setInterval(() => void tick(), TV_PAIR_POLL_MS);
    return () => {
      alive = false;
      clearInterval(timer);
    };
  }, [pairing, navigate]);

  return (
    <div className="tv-root flex min-h-dvh flex-col items-center justify-center px-[calc(var(--u)*6)] py-[calc(var(--u)*5)] text-center" style={{ "--u": `${unit}px` } as CSSProperties} data-testid="tv-pair">
      <p className="tv-brand mb-[calc(var(--u)*5)]">
        <LogoMark size={28} className="h-[calc(var(--u)*3.2)] w-[calc(var(--u)*3.2)]" />
        <span>
          Jax<span className="text-ink-brand">Squares</span>
        </span>
      </p>
      <h1 className="font-display text-[length:calc(var(--u)*5.4)] font-extrabold leading-tight tracking-[-0.03em] text-ink">Put a board on this TV</h1>
      <p className="tv-text-lg mt-[calc(var(--u)*1.4)] text-ink-muted">On your phone, open the board, tap its share button, then Show on TV, and enter:</p>

      <p
        className="mt-[calc(var(--u)*4)] flex gap-[calc(var(--u)*1.6)]"
        aria-label={pairing ? `TV code ${[...pairing.code].join(" ")}` : "Getting a code"}
        data-testid="tv-pair-code"
      >
        {(pairing?.code ?? "····").split("").map((ch, i) => (
          <span
            key={i}
            aria-hidden
            className="grid h-[calc(var(--u)*16)] w-[calc(var(--u)*12.5)] place-items-center rounded-[calc(var(--u)*2.4)] bg-surface-2 font-display text-[length:calc(var(--u)*10)] font-extrabold text-ink shadow-[var(--elevation-card)] ring-1 ring-inset ring-line-strong"
          >
            {ch}
          </span>
        ))}
      </p>

      <p className="tv-text-md mt-[calc(var(--u)*4)] flex items-center gap-[calc(var(--u)*1)] text-ink-muted" role="status" data-testid="tv-pair-status">
        <span aria-hidden className="relative flex h-[calc(var(--u)*1.2)] w-[calc(var(--u)*1.2)]">
          <span className="absolute inline-flex h-full w-full animate-[live-ping_1.6s_ease-out_infinite] rounded-full bg-brand-400" />
          <span className="relative inline-flex h-full w-full rounded-full bg-brand-400" />
        </span>
        {problem ?? (pairing ? "Waiting for a board. The code changes every 15 minutes." : "Getting a code…")}
      </p>
    </div>
  );
}
