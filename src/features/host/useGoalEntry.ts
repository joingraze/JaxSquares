// The host's goal being typed on a soccer board (goalModel.ts): which goal
// (a new one or one being fixed), the draft, and what saving it would send
// and decide. GoalEntry.tsx draws it.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { GameState, ScoreInput } from "../../../shared/types";
import { haptic } from "../../lib/native";
import { NEXT_ENTRY } from "./hostModel";
import { canSaveGoal, goalInput, initialGoalDraft, previewGoal, type GoalDraft, type GoalPreview, type GoalSide } from "./goalModel";

export interface GoalEntryState {
  /** The goal being typed: NEXT_ENTRY for a new one, or "s2" to fix goal 2. */
  key: string;
  setKey: (key: string, from?: GameState) => void;
  draft: GoalDraft;
  setTeam: (team: GoalSide) => void;
  setMinute: (text: string) => void;
  setAdded: (text: string) => void;
  input: ScoreInput | null;
  canSave: boolean;
  preview: GoalPreview | null;
}

export function useGoalEntry(state: GameState, initialKey = NEXT_ENTRY): GoalEntryState {
  const [key, setKeyState] = useState(initialKey);
  const [draft, setDraft] = useState<GoalDraft>(() => initialGoalDraft(state, initialKey));
  const stateRef = useRef(state);
  stateRef.current = state;

  const setKey = useCallback((next: string, from?: GameState) => {
    setKeyState(next);
    setDraft(initialGoalDraft(from ?? stateRef.current, next));
  }, []);

  // The goal being fixed was removed (here or on another device): back to a new one.
  const gone = key !== NEXT_ENTRY && !state.scores.some((s) => s.periodKey === key);
  useEffect(() => {
    if (gone) setKey(NEXT_ENTRY);
  }, [gone, setKey]);

  const digits = (text: string) => text.replace(/\D/g, "").slice(0, 3);
  return {
    key,
    setKey,
    draft,
    setTeam: useCallback((team: GoalSide) => {
      void haptic("selection");
      setDraft((d) => ({ ...d, team }));
    }, []),
    setMinute: useCallback((text: string) => setDraft((d) => ({ ...d, minute: digits(text) })), []),
    setAdded: useCallback((text: string) => setDraft((d) => ({ ...d, added: digits(text).slice(0, 2) })), []),
    input: goalInput(state, key, draft),
    canSave: canSaveGoal(state, key, draft),
    preview: useMemo(() => previewGoal(state, key, draft), [state, key, draft]),
  };
}
