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

```bash
npm run db:migrate:local
npm run marketing:capture                 # every scene
npm run marketing:capture -- draw live    # just these
```

Scenes: `create` (wizard → "You're live!" → invite sheet), `invite` (invite
sheet → QR code), `claim` (friends fill the board while you pick 3), `jax`
(Let Jax pick 5), `draw` (Lock & draw → the shuffle → "The numbers are in!"),
`live` (a Q3 score lands on your square, Jax cheers), `home` (home screen and
Activity). Each lands in `out/clips/<scene>/` as numbered JPEGs plus
`clip.json`; `out/clips/manifest.json` lists them. Re-record after any UI
change, then re-render: compositions pick moments by clip frame number (noted
in `studio/compositions/Walkthroughs.tsx`), so check those if a flow's timing
changes.

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

- Reels and Stories: 1080×1920, 30 fps, H.264 High, yuv420p, faststart. Exported
  silent, so add music from Instagram's library when posting.
- Carousels: 1080×1440 (3:4, the profile grid's tile shape since 2025).
- Key text stays inside the Reels safe zone (`REEL_SAFE` in `studio/brand.ts`).

Copy follows the app's product rules (CLAUDE.md): no money between players and
no betting words (no pot, payout, buy-in, odds, stakes...), "the big game",
no league or team logos (real teams appear by name only, on neutral colors),
and "free" always means free to set up (big boards have a host fee at the draw).

Brand constants (handle, URL, taglines, colors) live in `studio/brand.ts`.
Schedule and history facts for the templated videos live in
`studio/compositions/data.ts`. The square stats in `studio/lib/stats.ts` are
generated from nflverse's `games.csv` by `studio/scripts/digit_odds.py` (NFL
final scores 1999–2025).

### Compositions

| id | What |
|---|---|
| `01-how-it-works` | 23s real-app walkthrough: create → text the link → friends pick → Jax draws → live score lands |
| `02-let-jax-pick` | Meet Jax: "Let Jax pick" picks 5 random squares |
| `03-the-draw` | POV: the board is full and you hit Draw |
| `04-best-worst-squares` | Heat map of every square from 7,276 NFL finals; 0–7 vs 2–2 |
| `05-group-chat` / `05b-group-chat-thanksgiving` | Group-chat chaos → one invite link → everyone picks |
| `06-winners-light-up` | The push, the score landing on your square, home and Activity |
| `07-features` | Rundown: no app, scan the code, Let Jax pick, prize notes, live scores, home |
| `08-thanksgiving-slate` | 6 games in 3 days, one board per game |
| `m1`–`m7` | "Run a board for this game" matchup template |
| `otd1`–`otd6` | On this day: a famous final score and the square it landed on |
| `c1`–`c4` | Carousels: how squares works, every square ranked, host cheat sheet, Thanksgiving playbook |
| `s-story-frames` | 8 Story backgrounds with room for native poll/quiz/link stickers |
| `p-profile-picture` | 2 profile pictures (1080×1080, built for the circle crop): Jax over the board (the app icon), the 3×3 mark |

## The launch plan

Edit `launch-plan/plan.mjs`, then run `node marketing/launch-plan/build.mjs` to
regenerate `LAUNCH_PLAN.md`, `jaxsquares-launch.ics` (import into Google or Apple
Calendar for a reminder before every post) and `calendar.html`, the calendar page.
