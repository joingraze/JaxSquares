// The create flow's first question: who's playing? Friends and family (a
// square price or just for fun), or a bar or restaurant's crowd (venue mode,
// shared/venue.ts), so every step after it speaks to that host: prizes first,
// the venue's name, one square each, then the TV.

import { TvIcon, UsersIcon } from "../../components/icons";
import { cx } from "../../components/ui";
import { haptic } from "../../lib/native";

export type Audience = "friends" | "venue";

const OPTIONS: { value: Audience; label: string; hint: string; icon: typeof UsersIcon }[] = [
  { value: "friends", label: "Friends & family", hint: "A square price, or just for fun", icon: UsersIcon },
  { value: "venue", label: "A bar or restaurant", hint: "Free to play, prizes from you", icon: TvIcon },
];

export function AudiencePicker({ value, onChange }: { value: Audience; onChange: (audience: Audience) => void }) {
  return (
    <section aria-label="Who's playing?" className="flex flex-col gap-2">
      <p className="eyebrow px-1 text-ink-subtle">Who's playing?</p>
      <div role="radiogroup" aria-label="Who's playing?" data-testid="audience" className="grid grid-cols-2 gap-2">
        {OPTIONS.map(({ value: option, label, hint, icon: Icon }) => {
          const selected = value === option;
          return (
            <button
              key={option}
              type="button"
              role="radio"
              aria-checked={selected}
              data-testid="audience-option"
              data-audience={option}
              onClick={() => {
                if (selected) return;
                void haptic("selection");
                onChange(option);
              }}
              className={cx(
                "pressable flex min-h-18 items-start gap-2.5 rounded-2xl px-3 py-2.5 text-left ring-inset transition-[background-color,box-shadow]",
                selected
                  ? "bg-[linear-gradient(160deg,rgb(198_249_31/0.18),rgb(198_249_31/0.03)_65%)] bg-surface-3 ring-2 ring-brand-line"
                  : "bg-surface-3 ring-1 ring-line hover:bg-surface-4",
              )}
            >
              <Icon size={20} className={cx("mt-0.5 shrink-0", selected ? "text-ink-brand" : "text-ink-muted")} />
              <span className="min-w-0">
                <span className={cx("block text-subhead font-bold leading-tight", selected ? "text-ink" : "text-ink-muted")}>{label}</span>
                <span className="mt-0.5 block text-caption leading-snug text-ink-subtle">{hint}</span>
              </span>
            </button>
          );
        })}
      </div>
    </section>
  );
}
