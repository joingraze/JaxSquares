// The first thing a friend sees after tapping an invite: one compact card that
// says who asked them and what game (host avatar, "Jordan invited you",
// matchup), who's already in and how many squares are left, and exactly one
// lime button. It stays short so the board itself is above the fold: tapping a
// square is the fastest way in.
import type { GameState } from "../../../shared/types";
import { Avatar, AvatarGroup, Button, cx, TeamMark } from "../../components/ui";
import { kickoffLabel, teamVars } from "../../lib/format";
import "./invite.css";
import { boardStats, crewLine, friendsIn, heroAction, hostOf, isUrgent, peopleInOrder, shortMatchup, squaresLeftLabel } from "./inviteModel";
import { useNewArrival } from "./useNewArrival";

export interface InviteHeroProps {
  state: GameState;
  onJoin: () => void;
  /**
   * "Pick your squares": bring the board into view. Optional; without it the
   * hero scrolls to the first square itself and nudges the open ones.
   */
  onPick?: () => void;
  /** Devices on the board right now. Accepted for callers; the hero keeps one social signal (who's in). */
  watching?: number;
  className?: string;
}

const NUDGE_MS = 1400;

/** Fallback for "Pick your squares": scroll the board into view and pulse the open squares once. */
function pickOnBoard() {
  const first = document.querySelector<HTMLElement>('[data-testid="cell"]');
  if (!first) return;
  (first.closest("section") ?? first).scrollIntoView({ behavior: "smooth", block: "center" });
  const open = document.querySelectorAll<HTMLElement>('[data-testid="cell"][data-state="empty"]');
  open.forEach((el) => el.classList.add("invite-nudge"));
  setTimeout(() => open.forEach((el) => el.classList.remove("invite-nudge")), NUDGE_MS);
}

export function InviteHero({ state, onJoin, onPick, className }: InviteHeroProps) {
  const { game } = state;
  const host = hostOf(state);
  const people = peopleInOrder(state);
  const stats = boardStats(state);
  const open = game.status === "open" || game.status === "draft";
  const urgent = open && isUrgent(stats.left, stats.total);
  const kickoff = game.linkedEvent && open && game.linkedEvent.startsAt > Date.now() ? kickoffLabel(game.linkedEvent.startsAt) : null;
  const action = heroAction(state);
  const arrival = useNewArrival(state.players, true);

  const act = () => {
    if (!action) return;
    if (action.kind === "join") return onJoin();
    if (onPick) onPick();
    else pickOnBoard();
  };

  return (
    <section
      aria-label="You're invited"
      style={teamVars(game.teamX, game.teamY)}
      className={cx("invite-rise relative overflow-hidden rounded-card bg-surface-2 shadow-float ring-1 ring-inset ring-line-strong", className)}
    >
      {/* Team-color floodlights */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-40"
        style={{
          background:
            "radial-gradient(70% 120% at -10% -30%, var(--team-x), transparent 62%), radial-gradient(70% 120% at 110% -30%, var(--team-y), transparent 62%)",
        }}
      />

      <div className="relative flex flex-col gap-3 p-3.5">
        {/* Who asked you, and to what */}
        <div className="flex items-center gap-3">
          {host && <Avatar name={host.name} color={host.color} emoji={host.emoji} size="lg" decorative className="animate-pop" />}
          <div className="min-w-0 flex-1">
            <p className="truncate text-subhead text-ink-muted">
              {host ? (
                <>
                  <span className="font-bold text-ink">{host.name}</span> invited you
                  {kickoff && <span className="text-ink-subtle"> · {kickoff}</span>}
                </>
              ) : (
                "You're invited"
              )}
            </p>
            <h2 className="truncate font-display text-title-3 font-extrabold leading-tight text-ink">{shortMatchup(game)}</h2>
          </div>
          <div aria-hidden className="flex shrink-0 gap-1">
            <TeamMark team={game.teamX} size="sm" />
            <TeamMark team={game.teamY} size="sm" />
          </div>
        </div>

        {/* Who's in + how full: one line */}
        <div className="flex min-h-7 items-center gap-2">
          {arrival ? (
            // Spotlight: the newcomer takes the stack's place for a few seconds.
            <p key={arrival.id} role="status" className="flex min-w-0 flex-1 animate-pop items-center gap-2 text-footnote font-extrabold text-ink">
              <Avatar name={arrival.name} color={arrival.color} emoji={arrival.emoji} size="sm" decorative />
              <span className="truncate">{arrival.name} just joined!</span>
            </p>
          ) : (
            <>
              {people.length > 0 && <AvatarGroup people={people} max={4} size="sm" className="invite-stagger" />}
              <p className="min-w-0 flex-1 truncate text-footnote font-semibold text-ink">
                {open && friendsIn(state) === 0 ? "Be the first friend in!" : crewLine(state, null)}
              </p>
            </>
          )}
          {open && stats.left === 0 && <span className="shrink-0 text-footnote font-bold text-ink-muted">{squaresLeftLabel(0)}</span>}
        </div>

        {/* The one thing to do */}
        {action && (
          <Button
            size="md"
            block
            variant={urgent && action.kind === "pick" ? "gold" : "primary"}
            haptic="light"
            onClick={act}
            leading={
              action.kind === "pick" ? (
                <span aria-hidden className="invite-point text-title-3 leading-none">
                  👇
                </span>
              ) : undefined
            }
            trailing={
              action.kind === "pick" ? (
                <span className="ml-1 rounded-full bg-black/15 px-2 py-0.5 text-caption font-extrabold tabular-nums text-ink-inverse">
                  {urgent ? `Only ${stats.left} left!` : `${stats.left} left`}
                </span>
              ) : undefined
            }
          >
            {action.label}
          </Button>
        )}
      </div>
    </section>
  );
}
