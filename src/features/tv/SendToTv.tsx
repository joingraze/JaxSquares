// Host tools → "Show on a smart TV". The TV's browser goes to jaxsquares.com/tv
// and shows a short code (src/pages/TvPair.tsx); the host (or a co-host)
// types it here and the TV opens this board's TV mode.

import { useState } from "react";
import { cleanTvCode, TV_CODE_LENGTH } from "../../../shared/tvBrowser";
import { CheckIcon, TvIcon } from "../../components/icons";
import { Button, TextField } from "../../components/ui";
import { PUBLIC_ORIGIN, api, errorMessage } from "../../lib/api";
import { tvPairAddress } from "../../lib/boardViews";
import { haptic } from "../../lib/native";

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
    <section aria-label="Show on a TV" data-testid="send-to-tv" className="flex flex-col gap-3 rounded-2xl bg-surface-3 px-3.5 py-3.5 ring-1 ring-inset ring-line">
      <div className="flex items-start gap-3">
        <span aria-hidden className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-brand-400/12 text-ink-brand">
          <TvIcon size={20} />
        </span>
        <span className="min-w-0">
          <span className="block text-callout font-bold text-ink">Show on a TV</span>
          <span className="mt-0.5 block text-footnote leading-snug text-ink-muted">
            On the TV's web browser, go to <b className="font-bold text-ink">{tvPairAddress(PUBLIC_ORIGIN)}</b>, then enter the code it shows.
          </span>
        </span>
      </div>
      <div className="flex items-start gap-2">
        <TextField
          label="TV code"
          className="min-w-0 flex-1"
          value={code}
          maxLength={TV_CODE_LENGTH + 2}
          placeholder="ABCD"
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
          inputClassName="font-display text-title-3 font-extrabold tracking-[0.3em]"
          data-testid="send-to-tv-code"
        />
        <Button className="mt-7 shrink-0" disabled={!clean} loading={busy} onClick={() => void send()} data-testid="send-to-tv-send">
          Send
        </Button>
      </div>
      {sent && (
        <p role="status" className="flex items-center gap-1.5 text-footnote font-bold text-ink-brand" data-testid="send-to-tv-sent">
          <CheckIcon size={15} strokeWidth={3} />
          Sent. The board is on the TV showing {sent}.
        </p>
      )}
    </section>
  );
}
