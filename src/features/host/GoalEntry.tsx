// A soccer board's score entry for the host (goalModel.ts, useGoalEntry.ts):
// the goals so far (tap one to fix it), then the new goal: which side scored
// and the minute the match showed, with any stoppage time ("45 + 2"). The
// footer previews whose square that minute is and saves it; full time ends
// the match.

import type { GameState, Player, Team } from "../../../shared/types";
import { CheckIcon, PencilIcon, TrophyIcon } from "../../components/icons";
import { Avatar, cx, TeamMark } from "../../components/ui";
import { haptic } from "../../lib/native";
import { NEXT_ENTRY } from "./hostModel";
import { goalRows, minuteProblem, type GoalSide } from "./goalModel";
import type { SavedNotice } from "./ScorePad";
import type { GoalEntryState } from "./useGoalEntry";

/** The goals so far and the form for the next one (or the one being fixed). */
export function GoalEntry({ state, goal, teamX, teamY, onRemove, busy }: { state: GameState; goal: GoalEntryState; teamX: Team; teamY: Team; onRemove: (key: string) => void; busy: boolean }) {
  const rows = goalRows(state);
  const fixing = goal.key !== NEXT_ENTRY ? rows.find((r) => r.key === goal.key) : undefined;
  const problem = minuteProblem(goal.draft);
  const teamFor = (side: GoalSide) => (side === "x" ? teamX : teamY);
  const nextLabel = `Goal ${rows.length + 1}`;
  return (
    <div data-testid="goal-entry" className="flex flex-col gap-3">
      {rows.length > 0 && (
        <ol aria-label="Goals so far" className="overflow-hidden rounded-2xl bg-surface-3 ring-1 ring-inset ring-line [&>li+li]:border-t [&>li+li]:border-line">
          {rows.map((r) => {
            const on = r.key === goal.key;
            return (
              <li key={r.key}>
                <button
                  type="button"
                  data-testid="goal-row"
                  data-key={r.key}
                  aria-pressed={on}
                  onClick={() => {
                    void haptic("selection");
                    goal.setKey(on ? NEXT_ENTRY : r.key);
                  }}
                  className={cx("pressable flex min-h-12 w-full items-center gap-3 px-3.5 py-2 text-left", on && "bg-brand-400/10")}
                >
                  <TeamMark team={teamFor(r.team)} size="sm" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-callout font-bold text-ink">
                      {r.label} · {teamFor(r.team).abbr || teamFor(r.team).name}
                    </span>
                    <span className="block text-caption tabular-nums text-ink-muted">
                      {teamX.abbr || teamX.name} {r.scoreX}–{r.scoreY} {teamY.abbr || teamY.name}
                    </span>
                  </span>
                  <span className="shrink-0 font-display text-headline font-extrabold tabular-nums text-ink">{r.minute}</span>
                  <PencilIcon size={15} className={cx("shrink-0", on ? "text-ink-brand" : "text-ink-subtle")} />
                </button>
              </li>
            );
          })}
        </ol>
      )}

      <div className="flex min-h-9 items-center justify-between gap-2 px-1">
        <p className="font-display text-headline font-extrabold text-ink">{fixing ? `Fixing ${fixing.label}` : rows.length === 0 ? "A goal! Who scored?" : `${nextLabel}: who scored?`}</p>
        {fixing && (
          <button
            type="button"
            disabled={busy}
            onClick={() => onRemove(fixing.key)}
            className="pressable tap-target rounded-full px-1 py-1.5 text-footnote font-bold text-ink-danger disabled:opacity-40"
          >
            Remove {fixing.label}
          </button>
        )}
      </div>

      <div role="radiogroup" aria-label="Who scored" className="grid grid-cols-2 gap-2.5">
        {(["x", "y"] as const).map((side) => {
          const team = teamFor(side);
          const on = goal.draft.team === side;
          return (
            <button
              key={side}
              type="button"
              role="radio"
              aria-checked={on}
              data-testid={`goal-team-${side}`}
              onClick={() => goal.setTeam(side)}
              className={cx(
                "pressable flex min-h-14 items-center gap-2.5 rounded-2xl px-3 text-left ring-inset transition-[background-color,box-shadow]",
                on ? "bg-brand-400/12 ring-2 ring-brand-line" : "bg-surface-3 ring-1 ring-line hover:bg-surface-4",
              )}
            >
              <TeamMark team={team} size="sm" />
              <span className="min-w-0 flex-1 truncate font-display text-headline font-extrabold uppercase leading-tight text-ink">{team.abbr || team.name}</span>
              {on && <CheckIcon size={16} strokeWidth={3} className="shrink-0 text-ink-brand" />}
            </button>
          );
        })}
      </div>

      <div className="flex items-end gap-2.5">
        <label className="flex min-w-0 flex-1 flex-col gap-1">
          <span className="px-1 text-caption font-bold text-ink-muted">Minute</span>
          <span className="flex h-14 items-center rounded-2xl bg-surface-3 px-3.5 ring-1 ring-inset ring-line-strong focus-within:ring-2 focus-within:ring-brand-line">
            <input
              data-testid="goal-minute"
              inputMode="numeric"
              autoComplete="off"
              enterKeyHint="done"
              placeholder="43"
              aria-invalid={!!problem || undefined}
              value={goal.draft.minute}
              onChange={(e) => goal.setMinute(e.target.value)}
              className="w-full min-w-0 bg-transparent font-display text-title-2 font-extrabold tabular-nums text-ink outline-none placeholder:text-ink-subtle"
            />
            <span aria-hidden className="font-display text-title-3 font-extrabold text-ink-subtle">'</span>
          </span>
        </label>
        <span aria-hidden className="pb-3.5 font-display text-title-3 font-extrabold text-ink-subtle">+</span>
        <label className="flex w-28 shrink-0 flex-col gap-1">
          <span className="px-1 text-caption font-bold text-ink-muted">Stoppage</span>
          <span className="flex h-14 items-center rounded-2xl bg-surface-3 px-3.5 ring-1 ring-inset ring-line focus-within:ring-2 focus-within:ring-brand-line">
            <input
              data-testid="goal-added"
              inputMode="numeric"
              autoComplete="off"
              enterKeyHint="done"
              placeholder="0"
              value={goal.draft.added}
              onChange={(e) => goal.setAdded(e.target.value)}
              className="w-full min-w-0 bg-transparent font-display text-title-2 font-extrabold tabular-nums text-ink outline-none placeholder:text-ink-subtle"
            />
          </span>
        </label>
      </div>
      <p className={cx("px-1 text-footnote leading-snug", problem ? "font-semibold text-ink-danger" : "text-ink-subtle")}>
        {problem ?? "The minute the match showed. A goal in first-half stoppage time (45+2') counts as the 45th minute."}
      </p>
    </div>
  );
}

/** The footer line above Save: whose square this goal's minute is, and what it wins. */
export function GoalPreviewLine({ state, goal, me, notice }: { state: GameState; goal: GoalEntryState; me: string; notice: SavedNotice | null }) {
  if (notice) {
    return (
      <div className="flex min-h-12 items-center gap-3 pb-3 animate-pop" aria-live="polite" data-testid="score-saved">
        {notice.player ? (
          <Avatar name={notice.player.name} color={notice.player.color} emoji={notice.player.emoji} size="md" ring="gold" decorative />
        ) : (
          <span className={cx("grid h-10 w-10 shrink-0 place-items-center rounded-full", notice.tone === "win" ? "bg-gold-400 text-ink-inverse" : "bg-brand-400 text-ink-inverse")}>
            {notice.tone === "win" ? <TrophyIcon size={18} filled /> : <CheckIcon size={18} strokeWidth={3} />}
          </span>
        )}
        <div className="min-w-0 flex-1">
          <p className={cx("truncate text-callout font-extrabold", notice.tone === "win" ? "text-ink-gold" : "text-ink")}>{notice.title}</p>
          {notice.detail && <p className="truncate text-footnote text-ink-muted">{notice.detail}</p>}
        </div>
      </div>
    );
  }
  const p = goal.preview;
  if (!p) {
    const hint = !goal.draft.team ? "Pick who scored, then the minute." : "Add the minute to see whose square it is.";
    return <p className="flex min-h-12 items-center px-1 pb-3 text-footnote font-semibold text-ink-muted">{hint}</p>;
  }
  const owner: Player | null = p.ownerId ? (state.players.find((x) => x.id === p.ownerId) ?? null) : null;
  const what = p.wins.length > 0 ? p.wins.join(" + ") : null;
  return (
    <div className="flex min-h-12 items-center gap-3 pb-3" aria-live="polite" data-testid="goal-preview">
      {owner ? (
        <Avatar name={owner.name} color={owner.color} emoji={owner.emoji} size="md" ring={owner.id === me ? "brand" : "none"} decorative />
      ) : (
        <span aria-hidden className="grid h-10 w-10 shrink-0 place-items-center rounded-full border-2 border-dashed border-line-strong text-ink-subtle">
          ?
        </span>
      )}
      <div className="min-w-0 flex-1">
        <p className="truncate text-callout font-extrabold text-ink">
          {p.text} · {owner ? (owner.id === me ? "your square" : `${owner.name}'s square`) : "an empty square"}
        </p>
        <p className="truncate text-footnote text-ink-muted">{what ? `${owner ? (owner.id === me ? "You'd win" : `${owner.name} would win`) : "Nobody wins"} ${what}` : "Saved as a goal"}</p>
      </div>
    </div>
  );
}
