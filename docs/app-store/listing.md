# App Store listing (draft)

This is the copy and answers to enter in App Store Connect for the first
JaxSquares iPhone release. The build steps are in `docs/ios.md`.

**Hard rule for every field below:** no money between players. Don't use
"bet", "wager", "gamble", "pot", "buy-in", "payout" or "odds", and don't use
prices per square. The only purchase is the host paying JaxSquares to create a
board.

**Trademark rule:** keep "Super Bowl" and "NFL", and team names and logos, out of
the name, subtitle, keywords, description and screenshots. The NFL enforces
these marks, and App Review rejects unlicensed use (Guideline 5.2.1). Say "the
big game" or "game day" instead.

## App information

| Field | Value | Limit |
|---|---|---|
| Name | **JaxSquares: Football Squares** (fallback if taken: **JaxSquares**) | 30 (28 used) |
| Subtitle | **Game-day squares with friends** | 30 (29 used) |
| Bundle ID | `com.jaxsquares.app` | |
| SKU | `jaxsquares-ios` | |
| Primary category | **Sports** | |
| Secondary category | **Entertainment** | |
| Price | Free (board creation is an in-app purchase) | |
| In-app purchase | `com.jaxsquares.app.board`: Consumable, "Squares board", $4.99 | |
| Copyright | `2026 JaxSquares` | |
| Availability | United States to start. Add other countries once the copy is checked for each. | |
| Devices | iPhone only, so no iPad screenshots are needed | |

### Promotional text (170 max, 149 used; can be changed without a new build)

> Game day is better with a board. Spin up squares in seconds, drop one link in
> the group chat, and watch every score light up live. No sign-up needed.

### Description (4000 max)

> Football squares, done right.
>
> JaxSquares turns any game into a party for the whole group chat. Make a
> board, share one link, and everyone grabs their squares from their phone.
> Nobody needs to sign up or download anything to join.
>
> HOW IT WORKS
> • Make a board in seconds: pick the matchup, name it, and choose how it plays.
> • Share one link. Friends tap it, pick a name and a color, and claim squares.
> • Lock the board and the numbers drop: a fresh, random draw for every board.
> • Follow along live. Scores update on their own for linked games, and the
> winning square lights up the moment a quarter ends.
>
> BUILT FOR GAME DAY
> • Live boards. Every claim, score and winner shows up for everyone instantly.
> • Real-time scores. Link your board to the actual game and stop typing scores
> in by hand.
> • Alerts that matter. Get a notification when the numbers drop, when the game
> starts and when your square hits.
> • Your board, your rules. Quarters, halves, final only, or every score. Classic
> 10×10 or quick 5×5. Reverse winners. Fresh numbers each quarter.
> • Bragging rights. Add a note for each quarter, like "Loser buys wings", and
> let the trash talk begin.
> • Haptics, confetti and a winner's glow. Hitting your square should feel
> amazing.
>
> MADE FOR FRIENDS, NOT STRANGERS
> Boards are private to the people you share the link with. There are no
> accounts, no ads and no tracking. JaxSquares is played for fun and bragging
> rights: players never pay to join, and no money changes hands in the app. The
> only purchase is a one-time fee for the host to create a board.
>
> Perfect for watch parties, office game days, family get-togethers, fantasy
> leagues and tailgates.

### Keywords (100 max, 94 used; comma-separated, no spaces after commas)

```
grid,party,game day,big game,score,quarter,office,family,group,tailgate,playoff,college,league
```

Words already in the name and subtitle ("JaxSquares", "football", "squares",
"friends") are indexed anyway, so they aren't repeated. Leave out "pool",
"bet" and "odds". They signal gambling, and App Review reads keywords.

### URLs

| Field | URL | Plan |
|---|---|---|
| Support URL (required) | `https://jaxsquares.com/support` | Live: `src/pages/Support.tsx` |
| Privacy Policy URL (required) | `https://jaxsquares.com/privacy` | Live: `src/pages/Privacy.tsx`, from `docs/app-store/privacy-policy.md` |
| Marketing URL (optional) | `https://jaxsquares.com` | Exists |

All three pages are SPA routes in `src/App.tsx`, next to `/terms`
(`src/pages/Terms.tsx`). The Worker serves `index.html` for any non-API path,
so the URLs work on a direct load, which is what App Review does.

- **Support page.** Email button, plus five FAQs: joining a board, what it
  costs, lost host access, a paid board that isn't open yet, and
  notifications. It links to Privacy and Terms.
- **Terms.** They say JaxSquares is a free-to-play game board for friends:
  - no wagering
  - no money handled between players
  - prize notes are informal notes between friends
  - the board creation fee is non-refundable, except where the law or the
    platform's rules require a refund
- **Contact address.** `support@jaxsquares.com` is a placeholder in all three
  pages and in the privacy policy. Set up the mailbox, or change the
  `SUPPORT_EMAIL` constant in each page, before you submit.

## Age rating questionnaire

Answer the questions as follows. Apple's wording changes from time to time, so
match each answer by meaning.

| Question | Answer | Why |
|---|---|---|
| Parental controls / age assurance | No | |
| Unrestricted web access | No | The WebView only loads the bundled app. Links to other hosts open in Safari. |
| User-generated content | Yes | Board names, display names and prize notes are visible to the people in that board. Boards are private: there is no public feed, no search and no strangers. |
| Messaging and chat | No | |
| Advertising | No | |
| Cartoon/fantasy violence, realistic violence, graphic violence, guns or weapons | None | |
| Profanity or crude humor | None | |
| Mature/suggestive themes, sexual content or nudity, graphic sexual content | None | |
| Horror/fear themes | None | |
| Alcohol, tobacco or drug use or references | None | |
| Medical or treatment information; health or wellness topics | None | |
| **Simulated gambling** | **None** | There are no casino mechanics, chips, virtual currency, odds or wagers. Squares is a random-number grid game that friends follow alongside a real game. |
| **Contests** | **No** | JaxSquares doesn't run, sponsor or prize any contest or sweepstakes. A host can type a free-text note per period ("Loser buys wings") for their own friends. The app never collects, holds or pays out anything. |
| **Gambling** (real-money gaming) | **No** | No money moves between players: no entry fees, pots, payouts or prices per square. |
| Loot boxes | No | The in-app purchase creates one board. It doesn't buy randomized items or a chance to win anything. |

The expected rating is **4+**. If the user-generated-content answer raises it,
accept whatever Apple computes; don't change the answers.

### App Review notes (paste into "Notes" under App Review Information)

> JaxSquares is a free-to-play football squares game for friends. There is no
> gambling: players never pay to join, squares are never sold, and the app
> never collects, holds or distributes money or prizes. Nothing of value moves
> between players through JaxSquares. The only purchase is a consumable in-app purchase
> (com.jaxsquares.app.board) that the host buys to create a board. It unlocks
> that one board and does not buy any chance to win anything. A host may add
> an optional free-text note per quarter (e.g. "Loser buys wings"). This is
> shown as plain text and the app takes no part in it.
>
> No account or login is needed. To review:
> 1) Tap "New board", choose teams and a format, and complete the purchase with
> the sandbox account.
> 2) Tap Share to see the invite link. Open it on a second device, or claim
> squares yourself.
> 3) As host, tap Lock to draw the numbers, then enter a score for Q1 to see
> the winning square.
> A ready-made board with players is at https://jaxsquares.com/g/<DEMO_ID>.
> Universal links: https://jaxsquares.com/g/<id> opens the app.
> Purchases are verified with Apple on our server before the transaction is
> finished. If a purchase is interrupted, the app completes it the next time
> it opens.

Before you submit, create the demo board on production. Fill it with a few
players, then paste its id over `<DEMO_ID>`.

## App Privacy ("nutrition label")

**Tracking: No.** There are no ad SDKs, no IDFA, no cross-app tracking and no
data brokers, so the app needs no App Tracking Transparency prompt.

**Data collected.** Every type below is used only for App Functionality.
Linked-to-you is answered **Yes** for all of them, and that is the cautious
answer. There are no accounts, but the random device id ties a person's display
name, boards and purchases together on the server.

| Apple category → type | What it is | Why |
|---|---|---|
| Identifiers → **Device ID** | A random id the app generates on first launch (not IDFA or IDFV). Also the push token (FCM/APNs). | Recognizes your squares and boards and sends your notifications. |
| Contact Info → **Name** | The display name you type. It can be a nickname. | Shows on your squares to the others in the board. |
| User Content → **Other User Content** | Board names, prize notes, scores a host enters, emoji/color choice. | The game itself. |
| Purchases → **Purchase History** | The App Store transaction id and amount for each board you create. | Unlocks the board you paid for and stops one purchase from being used twice. |

**Not collected:**

- Email, phone, physical address
- Precise or coarse location
- Contacts, photos, health, financial info
- Payment card data: Apple handles IAP, and the iOS app never shows Stripe
- Browsing history, search history
- Usage analytics: there is no analytics SDK, and Firebase is included only
  for Cloud Messaging
- Crash data
- Advertising data

The Worker's request logs (Cloudflare) are operational and short-lived, and
they're never used to work out location, so they aren't a declared data type.
**Check this answer with whoever owns legal before submitting.**

`ios/App/App/PrivacyInfo.xcprivacy` declares the same four types. Keep the two
in sync.

## Build facts behind these answers

Check these still hold before each submission. Details are in `docs/ios.md`.

- **Push.** Notifications go through `@capacitor-firebase/messaging` (Firebase
  Cloud Messaging) and nothing else. `@capacitor/push-notifications` was
  removed from the project. Firebase is used only for messaging, so the
  "no analytics" answer stands.
- **Badge.** Each push sets the icon badge to the device's unread count, and
  opening the app clears it.
- **In-App Purchase.** Transactions aren't finished automatically
  (`autoFinishTransactions: false`). The Worker verifies each one with Apple,
  and the app finishes it only after that. A purchase interrupted mid-way is
  completed on the next launch, so a host is never charged without getting a
  board.
- **Icon and colors.** The App Store icon is the 3x3 squares board: volt tiles
  (`#c6f91f` / `#aee000`) on the night-turf canvas (`#060c09`), with the
  winning square lit gold (`#ffc233`). It's rendered by `npm run brand`.

## Content rights

- "Does your app contain, show, or access third-party content?" **Yes.** It
  shows live game schedules and scores from a sports data provider.
- **Risk:** `worker/scores` uses ESPN's public site API. That API is
  undocumented and has no published license for commercial use. Before launch,
  either confirm the terms or switch to a licensed feed (e.g. SportsDataIO or
  Sportradar). The provider sits behind `fetchLiveForEvent`, so a swap is
  contained to that module.
- Team names appear only as plain text facts about the matchup. There are no
  logos.

## Screenshots plan

- **Required:** 6.9" iPhone at **1320 × 2868** portrait (1290 × 2796 is also
  accepted). Apple scales these down for smaller iPhones.
- **Count:** 6 to 8 screenshots. No iPad screenshots, because the app is
  iPhone-only.
- **Teams:** use fictional teams with made-up colors, e.g. "Harbor Hawks" vs
  "Granite Bears". No NFL or college marks.
- **Look:**
  - The app's night-turf canvas (`#060c09`) with the soft floodlight glow from
    the top corners, like `public/og-image.png`.
  - A big headline in the display font (Bricolage Grotesque ExtraBold), white
    with one word in volt (`#c6f91f`). Use trophy gold (`#ffc233`) only for
    wins.
  - The device frame or a full-bleed UI crop below.

| # | Headline | Shows |
|---|---|---|
| 1 | **Football squares, live.** | A full 10×10 board mid-game. The winning square glows gold, with the score bug "Q2 8:41". |
| 2 | **Tap. Claim. Done.** | Claiming squares: several in your color, the haptic "pop" state, and the squares-left counter. |
| 3 | **One link. No sign-up.** | The share sheet over the board, and an iMessage bubble with the invite link preview (`og-image.png`). |
| 4 | **The numbers drop.** | The lock moment: digits revealed across the top and side, mid-animation. |
| 5 | **Scores update themselves.** | A board linked to a real game, with the live status pill and per-quarter results. |
| 6 | **Know the second you hit.** | The lock-screen push "Your square hits! Q1: Hawks 7, Bears 3" over confetti on the board. |
| 7 | **Your board, your rules.** | Create flow: quarters / halves / final / every score, 10×10 or 5×5, reverse, fresh numbers. |
| 8 | **All your boards, one place.** | Dashboard with hosted and joined boards, live and final. |

**How to capture.** Use real UI with seeded data, never mockups.

- **Native:** run the app on the iPhone 17 Pro Max simulator, then
  `xcrun simctl io booted screenshot shot.png`.
- **Web build:** Playwright at a 440 × 956 viewport with `deviceScaleFactor: 3`
  gives 1320 × 2868.
- Seed the boards through the API. Turn off the status bar clock with
  `xcrun simctl status_bar booted override --time 9:41`.
- Frame and caption the shots with a small HTML template rendered by
  Playwright, the same way `scripts/brand/og.ts` renders the link preview.

**App preview video (optional, 15–30 s).** Record the simulator with
`xcrun simctl io booted recordVideo`:

1. Create a board.
2. Share it.
3. A friend claims squares.
4. Lock and the numbers drop.
5. A score comes in and the winner fires confetti.

## What's New (first release)

> Welcome to JaxSquares! Make a board, share the link, and play football squares
> live with your friends.
