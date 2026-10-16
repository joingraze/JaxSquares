// The fastest way to get friends onto a board: one big "Send invite" (the
// native share sheet with a ready-made message), the link to copy, a QR code
// and a big board code for people in the same room, and, for the host, their
// private host link so they can run the board from another device.
import { useEffect, useRef, useState } from "react";
import { BOARD_SIZE_INFO, PRESET_INFO } from "../../../shared/formats";
import type { GameState } from "../../../shared/types";
import { CheckIcon, CopyIcon, LinkIcon, LockIcon, ShareIcon } from "../../components/icons";
import { Avatar, AvatarGroup, BottomSheet, Button, celebrate, cx, LiveDot, Meter, TeamMark } from "../../components/ui";
import { inviteUrl, PUBLIC_ORIGIN } from "../../lib/api";
import { readableTeamColor, teamVars } from "../../lib/format";
import { getPlayerId, hostLinkUrl } from "../../lib/identity";
import { copyText, haptic, shareLink } from "../../lib/native";
import "./invite.css";
import {
  boardStats,
  codeGroups,
  displayLink,
  inviteMessage,
  isUrgent,
  matchupLabel,
  nameIsMatchup,
  peopleInOrder,
  playersInLabel,
  spelledCode,
  squaresLeftLabel,
} from "./inviteModel";
import { QrCode } from "./QrCode";
import { useNewArrival } from "./useNewArrival";

/** Four corner arrows: "tap to make bigger". */
function ExpandGlyph() {
  return (
    <svg viewBox="0 0 24 24" width={13} height={13} fill="none" stroke="currentColor" strokeWidth={2.6} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5" />
    </svg>
  );
}

export interface InviteSheetProps {
  state: GameState;
  open: boolean;
  onClose: () => void;
  /** Devices on the board right now (useGame's `watching`), shown as live presence. */
  watching?: number;
  /** The board was just created: lead with "it's open" and a small celebration. */
  justCreated?: boolean;
}

type Flash = "copied-link" | "copied-host" | "shared" | "share-copied" | null;
const FLASH_MS = 2000;

export function InviteSheet({ state, open, onClose, watching = 0, justCreated = false }: InviteSheetProps) {
  const { game } = state;
  const url = inviteUrl(game.id);
  const hostUrl = hostLinkUrl(game.id, PUBLIC_ORIGIN);
  const stats = boardStats(state);
  const people = peopleInOrder(state);
  const isOpen = game.status === "open" || game.status === "draft";
  const urgent = isOpen && isUrgent(stats.left, stats.total);
  const arrival = useNewArrival(state.players, open);

  const [flash, setFlash] = useState<Flash>(null);
  const [bigQr, setBigQr] = useState(false);
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
      setBigQr(false);
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
    const outcome = await shareLink({ title: game.name, text: inviteMessage(state, getPlayerId()), url });
    if (outcome === "shared") {
      void haptic("success");
      showFlash("shared");
    } else if (outcome === "copied") {
      void haptic("success");
      showFlash("share-copied");
    }
  };

  const copy = async (what: "link" | "host") => {
    const text = what === "link" ? url : hostUrl;
    if (!text) return;
    const outcome = await copyText(text);
    if (outcome === "copied") {
      void haptic("success");
      showFlash(what === "link" ? "copied-link" : "copied-host");
    } else {
      void haptic("error");
    }
  };

  const sendLabel =
    flash === "shared" ? "Sent! Invite more friends" : flash === "share-copied" ? "Link copied. Paste it anywhere" : "Send invite";

  return (
    <BottomSheet
      open={open}
      onClose={onClose}
      title={justCreated ? "Your board is open! 🎉" : "Invite your crew"}
      description={
        isOpen ? "They just tap the link. No app or sign-up." : "Friends tap the link to follow every score live."
      }
      footer={
        <Button
          data-testid="invite-share"
          size="lg"
          block
          haptic="medium"
          leading={flash === "shared" || flash === "share-copied" ? <CheckIcon size={22} strokeWidth={3} /> : <ShareIcon size={22} strokeWidth={2.4} />}
          onClick={() => void send()}
        >
          <span key={sendLabel} className="animate-fade-in">
            {sendLabel}
          </span>
        </Button>
      }
    >
      <div style={teamVars(game.teamX, game.teamY)} className="flex flex-col gap-3">
        {/* ---- The ticket ---- */}
        <div className="overflow-hidden rounded-card bg-surface-3 ring-1 ring-inset ring-line-strong shadow-card">
          {/* Matchup band */}
          <div className="relative flex items-center gap-2.5 px-4 pb-3 pt-3.5">
            <div
              aria-hidden
              className="pointer-events-none absolute inset-0 opacity-30"
              style={{
                background:
                  "radial-gradient(90% 140% at 0% 0%, var(--team-x), transparent 60%), radial-gradient(90% 140% at 100% 0%, var(--team-y), transparent 60%)",
              }}
            />
            <TeamMark team={game.teamX} size="sm" className="relative" />
            <div className="relative min-w-0 flex-1 text-center">
              <p className="truncate font-display text-headline font-extrabold leading-tight text-ink">{matchupLabel(game)}</p>
              <p className="truncate text-caption font-semibold text-ink-muted">
                {nameIsMatchup(game)
                  ? `${PRESET_INFO[game.format.periods].label} · ${BOARD_SIZE_INFO[game.format.boardSize].short}`
                  : game.name}
              </p>
            </div>
            <TeamMark team={game.teamY} size="sm" className="relative" />
          </div>

          {/* QR + code */}
          <div className={cx("flex gap-4 px-4 pb-4 pt-1", bigQr ? "flex-col items-center" : "items-center")}>
            <button
              type="button"
              onClick={() => {
                void haptic("selection");
                setBigQr((b) => !b);
              }}
              aria-label={bigQr ? "Make QR code smaller" : "Make QR code bigger for scanning"}
              aria-pressed={bigQr}
              className={cx(
                "invite-qr pressable relative grid shrink-0 place-items-center bg-white shadow-[0_8px_24px_-10px_rgb(0_0_0/0.8)]",
                bigQr ? "h-[17.5rem] w-[17.5rem] rounded-[1.25rem] p-2" : "h-[8.25rem] w-[8.25rem] rounded-2xl p-1",
              )}
            >
              <QrCode value={url} size={bigQr ? 264 : 124} quiet={2} label={`QR code for ${displayLink(url)}`} />
              {!bigQr && (
                <span
                  aria-hidden
                  className="absolute -bottom-1.5 -right-1.5 grid h-6.5 w-6.5 place-items-center rounded-full bg-surface-4 text-ink ring-2 ring-surface-3"
                >
                  <ExpandGlyph />
                </span>
              )}
            </button>
            <div className={cx("flex min-w-0 flex-col", bigQr ? "items-center text-center" : "flex-1")}>
              <p className="eyebrow text-ink-subtle">Board code</p>
              <div
                role="img"
                aria-label={`Board code ${spelledCode(game.id)}`}
                className={cx("mt-1.5 flex flex-col gap-1.5 [perspective:400px]", bigQr && "flex-row")}
              >
                {codeGroups(game.id).map((group, g) => (
                  <div key={g} aria-hidden className="flex gap-1">
                    {[...group].map((ch, i) => (
                      <span
                        key={`${ch}-${i}`}
                        style={{ animationDelay: `${120 + (g * 3 + i) * 55}ms` }}
                        className="invite-tile grid h-11 w-9 place-items-center rounded-lg bg-canvas font-display text-title-2 font-extrabold text-ink shadow-[inset_0_-2px_0_rgb(255_255_255/0.06),inset_0_1px_0_rgb(0_0_0/0.6)] ring-1 ring-inset ring-line"
                      >
                        {ch}
                      </span>
                    ))}
                  </div>
                ))}
              </div>
              <p className="mt-2 text-caption leading-snug text-ink-muted">
                {bigQr ? "Point a phone camera here. Tap to shrink." : "Same room? Scan it, or read the code out loud."}
              </p>
            </div>
          </div>

          <div aria-hidden className="invite-perf" />

          {/* Social proof stub */}
          <div className="flex flex-col gap-2.5 px-4 pb-4 pt-3.5">
            <div className="flex items-center gap-2.5">
              {arrival ? (
                // Spotlight: the newcomer takes the stack's place for a few seconds.
                <p key={arrival.id} role="status" className="flex min-w-0 flex-1 animate-pop items-center gap-2.5 text-footnote font-extrabold text-brand-300">
                  <Avatar name={arrival.name} color={arrival.color} emoji={arrival.emoji} size="sm" ring="brand" decorative />
                  <span className="truncate">{arrival.name} just joined!</span>
                </p>
              ) : (
                <>
                  {people.length > 0 && <AvatarGroup people={people} max={4} size="sm" className="invite-stagger" />}
                  <p className="min-w-0 flex-1 truncate text-footnote font-semibold text-ink">{playersInLabel(people.length)}</p>
                </>
              )}
              {watching >= 2 && (
                <span className="flex shrink-0 items-center gap-1.5 text-caption font-bold text-brand-300">
                  <LiveDot tone="brand" />
                  {watching} here now
                </span>
              )}
            </div>
            {isOpen ? (
              <Meter
                value={stats.claimed}
                max={stats.total}
                size="sm"
                tone={urgent ? "gold" : "brand"}
                label={
                  <span className={urgent ? "font-extrabold text-gold-300" : "text-ink"}>
                    {urgent ? `Only ${squaresLeftLabel(stats.left)}!` : squaresLeftLabel(stats.left)}
                  </span>
                }
              />
            ) : (
              <p className="text-footnote text-ink-muted">
                {game.status === "final" ? "Game over. Friends can still see who won." : "Numbers are drawn. Friends can follow along live."}
              </p>
            )}
          </div>
        </div>

        {/* ---- Link ---- */}
        <div className="flex h-14 items-center gap-2 rounded-btn bg-surface-3 pl-3.5 pr-1.5 ring-1 ring-inset ring-line">
          <LinkIcon size={18} className="shrink-0 text-ink-subtle" />
          <span className="min-w-0 flex-1 truncate text-callout font-semibold text-ink" title={url}>
            {displayLink(url)}
          </span>
          <Button
            data-testid="invite-copy"
            size="sm"
            variant={flash === "copied-link" ? "primary" : "secondary"}
            haptic={false}
            leading={flash === "copied-link" ? <CheckIcon size={16} strokeWidth={3} /> : <CopyIcon size={16} />}
            onClick={() => void copy("link")}
            aria-live="polite"
            className="min-w-[6.25rem]"
          >
            {flash === "copied-link" ? "Copied" : "Copy link"}
          </Button>
        </div>

        {/* ---- Host link (host only) ---- */}
        {hostUrl && (
          <div className="flex items-center gap-3 rounded-btn px-1 py-1">
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-gold-400/12 text-gold-300 ring-1 ring-inset ring-gold-400/25">
              <LockIcon size={18} />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-subhead font-bold text-ink">Save your host link</p>
              <p className="text-caption leading-snug text-ink-muted">Opens your host controls on another phone. Keep it to yourself.</p>
            </div>
            <Button
              size="sm"
              variant="ghost"
              haptic={false}
              onClick={() => void copy("host")}
              className={cx("shrink-0", flash === "copied-host" ? "text-brand-400" : "text-gold-300")}
              leading={flash === "copied-host" ? <CheckIcon size={16} strokeWidth={3} /> : undefined}
              aria-live="polite"
            >
              {flash === "copied-host" ? "Copied" : "Copy"}
            </Button>
          </div>
        )}
      </div>
    </BottomSheet>
  );
}
