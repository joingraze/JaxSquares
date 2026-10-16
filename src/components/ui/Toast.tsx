import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import { haptic, type HapticKind } from "../../lib/native";
import { AlertIcon, CheckIcon, InfoIcon, LiveIcon, TrophyIcon, UsersIcon } from "../icons";
import { cx } from "./cx";
import { ToastContext, type ToastApi, type ToastOptions, type ToastTone } from "./toastContext";

export type { ToastApi, ToastOptions, ToastTone } from "./toastContext";

interface ToastItem extends ToastOptions {
  id: string;
  leaving: boolean;
  /** Bumps when a toast is replaced in place, restarting its timer. */
  rev: number;
}

const MAX_VISIBLE = 3;
const EXIT_MS = 200;

const DEFAULT_DURATION: Record<ToastTone, number> = {
  neutral: 3500,
  success: 3000,
  error: 5000,
  win: 6000,
  live: 4000,
  social: 3500,
};

const DEFAULT_HAPTIC: Partial<Record<ToastTone, HapticKind>> = { success: "success", win: "success", error: "error" };

const TONE_ICON: Record<ToastTone, { icon: ReactNode; chip: string }> = {
  neutral: { icon: <InfoIcon size={18} />, chip: "bg-surface-4 text-ink" },
  success: { icon: <CheckIcon size={18} strokeWidth={3} />, chip: "bg-brand-400 text-ink-inverse" },
  error: { icon: <AlertIcon size={18} />, chip: "bg-danger-500 text-white" },
  win: { icon: <TrophyIcon size={18} filled />, chip: "bg-gold-400 text-ink-inverse" },
  live: { icon: <LiveIcon size={18} />, chip: "bg-live-500 text-white" },
  social: { icon: <UsersIcon size={18} />, chip: "bg-accent-500 text-white" },
};

let seq = 0;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);

  const remove = useCallback((id: string) => {
    // Only if still leaving: the same id may have been shown again meanwhile.
    setItems((list) => list.filter((t) => !(t.id === id && t.leaving)));
  }, []);

  const dismiss = useCallback(
    (id: string) => {
      setItems((list) => list.map((t) => (t.id === id ? { ...t, leaving: true } : t)));
      setTimeout(() => remove(id), EXIT_MS);
    },
    [remove],
  );

  const show = useCallback((options: ToastOptions): string => {
    const id = options.id ?? `t${++seq}`;
    const tone = options.tone ?? "neutral";
    const feel = options.haptic ?? DEFAULT_HAPTIC[tone];
    if (feel) void haptic(feel);
    setItems((list) => {
      const existing = list.find((t) => t.id === id);
      if (existing) {
        return list.map((t) => (t.id === id ? { ...options, id, leaving: false, rev: t.rev + 1 } : t));
      }
      const next = [{ ...options, id, leaving: false, rev: 0 }, ...list];
      // Oldest beyond the limit leave immediately.
      return next.filter((t, i) => i < MAX_VISIBLE || t.leaving);
    });
    return id;
  }, []);

  const api = useMemo<ToastApi>(
    () => ({
      show,
      dismiss,
      success: (title, description) => show({ title, description, tone: "success" }),
      error: (title, description) => show({ title, description, tone: "error" }),
      win: (title, description) => show({ title, description, tone: "win" }),
    }),
    [show, dismiss],
  );

  return (
    <ToastContext.Provider value={api}>
      {children}
      {createPortal(
        <section
          aria-label="Notifications"
          aria-live="polite"
          className="pointer-events-none fixed inset-x-0 top-0 z-[70] flex flex-col items-center gap-2 px-3 pt-[calc(var(--safe-top)+0.5rem)]"
        >
          {items.map((t) => (
            <Toast key={t.id} item={t} onDismiss={dismiss} />
          ))}
        </section>,
        document.body,
      )}
    </ToastContext.Provider>
  );
}

function Toast({ item, onDismiss }: { item: ToastItem; onDismiss: (id: string) => void }) {
  const tone = item.tone ?? "neutral";
  const duration = item.duration ?? DEFAULT_DURATION[tone];
  const ref = useRef<HTMLDivElement>(null);
  const [paused, setPaused] = useState(false);
  const drag = useRef<{ x: number; y: number; dx: number; dy: number } | null>(null);

  useEffect(() => {
    if (!duration || paused || item.leaving) return;
    const t = setTimeout(() => onDismiss(item.id), duration);
    return () => clearTimeout(t);
  }, [duration, paused, item.leaving, item.id, item.rev, onDismiss]);

  const onPointerDown = (e: PointerEvent<HTMLDivElement>) => {
    if ((e.target as HTMLElement).closest("button")) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    drag.current = { x: e.clientX, y: e.clientY, dx: 0, dy: 0 };
    setPaused(true);
  };
  const onPointerMove = (e: PointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    const el = ref.current;
    if (!d || !el) return;
    d.dx = e.clientX - d.x;
    d.dy = Math.min(0, e.clientY - d.y);
    el.style.transition = "none";
    el.style.transform = `translate3d(${d.dx}px, ${d.dy}px, 0)`;
    el.style.opacity = String(1 - Math.min(0.8, Math.max(Math.abs(d.dx) / 220, -d.dy / 80)));
  };
  const onPointerUp = () => {
    const d = drag.current;
    const el = ref.current;
    drag.current = null;
    setPaused(false);
    if (!d || !el) return;
    el.style.transition = "";
    if (d.dy < -28 || Math.abs(d.dx) > 90) {
      el.style.transform = d.dy < -28 ? "translate3d(0,-120%,0)" : `translate3d(${Math.sign(d.dx) * 120}%,0,0)`;
      el.style.opacity = "0";
      onDismiss(item.id);
    } else {
      el.style.transform = "";
      el.style.opacity = "";
    }
  };

  const { icon, chip } = TONE_ICON[tone];
  return (
    <div
      ref={ref}
      role={tone === "error" ? "alert" : "status"}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      className={cx(
        "pointer-events-auto flex w-full max-w-md touch-none bg-surface-3/95 backdrop-blur-xl backdrop-saturate-150 items-center gap-3 rounded-2xl py-2.5 pl-2.5 pr-3 shadow-float transition-[transform,opacity] duration-200",
        tone === "win" ? "ring-1 ring-inset ring-gold-400/50 shadow-glow-gold" : "ring-1 ring-inset ring-line-strong",
        item.leaving ? "animate-toast-out" : "animate-toast-in",
      )}
    >
      <span className={cx("grid h-9 w-9 shrink-0 place-items-center rounded-xl text-lg leading-none", item.icon ? "" : chip)}>
        {item.icon ?? icon}
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-callout font-bold leading-snug text-ink">{item.title}</p>
        {item.description && <p className="mt-0.5 text-footnote leading-snug text-ink-muted">{item.description}</p>}
      </div>
      {item.action && (
        <button
          type="button"
          onClick={() => {
            item.action?.onClick();
            onDismiss(item.id);
          }}
          className="pressable tap-target shrink-0 rounded-lg px-2.5 py-1.5 text-subhead font-extrabold text-brand-400 hover:bg-white/6"
        >
          {item.action.label}
        </button>
      )}
    </div>
  );
}
