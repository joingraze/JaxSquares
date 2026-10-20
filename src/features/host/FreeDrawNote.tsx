// "Free for up to 5 players": beside the draw on a board that draws for free
// (5 or fewer players hold squares; shared/hostFee.ts), where a price or "Included
// with your Host Pass" would otherwise be.

import { UsersIcon } from "../../components/icons";
import { cx } from "../../components/ui";
import { FREE_DRAW_NOTE } from "./hostModel";

export function FreeDrawNote({ className }: { className?: string }) {
  return (
    <p data-testid="host-free-note" className={cx("flex items-center justify-center gap-1.5 text-footnote font-semibold text-ink-brand", className)}>
      <UsersIcon size={14} strokeWidth={2.4} className="shrink-0" />
      {FREE_DRAW_NOTE}
    </p>
  );
}
