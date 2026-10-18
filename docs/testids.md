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
| `square-price` | the square price card (input, quick picks, and once a price is set the board's total and the split) |
| `price-chip` | each one-tap square price (`data-price=<value>`, `aria-pressed` when it's the price; tapping the picked one clears it) |
| `board-total` | "All 100 squares: $1,000", the board's total at the square price |
| `prize-budget` | "Prizes: $800 of $1,000" with left / over / adds up and "+ every score" (`data-status=none\|under\|exact\|over`) |
| `prize-split` | each "Split the $1,000" choice (`data-split=even\|bigger-final`, `aria-pressed` when the amounts already match it): fills the fixed moments' amounts |
| `every-score-options` | the every-score setups (under the create flow's Every score card, and the editor's every-score row) |
| `every-score-reverse` | "Also pay the reverse at each quarter and the final" switch |
| `every-score-reverse-amount` | create flow only: one reverse amount for every quarter-end and the final |
| `every-score-by-kind` | "Amount by score type" switch |
| `score-kind-amount` | an amount by score type (`data-kind=touchdown\|fieldGoal\|conversion\|safety`, `data-side=square\|reverse`) |
| `score-kind-other` | "Other scores": the every-score default amount while amounts go by score type (`data-side`) |
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
| `rules-edit` | host only: "Edit rules & prizes" in the rules sheet (opens the host sheet's editor) |
| `score-moment` | on boards that award every score and quarter-ends: the host score pad's "+ Score / Q1 / Half / Q3 / Final" control |
| `result-card` | each period card in the results strip (`data-card=<period key>`) |
| `result-label` | a result card's label: "Score 3 · TD · $50" (its kind part has `data-kind`) |
| `prize-totals` | the host sheet's prize totals under Winners (boards with amounts) |
| `player-squares-value` | what a player's squares come to at the square price, on the players list while squares are picked |
| `home-invites` | Home's "Invites" section: open boards with squares left where I have none (an invite link I only opened, or a board I joined without picking) |
| `invite-card` | each card in it (`data-game=<board id>`); the whole card opens the board |
| `invite-pick` | "Pick squares" on an invite card: opens the board |
| `invite-hide` | "Not for me" on an invite I only opened (not joined): hides it from Home (drops it from the seen list) with an Undo toast |
| `create-submit` | Review's "Create board": creates the board / opens checkout |
| `pay-confirm` | the confirm button in the checkout sheet (live web checkout, and host controls opening an unpaid draft). Test mode and the App Store skip it: `create-submit` creates and opens the board in one tap |
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
| `host-lock` | lock board + draw numbers |
| `score-x`, `score-y`, `score-save` | host score entry |
| `score-quick-adds`, `score-quick-add` | the every-score pad's one-tap points (`data-play=TD\|FG\|XP\|2-PT\|Safety`: +6, +3, +1, +2, +2) for the team being typed |
| `host-open` | the host bar button that opens the host sheet |
| `host-lock-confirm` | "Draw the numbers" — actually locks, after the `host-lock` confirm step |
| `reveal-close`, `reveal-done` | the number reveal (host, after the draw): the X at the top (closes it any time, even mid-shuffle) and "See the board" (pinned at the bottom once the numbers land) |
| `host-bar-action` | the host bar's next-action pill |
| `notify-enable` | "Turn on notifications" in the notify sheet and on Profile |
| `profile-edit`, `profile-name`, `look-done` | Profile hero, name field in the look sheet, its done button |
| `score-saved` | footer confirmation after a host saves a score |
| `player-remove` | host only, while squares are being picked: the remove button on another player's row (board players list and the host sheet's Players view) |
| `remove-player-confirm` | "Remove Maya" in the host sheet's remove confirm — actually removes the player |
| `theme-dark`, `theme-light`, `theme-system` | Profile → Appearance: the Dark / Light / System segments (saves the choice and switches at once) |
| `board-theme-toggle` | the sun/moon button in a board's top bar: switches to light or dark (saved like the Profile choice) |
