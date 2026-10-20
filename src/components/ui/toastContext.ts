import { createContext, useContext, type ReactNode } from "react";
import type { HapticKind } from "../../lib/native";

export type ToastTone = "neutral" | "success" | "error" | "win" | "live" | "social";

export interface ToastOptions {
  title: ReactNode;
  description?: ReactNode;
  tone?: ToastTone;
  /** Replaces the tone icon (an Avatar, an emoji...). */
  icon?: ReactNode;
  /** ms; 0 keeps it until dismissed. Defaults by tone. */
  duration?: number;
  action?: { label: string; onClick: () => void };
  /** Showing a toast with an id that's already up replaces it (e.g. "connection"). */
  id?: string;
  /** Native haptic; defaults by tone (success/win/error buzz). Pass false for none. */
  haptic?: HapticKind | false;
}

export interface ToastApi {
  show(options: ToastOptions): string;
  success(title: ReactNode, description?: ReactNode): string;
  error(title: ReactNode, description?: ReactNode): string;
  win(title: ReactNode, description?: ReactNode): string;
  dismiss(id: string): void;
}

export const ToastContext = createContext<ToastApi | null>(null);

export function useToast(): ToastApi {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be used inside <ToastProvider>");
  return ctx;
}
