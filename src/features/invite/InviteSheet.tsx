// Text-first invite: most invites go out as a text, so the sheet is a preview
// of exactly that (the message bubble and the link card your friends get) and
// one big "Text your crew" button. People in the same room get the QR code and
// board code behind a single "Same room? Show code" toggle. The host's private
// link lives in Host tools ("Host from another phone"), never next to Send.
import { useEffect, useRef, useState } from "react";
import type { GameState, Player } from "../../../shared/types";
import { ArrowRightIcon, CheckIcon, CopyIcon } from "../../components/icons";
import { Avatar, AvatarGroup, BottomSheet, Button, celebrate, cx, TeamMark } from "../../components/ui";
import { inviteUrl } from "../../lib/api";
import { readableTeamColor, shortMatchup, shortTeam, teamVars } from "../../lib/format";
import { getPlayerId, getProfile, isHostOf } from "../../lib/identity";
import { copyText, haptic, shareLink } from "../../lib/native";
import "./invite.css";
import {
  boardCode,
  crewLine,
  displayLink,
  hostOf,
  invitePitch,
  inviteMessage,
  inviteStage,
  matchupLabel,
  nameMentionsTeams,
  peopleInOrder,
  previewStatus,
  spelledCode,
} from "./inviteModel";
import { QrCode } from "./QrCode";
import { useNewArrival } from "./useNewArrival";
import { useResolvedTheme } from "../../lib/theme";

/** A speech bubble: "send it as a text". */
function ChatGlyph({ size = 22 }: { size?: number }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="currentColor" strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M12 3.5c-5 0-9 3.3-9 7.5 0 2.3 1.2 4.3 3.1 5.7L5.5 20.5l4.2-2.1c.7.1 1.5.2 2.3.2 5 0 9-3.4 9-7.6S17 3.5 12 3.5Z" />
    </svg>
  );
}

/** A tiny QR mark for the "Show code" toggle. */
function QrGlyph({ size = 20 }: { size?: number }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <rect x="3.5" y="3.5" width="6.5" height="6.5" rx="1.5" />
      <rect x="14" y="3.5" width="6.5" height="6.5" rx="1.5" />
      <rect x="3.5" y="14" width="6.5" height="6.5" rx="1.5" />
      <path d="M14 14h2.5v2.5H14zM18 18h2.5v2.5H18zM14 20.5h1M20.5 14v1" />
    </svg>
  );
}

export interface InviteSheetProps {
  state: GameState;
  open: boolean;
  onClose: () => void;
  /**
   * Devices on the board right now. Accepted for callers, not shown: the sheet
   * keeps one social signal (who's in), and live presence lives on the board.
   */
  watching?: number;
  /** The board was just created: lead with "it's live" and a small celebration. */
  justCreated?: boolean;
}

type Flash = "copied-link" | "shared" | "share-copied" | null;
/** Title size on the preview card: it shares the row with the mini board, so long names step down sooner. */
function cardTitleText(title: string): string {
  const len = [...title.trim()].length;
  return len <= 14 ? "text-title-2" : len <= 22 ? "text-title-3" : "text-headline";
}
const FLASH_MS = 2000;
/** Team marks shrunk to sit inline with the card's matchup line. */
const MINI_MARK = "!h-5 !w-auto min-w-6 !rounded-md px-1 !text-[0.5625rem]";

export function InviteSheet({ state, open, onClose, justCreated = false }: InviteSheetProps) {
  const theme = useResolvedTheme();
  const { game } = state;
  const url = inviteUrl(game.id);
  const myId = getPlayerId();
  const viewerIsHost = game.hostPlayerId === myId || isHostOf(game.id);
  const stage = inviteStage(state);
  const pitch = invitePitch(state, viewerIsHost);
  const message = inviteMessage(state, myId);
  const people = peopleInOrder(state);
  const myCount = state.squares.filter((s) => s.playerId === myId).length;
  const arrival = useNewArrival(state.players, open);

  const [flash, setFlash] = useState<Flash>(null);
  const [showCode, setShowCode] = useState(false);
  const flashTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const showFlash = (f: Flash) => {
    if (flashTimer.current) clearTimeout(flashTimer.current);
    setFlash(f);
    flashTimer.current = setTimeout(() => setFlash(null), FLASH_MS);
  };
  useEffect(() => () => void (flashTimer.current && clearTimeout(flashTimer.current)), []);

  // Fresh board: a small burst in the team colors when the sheet first opens.
  const celebrated = useRef(false);
  useEffect(() => {
    if (!open) {
      setShowCode(false);
      return;
    }
    if (!justCreated || celebrated.current) return;
    // Marked inside the timer so a StrictMode/dev double-run (cleanup cancels the first timer) still celebrates once.
    const t = setTimeout(() => {
      celebrated.current = true;
      void haptic("success");
      void celebrate("pop", {
        origin: { x: 0.5, y: 0.35 },
        colors: [readableTeamColor(game.teamX.color, "#c6f91f"), readableTeamColor(game.teamY.color, "#ffc233"), "#c6f91f", "#ffffff"],
      });
    }, 280);
    return () => clearTimeout(t);
  }, [open, justCreated, game.teamX.color, game.teamY.color]);

  const send = async () => {
    // shareLink must start inside the tap (Web Share needs the user gesture), so nothing is awaited first.
    const outcome = await shareLink({ title: game.name, text: message, url });
    if (outcome === "shared") {
      void haptic("success");
      showFlash("shared");
    } else if (outcome === "copied") {
      void haptic("success");
      showFlash("share-copied");
    }
  };

  const copyLink = async () => {
    const outcome = await copyText(url);
    if (outcome === "copied") {
      void haptic("success");
      showFlash("copied-link");
    } else {
      void haptic("error");
    }
  };

  const sendDone = flash === "shared" || flash === "share-copied";
  const sendLabel = flash === "shared" ? "Sent! Text more friends" : flash === "share-copied" ? "Link copied. Paste it in a text" : pitch.cta;
  const me = state.players.find((p) => p.id === myId);
  const profile = getProfile();
  const sender = me ?? { name: profile.name || "You", color: profile.color, emoji: profile.emoji };

  return (
    <BottomSheet
      open={open}
      onClose={onClose}
      title={pitch.title}
      description={pitch.subtitle}
      footer={
        <Button
          data-testid="invite-share"
          size="lg"
          block
          variant={pitch.tone === "gold" ? "gold" : "primary"}
          haptic="medium"
          leading={sendDone ? <CheckIcon size={22} strokeWidth={3} /> : <ChatGlyph />}
          onClick={() => void send()}
        >
          <span key={sendLabel} className="animate-fade-in">
            {sendLabel}
          </span>
        </Button>
      }
    >
      <div style={teamVars(game.teamX, game.teamY, theme)} className="flex flex-col gap-3.5">
        {/* ---- Who's in: the one social signal ---- */}
        <div className="flex min-h-11 items-center gap-2.5">
          {arrival ? (
            // Spotlight: the newcomer takes the stack's place for a few seconds.
            <p key={arrival.id} role="status" className="flex min-w-0 flex-1 animate-pop items-center gap-2.5 text-subhead font-extrabold text-ink">
              <Avatar name={arrival.name} color={arrival.color} emoji={arrival.emoji} size="md" decorative />
              <span className="truncate">{arrival.name} just joined! 🙌</span>
            </p>
          ) : (
            <>
              {people.length > 0 && <AvatarGroup people={people} max={4} size="md" className="invite-stagger" />}
              <p className="min-w-0 flex-1 truncate text-subhead font-bold text-ink">{crewLine(state, myId)}</p>
            </>
          )}
          {stage === "fresh" && viewerIsHost && myCount === 0 && !arrival && (
            <button
              type="button"
              onClick={() => {
                void haptic("light");
                onClose();
              }}
              className="pressable -mr-2 inline-flex h-11 shrink-0 items-center gap-1 rounded-full px-3 text-subhead font-extrabold text-ink-brand hover:bg-ink/6"
            >
              Claim yours first
              <ArrowRightIcon size={16} strokeWidth={2.6} />
            </button>
          )}
        </div>

        {/* ---- What they'll get, or the code for the room ---- */}
        {showCode ? (
          <CodePanel key="code" gameId={game.id} url={url} matchup={matchupLabel(game)} />
        ) : (
          <TextPreview
            key="text"
            state={state}
            sender={sender}
            message={message}
            url={url}
            copied={flash === "copied-link"}
            onCopy={() => void copyLink()}
          />
        )}

        <Button
          data-testid="invite-code-toggle"
          variant="secondary"
          size="md"
          block
          aria-expanded={showCode}
          haptic="selection"
          leading={<QrGlyph />}
          onClick={() => setShowCode((v) => !v)}
        >
          {showCode ? "Hide code" : "Same room? Show code"}
        </Button>
      </div>
    </BottomSheet>
  );
}

// ---- The text preview ----

interface TextPreviewProps {
  state: GameState;
  sender: Pick<Player, "name" | "color" | "emoji">;
  message: string;
  url: string;
  copied: boolean;
  onCopy: () => void;
}

/** The message as it lands in a friend's thread: your bubble, then the link card. */
function TextPreview({ state, sender, message, url, copied, onCopy }: TextPreviewProps) {
  const { game } = state;
  const host = hostOf(state);
  const title = game.name.trim() || shortMatchup(game);
  const status = previewStatus(state);
  return (
    <figure className="m-0 flex animate-fade-in flex-col gap-2">
      <figcaption className="eyebrow px-0.5 text-ink-subtle">What your crew gets</figcaption>
      <div className="flex items-end gap-2">
        <Avatar name={sender.name} color={sender.color} emoji={sender.emoji} size="sm" decorative className="mb-0.5" />
        <div className="flex min-w-0 flex-1 flex-col items-start gap-1">
          <p className="max-w-[88%] rounded-[1.25rem] rounded-bl-md bg-surface-4 px-3.5 py-2 text-callout leading-snug text-ink">{message}</p>

          {/* The link card. Tapping it copies the link (like long-pressing a link card), so there's no separate copy row. */}
          <button
            type="button"
            data-testid="invite-copy"
            onClick={onCopy}
            aria-label={copied ? "Link copied" : "Copy invite link"}
            className="pressable w-full overflow-hidden rounded-[1.25rem] rounded-bl-md bg-surface-3 text-left ring-1 ring-inset ring-line-strong"
          >
            <div className="relative aspect-[2/1] overflow-hidden bg-pitch-900 light:bg-surface-4">
              <div
                aria-hidden
                className="pointer-events-none absolute inset-0 opacity-60 light:opacity-30"
                style={{
                  background:
                    "radial-gradient(85% 120% at 0% 0%, var(--team-x), transparent 62%), radial-gradient(85% 120% at 100% 100%, var(--team-y), transparent 62%)",
                }}
              />
              <div className="relative flex h-full items-center gap-3 p-3.5">
                <div className="flex min-w-0 flex-1 flex-col">
                  {host && (
                    <p className="flex min-w-0 items-center gap-1.5 text-caption font-bold text-ink">
                      <Avatar name={host.name} color={host.color} emoji={host.emoji} size="xs" decorative />
                      <span className="truncate">{host.name} invited you</span>
                    </p>
                  )}
                  {/* One title (the board's name), the matchup in short under it. */}
                  <p className={cx("mt-2 line-clamp-2 font-display font-extrabold leading-tight text-ink", cardTitleText(title))}>{title}</p>
                  <MatchupLine game={game} />
                  <span
                    className={cx(
                      "mt-2 self-start truncate rounded-full px-2 py-0.5 text-caption font-extrabold",
                      status.tone === "brand" && "bg-brand-400/15 text-ink-brand",
                      status.tone === "gold" && "bg-gold-400/20 text-ink-gold",
                      status.tone === "muted" && "bg-ink/10 text-ink",
                    )}
                  >
                    {status.text}
                  </span>
                </div>
                <MiniBoard state={state} />
              </div>
              {copied && (
                <span
                  aria-hidden
                  className="absolute right-2.5 top-2.5 flex animate-pop items-center gap-1 rounded-full bg-brand-400 px-2.5 py-1 text-caption font-extrabold text-ink-inverse shadow-card"
                >
                  <CheckIcon size={14} strokeWidth={3.2} />
                  Link copied
                </span>
              )}
            </div>
            <div className="flex items-center gap-3 px-3.5 py-2.5">
              <div className="min-w-0 flex-1">
                <p className="truncate text-subhead font-bold leading-snug text-ink">Join on JaxSquares</p>
                <p className="truncate text-caption text-ink-muted">{displayLink(url)}</p>
              </div>
              <span aria-hidden className={cx("shrink-0", copied ? "text-ink-brand" : "text-ink-subtle")}>
                {copied ? <CheckIcon size={18} strokeWidth={3} /> : <CopyIcon size={18} />}
              </span>
            </div>
          </button>
        </div>
      </div>
      <p aria-live="polite" className={cx("-mt-1 pl-10 text-caption", copied ? "font-bold text-ink-brand" : "text-ink-subtle")}>
        {copied ? "Copied. Paste it anywhere." : "Tap the card to copy the link."}
      </p>
    </figure>
  );
}

/**
 * The card's subtitle: the matchup in short. Each team's mark, plus its short
 * name unless the board's name already says it ("Packers vs Bears Squares"
 * gets just GB vs CHI).
 */
function MatchupLine({ game }: { game: GameState["game"] }) {
  const names = !nameMentionsTeams(game);
  const side = (team: GameState["game"]["teamX"]) => (
    <span className="flex min-w-0 items-center gap-1.5">
      <TeamMark team={team} size="sm" className={MINI_MARK} />
      {names && <span className="truncate">{shortTeam(team, game.league)}</span>}
    </span>
  );
  return (
    <p aria-label={shortMatchup(game)} className="mt-1.5 flex min-w-0 items-center gap-1.5 text-caption font-bold text-ink-muted">
      {side(game.teamX)}
      <span aria-hidden className="shrink-0 text-micro font-extrabold uppercase text-ink-subtle">
        vs
      </span>
      {side(game.teamY)}
    </p>
  );
}

/** The board at thumbnail size: claimed squares in each player's color, so the fill level is real. */
function MiniBoard({ state }: { state: GameState }) {
  const n = state.game.format.boardSize === 25 ? 5 : 10;
  const colorOf = new Map(state.players.map((p) => [p.id, p.color]));
  const taken = new Map(state.squares.map((s) => [s.row * n + s.col, colorOf.get(s.playerId) ?? "#66806f"]));
  return (
    <div
      aria-hidden
      className="grid h-[4.5rem] w-[4.5rem] shrink-0 gap-px rounded-md bg-canvas/70 p-1 ring-1 ring-inset ring-ink/10"
      style={{ gridTemplateColumns: `repeat(${n}, minmax(0, 1fr))` }}
    >
      {Array.from({ length: n * n }, (_, i) => {
        const color = taken.get(i);
        return <span key={i} className={cx("rounded-[1px]", !color && "bg-ink/8")} style={color ? { backgroundColor: color } : undefined} />;
      })}
    </div>
  );
}

// ---- Same room: QR + code ----

function CodePanel({ gameId, url, matchup }: { gameId: string; url: string; matchup: string }) {
  return (
    <div className="flex animate-fade-in flex-col items-center gap-3.5 rounded-card bg-surface-3 px-4 pb-4 pt-5 ring-1 ring-inset ring-line">
      <div className="rounded-[1.25rem] bg-white p-2 shadow-[0_8px_24px_-10px_rgb(0_0_0/0.8)]">
        <QrCode value={url} size={200} quiet={2} label={`QR code for the ${matchup} board`} />
      </div>
      <div role="img" aria-label={`Board code ${spelledCode(gameId)}`} className="flex gap-1.5 [perspective:400px]">
        {[...boardCode(gameId)].map((ch, i) => (
          <span
            key={`${ch}-${i}`}
            aria-hidden
            style={{ animationDelay: `${80 + i * 50}ms` }}
            className="invite-tile grid h-12 w-10 place-items-center rounded-lg bg-canvas font-display text-title-2 font-extrabold text-ink shadow-[inset_0_-2px_0_rgb(255_255_255/0.06),inset_0_1px_0_rgb(0_0_0/0.6)] ring-1 ring-inset ring-line"
          >
            {ch}
          </span>
        ))}
      </div>
      <p className="max-w-[17rem] text-center text-footnote leading-snug text-ink-muted">
        Point a phone camera at the code. Or in JaxSquares, tap <span className="font-bold text-ink">Join with a code</span>.
      </p>
    </div>
  );
}
