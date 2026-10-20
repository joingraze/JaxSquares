// The create flow's final touches: the board name (auto-filled from the
// matchup until edited) and the per-player cap. Prices, prizes and notes have
// their own step ("Square price & prizes").

import { MONEY_ERRORS, mentionsMoney } from "../../../shared/formats";
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

/** DOM id of the board name input (focused when the name blocks Next). */
export const BOARD_NAME_INPUT_ID = "board-name";

export function DetailsPanel({ format, name, autoName, onName, maxPerPlayer, onMaxPerPlayer }: DetailsPanelProps) {
  return (
    <div className="flex flex-col gap-5">
      <TextField
        id={BOARD_NAME_INPUT_ID}
        data-testid="board-name"
        label="Board name"
        value={name}
        placeholder={autoName || "Sunday Squares"}
        maxLength={BOARD_NAME_MAX}
        counter
        autoComplete="off"
        enterKeyHint="done"
        onChange={(e) => onName(e.target.value)}
        onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
        error={mentionsMoney(name) ? MONEY_ERRORS.name : undefined}
        hint={name ? undefined : "We'll use the matchup if you leave this blank."}
        inputClassName="font-semibold"
      />
      <MaxSquares
        value={maxPerPlayer}
        onChange={onMaxPerPlayer}
        total={format.boardSize}
        className="rounded-card bg-surface-2 px-4 py-3.5 ring-1 ring-inset ring-line"
      />
    </div>
  );
}
