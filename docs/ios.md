# iPhone app (Capacitor)

The iOS app is a native shell around the same React app that runs at
jaxsquares.com. Capacitor bundles the built SPA (`dist/client`) into the app,
and the app calls the production API at `VITE_API_BASE`. Board links
(`https://jaxsquares.com/g/<id>`) open the app when it is installed and the web
app when it isn't.

| | |
|---|---|
| Bundle ID | `com.jaxsquares.app` |
| Display name | JaxSquares |
| Xcode project | `ios/App/App.xcodeproj` (Swift Package Manager, no CocoaPods) |
| Minimum iOS | 15.0 |
| Devices | iPhone only, portrait only (iPads run it in iPhone mode) |
| Capacitor | 8.5 |
| Plugins | app, haptics, preferences, share, splash-screen, status-bar, `@capacitor-firebase/messaging` (push), `@capgo/native-purchases` (IAP) |
| Background | `#060c09` (pitch-950, `--color-canvas`) everywhere: WebView, launch screen, splash, status bar |

## What's already configured

The repo already contains these, so don't redo them in Xcode:

- **`capacitor.config.ts`** sets the app id and name and `webDir: dist/client`.
  - The WebView runs edge to edge (`contentInset: never`) and disables link
    previews.
  - `#060c09`, the app's night-turf canvas, is the background for the WebView,
    the splash screen and the status bar, so nothing flashes between the launch
    screen and the first paint. `index.html` paints the same color inline.
  - The splash screen is hidden by `initNative()` once React paints; auto-hide
    after 2.5 s is only a safety net.
  - `NativePurchases.autoFinishTransactions = false`. A StoreKit transaction
    stays open until the Worker has verified it with Apple, and only then does
    `src/lib/checkout.ts` finish it. If the app dies mid-purchase, the
    transaction is still open on the next launch, and `watchIAPPurchases()`
    (started on iOS from `src/App.tsx`) confirms it at launch and on every
    resume, and redeems Ask to Buy approvals as StoreKit delivers them
    (`transactionUpdated`). See `docs/payments.md`.
  - There is no `includePlugins` list: every Capacitor plugin in `package.json`
    is compiled in. Push uses `@capacitor-firebase/messaging` only.
    `@capacitor/push-notifications` was uninstalled and must not come back:
    both plugins claim iOS's notification routing, the last one loaded wins,
    and notification taps get swallowed.
- **`ios/App/App/Info.plist`** contains:
  - Display name.
  - The `jaxsquares://` URL scheme.
  - `UIBackgroundModes = remote-notification`.
  - `ITSAppUsesNonExemptEncryption = false`, so no export compliance question
    comes up on each upload.
  - Portrait only.
  - Dark interface style, so share sheets and alerts match the app.
  - Light status bar text during launch.
  - `arm64`.
- **`ios/App/App/App.entitlements`** contains `aps-environment` (Push
  Notifications) and `com.apple.developer.associated-domains` =
  `applinks:jaxsquares.com`. The project wires it in through
  `CODE_SIGN_ENTITLEMENTS`.
- **`ios/App/App/PrivacyInfo.xcprivacy`** is the privacy manifest. It declares
  no tracking, the collected data listed in `docs/app-store/listing.md`, and
  UserDefaults access (reason `CA92.1`, used by Preferences).
- **`AppDelegate.swift`** forwards the APNs device token, registration errors
  and background pushes to `@capacitor-firebase/messaging`.
- **`SceneDelegate.swift`** (Capacitor template) forwards universal links and
  `jaxsquares://` URLs. It also clears the app icon badge whenever the app
  becomes active (`sceneDidBecomeActive`): `setBadgeCount(0)` on iOS 16+,
  `applicationIconBadgeNumber = 0` on iOS 15. The server keeps its own count
  per device and resets it when the app re-syncs push on open.
- **Assets.** The app icon (`AppIcon-512@2x.png`, 1024 px, opaque) and the
  launch image (`Splash.imageset`, at @1x, @2x and @3x) are rendered by
  `scripts/brand/generate.ts`, which also writes the canvas color into
  `LaunchScreen.storyboard`. See "Brand assets" below.

The project was generated on Linux with
`npx cap add ios --packagemanager SPM`. That needs no CocoaPods. Xcode resolves
the Swift packages, including Capacitor and the Firebase iOS SDK, the first time
you open the project.

## One-time Mac setup

1. Install Xcode 26 or later from the App Store. Since April 2026, App Store
   Connect only accepts builds made with the iOS 26 SDK. Open it once to install the iOS platform, then run
   `sudo xcode-select -s /Applications/Xcode.app`.
2. Install Node 22 or later. `node -v` should print v22 or higher.
3. Join the Apple Developer Program. Your account needs the Admin or App Manager
   role in App Store Connect.
4. Clone the repo and run `npm ci`.

## Build and run

```bash
# 1. Build the web app. The native app must call the production API.
VITE_API_BASE=https://jaxsquares.com npm run build

# 2. Copy dist/client into the app and regenerate the native plugin list.
npx cap sync ios

# 3. Open Xcode (ios/App/App.xcodeproj).
npx cap open ios
```

`npm run ios` does all three steps.

Run step 2 after every web build, every plugin install and every edit to
`capacitor.config.ts`. It also recreates three gitignored things:
`ios/App/App/public`, `ios/App/App/capacitor.config.json` and
`ios/App/CapApp-SPM/symlinks/`.

In Xcode:

1. Select the **App** target → **Signing & Capabilities**.
2. Choose your **Team** and keep **Automatically manage signing** on.
   - Xcode registers `com.jaxsquares.app`.
   - Because of the entitlements file, Xcode turns on Push Notifications and
     Associated Domains for the App ID.
   - In-App Purchase needs no entitlement.
3. Check that the capabilities list shows these three entries. Don't add
   duplicates.
   - **Push Notifications**
   - **Associated Domains** containing `applinks:jaxsquares.com`
   - **Background Modes** with **Remote notifications** ticked
4. Pick an iPhone simulator or a plugged-in device and press **Run**.

Command-line alternative: `npx cap run ios --target <id>`. Use
`npx cap run ios --list` to list devices.

### Live reload against the dev server

```bash
npm run dev -- --host                          # Vite on 0.0.0.0:5173
npx cap run ios -l --host <your-mac-LAN-IP> --port 5173
```

This sets `server.url` for that run only, so the WebView loads your dev server.
Don't commit a `server.url`.

## Push notifications

The full Firebase and APNs setup is in `docs/push.md`. The iOS-specific parts:

1. Create an APNs auth key (`.p8`) and upload it to Firebase.
2. Add `GoogleService-Info.plist` to `ios/App/App/`.
   - In Xcode, drag it into the App group and tick the App target.
   - Without it, the Firebase plugin logs "Firebase was not configured" and
     native push stays off. The app still runs.
3. Push only works on a real device; the simulator has no APNs token.
4. The `aps-environment` entitlement says `development`. When you export an App
   Store or TestFlight build, Xcode switches it to `production`, so leave it
   as is.
5. Push goes through `@capacitor-firebase/messaging` only (`src/lib/push.ts`).
   `initPush()` runs once at startup, and notification taps route through
   React Router (`onNotificationTap` in `src/App.tsx`).
6. Each push carries the device's unread count as the icon badge. Opening the
   app clears the badge (`SceneDelegate.sceneDidBecomeActive`), and the app's
   push re-sync resets the server's count.

## In-App Purchase (board creation)

The full setup is in `docs/payments.md` → "Apple In-App Purchase". In App Store
Connect:

1. Sign the **Paid Apps** agreement, and finish tax and banking.
2. Create a **Consumable** product with ID `com.jaxsquares.app.board`. It must
   match `IAP_PRODUCT_ID` in `wrangler.jsonc`. Price it at $4.99.
3. Create sandbox testers (Users and Access → Sandbox). On the device, sign in
   under Settings → Developer → Sandbox Apple Account.
4. Submit the IAP product together with the first app version.

The IAP is the only payment in the app. It pays JaxSquares to create a board.
Players never pay each other or pay to join.

## Universal links (`/g/*` opens the app)

1. The Worker serves `https://jaxsquares.com/.well-known/apple-app-site-association`.
   It builds the app id from secrets:
   ```bash
   npx wrangler secret put APPLE_TEAM_ID     # 10-character Team ID, developer.apple.com → Membership
   # Optional, defaults to com.jaxsquares.app:
   npx wrangler secret put APPLE_BUNDLE_ID
   npm run deploy
   ```
   Until `APPLE_TEAM_ID` is set, the file says `TEAMID.com.jaxsquares.app`, and
   iOS silently ignores it.
2. Check the file:
   ```bash
   curl -si https://jaxsquares.com/.well-known/apple-app-site-association
   # 200, content-type application/json, no redirect,
   # "appIDs": ["<TEAMID>.com.jaxsquares.app"], components "/g/*"
   ```
   Apple fetches the file through its CDN, which caches it for up to about a
   day. To see what Apple currently has:
   `curl -s https://app-site-association.cdn-apple.com/a/v1/jaxsquares.com`.
3. **Testing before the CDN catches up.**
   1. Temporarily add `applinks:jaxsquares.com?mode=developer` to
      `App.entitlements`.
   2. On the device, turn on Settings → Developer → **Associated Domains
      Development**.
   3. Remove the entry before you archive.
4. **Trying it out.**
   1. Paste `https://jaxsquares.com/g/<id>` into Notes or Messages, then tap it.
      It should open the app on that board.
   2. Typing the URL into Safari's address bar doesn't trigger universal links.
      That's expected.
   3. `jaxsquares://g/<id>` also works, from Safari or from
      `xcrun simctl openurl booted "jaxsquares://g/<id>"`.
5. In the app, `initNative({ navigate })` in `src/lib/native.ts` turns the URL
   into a path with `pathFromAppUrl` and calls React Router's `navigate`.
   - This also works on a cold start, because the App plugin keeps the URL
     until a listener attaches.
   - Links to other hosts are ignored.

## Version, archive and upload

1. Set the version under **General** → **Identity**.
   - **Version** (`MARKETING_VERSION`) is the version people see.
   - **Build** (`CURRENT_PROJECT_VERSION`) must go up with every upload.
2. Choose the **Any iOS Device (arm64)** destination, then **Product →
   Archive**.
3. In the Organizer, choose **Distribute App → App Store Connect → Upload**.
   Accept automatic signing.

The same steps from the command line:

```bash
VITE_API_BASE=https://jaxsquares.com npm run build && npx cap sync ios
xcodebuild -project ios/App/App.xcodeproj -scheme App -configuration Release \
  -destination 'generic/platform=iOS' -archivePath ios/App/build/JaxSquares.xcarchive \
  -allowProvisioningUpdates archive
# ios/App/build is gitignored.
cat > ios/App/build/ExportOptions.plist <<'EOF'
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
  <key>method</key><string>app-store-connect</string>
  <key>destination</key><string>upload</string>
  <key>signingStyle</key><string>automatic</string>
  <key>teamID</key><string>YOUR_TEAM_ID</string>
</dict></plist>
EOF
xcodebuild -exportArchive -archivePath ios/App/build/JaxSquares.xcarchive \
  -exportOptionsPlist ios/App/build/ExportOptions.plist -exportPath ios/App/build/export -allowProvisioningUpdates
```

After the upload:

1. The build appears in App Store Connect → TestFlight after processing,
   usually 5 to 30 minutes.
2. Add internal testers.
3. When you're happy, attach the build to the version and submit it for review.
   Use `docs/app-store/listing.md` for the listing, privacy and age-rating
   answers.

## Brand assets

Every icon and image comes from one SVG source:

```bash
npm run brand     # node --experimental-strip-types scripts/brand/generate.ts
```

- **The icon.** Jax's face (the `face` pose of `src/components/ui/Jax.tsx`)
  over a dark 3x3 squares board whose top right square is lit gold. The app
  icon, apple-touch and PWA icons, favicon, launch image, link-preview lockup
  and Android adaptive foreground all use it. The favicon drops the board and
  keeps his face and the gold square so it reads at 16 px.
- **The mark.** The same design as the in-app `LogoMark`
  (`src/components/ui/Logo.tsx`): a 3x3 squares board with the winning square,
  row 2 column 3, lit gold. `mark.svg` and the notification badge use it.
- **Colors** (from `src/index.css`):
  - canvas `#060c09` (pitch-950) and pitch `#111a15` to `#1b281f` for
    backgrounds and the icon's tiles
  - volt `#c6f91f` and `#aee000` (brand-400/500) for the mark's checkered tiles
  - trophy gold `#ffc233` (gold-400) for the lit square
  - Jax's fur colors are fixed (they're his)
  - The link preview also uses the team colors (`#3ab7ff`, `#ff66a6`), the
    player colors and live red.
- **Source files.**
  - `scripts/brand/art.ts` holds the icon, mark, favicon, badge and splash.
  - `scripts/brand/og.ts` holds the 1200×630 link preview.
- **Requirements.** The script needs the Playwright Chromium build
  (`npx playwright install chromium`, or set `CHROMIUM_PATH`). The link preview
  uses the design-system fonts from `node_modules`: Bricolage Grotesque (optical
  size 96, as in the app) for display and Figtree for body. If those aren't
  installed it falls back to Inter.
- **Outputs.**
  - Web: `public/favicon.svg`, `public/favicon.ico` (16/32/48),
    `public/apple-touch-icon.png`, `public/og-image.png`.
  - `public/icons/`: `icon-192/512`, `maskable-192/512`, `icon.svg`,
    `mark.svg`, and `badge-96`, a white monochrome badge where the lit square is
    the one at full opacity.
  - iOS: the AppIcon, the Splash image set, and the launch storyboard's
    background color.
  - Android: once `android/` exists, the launcher icons, adaptive foreground
    and background color, and splash images.
- **Checks.**
  - App Store icons must have no alpha channel. The script renders opaque PNGs
    for iOS, which you can confirm with
    `sips -g hasAlpha ios/App/App/Assets.xcassets/AppIcon.appiconset/*.png`.
  - Look at the icon at 60 px and 40 px on a busy wallpaper. Look at the link
    preview at about 300 px wide, which is its size in an iMessage bubble.

## Android (later)

Nothing in the iOS setup blocks Android. A trial `npx cap add android` against
this config succeeds. When you're ready:

1. Add the platform and its assets:
   ```bash
   VITE_API_BASE=https://jaxsquares.com npm run build
   npx cap add android
   node --experimental-strip-types scripts/brand/generate.ts   # Android icons + splash
   npx cap sync android
   ```
2. **Push.** Put `google-services.json` in `android/app/` (see `docs/push.md`).
   Point the `default_notification_icon` meta-data at a white monochrome icon;
   `public/icons/badge-96.png` is the source art.
3. **App links.** Add this intent filter to the main activity in
   `android/app/src/main/AndroidManifest.xml`:
   ```xml
   <intent-filter android:autoVerify="true">
     <action android:name="android.intent.action.VIEW" />
     <category android:name="android.intent.category.DEFAULT" />
     <category android:name="android.intent.category.BROWSABLE" />
     <data android:scheme="https" android:host="jaxsquares.com" android:pathPrefix="/g/" />
   </intent-filter>
   <intent-filter>
     <action android:name="android.intent.action.VIEW" />
     <category android:name="android.intent.category.DEFAULT" />
     <category android:name="android.intent.category.BROWSABLE" />
     <data android:scheme="jaxsquares" />
   </intent-filter>
   ```
   The Worker already serves `/.well-known/assetlinks.json`. Set
   `ANDROID_SHA256_CERT_FINGERPRINTS`, a comma-separated list, to the Play App
   Signing certificate fingerprint plus your upload key's fingerprint.
4. **Payments.** Google Play billing for board creation isn't built yet.
   `checkout.ts` would need a Play Billing path before an Android release.
