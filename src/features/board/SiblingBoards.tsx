// "More boards for this game": a board in a group (a host's $1, $5 and $20
// boards on one game) lists the others in one compact row under the grid:
// each board's name, its square price when the host set one ("$5 a square",
// in-app only), how many squares are left (or where it stands), and a tap to
// open it. The list rides along with the board's state (GameState.siblings).

import { Link } from "react-router-dom";
import { shortSiblingName, siblingPriceLine, siblingStatusLine } from "../../../shared/siblings";
import type { SiblingBoard } from "../../../shared/types";
import { ChevronRightIcon, GridIcon } from "../../components/icons";
import { cx } from "../../components/ui";
import { prefetchGame } from "../../lib/live";
import { haptic } from "../../lib/native";

/** DOM id of the row, so the invite hero's "See them" can bring it into view. */
export const SIBLING_BOARDS_ID = "sibling-boards";

export function SiblingBoards({ siblings, boardName = "", className }: { siblings: readonly SiblingBoard[]; boardName?: string; className?: string }) {
  if (siblings.length === 0) return null;
  // "Board 3" rather than "Office Squares · Bo…" when this board shares the name.
  const names = [boardName, ...siblings.map((s) => s.name)].filter(Boolean);
  return (
    <section id={SIBLING_BOARDS_ID} aria-labelledby="sibling-boards-title" data-testid="sibling-boards" className={cx("scroll-mt-24", className)}>
      <p id="sibling-boards-title" className="eyebrow mb-2 flex items-center gap-1.5 px-1 text-ink-subtle">
        <GridIcon size={12} className="shrink-0" />
        More boards for this game
      </p>
      <ul className="flex snap-x snap-mandatory gap-2 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {siblings.map((s) => {
          const price = siblingPriceLine(s);
          const open = s.status === "open" || s.status === "draft";
          return (
            <li key={s.id} className={cx("shrink-0 snap-start", siblings.length === 1 ? "w-full" : "w-[12.5rem]")}>
              <Link
                to={`/g/${encodeURIComponent(s.id)}`}
                data-testid="sibling-board"
                data-board={s.id}
                onPointerDown={() => void prefetchGame(s.id)}
                onClick={() => void haptic("selection")}
                className="pressable flex min-h-14 items-center gap-2 rounded-2xl bg-surface-2 py-2 pl-3.5 pr-2 ring-1 ring-inset ring-line hover:bg-surface-3"
              >
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-subhead font-extrabold leading-snug text-ink">{shortSiblingName(s.name, names)}</span>
                  <span className="flex min-w-0 items-center gap-1.5 text-footnote leading-snug">
                    {price && <span className="truncate font-bold tabular-nums text-ink-gold">{price}</span>}
                    {price && <span aria-hidden className="text-ink-subtle">·</span>}
                    <span className={cx("shrink-0 font-semibold tabular-nums", open && s.squaresLeft > 0 ? "text-ink-brand" : "text-ink-muted")}>
                      {siblingStatusLine(s)}
                    </span>
                  </span>
                </span>
                <ChevronRightIcon size={16} strokeWidth={2.6} className="shrink-0 text-ink-subtle" />
              </Link>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
