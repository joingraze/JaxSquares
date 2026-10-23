# Marketing

Code-rendered Instagram assets and the launch plan for JaxSquares.

```
marketing/
  capture/       record.mjs: films the real app (dark mode, iPhone frame) into 30 fps clips
  studio/        React + Tailwind "video studio" that cuts the clips into Reels, carousels and story frames
  launch-plan/   The 4-week Instagram plan: plan.mjs (source) → LAUNCH_PLAN.md, .ics, calendar page
  out/           Clips and renders (gitignored; regenerate with the commands below)
```

## 1. Capture: film the real app

`capture/record.mjs` runs the app locally (Vite on :5232 against the local D1)
and drives it with Playwright in a 6.9-inch iPhone viewport, dark mode, while
Chrome's screencast records it. It uses the App Store screenshot world
(`scripts/store/seed.mjs`: fictional teams and people, prize notes, no money)
and the same banned-text guard, so a clip can never show betting words,
league marks or dev addresses. Friends' claims and scores are posted through
the API mid-recording, so the board fills and winners land live.

The fictional hosts can't sign in with Google or Apple, so when the recorder
starts its own dev server it writes a `.dev.vars` (removed afterwards) that
turns sign-in off and uses the no-charge test checkout. If you keep a
`.dev.vars` of your own, it's used as is.

```bash
npm run db:migrate:local
npm run marketing:capture                 # every scene
npm run marketing:capture -- draw live    # just these
```

Scenes: `create` (wizard → "You're live!" → invite sheet), `invite` (invite
sheet → QR code), `claim` (friends fill the board while you pick 3), `jax`
(Let Jax pick 5), `draw` (Lock & draw → the shuffle → "The numbers are in!"),
`live` (a Q3 score lands on your square, Jax cheers), `home` (home screen and
Activity). The use-case scenes: `tv-open` and `tv-game` (TV mode on a 1280×720
screen at a bar: the QR code while the room scans in, then the draw and a
winner card), `hoops-create` and `hoops-live` (a basketball board made, then
Q3 landing on your square), `join` (a stranger's phone opens the link, picks a
square, types a name), `sync` (one board on three phones as Q3 lands:
`sync-left`, `sync-center`, `sync-right`), `soccer-live` (a soccer board: a
goal at 45+2' lands on your square 45; the board is dealt again until you hold
the 45th minute). Each lands in `out/clips/<scene>/`
as numbered JPEGs plus `clip.json` (with the scene's scores and names);
`out/clips/manifest.json` lists them. Re-record after any UI change, then
re-render: compositions pick moments by clip frame number (noted in
`studio/compositions/Walkthroughs.tsx` and `UseCases.tsx`), so check those if a
flow's timing changes.

Headless screencasts come at 1 px per CSS px unless the device scale is forced,
so each scene records at its own scale: one phone at 2× (sharp, ~26 fps),
three phones at 1.5×, the TV at 1×. Higher scales drop frames (3× gets ~6 fps).

## 2. Studio: cut and render

Every asset is a React composition rendered frame by frame, so videos are
deterministic and re-render after any copy or product change. Phone shots play
the recorded clips (`components/Phone.tsx`: `Phone`, `Cuts`, `ClipCrop`);
boards are the app's real `Board` component fed with the fictional world
(`components/AppBoard.tsx`); end cards use the app's `Jax`, `LogoMark` and
`TeamMark`. The app's stylesheet (`src/index.css`, tokens and fonts) is served
to the studio as `virtual:app.css` (see `studio/vite.config.ts`).

```bash
npm run marketing:studio      # preview gallery with a scrubber at http://localhost:5199
npm run marketing:render      # render everything into marketing/out/
npm run marketing:render -- 03-the-draw c2-every-square-ranked   # just these
npm run marketing:render -- --frames 01-how-it-works:0,120,300   # spot-check stills
npm run marketing:typecheck
```

Rendering needs `ffmpeg` on PATH and a Chromium. It looks for the sandbox's
Playwright Chromium; elsewhere set `CHROMIUM_PATH` (e.g. your Chrome binary).
`RENDER_CONCURRENCY` (default 3) sets how many compositions render at once.

Output formats follow Instagram's current specs:

- Reels and Stories: 1080×1920, 30 fps, H.264 High, yuv420p, faststart, with
  an AAC 48 kHz stereo soundtrack at -14 LUFS (Instagram's playback loudness).
- Carousels: 1080×1440 (3:4, the profile grid's tile shape since 2025).
- Key text stays inside the Reels safe zone (`REEL_SAFE` in `studio/brand.ts`).

### Soundtracks

Every video has its own original music and sound effects, composed in code
(`studio/audio/`) and rendered in the page with Web Audio (OfflineAudioContext,
seeded, so a re-render sounds identical). A composition lists its cues in an
`audio` spec, from the same constants that drive the visuals: `drops` (impact,
full groove), `builds` (riser, snare roll, filter sweep), `breaks` (thinner or
silent), `sfx` (tap, pop, whoosh, ding, sparkle, tick, womp, stop, cheer) and
`end`. The bar grid is anchored on the end card, so it lands on the home
chord with the JaxSquares sting. Six styles live in `audio/styles.ts`:
`hype` (128 BPM launch pop: the walkthroughs, use cases and matchups),
`bounce` (124 BPM, playful: Jax, the group chats, office, join), `pulse`
(124 BPM data), `anthem` (120 BPM game-day pop, spare), `retro` (On this day,
90 BPM boom-bap) and `harvest` (Thanksgiving). Every track opens at full groove
(`intro` 0.92), and the launch Reels drop on frame 0, where their hook
headline already sits (`Headline landed`): Instagram tests a Reel on its first
second. The mix
is EQ'd for phone speakers, then render.mjs normalizes it (two-pass loudnorm)
and muxes it in.

```bash
npm run marketing:render -- --audio                 # re-mix every soundtrack (no frame re-render)
npm run marketing:render -- --audio 03-the-draw     # just this one
```

Copy follows the app's product rules (CLAUDE.md): no money between players and
no betting words (no pot, payout, buy-in, odds, stakes...), "the big game",
no league or team logos (real teams appear by name only, on neutral colors),
and "free" always means free to set up (big boards have a host fee at the draw).

Brand constants (handle, URL, taglines, colors) live in `studio/brand.ts`.
Schedule and history facts for the templated videos live in
`studio/compositions/data.ts`. The square stats in `studio/lib/stats.ts` come
from `scripts/seo/data/nflFinals.ts`, which `scripts/seo/stats.ts` generates
from nflverse's `games.csv` (NFL final scores 1999–2025): the same numbers as
the website's data page, refreshed yearly (docs/seo.md). The soccer stats in
`studio/lib/soccerStats.ts` come from `scripts/seo/data/soccerMinutes.ts`, which
`scripts/seo/soccerStats.ts` counts from openfootball's public-domain
`worldcup.json` (every goal of 2018, 2022 and 2026, on the square the app would
give it). Copy names that tournament without its trademarked name.

History and stat posts cite their source: the on-this-day videos show it on
screen (`source` in `compositions/data.ts`), and the launch plan's build fails
when a history or stats post has no `source` or its caption lacks
"Source: …".

### Compositions

| id | What |
|---|---|
| `01-how-it-works` | 12s real-app walkthrough: opens on a live score landing, then pick the game → text the link → friends pick → Jax draws |
| `02-let-jax-pick` | Meet Jax: "Let Jax pick" picks 5 random squares |
| `03-the-draw` | POV: the board is full and you hit Draw |
| `04-best-worst-squares` | Heat map of every square from 7,276 NFL finals; 0–7 vs 2–2 |
| `05-group-chat` / `05b-group-chat-thanksgiving` | Group-chat chaos → one invite link → everyone picks |
| `06-winners-light-up` | The push, the score landing on your square, home and Activity |
| `07-features` | Rundown: no app, scan the code, Let Jax pick, prize notes, live scores, home |
| `08-thanksgiving-slate` | 6 games in 3 days, one board per game |
| `u1-speedrun` | Squares board speedrun: the create flow on a stopwatch, then the link lands in a group chat |
| `u2-bar-big-screen` | A bar at night: TV mode on the wall, a guest scans the QR code and joins, numbers drawn on the TV, the room cheers a winner |
| `u3-basketball-squares` | "Squares aren't just for football": a basketball board in five taps, then Q3 lands on your square |
| `u4-every-phone` | One score, every phone: three phones on one board as Q3 lands |
| `u5-office-squares` | The office spreadsheet and reply-all chaos → one link in the team chat → live winners |
| `u6-join-from-link` | The friend's side: a text with the link → tap a square → type a name → in, no app |
| `u7-soccer-squares` | Soccer squares: every square is a minute (43' → 43, 45+2' → 45, 90+3' → 93), then a 45+2' goal lands on your square 45 |
| `u8-soccer-minutes` | Data: which minute wins soccer squares, from 649 goals (square 45 leads, the 90s row, 00 for goalless matches) |
| `m1`–`m7` | "Run a board for this game" matchup template |
| `otd1`–`otd6` | On this day: a famous final score and the square it landed on |
| `c1`–`c4` | Carousels: how squares works, every square ranked, host cheat sheet, Thanksgiving playbook |
| `g1`–`g9` | The launch grid tiles: the 3×3 JaxSquares mark (gold winning square), each a tile + a real-app proof slide. The launch posts them as Reel covers (`r-grid-covers`) |
| `g-grid-preview` | The profile once the grid is up (Jax profile picture and the nine squares) |
| `r-grid-covers` | The launch grid as Reel covers (1080×1920): each tile sits in the middle 3:4 the profile grid shows, so nine Reels make the logo |
| `s-grid-progress` | 3 Story frames as the grid fills: 3 of 9, 6 of 9, full |
| `s-story-frames` | 8 Story backgrounds with room for native poll/quiz/link stickers |
| `p-highlight-covers` | 4 Highlight covers (How it works, Square stats, Game days, Thanksgiving) |
| `p-profile-picture` | 2 profile pictures (1080×1080, built for the circle crop): Jax over the board (the app icon), the 3×3 mark |

## The launch plan

Edit `launch-plan/plan.mjs`, then run `node marketing/launch-plan/build.mjs` to
regenerate `LAUNCH_PLAN.md`, `jaxsquares-launch.ics` (import into Google or Apple
Calendar for a reminder before every post) and `calendar.html`, the calendar page.
