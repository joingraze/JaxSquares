// The host sheet. Always titled "Host tools" with one line saying where the
// board stands, and always in the same order: Now (fill + lock, type the
// score, or watch the live feed), Winners, Co-hosts, Board. While the host fee
// is due the draw says its price (or "Free" on a board of 5 or fewer players),
// and a linked board offers paying ahead. Sub views (lock confirm, rules &
// prizes, edit, end, delete, the co-host invite and confirms) slide in inside
// the same sheet.
// A co-host (`role`) gets the same sheet without the host-only actions:
// inviting or removing co-hosts, the host link and deleting the board. Their
// own row in Co-hosts has "Step down".
// Saves are confirmed in the sheet's own footer, never by a toast over its header.

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { PRESET_INFO, drawKeys, everyScoreIndex, formatAmount, hasPrizeAmounts, periodPhrase, rulesOf, rulesSummary, unitOf } from "../../../shared/formats";
import { freshNumbersInfo, isFootball, presetsFor, wordsFor, type GameKind } from "../../../shared/sports";
import { squareHolders } from "../../../shared/hostFee";
import { SEASON_NUMBERS_INFO, currentSeasonGame, isSeasonBoard, isSeasonGame, seasonPositionLine } from "../../../shared/season";
import { boardCountLine, siblingCheckOf, siblingProblem } from "../../../shared/siblings";
import { prizeTotals, resolveResults } from "../../../shared/squares";
import { cohostIdsOf, isCohostOf } from "../../../shared/cohosts";
import type { BoardSize, CohostInviteResponse, GameState } from "../../../shared/types";
import {
  CheckIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  ClockIcon,
  CrownIcon,
  FlagIcon,
  GiftIcon,
  GridIcon,
  LinkIcon,
  LockIcon,
  PencilIcon,
  PlusIcon,
  ShareIcon,
  ShuffleIcon,
  SlidersIcon,
  SparklesIcon,
  TrashIcon,
  TrophyIcon,
  TvIcon,
  UserPlusIcon,
  UsersIcon,
} from "../../components/icons";
import {
  AvatarGroup,
  Badge,
  BottomSheet,
  Button,
  buttonStyles,
  Chip,
  IconButton,
  ListGroup,
  ListRow,
  ProgressRing,
  SegmentedControl,
  Switch,
  cx,
} from "../../components/ui";
import { PUBLIC_ORIGIN } from "../../lib/api";
import { boardViewPath } from "../../lib/boardViews";
import type { HostRole } from "../../lib/hostRole";
import { kickoffLabel, kicksOffLabel, pluralize, teamVars } from "../../lib/format";
import { useAuthSetup } from "../../lib/auth";
import { getAdminToken, hostLinkUrl, useAccount } from "../../lib/identity";
import { useClaims } from "../venue/useClaims";
import { haptic, shareLink } from "../../lib/native";
import { canRemovePlayer, playerRows } from "../board/boardModel";
import { siblingCreatePath } from "../create/sibling";
import { PlayersList } from "../board/PlayersList";
import { RulesEditor } from "../rules/RulesEditor";
import {
  canUseFreshNumbers,
  draftOf,
  lockViolation,
  noteProblems,
  presetChoice,
  prizeLineup,
  prizesSummary,
  rulesLock,
  rulesPatch,
  selectPreset,
  type RulesDraft,
} from "../rules/rulesModel";
import { CohostsSection } from "./CohostsSection";
import { EditBoard } from "./EditBoard";
import { FreeDrawNote } from "./FreeDrawNote";
import "./host.css";
import {
  COHOST_PITCH,
  FREE_DRAW_LABEL,
  FREE_TIER_LINE,
  NEXT_ENTRY,
  canPayAhead,
  defaultTargetKey,
  canEditKickoff,
  editDraftOf,
  editErrors,
  editPatch,
  entriesOnly,
  gameStarted,
  hasEntries,
  hostStatusLine,
  initialDraft,
  invitedAnyone,
  isLinked,
  isPicking,
  lockFacts,
  lockIsTheMove,
  lockReadiness,
  parseScore,
  payToDrawLabel,
  removeCopy,
  resolvedKey,
  saveEndsGame,
  scoreTargets,
  winnerRows,
  type EditDraft,
  type RemoveCopy,
  type ScoreDraft,
} from "./hostModel";
import { Keypad, ScorePreview, ScoreTiles, SuggestionChip, type SavedNotice } from "./ScorePad";
import { useScoreEntry } from "./useScoreEntry";
import type { HostActions } from "./useHostActions";
import { WinnersList } from "./WinnersList";
import { TvDisplaySettings } from "../tv/TvDisplaySettings";
import { useResolvedTheme } from "../../lib/theme";
import { PassIncluded } from "../pass/PassParts";
import { ExportPlayersRow } from "../club/ExportPlayersRow";

export type HostView =
  | "home"
  | "lock"
  | "edit"
  | "rules"
  | "end"
  | "delete"
  | "players"
  | "remove"
  /** A co-host invite link is ready to share (host only). */
  | "cohost-invite"
  /** Confirm removing a co-host (host only). */
  | "cohost-remove"
  /** Confirm stepping down (a co-host). */
  | "step-down"
  /** What TV mode shows (shared/tv.ts). */
  | "tv";

/** The player the host asked to remove, as they were when asked; `from` is where the ask came from. */
export interface RemoveTarget {
  id: string;
  name: string;
  squares: number;
  from: "board" | "sheet";
}

export interface HostSheetProps {
  state: GameState;
  open: boolean;
  view: HostView;
  onView: (view: HostView) => void;
  onClose: () => void;
  actions: HostActions;
  /** This device's public player id. */
  me: string;
  /** How this device runs the board: its host, or a co-host (no host-only actions). Default "host". */
  role?: HostRole;
  /** Sign in (the host, not signed in, where sign-in is set up): the board's host controls then follow them to any device. */
  onSignIn?: () => void;
  onInvite: () => void;
  /** The host fee is due before the numbers can be drawn (needsHostFee, the board isn't free, and no Host Pass covers it). */
  fee: boolean;
  /** The fee would be due, but the host's Host Pass covers it: "Included with your Host Pass", and the draw just draws. */
  covered?: boolean;
  /** The fee would be due, but 5 or fewer players hold squares (drawIsFree): "Draw the numbers · Free", and the draw just draws. */
  free?: boolean;
  /** The fee as this device shows it ("$4.99", or the App Store's price), null when it can't be said. */
  price: string | null;
  /** Linked boards whose fee is due: pay now so Jax draws the numbers at kickoff. */
  onPayAhead: () => void;
  /** The host confirmed the lock: the parent pays the fee first when it's due, closes the sheet and runs the reveal. */
  onLock: () => void;
  onPickWinner: (periodKey: string, label: string) => void;
  /** The game just ended (final score saved or "End game"). */
  onEnded: () => void;
  onDeleted: () => void;
  /** The "remove" view's player. */
  removing: RemoveTarget | null;
  /** From the players view: confirm removing this player (public id). */
  onAskRemove: (playerId: string) => void;
  /** The player is off the board (the new state is already applied). */
  onRemoved: (target: RemoveTarget, copy: RemoveCopy) => void;
}

/** How long a "saved" line stays in the footer if the host doesn't start the next score. */
const NOTICE_MS = 7000;

interface Notice extends SavedNotice {
  /** Shown while the keypad still holds this period and this draft (the host hasn't moved on). */
  key: string | null;
  draft: ScoreDraft | null;
}

/**
 * Until the host signs in, only this device can run the board (it holds the
 * admin token): signing in puts it on their account, on every device. Only
 * rendered with the sheet's menu, so the sign-in setup is read when it opens.
 */
function SignInToHostRow({ onSignIn }: { onSignIn: () => void }) {
  const account = useAccount();
  const setup = useAuthSetup();
  if (account || !setup.ready || setup.providers.length === 0) return null;
  return (
    <ListRow
      data-testid="host-signin"
      leading={<RowIcon><UsersIcon size={18} /></RowIcon>}
      title="Run it from any device"
      subtitle="Only this device can run it now. Sign in to keep it on your account"
      chevron
      onClick={onSignIn}
    />
  );
}

export function HostSheet(props: HostSheetProps) {
  const theme = useResolvedTheme();
  const { state, open, view, onView, onClose, actions, me, role = "host" } = props;
  const { game } = state;
  const isHost = role === "host";
  const linked = isLinked(game);
  // Only score entries win (no quarter-ends); `entries`: every score wins (maybe with quarter-ends too).
  const everyScore = entriesOnly(game);
  const entries = hasEntries(game);
  const started = gameStarted(state);
  // A season board keeps its games on their own boards; a season's game follows its season board.
  const season = isSeasonBoard(game);
  const seasonGame = isSeasonGame(game);

  // ---- score entry (kept here so the footer can preview + save) ----
  const entry = useScoreEntry(state, defaultTargetKey(state));
  const [fixing, setFixing] = useState(false);
  const scoreRef = useRef<HTMLElement>(null);
  const typedBoard = game.status === "locked" && !linked && !season;
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

  // ---- rules & prizes draft ----
  const [rulesDraft, setRulesDraft] = useState<RulesDraft>(() => draftOf(game.format, game.prizes));
  useEffect(() => {
    if (view === "rules") setRulesDraft(draftOf(game.format, game.prizes));
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reset when the rules view opens
  }, [view]);

  const targets = useMemo(() => scoreTargets(state), [state]);
  // A venue board's claim codes, every winner's (a co-host's come by their sign-in, with no token).
  const claims = useClaims(state, getAdminToken(game.id), open);
  const target = targets.find((t) => t.key === entry.key) ?? targets[targets.length - 1];
  const label = target?.label ?? "this period";
  // Mid-sentence: "Maya wins at halftime", "see who wins on score 3".
  const moment = target ? periodPhrase(resolvedKey(state, target.key), target.label).moment : "this period";

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
            title: winner.id === me ? `Saved · you win ${moment}!` : `Saved · ${winner.name} wins ${moment}`,
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

  const saveRules = async () => {
    const patch = rulesPatch(game, rulesDraft);
    if (!patch) return onView("home");
    const next = await actions.update(patch);
    if (!next) return;
    void haptic("success");
    say({ tone: "neutral", title: "Rules & prizes updated", detail: "Everyone sees them now.", player: null });
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

  // ---- co-hosts ----
  /** The link the host just made, shared from the "cohost-invite" view (a tap, so the share sheet always opens). */
  const [cohostLink, setCohostLink] = useState<CohostInviteResponse | null>(null);
  /** The co-host the host asked to remove. */
  const [cohostTarget, setCohostTarget] = useState<{ id: string; name: string } | null>(null);
  const hostName = state.players.find((p) => p.id === game.hostPlayerId)?.name || "The host";

  const inviteCohost = async () => {
    const link = await actions.inviteCohost();
    if (!link) return;
    void haptic("success");
    setCohostLink(link);
    onView("cohost-invite");
  };

  const shareCohostLink = async () => {
    if (!cohostLink) return;
    const outcome = await shareLink({
      title: `Co-host ${game.name}`,
      text: `Help me run "${game.name}" on JaxSquares. This link makes you a co-host. It works once, for 7 days.`,
      url: cohostLink.url,
    });
    if (outcome === "cancelled") return;
    if (outcome === "shared") void haptic("success");
    say({
      tone: "neutral",
      title: outcome === "copied" ? "Co-host link copied" : "Co-host invite sent",
      detail: outcome === "copied" ? "Send it to one person. It works once, for 7 days." : "They're a co-host once they accept.",
      player: null,
    });
    setCohostLink(null);
    onView("home");
  };

  const removeCohost = async () => {
    if (!cohostTarget) return;
    void haptic("medium");
    if (!(await actions.removeCohost(cohostTarget.id))) return;
    say({ tone: "neutral", title: `${cohostTarget.name} isn't a co-host anymore`, detail: "They're still on the board.", player: null });
    onView("home");
  };

  const stepDown = async () => {
    void haptic("medium");
    // The host tools go away with the role; the board says so.
    await actions.stepDown();
  };

  // ---- removing a player (from the players view, or a row on the board) ----
  const picking = isPicking(game);
  const removeTarget = props.removing;
  const targetPlayer = removeTarget ? state.players.find((p) => p.id === removeTarget.id) ?? null : null;
  const targetCopy = removeTarget
    ? removeCopy(
        targetPlayer?.name ?? removeTarget.name,
        targetPlayer ? state.squares.filter((s) => s.playerId === removeTarget.id).length : removeTarget.squares,
      )
    : null;
  const removePlayer = async () => {
    if (!removeTarget || !targetCopy) return;
    void haptic("medium");
    if (await actions.removePlayer(removeTarget.id)) props.onRemoved(removeTarget, targetCopy);
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
    body = <LockConfirm state={state} fee={props.fee} covered={!!props.covered} free={!!props.free} price={props.price} season={season} />;
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
          {props.fee
            ? low
              ? `Lock & draw anyway${props.price ? ` · ${props.price}` : ""}`
              : payToDrawLabel(props.price, season)
            : props.free
              ? low
                ? "Lock & draw anyway · Free"
                : FREE_DRAW_LABEL
              : low
                ? "Lock & draw anyway"
                : "Draw the numbers"}
        </Button>
        {props.free && <FreeDrawNote className="py-1" />}
        <Button variant="ghost" block onClick={low ? props.onInvite : () => onView("home")}>
          {low ? "Keep inviting" : "Not yet"}
        </Button>
      </div>
    );
  } else if (view === "rules") {
    const lock = rulesLock(state);
    const violation = lockViolation(game, rulesDraft, lock);
    const invalid = Object.keys(noteProblems(rulesDraft.rules)).length > 0 || !!violation;
    const patch = rulesPatch(game, rulesDraft);
    title = <>{back()}Rules & prizes</>;
    description = "Change it any time. Who wins when locks once the first score is in.";
    body = (
      <RulesEditView
        draft={rulesDraft}
        onChange={setRulesDraft}
        lock={lock}
        violation={violation}
        boardSize={game.format.boardSize}
        // The board's total, like "the rest": every square until the draw, the claimed ones after.
        squares={game.numbers ? state.squares.length : undefined}
        kind={game}
      />
    );
    footer = (
      <Button
        data-testid="rules-save"
        size="lg"
        block
        variant={invalid || !patch ? "secondary" : "primary"}
        disabled={invalid || !patch}
        loading={actions.busy === "edit"}
        onClick={() => void saveRules()}
      >
        {patch ? "Save rules & prizes" : "No changes yet"}
      </Button>
    );
  } else if (view === "tv") {
    title = <>{back()}TV display</>;
    description = "What the TV shows. Every TV with this board changes right away.";
    body = <TvDisplaySettings game={game} onChange={async (tv) => (await actions.update({ tv })) !== null} />;
    footer = (
      <Link
        to={boardViewPath(game.id, "tv")}
        data-testid="host-tv-open"
        className={buttonStyles({ size: "lg", block: true, variant: "secondary" })}
        onClick={() => void haptic("selection")}
      >
        <TvIcon size={18} />
        Open TV mode
      </Link>
    );
  } else if (view === "edit") {
    const errors = editErrors(draft, game);
    const invalid = !!errors.name || !!errors.kickoff;
    const patch = editPatch(game, draft);
    title = <>{back()}Edit board</>;
    body = <EditBoard game={game} draft={draft} onChange={setDraft} onRules={() => onView("rules")} />;
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
  } else if (view === "players") {
    title = <>{back()}Players</>;
    description = picking ? "Remove someone to open up their squares." : null;
    body = (
      <div className="pb-2">
        <PlayersList
          rows={playerRows(state, [], me)}
          total={state.players.length}
          hostId={game.hostPlayerId}
          cohostIds={cohostIdsOf(game)}
          stage="picking"
          collapseAfter={Infinity}
          onRemove={picking ? props.onAskRemove : undefined}
          canRemove={(id) => canRemovePlayer(game, id, me, role)}
        />
      </div>
    );
  } else if (view === "remove" && removeTarget && targetCopy) {
    title = <>{back("players")}{targetCopy.title}</>;
    body = <RemoveConfirm copy={targetCopy} />;
    footer = (
      <div className="flex flex-col gap-1">
        <Button
          data-testid="remove-player-confirm"
          variant="danger"
          size="lg"
          block
          disabled={!picking}
          loading={actions.busy === "remove-player"}
          onClick={() => void removePlayer()}
        >
          {targetCopy.confirm}
        </Button>
        <Button variant="ghost" block onClick={() => (removeTarget.from === "board" ? onClose() : onView("players"))}>
          Keep {targetPlayer?.name || removeTarget.name || "them"}
        </Button>
      </div>
    );
  } else if (view === "cohost-invite" && isHost && cohostLink) {
    title = <>{back()}Co-host invite ready</>;
    description = "Send it to the one person you want running the board with you.";
    body = <CohostInviteFacts />;
    footer = (
      <div className="flex flex-col gap-1">
        <Button data-testid="cohost-share" size="lg" block leading={<ShareIcon size={20} />} onClick={() => void shareCohostLink()}>
          Share co-host link
        </Button>
        <Button variant="ghost" block onClick={() => onView("home")}>
          Done
        </Button>
      </div>
    );
  } else if (view === "cohost-remove" && isHost && cohostTarget && isCohostOf(game, cohostTarget.id)) {
    title = <>{back()}Remove {cohostTarget.name} as co-host?</>;
    body = <RemoveCohostConfirm name={cohostTarget.name} />;
    footer = (
      <div className="flex flex-col gap-1">
        <Button
          data-testid="cohost-remove-confirm"
          variant="danger"
          size="lg"
          block
          loading={actions.busy === "cohost-remove"}
          onClick={() => void removeCohost()}
        >
          Remove as co-host
        </Button>
        <Button variant="ghost" block onClick={() => onView("home")}>
          Keep {cohostTarget.name}
        </Button>
      </div>
    );
  } else if (view === "step-down" && !isHost && isCohostOf(game, me)) {
    title = <>{back()}Step down as co-host?</>;
    body = <StepDownConfirm hostName={hostName} />;
    footer = (
      <div className="flex flex-col gap-1">
        <Button
          data-testid="cohost-step-down-confirm"
          variant="danger"
          size="lg"
          block
          loading={actions.busy === "cohost-remove"}
          onClick={() => void stepDown()}
        >
          Step down
        </Button>
        <Button variant="ghost" block onClick={() => onView("home")}>
          Stay a co-host
        </Button>
      </div>
    );
  } else if (view === "delete" && isHost) {
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
    const showWinners = (game.status === "locked" || game.status === "final") && !season;
    const rows = showWinners ? winnerRows(state) : [];
    body = (
      <div className="flex flex-col gap-6 pb-2">
        <Section title="Now">
          {picking && (
            <OpenHero
              state={state}
              onInvite={props.onInvite}
              onLock={() => onView("lock")}
              fee={props.fee}
              covered={!!props.covered}
              free={!!props.free}
              price={props.price}
              onPayAhead={props.onPayAhead}
              season={season}
            />
          )}
          {season && !picking && <SeasonHero state={state} />}
          {game.status === "locked" && linked && !fixing && <AutoHero state={state} started={started} onFix={() => setFixing(true)} />}
          {game.status === "final" && !fixing && !season && <FinalHero state={state} onFix={() => setFixing(true)} />}

          {scoring && (
            <section ref={scoreRef} aria-label="Score entry" className="flex scroll-mt-2 flex-col gap-3">
              {entries && !everyScore ? (
                // Every score and the quarter-ends: one tab adds (or fixes) a score change, the others mark a quarter-end.
                <SegmentedControl
                  aria-label="What you're scoring"
                  size="sm"
                  data-testid="score-moment"
                  value={entry.key}
                  onChange={(k) => entry.setKey(k)}
                  options={[
                    {
                      value: everyScoreIndex(entry.key) !== null ? entry.key : NEXT_ENTRY,
                      label: everyScoreIndex(entry.key) !== null ? label : "+ Score",
                    },
                    ...targets
                      .filter((t) => t.key !== NEXT_ENTRY && everyScoreIndex(t.key) === null)
                      .map((t) => ({ value: t.key, label: t.existing ? `${t.label} ✓` : t.label })),
                  ]}
                />
              ) : !everyScore ? (
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
              <Keypad entry={entry} teamX={game.teamX} teamY={game.teamY} quickAdds={isFootball(game) && (entry.key === NEXT_ENTRY || everyScoreIndex(entry.key) !== null)} />
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
                      className="pressable tap-target rounded-full px-1 py-1.5 text-footnote font-bold text-ink-danger disabled:opacity-40"
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
              codes={claims?.all ?? null}
              onCollect={(k, reverse, collected) => void actions.collect(k, reverse, collected)}
              rows={rows}
              me={me}
              busy={actions.busy !== null}
              canPickOpen={linked && started}
              onPick={props.onPickWinner}
              onUndoPick={(k, l) => void undoPick(k, l)}
              onEdit={
                entries && scoring
                  ? (k) => {
                      void haptic("selection");
                      entry.setKey(k);
                      scoreRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
                    }
                  : undefined
              }
            />
            <PrizeTotals state={state} me={me} />
          </Section>
        )}

        {/* Watch parties: the board on the TV (TV mode, /g/:id/tv). */}
        <Link
          to={boardViewPath(game.id, "tv")}
          data-testid="host-tv"
          onClick={() => void haptic("selection")}
          className="pressable flex min-h-14 items-center gap-3 rounded-card bg-surface-3/60 px-4 py-2.5 ring-1 ring-inset ring-line"
        >
          <RowIcon>
            <TvIcon size={18} />
          </RowIcon>
          <span className="min-w-0 flex-1 text-subhead leading-snug text-ink-muted">
            <b className="font-bold text-ink">Hosting a watch party?</b> Show the board on your TV.
          </span>
          <ChevronRightIcon size={18} className="-mr-1 shrink-0 text-ink-subtle" />
        </Link>
        {!seasonGame && (
          <button
            type="button"
            data-testid="host-tv-display"
            onClick={() => {
              void haptic("selection");
              onView("tv");
            }}
            className="pressable -mt-1 flex min-h-12 w-full items-center gap-3 rounded-card bg-surface-3/60 px-4 py-2 text-left ring-1 ring-inset ring-line"
          >
            <RowIcon>
              <SlidersIcon size={18} />
            </RowIcon>
            <span className="min-w-0 flex-1 text-subhead leading-snug text-ink-muted">
              <b className="font-bold text-ink">TV display</b> Choose what the TV shows
            </span>
            <ChevronRightIcon size={18} className="-mr-1 shrink-0 text-ink-subtle" />
          </button>
        )}

        {seasonGame && game.seasonId ? (
          <ListGroup title="Season">
            <ListRow
              data-testid="host-season-link"
              leading={<RowIcon tone="gold"><TrophyIcon size={18} /></RowIcon>}
              title={state.seasonGame ? `${seasonPositionLine(state.seasonGame)} · ${state.seasonGame.name}` : "The season board"}
              subtitle="Players, rules, prizes and co-hosts are set on the season board"
              chevron
              to={`/g/${game.seasonId}`}
              onClick={() => void haptic("selection")}
            />
          </ListGroup>
        ) : (isHost || isCohostOf(game, me)) && (
          <CohostsSection
            state={state}
            role={role}
            me={me}
            busy={actions.busy !== null}
            onInvite={() => void inviteCohost()}
            onRemove={(id) => {
              void haptic("selection");
              setCohostTarget({ id, name: state.players.find((p) => p.id === id)?.name || "them" });
              onView("cohost-remove");
            }}
            onStepDown={() => {
              void haptic("selection");
              onView("step-down");
            }}
          />
        )}

        <ListGroup title="Board">
          {/* Several boards for one game ($1, $5, $20): same game and rules, another square price. */}
          {!season && !seasonGame && !siblingProblem(siblingCheckOf(state), Date.now()) && (
            <ListRow
              data-testid="host-add-board"
              leading={<RowIcon tone="gold"><PlusIcon size={18} /></RowIcon>}
              title="Add another board for this game"
              subtitle={boardCountLine(state) ?? "Same game, another square price"}
              chevron
              to={siblingCreatePath(game.id)}
              onClick={() => void haptic("selection")}
            />
          )}
          {!seasonGame && (
            <ListRow
              data-testid="host-rules"
              leading={<RowIcon tone="gold"><GiftIcon size={18} /></RowIcon>}
              title="Rules & prizes"
              subtitle={
                season
                  ? `${prizeLineup(game.format) ? prizesSummary(game.format) : rulesSummary(rulesOf(game.format, game.prizes))} · every game still to play`
                  : prizeLineup(game.format)
                    ? prizesSummary(game.format)
                    : rulesSummary(rulesOf(game.format, game.prizes))
              }
              chevron
              onClick={() => onView("rules")}
            />
          )}
          {!seasonGame && (
            <ListRow
              leading={<RowIcon><PencilIcon size={18} /></RowIcon>}
              title="Edit board"
              subtitle={["Name", canEditKickoff(game) && !season && wordsFor(game).startLower, picking && "max squares per player"].filter(Boolean).join(", ")}
              chevron
              onClick={() => onView("edit")}
            />
          )}
          {picking && state.players.some((p) => canRemovePlayer(game, p.id, me, role)) && (
            <ListRow
              leading={<RowIcon><UsersIcon size={18} /></RowIcon>}
              title="Players"
              subtitle="Remove someone from the board"
              detail={state.players.length}
              chevron
              onClick={() => onView("players")}
            />
          )}
          {/* A Club Pass board's players as a CSV, for the host and co-hosts (src/features/club). */}
          <ExportPlayersRow game={game} />
          {isHost && props.onSignIn && <SignInToHostRow onSignIn={props.onSignIn} />}
          {/* The host link hands over the admin token: a co-host has none (and needs none on another phone). */}
          {isHost && (
            <ListRow
              leading={<RowIcon><LinkIcon size={18} /></RowIcon>}
              title="Host from another phone"
              subtitle="Send yourself your private host link"
              trailing={<ShareIcon size={18} className="text-ink-subtle" />}
              onClick={() => void shareHostLink()}
            />
          )}
          {game.status === "locked" && started && (
            <ListRow
              leading={<RowIcon><FlagIcon size={18} /></RowIcon>}
              title="End game"
              subtitle="Call it final and crown the winners"
              chevron
              onClick={() => onView("end")}
            />
          )}
          {isHost && !seasonGame && (
            <ListRow
              leading={<RowIcon tone="danger"><TrashIcon size={18} /></RowIcon>}
              title={season ? "Delete season board" : "Delete board"}
              destructive
              chevron
              onClick={() => onView("delete")}
            />
          )}
        </ListGroup>
      </div>
    );
    if (scoring) {
      footer = (
        <div style={teamVars(game.teamX, game.teamY, theme)}>
          <ScorePreview state={state} entry={entry} label={label} moment={moment} me={me} notice={noticeLive} />
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
      <div key={view} style={teamVars(game.teamX, game.teamY, theme)} className={view === "home" ? "hx-view-pop" : "hx-view-push"}>
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

function RowIcon({ children, tone = "default" }: { children: ReactNode; tone?: "default" | "danger" | "gold" }) {
  return (
    <span
      className={cx(
        "grid h-9 w-9 place-items-center rounded-xl",
        tone === "danger" ? "bg-danger-500/15 text-ink-danger" : tone === "gold" ? "bg-gold-400/15 text-ink-gold" : "bg-surface-4 text-ink",
      )}
    >
      {children}
    </span>
  );
}

// ---- Rules & prizes ----

function RulesEditView({
  draft,
  onChange,
  lock,
  violation,
  boardSize,
  squares,
  kind,
}: {
  draft: RulesDraft;
  onChange: (draft: RulesDraft) => void;
  lock: ReturnType<typeof rulesLock>;
  violation: string | null;
  boardSize: BoardSize;
  /** Squares the board's total counts (the claimed ones once drawn); every square when absent. */
  squares?: number;
  /** The board's sport and league: its presets and moments (no every score for basketball, halves in men's college). */
  kind?: GameKind;
}) {
  const preset = presetChoice(draft.rules);
  const fresh = freshNumbersInfo(kind);
  return (
    <div className="flex flex-col gap-5 pb-2">
      <section aria-label="Presets" className="flex flex-col gap-2">
        <p className="eyebrow px-1 text-ink-subtle">When squares win</p>
        <div className="scrollbar-none -mx-1 flex gap-2 overflow-x-auto px-1 pb-0.5">
          {presetsFor(kind).map((p) => (
            <Chip
              key={p}
              data-testid="rules-preset"
              data-preset={p}
              selected={preset === p}
              disabled={!!lock.scoring && preset !== p}
              onClick={() => preset !== p && onChange({ ...draft, rules: selectPreset(draft.rules, p) })}
            >
              {PRESET_INFO[p].short}
            </Chip>
          ))}
          {preset === null && <Chip selected disabled>{PRESET_INFO.custom.short}</Chip>}
        </div>
      </section>
      <RulesEditor draft={draft} onChange={onChange} boardSize={boardSize} squares={squares} locked={lock.scoring} kind={kind} />
      {canUseFreshNumbers(draft.rules) && (
        <div className="rounded-2xl bg-surface-3 px-3.5 py-2.5 ring-1 ring-inset ring-line">
          <Switch
            className="min-h-12"
            label={fresh.label}
            description={lock.fresh ?? fresh.description}
            checked={draft.freshNumbers}
            disabled={!!lock.fresh}
            onChange={(freshNumbers) => onChange({ ...draft, freshNumbers })}
          />
        </div>
      )}
      {violation && (
        <p className="rounded-2xl bg-danger-500/10 px-3.5 py-2.5 text-footnote font-semibold text-ink-danger ring-1 ring-inset ring-danger-500/30">{violation}</p>
      )}
    </div>
  );
}

/** Each player's prize total (display-only), under Winners when the board has amounts. */
function PrizeTotals({ state, me }: { state: GameState; me: string }) {
  if (!hasPrizeAmounts(state.game.format)) return null;
  const totals = Object.entries(prizeTotals(resolveResults(state))).sort((a, b) => b[1] - a[1]);
  if (totals.length === 0) return null;
  const unit = unitOf(state.game.format);
  return (
    <div data-testid="prize-totals" className="rounded-card bg-surface-3/60 px-3.5 py-3 ring-1 ring-inset ring-line">
      <p className="eyebrow text-ink-subtle">Prize totals</p>
      <ul className="mt-2 flex flex-col gap-1.5">
        {totals.map(([id, total]) => {
          const p = state.players.find((x) => x.id === id);
          return (
            <li key={id} className="flex items-center gap-2.5">
              {p && <AvatarGroup size="xs" max={1} people={[{ id: p.id, name: p.name, color: p.color, emoji: p.emoji }]} />}
              <span className="min-w-0 flex-1 truncate text-callout font-bold text-ink">{id === me ? "You" : (p?.name ?? "Someone")}</span>
              <span className="font-display text-callout font-extrabold tabular-nums text-ink-gold">{formatAmount(total, unit)}</span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

// ---- Heroes ----

function OpenHero({
  state,
  onInvite,
  onLock,
  fee,
  covered,
  free,
  price,
  onPayAhead,
  season = false,
}: {
  state: GameState;
  onInvite: () => void;
  onLock: () => void;
  fee: boolean;
  covered: boolean;
  free: boolean;
  price: string | null;
  onPayAhead: () => void;
  /** A season board: one draw (and one fee) for every game of the season. */
  season?: boolean;
}) {
  const { game } = state;
  const now = Date.now();
  const f = lockFacts(state);
  const full = f.empty === 0;
  const kickoff = game.linkedEvent?.startsAt ?? null;
  // A linked game under way that wasn't drawn at kickoff (its fee wasn't paid).
  const late = kickoff !== null && gameStarted(state, now);
  // Same rule as the host bar: Invite leads until the board is (nearly) full, or the game is on.
  const ready = lockIsTheMove(f.claimed, f.total) || (late && f.claimed > 0);
  const nobody = lockReadiness(f) === "empty";
  // A custom board's kickoff is only a plan: it never locks itself.
  const planned = !game.linkedEvent && game.startsAt && game.startsAt > now ? game.startsAt : null;
  const inviteButton = (
    <Button key="invite" variant={ready ? "secondary" : "primary"} leading={<UsersIcon size={18} />} onClick={onInvite}>
      {invitedAnyone(state) ? "Invite more" : "Invite friends"}
    </Button>
  );
  const drawButton = (
    <Button
      key="draw"
      data-testid="host-lock"
      variant={ready ? "primary" : "secondary"}
      leading={fee || covered || free ? <ShuffleIcon size={18} strokeWidth={2.4} /> : <LockIcon size={18} />}
      onClick={onLock}
      disabled={nobody}
      haptic="medium"
    >
      {fee ? payToDrawLabel(price, season) : free ? FREE_DRAW_LABEL : covered ? "Draw the numbers" : "Lock & draw"}
    </Button>
  );
  // Right under the draw: what a price would say on a free board, or one the Host Pass covers.
  const drawNote = free ? <FreeDrawNote key="note" className="-mt-1" /> : covered ? <PassIncluded key="note" className="-mt-1" /> : null;
  // Until it's paid for, the hint says boards with up to 5 players are free.
  const upcoming = state.season?.games.filter((g) => g.startsAt > now).length ?? 0;
  const hint = season
    ? nobody
      ? `Drawing turns on once someone picks a square.${fee || free ? ` ${FREE_TIER_LINE}` : ""}`
      : upcoming === 0
        ? "No games left to play this season, so there's nothing to draw."
        : `Draw once everyone's in: every game still to play gets its own board.${fee ? " Bigger season boards pay once, for the whole season." : free ? ` ${FREE_TIER_LINE}` : ""}`
    : nobody
    ? fee || free
      ? `Drawing turns on once someone picks a square.${free ? ` ${FREE_TIER_LINE}` : ""}`
      : "Lock & draw turns on once someone picks a square."
    : late && (fee || free)
      ? `${wordsFor(game).start}'s passed, so the numbers weren't drawn. Draw them whenever you're ready.`
      : fee
        ? planned
          ? `${kicksOffLabel(planned, undefined, game.sport)}. ${FREE_TIER_LINE} Bigger ones pay when you draw.`
          : `${FREE_TIER_LINE} Bigger ones pay when you draw the numbers.`
        : kickoff
          ? `Jax draws the numbers at ${wordsFor(game).startLower} (${kickoffLabel(kickoff)}) if you don't.${free ? ` ${FREE_TIER_LINE}` : ""}`
          : planned
            ? `${kicksOffLabel(planned, undefined, game.sport)}. Lock when everyone's in.${free ? ` ${FREE_TIER_LINE}` : ""}`
            : free
              ? `Lock when everyone's in. ${FREE_TIER_LINE}`
              : "Lock when everyone's in. The numbers get drawn live.";
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
      {fee || covered || free ? (
        // The draw carries its price (or "Free", or the Host Pass), so each button gets the full width; the move to make goes first.
        <div className="relative mt-4 flex flex-col gap-2.5">
          {ready ? [drawButton, drawNote, inviteButton] : [inviteButton, drawButton, drawNote]}
        </div>
      ) : (
        <div className="relative mt-4 grid grid-cols-2 gap-2.5">
          {inviteButton}
          {drawButton}
        </div>
      )}
      {fee && canPayAhead(game, now) && kickoff !== null && (
        <button
          type="button"
          data-testid="host-pay-ahead"
          onClick={onPayAhead}
          className="pressable relative mt-2.5 flex w-full items-center gap-3 rounded-2xl bg-surface-4/70 px-3.5 py-2.5 text-left ring-1 ring-inset ring-line"
        >
          <ClockIcon size={20} className="shrink-0 text-ink-brand" />
          <span className="min-w-0 flex-1">
            <span className="block text-subhead font-extrabold leading-snug text-ink">Pay now and Jax draws the numbers at {wordsFor(game).startLower}</span>
            <span className="block text-footnote text-ink-muted">
              {price ? `${price} · ` : ""}squares stay open till {kickoffLabel(kickoff)}
            </span>
          </span>
          <ChevronRightIcon size={16} strokeWidth={2.6} className="shrink-0 text-ink-subtle" />
        </button>
      )}
      <p className="relative mt-3 text-footnote text-ink-subtle">{hint}</p>
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
          <span className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-brand-400/12 text-ink-brand ring-1 ring-inset ring-brand-line/25">
            <ClockIcon size={24} />
          </span>
          <div className="min-w-0">
            <p className="font-display text-headline font-extrabold text-ink">
              {kickoff ? `${wordsFor(game).start} ${kickoffLabel(kickoff)}` : `Waiting for ${wordsFor(game).startLower}`}
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
    <div className="relative overflow-hidden rounded-card bg-[linear-gradient(160deg,rgb(255_194_51/0.2),rgb(255_171_15/0.05)_60%)] bg-surface-2 p-4 shadow-glow-gold ring-1 ring-inset ring-gold-line/40">
      <div className="mb-3 flex items-center justify-center gap-2">
        <TrophyIcon size={18} filled className="text-ink-gold" />
        <span className="eyebrow text-ink-gold">Final</span>
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
          tone === "warn" ? "bg-gold-400/15 text-ink-gold" : "bg-surface-4 text-ink",
        )}
      >
        {icon}
      </span>
      <span className="pt-1 text-callout text-ink-muted">{children}</span>
    </li>
  );
}

/** A drawn season board: how many games are played, and the one on now or next (a tap opens it). */
function SeasonHero({ state }: { state: GameState }) {
  const games = state.season?.games ?? [];
  const played = games.filter((g) => g.status === "final").length;
  const current = currentSeasonGame(games, Date.now());
  return (
    <div data-testid="host-season" className="rounded-card bg-surface-3 p-4 shadow-card ring-1 ring-inset ring-line-strong">
      <p className="font-display text-title-3 font-extrabold text-ink">{state.game.status === "final" ? "The season's over" : `${played} of ${pluralize(games.length, "game")} played`}</p>
      <p className="mt-0.5 text-footnote text-ink-muted">Each game runs on its own board: live scores, winners and fixes happen there.</p>
      {current?.id && (
        <Link
          to={`/g/${current.id}`}
          data-testid="host-season-next"
          onClick={() => void haptic("selection")}
          className="pressable mt-3 flex min-h-12 items-center gap-3 rounded-2xl bg-surface-4/70 px-3.5 py-2 ring-1 ring-inset ring-line"
        >
          <span className="min-w-0 flex-1">
            <span className="block truncate text-subhead font-extrabold text-ink">
              {current.live === "in" ? "On now" : "Next"} · {current.teamX.abbr ?? current.teamX.name} vs {current.teamY.abbr ?? current.teamY.name}
            </span>
            <span className="block truncate text-footnote text-ink-muted">{current.live === "in" && current.score ? current.score.label : kickoffLabel(current.startsAt)}</span>
          </span>
          <ChevronRightIcon size={16} strokeWidth={2.6} className="shrink-0 text-ink-subtle" />
        </Link>
      )}
    </div>
  );
}

function LockConfirm({
  state,
  fee,
  covered,
  free,
  price,
  season = false,
}: {
  state: GameState;
  fee: boolean;
  covered: boolean;
  free: boolean;
  price: string | null;
  season?: boolean;
}) {
  const f = lockFacts(state);
  const low = lockReadiness(f) === "low";
  const fresh = drawKeys(state.game.format).length > 1;
  const holders = squareHolders(state.squares);
  return (
    <ul className="flex flex-col gap-3.5 pb-2 pt-1">
      {fee && (
        <Fact icon={<SparklesIcon size={16} />}>
          <b className="font-bold text-ink">
            {price ? `${price} host fee` : "The host fee"}, {season ? "once for the whole season" : "once for this board"}.
          </b>{" "}
          {FREE_TIER_LINE} This one has {holders}. Setting up, inviting and picking squares are always free.
        </Fact>
      )}
      {free && (
        <Fact icon={<SparklesIcon size={16} />}>
          <b className="font-bold text-ink">No host fee.</b> {FREE_TIER_LINE} {holders === 1 ? "1 player holds" : `${holders} players hold`} squares here.
        </Fact>
      )}
      {covered && (
        <Fact icon={<SparklesIcon size={16} />}>
          <b className="font-bold text-ink">Included with your Host Pass.</b> No host fee for this {season ? "season" : "board"}.
        </Fact>
      )}
      {low && (
        <Fact icon={<UsersIcon size={16} />} tone="warn">
          <b className="font-bold text-ink">Only {f.claimed} of {f.total} squares are taken.</b> Most scores will land on an empty square. Inviting a few more friends first makes it more fun.
        </Fact>
      )}
      <Fact icon={<LockIcon size={16} />}>
        <b className="font-bold text-ink">Squares freeze.</b> No more picking or dropping.
      </Fact>
      {season && state.season ? (
        <>
          <Fact icon={<TrophyIcon size={16} />}>
            <b className="font-bold text-ink">Every game still to play gets its own board</b>, {state.season.scope === "team" ? "and playoff games join as they're scheduled" : "with the same squares and live scores"}.
          </Fact>
          <Fact icon={<ShuffleIcon size={16} />}>
            <b className="font-bold text-ink">{SEASON_NUMBERS_INFO[state.season.numbers].label}.</b> {SEASON_NUMBERS_INFO[state.season.numbers].description}
          </Fact>
        </>
      ) : (
        <Fact icon={<ShuffleIcon size={16} />}>
          <b className="font-bold text-ink">0–9 drawn at random</b> for each team{fresh ? `, fresh every ${freshNumbersInfo(state.game).each}` : ""}, live for everyone.
        </Fact>
      )}
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

function CohostInviteFacts() {
  return (
    <ul className="flex flex-col gap-3.5 pb-2 pt-1">
      <Fact icon={<CrownIcon size={16} />}>
        <b className="font-bold text-ink">{COHOST_PITCH}</b> Enter scores, draw the numbers, edit the rules and prizes, and invite players.
      </Fact>
      <Fact icon={<LinkIcon size={16} />}>
        <b className="font-bold text-ink">For one person.</b> The link works once and expires in 7 days.
      </Fact>
      <Fact icon={<UserPlusIcon size={16} />}>They join the board first if they haven't yet. You can remove a co-host any time.</Fact>
    </ul>
  );
}

function RemoveCohostConfirm({ name }: { name: string }) {
  return (
    <ul className="flex flex-col gap-3.5 pb-2 pt-1">
      <Fact icon={<CrownIcon size={16} />}>
        <b className="font-bold text-ink">{name} can't run the board anymore.</b> Their host tools go away.
      </Fact>
      <Fact icon={<GridIcon size={16} />}>They stay on the board with their squares.</Fact>
      <Fact icon={<LinkIcon size={16} />}>You can send them a new co-host invite any time.</Fact>
    </ul>
  );
}

function StepDownConfirm({ hostName }: { hostName: string }) {
  return (
    <ul className="flex flex-col gap-3.5 pb-2 pt-1">
      <Fact icon={<GridIcon size={16} />}>
        <b className="font-bold text-ink">You stay on the board</b> with your squares.
      </Fact>
      <Fact icon={<CrownIcon size={16} />}>Your host tools go away on this board.</Fact>
      <Fact icon={<LinkIcon size={16} />}>{hostName} can invite you back any time.</Fact>
    </ul>
  );
}

function RemoveConfirm({ copy }: { copy: RemoveCopy }) {
  return (
    <ul className="flex flex-col gap-3.5 pb-2 pt-1">
      <Fact icon={<GridIcon size={16} />}>
        <b className="font-bold text-ink">{copy.detail}</b> {copy.after}
      </Fact>
      <Fact icon={<LinkIcon size={16} />}>They can join again with your invite link if they want back in.</Fact>
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
        {state.scores.length > 0 ? `, ${pluralize(state.scores.length, "score")} and every winner` : ""}
        {state.season && state.season.games.some((g) => g.id) ? `, and the boards of all ${pluralize(state.season.games.filter((g) => g.id).length, "game")} of the season` : ""}. Anyone
        opening the link sees that it was deleted.
      </p>
      <p className="rounded-2xl bg-danger-500/10 px-3.5 py-3 text-subhead font-semibold text-ink-danger ring-1 ring-inset ring-danger-500/30">
        This can't be undone.
      </p>
    </div>
  );
}
