// What TV mode shows (shared/tv.ts): a switch per part, saved as the host
// flips it (shown at once, put back if the save fails), and every TV on the
// board follows. In Host tools ("Show on a smart TV") and behind the TV toolbar's
// "Display" button for the host (or a co-host). "Free to play" only means
// something on a board with no square price, so it's off and says so on one
// that has one.

import { useEffect, useState } from "react";
import type { Game, TvDisplay, TvPart } from "../../../shared/types";
import { TV_PART_INFO, TV_PARTS, tvShowAll } from "../../../shared/tv";
import { Switch } from "../../components/ui";

export interface TvDisplaySettingsProps {
  game: Pick<Game, "format"> & Partial<Pick<Game, "club" | "tv">>;
  /** The choices in force (a season's game board: its season board's); default the board's own. */
  display?: TvDisplay;
  /** Saves the whole set; resolves false when it didn't (the switch goes back). */
  onChange: (next: TvDisplay) => Promise<boolean>;
}

export function TvDisplaySettings({ game, display = game.tv, onChange }: TvDisplaySettingsProps) {
  // The host's latest flips, until the board's state brings them back.
  const [local, setLocal] = useState<TvDisplay | null>(null);
  const saved = JSON.stringify(display ?? {});
  useEffect(() => setLocal(null), [saved]);
  const value = local ?? display;
  const show = tvShowAll(game, value);
  const priced = !!game.format.squarePrice;
  const set = (part: TvPart, on: boolean) => {
    const next = { ...value, [part]: on };
    setLocal(next);
    void onChange(next).then((ok) => {
      if (!ok) setLocal(null);
    });
  };
  return (
    <ul data-testid="tv-display" className="overflow-hidden rounded-2xl bg-surface-3 ring-1 ring-inset ring-line [&>li+li]:border-t [&>li+li]:border-line">
      {TV_PARTS.map((part) => {
        const off = part === "freeToPlay" && priced;
        return (
          <li key={part} className="px-3.5 py-3">
            <Switch
              checked={show[part] && !off}
              onChange={(on) => set(part, on)}
              disabled={off}
              label={TV_PART_INFO[part].label}
              description={off ? "Only on a board with no square price" : TV_PART_INFO[part].description}
              data-testid={`tv-display-${part}`}
            />
          </li>
        );
      })}
    </ul>
  );
}
