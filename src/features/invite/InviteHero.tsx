// STUB — owned by the invite builder. Welcome banner shown on a board to someone who hasn't joined yet.
import type { GameState } from "../../../shared/types";

export interface InviteHeroProps {
  state: GameState;
  onJoin: () => void;
}

export function InviteHero(_props: InviteHeroProps) {
  return null;
}
