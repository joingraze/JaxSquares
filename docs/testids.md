# Test ids (used by the floors harness in e2e/)

Keep these `data-testid`s stable; the floors measurements depend on them.

| testid | where |
|---|---|
| `new-board` | primary "create a board" call to action (home + tab bar) |
| `game-option` | each real game in the create flow's game picker |
| `host-name` | the creator's name field, if the create flow asks for it |
| `custom-matchup` | the "type your own teams" option |
| `team-x-input`, `team-y-input` | custom matchup team inputs |
| `format-option` | each format preset card (also `data-format=<preset>`) |
| `create-submit` | the button that creates the board / opens checkout |
| `pay-confirm` | the confirm button in the checkout sheet (test mode and real) |
| `invite-share` | the share-invite button in the invite sheet |
| `invite-copy` | copy-link button |
| `join-name` | name input in the join sheet |
| `join-submit` | join button in the join sheet |
| `cell` | every board square, with `data-row`, `data-col`, `data-state=empty\|mine\|taken\|selected\|winner` |
| `claim-submit` | claim button in the board's action bar |
| `host-lock` | lock board + draw numbers |
| `score-x`, `score-y`, `score-save` | host score entry |
| `host-open` | the host bar button that opens the host sheet |
| `host-lock-confirm` | "Draw the numbers" — actually locks, after the `host-lock` confirm step |
| `host-bar-action` | the host bar's next-action pill |
| `notify-enable` | "Turn on notifications" in the notify sheet and on Profile |
| `profile-edit`, `profile-name`, `look-done` | Profile hero, name field in the look sheet, its done button |
