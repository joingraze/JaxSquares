// Optional details, opened from the settings card's "Edit": the board name
// (auto-filled until edited) and the per-player cap. Prices, prizes and notes
// have their own row ("Square price & prizes").

import type { GameFormat } from "../../../shared/types";
import { TextField } from "../../components/ui";
import { MaxSquares } from "../rules/MaxSquares";
import { BOARD_NAME_MAX } from "./model";

export interface DetailsPanelProps {
  format: GameFormat;
  /** What the board will be called (auto or typed). */
  name: string;
  autoName: string;
  onName: (name: string) => void;
  maxPerPlayer: number;
  onMaxPerPlayer: (n: number) => void;
}

export function DetailsPanel({ format, name, autoName, onName, maxPerPlayer, onMaxPerPlayer }: DetailsPanelProps) {
  return (
    <div className="flex flex-col gap-5">
      <TextField
        label="Board name"
        value={name}
        placeholder={autoName || "Sunday Squares"}
        maxLength={BOARD_NAME_MAX}
        counter
        autoComplete="off"
        enterKeyHint="done"
        onChange={(e) => onName(e.target.value)}
        hint={name ? undefined : "We'll use the matchup if you leave this blank."}
      />
      <MaxSquares value={maxPerPlayer} onChange={onMaxPerPlayer} total={format.boardSize} />
    </div>
  );
}
