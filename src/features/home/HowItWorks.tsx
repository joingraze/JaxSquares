// Three-step explainer for people new to squares, shown on a short dashboard.

import { TrophyIcon } from "../../components/icons";

const STEPS = [
  {
    title: "Grab your squares",
    body: "Tap any open squares. Friends join from your link.",
    art: (
      <span className="grid h-full w-full grid-cols-2 gap-[3px] p-[7px]">
        <span className="rounded-[3px] bg-white/12" />
        <span className="rounded-[3px] bg-brand-400" />
        <span className="rounded-[3px] bg-accent-400/80" />
        <span className="rounded-[3px] bg-white/12" />
      </span>
    ),
  },
  {
    title: "Numbers get drawn",
    body: "When the board locks, each row and column gets a random 0–9.",
    art: <span className="font-display text-headline font-extrabold text-ink">7</span>,
  },
  {
    title: "Last digits win",
    body: (
      <>
        End of a quarter at <span className="font-bold text-ink">24–17</span>? The{" "}
        <span className="font-bold text-gold-300">4·7</span> square wins.
      </>
    ),
    art: <TrophyIcon size={18} strokeWidth={2.4} className="text-ink-inverse" />,
    gold: true,
  },
];

export function HowItWorks() {
  return (
    <section aria-labelledby="home-how" className="rounded-card p-4 ring-1 ring-inset ring-line">
      <h2 id="home-how" className="eyebrow mb-3 text-ink-subtle">
        How squares works
      </h2>
      <ol className="flex flex-col gap-3.5">
        {STEPS.map((step, i) => (
          <li key={i} className="flex items-start gap-3">
            <span
              aria-hidden
              className={
                step.gold
                  ? "grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-gold-400 shadow-glow-gold"
                  : "grid h-9 w-9 shrink-0 place-items-center overflow-hidden rounded-xl bg-surface-3 ring-1 ring-inset ring-line-strong"
              }
            >
              {step.art}
            </span>
            <div className="min-w-0 pt-0.5">
              <p className="text-subhead font-extrabold text-ink">{step.title}</p>
              <p className="mt-0.5 text-footnote text-ink-muted">{step.body}</p>
            </div>
          </li>
        ))}
      </ol>
    </section>
  );
}
