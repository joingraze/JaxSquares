// The moment right after a newcomer claims their first squares: a small
// celebration ("You're in, Sam!"), what they got, and the one thing that keeps
// the board filling: "Bring a friend", which opens the share sheet with the
// same ready-made message the host sends.
import { useEffect, useRef, useState } from "react";
import type { GameState } from "../../../shared/types";
import { CheckIcon, ShareIcon, XIcon } from "../../components/icons";
import { Avatar, Button, cx, IconButton } from "../../components/ui";
import { inviteUrl } from "../../lib/api";
import { getPlayerId } from "../../lib/identity";
import { haptic, shareLink } from "../../lib/native";
import "./invite.css";
import { joinedLine } from "./inviteModel";

export interface JoinedCardProps {
  state: GameState;
  onDismiss: () => void;
  className?: string;
}

export function JoinedCard({ state, onDismiss, className }: JoinedCardProps) {
  const myId = getPlayerId();
  const me = state.players.find((p) => p.id === myId);
  const mine = state.squares.filter((s) => s.playerId === myId).length;
  const line = joinedLine(state, myId);
  const [sent, setSent] = useState<"shared" | "copied" | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => void (timer.current && clearTimeout(timer.current)), []);

  const bring = async () => {
    const outcome = await shareLink({ title: state.game.name, text: line.share, url: inviteUrl(state.game.id) });
    if (outcome === "cancelled") return;
    void haptic("success");
    setSent(outcome);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setSent(null), 2200);
  };

  return (
    <section
      aria-label="You're in"
      className={cx("invite-rise relative overflow-hidden rounded-card bg-surface-2 p-3.5 shadow-float ring-1 ring-inset ring-brand-line/30", className)}
    >
      <div aria-hidden className="pointer-events-none absolute inset-0 bg-[radial-gradient(90%_120%_at_0%_0%,rgb(198_249_31/0.14),transparent_60%)]" />
      <div className="relative flex items-start gap-3">
        {me && <Avatar name={me.name} color={me.color} emoji={me.emoji} size="lg" decorative className="animate-pop" />}
        <div className="min-w-0 flex-1 pt-0.5">
          <p className="font-display text-title-3 font-extrabold leading-tight text-ink">{line.title}</p>
          <p className="mt-0.5 text-footnote leading-snug text-ink-muted">{mine > 0 ? line.detail : "Tap any open square to claim one."}</p>
        </div>
        <IconButton label="Dismiss" icon={<XIcon size={18} />} variant="ghost" onClick={onDismiss} className="-mr-2 -mt-2 text-ink-muted" />
      </div>
      <Button
        size="md"
        block
        variant="secondary"
        haptic="light"
        className="relative mt-3"
        leading={sent ? <CheckIcon size={18} strokeWidth={3} /> : <ShareIcon size={18} strokeWidth={2.4} />}
        onClick={() => void bring()}
      >
        {sent === "shared" ? "Sent! Bring another" : sent === "copied" ? "Link copied. Paste it in a text" : "Bring a friend"}
      </Button>
    </section>
  );
}
