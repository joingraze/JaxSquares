// A winner just landed: a short, loud card over the TV board (Jax cheers and
// confetti fly where motion is welcome), then the board comes back on its own.
// It says what they won (the amount and the host's note) and, on a board with
// claim codes, that the code is on their phone: never the code itself.

import { PhoneIcon, RefreshIcon, TrophyIcon } from "../../components/icons";
import { TvAvatar } from "./TvPanel";
import type { TvCelebration } from "./tvModel";

export function TvCelebrate({ celebration }: { celebration: TvCelebration }) {
  const { title, kind, player, amount, prize, score, reverse, claim } = celebration;
  // Nobody had the square but someone had the reverse: they lead the card.
  const headline = player ?? reverse?.player ?? null;
  const headlineAmount = player ? amount : (reverse?.amount ?? null);
  const headlinePrize = player ? prize : (reverse?.prize ?? null);
  return (
    <div className="tv-celebrate" role="status" aria-live="assertive" data-testid="tv-celebrate" data-period={celebration.periodKey}>
      <div className="tv-celebrate-card">
        <p className="tv-eyebrow flex items-center gap-[calc(var(--u)*1)] text-[length:calc(var(--u)*2.6)] text-ink-gold">
          <TrophyIcon filled className="h-[1.2em] w-[1.2em]" />
          {title}
          {kind && <span className="text-ink-muted">· {kind}</span>}
        </p>
        <div className="flex min-w-0 max-w-full items-center gap-[calc(var(--u)*2.4)]">
          <TvAvatar player={headline} size={13} />
          <span className="tv-celebrate-name min-w-0 text-ink">{headline?.name ?? "Someone"}</span>
        </div>
        <p className="tv-text-lg flex flex-wrap items-center justify-center gap-x-[calc(var(--u)*1.6)] text-ink-muted">
          {score && <span className="font-display font-extrabold tabular-nums text-ink">{score}</span>}
          {headlineAmount && <b className="font-display text-[length:calc(var(--u)*4)] font-extrabold tabular-nums text-ink-gold">{headlineAmount}</b>}
        </p>
        {headlinePrize && (
          <p className="font-display text-[length:calc(var(--u)*3.6)] font-extrabold leading-tight text-ink" data-testid="tv-celebrate-prize">
            {headlinePrize}
          </p>
        )}
        {reverse && player && (
          <p className="tv-text-lg flex flex-wrap items-center justify-center gap-[calc(var(--u)*0.8)] text-ink-muted">
            <RefreshIcon className="h-[0.9em] w-[0.9em]" />
            Reverse: <b className="text-ink">{reverse.player?.name ?? "nobody"}</b>
            {reverse.amount && reverse.player && <b className="tabular-nums text-ink-gold">{reverse.amount}</b>}
            {reverse.prize && reverse.player && <span className="text-ink">· {reverse.prize}</span>}
          </p>
        )}
        {claim && (
          <p className="tv-text-md flex items-center gap-[calc(var(--u)*0.8)] text-ink-muted" data-testid="tv-celebrate-claim">
            <PhoneIcon className="h-[1em] w-[1em] shrink-0 text-ink-gold" />
            Your claim code is on your phone. Show it to staff to collect.
          </p>
        )}
      </div>
    </div>
  );
}
