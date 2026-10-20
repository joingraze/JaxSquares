# App Store assets

| File | What it is |
|---|---|
| `listing.md` | Every App Store Connect field: name, subtitle, promo text, description, keywords, What's New, age rating, privacy, review notes |
| `privacy-policy.md` | Source text for `https://jaxsquares.com/privacy` |
| `screenshots/6.9/` | 7 frames at 1320 × 2868 (6.9" iPhone, the required set) |
| `screenshots/6.5/` | The same 7 frames at 1242 × 2688 (6.5" iPhone) |
| `screenshots/contact-sheet.png` | Every frame at about search-result size, to check the captions read |

## Regenerating the screenshots

The screenshots are the real app, not mockups. One script seeds fictional
boards through the API, drives the app with Playwright to each moment, and
frames each screen with its caption.

```bash
node scripts/store/generate.mjs
```

That's all: no npm script, no install step beyond the repo's existing
`node_modules`. It takes about two minutes and writes
`docs/app-store/screenshots/`. If nothing answers at `http://127.0.0.1:5232`, it
starts the dev server there itself (Vite straight from `node_modules`, with
`VITE_PUBLIC_ORIGIN=https://jaxsquares.com`) and stops it when it's done.

### Needs

- Node 22 or later and the repo's `node_modules` (Playwright, the
  `@fontsource-variable` fonts, Vite, wrangler).
- A Chromium build. It uses `/opt/pw-browsers/chromium-1194/chrome-linux/chrome`
  when that exists, else `CHROMIUM_PATH`, else Playwright's own
  (`npx playwright install chromium`).
- The local D1 database migrated, once per new migration:
  `node_modules/.bin/wrangler d1 migrations apply jaxsquares --local`
  (the same as `npm run db:migrate:local`).

### Options

```bash
node scripts/store/generate.mjs --size 6.9                 # one size (6.9 or 6.5)
node scripts/store/generate.mjs --only 05-whos-winning     # frame ids or screen names, comma-separated
BASE=http://127.0.0.1:5232 node scripts/store/generate.mjs # a dev server you started
node scripts/store/generate.mjs --out /tmp/shots --work /tmp/raw
```

- `--only` skips the contact sheet, so a partial run never leaves it stale.
- **Your own dev server.** Start it with the public origin, or the invite
  screen shows `127.0.0.1` in its link, and the run stops with an error saying
  so:

  ```bash
  VITE_PUBLIC_ORIGIN=https://jaxsquares.com node node_modules/vite/bin/vite.js --port 5232 --host 127.0.0.1
  ```
- `--work` keeps the raw phone captures (default: the OS temp folder,
  `jaxsquares-store/<size>/`).

### How it's put together

| File | Job |
|---|---|
| `scripts/store/seed.mjs` | The fictional world, made through the public API with one device per person: five boards ("Sunday Squares", "Rivalry Night", "Tailgate Squares", "Office Game Day", "Thanksgiving Showdown"), ten friends, made-up teams and prize notes. The live board's scores are picked after the draw, so the phone's square holds the halftime score. |
| `scripts/store/capture.mjs` | One browser context per phone at the device's point size and @3x, with the iPhone safe areas emulated, so the app lays out as it does under the status bar and home indicator. One function per moment. |
| `scripts/store/frames.mjs` | The captions (`FRAMES`, in story order) and the frame layout: caption on the night-turf canvas, the screen in a device-free rounded frame with a drawn 9:41 status bar, the push banner, the contact sheet. |
| `scripts/store/generate.mjs` | Runs the lot for each size and checks every PNG's size and that it has no alpha channel. |

To change a caption, edit `FRAMES` in `frames.mjs`. Keep each title line under
about 15 characters and the subline to one line, and look at the contact sheet
afterwards.

### What's staged, and why

Everything on the phone screens is the app's own UI and data from its API.
These parts are set up for the store art:

- **Made-up everything.** Teams, people, board names and prize notes are
  fictional, and nothing mentions money.
- **The game picker's games.** The create screen's schedule is served by the
  capture (fictional games, same shape as `/api/schedule`). Real games would
  carry league marks, and the score provider may not be reachable.
- **The "NFL" tab.** The capture renames the create screen's "NFL" tab to "Pro"
  before the shot, to keep league marks out of the store (Guideline 5.2.1).
  It's the only text the capture changes.
- **Notifications on.** The phone has notification permission and a VAPID key,
  so the activity inbox shows "Lock-screen alerts are on", as the iPhone app
  does once notifications are allowed.
- **The push banner** on frame 7 is drawn by the composer, using the exact
  words of the real push for your own square hitting (`worker/push/copy.ts`)
  and the board's real prize note.
- **The status bar** (9:41, full signal and battery) is drawn into the safe
  area. The home indicator isn't drawn, as in a real iPhone screenshot.

### Guard rails

A capture stops with an error if the screen's text includes any of these:

- league marks or a pro-league team nickname (from `shared/teams.ts`)
- a dev address (`127.0.0.1`, `localhost`, a port)
- a test-mode label
- a price or a money word

Each composed PNG must be the exact App Store size, with no alpha channel.
Still look at every frame before uploading. The script can't tell whether a
moment reads well.

### Gotchas

- Every dev server on this checkout shares one local D1 file, so a write can
  fail with "database is locked". The seeder retries those.
- Each run creates new boards with new device ids, so the "10 new boards an
  hour" limit never trips, and old runs' boards simply pile up in the local
  database.
- The reveal frame is timed: it waits for "The numbers are in!" and then
  1.6 s for the confetti to settle. If the reveal's timing changes, adjust the
  wait in `capture.mjs`.
