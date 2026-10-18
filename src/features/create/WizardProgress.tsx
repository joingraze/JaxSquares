// The create flow's step indicator, pinned under the top bar: a segmented
// progress bar and "2 of 5 · How squares win".

import { cx } from "../../components/ui";
import { STEP_INFO, STEPS, stepNumber, type WizardStep } from "./wizard";

export function WizardProgress({ step }: { step: WizardStep }) {
  const n = stepNumber(step);
  return (
    <div className="px-4 pb-2.5">
      <div
        role="progressbar"
        aria-valuemin={1}
        aria-valuemax={STEPS.length}
        aria-valuenow={n}
        aria-valuetext={`Step ${n} of ${STEPS.length}: ${STEP_INFO[step].label}`}
        className="grid gap-1.5"
        style={{ gridTemplateColumns: `repeat(${STEPS.length}, minmax(0, 1fr))` }}
      >
        {STEPS.map((s, i) => (
          <span key={s} className="h-1 overflow-hidden rounded-full bg-ink/12">
            <span
              className={cx(
                "block h-full w-full origin-left rounded-full bg-brand-line transition-transform duration-300 ease-out",
                i < n ? "scale-x-100" : "scale-x-0",
              )}
            />
          </span>
        ))}
      </div>
      <p aria-hidden className="mt-2 truncate text-footnote font-bold text-ink-muted">
        <span className="tabular-nums text-ink-brand">
          {n} of {STEPS.length}
        </span>
        <span className="mx-1.5 text-ink-subtle">·</span>
        {STEP_INFO[step].label}
      </p>
    </div>
  );
}
