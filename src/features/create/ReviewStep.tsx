// The create flow's last step: one card per step, each tappable to go back
// and change it (Next from there comes straight back here). The prizes card
// shows exactly the lineup players will see, or flags "Square price: not
// set" when the host skipped it. Amounts stay in the app (this is the app).
// A season board's game card is its season ("Jaguars 2026 season · 17 games
// so far"), its next game and how numbers work; its prizes are every game's.

import type { ReactNode } from "react";
import { rulesOf } from "../../../shared/formats";
import { SEASON_NUMBERS_INFO } from "../../../shared/season";
import { playsHalves, regulationPeriods, wordsFor, type GameKind } from "../../../shared/sports";
import type { GameFormat, LinkedEvent, SeasonEvent, SeasonNumbers, SeasonTeam, Team } from "../../../shared/types";
import { CalendarIcon, ChevronRightIcon, ClockIcon, GridIcon, LiveIcon, PencilIcon, TrophyIcon } from "../../components/icons";
import { Avatar, cx, TeamMark } from "../../components/ui";
import { haptic } from "../../lib/native";
import { capLine, prizeLineup } from "../rules/rulesModel";
import { FormatGlyph } from "./FormatPicker";
import { kickoffLine } from "./kickoff";
import { boardHeadline, rulesTitle, seasonEventMatchup } from "./model";
import { STEP_INFO, STEPS, stepNumber, type Steps, type WizardStep } from "./wizard";

export interface ReviewStepProps {
  teams: { teamX: Team; teamY: Team } | null;
  /** "Packers @ Cardinals" or "Chiefs vs Eagles". */
  matchupLabel: string;
  linked: LinkedEvent | null;
  /** Custom boards (null = no set time). */
  kickoff: number | null;
  /** The format as players will get it (prize choice applied). */
  format: GameFormat;
  /** The board's name as it will be created. */
  name: string;
  maxPerPlayer: number;
  /** The host as friends will see them on the board. */
  host: { name: string; color: string; emoji: string };
  now: number;
  onEdit: (step: WizardStep) => void;
  /**
   * Another board for a game: the board it's made from. Its game and rules
   * are that board's, so they show as one card that doesn't open a step.
   */
  sibling?: { sourceName: string } | null;
  /** The flow's steps (the card numbers follow them). */
  steps?: Steps;
  /** The board's sport and league ("Tips off" for basketball, a game of halves drawn as two). */
  kind?: GameKind;
  /** A season board: its line, team, next game and numbers (absent for one game's board). */
  season?: ReviewSeason | null;
}

export interface ReviewSeason {
  /** "Jaguars 2026 season · 17 games so far", "6 NFL games". */
  line: string;
  team: SeasonTeam | null;
  next: SeasonEvent | null;
  numbers: SeasonNumbers;
}

export function ReviewStep({
  teams,
  matchupLabel,
  linked,
  kickoff,
  format,
  name,
  maxPerPlayer,
  host,
  now,
  onEdit,
  sibling = null,
  steps = STEPS,
  kind,
  season = null,
}: ReviewStepProps) {
  const words = wordsFor(kind);
  const rules = rulesOf(format);
  const lineup = prizeLineup(format);
  const modifiers = [format.reverse && "Reverse", format.freshNumbers && (playsHalves(kind) ? "New numbers each half" : "New numbers each Q")].filter(Boolean) as string[];
  const when = linked ? kickoffLine(linked.startsAt, now) : kickoffLine(kickoff, now);
  return (
    <div className="flex flex-col gap-3">
      {sibling ? (
        <section
          data-testid="review-same-game"
          aria-label={`Same game and rules as ${sibling.sourceName}: ${matchupLabel}, ${when}`}
          className="flex flex-col gap-2.5 rounded-card bg-surface-2 p-3.5 ring-1 ring-inset ring-line"
        >
          <span className="eyebrow text-ink-subtle">Same game & rules as {sibling.sourceName}</span>
          <div className="flex items-center gap-3">
            {teams && (
              <span aria-hidden className="flex shrink-0 gap-1">
                <TeamMark team={teams.teamX} size="sm" />
                <TeamMark team={teams.teamY} size="sm" />
              </span>
            )}
            <span className="min-w-0 flex-1">
              <span className="block truncate font-display text-headline font-extrabold leading-tight text-ink">{matchupLabel}</span>
              <span className="mt-0.5 flex items-center gap-1.5 text-footnote text-ink-muted">
                {linked ? <LiveIcon size={14} className="shrink-0 text-ink-brand" /> : <ClockIcon size={14} className="shrink-0 text-ink-brand" />}
                <span className="truncate">{linked ? `Live scores · ${when}` : kickoff === null ? "No set time" : `${words.starts} ${when}`}</span>
              </span>
              <span className="mt-0.5 block truncate text-footnote text-ink-muted">{[rulesTitle(format), boardHeadline(format), ...modifiers].join(" · ")}</span>
            </span>
          </div>
        </section>
      ) : (
        <>
          {season ? (
            <ReviewCard step="game" steps={steps} summary={season.line} onEdit={onEdit}>
              <SeasonSummary season={season} teams={teams} now={now} />
            </ReviewCard>
          ) : (
            <ReviewCard step="game" steps={steps} summary={`${matchupLabel}, ${when}`} onEdit={onEdit}>
              <div className="flex items-center gap-3">
                {teams && (
                  <span aria-hidden className="flex shrink-0 gap-1">
                    <TeamMark team={teams.teamX} size="sm" />
                    <TeamMark team={teams.teamY} size="sm" />
                  </span>
                )}
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-display text-headline font-extrabold leading-tight text-ink">{matchupLabel}</span>
                  {linked ? (
                    <span className="mt-0.5 flex items-center gap-1.5 text-footnote text-ink-muted">
                      <LiveIcon size={14} className="shrink-0 text-ink-brand" />
                      <span className="truncate">Live scores · {kickoffLine(linked.startsAt, now)}</span>
                    </span>
                  ) : (
                    <>
                      <span data-testid="review-kickoff" className="mt-0.5 flex items-center gap-1.5 text-footnote text-ink">
                        <ClockIcon size={14} className="shrink-0 text-ink-brand" />
                        <span className="truncate">{kickoff === null ? "No set time" : `${words.starts} ${kickoffLine(kickoff, now)}`}</span>
                      </span>
                      <span className="mt-0.5 flex items-center gap-1.5 text-footnote text-ink-muted">
                        <PencilIcon size={14} className="shrink-0 text-ink-subtle" />
                        <span className="truncate">You run the score</span>
                      </span>
                    </>
                  )}
                </span>
              </div>
            </ReviewCard>
          )}

          <ReviewCard step="format" steps={steps} summary={`${rulesTitle(format)}, ${boardHeadline(format)}`} onEdit={onEdit}>
            <div className="flex items-center gap-3">
              <span aria-hidden className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-surface-4">
                <FormatGlyph rules={rules} segments={regulationPeriods(kind)} />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate font-display text-headline font-extrabold leading-tight text-ink">{rulesTitle(format)}</span>
                <span className="mt-0.5 block truncate text-footnote text-ink-muted">{[boardHeadline(format), ...modifiers].join(" · ")}</span>
              </span>
            </div>
          </ReviewCard>
        </>
      )}

      <ReviewCard
        step="prizes"
        steps={steps}
        summary={lineup ? (lineup.fun ? "Just for fun" : lineup.parts.join(", ")) : "Square price: not set"}
        flagged={!lineup}
        onEdit={onEdit}
      >
        {lineup ? (
          <div data-testid="review-prizes" data-state={lineup.fun ? "fun" : "set"} className="flex items-start gap-3">
            <span aria-hidden className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-gold-400/15 text-ink-gold">
              {lineup.fun ? <span className="text-[1.15rem] leading-none">🎉</span> : <TrophyIcon size={18} filled />}
            </span>
            <span className="min-w-0 flex-1">
              {lineup.fun ? (
                <>
                  <span className="inline-flex h-6 items-center rounded-md bg-accent-500/20 px-2 text-footnote font-extrabold text-ink-accent">Just for fun</span>
                  <span className="mt-1 block text-footnote text-ink-muted">No square price or amounts. Notes still show.</span>
                </>
              ) : (
                <>
                  <span className="block text-caption font-bold text-ink-subtle">{season ? "What players see, every game" : "What players see"}</span>
                  <span className="mt-0.5 block text-callout font-bold leading-snug tabular-nums text-ink">
                    {/* Each part stays whole; lines break between parts. */}
                    {lineup.parts.map((p, i) => (
                      <span key={p}>
                        {i > 0 && (
                          <span aria-hidden className="font-normal text-ink-subtle">
                            {" · "}
                          </span>
                        )}
                        <span className={cx("whitespace-nowrap", i === 0 && "text-ink-gold")}>{p}</span>
                      </span>
                    ))}
                  </span>
                </>
              )}
            </span>
          </div>
        ) : (
          <div data-testid="review-prizes" data-state="unset" className="flex items-start gap-3">
            <span aria-hidden className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-gold-400/12 text-ink-gold">
              <TrophyIcon size={18} />
            </span>
            <span className="min-w-0 flex-1">
              <span className="flex items-center gap-1.5 font-display text-headline font-extrabold leading-tight text-ink">
                <span aria-hidden className="h-2 w-2 shrink-0 rounded-full bg-gold-400" />
                Square price: not set
              </span>
              <span className="mt-0.5 block text-footnote text-ink-muted">Players won't see a price or prizes. Add them, or call it just for fun.</span>
            </span>
          </div>
        )}
      </ReviewCard>

      <ReviewCard step="details" steps={steps} summary={[name, capLine(maxPerPlayer) ?? "No max per player"].join(", ")} onEdit={onEdit}>
        <div className="flex items-center gap-3">
          <Avatar name={host.name.trim() || "You"} color={host.color} emoji={host.emoji} size="md" decorative />
          <span className="min-w-0 flex-1">
            <span className="block truncate font-display text-headline font-extrabold leading-tight text-ink">{name}</span>
            <span className="mt-0.5 block truncate text-footnote text-ink-muted">
              {[host.name.trim() ? `Hosted by ${host.name.trim()}` : null, capLine(maxPerPlayer) ?? "No max per player"].filter(Boolean).join(" · ")}
            </span>
          </span>
        </div>
      </ReviewCard>
    </div>
  );
}

/** A season board's game card: the season, its next game, live scores and how numbers work. */
function SeasonSummary({ season, teams, now }: { season: ReviewSeason; teams: { teamX: Team; teamY: Team } | null; now: number }) {
  return (
    <div data-testid="review-season" className="flex items-center gap-3">
      {season.team ? (
        <TeamMark team={season.team} logo={season.team.logo} size="md" />
      ) : (
        teams && (
          <span aria-hidden className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-surface-4 text-ink-brand">
            <CalendarIcon size={18} />
          </span>
        )
      )}
      <span className="min-w-0 flex-1">
        <span data-testid="review-season-line" className="block font-display text-headline font-extrabold leading-tight text-ink">
          {season.line}
        </span>
        {season.next && (
          <span className="mt-0.5 flex items-center gap-1.5 text-footnote text-ink-muted">
            <LiveIcon size={14} className="shrink-0 text-ink-brand" />
            <span>
              Live scores · Next {seasonEventMatchup(season.next, season.team)}, {kickoffLine(season.next.startsAt, now)}
            </span>
          </span>
        )}
        <span className="mt-0.5 flex items-center gap-1.5 text-footnote text-ink-muted">
          <GridIcon size={14} className="shrink-0 text-ink-subtle" />
          <span className="truncate">{SEASON_NUMBERS_INFO[season.numbers].label}</span>
        </span>
      </span>
    </div>
  );
}

function ReviewCard({
  step,
  steps,
  summary,
  flagged = false,
  onEdit,
  children,
}: {
  step: WizardStep;
  steps: Steps;
  /** What the card says, for its accessible name. */
  summary: string;
  flagged?: boolean;
  onEdit: (step: WizardStep) => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      data-testid="review-edit"
      data-step={step}
      aria-label={`${STEP_INFO[step].label}: ${summary}. Change`}
      onClick={() => {
        void haptic("selection");
        onEdit(step);
      }}
      className={cx(
        "pressable group flex w-full flex-col gap-2.5 rounded-card p-3.5 text-left shadow-card ring-inset transition-colors",
        flagged
          ? "bg-[linear-gradient(160deg,rgb(255_194_51/0.12),rgb(255_194_51/0.03)_70%)] bg-surface-2 ring-1 ring-gold-line/45"
          : "bg-surface-2 ring-1 ring-line hover:bg-surface-3",
      )}
    >
      <span className="flex items-center justify-between gap-2">
        <span className="eyebrow text-ink-subtle">
          <span className="tabular-nums">{stepNumber(step, steps)}</span> · {STEP_INFO[step].label}
        </span>
        <span className="flex items-center gap-0.5 text-footnote font-bold text-ink-brand">
          {flagged ? "Set" : "Change"}
          <ChevronRightIcon size={15} strokeWidth={2.6} />
        </span>
      </span>
      <span className="block w-full">{children}</span>
    </button>
  );
}
