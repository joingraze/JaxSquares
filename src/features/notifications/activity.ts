// STUB — owned by the notifications builder. Turns live activity into in-app toasts.
import type { Activity, GameState } from "../../../shared/types";

export interface ActivityAnnouncement {
  text: string;
  tone: "info" | "live" | "win";
  haptic?: "light" | "medium" | "heavy" | "success" | "warning" | "selection";
  /** Fire confetti (e.g. my square won). */
  celebrate?: boolean;
}

/** null = don't announce (e.g. my own action, or noise). */
export function describeActivity(_activity: Activity, _state: GameState, _myPlayerId: string): ActivityAnnouncement | null {
  return null;
}
