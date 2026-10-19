# Test ids (used by the floors harness in e2e/)

Keep these `data-testid`s stable; the floors measurements depend on them.

| testid | where |
|---|---|
| `new-board` | primary "create a board" call to action (home + tab bar) |
| `wizard-step` | the create flow's current step (`data-step=game\|format\|prizes\|details\|review`); the URL says the same (`/new?step=<step>`) |
| `wizard-next` | the create flow's Next (steps 1-4; "Skip for now" on prizes with nothing chosen, "Done" on a step opened from Review). `aria-disabled` with its reason above it while the step is incomplete; a tap then points at the field |
| `wizard-back` | the create flow's Back (steps 2-5): the previous step, or Review for a step opened from it |
| `review-edit` | each summary card on Review (`data-step=game\|format\|prizes\|details`): opens that step; its Next ("Done") comes back |
| `review-prizes` | Review's prizes card body (`data-state=set\|fun\|unset`; `unset` reads "Square price: not set") |
| `review-kickoff` | Review's kickoff line on a custom board ("Kicks off Sun 1:00 PM PDT" or "No set time") |
| `game-option` | each real game in the create flow's game picker; tapping one picks it and moves on to step 2 |
| `game-search` | the game picker's team search |
| `week-toggle` | each week row in the game picker (also `data-week=<season type>-<week>`, e.g. `2-7`); `aria-expanded` when open |
| `week-see-all` | "See all N games" in the lead week |
| `week-more` | "Full schedule · N more weeks" |
| `host-name` | the creator's name field on Final touches, if the create flow asks for it (a device with no name yet) |
| `board-name` | the board name field on Final touches (auto-filled from the matchup) |
| `custom-kickoff` | the kickoff card under custom teams (and in Edit board for a custom board) |
| `kickoff-day` | a one-tap kickoff day (`data-day=YYYY-MM-DD` local, `aria-pressed` when picked): Today, Tomorrow, then the week's days by name |
| `kickoff-time` | a one-tap kickoff time (`data-time=HH:MM` local, 24-hour; `aria-pressed`) |
| `kickoff-input` | the full date & time input (`datetime-local`, local time) behind "Other date & time" |
| `kickoff-none` | "No set time" (`aria-pressed` while there's none; then reads "Set a kickoff") |
| `board-kickoff` | "Kicks off Sun 1:00 PM PDT" on a board's scorebug while squares are picked |
| `custom-matchup` | the "type your own teams" option |
| `team-x-input`, `team-y-input` | custom matchup team inputs |
| `format-option` | each format preset card (also `data-format=<preset>`) |
| `format-custom` | the "Custom rules" card on the create flow's How squares win step, shown (selected) when the rules match no preset |
| `board-size-option` | How squares win: Classic 10×10 / Quick 5×5 (`data-size=100\|25`, `aria-checked`) |
| `format-reverse`, `format-fresh` | How squares win: the Reverse winners and New numbers each quarter switches |
| `rules-editor` | the rules & prizes editor (the create flow's Square price & prizes step and the host sheet's Rules & prizes view) |
| `rules-choice`, `rules-choice-option` | how prizes read: the three choices, each with `data-choice=$\|pts\|fun` (Dollars, Points, Just for fun) |
| `rules-square-price` | the square price input (after picking Dollars or Points) |
| `square-price` | the square price card (input, quick picks, and once a price is set the board's total, the budget and the suggested amounts) |
| `price-chip` | each one-tap square price (`data-price=<value>`, `aria-pressed` when it's the price; tapping the picked one clears it) |
| `board-total` | "All 100 squares: $1,000" (or "62 claimed squares: $620" in the host's editor after the draw), the board's total at the square price |
| `prize-budget` | fixed moments: "Prizes: $800 of $1,000" with left / over / adds up / "The rest, $600, to the final" (`data-status=none\|under\|exact\|over\|rest`); every score: "Score prizes come out of the $1,000 board total during the game; the final gets the rest." (`data-status=ok\|tight`) |
| `prize-estimate` | every score: "A typical game uses about $430, leaving about $570 for the final." |
| `prize-warning` | every score, when a typical game would use over 80% of the total: "A typical game would use about $27 of the $25 board total, leaving little for the final." |
| `prizes-suggest` | the Suggested amounts card: what each prize gets; "Use suggested amounts" fills them in (`aria-pressed` / "In use" when the amounts already are the suggestion) |
| `prizes-basis` | the line under it: "From the $1,000 board total. You can change any amount after." |
| `prize-split` | "Even", the suggestion's alternative on fixed-moment boards (`data-split=even`, `aria-pressed` when the amounts already match it) |
| `final-rest` | the final's row, with a square price: "The rest" / "Fixed amount" (segments `final-rest-on`, `final-rest-off`) |
| `final-rest-field` | where the final's square amount would be while it takes the rest ("The rest") |
| `every-score-options` | the every-score setups (under the create flow's Every score card, and the editor's every-score row) |
| `every-score-reverse` | "Also pay the reverse at each quarter and the final" switch |
| `every-score-reverse-amount` | create flow only: one reverse amount for every quarter-end and the final |
| `every-score-by-kind` | "Amount by score type" switch |
| `score-kind-amount` | an amount by score type (`data-kind=touchdown\|fieldGoal\|extraPoint\|twoPoint\|safety`, `data-side=square\|reverse`); kinds not set by hand follow the touchdown |
| `rule-row` | one row per moment (`data-moment=score\|q1\|q2\|q3\|final`, `data-on=true\|false`) |
| `rule-toggle` | a moment's on/off switch (inside its `rule-row`; disabled once scoring has started) |
| `rule-sides` | a moment's Square / Reverse / Both control (inside its `rule-row`) |
| `rule-amount` | an amount input (`data-moment`, `data-side=square\|reverse`) |
| `rule-note-add`, `rule-note` | "Note" / "Add note" on a moment, and its note input(s) (`data-moment`, `data-side`) |
| `rules-copy` | "Same for every quarter" under a quarter-end (`data-moment`): copies its squares and amounts to the other quarter-ends |
| `rules-preset` | the host edit view's preset chips (`data-preset=<preset>`) |
| `rules-save` | "Save rules & prizes" in the host sheet's Rules & prizes view |
| `host-rules` | the host sheet's "Rules & prizes" row (Board section) |
| `prize-lineup` | the compact square price / prize line (open board, invite landing, join sheet); opens the rules sheet. Not rendered when the host set nothing |
| `rules-open` | the "Rules & prizes" pill above the board's results; opens the rules sheet |
| `rules-sheet`, `rules-line`, `rules-price` | the read-only rules sheet's body, one line per moment (`data-moment`), and its square price pill |
| `rules-kinds` | the rules sheet's amounts by score type on the every-score line (`data-side`; each tile has `data-kind`) |
| `rules-rest` | the rules sheet's final line when its square takes the rest: "The rest of the board total, everything not won during the game" |
| `rules-edit` | host only: "Edit rules & prizes" in the rules sheet (opens the host sheet's editor) |
| `score-moment` | on boards that award every score and quarter-ends: the host score pad's "+ Score / Q1 / Half / Q3 / Final" control |
| `result-card` | each period card in the results strip (`data-card=<period key>`) |
| `result-label` | a result card's label: "Score 3 · TD · $50" (its kind part has `data-kind`), "Final · the rest", "Final · $640" |
| `result-rest` | a result card still to come that takes the rest: "$640 so far" |
| `prize-totals` | the host sheet's prize totals under Winners (boards with amounts) |
| `player-squares-value` | what a player's squares come to at the square price, on the players list while squares are picked |
| `home-invites` | Home's "Invites" section: open boards with squares left where I have none (an invite link I only opened, or a board I joined without picking) |
| `invite-card` | each card in it (`data-game=<board id>`); the whole card opens the board |
| `invite-pick` | "Pick squares" on an invite card: opens the board |
| `invite-hide` | "Not for me" on an invite I only opened (not joined): hides it from Home (drops it from the seen list) with an Undo toast |
| `create-submit` | Review's "Create board": creates the board and opens it (free; no checkout) |
| `create-fee` | the line under it: "Free to set up and invite. Free to draw with up to 5 players, $4.99 for bigger boards." (the App Store's price in the iOS app; with no price: "...; bigger boards have a host fee when you draw.") |
| `pay-confirm` | the confirm button in the checkout sheet for the host fee, opened by the host tools when the host draws (or pays ahead on a linked board), or for the Host Pass (Profile's Get, or the pass picked at the draw: "Start test pass", "Subscribe", "Subscribe · $19.99/year"); every method: test, wallet, card, App Store |
| `plan-picker`, `plan-board`, `plan-pass` | the checkout sheet's choice at the draw (`role=radiogroup`, each `role=radio` with `aria-checked`): "This board · $4.99" (the default) and "Host Pass · $19.99/year" (the App Store's prices in the iOS app). Shown where the pass is sold |
| `pass-pays-off` | under the Host Pass choice: "Pays for itself by your fifth board", worked out from the two prices this device shows (StoreKit's in the iOS app); absent when either price is unknown |
| `pass-disclosure` | the subscription disclosure beside the pass's button: name, length, price per period, auto-renews until canceled, how to cancel, Terms and Privacy links |
| `pass-signin` | "Sign in to continue" in the checkout sheet when a signed-out browser picks the Host Pass (opens `signin-sheet`, then the purchase continues) |
| `pass-card` | the Host Pass card at the top of Profile's Get sheet |
| `host-pass-note` | "Included with your Host Pass" under the draw (host bar, the Now card) on a board the host's active pass covers |
| `host-free-note` | "Free for up to 5 players" under the draw (host bar, the Now card, the lock confirm) on an unpaid board 5 or fewer players hold squares on; the draw reads "Draw the numbers · Free" |
| `host-pass-section` | Profile → Host Pass (`data-state=none\|active\|ended\|past_due\|revoked`); absent on the web when the pass isn't sold there and was never held |
| `pass-get` | Profile → Host Pass "Get the Host Pass · $19.99/year" ("Get a test pass · no charge" in test mode); goes through the sign-in gate on the web |
| `pass-status` | Profile → Host Pass status: "Active · renews Oct 19, 2027", "Ends Oct 19, 2027", "Ended …" |
| `pass-manage` | Profile → Host Pass "Manage" (Apple's subscription management in the iOS app, a Stripe Customer Portal on the web) or "End test pass" in test mode |
| `pass-restore` | Profile → Host Pass "Restore purchases" (iOS app only) |
| `invite-share` | the share-invite button in the invite sheet |
| `invite-copy` | the link preview card in the invite sheet (tap to copy) |
| `invite-code-toggle` | "Same room? Show code" toggle in the invite sheet |
| `join-name` | name input in the join sheet |
| `join-submit` | join button in the join sheet |
| `cell` | every board square, with `data-row`, `data-col`, `data-state=empty\|mine\|taken\|selected\|winner` |
| `claim-submit` | claim button in the board's action bar |
| `jax-pick` | "Let Jax pick" on an open board (next to the hint above the grid). Asks how many (`jax-count-sheet`) when more than one square is allowed, then claims that many random open squares for me (joined), or picks them and opens the join sheet (newcomer). Hidden while squares are picked by hand, at my max, or when the board is full |
| `jax-count-sheet`, `jax-count-chip`, `jax-count-confirm` | "How many squares?" for Let Jax pick: the sheet, its quick counts (`data-count`), and "Pick N squares" |
| `jax-cheer` | not a control: the Jax cheer overlay while it plays after one of my squares wins (board and Home), for screenshot harnesses |
| `host-lock` | lock board + draw numbers ("Draw the numbers · $4.99" while the host fee is due; "Draw the numbers · Free" with `host-free-note` on a board of 5 or fewer players; "Draw the numbers" with `host-pass-note` when the Host Pass covers it) |
| `host-pay-ahead` | linked boards whose host fee is due, before kickoff: "Pay now and Jax draws the numbers at kickoff" (opens the checkout sheet) |
| `board-waiting` | the board hint for players on an open board that's full, or a linked game on without its numbers: "Waiting on the host to draw the numbers." |
| `score-x`, `score-y`, `score-save` | host score entry |
| `score-quick-adds`, `score-quick-add` | the every-score pad's one-tap points (`data-play=TD\|FG\|XP\|2-PT\|Safety`: +6, +3, +1, +2, +2) for the team being typed |
| `host-open` | the host bar button that opens the host sheet |
| `host-lock-confirm` | "Draw the numbers" — actually locks, after the `host-lock` confirm step ("Draw the numbers · $4.99" while the host fee is due: opens the checkout sheet, then draws; "Draw the numbers · Free" on a board of 5 or fewer players: it just draws, the confirm saying "No host fee." with `host-free-note`; with an active Host Pass it just draws, the confirm saying "Included with your Host Pass.") |
| `reveal-close`, `reveal-done` | the number reveal (host, after the draw): the X at the top (closes it any time, even mid-shuffle) and "See the board" (pinned at the bottom once the numbers land) |
| `host-bar-action` | the host bar's next-action pill (full width, "Draw the numbers · $4.99", when it's time to draw and the host fee is due; full width "Draw the numbers · Free" with `host-free-note` on a board of 5 or fewer players; full width "Draw the numbers" with `host-pass-note` when the Host Pass covers it) |
| `notify-enable` | "Turn on notifications" in the notify sheet and on Profile |
| `notify-email-instead`, `notify-email-close` | the notify sheet after a claim, when the server has email notices (docs/email.md): "Get email instead" under the Home Screen guide and the blocked fix (opens the email step); the email step's "Not now" / "Done" |
| `board-notify`, `board-notify-sheet`, `board-notify-done` | a board's bell in its top bar (players only, when email is set up), the notification settings sheet it opens (this device's mute when notifications are on, and email), and its Close / Done |
| `email-optin` | the email opt-in ("Email me when the numbers are drawn and if I win"; `data-state=loading\|none\|pending\|confirmed\|unsubscribed\|change\|error`) |
| `email-optin-input`, `email-optin-submit` | its email field (`type=email`, 16px) and "Email me" |
| `email-optin-resend`, `email-optin-change`, `email-optin-off` | pending: "Send again"; "Change email"; "Remove this address" (pending) / "Turn off email" (confirmed) |
| `email-optin-error` | the server's reason when an action fails (a bad address, the address unsubscribed from all email, a resend too soon) |
| `email-page` | the page an email's link opens (served by the Worker, not the app; `data-state=ask\|done\|expired\|unavailable` for confirm, `ask\|board\|all\|invalid\|unavailable` for unsubscribe) |
| `email-confirm`, `email-unsubscribe-board`, `email-unsubscribe-all`, `email-page-open` | on that page: "Confirm my email", "Unsubscribe from this board", "Unsubscribe from all JaxSquares email" (also "Stop all JaxSquares email too"), "Open the board" / "Open JaxSquares" |
| `profile-edit`, `profile-name`, `look-done` | Profile hero, name field in the look sheet, its done button |
| `score-saved` | footer confirmation after a host saves a score |
| `player-remove` | host only, while squares are being picked: the remove button on another player's row (board players list and the host sheet's Players view) |
| `remove-player-confirm` | "Remove Maya" in the host sheet's remove confirm — actually removes the player |
| `cohost-invite` | host only: "Invite a co-host" in the host sheet's Co-hosts section ("They can do everything you can, except remove you."); makes a single-use link and opens "Co-host invite ready". Disabled at 3 co-hosts |
| `cohost-share` | "Share co-host link" in the host sheet's "Co-host invite ready" view (the share sheet, or copies the link) |
| `cohost-row` | each co-host in the host sheet's Co-hosts section (the host's and a co-host's view); "Maya (you)" on a co-host's own row |
| `cohost-remove`, `cohost-remove-confirm` | host only: "Remove" on a co-host's row, and "Remove as co-host" in its confirm (they stay on the board) |
| `cohost-step-down`, `cohost-step-down-confirm` | a co-host's "Step down" on their own row, and "Step down" in its confirm |
| `cohost-accept`, `cohost-decline` | the "Become a co-host of <board>?" sheet a co-host invite link (`/g/<id>?cohost=<token>`) opens: "Become a co-host" ("Join & become a co-host" for someone not on the board, which opens the join sheet first; "Try again" after a failure) and "Not now" ("Close" once the link can't be used) |
| `player-cohost` | the "Co-host" tag next to a co-host's name on a players list (the board's and the host sheet's Players view) |
| `home-cohost` | the "Co-host" tag on a Home card for a board I co-host (with the boards I host) |
| `theme-dark`, `theme-light`, `theme-system` | Profile → Appearance: the Dark / Light / System segments (saves the choice and switches at once) |
| `account-section` | Profile → Account (`data-state=signed-out\|signed-in`); absent when not signed in and no provider is set up for this platform |
| `signin-apple`, `signin-google` | the "Sign in with Apple" button and the "Sign in with Google" button (drawn in the iOS app; on the web, the box Google's own button renders into). Wherever sign-in buttons show (Profile, `signin-sheet`) |
| `account-signed-in` | the "Signed in with Apple / Google" row (email underneath) |
| `account-sign-out`, `account-sign-out-confirm` | Profile → Account "Sign out", and the confirm sheet's "Sign out" (actually signs out; the device starts fresh) |
| `account-delete`, `account-delete-sheet`, `account-delete-confirm` | "Delete account", its confirm sheet's body (what's deleted, what stays), and "Delete account" in it (actually deletes) |
| `signin-sheet` | the reusable sign-in sheet's body (`SignInSheet`: Home's card, the welcome screen) |
| `home-signin-card`, `home-signin-open`, `home-signin-dismiss` | Home's one sign-in card (a device with boards, not signed in, a provider set up), its "Sign in" (opens `signin-sheet`) and "Not now" (hides it for good on this device) |
| `welcome-signin` | "Playing on another device? Sign in" on the welcome screen (opens `signin-sheet`) |
| `board-theme-toggle` | the sun/moon button in a board's top bar: switches to light or dark (saved like the Profile choice) |
| `invite-tv`, `invite-print` | the invite sheet's "Show on TV" (opens `/g/:id/tv`) and "Print board" (opens `/g/:id/print`) |
| `host-tv` | the host sheet's hint "Hosting a watch party? Show the board on your TV." (a link to `/g/:id/tv`) |
| `tv-view` | TV mode's root (`data-phase=draft\|open\|locked\|live\|final`, `data-awake=true\|false` while the toolbar shows / has hidden itself; `data-state=empty` on the not-found / loading screen) |
| `tv-toolbar`, `tv-fullscreen`, `tv-theme`, `tv-exit` | TV mode's auto-hiding toolbar (`data-awake`), its Full screen (only where the browser can), Light / Dark (TV mode's own theme) and Exit (back to the board) |
| `tv-board`, `tv-cell` | TV mode's read-only grid (`data-drawn`, `data-final`, `data-now=live\|projected\|none`) and each square (`data-row`, `data-col`, `data-state=empty\|taken\|winner`, `data-live` on the square the score points at, `data-live-reverse` on its reverse) |
| `tv-predraw` | the line across the top of the TV grid before the draw: "Numbers get drawn when the host locks the board" |
| `tv-open`, `tv-qr`, `tv-link` | the TV panel while squares are open: the big QR code to the invite link ("Scan to grab a square") and the short link under it |
| `tv-game`, `tv-score`, `tv-score-x`, `tv-score-y`, `tv-status` | the TV panel once the numbers are drawn: the scoreboard, each team's score, and its status line ("Live · Q3 4:12", "Final", "Numbers drawn · kicks off in 2h 10m") |
| `tv-now`, `tv-now-name` | TV "Right now · Q3": who the square in play belongs to (`data-live`), or "Next score wins" with the four likeliest scores on every-score boards |
| `tv-winners`, `tv-winner`, `tv-winner-label` | TV winners so far (only whole rows that fit, "· N earlier"), each moment's row (`data-key=<period key>`) and its label as the board's result cards say it ("Q1 · $200", "Score 3 · TD · $20") |
| `tv-upcoming` | TV "Still to play": the moments to come with what each can show ("Q3 $200", "Final the rest") |
| `tv-celebrate` | the winner card over the TV board after a winner lands (`data-period`), with Jax cheering (`jax-cheer`); it goes by itself after 7 s |
| `tv-offline`, `tv-brand` | TV mode's "Offline · showing the last update" pill, and its small JaxSquares mark |
| `print-sheet` | the printed sheet (`data-mode=signup\|open\|game`, `data-amounts=true\|false`); the same element is the on-screen preview |
| `print-amounts`, `print-button` | on screen only (never printed): the "Include square price and prizes" switch (off by default; absent on a board with no price or amounts) and "Print" ("Send to a computer to print" in the native app, which shares the print link) |
| `print-cell` | each printed square (`data-row`, `data-col`, `data-winner` on a decided one): its owner's name fitted to the box, empty for open squares |
| `print-subtitle`, `print-price` | the sheet's title row: "Chiefs vs Bills · Sun, Oct 25, 2026 · 1:00 PM PDT", and "$10 a square" (amounts on only) |
| `print-rules`, `print-amount` | "Who wins": one line per moment (`data-moment`), with each square's amount (`print-amount`) only when amounts are on |
| `print-winners` | a line per fixed moment to write each winner on, filled in once decided |
| `print-qr`, `print-follow`, `print-signup` | the QR code to the live board, "Follow it live: jaxsquares.com/g/…", and (while squares are open) "Grab a square on your phone, or write your name in a box." |
