// What host links are, plus a copy button for each board this device hosts.

import { useEffect, useRef, useState } from "react";
import type { GameSummary } from "../../../../shared/types";
import { CheckIcon, CopyIcon, LockIcon } from "../../../components/icons";
import { BottomSheet, Button } from "../../../components/ui";
import { PUBLIC_ORIGIN } from "../../../lib/api";
import { hostLinkUrl } from "../../../lib/identity";
import { copyText, haptic } from "../../../lib/native";
import { MiniMatchup } from "./MiniMatchup";

export function HostLinksSheet({ open, onClose, games }: { open: boolean; onClose: () => void; games: readonly GameSummary[] }) {
  const hosted = games.filter((g) => g.isHost && g.status !== "final" && hostLinkUrl(g.id, PUBLIC_ORIGIN));
  const [copied, setCopied] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => void (timer.current && clearTimeout(timer.current)), []);

  const copy = async (id: string) => {
    const url = hostLinkUrl(id, PUBLIC_ORIGIN);
    if (!url) return;
    if ((await copyText(url)) === "copied") {
      void haptic("success");
      setCopied(id);
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => setCopied(null), 2000);
    } else {
      void haptic("error");
    }
  };

  return (
    <BottomSheet open={open} onClose={onClose} title="Host links" description="Run your board from any phone or computer.">
      <ol className="flex flex-col gap-3 text-callout text-ink">
        <li className="flex gap-3">
          <span className="eyebrow mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-full bg-surface-4 text-ink">1</span>
          <span>Every board you create gets a private host link. It's how JaxSquares knows you're the host, no account needed.</span>
        </li>
        <li className="flex gap-3">
          <span className="eyebrow mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-full bg-surface-4 text-ink">2</span>
          <span>Open it on another device to draw numbers and post scores from there.</span>
        </li>
      </ol>
      <p className="mt-4 flex items-start gap-2.5 rounded-xl bg-gold-400/10 px-3 py-2.5 text-footnote font-semibold text-gold-200 ring-1 ring-inset ring-gold-400/25">
        <LockIcon size={16} className="mt-px shrink-0" />
        Anyone with a host link can run that board. Send it only to yourself.
      </p>

      <h3 className="eyebrow mb-2 mt-6 px-1 text-ink-subtle">Your boards</h3>
      {hosted.length === 0 ? (
        <p className="rounded-xl bg-surface-3 px-4 py-3.5 text-subhead text-ink-muted">
          Boards you host show up here with their link.
        </p>
      ) : (
        <ul className="overflow-hidden rounded-card bg-surface-3 ring-1 ring-inset ring-line [&>*+*]:border-t [&>*+*]:border-line">
          {hosted.map((g) => (
            <li key={g.id} className="flex min-h-15 items-center gap-3 px-3.5 py-2">
              <MiniMatchup teamX={g.teamX} teamY={g.teamY} />
              <span className="min-w-0 flex-1 truncate text-callout font-semibold text-ink">{g.name}</span>
              <Button
                size="sm"
                variant={copied === g.id ? "primary" : "secondary"}
                haptic={false}
                onClick={() => void copy(g.id)}
                leading={copied === g.id ? <CheckIcon size={16} strokeWidth={3} /> : <CopyIcon size={16} />}
                className="min-w-[5.5rem]"
              >
                {copied === g.id ? "Copied" : "Copy"}
              </Button>
            </li>
          ))}
        </ul>
      )}
    </BottomSheet>
  );
}
