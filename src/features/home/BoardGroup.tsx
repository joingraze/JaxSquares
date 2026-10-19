// Several of my boards for one game, held together on Home under one label
// ("Chiefs vs Bills · 3 boards"): each board keeps its own card and action.

import type { ReactNode } from "react";
import { GridIcon } from "../../components/icons";

export function BoardGroup({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div role="group" aria-label={label} data-testid="home-board-group" className="flex flex-col gap-2 rounded-[1.625rem] bg-surface-2/50 p-1.5 ring-1 ring-inset ring-line">
      <p className="flex items-center gap-1.5 px-2.5 pt-1 text-footnote font-bold text-ink-muted">
        <GridIcon size={13} className="shrink-0 text-ink-subtle" />
        <span className="truncate">{label}</span>
      </p>
      <div className="flex flex-col gap-2">{children}</div>
    </div>
  );
}
