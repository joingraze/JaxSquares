# Marketing

Code-rendered Instagram assets and the launch plan for JaxSquares.

```
marketing/
  studio/        React + Tailwind "video studio" that renders Reels, carousels and story frames
  launch-plan/   The 4-week Instagram plan: plan.mjs (source) → LAUNCH_PLAN.md, .ics, calendar page
  out/           Rendered files (gitignored; regenerate with npm run marketing:render)
```

## The studio

Every asset is a React composition rendered frame by frame, so videos are
deterministic and can be re-rendered after any copy or product change. The
compositions reuse the app's own pieces (`src/components/ui`, `Results`,
`PlayerBar`, the logo, `shared/squares.ts` for the draw and winner logic, and
the Tailwind theme in `src/theme.css`). `StudioGrid` mirrors `SquaresGrid`
markup with animation hooks added, so the board looks exactly like the app.

```bash
npm run marketing:studio      # preview gallery with a scrubber at http://localhost:5199
npm run marketing:render      # render everything into marketing/out/
npm run marketing:render -- 03-the-draw c2-squares-odds        # just these
npm run marketing:render -- --frames 01-how-it-works:0,120,300 # spot-check stills
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

Brand constants (handle, CTA, taglines) live in `studio/brand.ts`. Schedule and
history facts for the templated videos live in `studio/compositions/data.ts`.
The squares odds in `studio/lib/stats.ts` are generated from nflverse's
`games.csv` by `studio/scripts/digit_odds.py` (NFL final scores 1999–2025).

### Compositions

| id | What |
|---|---|
| `01-how-it-works` / `02-how-it-works-free` | 23s walkthrough: create → share → claim → lock & draw → winners ($5 and $0 versions) |
| `03-the-draw` | POV: the board is full and you hit Lock |
| `04-best-worst-squares` | Heat map of every square from 7,276 NFL finals; 0–7 vs 2–2 |
| `05-group-chat` / `05b-group-chat-thanksgiving` | Group-chat chaos → one link |
| `06-winners-light-up` | Four quarters scored; winners light up, Results card fills in |
| `07-features` | Rapid feature rundown ($0 pools, no app, any sport) |
| `08-thanksgiving-slate` | 6 games in 3 days, one board per game |
| `m1`–`m7` | "Run a board for this game" matchup template |
| `otd1`–`otd6` | On this day: a famous final score and the square it paid |
| `c1`–`c4` | Carousels: how squares works, every square ranked, commissioner cheat sheet, Thanksgiving playbook |
| `s-story-frames` | 8 Story backgrounds with room for native poll/quiz/link stickers |
| `p-profile-picture` | 3 profile picture options (1080×1080, built for the circle crop): J², the winning square, a square football |

## The launch plan

Edit `launch-plan/plan.mjs`, then run `node marketing/launch-plan/build.mjs` to
regenerate `LAUNCH_PLAN.md`, `jaxsquares-launch.ics` (import into Google or Apple
Calendar for a reminder before every post) and `calendar.html`, the calendar page.
