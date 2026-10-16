// Illustrated how-tos: add to Home Screen (iOS Safari) and re-enable blocked
// notifications. Used by the notifications ask and by Profile.

import type { ReactNode, SVGProps } from "react";
import { BellIcon, BellOffIcon, ChevronLeftIcon, ChevronRightIcon } from "../../components/icons";
import { LogoMark, cx } from "../../components/ui";
import { blockedSteps, detectHelpEnv } from "./platformHelp";
import "./notifications.css";

// ---- iOS glyphs (not in the shared icon set) ----

function Glyph({ children, size = 20, ...rest }: SVGProps<SVGSVGElement> & { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      {...rest}
    >
      {children}
    </svg>
  );
}

/** Safari's Share button: a tray with an arrow up. */
export function ShareGlyph({ size = 20, className }: { size?: number; className?: string }) {
  return (
    <Glyph size={size} className={className}>
      <path d="M12 3.5v11" />
      <path d="m8 7.5 4-4 4 4" />
      <path d="M8.5 10.5H7a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-6a2 2 0 0 0-2-2h-1.5" />
    </Glyph>
  );
}

/** "Add to Home Screen": a rounded square with a plus. */
export function AddSquareGlyph({ size = 20, className }: { size?: number; className?: string }) {
  return (
    <Glyph size={size} className={className}>
      <rect x="4" y="4" width="16" height="16" rx="4" />
      <path d="M12 8.5v7M8.5 12h7" />
    </Glyph>
  );
}

function BookGlyph({ size = 20 }: { size?: number }) {
  return (
    <Glyph size={size}>
      <path d="M4 5.5c2.5-1 5-1 8 1 3-2 5.5-2 8-1v13c-2.5-1-5-1-8 1-3-2-5.5-2-8-1z" />
      <path d="M12 6.5v13" />
    </Glyph>
  );
}

function TabsGlyph({ size = 20 }: { size?: number }) {
  return (
    <Glyph size={size}>
      <rect x="4" y="7" width="12" height="13" rx="2.5" />
      <path d="M8 4h9.5A2.5 2.5 0 0 1 20 6.5V16" />
    </Glyph>
  );
}

// ---- Steps ----

function Step({ n, visual, children, note }: { n: number; visual: ReactNode; children: ReactNode; note?: ReactNode }) {
  return (
    <li className="flex items-center gap-3.5">
      <span className="relative grid h-14 w-14 shrink-0 place-items-center rounded-2xl bg-surface-3 ring-1 ring-inset ring-line">
        {visual}
        <span className="absolute -left-1.5 -top-1.5 grid h-5.5 w-5.5 place-items-center rounded-full bg-brand-400 text-[0.6875rem] font-extrabold text-ink-inverse ring-2 ring-surface-2">
          {n}
        </span>
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-callout font-bold leading-snug text-ink">{children}</span>
        {note && <span className="mt-0.5 block text-footnote leading-snug text-ink-muted">{note}</span>}
      </span>
    </li>
  );
}

/** Safari's bottom toolbar with the Share button lit and a bobbing pointer. */
export function SafariToolbarArt({ className }: { className?: string }) {
  return (
    <div aria-hidden className={cx("relative px-2 pt-8", className)}>
      <div className="jxn-toolbar">
        <ChevronLeftIcon size={22} />
        <ChevronRightIcon size={22} className="opacity-50" />
        <span className="jxn-share-lit">
          <span className="jxn-tap">
            <Glyph size={22} strokeWidth={2.6}>
              <path d="M12 4v13M6.5 11.5 12 17l5.5-5.5" />
            </Glyph>
          </span>
          <ShareGlyph size={21} />
        </span>
        <BookGlyph />
        <TabsGlyph />
      </div>
    </div>
  );
}

/** iPhone Safari tab: notifications need the home-screen app. */
export function InstallGuide({ compact = false }: { compact?: boolean }) {
  return (
    <div>
      {!compact && <SafariToolbarArt className="mb-5" />}
      <ol className="flex flex-col gap-4" aria-label="Add JaxSquares to your Home Screen">
        <Step
          n={1}
          visual={<ShareGlyph size={24} className="text-brand-300" />}
          note={<>On iOS 26 and later, tap ••• first, then Share.</>}
        >
          Tap Share in Safari&rsquo;s toolbar
        </Step>
        <Step n={2} visual={<AddSquareGlyph size={24} className="text-ink" />} note="Scroll down the share sheet to find it.">
          Tap &ldquo;Add to Home Screen&rdquo;
        </Step>
        <Step
          n={3}
          visual={
            <span className="relative">
              <LogoMark size={30} />
              <span className="absolute -right-1.5 -top-1.5 grid h-4 min-w-4 place-items-center rounded-full bg-live-500 px-1 text-[0.5625rem] font-extrabold text-white">
                1
              </span>
            </span>
          }
          note="Then tap Turn on notifications. That's it."
        >
          Open JaxSquares from your Home Screen
        </Step>
      </ol>
    </div>
  );
}

/** Notifications were blocked in system/browser settings: how to undo it here. */
export function BlockedGuide() {
  const steps = blockedSteps(detectHelpEnv());
  return (
    <ol className="flex flex-col gap-3" aria-label="Turn notifications back on">
      {steps.map((s, i) => (
        <li key={s} className="flex items-center gap-3">
          <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-surface-4 text-footnote font-extrabold text-ink">
            {i + 1}
          </span>
          <span className="text-callout font-semibold text-ink">{s}</span>
        </li>
      ))}
    </ol>
  );
}

/** Round icon chip used at the top of the notification states. */
export function StateIcon({ tone, children }: { tone: "brand" | "danger" | "muted"; children?: ReactNode }) {
  return (
    <span
      aria-hidden
      className={cx(
        "grid h-12 w-12 shrink-0 place-items-center rounded-2xl",
        tone === "brand" && "bg-brand-400 text-ink-inverse shadow-glow-brand",
        tone === "danger" && "bg-danger-500/14 text-danger-300 ring-1 ring-inset ring-danger-500/35",
        tone === "muted" && "bg-surface-4 text-ink-muted",
      )}
    >
      {children ?? (tone === "danger" ? <BellOffIcon size={22} /> : <BellIcon size={22} />)}
    </span>
  );
}
