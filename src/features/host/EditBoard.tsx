// Edit board: the name and the per-player cap (only while squares are still
// open). The square price, prizes and notes have their own view, "Rules &
// prizes", which this one points to.

import type { Game } from "../../../shared/types";
import { ChevronRightIcon, TrophyIcon } from "../../components/icons";
import { TextField } from "../../components/ui";
import { MaxSquares } from "../rules/MaxSquares";
import { prizesSummary } from "../rules/rulesModel";
import { canEditMax, editErrors, type EditDraft } from "./hostModel";

export interface EditBoardProps {
  game: Game;
  draft: EditDraft;
  onChange: (draft: EditDraft) => void;
  /** Open the rules & prizes editor. */
  onRules: () => void;
}

const NAME_MAX = 60;

export function EditBoard({ game, draft, onChange, onRules }: EditBoardProps) {
  const errors = editErrors(draft);
  return (
    <div className="flex flex-col gap-5 pb-2">
      <TextField
        label="Board name"
        value={draft.name}
        maxLength={NAME_MAX}
        counter
        autoComplete="off"
        enterKeyHint="done"
        error={errors.name}
        onChange={(e) => onChange({ ...draft, name: e.target.value })}
      />

      <MaxSquares
        value={draft.maxPerPlayer}
        onChange={(v) => onChange({ ...draft, maxPerPlayer: v })}
        total={game.format.boardSize}
        locked={!canEditMax(game)}
        className="rounded-card bg-surface-3/60 px-4 py-3 ring-1 ring-inset ring-line"
      />

      <button
        type="button"
        onClick={onRules}
        className="pressable flex min-h-14 items-center gap-3 rounded-card bg-surface-3/60 px-4 py-3 text-left ring-1 ring-inset ring-line"
      >
        <TrophyIcon size={18} className="shrink-0 text-ink-gold" />
        <span className="min-w-0 flex-1">
          <span className="block text-callout font-bold text-ink">Square price & prizes</span>
          <span className="block truncate text-footnote text-ink-muted">{prizesSummary(game.format)}</span>
        </span>
        <ChevronRightIcon size={18} className="shrink-0 text-ink-subtle" />
      </button>
    </div>
  );
}
