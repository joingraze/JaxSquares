// Host tools → Board → "Players list (CSV)": on a Club Pass holder's board
// (Game.club), for its host and co-hosts. A download on the web, the share
// sheet in the iOS app (exportPlayers.ts). Names, squares, numbers and when
// each joined; never who paid.

import { useState } from "react";
import type { Game } from "../../../shared/types";
import { DownloadIcon, ShareIcon } from "../../components/icons";
import { ListRow, useToast } from "../../components/ui";
import { errorMessage } from "../../lib/api";
import { haptic, isNative } from "../../lib/native";
import { exportPlayers } from "./exportPlayers";

export function ExportPlayersRow({ game }: { game: Pick<Game, "id" | "name" | "club"> }) {
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  if (!game.club) return null;
  const native = isNative();

  const run = async () => {
    if (busy) return;
    void haptic("selection");
    setBusy(true);
    try {
      const outcome = await exportPlayers(game.id, game.name);
      if (outcome === "saved") toast.success("Players list downloaded", "Open it in any spreadsheet app.");
    } catch (err) {
      toast.error("Couldn't get the players list", errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <ListRow
      data-testid="host-export"
      leading={
        <span className="grid h-9 w-9 place-items-center rounded-xl bg-brand-400/15 text-ink-brand">
          <DownloadIcon size={18} />
        </span>
      }
      title="Players list (CSV)"
      subtitle="Names, squares, numbers and when each joined"
      trailing={busy ? <span className="text-footnote text-ink-subtle">{native ? "Opening…" : "Downloading…"}</span> : native ? <ShareIcon size={18} className="text-ink-subtle" /> : undefined}
      onClick={() => void run()}
    />
  );
}
