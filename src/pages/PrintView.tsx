// The printable board (/g/:id/print) for an office wall or a break room:
// US Letter or A4, landscape for a 10×10 board (portrait for 5×5), black ink
// on white. On screen: a back link, one switch ("Include square price and
// prizes", off by default, never printed) and a big Print button over a
// preview of exactly the sheet that prints. Anyone with the board link can
// open it; it reads the public board state only.

import { useEffect, useLayoutEffect, useRef, useState, type MutableRefObject } from "react";
import { useLocation, useParams } from "react-router-dom";
import { gridSize } from "../../shared/squares";
import { PrinterIcon, ShareIcon, WifiOffIcon } from "../components/icons";
import { Button, EmptyState, Jax, Skeleton, Switch, TopBar } from "../components/ui";
import { PrintSheet } from "../features/print/PrintSheet";
import { hasPrintAmounts, printSheet, PX_PER_MM, sheetMode } from "../features/print/printModel";
import { inviteUrl, PUBLIC_ORIGIN } from "../lib/api";
import { boardViewPath } from "../lib/boardViews";
import { isNative, shareLink } from "../lib/native";
import { useGame } from "../lib/live";

/** Scales the sheet (laid out in real millimetres) to the width it has on screen. */
function usePaperScale(sheetWidthPx: number): { ref: MutableRefObject<HTMLDivElement | null>; scale: number } {
  const ref = useRef<HTMLDivElement | null>(null);
  const [scale, setScale] = useState(1);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const update = () => {
      const width = el.clientWidth;
      if (width > 0) setScale(Math.min(1, width / sheetWidthPx));
    };
    update();
    if (typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, [sheetWidthPx]);
  return { ref, scale };
}

export default function PrintView() {
  const id = useParams().id?.toLowerCase();
  const location = useLocation();
  const { state, notFound, error, loading, refresh } = useGame(id);
  const [amounts, setAmounts] = useState(false);
  const game = state?.game ?? null;
  const sheet = printSheet(game ? gridSize(game.format.boardSize) : 10);
  // The page as it comes out of the printer: the sheet inside its margins.
  const pageW = (sheet.width + 2 * sheet.margin) * PX_PER_MM;
  const pageH = (sheet.height + 2 * sheet.margin) * PX_PER_MM;
  const { ref, scale } = usePaperScale(pageW);

  // Print rules (print.css) apply only while this page is open.
  useEffect(() => {
    const root = document.documentElement;
    root.setAttribute("data-print-page", "");
    return () => root.removeAttribute("data-print-page");
  }, []);

  const back = location.key !== "default" ? true : `/g/${id ?? ""}`;
  const title = game ? `Print ${game.name}` : "Print board";

  if (notFound || !state || !game) {
    return (
      <>
        <TopBar title="Print board" large={false} back={back} />
        {notFound ? (
          <EmptyState
            illustration={<Jax pose="peek" size={156} />}
            title="Jax looked everywhere"
            description="This board isn't here. The link may be old, or the host deleted the board."
          />
        ) : error && !loading ? (
          <EmptyState
            art={<WifiOffIcon />}
            title="Couldn't load this board"
            description={error.message}
            action={
              <Button size="lg" block onClick={() => void refresh()}>
                Try again
              </Button>
            }
          />
        ) : (
          <div className="mx-auto flex w-full max-w-3xl flex-col gap-4 px-4 pt-2" aria-busy="true" aria-label="Loading board">
            <Skeleton className="h-36 w-full rounded-card" />
            <Skeleton className="aspect-[1.36] w-full rounded-card" />
          </div>
        )}
      </>
    );
  }

  const url = inviteUrl(game.id);
  const canAmounts = hasPrintAmounts(game);
  const mode = sheetMode(state);
  const native = isNative();
  const print = () => {
    if (native) {
      // The app's web view can't print: send the page to a computer (no amounts in the link or the text).
      void shareLink({ title: game.name, text: "Open this on a computer to print the board.", url: `${PUBLIC_ORIGIN}${boardViewPath(game.id, "print")}` });
      return;
    }
    window.print();
  };

  return (
    <div className="jx-print-page flex flex-1 flex-col pb-safe">
      {/* @page is global: written only while this page is open. */}
      <style>{`@page { size: ${sheet.orientation}; margin: ${sheet.margin}mm; }`}</style>
      <div data-print-hide>
        <TopBar title={title} large={false} back={back} />
        <div className="mx-auto flex w-full max-w-3xl flex-col gap-3 px-4 pb-4 pt-1">
          <div className="flex flex-col gap-4 rounded-card bg-surface-2 p-4 shadow-card ring-1 ring-inset ring-line">
            <div>
              <h2 className="font-display text-title-3 font-extrabold text-ink">
                {mode === "signup" ? "Print a sign-up sheet" : "Print the board"}
              </h2>
              <p className="mt-1 text-subhead text-ink-muted">
                {mode === "signup"
                  ? "Pin it up: people grab a square on their phone with the QR code, or write their name in a box."
                  : `US Letter or A4, ${sheet.orientation}. The QR code takes anyone to the live board.`}
              </p>
            </div>
            {canAmounts && (
              <Switch
                data-testid="print-amounts"
                checked={amounts}
                onChange={setAmounts}
                label="Include square price and prizes"
                description="Off by default. Adds the square price and each prize's amount to the printout."
              />
            )}
            <Button
              data-testid="print-button"
              size="lg"
              block
              leading={native ? <ShareIcon size={22} /> : <PrinterIcon size={22} />}
              onClick={print}
            >
              {native ? "Send to a computer to print" : "Print"}
            </Button>
          </div>
        </div>
      </div>

      <div className="jx-print-preview mx-auto w-full max-w-[72rem] px-4 pb-6">
        <div ref={ref} className="w-full">
          <div className="jx-paper-frame" style={{ width: pageW * scale, height: pageH * scale }}>
            <div className="jx-paper-page" style={{ width: pageW, height: pageH, padding: `${sheet.margin}mm`, transform: `scale(${scale})` }}>
              <PrintSheet state={state} url={url} amounts={amounts && canAmounts} />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
