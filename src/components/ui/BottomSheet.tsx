import {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type PointerEvent,
  type ReactNode,
  type RefObject,
} from "react";
import { createPortal } from "react-dom";
import { XIcon } from "../icons";
import { useBottomChrome } from "./bottomChrome";
import { cx } from "./cx";
import { IconButton } from "./IconButton";
import { focusablesIn, lockBackground } from "./modalLock";
import { useKeyboardInset } from "./useKeyboardInset";

export interface BottomSheetProps {
  open: boolean;
  onClose: () => void;
  title?: ReactNode;
  description?: ReactNode;
  children?: ReactNode;
  /** Sticky actions under the scrollable content. */
  footer?: ReactNode;
  /** false: no drag, backdrop tap or Escape to close (e.g. while a payment is in flight). */
  dismissible?: boolean;
  /** Element to focus on open. Defaults to the sheet itself so the keyboard doesn't pop up. */
  initialFocusRef?: RefObject<HTMLElement | null>;
  /** Accessible name when there's no visible title. */
  "aria-label"?: string;
  className?: string;
}

/** Fraction of the sheet height, or a flick faster than this (px/ms), that dismisses it. */
const DISMISS_FRACTION = 0.28;
const DISMISS_VELOCITY = 0.55;
const EXIT_FALLBACK_MS = 480;

interface Drag {
  startY: number;
  lastY: number;
  lastT: number;
  velocity: number;
  offset: number;
  active: boolean;
}

export function BottomSheet({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  dismissible = true,
  initialFocusRef,
  className,
  ...aria
}: BottomSheetProps) {
  const [mounted, setMounted] = useState(open);
  const [shown, setShown] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);
  const backdropRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const drag = useRef<Drag | null>(null);
  const returnFocus = useRef<HTMLElement | null>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  const titleId = useId();
  const descId = useId();
  const keyboard = useKeyboardInset(mounted);

  // While open, toasts sit just above the sheet's footer (or its bottom edge), over the sheet.
  const footerRef = useRef<HTMLDivElement>(null);
  const [footerH, setFooterH] = useState(0);
  const hasFooter = Boolean(footer);
  useLayoutEffect(() => {
    const el = footerRef.current;
    if (!el) {
      setFooterH(0);
      return;
    }
    const update = () => setFooterH(el.offsetHeight);
    update();
    if (typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, [mounted, hasFooter]);
  const bottomSpace = keyboard ? "12px" : "max(1rem, var(--safe-bottom))";
  useBottomChrome(shown && open ? `calc(${keyboard}px + ${footerH}px + ${bottomSpace})` : null, true);

  // Mount, then flip to "shown" on the next frames so the enter transition runs.
  useEffect(() => {
    if (open) {
      setMounted(true);
      let r2 = 0;
      const r1 = requestAnimationFrame(() => {
        r2 = requestAnimationFrame(() => setShown(true));
      });
      return () => {
        cancelAnimationFrame(r1);
        cancelAnimationFrame(r2);
      };
    }
    setShown(false);
    const t = setTimeout(() => setMounted(false), EXIT_FALLBACK_MS);
    return () => clearTimeout(t);
  }, [open]);

  // Background lock + focus in/out.
  useLayoutEffect(() => {
    if (!mounted) return;
    returnFocus.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const unlock = lockBackground();
    return () => {
      unlock();
      returnFocus.current?.focus({ preventScroll: true });
    };
  }, [mounted]);

  useEffect(() => {
    if (!shown) return;
    const target = initialFocusRef?.current ?? panelRef.current;
    target?.focus({ preventScroll: true });
  }, [shown, initialFocusRef]);

  // Clear any inline drag styles whenever the visibility state changes.
  useEffect(() => {
    const panel = panelRef.current;
    if (panel) {
      panel.style.transform = "";
      panel.style.transition = "";
    }
    if (backdropRef.current) backdropRef.current.style.opacity = "";
  }, [shown]);

  const requestClose = useCallback(() => {
    if (dismissible) onCloseRef.current();
  }, [dismissible]);

  // ---- drag to dismiss ----

  const moveTo = (offset: number) => {
    const panel = panelRef.current;
    if (!panel) return;
    // Pulling up past the top resists (rubber band).
    const y = offset >= 0 ? offset : -Math.sqrt(-offset) * 2.5;
    panel.style.transition = "none";
    panel.style.transform = `translate3d(0, ${y}px, 0)`;
    if (backdropRef.current) {
      const h = panel.offsetHeight || 1;
      backdropRef.current.style.transition = "none";
      backdropRef.current.style.opacity = String(Math.max(0, 1 - Math.max(0, y) / h));
    }
  };

  const beginDrag = (y: number) => {
    drag.current = { startY: y, lastY: y, lastT: performance.now(), velocity: 0, offset: 0, active: false };
  };

  const updateDrag = (y: number): boolean => {
    const d = drag.current;
    if (!d) return false;
    const now = performance.now();
    const dt = Math.max(1, now - d.lastT);
    d.velocity = 0.8 * ((y - d.lastY) / dt) + 0.2 * d.velocity;
    d.lastY = y;
    d.lastT = now;
    d.offset = y - d.startY;
    if (!d.active && Math.abs(d.offset) > 4) d.active = true;
    if (d.active) moveTo(d.offset);
    return d.active;
  };

  const endDrag = () => {
    const d = drag.current;
    drag.current = null;
    const panel = panelRef.current;
    if (!d?.active || !panel) return;
    const h = panel.offsetHeight || 1;
    const dismiss = d.offset > h * DISMISS_FRACTION || (d.velocity > DISMISS_VELOCITY && d.offset > 12);
    panel.style.transition = "";
    if (backdropRef.current) backdropRef.current.style.transition = "";
    if (dismiss) {
      panel.style.transform = "translate3d(0, 100%, 0)";
      if (backdropRef.current) backdropRef.current.style.opacity = "0";
      onCloseRef.current();
    } else {
      panel.style.transform = "";
      if (backdropRef.current) backdropRef.current.style.opacity = "";
    }
  };

  const onGrabPointerDown = (e: PointerEvent<HTMLDivElement>) => {
    if (!dismissible || e.button !== 0) return;
    if ((e.target as HTMLElement).closest("button, a, input, textarea, select")) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    beginDrag(e.clientY);
  };

  // Content: native touch listeners (non-passive) so a pull-down at scrollTop 0 drags the sheet instead of scrolling.
  useEffect(() => {
    const el = contentRef.current;
    if (!el || !shown || !dismissible) return;
    let atTop = false;
    let startY = 0;
    const onStart = (e: TouchEvent) => {
      atTop = el.scrollTop <= 0;
      startY = e.touches[0].clientY;
      drag.current = null;
    };
    const onMove = (e: TouchEvent) => {
      const y = e.touches[0].clientY;
      if (!drag.current) {
        if (!atTop || y - startY <= 6 || el.scrollTop > 0) return;
        beginDrag(startY);
      }
      if (updateDrag(y) && e.cancelable) e.preventDefault();
    };
    const onEnd = () => endDrag();
    el.addEventListener("touchstart", onStart, { passive: true });
    el.addEventListener("touchmove", onMove, { passive: false });
    el.addEventListener("touchend", onEnd);
    el.addEventListener("touchcancel", onEnd);
    return () => {
      el.removeEventListener("touchstart", onStart);
      el.removeEventListener("touchmove", onMove);
      el.removeEventListener("touchend", onEnd);
      el.removeEventListener("touchcancel", onEnd);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- drag helpers only touch refs
  }, [shown, dismissible]);

  // ---- keyboard ----

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key === "Escape") {
      e.stopPropagation();
      requestClose();
      return;
    }
    if (e.key !== "Tab" || !panelRef.current) return;
    const items = focusablesIn(panelRef.current);
    if (items.length === 0) {
      e.preventDefault();
      return;
    }
    const first = items[0];
    const last = items[items.length - 1];
    const active = document.activeElement;
    if (e.shiftKey && (active === first || active === panelRef.current)) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && active === last) {
      e.preventDefault();
      first.focus();
    }
  };

  if (!mounted) return null;

  return createPortal(
    <div className="fixed inset-0 z-50" role="presentation">
      <div
        ref={backdropRef}
        aria-hidden
        onClick={requestClose}
        className={cx(
          "absolute inset-0 bg-scrim backdrop-blur-[2px] transition-opacity duration-300",
          shown ? "opacity-100" : "opacity-0",
        )}
      />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={title ? titleId : undefined}
        aria-describedby={description ? descId : undefined}
        aria-label={title ? undefined : aria["aria-label"]}
        tabIndex={-1}
        onKeyDown={onKeyDown}
        onTransitionEnd={(e) => {
          if (e.target === panelRef.current && e.propertyName === "transform" && !open) setMounted(false);
        }}
        style={{ bottom: keyboard }}
        className={cx(
          "absolute inset-x-0 mx-auto flex w-full max-w-lg flex-col rounded-t-sheet bg-surface-2 shadow-sheet outline-none",
          "ring-1 ring-line-strong will-change-transform",
          "max-h-[calc(100dvh-var(--safe-top)-0.75rem)] transition-transform duration-[420ms] ease-sheet",
          // Background continues below the edge so an upward rubber-band never shows a gap.
          "after:absolute after:inset-x-0 after:top-full after:h-24 after:bg-surface-2",
          shown ? "translate-y-0" : "translate-y-full",
          className,
        )}
      >
        <div
          onPointerDown={onGrabPointerDown}
          onPointerMove={(e) => drag.current && updateDrag(e.clientY)}
          onPointerUp={endDrag}
          onPointerCancel={endDrag}
          className={cx("shrink-0 touch-none px-5 pb-2 pt-2.5", dismissible && "cursor-grab active:cursor-grabbing")}
        >
          <div aria-hidden className="mx-auto h-1.5 w-10 rounded-full bg-ink/20" />
          {(title || dismissible) && (
            <div className={cx("flex items-start gap-3", title ? "mt-3" : "mt-1 justify-end")}>
              {title && (
                <div className="min-w-0 flex-1 pt-2.5">
                  <h2 id={titleId} className="font-display text-title-3 font-extrabold text-ink">
                    {title}
                  </h2>
                  {description && (
                    <p id={descId} className="mt-1 text-subhead text-ink-muted">
                      {description}
                    </p>
                  )}
                </div>
              )}
              {dismissible && (
                <IconButton label="Close" icon={<XIcon size={20} />} variant="solid" size="md" className="-mr-1.5" onClick={requestClose} />
              )}
            </div>
          )}
        </div>
        <div ref={contentRef} className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 pb-4 pt-2">
          {children}
        </div>
        {footer && (
          <div ref={footerRef} className="shrink-0 border-t border-line px-5 pt-3">
            {footer}
          </div>
        )}
        <div aria-hidden className="shrink-0" style={{ height: bottomSpace }} />
      </div>
    </div>,
    document.body,
  );
}
