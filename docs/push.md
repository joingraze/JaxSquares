# Push notifications

JaxSquares sends a push when something happens on a board you're in. Two channels:

- **Web push** (VAPID) for browsers and for iPhone/iPad home-screen web apps
  (iOS/iPadOS 16.4+).
- **FCM** (Firebase Cloud Messaging HTTP v1) for the native iOS app (FCM hands it
  to APNs) and, later, Android.

Each channel turns on when its secrets are set and stays silently off otherwise.
No pushes is a supported state, so local dev needs nothing.

## What gets sent

The board name is the notification title. Bodies are short and never mention money.
Tapping one opens `/g/<id>`.

| Event | Who | Body |
|---|---|---|
| Numbers drawn | everyone on the board | 🔢 Numbers are in. Find your squares. |
| Kickoff (linked boards) | everyone | 🏈 Kickoff! The board is live. *(or "Numbers are in…" when kickoff drew them; only one push goes out)* |
| A square hits | the winner | 🎉 Your square hit at Half! 🏆 *host's prize note, if any* |
| | everyone else | Jax's square hit at Half. |
| Last period | everyone else | 🏁 Jax's square hit at the Final. See who won each quarter. *(this replaces the separate "final" push)* |
| Board full | host | 🔥 Your board is full. Time to draw numbers. |
| Someone joins | host | 🦊 Sam joined your board. 8 players in. *(silent, and replaces the previous join notification)* |
| Game over | everyone | 🏁 That's a wrap. See who won each quarter. |

- Whoever caused an event (for example the host who drew numbers) isn't notified
  about it.
- Anyone can mute a single board from that board (`POST /api/games/:id/mute`,
  read back with `GET /api/games/:id/mute`).
- Join notifications are silent: on iOS they are passive (no sound, screen stays
  dark), and on Android they go to a low-importance "Board activity" channel. Game
  moments go to the "Game updates" channel.
- A newer push about the same thing (a corrected score, say) replaces the older one
  on the device: web `tag`, APNs `apns-collapse-id`, Android `tag`. iOS groups each
  board's notifications in its own thread.
- Badge: each device counts the pushes it has had since the app was last opened.
  Opening the app re-registers the device, which sets that count back to zero.
  The native app also re-registers on every resume (`onAppResume` →
  `syncPush(true)`), and the web app every time it comes back and clears its
  badge (`visibilitychange` → `clearAppBadge()` + `syncPush(true)`), so the
  server's count matches the badge that was just cleared.
- "Turn off on this device" in Profile calls `disablePush()`: the device is
  unregistered and a local flag (`isPushOff()`) stops the silent re-sync from
  registering it again while the OS permission is still granted. The device
  also unsubscribes itself (`sub.unsubscribe()` / `deleteToken()`) even when the
  unregister request fails, so turning off works offline: the dead endpoint or
  token answers 404/410 or `UNREGISTERED` on the next send and the server
  deletes it. Only if both fail does `disablePush()` reject, leaving it on. `enablePush()`
  clears the flag. In the native app the flag is mirrored to Capacitor
  Preferences (`setStored`/`getStored` in `src/lib/native.ts`), because iOS can
  clear a WebView's localStorage; `hydratePushOff()` restores it before any
  re-sync, and a rotated FCM token is ignored while the flag is set.

### Who an event is about (ids and `actor`)

Every id in a `NotifyEvent` is a **public player id** (`Player.id`, never a
clientId): winner `playerIds` and `actor`. Push turns them into devices with
`getMembers()`, the one server-only place that pairs a public id with its
clientId.

`actor` is whoever caused the event, and that player is not notified about it.
Core sets it on host actions: `numbers-drawn` (`POST /lock`), `final`
(`POST /final`, or a typed-in Final score), `player-joined` (the joiner) and
`board-full` (whoever claimed the last square, so a host filling their own
board isn't pushed about it).
`winner` never has an actor, so you hear about your own square even when you
typed the score. Events from live scores (kickoff, auto-lock, winners) have none.

## In the app: asking, settings and live alerts

Client code lives in `src/features/notifications/`.

**The ask** (`NotifyPrompt`) is a bottom sheet with a preview of the pushes you'd
actually get, built from the board it's about (`askCopy.ts`):

| `trigger` | When | Pitch and preview |
|---|---|---|
| `claimed` | right after your first claim (the board opens it ~1.2 s in; it waits another `CONFETTI_SETTLE_MS` so it doesn't land on the confetti) | your board, your square count, and your real numbers once they're drawn |
| `created` | after a host makes a board | "Know when your crew shows up": friends joining (quietly), board full, numbers and winners |
| `joined` | after joining a board | numbers drawn, then your square hitting |
| `home` | the general ask from Home or Profile (`gameId` optional) | adapts to the board passed in: host pitch while it's open, results once drawn |

- `explicit` (a tap on a bell or a "turn on" row) always opens it and skips the
  wait. Automatic asks remember a dismissal per trigger (`prefs.ts`) and don't
  come back; turning notifications on clears every dismissal.
- Blocked (`denied`) shows the fix for the real reason (`blockedHelp()` in
  `platformHelp.ts`): an iPhone Safari tab gets the illustrated Add to Home Screen
  guide; the iOS app and Home Screen web app get a mock Settings > Notifications >
  JaxSquares row; Android gets its Settings path; other browsers get the site
  settings. "I've turned them on" (and coming back to the app) rechecks and
  finishes setting up.

**Profile** (`profile/NotificationsCard.tsx`) uses one card shell for every state
(icon, title, one-line value, one action): ask, on, off ("You'll miss: numbers
drawn on Sunday Night"), needs the Home Screen app, blocked, and not available
(taps through to where notifications do work). "Pings by board"
(`profile/BoardPings.tsx`, `profile/pings.ts`) lists boards live first, then by
kickoff, says what each will ping about next ("Next: Q3 result · you have 17
squares"), dims and tags muted boards with an Undo toast, and lists ended boards
greyed out ("Ended boards don't ping").

**Live alerts while the board is open** (`alerts.ts`, drawn by `BoardAlert.tsx`):
one alert per moment. The Final's winner, the final score and your own wins are
one summary card; your own win is flagged `banner: true` because the board's gold
banner already says it; claims and joins collapse into one running count under
the same `key`. Each alert names its subject (your avatar for your news, the
winner's for theirs, a board glyph for system news), carries the score or your
numbers as team-colored chips, and the square to jump to on tap (`cell`).
Periods always read Q1, Half, Q3, Final, the same as the board and the pushes.

## 1. Web push (VAPID)

Generate a key pair. This needs Node 18 or later and uses only WebCrypto:

```bash
node -e "crypto.subtle.generateKey({name:'ECDSA',namedCurve:'P-256'},true,['sign']).then(async k=>{const pub=Buffer.from(await crypto.subtle.exportKey('raw',k.publicKey)).toString('base64url');const {d}=await crypto.subtle.exportKey('jwk',k.privateKey);console.log('VAPID_PUBLIC_KEY='+pub+'\nVAPID_PRIVATE_KEY='+d)})"
```

Store the keys in the Worker:

```bash
npx wrangler secret put VAPID_PRIVATE_KEY      # paste the private key
npx wrangler secret put VAPID_PUBLIC_KEY       # paste the public key (it's public, but keep the pair together)
npx wrangler secret put VAPID_SUBJECT          # mailto:you@yourdomain.com (Apple rejects anything but mailto:/https:)
```

`VAPID_SUBJECT` falls back to `APP_ORIGIN` (`https://jaxsquares.com`) when it isn't set.
For local dev, put the same three values in `.dev.vars`.

`GET /api/config` returns `vapidPublicKey`. The client subscribes with that key.
While it is `null`, the app reports push as unsupported and never shows the
permission prompt.

**Rotating keys** invalidates every existing web subscription. Clients notice the
change on their next open and subscribe again with the new key. Until a device opens
the app again, it gets no pushes.

### iPhone and iPad (web)

- Requires iOS/iPadOS 16.4 or later, and the site must be **added to the Home
  Screen**. In a Safari tab, `getPushState()` returns `needs-install` so the UI can
  show "Add to Home Screen to get notifications".
- The permission prompt only appears from a tap. `enablePush()` calls
  `Notification.requestPermission()` before it awaits anything else.
- Every push shows a notification. iOS revokes push for web apps that receive
  silent pushes.

## 2. Native pushes (Firebase + APNs)

### Firebase project

1. Go to <https://console.firebase.google.com>, choose **Add project**, and call it
   something like `jaxsquares`. Analytics is optional.
2. Choose **Add app → iOS**:
   - Bundle ID: `com.jaxsquares.app` (it must match `appId` in `capacitor.config.ts`).
   - Download **GoogleService-Info.plist**.
3. Later, for Android, choose **Add app → Android** with package `com.jaxsquares.app`
   and download **google-services.json**.

### APNs auth key (once per Apple team)

1. Open <https://developer.apple.com/account/resources/authkeys/list> and create a
   key (**+**). Tick **Apple Push Notifications service (APNs)** and register it.
2. Download the `.p8` file. Apple only lets you download it once. Note the **Key ID**
   and your **Team ID**, which is shown in the top right of the developer portal.
3. In Firebase, open **Project settings → Cloud Messaging → Apple app
   configuration → APNs Authentication Key → Upload**. Provide the `.p8` file, the
   Key ID and the Team ID. One key covers both development and production builds.

### Put GoogleService-Info.plist in the iOS app

1. Run `npx cap open ios`.
2. Drag `GoogleService-Info.plist` into the **App** group, next to `Info.plist`.
   The file lands at `ios/App/App/GoogleService-Info.plist`.
3. In the dialog, tick **Copy items if needed** and make sure the **App** target is
   checked. If the file exists on disk but isn't in the target, Firebase won't
   configure and native push stays off.
4. Under **Signing & Capabilities**, check that **Push Notifications** is present.
   It is the `aps-environment` key in `App.entitlements`.
5. `AppDelegate.swift` already forwards the APNs token to Capacitor.
   `@capacitor-firebase/messaging` configures Firebase itself.
6. Only one push plugin may be installed. `@capacitor-firebase/messaging` stops
   working properly if `@capacitor/push-notifications` is installed alongside it.

For Android, put `google-services.json` in `android/app/`. Then add a monochrome
status-bar icon via the `com.google.firebase.messaging.default_notification_icon`
meta-data in `AndroidManifest.xml`. The app creates its two notification channels,
`game-updates` and `board-activity`, itself on first enable.

### Service account → `FCM_SERVICE_ACCOUNT`

The Worker authenticates to FCM HTTP v1 with a service account. It signs an RS256
JWT with WebCrypto, exchanges it at `https://oauth2.googleapis.com/token` for an
access token, and caches that token in memory for about an hour.

1. In Firebase, open **Project settings → Service accounts → Generate new private
   key**. This downloads a JSON file.
2. Store the whole file as a secret:

   ```bash
   npx wrangler secret put FCM_SERVICE_ACCOUNT < path/to/jaxsquares-firebase-adminsdk.json
   ```

   Base64 of the JSON is accepted too, if your tooling mangles newlines.
3. Delete the downloaded file. Anyone holding it can send pushes as your project.

The project id for the send URL
(`https://fcm.googleapis.com/v1/projects/<project_id>/messages:send`) comes from
that JSON.

## 3. Check it works

1. Deploy with the secrets set, then open the app and turn notifications on.
2. Send yourself a test push:

   ```bash
   curl -X POST https://jaxsquares.com/api/push/test -H "x-client-id: <your clientId>"
   # {"ok":true,"devices":1,"sent":1,"failed":0}
   ```

   Your clientId is `localStorage['jaxsquares.clientId']` in the browser console.
   The client also exposes `sendTestPush()`.
3. If something fails, run `npx wrangler tail`. Every event logs
   `push <game> <kind>: N sent, N removed, N failed`, and failures log the push
   service's reply.

## How it works (for maintainers)

- Code lives in `worker/push/`. `copy.ts` decides who gets what, `notify.ts` sends
  it, `webpush.ts` and `fcm.ts` handle the two transports, `store.ts` holds the SQL,
  `routes.ts` the HTTP API. The client side is `src/lib/push.ts` plus
  `public/sw.js`.
- Tables, from `migrations/0004_push.sql`:
  - `push_subscriptions`: one row per web endpoint or FCM token. The row keeps the
    badge count (`unread`) and `last_ok_at`.
  - `game_mutes`: per-board mutes. They are deleted along with their game.
- Cleanup: a web push answered with 404/410, or an FCM send answered with
  `UNREGISTERED`, deletes that device. Other errors keep it, because they may be
  transient or caused by our own config, and deleting every device over a bad key
  would be worse.
- A clientId keeps at most 10 devices; the oldest registration is dropped. Web
  endpoints must belong to a known browser push service (Google, Mozilla, Apple,
  Microsoft).
- `notify()` runs in `waitUntil` and never throws. Each device costs one outbound
  request, so a big board needs the Workers Paid plan: the Free plan allows only
  50 subrequests per invocation.
- Not covered by tests: delivery against the real FCM, APNs and browser push
  services. The sandbox this was built in can't reach them. Payload shapes follow
  the published docs, and signing and encryption are verified locally.
