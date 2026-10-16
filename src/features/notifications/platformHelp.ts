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
