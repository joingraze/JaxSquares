// The recap's way in from the board's results: a full-width card once the
// game is final ("Share the recap", Jax cheering), a small pill beside "Rules
// & prizes" while winners are still landing.

import { ShareIcon } from "../../components/icons";
import { Button, Jax } from "../../components/ui";
import { haptic } from "../../lib/native";

export function RecapCta({ onOpen }: { onOpen: () => void }) {
  return (
    <section aria-label="Share the recap" data-testid="recap-cta" className="mt-3 rounded-card bg-gold-400/10 p-3 ring-1 ring-inset ring-gold-line/35">
      <div className="flex items-center gap-3">
        <span aria-hidden className="grid h-14 w-14 shrink-0 place-items-center overflow-hidden">
          <Jax pose="cheer" size={54} />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block font-display text-headline font-extrabold leading-snug text-ink">That's the game</span>
          <span className="block text-footnote leading-snug text-ink-muted">The final score and every winner, on one card for the group chat.</span>
        </span>
      </div>
      <Button data-testid="recap-open" variant="gold" size="md" block className="mt-2.5" leading={<ShareIcon size={18} />} onClick={onOpen}>
        Share the recap
      </Button>
    </section>
  );
}

export function RecapPill({ onOpen }: { onOpen: () => void }) {
  return (
    <button
      type="button"
      data-testid="recap-open"
      onClick={() => {
        void haptic("selection");
        onOpen();
      }}
      className="pressable tap-target flex h-7 items-center gap-1 rounded-full bg-gold-400/15 px-2.5 text-caption font-extrabold text-ink-gold ring-1 ring-inset ring-gold-line/40"
    >
      <ShareIcon size={12} />
      Recap
    </button>
  );
}
