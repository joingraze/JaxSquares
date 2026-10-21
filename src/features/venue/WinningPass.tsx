// The winning pass: full screen on a winner's phone at a venue (claim codes
// on, shared/venue.ts). The winner holds it up; staff read the prize and the
// claim code (Host tools lists the same code), hand the prize over and tap
// "Mark collected" right here, or in Host tools. It's alive on purpose: the
// clock ticks by the second and a sheen sweeps across, so a screenshot of
// someone else's pass is easy to spot. The screen stays awake while it's up.

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { countdownText } from "../../../shared/venue";
import { CheckIcon, TrophyIcon, XIcon } from "../../components/icons";
import { Avatar, Button } from "../../components/ui";
import { useNow } from "../board/useNow";
import { useWakeLock } from "../tv/screen";
import "./venue.css";

export interface WinningPassProps {
  boardName: string;
  player: { name: string; color: string; emoji: string } | null;
  /** "Q1", "Final · reverse". */
  label: string;
  /** "Free appetizer", "$25 · Gift card". */
  prize: string | null;
  code: string;
  /** When the time to collect runs out (epoch ms), or null for no limit. */
  deadline: number | null;
  /** When it was marked collected, or null. */
  collectedAt: number | null;
  /** Marks it collected; rejects with a message to show. */
  onCollect: () => Promise<void>;
  onClose: () => void;
}

const clock = (t: number) => new Date(t).toLocaleTimeString([], { hour: "numeric", minute: "2-digit", second: "2-digit" });
const timeOf = (t: number) => new Date(t).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });

export function WinningPass({ boardName, player, label, prize, code, deadline, collectedAt, onCollect, onClose }: WinningPassProps) {
  const now = useNow(1000);
  useWakeLock();
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const close = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    close.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const left = deadline !== null ? deadline - now : null;
  const expired = left !== null && left <= 0;

  const collect = async () => {
    setBusy(true);
    setError(null);
    try {
      await onCollect();
      setConfirming(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't mark it collected. Try again.");
    } finally {
      setBusy(false);
    }
  };

  return createPortal(
    <div className="win-pass" role="dialog" aria-modal="true" aria-label="Winning pass" data-testid="winning-pass">
      <div className="relative flex justify-end">
        <button
          ref={close}
          type="button"
          onClick={onClose}
          aria-label="Close the winning pass"
          className="grid h-11 w-11 place-items-center rounded-full bg-white/10 text-white ring-1 ring-inset ring-white/20 focus-visible:outline-2 focus-visible:outline-gold-300"
          data-testid="winning-pass-close"
        >
          <XIcon size={20} strokeWidth={2.6} />
        </button>
      </div>

      <div className="relative mx-auto flex w-full max-w-sm flex-1 flex-col items-center justify-center gap-5 text-center">
        <div>
          <p className="font-display text-footnote font-extrabold tracking-[0.22em] text-gold-300">WINNING PASS</p>
          <p className="mt-1 line-clamp-2 text-subhead font-semibold text-white/75">{boardName}</p>
        </div>

        <div className="relative grid h-28 w-28 place-items-center">
          <span aria-hidden className="win-pass-glow absolute inset-0 rounded-full" />
          <span className="relative grid h-24 w-24 place-items-center rounded-full bg-gold-400 text-gold-900 shadow-[0_0.5rem_2rem_-0.4rem_rgb(255_171_15/0.8)]">
            <TrophyIcon size={48} filled />
          </span>
        </div>

        {player && (
          <p className="flex items-center gap-2.5 font-display text-title-2 font-extrabold" data-testid="winning-pass-name">
            <Avatar name={player.name} color={player.color} emoji={player.emoji} size="md" decorative />
            {player.name}
          </p>
        )}

        <div>
          <p className="font-display text-headline font-extrabold uppercase tracking-[0.12em] text-gold-300">{label}</p>
          {prize && (
            <p className="mt-1 font-display text-title-1 font-extrabold leading-tight" data-testid="winning-pass-prize">
              {prize}
            </p>
          )}
        </div>

        <div className="win-pass-code w-full rounded-3xl px-5 py-4">
          <p className="text-caption font-extrabold uppercase tracking-[0.18em] opacity-70">Claim code</p>
          <p
            className="font-display text-[3.25rem] font-extrabold leading-none tracking-[0.24em] tabular-nums"
            aria-label={`Claim code ${[...code].join(" ")}`}
            data-testid="winning-pass-code"
          >
            {code}
          </p>
        </div>

        <p className="flex items-center gap-2 text-subhead font-bold tabular-nums text-white/85" data-testid="winning-pass-clock">
          <span aria-hidden className="relative flex h-2.5 w-2.5">
            <span className="absolute inline-flex h-full w-full animate-[live-ping_1.4s_ease-out_infinite] rounded-full bg-live-500" />
            <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-live-500" />
          </span>
          Live · {clock(now)}
        </p>

        {collectedAt !== null ? (
          <div className="win-pass-stamp flex flex-col items-center gap-1" data-testid="winning-pass-collected">
            <p className="flex items-center gap-2 rounded-full bg-brand-400 px-5 py-2 font-display text-headline font-extrabold text-pitch-950">
              <CheckIcon size={20} strokeWidth={3.2} />
              Collected
            </p>
            <p className="text-footnote font-semibold text-white/70">at {timeOf(collectedAt)}</p>
          </div>
        ) : (
          left !== null && (
            <p
              className={expired ? "text-subhead font-bold text-white/80" : left < 60_000 ? "text-headline font-extrabold text-danger-300" : "text-headline font-extrabold text-gold-200"}
              data-testid="winning-pass-countdown"
            >
              {expired ? "Time's up to collect. Ask staff: they can still mark it in Host tools." : `${countdownText(left)} left to collect`}
            </p>
          )
        )}
      </div>

      <div className="relative mx-auto mt-5 flex w-full max-w-sm flex-col gap-2">
        {error && (
          <p role="alert" className="rounded-2xl bg-danger-500/20 px-3.5 py-2.5 text-center text-footnote font-semibold text-white ring-1 ring-inset ring-danger-400/50">
            {error}
          </p>
        )}
        {collectedAt !== null ? (
          <Button size="lg" variant="secondary" onClick={onClose} data-testid="winning-pass-done">
            Done
          </Button>
        ) : expired ? null : confirming ? (
          <>
            <p className="text-center text-footnote font-semibold text-white/75">Staff: hand over the prize, then confirm.</p>
            <Button size="lg" loading={busy} onClick={() => void collect()} data-testid="winning-pass-confirm" variant="gold">
              Prize handed over
            </Button>
            <Button size="lg" variant="ghost" onClick={() => setConfirming(false)} className="!text-white/80">
              Not yet
            </Button>
          </>
        ) : (
          <Button size="lg" variant="gold" onClick={() => setConfirming(true)} data-testid="winning-pass-collect">
            Staff: mark collected
          </Button>
        )}
      </div>
    </div>,
    document.body,
  );
}
