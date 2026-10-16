# App Store listing

This is the copy and the answers to enter in App Store Connect for the first
JaxSquares iPhone release. The build steps are in `docs/ios.md`. The
screenshots are generated from the real app; see `docs/app-store/README.md`.

**Hard rule for every field below:** no money between players. Don't use
"bet", "wager", "gamble", "pot", "pool", "buy-in", "payout" or "odds", and don't
show prices per square. JaxSquares is free to download. The only purchase is a
host paying once to unlock a board they create.

**Trademark rule:** keep "Super Bowl", "NFL", and real team names and logos out
of the name, subtitle, keywords, description and screenshots. The NFL enforces
these marks, and App Review rejects unlicensed use (Guideline 5.2.1). Say "the
big game", "game day" or "pro and college games" instead. The screenshots use
made-up teams (Harbor Hawks, Ridge Wolves, Bay Comets, Mesa Foxes and friends).

## App information

| Field | Value | Limit |
|---|---|---|
| Name | **JaxSquares: Football Squares** (fallback if taken: **JaxSquares**) | 30 (28 used) |
| Subtitle | **Game-day squares with friends** | 30 (29 used) |
| Bundle ID | `com.jaxsquares.app` | |
| SKU | `jaxsquares-ios` | |
| Primary category | **Sports** | |
| Secondary category | **Entertainment** | |
| Price | Free | |
| In-app purchase | `com.jaxsquares.app.board`: Consumable, "Squares board", $4.99 (details in `docs/payments.md`). It unlocks one board the host creates; joining is always free. | |
| Copyright | `2026 JaxSquares` | |
| Availability | United States to start. Add other countries once the copy is checked for each. | |
| Devices | iPhone only, so no iPad screenshots are needed | |

### Promotional text (170 max, 153 used; can be changed without a new build)

> Make a board in seconds and text one link. Friends join from the group chat
> with no download, the numbers drop live, and every score shows who's winning.

### Description (4000 max, about 2,830 used)

> Football squares for your whole crew, live on every phone.
>
> Make a board in seconds, text the link, and everyone grabs their squares from
> their own phone. Friends don't need to download anything or make an account
> to play. When the numbers drop and the scores roll in, every phone lights up
> at once.
>
> HOW IT WORKS
> • Make a board. This week's pro and college games are right there, with the
> soonest one already picked. Or type in any two teams.
> • Text the link. Friends tap it, pick a name, a color and an emoji, and
> they're in. Same room? Show a QR code or a six-character board code.
> • Tap your squares. Every pick shows up on everyone's board in real time.
> • Lock and draw. The digits 0–9 land across the top and down the side, live
> on every phone.
> • Watch it play out. The winning square lights up gold the moment each
> period ends.
>
> WHAT'S INSIDE
> • A live board. Picks, numbers, scores and winners land on every open phone
> within a second, with a scorebug and a count of who's watching.
> • Who's winning right now. See whose square the current score points at, and
> whose square one more touchdown would hand it to.
> • Live scores for linked games. Link your board to a real game and the scores
> keep themselves up to date. The numbers even draw themselves at kickoff.
> Typing in your own teams? Scores take two taps.
> • A format for every crowd. Every quarter, halftime and final, final score
> only, or a winner for every score. Classic 10×10 or quick 5×5, reverse
> winners, and fresh numbers each quarter.
> • Prize notes. Add a fun note for each period, like "Loser buys wings" or
> "Winner picks the halftime playlist."
> • All your boards on one screen. Home sorts them into Live now, Needs you,
> Up next and Final, and every card updates on its own.
> • An activity inbox. Wins, numbers drawn, friends joining and full boards
> from every board you're in, with an unread count.
> • Host tools. The board always shows your next step: invite, lock and draw,
> or enter a score. Edit the name, prize notes and square limit, pick a winner
> by hand, and run the board from a second phone with your private host link.
> • Notifications. Get pinged when the numbers are drawn, at kickoff, when your
> square hits, when your board fills up and at the final whistle. Mute any
> single board.
> • Haptics, confetti and a gold glow when your square hits.
>
> FREE TO PLAY, AND NO MONEY BETWEEN FRIENDS
> JaxSquares is free to download, and joining a board is always free. The only
> purchase is a one-time unlock for each board you host. Players never pay to
> join, squares are never sold, and no money changes hands in the app. You
> play for fun and bragging rights.
>
> PRIVATE BY DEFAULT
> A board is only for the people you share it with. There are no accounts, no
> ads and no tracking.
>
> Made for watch parties, office game days, family get-togethers, tailgates and
> the big game.

### Keywords (100 max, 99 used; comma-separated, no spaces after commas)

```
grid,party,big game,score,quarter,halftime,office,family,group chat,tailgate,playoff,college,league
```

Words already in the name and subtitle ("JaxSquares", "football", "squares",
"game-day", "friends") are indexed anyway, so they aren't repeated. Leave out
"pool", "bet" and "odds". They signal gambling, and App Review reads keywords.

### What's New (first release)

> Welcome to JaxSquares! Make a board in seconds, text the link, and play
> football squares live with your friends. The numbers drop live, linked games
> score themselves, and you'll get a ping the moment your square hits.

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
  - the board unlock is non-refundable, except where the law or the
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
| User-generated content | Yes | Board names, display names and prize notes are visible to the people in that board. Boards are private: there is no public feed, no search and no strangers. Prize notes that mention money are rejected by the server. |
| Messaging and chat | No | There is no chat. Invites are shared through the system share sheet. |
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
| Loot boxes | No | The in-app purchase unlocks one board the host creates. It doesn't buy randomized items or a chance to win anything. |

The expected rating is **4+**. If the user-generated-content answer raises it,
accept whatever Apple computes; don't change the answers.

### App Review notes (paste into "Notes" under App Review Information)

> JaxSquares is a free-to-play football squares game for friends. There is no
> gambling: players never pay to join, squares are never sold, and the app
> never collects, holds or distributes money or prizes. The only purchase is a
> consumable in-app purchase (com.jaxsquares.app.board) that a host buys to
> unlock one board they create. It doesn't buy any chance to win anything. A
> host may add an optional free-text note per period (e.g. "Loser buys
> wings"); the server rejects notes that mention money, and the app takes no
> part in them.
>
> No account or login is needed.
>
> QUICK LOOK (no purchase): open https://jaxsquares.com/g/<DEMO_ID>, or tap
> "Join with a code" on Home and enter <DEMO_CODE>. It's a board with ten
> players, drawn numbers and two scores in, so you can see the live board,
> the "right now" winner and the results. Back on Home, the bell opens the
> activity inbox. To run that board as its host from this device, open
> https://jaxsquares.com/g/<DEMO_ID>?host=<DEMO_HOST_TOKEN>.
>
> FULL FLOW (sandbox purchase):
> 1) Tap "New board". Tap "Custom" and type any two teams (scores are then
> entered by hand), or keep the pre-picked real game. Tap "Create board" and
> complete the purchase with the sandbox account. The board opens with its
> invite sheet.
> 2) "Text your crew" opens the share sheet. "Same room? Show code" shows a QR
> code and a six-character code. Open the link on a second device to join as a
> friend (it works in Safari with no install), or close the sheet, tap a few
> empty squares and tap "Claim".
> 3) Tap "Host tools", then "Lock & draw", then "Draw the numbers" (or "Lock &
> draw anyway" with only a few squares taken). The digits land on every open
> phone.
> 4) Tap the host bar's score button ("Q1 score"), enter a score and save. The
> winning square lights up and its owner gets a notification.
>
> Notifications are sent for numbers drawn, kickoff, a winning square, a full
> board and the final. Allow them when asked to see them.
> Universal links: https://jaxsquares.com/g/<id> opens the app.
> Purchases are verified with Apple on our server before the transaction is
> finished. If a purchase is interrupted, the app completes it the next time
> it opens.

Before you submit, make the demo board on production:

1. Create a board with two made-up teams and a prize note or two, and invite
   enough people (or devices) to fill most of it.
2. Lock it, enter a Q1 and a Half score, and leave it open.
3. Paste its id over `<DEMO_ID>` and its six-character code (the id in
   capitals) over `<DEMO_CODE>`.
4. On the host's phone, open Host tools → "Host from another phone" and copy
   the token from that link over `<DEMO_HOST_TOKEN>`. Anyone with the link can
   run the board, so use it only in these notes.

## App Privacy ("nutrition label")

**Tracking: No.** There are no ad SDKs, no IDFA, no cross-app tracking and no
data brokers, so the app needs no App Tracking Transparency prompt.

**Data collected.** Every type below is used only for App Functionality.
Linked-to-you is answered **Yes** for all of them, and that is the cautious
answer. There are no accounts, but the random device id ties a person's display
name, boards and purchases together on the server.

| Apple category → type | What it is | Why |
|---|---|---|
| Identifiers → **Device ID** | A random id the app generates on first launch (not IDFA or IDFV), and the push token (FCM/APNs) if notifications are on. | Recognizes your squares and boards and sends your notifications. |
| Contact Info → **Name** | The display name you type. It can be a nickname. | Shows on your squares to the others in the board. |
| User Content → **Other User Content** | Board names, prize notes, scores a host enters, your emoji and color. | The game itself. |
| Purchases → **Purchase History** | The App Store transaction id and amount for each board you unlock. | Opens the board you paid for and stops one purchase from being used twice. |

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
  Cloud Messaging) and nothing else. Firebase is used only for messaging, so
  the "no analytics" answer stands. The copy is in `worker/push/copy.ts`.
- **Badge.** Each push sets the icon badge to the device's unread count, and
  opening the app clears it.
- **In-App Purchase.** Transactions aren't finished automatically
  (`autoFinishTransactions: false`). The Worker verifies each one with Apple,
  and the app finishes it only after that. A purchase interrupted mid-way is
  completed on the next launch, so a host is never charged without getting a
  board.
- **Prize notes.** `validatePrizeNote` in `shared/formats.ts` rejects notes
  that mention money, on the server and inline in the UI.
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
- **In-app league marks.** The create screen's game picker labels its first tab
  "NFL", and the Welcome screen's demo board shows real team abbreviations.
  Neither is in the store art, but App Review sees the app itself. If a
  reviewer raises 5.2.1, rename the tab ("Pro") and use made-up teams there.

## Screenshots

Generated from the real app by `scripts/store/generate.mjs` (how to rerun:
`docs/app-store/README.md`). Upload the 6.9" set; the 6.5" set is there for
App Store Connect's older-device slot.

- `docs/app-store/screenshots/6.9/`: 1320 × 2868, 7 frames
- `docs/app-store/screenshots/6.5/`: 1242 × 2688, 7 frames
- `docs/app-store/screenshots/contact-sheet.png`: every frame at about
  search-result size, for a quick read check

| # | File | Caption | Shows |
|---|---|---|---|
| 1 | `01-make-a-board` | **Make a board in seconds.** Pick the game, tap Create. You're live. | New board: the soonest game already picked, the four formats open, the Create button. |
| 2 | `02-text-the-link` | **Text the link. No download.** Friends join from the group chat in a tap. | The invite sheet: the message and link preview friends get, "Same room? Show code", "Text your crew". |
| 3 | `03-tap-a-square` | **Tap a square. You're in.** Your color, your emoji, your squares. | A friend's half-full board with three squares picked and "Claim 3 squares". |
| 4 | `04-numbers-drawn-live` | **Numbers drawn live.** Lock the board and watch every digit land. | The number reveal just after the last digit lands, with confetti and "Your numbers". |
| 5 | `05-whos-winning` | **Know who's winning now.** Every score lights up the square that's ahead. | A live board at halftime: scorebug, the gold "You won!" banner, the "right now" card, the board. |
| 6 | `06-every-board` | **Every board, one screen.** Live scores, to-dos and finals, always fresh. | Home: Live now with your square's hit, Needs you (draw numbers, pick squares), and a Final you won. |
| 7 | `07-get-pinged` | **Get pinged when you hit.** Alerts for numbers, kickoff and every win. | The activity inbox with the "Your square hit" push banner over it, in the real push wording. |

**App preview video (optional, 15–30 s).** Record the simulator with
`xcrun simctl io booted recordVideo`, following the same story: create a
board, share it, a friend claims squares, lock and the numbers drop, a score
comes in and the winner's square glows.
