import type { CapacitorConfig } from "@capacitor/cli";

// Native shell for the iPhone app (Android later via `npx cap add android`).
// The app bundles the built SPA from dist/client and talks to the production API
// through VITE_API_BASE, so the WebView never loads a remote page.

// pitch-950 (--color-canvas), the app background: no flash between the launch screen and first paint.
const BACKGROUND = "#060c09";

const config: CapacitorConfig = {
  appId: "com.jaxsquares.app",
  appName: "JaxSquares",
  webDir: "dist/client",
  backgroundColor: BACKGROUND,
  // Every Capacitor plugin in package.json is compiled in. Push goes through
  // @capacitor-firebase/messaging (src/lib/push.ts); don't add
  // @capacitor/push-notifications next to it: both claim iOS's notification
  // routing, the last one loaded wins, and notification taps get swallowed.
  server: {
    // Android's WebView origin becomes https://localhost so secure-context APIs
    // (clipboard, crypto.randomUUID) behave like the web app.
    androidScheme: "https",
  },
  ios: {
    // The page uses viewport-fit=cover and pads itself with env(safe-area-inset-*),
    // so the WebView must run edge to edge under the status bar and home indicator.
    contentInset: "never",
    scrollEnabled: true,
    backgroundColor: BACKGROUND,
    // Long-pressing a board link should not pop a Safari preview.
    allowsLinkPreview: false,
    preferredContentMode: "mobile",
  },
  android: {
    backgroundColor: BACKGROUND,
  },
  plugins: {
    SplashScreen: {
      // initNative() hides it as soon as React has painted; auto-hide is only the
      // safety net so a start-up error can never leave the app stuck on the splash.
      launchAutoHide: true,
      launchShowDuration: 2500,
      backgroundColor: BACKGROUND,
      showSpinner: false,
      launchFadeOutDuration: 200,
      androidScaleType: "CENTER_CROP",
      splashFullScreen: false,
      splashImmersive: false,
    },
    StatusBar: {
      // Light text over the dark pitch background, drawn over the WebView.
      style: "DARK",
      overlaysWebView: true,
      // Only used if the bar ever stops overlaying (Android); matches the canvas.
      backgroundColor: BACKGROUND,
    },
    FirebaseMessaging: {
      presentationOptions: ["badge", "sound", "alert"],
    },
    NativePurchases: {
      // StoreKit transactions stay open until the server has verified them, so a
      // purchase interrupted mid-way is recovered on next launch (docs/payments.md).
      autoFinishTransactions: false,
    },
  },
  experimental: {
    ios: {
      spm: {
        // Avoids a SwiftPM package identity collision between the Firebase plugin
        // and firebase-ios-sdk (capawesome-team/capacitor-firebase#959).
        packageOptions: {
          "@capacitor-firebase/messaging": { symlink: true },
        },
      },
    },
  },
};

export default config;
