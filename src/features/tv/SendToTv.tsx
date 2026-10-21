// Putting the board on a TV, two ways, depending on the TV (ShowOnTv): a
// smart TV's browser goes to jaxsquares.com/tv and shows a short code
// (src/pages/TvPair.tsx) that anyone with the board's link types here
// (SendToTv); any other TV gets TV mode on this phone or computer, mirrored
// (AirPlay, Chromecast) or over a cable. In the share sheet (everyone), a
// venue's just-made card, and Host tools → "Put the board on a TV".

import { useState, type ReactNode } from "react";
import { cleanTvCode, TV_CODE_LENGTH } from "../../../shared/tvBrowser";
import { CastIcon, CheckIcon, TvIcon } from "../../components/icons";
import { Button, TextField } from "../../components/ui";
import { PUBLIC_ORIGIN, api, errorMessage } from "../../lib/api";
import { tvPairAddress } from "../../lib/boardViews";
import { haptic } from "../../lib/native";

export interface ShowOnTvProps {
  gameId: string;
  /** Opens this board's TV mode on this device (to mirror, cast or plug in). */
  onOpenHere: () => void;
}

/** The two ways onto a TV, each saying which TVs it's for. */
export function ShowOnTv({ gameId, onOpenHere }: ShowOnTvProps) {
  return (
    <div data-testid="show-on-tv" className="flex flex-col gap-2.5">
      <Way icon={<TvIcon size={20} />} title="Smart TV with a web browser" testId="show-on-tv-smart">
        In the TV's browser, go to <b className="font-bold text-ink">{tvPairAddress(PUBLIC_ORIGIN)}</b> and type the code it shows.
      </Way>
      <SendToTv gameId={gameId} />
      <p aria-hidden className="flex items-center gap-3 py-1 text-caption font-bold uppercase tracking-[0.12em] text-ink-subtle">
        <span className="h-px flex-1 bg-line" />
        or
        <span className="h-px flex-1 bg-line" />
      </p>
      <Way icon={<CastIcon size={20} />} title="AirPlay, Chromecast or a cable" testId="show-on-tv-cast">
        Open TV mode on this phone or computer, then mirror the screen to the TV or plug in with HDMI. On a phone, turn it sideways so the board fills the TV.
      </Way>
      <Button data-testid="show-on-tv-here" variant="secondary" size="md" block haptic="medium" leading={<CastIcon size={20} />} onClick={onOpenHere}>
        Open TV mode here
      </Button>
    </div>
  );
}

function Way({ icon, title, testId, children }: { icon: ReactNode; title: string; testId: string; children: ReactNode }) {
  return (
    <div data-testid={testId} className="flex items-start gap-3 px-0.5 pt-1.5 first:pt-0">
      <span aria-hidden className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-brand-400/12 text-ink-brand">
        {icon}
      </span>
      <span className="min-w-0">
        <span className="block text-callout font-bold text-ink">{title}</span>
        <span className="mt-0.5 block text-footnote leading-snug text-ink-muted">{children}</span>
      </span>
    </div>
  );
}

/** The code box: the code a smart TV shows at jaxsquares.com/tv, and Send. */
export function SendToTv({ gameId }: { gameId: string }) {
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const clean = cleanTvCode(code);

  const send = async () => {
    if (!clean || busy) return;
    setBusy(true);
    setError(null);
    try {
      await api.sendToTv(gameId, clean);
      void haptic("success");
      setSent(clean);
      setCode("");
    } catch (err) {
      void haptic("error");
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div data-testid="send-to-tv" className="flex flex-col gap-2">
      <div className="flex items-start gap-2">
        <TextField
          label="TV code"
          hideLabel
          className="min-w-0 flex-1"
          value={code}
          maxLength={TV_CODE_LENGTH + 2}
          placeholder="Code on the TV"
          autoComplete="off"
          autoCapitalize="characters"
          autoCorrect="off"
          spellCheck={false}
          enterKeyHint="send"
          error={error ?? undefined}
          onChange={(e) => {
            setCode(e.target.value.toUpperCase());
            setError(null);
            setSent(null);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              void send();
            }
          }}
          inputClassName="font-display text-title-3 font-extrabold tracking-[0.3em] placeholder:font-sans placeholder:text-callout placeholder:font-semibold placeholder:tracking-normal"
          data-testid="send-to-tv-code"
        />
        <Button className="shrink-0" disabled={!clean} loading={busy} onClick={() => void send()} data-testid="send-to-tv-send">
          Send
        </Button>
      </div>
      {sent && (
        <p role="status" className="flex items-center gap-1.5 px-1 text-footnote font-bold text-ink-brand" data-testid="send-to-tv-sent">
          <CheckIcon size={15} strokeWidth={3} />
          Sent. The board is on the TV showing {sent}.
        </p>
      )}
    </div>
  );
}
