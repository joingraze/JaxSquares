// The board's rules for everyone, read-only: what wins when, which square
// (or the reverse square), the amounts (each kind of score's, when every
// score change shows amounts by score type; "the rest of the board total"
// for a final that takes it) and notes, the square price, the
// cap, and the line that the app never collects or sends money. The host also
// gets "Edit rules & prizes", which opens the editor in the host tools.

import { AMOUNTS_DISCLAIMER, BOARD_SIZE_INFO, freshNumbersAllowed, rulesOf, rulesSummary } from "../../../shared/formats";
import { freshNumbersInfo } from "../../../shared/sports";
import type { Game } from "../../../shared/types";
import { InfoIcon, PencilIcon, RefreshIcon, ShuffleIcon, SportIcon, TrophyIcon, UsersIcon } from "../../components/icons";
import { BottomSheet, Button, cx } from "../../components/ui";
import { capLine, priceLine, ruleLines, type RuleLine } from "./rulesModel";
import { VenueRules } from "./VenueRules";

export interface RulesSheetProps {
  open: boolean;
  onClose: () => void;
  game: Pick<Game, "format" | "prizes" | "maxPerPlayer"> & Partial<Pick<Game, "sport" | "league" | "club">>;
  /** Host only: open the editor. */
  onEdit?: () => void;
}

export function RulesSheet({ open, onClose, game, onEdit }: RulesSheetProps) {
  const { format } = game;
  const rules = rulesOf(format, game.prizes);
  const lines = ruleLines(format, game.prizes);
  const price = priceLine(format);
  const cap = capLine(game.maxPerPlayer);
  const fresh = format.freshNumbers && freshNumbersAllowed(rules);
  return (
    <BottomSheet
      open={open}
      onClose={onClose}
      title="Rules & prizes"
      description={`${rulesSummary(rules)} · ${BOARD_SIZE_INFO[format.boardSize].short}`}
      footer={
        onEdit ? (
          <Button data-testid="rules-edit" size="lg" block variant="secondary" leading={<PencilIcon size={18} />} onClick={onEdit}>
            Edit rules & prizes
          </Button>
        ) : null
      }
    >
      <div data-testid="rules-sheet" className="flex flex-col gap-4 pb-2">
        {(format.justForFun || price || cap) && (
          <div className="flex flex-wrap gap-2">
            {format.justForFun && (
              <span className="inline-flex h-9 items-center gap-1.5 rounded-full bg-accent-500/15 px-3.5 text-subhead font-extrabold text-ink-accent ring-1 ring-inset ring-accent-500/35">
                <span aria-hidden>🎉</span> Just for fun
              </span>
            )}
            {price && (
              <span data-testid="rules-price" className="inline-flex h-9 items-center gap-1.5 rounded-full bg-gold-400/15 px-3.5 text-subhead font-extrabold tabular-nums text-ink-gold ring-1 ring-inset ring-gold-line/40">
                {price}
              </span>
            )}
            {cap && (
              <span className="inline-flex h-9 items-center gap-1.5 rounded-full bg-surface-3 px-3.5 text-subhead font-bold text-ink ring-1 ring-inset ring-line-strong">
                <UsersIcon size={15} className="text-ink-muted" />
                {cap}
              </span>
            )}
          </div>
        )}

        <ul className="overflow-hidden rounded-card bg-surface-3/60 ring-1 ring-inset ring-line [&>li+li]:border-t [&>li+li]:border-line">
          {lines.map((line) => (
            <RuleRow key={line.moment} line={line} />
          ))}
        </ul>

        <VenueRules game={game} />

        <div className="flex flex-col gap-2 px-1 text-footnote leading-snug text-ink-muted">
          <p className="flex items-start gap-2">
            <TrophyIcon size={15} className="mt-px shrink-0 text-ink-gold" />
            The square matching the last digit of each team's score wins. Reverse is the square with the two digits swapped.
          </p>
          {fresh && (
            <p className="flex items-start gap-2">
              <ShuffleIcon size={15} className="mt-px shrink-0 text-ink-subtle" />
              New numbers are drawn for each {freshNumbersInfo(game).each}.
            </p>
          )}
          <p className="flex items-start gap-2 text-ink-subtle">
            <InfoIcon size={15} className="mt-px shrink-0" />
            {AMOUNTS_DISCLAIMER}
          </p>
        </div>
      </div>
    </BottomSheet>
  );
}

function RuleRow({ line }: { line: RuleLine }) {
  return (
    <li data-testid="rules-line" data-moment={line.moment} className="flex gap-3 px-3.5 py-3">
      <span
        aria-hidden
        className="grid h-10 min-w-10 shrink-0 place-items-center rounded-xl bg-gold-400 px-1.5 font-display text-footnote font-extrabold text-ink-inverse shadow-[inset_0_1px_0_rgb(255_255_255/0.35)]"
      >
        {line.moment === "score" ? <SportIcon size={18} /> : line.short}
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-callout font-bold text-ink">{line.label}</p>
        <p className="text-caption text-ink-subtle">{line.when}</p>
        <ul className="mt-1.5 flex flex-col gap-1.5">
          {line.sides.map((s) => (
            <li key={s.side} className="flex min-w-0 flex-col gap-1.5">
              <span className="flex min-w-0 items-baseline gap-1.5 text-subhead">
                {s.side === "reverse" ? (
                  <RefreshIcon size={13} className="shrink-0 self-center text-ink-subtle" />
                ) : (
                  <span aria-hidden className="h-2 w-2 shrink-0 self-center rounded-[3px] bg-gold-400" />
                )}
                <span className="shrink-0 font-semibold text-ink-muted">{s.side === "square" ? "Square" : "Reverse"}</span>
                {s.amount && !s.kinds && <b className={cx("shrink-0 font-display font-extrabold tabular-nums text-ink-gold")}>{s.amount}</b>}
                {s.note && <span className="min-w-0 truncate text-ink-muted">· {s.note}</span>}
              </span>
              {s.rest && (
                // The final takes whatever the other prizes didn't give out.
                <span data-testid="rules-rest" className="rounded-lg bg-gold-400/10 px-2.5 py-1.5 text-footnote leading-snug ring-1 ring-inset ring-gold-line/30">
                  <b className="font-display font-extrabold text-ink-gold">The rest of the board total</b>
                  <span className="text-ink-muted">, everything not won during the game</span>
                </span>
              )}
              {s.kinds && (
                // Amounts by score type: each kind of score with what it shows.
                <span data-testid="rules-kinds" data-side={s.side} className="grid grid-cols-2 gap-1.5">
                  {s.kinds.map((k) => (
                    <span
                      key={k.kind}
                      data-kind={k.kind}
                      className="flex min-w-0 items-center justify-between gap-2 rounded-lg bg-surface-4/70 px-2.5 py-1.5 ring-1 ring-inset ring-line"
                    >
                      <span className="min-w-0 text-footnote font-semibold leading-tight text-ink-muted">{k.label}</span>
                      <b className="shrink-0 font-display text-subhead font-extrabold tabular-nums text-ink-gold">{k.amount}</b>
                    </span>
                  ))}
                </span>
              )}
            </li>
          ))}
        </ul>
      </div>
    </li>
  );
}
