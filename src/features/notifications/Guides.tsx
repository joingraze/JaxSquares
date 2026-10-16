// Illustrated how-tos: add to Home Screen (iOS Safari) and re-enable blocked
// notifications. Used by the notifications ask and by Profile.

import type { ReactNode, SVGProps } from "react";
import { BellIcon, BellOffIcon, ChevronLeftIcon, ChevronRightIcon } from "../../components/icons";
import { LogoMark, cx } from "../../components/ui";
import { blockedHelp, detectHelpEnv, type BlockedHelp, type BlockedKind } from "./platformHelp";
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

function GearGlyph({ size = 20, className }: { size?: number; className?: string }) {
  return (
    <Glyph size={size} className={className}>
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z" />
    </Glyph>
  );
}

function ToggleGlyph({ size = 20, className }: { size?: number; className?: string }) {
  return (
    <Glyph size={size} className={className}>
      <rect x="2.5" y="7" width="19" height="10" rx="5" />
      <circle cx="16.5" cy="12" r="3" fill="currentColor" />
    </Glyph>
  );
}

function TuneGlyph({ size = 20, className }: { size?: number; className?: string }) {
  return (
    <Glyph size={size} className={className}>
      <path d="M4 7h9M17 7h3M4 17h3M11 17h9" />
      <circle cx="15" cy="7" r="2" />
      <circle cx="9" cy="17" r="2" />
    </Glyph>
  );
}

/** A bobbing finger pointing down at whatever sits under it. */
function TapHint() {
  return (
    <span className="jxn-tap" aria-hidden>
      <Glyph size={22} strokeWidth={2.6}>
        <path d="M12 4v13M6.5 11.5 12 17l5.5-5.5" />
      </Glyph>
    </span>
  );
}

/** The phone's Settings screen for JaxSquares, with the Allow switch flipping on. */
export function SettingsArt({ os, className }: { os: "ios" | "android"; className?: string }) {
  return (
    <div aria-hidden className={cx("relative px-2 pt-8", className)}>
      <div className="jxn-settings">
        <div className="flex items-center gap-1 border-b border-white/8 px-3 py-2 text-caption font-semibold text-ink-muted">
          <ChevronLeftIcon size={15} className="text-brand-300" />
          <span className="text-brand-300">{os === "ios" ? "Notifications" : "App info"}</span>
          <span className="flex-1 text-center font-bold text-ink">{os === "ios" ? "JaxSquares" : "Notifications"}</span>
          <span className="w-[5.5rem]" />
        </div>
        <div className="flex items-center gap-3 px-3 py-2.5">
          <span className="grid h-8 w-8 shrink-0 place-items-center overflow-hidden rounded-[9px] bg-canvas ring-1 ring-white/10">
            <LogoMark size={32} />
          </span>
          <span className="min-w-0 flex-1 text-callout font-semibold text-ink">
            {os === "ios" ? "Allow Notifications" : "All JaxSquares notifications"}
          </span>
          <span className="relative">
            <TapHint />
            <span className="jxn-switch" />
          </span>
        </div>
      </div>
    </div>
  );
}

/** A browser address bar with the site-settings button lit and Notifications set to Allow. */
export function BrowserArt({ className }: { className?: string }) {
  return (
    <div aria-hidden className={cx("relative px-2 pt-8", className)}>
      <div className="jxn-toolbar !justify-start gap-2.5 !px-3">
        <span className="jxn-share-lit !h-9 !w-9">
          <TapHint />
          <TuneGlyph size={19} />
        </span>
        <span className="min-w-0 flex-1 truncate rounded-full bg-white/6 px-3 py-1.5 text-footnote text-ink-muted">jaxsquares.com</span>
      </div>
      <div className="relative z-[1] mx-3 -mt-1 flex items-center gap-2.5 rounded-2xl bg-surface-4 px-3 py-2.5 shadow-float ring-1 ring-inset ring-white/8">
        <BellIcon size={17} className="text-ink-muted" />
        <span className="flex-1 text-footnote font-semibold text-ink">Notifications</span>
        <span className="rounded-lg bg-brand-400 px-2.5 py-1 text-caption font-extrabold text-ink-inverse">Allow</span>
      </div>
    </div>
  );
}

const STEP_ICONS: Record<Exclude<BlockedKind, "install">, ReactNode[]> = {
  "ios-settings": [
    <GearGlyph size={24} className="text-ink" key="g" />,
    <BellIcon size={23} className="text-brand-300" key="b" />,
    <ToggleGlyph size={26} className="text-brand-300" key="t" />,
  ],
  "android-settings": [
    <GearGlyph size={24} className="text-ink" key="g" />,
    <BellIcon size={23} className="text-brand-300" key="b" />,
    <ToggleGlyph size={26} className="text-brand-300" key="t" />,
  ],
  browser: [
    <TuneGlyph size={24} className="text-brand-300" key="u" />,
    <GearGlyph size={24} className="text-ink" key="g" />,
    <ToggleGlyph size={26} className="text-brand-300" key="t" />,
  ],
};

/**
 * Notifications were blocked: the illustrated fix for this platform. An iPhone
 * Safari tab gets the Home Screen guide (that's the real reason there).
 */
export function BlockedGuide({ help }: { help?: BlockedHelp }) {
  const h = help ?? blockedHelp(detectHelpEnv());
  if (h.kind === "install") return <InstallGuide />;
  const icons = STEP_ICONS[h.kind];
  return (
    <div>
      {h.kind === "browser" ? <BrowserArt className="mb-5" /> : <SettingsArt os={h.kind === "ios-settings" ? "ios" : "android"} className="mb-5" />}
      <ol className="flex flex-col gap-4" aria-label="Turn notifications back on">
        {h.steps.map((step, i) => (
          <Step key={step} n={i + 1} visual={icons[i]}>
            {step}
          </Step>
        ))}
      </ol>
    </div>
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
