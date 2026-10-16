// STUB — owned by the notifications builder. Contextual "get notified" ask.
export interface NotifyPromptProps {
  gameId: string;
  /** What just happened, so the ask can be specific. */
  trigger: "claimed" | "created" | "joined";
  open: boolean;
  onClose: () => void;
}

export function NotifyPrompt(_props: NotifyPromptProps) {
  return null;
}
