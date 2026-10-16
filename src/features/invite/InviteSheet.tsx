// STUB — owned by the invite builder. Sheet for sharing a board's invite link.
import type { GameState } from "../../../shared/types";

export interface InviteSheetProps {
  state: GameState;
  open: boolean;
  onClose: () => void;
}

export function InviteSheet(_props: InviteSheetProps) {
  return null;
}
