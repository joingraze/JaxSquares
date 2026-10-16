// Score entry state for the host sheet: which period, the two scores being
// typed, which team the keypad feeds, and the live "who wins" preview. Kept in
// the sheet (not the pad) so the sticky footer can preview and save.

import { useCallback, useEffect, useMemo, useRef, useState, type RefObject } from "react";
import type { GameState } from "../../../shared/types";
import { haptic } from "../../lib/native";
import {
  NEXT_ENTRY,
  addPoints,
  canSaveScore,
  cleanTyped,
  initialDraft,
  pressKey,
  previewWinner,
  type PadKey,
  type ScoreDraft,
  type WinnerPreview,
} from "./hostModel";

export type Side = "x" | "y";

export interface ScoreEntry {
  key: string;
  /** Switch period; pass the newest state when it isn't rendered yet (right after a save). */
  setKey: (key: string, from?: GameState) => void;
  draft: ScoreDraft;
  active: Side;
  setActive: (side: Side) => void;
  press: (key: PadKey) => void;
  add: (points: number) => void;
  type: (side: Side, raw: string) => void;
  /** Reload the starting values for the current period (after a save, or to discard edits). */
  reset: () => void;
  focusSide: (side: Side) => void;
  preview: WinnerPreview | null;
  canSave: boolean;
  tileRefs: { x: RefObject<HTMLLabelElement>; y: RefObject<HTMLLabelElement> };
  inputRefs: { x: RefObject<HTMLInputElement>; y: RefObject<HTMLInputElement> };
}

function bump(el: HTMLElement | null) {
  if (!el || typeof el.animate !== "function") return;
  el.animate([{ transform: "scale(0.95)" }, { transform: "scale(1.035)", offset: 0.6 }, { transform: "scale(1)" }], {
    duration: 220,
    easing: "cubic-bezier(0.34, 1.56, 0.64, 1)",
  });
}

export function useScoreEntry(state: GameState, initialKey: string): ScoreEntry {
  const [key, setKeyState] = useState(initialKey);
  const [draft, setDraft] = useState<ScoreDraft>(() => initialDraft(state, initialKey));
  const [active, setActiveState] = useState<Side>("x");
  const fresh = useRef(true);
  const stateRef = useRef(state);
  stateRef.current = state;
  const tileX = useRef<HTMLLabelElement>(null);
  const tileY = useRef<HTMLLabelElement>(null);
  const inputX = useRef<HTMLInputElement>(null);
  const inputY = useRef<HTMLInputElement>(null);

  const setKey = useCallback((next: string, from?: GameState) => {
    setKeyState(next);
    setDraft(initialDraft(from ?? stateRef.current, next));
    setActiveState("x");
    fresh.current = true;
  }, []);

  const reset = useCallback(() => {
    setDraft(initialDraft(stateRef.current, key));
    setActiveState("x");
    fresh.current = true;
  }, [key]);

  // An every-score entry being fixed was removed (here or on another device): back to a new entry.
  const keyGone = state.game.format.periods === "every-score" && key !== NEXT_ENTRY && !state.scores.some((s) => s.periodKey === key);
  useEffect(() => {
    if (keyGone) setKey(NEXT_ENTRY);
  }, [keyGone, setKey]);

  const setActive = useCallback((side: Side) => {
    setActiveState(side);
    fresh.current = true;
  }, []);

  const focusSide = useCallback((side: Side) => {
    setActive(side);
    const input = side === "x" ? inputX.current : inputY.current;
    input?.focus({ preventScroll: true });
    input?.select();
  }, [setActive]);

  const press = useCallback(
    (k: PadKey) => {
      void haptic("selection");
      setDraft((d) => ({ ...d, [active]: pressKey(d[active], k, fresh.current) }));
      fresh.current = false;
      if (k !== "back" && k !== "clear") bump(active === "x" ? tileX.current : tileY.current);
    },
    [active],
  );

  const add = useCallback(
    (points: number) => {
      void haptic("light");
      setDraft((d) => ({ ...d, [active]: addPoints(d[active], points) }));
      fresh.current = false;
      bump(active === "x" ? tileX.current : tileY.current);
    },
    [active],
  );

  const type = useCallback((side: Side, raw: string) => {
    setDraft((d) => ({ ...d, [side]: cleanTyped(raw) }));
    fresh.current = false;
  }, []);

  const preview = useMemo(() => previewWinner(state, key, draft), [state, key, draft]);
  const canSave = canSaveScore(state, key, draft);

  return {
    key,
    setKey,
    draft,
    active,
    setActive,
    press,
    add,
    type,
    reset,
    focusSide,
    preview,
    canSave,
    tileRefs: { x: tileX, y: tileY },
    inputRefs: { x: inputX, y: inputY },
  };
}
