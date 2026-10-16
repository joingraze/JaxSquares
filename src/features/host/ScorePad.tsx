// Score entry for the host: two big team tiles (real inputs, so a hardware
// keyboard and test harnesses can type), a chunky on-screen keypad that never
// summons the phone keyboard, football quick-adds for every-score boards, and
// a live "who wins if you save this" preview.

import type { ReactNode } from "react";
import type { GameState, Player, Team } from "../../../shared/types";
import { ChevronLeftIcon, ChevronRightIcon, TrophyIcon } from "../../components/icons";
import { Avatar, cx } from "../../components/ui";
import { haptic } from "../../lib/native";
import { QUICK_ADDS, isUnchangedEntry, type PadKey } from "./hostModel";
import type { ScoreEntry, Side } from "./useScoreEntry";

// ---- Tiles ----

export function ScoreTiles({ teamX, teamY, entry }: { teamX: Team; teamY: Team; entry: ScoreEntry }) {
  return (
    <div className="grid grid-cols-2 gap-2.5">
      <Tile side="x" team={teamX} entry={entry} />
      <Tile side="y" team={teamY} entry={entry} />
    </div>
  );
}

function Tile({ side, team, entry }: { side: Side; team: Team; entry: ScoreEntry }) {
  const active = entry.active === side;
  const value = entry.draft[side];
  return (
    <label
      ref={entry.tileRefs[side]}
      data-side={side}
      data-active={active}
      className="hx-tile block cursor-text"
      onPointerDown={() => {
        if (!active) void haptic("selection");
      }}
    >
      <span className="relative flex items-center gap-2 px-3 pt-3">
        <span
          aria-hidden
          className={cx("h-2.5 w-2.5 shrink-0 rounded-full", side === "x" ? "bg-team-x" : "bg-team-y")}
        />
        <span className="min-w-0 flex-1 truncate text-footnote font-extrabold uppercase tracking-[0.06em] text-ink-muted">
          {team.abbr || team.name}
        </span>
        <span className="truncate text-caption font-semibold text-ink-subtle">{team.abbr ? team.name : ""}</span>
      </span>
      <input
        ref={entry.inputRefs[side]}
        data-testid={side === "x" ? "score-x" : "score-y"}
        aria-label={`${team.name} score`}
        inputMode="none"
        autoComplete="off"
        enterKeyHint="done"
        placeholder="–"
        value={value}
        onFocus={(e) => {
          entry.setActive(side);
          e.currentTarget.select();
        }}
        onChange={(e) => entry.type(side, e.target.value)}
        className="hx-score-input relative h-[4.25rem]"
      />
    </label>
  );
}

// ---- Keypad ----

const DIGITS: PadKey[] = ["1", "2", "3", "4", "5", "6", "7", "8", "9"];

export function Keypad({
  entry,
  teamX,
  teamY,
  quickAdds,
}: {
  entry: ScoreEntry;
  teamX: Team;
  teamY: Team;
  quickAdds: boolean;
}) {
  const other = entry.active === "x" ? teamY : teamX;
  const keep = (e: { preventDefault: () => void }) => e.preventDefault();
  const activeTeam = entry.active === "x" ? teamX : teamY;
  return (
    <div className="flex flex-col gap-2">
      {quickAdds && (
        <div className="grid grid-cols-4 gap-2" role="group" aria-label={`Add points for ${activeTeam.name}`}>
          {QUICK_ADDS.map((q) => (
            <button
              key={q.points}
              type="button"
              tabIndex={-1}
              onMouseDown={keep}
              onClick={() => entry.add(q.points)}
              aria-label={`Add ${q.points} for ${activeTeam.name}`}
              className={cx(
                "pressable flex h-12 flex-col items-center justify-center rounded-2xl ring-1 ring-inset",
                entry.active === "x"
                  ? "bg-[color-mix(in_srgb,var(--team-x)_16%,var(--color-surface-3))] ring-[color-mix(in_srgb,var(--team-x)_40%,transparent)]"
                  : "bg-[color-mix(in_srgb,var(--team-y)_16%,var(--color-surface-3))] ring-[color-mix(in_srgb,var(--team-y)_40%,transparent)]",
              )}
            >
              <span className="font-display text-headline font-extrabold leading-none tabular-nums">+{q.points}</span>
              <span className="mt-0.5 text-[0.625rem] font-extrabold uppercase tracking-[0.08em] text-ink-muted">{q.label}</span>
            </button>
          ))}
        </div>
      )}
      <div className="grid grid-cols-3 gap-2" role="group" aria-label={`Keypad for ${activeTeam.name}`}>
        {DIGITS.map((d) => (
          <button key={d} type="button" tabIndex={-1} onMouseDown={keep} onClick={() => entry.press(d)} className="hx-key">
            {d}
          </button>
        ))}
        <button
          type="button"
          tabIndex={-1}
          onMouseDown={keep}
          onClick={() => entry.press("back")}
          aria-label="Delete digit"
          data-tone="soft"
          className="hx-key"
        >
          <BackspaceGlyph />
        </button>
        <button type="button" tabIndex={-1} onMouseDown={keep} onClick={() => entry.press("0")} className="hx-key">
          0
        </button>
        <button
          type="button"
          tabIndex={-1}
          onMouseDown={keep}
          onClick={() => {
            void haptic("selection");
            entry.focusSide(entry.active === "x" ? "y" : "x");
          }}
          aria-label={`Switch to ${other.name}`}
          data-tone="soft"
          className="hx-key"
        >
          <span className="flex items-center gap-1 font-extrabold text-ink">
            {entry.active === "y" && <ChevronLeftIcon size={16} strokeWidth={2.6} />}
            <span
              aria-hidden
              className={cx("h-2 w-2 rounded-full", entry.active === "x" ? "bg-team-y" : "bg-team-x")}
            />
            {other.abbr || other.name.slice(0, 4)}
            {entry.active === "x" && <ChevronRightIcon size={16} strokeWidth={2.6} />}
          </span>
        </button>
      </div>
    </div>
  );
}

function BackspaceGlyph() {
  return (
    <svg viewBox="0 0 24 24" width={24} height={24} fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M21 5H9l-6 7 6 7h12a1 1 0 0 0 1-1V6a1 1 0 0 0-1-1Z" />
      <path d="m16 9-5 5M11 9l5 5" />
    </svg>
  );
}

// ---- Who wins ----

export function ScorePreview({
  state,
  entry,
  label,
  me,
}: {
  state: GameState;
  entry: ScoreEntry;
  label: string;
  me: string;
}) {
  const { game } = state;
  const p = entry.preview;
  const playerBy = (id: string | null): Player | null => (id ? (state.players.find((x) => x.id === id) ?? null) : null);

  if (isUnchangedEntry(state, entry.key, entry.draft)) {
    return (
      <div className="flex min-h-12 items-center gap-3 pb-3" aria-live="polite">
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-surface-4 text-ink-subtle">
          <TrophyIcon size={18} />
        </span>
        <p className="text-subhead font-semibold text-ink-muted">Pick the team that scored, then tap their points.</p>
      </div>
    );
  }

  if (!p) {
    return (
      <div className="flex min-h-12 items-center gap-3 pb-3" aria-live="polite">
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-surface-4 text-ink-subtle">
          <TrophyIcon size={18} />
        </span>
        <p className="text-subhead font-semibold text-ink-muted">Enter both scores to see who wins {label}.</p>
      </div>
    );
  }

  const manualOwner = p.manual ? playerBy(ownerAt(state, p.manual.row, p.manual.col)) : null;
  const owner = playerBy(p.ownerId);
  const reverseOwner = p.reverse ? playerBy(p.reverse.ownerId) : null;
  const mine = p.ownerId === me;
  let title: ReactNode;
  let sub: string | null = p.prize;
  if (p.manual) {
    title = (
      <>
        Your pick{manualOwner ? <> (<b className="font-extrabold text-ink">{manualOwner.name}</b>)</> : null} keeps {label}
      </>
    );
    sub = "Undo the pick to use this score.";
  } else if (owner) {
    title = mine ? (
      <>
        <b className="font-extrabold text-brand-300">You</b> win {label}
      </>
    ) : (
      <>
        <b className="font-extrabold text-ink">{owner.name}</b> wins {label}
      </>
    );
  } else {
    title = <>Nobody has that square</>;
    sub = "Crown one by hand after saving.";
  }

  return (
    <div className="flex min-h-12 items-center gap-3 pb-3" aria-live="polite">
      {owner && !p.manual ? (
        <Avatar key={owner.id} name={owner.name} color={owner.color} emoji={owner.emoji} size="md" ring="gold" decorative className="animate-pop" />
      ) : (
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-surface-4 text-ink-subtle">
          <TrophyIcon size={18} />
        </span>
      )}
      <div className="min-w-0 flex-1">
        <p className="truncate text-callout font-semibold text-ink-muted">{title}</p>
        {(sub || reverseOwner || p.reverse) && (
          <p className="truncate text-footnote text-ink-subtle">
            {p.reverse ? <>Reverse: {reverseOwner ? (reverseOwner.id === me ? "You" : reverseOwner.name) : "empty square"}{sub ? " · " : ""}</> : null}
            {sub}
          </p>
        )}
      </div>
      <span className="flex shrink-0 items-center gap-1" aria-label={`${game.teamX.abbr || game.teamX.name} ${p.digitX}, ${game.teamY.abbr || game.teamY.name} ${p.digitY}`}>
        <span className="grid h-8 min-w-8 place-items-center rounded-lg bg-team-x px-1 font-display text-callout font-extrabold text-team-x-ink">{p.digitX}</span>
        <span className="grid h-8 min-w-8 place-items-center rounded-lg bg-team-y px-1 font-display text-callout font-extrabold text-team-y-ink">{p.digitY}</span>
      </span>
    </div>
  );
}

function ownerAt(state: GameState, row: number, col: number): string | null {
  return state.squares.find((s) => s.row === row && s.col === col)?.playerId ?? null;
}
