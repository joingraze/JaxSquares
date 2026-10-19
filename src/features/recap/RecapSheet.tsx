// "Share the recap": the card (recapModel.ts, painted by drawRecap.ts) shown
// as it will go out, then one button that shares the image (or, in the iOS
// app without file sharing, the board's link; or saves it). The image is made
// when the sheet opens, so the button's tap is the share's own gesture.

import { useEffect, useMemo, useRef, useState } from "react";
import type { GameState } from "../../../shared/types";
import { ShareIcon } from "../../components/icons";
import { BottomSheet, Button, Skeleton, Spinner, useToast } from "../../components/ui";
import { inviteUrl } from "../../lib/api";
import { haptic } from "../../lib/native";
import { renderRecap } from "./drawRecap";
import { recapCard, recapLayout, recapShareText, RECAP_HEIGHT, RECAP_WIDTH } from "./recapModel";
import { browserShareDeps, downloadBlob, recapFileName, recapShareMode, shareRecap } from "./shareRecap";

export interface RecapSheetProps {
  state: GameState;
  open: boolean;
  onClose: () => void;
}

const LABEL = { files: "Share the recap", link: "Share the board link", save: "Save the image" } as const;

export function RecapSheet({ state, open, onClose }: RecapSheetProps) {
  const toast = useToast();
  const card = useMemo(() => recapCard(state), [state]);
  // Painted again only when what the card says changes (not on every claim or presence blip).
  const cardKey = card ? JSON.stringify(card) : "";
  const layout = useMemo(() => (cardKey ? recapLayout(JSON.parse(cardKey) as NonNullable<typeof card>) : null), [cardKey]);
  const [image, setImage] = useState<{ blob: Blob; url: string } | null>(null);
  const [failed, setFailed] = useState(false);
  const [busy, setBusy] = useState(false);
  const deps = useMemo(() => browserShareDeps(), []);
  const mode = recapShareMode(deps);
  const urlRef = useRef<string | null>(null);

  useEffect(() => {
    if (!open || !layout) return;
    let alive = true;
    setFailed(false);
    renderRecap(layout).then(
      (blob) => {
        if (!alive) return;
        const url = URL.createObjectURL(blob);
        if (urlRef.current) URL.revokeObjectURL(urlRef.current);
        urlRef.current = url;
        setImage({ blob, url });
      },
      (err: unknown) => {
        console.warn("recap failed", err);
        if (alive) setFailed(true);
      },
    );
    return () => {
      alive = false;
    };
  }, [open, layout]);

  useEffect(
    () => () => {
      if (urlRef.current) URL.revokeObjectURL(urlRef.current);
    },
    [],
  );

  const send = async () => {
    if (!image || !card || busy) return;
    setBusy(true);
    try {
      const outcome = await shareRecap(
        { blob: image.blob, fileName: recapFileName(state.game.id), title: state.game.name, text: recapShareText(card), url: inviteUrl(state.game.id) },
        deps,
      );
      if (outcome === "shared" || outcome === "link") void haptic("success");
      else if (outcome === "saved") toast.success("Recap saved", "Post it anywhere.");
      else if (outcome === "link-copied") toast.success("Link copied", "Paste it in the group chat.");
    } finally {
      setBusy(false);
    }
  };

  const save = () => {
    if (!image) return;
    downloadBlob(image.blob, recapFileName(state.game.id));
    toast.success("Recap saved", "Post it anywhere.");
  };

  return (
    <BottomSheet
      open={open}
      onClose={onClose}
      title="Share the recap"
      description={card?.final ? "The final score and every winner, ready for the group chat." : "The score so far and every winner, ready for the group chat."}
      footer={
        <div className="flex flex-col gap-1">
          <Button
            data-testid="recap-share"
            data-mode={mode}
            size="lg"
            block
            variant="gold"
            haptic="medium"
            leading={<ShareIcon size={20} />}
            disabled={!image}
            loading={busy}
            onClick={() => void send()}
          >
            {LABEL[mode]}
          </Button>
          {mode === "files" && !deps.native && (
            <Button data-testid="recap-save" variant="ghost" block disabled={!image} onClick={save}>
              Save the image
            </Button>
          )}
        </div>
      }
    >
      <div className="pb-2">
        <div
          data-testid="recap-preview"
          data-state={image ? "ready" : failed ? "failed" : "drawing"}
          className="relative mx-auto w-full max-w-[19rem] overflow-hidden rounded-[1.25rem] shadow-float ring-1 ring-inset ring-line-strong"
          style={{ aspectRatio: `${RECAP_WIDTH} / ${RECAP_HEIGHT}` }}
        >
          {image ? (
            <img src={image.url} alt={card ? recapShareText(card) : "The recap"} className="block h-full w-full" />
          ) : failed ? (
            <p className="grid h-full place-items-center bg-surface-3 px-6 text-center text-footnote text-ink-muted">
              Couldn't draw the recap on this device. Try again in a moment.
            </p>
          ) : (
            <>
              <Skeleton className="h-full w-full" />
              <span className="absolute inset-0 grid place-items-center text-ink-muted">
                <Spinner size={26} />
              </span>
            </>
          )}
        </div>
        {mode === "link" && (
          <p className="mx-auto mt-3 max-w-[19rem] text-center text-footnote text-ink-muted">This app shares the board's link. Open the board on the web to send the image.</p>
        )}
      </div>
    </BottomSheet>
  );
}
