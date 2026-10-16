// The host sheet. Always titled "Host tools" with one line saying where the
// board stands, and always in the same order: Now (open the board, fill + lock,
// type the score, or watch the live feed), Winners, Board. Sub views (lock
// confirm, edit, end, delete) slide in inside the same sheet. Saves are
// confirmed in the sheet's own footer, never by a toast over its header.

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { resolveResults } from "../../../shared/squares";
import type { GameState } from "../../../shared/types";
import {
  CheckIcon,
  ChevronLeftIcon,
  ClockIcon,
  CrownIcon,
  FlagIcon,
  LinkIcon,
  LockIcon,
  PencilIcon,
  ShareIcon,
  ShuffleIcon,
  SparklesIcon,
  TrashIcon,
  TrophyIcon,
  UsersIcon,
} from "../../components/icons";
import {
  AvatarGroup,
  Badge,
  BottomSheet,
  Button,
  IconButton,
  ListGroup,
  ListRow,
  ProgressRing,
  SegmentedControl,
  cx,
} from "../../components/ui";
import { PUBLIC_ORIGIN } from "../../lib/api";
import { kickoffLabel, pluralize, teamVars } from "../../lib/format";
import { hostLinkUrl } from "../../lib/identity";
import { haptic, shareLink } from "../../lib/native";
import { EditBoard } from "./EditBoard";
import "./host.css";
import {
  NEXT_ENTRY,
  defaultTargetKey,
  editDraftOf,
  editErrors,
  editPatch,
  gameStarted,
  hostStatusLine,
  initialDraft,
  invitedAnyone,
  isLinked,
  lockFacts,
  lockIsTheMove,
  lockReadiness,
  parseScore,
  resolvedKey,
  saveEndsGame,
  scoreTargets,
  winnerRows,
  type EditDraft,
  type ScoreDraft,
} from "./hostModel";
import { Keypad, ScorePreview, ScoreTiles, SuggestionChip, type SavedNotice } from "./ScorePad";
import { useScoreEntry } from "./useScoreEntry";
import type { HostActions } from "./useHostActions";
import { WinnersList } from "./WinnersList";

export type HostView = "home" | "lock" | "edit" | "end" | "delete";

export interface HostSheetProps {
  state: GameState;
  open: boolean;
  view: HostView;
  onView: (view: HostView) => void;
  onClose: () => void;
  actions: HostActions;
  /** This device's public player id. */
  me: string;
  onInvite: () => void;
  /** Draft boards: open the checkout sheet that opens the board. */
  onOpenBoard: () => void;
  /** The host confirmed the lock: the parent closes the sheet and runs the reveal. */
  onLock: () => void;
  onPickWinner: (periodKey: string, label: string) => void;
  /** The game just ended (final score saved or "End game"). */
  onEnded: () => void;
  onDeleted: () => void;
}

/** How long a "saved" line stays in the footer if the host doesn't start the next score. */
const NOTICE_MS = 7000;

interface Notice extends SavedNotice {
  /** Shown while the keypad still holds this period and this draft (the host hasn't moved on). */
  key: string | null;
  draft: ScoreDraft | null;
}

export function HostSheet(props: HostSheetProps) {
  const { state, open, view, onView, onClose, actions, me } = props;
  const { game } = state;
  const linked = isLinked(game);
  const everyScore = game.format.periods === "every-score";
  const started = gameStarted(state);

  // ---- score entry (kept here so the footer can preview + save) ----
  const entry = useScoreEntry(state, defaultTargetKey(state));
  const [fixing, setFixing] = useState(false);
  const scoreRef = useRef<HTMLElement>(null);
  const typedBoard = game.status === "locked" && !linked;
  const scoring = (game.status === "locked" || game.status === "final") && (typedBoard || fixing);

  // ---- "saved" line in the footer (a toast would land on the sheet's header) ----
  const [notice, setNotice] = useState<Notice | null>(null);
  useEffect(() => {
    if (!notice) return;
    const t = setTimeout(() => setNotice(null), NOTICE_MS);
    return () => clearTimeout(t);
  }, [notice]);
  const say = (n: SavedNotice, key: string | null = null, draft: ScoreDraft | null = null) => setNotice({ ...n, key, draft });
  const noticeLive =
    notice && (notice.key === null || (notice.key === entry.key && notice.draft?.x === entry.draft.x && notice.draft?.y === entry.draft.y))
      ? notice
      : null;

  // Fresh start every time the sheet opens.
  const wasOpen = useRef(false);
  useEffect(() => {
    if (open && !wasOpen.current) {
      entry.setKey(defaultTargetKey(state), state);
      setFixing(false);
      setNotice(null);
    }
    wasOpen.current = open;
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only on open
  }, [open]);

  // ---- edit draft ----
  const [draft, setDraft] = useState<EditDraft>(() => editDraftOf(game));
  useEffect(() => {
    if (view === "edit") setDraft(editDraftOf(game));
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reset when the edit view opens
  }, [view]);

  const targets = useMemo(() => scoreTargets(state), [state]);
  const target = targets.find((t) => t.key === entry.key) ?? targets[targets.length - 1];
  const label = target?.label ?? "this period";

  const saveScore = async () => {
    const scoreX = parseScore(entry.draft.x);
    const scoreY = parseScore(entry.draft.y);
    if (scoreX === null || scoreY === null || !entry.canSave) return;
    const realKey = resolvedKey(state, entry.key);
    const ends = saveEndsGame(game, entry.key);
    const next = await actions.saveScore({ periodKey: entry.key, scoreX, scoreY });
    if (!next) return;
    if (ends) {
      props.onEnded();
      return;
    }
    const result = resolveResults(next).find((r) => r.periodKey === realKey);
    const winner = result?.winnerPlayerId ? next.players.find((p) => p.id === result.winnerPlayerId) ?? null : null;
    const nextKey = defaultTargetKey(next);
    entry.setKey(nextKey, next);
    if (!typedBoard) setFixing(false);
    // No confetti or toast while the sheet is up: the footer says it, right where the host is looking.
    void haptic(winner ? "success" : "light");
    say(
      winner
        ? {
            tone: "win",
            title: winner.id === me ? `Saved · you win ${label}!` : `Saved · ${winner.name} wins ${label}`,
            detail: result?.prize ?? "Everyone sees it now.",
            player: winner,
          }
        : {
            tone: "neutral",
            title: `${scoreName(label)} saved`,
            detail: "Nobody had that square. You can give it to a player under Winners.",
            player: null,
          },
      typedBoard ? nextKey : null,
      typedBoard ? initialDraft(next, nextKey) : null,
    );
  };

  const removeScore = async () => {
    const key = entry.key;
    const next = await actions.removeScore(key);
    if (!next) return;
    void haptic("light");
    const nextKey = defaultTargetKey(next);
    entry.setKey(nextKey, next);
    say({ tone: "neutral", title: `${scoreName(label)} removed`, detail: null, player: null }, nextKey, initialDraft(next, nextKey));
  };

  const undoPick = async (key: string, periodLabel: string) => {
    const next = await actions.clearWinner(key);
    if (!next) return;
    void haptic("light");
    say({ tone: "neutral", title: `${periodLabel} pick undone`, detail: "The score's square decides it again.", player: null });
  };

  const shareHostLink = async () => {
    const url = hostLinkUrl(game.id, PUBLIC_ORIGIN);
    if (!url) return;
    const outcome = await shareLink({
      title: `Host link · ${game.name}`,
      text: `Open this on your other phone to run "${game.name}". Keep it private: anyone with it can run the board.`,
      url,
    });
    if (outcome === "copied") {
      say({ tone: "neutral", title: "Host link copied", detail: "Open it on your other phone. Keep it private.", player: null });
    } else if (outcome === "shared") {
      void haptic("success");
    }
  };

  const saveEdit = async () => {
    const patch = editPatch(game, draft);
    if (!patch) return onView("home");
    const next = await actions.update(patch);
    if (!next) return;
    say({ tone: "neutral", title: "Board updated", detail: "Everyone sees the changes now.", player: null });
    onView("home");
  };

  const endGame = async () => {
    const next = await actions.finish();
    if (next) props.onEnded();
  };

  const deleteBoard = async () => {
    void haptic("warning");
    if (await actions.remove()) props.onDeleted();
  };

  // ---- per view ----

  const back = (to: HostView = "home") => (
    <IconButton
      label="Back"
      icon={<ChevronLeftIcon size={22} />}
      size="sm"
      variant="solid"
      className="-ml-1 mr-1 align-[-0.35rem]"
      onClick={() => {
        void haptic("selection");
        onView(to);
      }}
    />
  );

  let title: ReactNode;
  let description: ReactNode = null;
  let body: ReactNode;
  let footer: ReactNode = null;

  if (view === "lock") {
    const f = lockFacts(state);
    const low = lockReadiness(f) === "low";
    title = <>{back()}{low ? `Lock with only ${f.claimed} in?` : "Lock & draw numbers?"}</>;
    body = <LockConfirm state={state} />;
    footer = (
      <div className="flex flex-col gap-1">
        <Button
          data-testid="host-lock-confirm"
          size="lg"
          block
          haptic="heavy"
          leading={<ShuffleIcon size={20} strokeWidth={2.4} />}
          onClick={props.onLock}
          loading={actions.busy === "lock"}
        >
          {low ? "Lock & draw anyway" : "Draw the numbers"}
        </Button>
        <Button variant="ghost" block onClick={low ? props.onInvite : () => onView("home")}>
          {low ? "Keep inviting" : "Not yet"}
        </Button>
      </div>
    );
  } else if (view === "edit") {
    const errors = editErrors(draft);
    const invalid = !!errors.name || Object.keys(errors.prizes).length > 0;
    const patch = editPatch(game, draft);
    title = <>{back()}Edit board</>;
    body = <EditBoard game={game} draft={draft} onChange={setDraft} />;
    footer = (
      <Button
        size="lg"
        block
        variant={invalid || !patch ? "secondary" : "primary"}
        disabled={invalid || !patch}
        loading={actions.busy === "edit"}
        onClick={() => void saveEdit()}
      >
        {patch ? "Save changes" : "No changes yet"}
      </Button>
    );
  } else if (view === "end") {
    title = <>{back()}End the game?</>;
    body = <EndConfirm state={state} />;
    footer = (
      <div className="flex flex-col gap-1">
        <Button variant="gold" size="lg" block haptic="heavy" leading={<FlagIcon size={20} />} loading={actions.busy === "finish"} onClick={() => void endGame()}>
          End game for everyone
        </Button>
        <Button variant="ghost" block onClick={() => onView("home")}>
          Keep playing
        </Button>
      </div>
    );
  } else if (view === "delete") {
    title = <>{back()}Delete this board?</>;
    body = <DeleteConfirm state={state} />;
    footer = (
      <div className="flex flex-col gap-1">
        <Button variant="danger" size="lg" block leading={<TrashIcon size={20} />} loading={actions.busy === "delete"} onClick={() => void deleteBoard()}>
          Delete for everyone
        </Button>
        <Button variant="ghost" block onClick={() => onView("home")}>
          Keep the board
        </Button>
      </div>
    );
  } else {
    // One identity for the sheet the "Host tools" bar opens, whatever the state.
    title = "Host tools";
    description = hostStatusLine(state);
    const showWinners = game.status === "locked" || game.status === "final";
    const rows = showWinners ? winnerRows(state) : [];
    body = (
      <div className="flex flex-col gap-6 pb-2">
        <Section title="Now">
          {game.status === "draft" && <DraftHero onOpenBoard={props.onOpenBoard} />}
          {game.status === "open" && <OpenHero state={state} onInvite={props.onInvite} onLock={() => onView("lock")} />}
          {game.status === "locked" && linked && !fixing && <AutoHero state={state} started={started} onFix={() => setFixing(true)} />}
          {game.status === "final" && !fixing && <FinalHero state={state} onFix={() => setFixing(true)} />}

          {scoring && (
            <section ref={scoreRef} aria-label="Score entry" className="flex scroll-mt-2 flex-col gap-3">
              {!everyScore ? (
                <SegmentedControl
                  aria-label="Period"
                  size="sm"
                  value={entry.key}
                  onChange={(k) => entry.setKey(k)}
                  options={targets.map((t) => ({
                    value: t.key,
                    label: t.existing ? `${t.label} ✓` : t.label,
                  }))}
                />
              ) : (
                <div className="flex min-h-11 items-center justify-between gap-2 px-1">
                  <p className="font-display text-headline font-extrabold text-ink">
                    {entry.key === NEXT_ENTRY ? "What's the score now?" : `Editing ${label}`}
                  </p>
                  {entry.key !== NEXT_ENTRY && (
                    <button
                      type="button"
                      onClick={() => entry.setKey(NEXT_ENTRY)}
                      className="pressable tap-target h-9 rounded-full bg-surface-4 px-3.5 text-footnote font-extrabold text-ink"
                    >
                      New score
                    </button>
                  )}
                </div>
              )}
              <SuggestionChip entry={entry} teamX={game.teamX} teamY={game.teamY} />
              <ScoreTiles teamX={game.teamX} teamY={game.teamY} entry={entry} />
              <Keypad entry={entry} teamX={game.teamX} teamY={game.teamY} quickAdds={everyScore} />
              {(!typedBoard || target?.existing) && (
                <div className="flex min-h-11 items-center justify-between gap-2 px-1">
                  {!typedBoard ? (
                    <button
                      type="button"
                      onClick={() => setFixing(false)}
                      className="pressable tap-target rounded-full px-1 py-1.5 text-footnote font-bold text-ink-muted"
                    >
                      Cancel
                    </button>
                  ) : (
                    <span />
                  )}
                  {target?.existing && (
                    <button
                      type="button"
                      disabled={actions.busy !== null}
                      onClick={() => void removeScore()}
                      className="pressable tap-target rounded-full px-1 py-1.5 text-footnote font-bold text-danger-400 disabled:opacity-40"
                    >
                      Remove {scoreName(label)}
                    </button>
                  )}
                </div>
              )}
            </section>
          )}
        </Section>

        {showWinners && (
          <Section title="Winners">
            <WinnersList
              state={state}
              rows={rows}
              me={me}
              busy={actions.busy !== null}
              canPickOpen={linked && started}
              onPick={props.onPickWinner}
              onUndoPick={(k, l) => void undoPick(k, l)}
              onEdit={
                everyScore && scoring
                  ? (k) => {
                      void haptic("selection");
                      entry.setKey(k);
                      scoreRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
                    }
                  : undefined
              }
            />
          </Section>
        )}

        <ListGroup title="Board">
          <ListRow
            leading={<RowIcon><PencilIcon size={18} /></RowIcon>}
            title="Edit board"
            subtitle={game.status === "open" || game.status === "draft" ? "Name, prizes, squares per person" : "Name and prizes"}
            chevron
            onClick={() => onView("edit")}
          />
          <ListRow
            leading={<RowIcon><LinkIcon size={18} /></RowIcon>}
            title="Host from another phone"
            subtitle="Send yourself your private host link"
            trailing={<ShareIcon size={18} className="text-ink-subtle" />}
            onClick={() => void shareHostLink()}
          />
          {game.status === "locked" && started && (
            <ListRow
              leading={<RowIcon><FlagIcon size={18} /></RowIcon>}
              title="End game"
              subtitle="Call it final and crown the winners"
              chevron
              onClick={() => onView("end")}
            />
          )}
          <ListRow
            leading={<RowIcon tone="danger"><TrashIcon size={18} /></RowIcon>}
            title="Delete board"
            destructive
            chevron
            onClick={() => onView("delete")}
          />
        </ListGroup>
      </div>
    );
    if (scoring) {
      footer = (
        <div style={teamVars(game.teamX, game.teamY)}>
          <ScorePreview state={state} entry={entry} label={label} me={me} notice={noticeLive} />
          <Button
            data-testid="score-save"
            size="lg"
            block
            variant={!entry.canSave ? "secondary" : saveEndsGame(game, entry.key) ? "gold" : "primary"}
            haptic="medium"
            disabled={!entry.canSave}
            loading={actions.busy === "score"}
            onClick={() => void saveScore()}
          >
            {saveLabel(entry.key, label, !!target?.existing, saveEndsGame(game, entry.key))}
          </Button>
        </div>
      );
    } else if (noticeLive) {
      footer = <NoticeLine notice={noticeLive} />;
    }
  }

  return (
    <BottomSheet open={open} onClose={onClose} title={title} description={description} footer={footer} dismissible={actions.busy !== "delete"}>
      <div key={view} style={teamVars(game.teamX, game.teamY)} className={view === "home" ? "hx-view-pop" : "hx-view-push"}>
        {body}
      </div>
    </BottomSheet>
  );
}

/** "Q1 score", but "Score 3" stays as is. */
function scoreName(label: string): string {
  return /^Score \d+$/.test(label) ? label : `${label} score`;
}

function saveLabel(key: string, label: string, existing: boolean, ends: boolean): string {
  if (ends) return "Save Final & end game";
  if (key === NEXT_ENTRY) return `Add ${label}`;
  return existing ? `Update ${scoreName(label)}` : `Save ${scoreName(label)}`;
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section aria-label={title} className="flex flex-col gap-2">
      <h3 className="eyebrow px-1 text-ink-subtle">{title}</h3>
      {children}
    </section>
  );
}

function NoticeLine({ notice }: { notice: SavedNotice }) {
  return (
    <div className="flex min-h-12 items-center gap-3 pb-1 animate-pop" aria-live="polite">
      <span className={cx("grid h-9 w-9 shrink-0 place-items-center rounded-full", notice.tone === "win" ? "bg-gold-400 text-ink-inverse" : "bg-brand-400 text-ink-inverse")}>
        {notice.tone === "win" ? <TrophyIcon size={16} filled /> : <CheckIcon size={16} strokeWidth={3} />}
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-subhead font-extrabold text-ink">{notice.title}</p>
        {notice.detail && <p className="truncate text-footnote text-ink-muted">{notice.detail}</p>}
      </div>
    </div>
  );
}

function RowIcon({ children, tone = "default" }: { children: ReactNode; tone?: "default" | "danger" }) {
  return (
    <span
      className={cx(
        "grid h-9 w-9 place-items-center rounded-xl",
        tone === "danger" ? "bg-danger-500/15 text-danger-400" : "bg-surface-4 text-ink",
      )}
    >
      {children}
    </span>
  );
}

// ---- Heroes ----

function DraftHero({ onOpenBoard }: { onOpenBoard: () => void }) {
  return (
    <div className="relative overflow-hidden rounded-card bg-surface-3 p-4 shadow-card ring-1 ring-inset ring-brand-400/35">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-30"
        style={{ background: "radial-gradient(80% 120% at 0% 0%, var(--team-x), transparent 60%), radial-gradient(80% 120% at 100% 100%, var(--team-y), transparent 60%)" }}
      />
      <div className="relative">
        <p className="font-display text-title-3 font-extrabold text-ink">Open your board</p>
        <p className="mt-1 text-subhead text-ink-muted">Open it so friends can pick squares. Then send the invite.</p>
        <Button size="lg" block className="mt-4" haptic="medium" leading={<SparklesIcon size={20} />} onClick={onOpenBoard}>
          Open board
        </Button>
      </div>
    </div>
  );
}

function OpenHero({ state, onInvite, onLock }: { state: GameState; onInvite: () => void; onLock: () => void }) {
  const { game } = state;
  const f = lockFacts(state);
  const full = f.empty === 0;
  // Same rule as the host bar: Invite leads until the board is (nearly) full.
  const ready = lockIsTheMove(f.claimed, f.total);
  const nobody = lockReadiness(f) === "empty";
  const kickoff = game.linkedEvent?.startsAt ?? null;
  return (
    <div className="relative overflow-hidden rounded-card bg-surface-3 p-4 shadow-card ring-1 ring-inset ring-line-strong">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-25"
        style={{ background: "radial-gradient(80% 120% at 0% 0%, var(--team-x), transparent 60%), radial-gradient(80% 120% at 100% 100%, var(--team-y), transparent 60%)" }}
      />
      <div className="relative flex items-center gap-4">
        <ProgressRing value={f.claimed / f.total} size={68} stroke={6} tone={full ? "gold" : "brand"} label={`${f.claimed} of ${f.total} squares taken`}>
          <span className="text-headline">{f.claimed}</span>
        </ProgressRing>
        <div className="min-w-0 flex-1">
          <p className="font-display text-title-3 font-extrabold text-ink">
            {full ? "Board's full!" : nobody ? "No squares taken yet" : `${f.empty} ${f.empty === 1 ? "square" : "squares"} left`}
          </p>
          <p className="mt-0.5 text-footnote text-ink-muted">
            {f.claimed} of {f.total} taken · {pluralize(f.players, "player")}
          </p>
          {state.players.length > 0 && (
            <AvatarGroup className="mt-2" size="xs" max={6} people={state.players.map((p) => ({ id: p.id, name: p.name, color: p.color, emoji: p.emoji }))} />
          )}
        </div>
      </div>
      <div className="relative mt-4 grid grid-cols-2 gap-2.5">
        <Button variant={ready ? "secondary" : "primary"} leading={<UsersIcon size={18} />} onClick={onInvite}>
          {invitedAnyone(state) ? "Invite more" : "Invite friends"}
        </Button>
        <Button
          data-testid="host-lock"
          variant={ready ? "primary" : "secondary"}
          leading={<LockIcon size={18} />}
          onClick={onLock}
          disabled={nobody}
          haptic="medium"
        >
          Lock & draw
        </Button>
      </div>
      <p className="relative mt-3 text-footnote text-ink-subtle">
        {nobody
          ? "Lock & draw turns on once someone picks a square."
          : kickoff
            ? `Locks itself at kickoff (${kickoffLabel(kickoff)}) if you don't.`
            : "Lock when everyone's in. The numbers get drawn live."}
      </p>
    </div>
  );
}

function scoreLine(state: GameState): { x: number; y: number } | null {
  if (state.live && state.live.state !== "pre") return { x: state.live.scoreX, y: state.live.scoreY };
  const fin = state.scores.find((s) => s.periodKey === "final");
  if (fin) return { x: fin.scoreX, y: fin.scoreY };
  const last = [...state.scores].sort((a, b) => b.updatedAt - a.updatedAt)[0];
  return last ? { x: last.scoreX, y: last.scoreY } : null;
}

function BigScore({ state, score }: { state: GameState; score: { x: number; y: number } | null }) {
  const { game } = state;
  return (
    <div className="flex items-center justify-center gap-3">
      <span className="flex items-center gap-2">
        <span className="rounded-lg bg-team-x px-2 py-1 font-display text-footnote font-extrabold text-team-x-ink">{game.teamX.abbr || game.teamX.name}</span>
        <span className="font-display text-[2.5rem] font-extrabold leading-none tabular-nums text-ink">{score ? score.x : "–"}</span>
      </span>
      <span className="text-title-3 font-bold text-ink-subtle">–</span>
      <span className="flex items-center gap-2">
        <span className="font-display text-[2.5rem] font-extrabold leading-none tabular-nums text-ink">{score ? score.y : "–"}</span>
        <span className="rounded-lg bg-team-y px-2 py-1 font-display text-footnote font-extrabold text-team-y-ink">{game.teamY.abbr || game.teamY.name}</span>
      </span>
    </div>
  );
}

function AutoHero({ state, started, onFix }: { state: GameState; started: boolean; onFix: () => void }) {
  const { live, game } = state;
  const kickoff = game.linkedEvent?.startsAt ?? null;
  const pre = !live || live.state === "pre";
  return (
    <div className="rounded-card bg-surface-3 p-4 shadow-card ring-1 ring-inset ring-line-strong">
      {pre ? (
        <div className="flex items-center gap-3.5">
          <span className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-brand-400/12 text-brand-300 ring-1 ring-inset ring-brand-400/25">
            <ClockIcon size={24} />
          </span>
          <div className="min-w-0">
            <p className="font-display text-headline font-extrabold text-ink">
              {kickoff ? `Kickoff ${kickoffLabel(kickoff)}` : "Waiting for kickoff"}
            </p>
            <p className="mt-0.5 text-footnote text-ink-muted">Nothing to do until then. Scores and winners update by themselves.</p>
          </div>
        </div>
      ) : (
        <>
          <div className="mb-3 flex items-center justify-center gap-2">
            {live.state === "in" ? (
              <>
                <Badge tone="live">Live</Badge>
                <span className="text-footnote font-bold tabular-nums text-ink">{live.detail}</span>
              </>
            ) : (
              <Badge tone="gold">Final</Badge>
            )}
          </div>
          <BigScore state={state} score={{ x: live.scoreX, y: live.scoreY }} />
          <p className="mt-3 text-center text-footnote text-ink-muted">Straight from the real game. Winners follow automatically.</p>
        </>
      )}
      {started && (
        <Button variant="secondary" size="md" block className="mt-3.5" leading={<PencilIcon size={16} />} onClick={onFix}>
          Fix a score
        </Button>
      )}
    </div>
  );
}

function FinalHero({ state, onFix }: { state: GameState; onFix: () => void }) {
  const results = resolveResults(state);
  const winners = new Set(results.flatMap((r) => [r.winnerPlayerId, r.reverseWinnerPlayerId]).filter(Boolean)).size;
  const manual = new Set(state.manualWinners.map((m) => m.periodKey));
  const empties = results.filter((r) => !r.winnerPlayerId && !manual.has(r.periodKey)).length;
  return (
    <div className="relative overflow-hidden rounded-card bg-[linear-gradient(160deg,rgb(255_194_51/0.2),rgb(255_171_15/0.05)_60%)] bg-surface-2 p-4 shadow-glow-gold ring-1 ring-inset ring-gold-400/40">
      <div className="mb-3 flex items-center justify-center gap-2">
        <TrophyIcon size={18} filled className="text-gold-400" />
        <span className="eyebrow text-gold-300">Final</span>
      </div>
      <BigScore state={state} score={scoreLine(state)} />
      <p className="mt-3 text-center text-footnote text-ink-muted">
        {empties === 0
          ? `${pluralize(results.length, "prize")} decided · ${pluralize(winners, "winner")}`
          : `${empties === results.length ? (results.length === 1 ? "The prize" : results.length === 2 ? "Both prizes" : `All ${results.length} prizes`) : pluralize(empties, "prize")} landed on ${empties === 1 ? "an empty square" : "empty squares"}. You can give ${empties === 1 ? "it" : "them"} to a player below.`}
      </p>
      <Button variant="ghost" size="md" block className="mt-2" leading={<PencilIcon size={16} />} onClick={onFix}>
        Fix a score
      </Button>
    </div>
  );
}

// ---- Confirm views ----

function Fact({ icon, children, tone = "default" }: { icon: ReactNode; children: ReactNode; tone?: "default" | "warn" }) {
  return (
    <li className="flex items-start gap-3">
      <span
        className={cx(
          "mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-xl",
          tone === "warn" ? "bg-gold-400/15 text-gold-300" : "bg-surface-4 text-ink",
        )}
      >
        {icon}
      </span>
      <span className="pt-1 text-callout text-ink-muted">{children}</span>
    </li>
  );
}

function LockConfirm({ state }: { state: GameState }) {
  const f = lockFacts(state);
  const low = lockReadiness(f) === "low";
  const fresh = state.game.format.freshNumbers && state.game.format.periods === "quarters";
  return (
    <ul className="flex flex-col gap-3.5 pb-2 pt-1">
      {low && (
        <Fact icon={<UsersIcon size={16} />} tone="warn">
          <b className="font-bold text-ink">Only {f.claimed} of {f.total} squares are taken.</b> Most scores will land on an empty square. Inviting a few more friends first makes it more fun.
        </Fact>
      )}
      <Fact icon={<LockIcon size={16} />}>
        <b className="font-bold text-ink">Squares freeze.</b> No more picking or dropping.
      </Fact>
      <Fact icon={<ShuffleIcon size={16} />}>
        <b className="font-bold text-ink">0–9 drawn at random</b> for each team{fresh ? ", fresh every quarter" : ""}, live for everyone.
      </Fact>
      {f.empty > 0 ? (
        !low && (
          <Fact icon={<CrownIcon size={16} />} tone="warn">
            <b className="font-bold text-ink">{pluralize(f.empty, "square")} stay empty.</b> If one hits, you can give the prize to a player.
          </Fact>
        )
      ) : (
        <Fact icon={<UsersIcon size={16} />}>
          <b className="font-bold text-ink">All {f.total} squares taken</b> by {pluralize(f.players, "player")}. Nice.
        </Fact>
      )}
      {f.idle > 0 && (
        <Fact icon={<UsersIcon size={16} />} tone="warn">
          <b className="font-bold text-ink">{f.idle === 1 ? "1 player hasn't" : `${f.idle} players haven't`}</b> picked a square yet.
        </Fact>
      )}
    </ul>
  );
}

function EndConfirm({ state }: { state: GameState }) {
  const open = winnerRows(state).filter((r) => !r.result);
  return (
    <ul className="flex flex-col gap-3.5 pb-2 pt-1">
      <Fact icon={<FlagIcon size={16} />}>
        <b className="font-bold text-ink">The board goes final</b> for everyone and the winners get crowned.
      </Fact>
      {open.length > 0 && (
        <Fact icon={<TrophyIcon size={16} />} tone="warn">
          <b className="font-bold text-ink">{open.map((r) => r.label).join(", ")}</b> {open.length === 1 ? "has" : "have"} no score yet, so no winner. You can still add one after.
        </Fact>
      )}
      <Fact icon={<PencilIcon size={16} />}>You can still fix a score or pick a winner by hand later.</Fact>
    </ul>
  );
}

function DeleteConfirm({ state }: { state: GameState }) {
  const { game } = state;
  const f = lockFacts(state);
  return (
    <div className="flex flex-col gap-4 pb-2 pt-1">
      <p className="text-callout text-ink-muted">
        <b className="font-bold text-ink">{game.name}</b> disappears for everyone:{" "}
        {pluralize(f.claimed, "square")}, {pluralize(f.players, "player")}
        {state.scores.length > 0 ? `, ${pluralize(state.scores.length, "score")} and every winner` : ""}. Anyone opening the link sees that it was deleted.
      </p>
      <p className="rounded-2xl bg-danger-500/10 px-3.5 py-3 text-subhead font-semibold text-danger-300 ring-1 ring-inset ring-danger-500/30">
        This can't be undone.
      </p>
    </div>
  );
}
