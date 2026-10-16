import type { CapacitorConfig } from "@capacitor/cli";

// Native shell for the iPhone app (Android later via `npx cap add android`).
// The app bundles the built SPA from dist/client and talks to the production API
// through VITE_API_BASE, so the WebView never loads a remote page.

// pitch-950, the app background: no white flash between launch screen and first paint.
const BACKGROUND = "#060a16";

const config: CapacitorConfig = {
  appId: "com.jaxsquares.app",
  appName: "JaxSquares",
  webDir: "dist/client",
  backgroundColor: BACKGROUND,
  // Plugins compiled into the native projects. @capacitor/push-notifications is
  // in node_modules but deliberately left out: both it and
  // @capacitor-firebase/messaging (used by src/lib/push.ts) claim iOS's
  // notification routing, and the last one loaded wins, which would swallow
  // notification taps. Add any new Capacitor plugin here or it won't be built in.
  includePlugins: [
    "@capacitor-firebase/messaging",
    "@capacitor/app",
    "@capacitor/haptics",
    "@capacitor/preferences",
    "@capacitor/share",
    "@capacitor/splash-screen",
    "@capacitor/status-bar",
    "@capgo/native-purchases",
  ],
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
