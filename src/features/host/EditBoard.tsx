// Edit board: name, a prize note per period (fun stakes only, checked inline
// with the exact rule the server enforces) and max squares per person while
// squares are still open.

import type { Game } from "../../../shared/types";
import { PRIZE_MAX_LENGTH } from "../../../shared/formats";
import { GiftIcon, LockIcon } from "../../components/icons";
import { Stepper, TextField } from "../../components/ui";
import { canEditMax, editErrors, prizeFields, type EditDraft } from "./hostModel";

export interface EditBoardProps {
  game: Game;
  draft: EditDraft;
  onChange: (draft: EditDraft) => void;
}

const NAME_MAX = 60;

export function EditBoard({ game, draft, onChange }: EditBoardProps) {
  const errors = editErrors(draft);
  const fields = prizeFields(game);
  const maxEditable = canEditMax(game);
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

      <section className="flex flex-col gap-3">
        <div className="px-1">
          <h3 className="flex items-center gap-1.5 text-subhead font-bold text-ink-muted">
            <GiftIcon size={16} className="text-ink-gold" />
            Prizes
          </h3>
          <p className="mt-0.5 text-footnote text-ink-subtle">Bragging rights, snacks, chores. Never money.</p>
        </div>
        {fields.map((f) => (
          <TextField
            key={f.key}
            label={f.label}
            value={draft.prizes[f.key] ?? ""}
            placeholder="Loser buys wings"
            maxLength={PRIZE_MAX_LENGTH}
            counter
            autoComplete="off"
            enterKeyHint="done"
            error={errors.prizes[f.key]}
            onChange={(e) => onChange({ ...draft, prizes: { ...draft.prizes, [f.key]: e.target.value } })}
          />
        ))}
      </section>

      <section className="flex items-center justify-between gap-3 rounded-card bg-surface-3/60 px-4 py-3 ring-1 ring-inset ring-line">
        <div className="min-w-0">
          <p className="text-callout font-bold text-ink">Max squares per person</p>
          <p className="mt-0.5 flex items-center gap-1 text-footnote text-ink-subtle">
            {maxEditable ? (
              draft.maxPerPlayer === 0 ? "Anyone can take as many as they like" : `Nobody can hold more than ${draft.maxPerPlayer}`
            ) : (
              <>
                <LockIcon size={13} /> Locked with the board
              </>
            )}
          </p>
        </div>
        <Stepper
          label="Max squares per person"
          value={draft.maxPerPlayer}
          min={0}
          max={game.format.boardSize}
          disabled={!maxEditable}
          onChange={(v) => onChange({ ...draft, maxPerPlayer: v })}
          format={(v) => (v === 0 ? "∞" : v)}
          valueText={(v) => (v === 0 ? "No limit" : `${v} squares`)}
        />
      </section>
    </div>
  );
}
