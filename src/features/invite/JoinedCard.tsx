// The moment right after a newcomer claims their first squares: a small
// celebration ("You're in, Sam!"), what they got, and the one thing that keeps
// the board filling: "Bring a friend", which opens the share sheet with the
// same ready-made message the host sends. Under it, for someone not signed in
// (where sign-in is set up), one quiet line: the board only lives on this
// device until they sign in, with the sign-in sheet one tap away.
import { lazy, Suspense, useEffect, useRef, useState } from "react";
import type { GameState } from "../../../shared/types";
import { CheckIcon, ShareIcon, XIcon } from "../../components/icons";
import { Avatar, Button, cx, IconButton } from "../../components/ui";
import { inviteUrl } from "../../lib/api";
import { PROVIDER_LABEL, useAuthSetup } from "../../lib/auth";
import { getPlayerId, useAccount } from "../../lib/identity";
import { haptic, shareLink } from "../../lib/native";
import "./invite.css";
import { joinedLine } from "./inviteModel";

const SignInSheet = lazy(() => import("../account/SignInSheet").then((m) => ({ default: m.SignInSheet })));

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
  const account = useAccount();
  const setup = useAuthSetup();
  const [saving, setSaving] = useState(false);
  const canSave = !account && setup.ready && setup.providers.length > 0;
  const names = setup.providers.map((p) => PROVIDER_LABEL[p]).join(" or ");
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
      {canSave && (
        <button
          type="button"
          data-testid="joined-save"
          onClick={() => setSaving(true)}
          className="pressable relative mt-1.5 flex min-h-11 w-full flex-wrap items-center justify-center gap-x-1 text-center text-footnote text-ink-muted"
        >
          <span>Only on this device for now.</span>
          <span className="font-bold text-ink-brand">Save it to your account</span>
        </button>
      )}
      {saving && (
        <Suspense fallback={null}>
          <SignInSheet
            open
            onClose={() => setSaving(false)}
            title="Keep this board on every device"
            description={`Sign in with ${names} and your squares here, and every board you join, follow you to any phone or computer.`}
          />
        </Suspense>
      )}
    </section>
  );
}
