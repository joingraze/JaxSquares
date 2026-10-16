// STUB — owned by the invite builder. Name/emoji/color sheet a newcomer fills to join a board.
import type { GameState } from "../../../shared/types";

export interface JoinSheetProps {
  state: GameState;
  open: boolean;
  /** Called with the fresh state after the join request succeeds. */
  onJoined: (state: GameState) => void;
  onClose: () => void;
}

export function JoinSheet(_props: JoinSheetProps) {
  return null;
}
