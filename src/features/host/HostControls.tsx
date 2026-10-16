// STUB — owned by the host builder. Everything the board's host can do.
import type { GameState } from "../../../shared/types";

export interface HostControlsProps {
  state: GameState;
  /** Apply a GameState returned by a host API call (the socket will also deliver it). */
  apply: (state: GameState) => void;
  /** Ask the board to let the host tap one square; resolves null if cancelled. */
  pickCell: (prompt: string) => Promise<{ row: number; col: number } | null>;
  /** Open the invite sheet. */
  onInvite: () => void;
}

export function HostControls(_props: HostControlsProps) {
  return null;
}
