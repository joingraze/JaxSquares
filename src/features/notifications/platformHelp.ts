// Where to switch notifications back on, per platform. Pure so it is tested;
// `detectHelpEnv()` reads the real environment.

import { isNative, platform } from "../../lib/native";

export interface HelpEnv {
  /** Native app (Capacitor) on this platform, or a browser. */
  app: "ios" | "android" | null;
  /** iPhone/iPad browser or home-screen web app. */
  ios: boolean;
  /** Running as an installed (home-screen) web app. */
  standalone: boolean;
}

export function detectHelpEnv(): HelpEnv {
  const native = isNative();
  const p = platform();
  const ua = typeof navigator === "undefined" ? "" : navigator.userAgent;
  const ios =
    /iPad|iPhone|iPod/.test(ua) || (/Macintosh/.test(ua) && typeof navigator !== "undefined" && navigator.maxTouchPoints > 1);
  let standalone = false;
  try {
    standalone =
      (navigator as Navigator & { standalone?: boolean }).standalone === true ||
      (typeof matchMedia === "function" && matchMedia("(display-mode: standalone)").matches);
  } catch {
    standalone = false;
  }
  return { app: native && p !== "web" ? p : null, ios, standalone };
}

/**
 * Why notifications are off here, and so which fix to show:
 * - "install": an iPhone Safari tab. There is no per-site switch; push needs the Home Screen app.
 * - "ios-settings": the iOS app or the Home Screen web app. Settings > Notifications > JaxSquares.
 * - "android-settings": the Android app. Settings > Apps > JaxSquares > Notifications.
 * - "browser": any other browser. The site settings behind the address bar.
 */
export type BlockedKind = "install" | "ios-settings" | "android-settings" | "browser";

export function blockedKind(env: HelpEnv): BlockedKind {
  if (env.app === "android") return "android-settings";
  if (env.app === "ios" || (env.ios && env.standalone)) return "ios-settings";
  if (env.ios) return "install";
  return "browser";
}

export interface BlockedHelp {
  kind: BlockedKind;
  /** Headline that names the real reason, e.g. "Turned off in iPhone Settings". */
  title: string;
  /** One line under it. */
  description: string;
  /** Short status for a settings row ("Off in iPhone Settings"). */
  short: string;
  steps: string[];
}

export function blockedHelp(env: HelpEnv): BlockedHelp {
  const kind = blockedKind(env);
  switch (kind) {
    case "install":
      return {
        kind,
        title: "iPhone needs JaxSquares on your Home Screen first",
        description: "Safari tabs can't get notifications. Add the app, open it, then turn them on there.",
        short: "Needs the Home Screen app",
        steps: blockedSteps(env),
      };
    case "ios-settings":
      return {
        kind,
        title: "Turned off in iPhone Settings",
        description: "One switch in Settings brings them back. We'll notice when you return.",
        short: "Off in iPhone Settings",
        steps: blockedSteps(env),
      };
    case "android-settings":
      return {
        kind,
        title: "Turned off in Android Settings",
        description: "One switch in Settings brings them back. We'll notice when you return.",
        short: "Off in Android Settings",
        steps: blockedSteps(env),
      };
    default:
      return {
        kind,
        title: "Blocked in this browser",
        description: "Allow notifications for JaxSquares in the site settings, then come back.",
        short: "Blocked in this browser",
        steps: blockedSteps(env),
      };
  }
}

/** Steps to re-enable notifications that were blocked in system or browser settings. */
export function blockedSteps(env: HelpEnv): string[] {
  if (env.app === "android") {
    return ["Open Settings, then Apps", "Tap JaxSquares, then Notifications", "Turn notifications on"];
  }
  if (env.app === "ios" || (env.ios && env.standalone)) {
    return ["Open the Settings app", "Tap Notifications, then JaxSquares", "Turn on Allow Notifications"];
  }
  if (env.ios) {
    // Safari tab: there is no per-site switch; push needs the home-screen app.
    return ["Add JaxSquares to your Home Screen", "Open it from there", "Turn notifications on when asked"];
  }
  return [
    "Tap the icon at the left of the web address",
    "Open Site settings (or Permissions)",
    "Set Notifications to Allow, then reload",
  ];
}
