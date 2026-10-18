// Score entry for the host: two big team tiles (real inputs, so a hardware
// keyboard and test harnesses can type), a chunky on-screen keypad that never
// summons the phone keyboard, football quick-adds for every-score boards, and
// a live "who wins if you save this" preview.

import type { ReactNode } from "react";
import type { GameState, Player, Team } from "../../../shared/types";
import { CheckIcon, ChevronLeftIcon, ChevronRightIcon, TrophyIcon } from "../../components/icons";
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
      <span className="relative flex items-center gap-2 px-3 pt-2.5">
        <span
          aria-hidden
          className={cx("h-3 w-3 shrink-0 rounded-full ring-2 ring-ink/15", side === "x" ? "bg-team-x" : "bg-team-y")}
        />
        <span className="min-w-0 flex-1 truncate font-display text-headline font-extrabold uppercase leading-tight tracking-[0.02em] text-ink">
          {team.abbr || team.name}
        </span>
        {active && (
          <span className="shrink-0 rounded-full bg-ink/10 px-2 py-0.5 text-caption font-bold text-ink">Typing</span>
        )}
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
        className="hx-score-input relative h-[3.75rem]"
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
        <p className="-mb-0.5 px-1 text-footnote font-bold text-ink-muted">
          Points for <span className="font-extrabold text-ink">{activeTeam.abbr || activeTeam.name}</span>
        </p>
      )}
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

// ---- Suggestion ----

/** "Same as Q1? KC 7 – 3 BUF  [Use]": the host confirms a carried-over score with one tap. */
export function SuggestionChip({ entry, teamX, teamY }: { entry: ScoreEntry; teamX: Team; teamY: Team }) {
  const s = entry.suggestion;
  if (!s) return null;
  const used = entry.usingSuggestion;
  const abbr = (t: Team) => t.abbr || t.name;
  return (
    <button
      type="button"
      tabIndex={-1}
      onMouseDown={(e) => e.preventDefault()}
      onClick={() => entry.fill(s.draft)}
      aria-pressed={used}
      className={cx(
        "pressable flex min-h-11 w-full items-center gap-3 rounded-2xl px-3.5 py-2 text-left ring-1 ring-inset transition-colors",
        used ? "bg-brand-400/10 ring-brand-line/45" : "bg-surface-3/70 ring-line-strong [border-style:dashed]",
      )}
    >
      <span className="min-w-0 flex-1">
        <span className="block truncate text-subhead font-bold text-ink">{used ? `${s.label}` : `${s.label}?`}</span>
        <span className="block truncate text-footnote tabular-nums text-ink-muted">
          {abbr(teamX)} {s.draft.x} – {s.draft.y} {abbr(teamY)}
        </span>
      </span>
      <span
        className={cx(
          "flex h-8 shrink-0 items-center gap-1 rounded-full px-3 text-footnote font-extrabold",
          used ? "bg-brand-400 text-ink-inverse" : "bg-surface-4 text-ink ring-1 ring-inset ring-line",
        )}
      >
        {used ? (
          <>
            <CheckIcon size={14} strokeWidth={3} /> Filled in
          </>
        ) : (
          "Use it"
        )}
      </span>
    </button>
  );
}

// ---- Who wins ----

/** What the footer says right after a save, until the host starts on the next score. */
export interface SavedNotice {
  tone: "win" | "neutral";
  title: string;
  detail: string | null;
  player: Player | null;
}

export function ScorePreview({
  state,
  entry,
  label,
  moment,
  me,
  notice,
}: {
  state: GameState;
  entry: ScoreEntry;
  /** The period as a noun ("Q1", "Half", "Score 3"). */
  label: string;
  /** The period mid-sentence ("at the end of Q1", "at halftime", "on score 3"). */
  moment: string;
  me: string;
  notice?: SavedNotice | null;
}) {
  const { game } = state;
  const p = entry.preview;
  const playerBy = (id: string | null): Player | null => (id ? (state.players.find((x) => x.id === id) ?? null) : null);

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

  if (isUnchangedEntry(state, entry.key, entry.draft)) {
    return (
      <Hint>Pick the team that scored, then tap their points.</Hint>
    );
  }

  if (!p) {
    const blank = entry.draft.x === "" && entry.draft.y === "";
    return (
      <Hint>
        {blank && entry.suggestion
          ? `Type the ${label} score, or tap "${entry.suggestion.label}".`
          : blank
            ? `Type the ${label} score to see who wins.`
            : `Enter both scores to see who wins ${moment}.`}
      </Hint>
    );
  }

  const manualOwner = p.manual ? playerBy(ownerAt(state, p.manual.row, p.manual.col)) : null;
  const owner = playerBy(p.ownerId);
  const reverseOwner = p.reverse ? playerBy(p.reverse.ownerId) : null;
  const mine = p.ownerId === me;
  // Editing a recorded score without changing it: that's who has it now, not who would.
  const recorded = state.scores.find((x) => x.periodKey === entry.key);
  const unchanged = !!recorded && String(recorded.scoreX) === entry.draft.x && String(recorded.scoreY) === entry.draft.y;
  const verb = unchanged ? (mine ? "win" : "wins") : "would win";
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
        <b className="font-extrabold text-ink-brand">You</b> {verb} {moment}
      </>
    ) : (
      <>
        <b className="font-extrabold text-ink">{owner.name}</b> {verb} {moment}
      </>
    );
  } else {
    title = <>Nobody has that square</>;
    sub = "You can give the prize to a player after saving.";
  }
  const abbrX = game.teamX.abbr || game.teamX.name.slice(0, 3);
  const abbrY = game.teamY.abbr || game.teamY.name.slice(0, 3);

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
      <span className="flex shrink-0 items-center gap-1" aria-label={`${abbrX} ${p.digitX}, ${abbrY} ${p.digitY}`}>
        <DigitChip side="x" abbr={abbrX} digit={p.digitX} />
        <DigitChip side="y" abbr={abbrY} digit={p.digitY} />
      </span>
    </div>
  );
}

/** A deciding digit, labelled with its team so color is never the only cue. */
function DigitChip({ side, abbr, digit }: { side: Side; abbr: string; digit: number }) {
  return (
    <span
      className={cx(
        "flex h-9 min-w-9 flex-col items-center justify-center rounded-lg px-1.5 leading-none",
        side === "x" ? "bg-team-x text-team-x-ink" : "bg-team-y text-team-y-ink",
      )}
    >
      <span className="text-[0.5625rem] font-extrabold uppercase tracking-[0.04em] opacity-85">{abbr}</span>
      <span className="mt-0.5 font-display text-callout font-extrabold">{digit}</span>
    </span>
  );
}

function Hint({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-12 items-center gap-3 pb-3" aria-live="polite">
      <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-surface-4 text-ink-subtle">
        <TrophyIcon size={18} />
      </span>
      <p className="text-subhead font-semibold text-ink-muted">{children}</p>
    </div>
  );
}

function ownerAt(state: GameState, row: number, col: number): string | null {
  return state.squares.find((s) => s.row === row && s.col === col)?.playerId ?? null;
}
