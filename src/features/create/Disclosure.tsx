// One row of the create page's settings card: a one-line summary that opens
// into its editor in place ("Every quarter · 4 winners · 100 squares  Change").

import { useId, type ReactNode } from "react";
import { ChevronDownIcon } from "../../components/icons";
import { cx } from "../../components/ui";
import { haptic } from "../../lib/native";

export interface DisclosureProps {
  open: boolean;
  onToggle: () => void;
  icon: ReactNode;
  title: ReactNode;
  subtitle: ReactNode;
  /** Verb on the closed row ("Change", "Edit"); the open row says "Done". */
  action: string;
  children: ReactNode;
}

export function Disclosure({ open, onToggle, icon, title, subtitle, action, children }: DisclosureProps) {
  const panelId = useId();
  return (
    <div>
      <button
        type="button"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => {
          void haptic("selection");
          onToggle();
        }}
        className="flex min-h-16 w-full items-center gap-3 px-4 py-3 text-left transition-colors active:bg-ink/4"
      >
        <span aria-hidden className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-surface-4 text-ink-muted">
          {icon}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-callout font-bold text-ink">{title}</span>
          <span className="mt-0.5 block truncate text-footnote text-ink-muted">{subtitle}</span>
        </span>
        <span className="shrink-0 text-subhead font-bold text-ink-brand">{open ? "Done" : action}</span>
        <ChevronDownIcon size={18} className={cx("-ml-1 -mr-1 shrink-0 text-ink-subtle transition-transform duration-300", open && "rotate-180")} />
      </button>
      {open && (
        <div id={panelId} className="animate-fade-in border-t border-line px-4 pb-5 pt-4">
          {children}
        </div>
      )}
    </div>
  );
}
