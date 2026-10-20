# JaxSquares Instagram Launch

A 4-week Instagram launch for @jaxsquares (Oct 26 – Nov 22, 2026), plus a prep week and a Thanksgiving-week bonus. All times US Eastern. Every post's asset is rendered from code in `marketing/studio`; run `npm run marketing:render` to regenerate them into `marketing/out/`.

## Positioning

Squares for any game. No app, no signup, no math, and we never touch the money. Competitors charge per grid ($10–$13), need a download, or need an account. Nobody in the category has a personality-led Instagram.

## Content pillars

| Pillar | Share | What |
|---|---|---|
| Show the product | 35% | 20-second demos, the live draw, winners lighting up. Every post shows the real app. |
| Squares nerdery | 25% | Real odds from 7,276 NFL finals: best/worst squares, digit tiers, most common scores. Built to be saved and sent. |
| This game, this week | 25% | Primetime, Jaguars, Gators and Thanksgiving games. Make the board the plan for the game. |
| On this day | 15% | Verified history with a squares twist: which square that famous final score paid. |

## Cadence

- 4–5 feed posts a week: about 4 Reels and 1 carousel. Buffer's 2026 data: 3–5 posts/week roughly doubles follower growth vs. 1–2.
- Stories on most days, always on game days, each with a link sticker to start a board.
- Best slots (ET): Tue 1–7 PM and Wed 12–9 PM are strongest; Mon 2–4 PM and Thu 12–2 PM are good. Game-day boards go up 11 AM–12:30 PM Sunday and 6–7:30 PM before TNF/MNF.

## Rules that drive reach

- Hook in the first second. Every video opens on its headline, because Instagram now reports skip rate on Reels.
- Optimize for sends. 'Sends per reach' is one of Instagram's top ranking signals for reaching non-followers, so every caption ends with one specific send prompt ('send this to whoever got 2–2'), never 'tag a friend'.
- Max 5 hashtags. Instagram capped it at 5 on Dec 18, 2025. Use specific tags, never #reels or #explore.
- Keywords first. Captions and alt text feed Instagram search and Google. Lead with 'football squares' or 'squares pool'.
- Original content only. Instagram cuts recommendations for reposted content and for videos with other apps' watermarks. Everything here is original and has no watermarks.
- Reply to every comment in the first hour after posting. Answer good questions with 'Reply with Reel'.

## Stay out of trouble

- Say 'the Big Game', never 'Super Bowl', in posts and ads (NFL trademark). Team names are fine to identify a game. No logos, uniforms, team colors, broadcast footage or player photos.
- Never use 'bet', 'wager', 'gamble' or 'cash out'. Say 'squares pool', 'board', 'bragging rights'.
- Paid boosts: only $0-pool creatives. Meta requires prior written permission for ads where money is part of both entry and prize. Boost candidates: 02, 04, 07.
- Lean on 'we never touch the money'. Buy-ins are just numbers you track, or set to $0.
- Bars and offices: only pitch free boards with no purchase needed to claim a square.
- Giveaways need official rules, eligibility, and a 'not sponsored by Instagram' line. Don't require follows or tags to enter. Skip them for this launch.
- Add 'Not affiliated with the NFL or NCAA' to the bio.

## Measure

- **Boards created (north star):** `npx wrangler d1 execute jaxsquares --remote --command "SELECT date(created_at/1000,'unixepoch') AS day, COUNT(*) AS boards FROM games GROUP BY day ORDER BY day DESC LIMIT 14"`
- **Sends per reach and skip rate:** Reel insights. Double down on whatever gets sent.
- **Saves:** Carousel insights. Saves mean the odds and how-to content is working.
- **Profile visits → link taps:** Professional dashboard. If taps lag visits, rewrite the bio's first line.

Stretch targets, not forecasts: 400+ followers and 150+ boards created by Nov 29, and one Reel past 10k views. Benchmarks for brand-new accounts are thin; the boards count matters more than followers.

## Profile setup

- **Name field:** JaxSquares · Football Squares
- **Bio:**

  ```
  Football squares for any game 🏈
  Free · no app · no signup
  We draw the numbers + call the winners
  Not affiliated w/ NFL or NCAA 👇
  ```
- **Link:** Your app URL with ?ref=ig on the end, so Instagram visits show up in Cloudflare analytics.
- **Highlights:** How it works, Odds, Game days, Thanksgiving
- **Category:** Sports & Recreation. It tells visitors this is a sports account. Avoid App Page: the label sits under your name and contradicts “no app to download”. Website is the most literal fallback. You can also hide the label in Edit profile.
- **Profile picture:** `out/p-profile-picture/01.png` (Option 1 (recommended): J², “Jax Squared”. Reads at every size.); `out/p-profile-picture/02.png` (Option 2: the winning square lit where its row and column cross); `out/p-profile-picture/03.png` (Option 3: a square football in brand green)

## Outreach templates

- **Creators:** Hey [name]! Love your [team] content. We built JaxSquares, a free squares pool app (no download, no signup). Want to run a free followers' board for [game]? We set it up, you share the link, and we co-post the Reel as a Collab. Costs you and your followers nothing.
- **Bars / offices:** Hi! We make JaxSquares, a free squares board your regulars can join with a QR code or link. No app and no purchase needed to play. Want us to set up a free board for [game] for your crowd?
- **UGC ask:** Screenshot your board and tag @jaxsquares. We reshare the best ones (with your OK).

## Prep · Oct 20–25: Set up and seed the grid

**Goal:** A profile that looks alive before launch: bio, link, 3 seed posts, highlights.

| Day | Time (ET) | Type | Post | Asset |
|---|---|---|---|---|
| Tue, Oct 20 | 10:00 AM | Task | Set up the account | — |
| Wed, Oct 21 | 12:30 PM | Carousel | Seed post: how football squares works | `c1-how-squares-works` |
| Thu, Oct 22 | 12:30 PM | Reel | Seed post: feature rundown | `07-features` |
| Thu, Oct 22 | 6:45 PM | Story | TNF: Patriots at Bears | `s-story-frames/06` |
| Fri, Oct 23 | 1:00 PM | Reel | Seed post: best and worst squares | `04-best-worst-squares` |
| Sat, Oct 24 | 11:00 AM | Story | College Saturday slate | — |
| Sun, Oct 25 | 9:15 AM | Story | Breakfast football from Paris | — |
| Sun, Oct 25 | 11:30 AM | Story | Game day checklist | `s-story-frames/06` |
| Sun, Oct 25 | 7:30 PM | Story | SNF: Chiefs at Seahawks poll | — |

### Tue, Oct 20, 10:00 AM · Task: Set up the account

- [ ] Switch @jaxsquares to a Professional account. Category: Sports & Recreation (not App Page, which contradicts “no app to download”).
- [ ] Upload the profile picture: option 1, J² (p-profile-picture/01).
- [ ] Name field: “JaxSquares · Football Squares”. The name field is searchable.
- [ ] Paste the bio and link from Setup. Link = app URL + ?ref=ig.
- [ ] Make 4 Highlights: How it works, Odds, Game days, Thanksgiving. Use story frames as covers.
- [ ] Run a real test board with 3 friends and screen-record it (B-roll for the founder Reel).
- [ ] Save quick replies for “link?”, “is it free?” and “do I need the app?”.

### Wed, Oct 21, 12:30 PM · Carousel: Seed post: how football squares works

**Asset:** `out/c1-how-squares-works/01.png`, `out/c1-how-squares-works/02.png`, `out/c1-how-squares-works/03.png`, `out/c1-how-squares-works/04.png`, `out/c1-how-squares-works/05.png`, `out/c1-how-squares-works/06.png`, `out/c1-how-squares-works/07.png`

**Caption:**

```text
How football squares works, in 7 slides 🏈

The grid, the draw, the last-digit rule and how a quarter gets paid. Save this for game day.

Send it to the person who always asks “wait, which square is mine?”

Run your own board free → link in bio

#footballsquares #squarespool #officepool #fantasyfootball #gameday
```

**Alt text:** Seven-slide explainer of football squares: a 10 by 10 grid, friends claim squares, digits 0 to 9 are drawn for each row and column, and the last digit of each team's score picks the winning square each quarter.

- Pin this post (pin 3 total by launch).

### Thu, Oct 22, 12:30 PM · Reel: Seed post: feature rundown

**Asset:** `out/07-features.mp4`, `out/07-features-cover.png`

**Caption:**

```text
Football squares, minus the spreadsheet 🏈

No app to download. No accounts. Free pools at $0, or track a buy-in. Cap squares per player. Winners called automatically.

Works for football, hoops, baseball, hockey and soccer. Link in bio.

#footballsquares #squarespool #officepool #fantasyfootball #gamedayparty
```

- Videos are exported silent. In the Reels editor, add an upbeat instrumental from Instagram's audio library at low volume.
- Upload the matching cover image as the Reel cover so the profile grid stays clean.
- Boost candidate later: no dollar amounts on screen.

### Fri, Oct 23, 1:00 PM · Reel: Seed post: best and worst squares

**Asset:** `out/04-best-worst-squares.mp4`, `out/04-best-worst-squares-cover.png`

**Caption:**

```text
The best and worst squares in football, from 7,276 NFL final scores 📊

0–7 lands on 3.6% of finals. 2–2 has hit 4 times since 1999. 💀

Send this to whoever drew 2–2 this week.

#footballsquares #squarespool #nfl #footballstats #fantasyfootball
```

- Videos are exported silent. Add a trending sound (the ↗ arrow in the audio browser) with a build or drop. The chaos and the reveal are cut for it.
- Upload the matching cover image as the Reel cover so the profile grid stays clean.
- Pin it. Top boost candidate (no money on screen).
- Data: nflverse games.csv, NFL finals 1999–2025.

**Stories:**

- **Thu, Oct 22 6:45 PM** · TNF: Patriots at Bears · frame `s-story-frames/06` · sticker: Link → app. “TNF: Patriots at Bears, 8:15 on Prime. Board takes 20 seconds 👇”
- **Sat, Oct 24 11:00 AM** · College Saturday slate · sticker: Link → app. “College Saturday 🏈 / BYU at UCF · 3:30 FOX / Ole Miss at Texas · 7:30 ABC / Houston at Utah · 10:15 ESPN / Running a board? 👇”
- **Sun, Oct 25 9:15 AM** · Breakfast football from Paris · sticker: Link → app. “Breakfast football from Paris 🇫🇷 Steelers vs Saints at 9:30. Coffee + a squares board?”
- **Sun, Oct 25 11:30 AM** · Game day checklist · frame `s-story-frames/06` · sticker: Link → app. “(Frame says it all.) Lock before the 1:00 kickoffs.”
- **Sun, Oct 25 7:30 PM** · SNF: Chiefs at Seahawks poll · sticker: Poll: Yes / No. “SNF: do the Chiefs stay unbeaten?”

## Week 1 · Oct 26–Nov 1: Launch: what it is

**Goal:** Launch on Cowboys–Eagles MNF. Personal push to friends and group chats. First 25 boards.

| Day | Time (ET) | Type | Post | Asset |
|---|---|---|---|---|
| Mon, Oct 26 | 1:30 PM | Task | Launch prep | — |
| Mon, Oct 26 | 2:00 PM | Reel | LAUNCH: How it works in 20 seconds | `01-how-it-works` |
| Mon, Oct 26 | 2:10 PM | Task | Personal push | — |
| Mon, Oct 26 | 6:30 PM | Story | MNF board is open | `m1-mnf-cowboys-eagles` |
| Mon, Oct 26 | 9:30 PM | Story | Q1 poll | — |
| Tue, Oct 27 | 1:00 PM | Reel | On this day: Emmitt breaks the record (2002) | `otd1-oct27-emmitt` |
| Tue, Oct 27 | 6:00 PM | Story | Poll: 0–0 or 7–7? | `s-story-frames/01` |
| Wed, Oct 28 | 12:30 PM | Carousel | Every square, ranked | `c2-squares-odds` |
| Wed, Oct 28 | 6:00 PM | Story | Poll answer | `s-story-frames/02` |
| Thu, Oct 29 | 12:30 PM | Reel | Every squares pool group chat | `05-group-chat` |
| Thu, Oct 29 | 6:45 PM | Story | TNF: Panthers at Packers | — |
| Fri, Oct 30 | 5:00 PM | Story | Who's running squares this weekend? | `s-story-frames/05` |
| Fri, Oct 30 | 5:15 PM | Task | Reply with a Reel | — |
| Sat, Oct 31 | 10:00 AM | Reel | Florida vs Georgia: it left Jax | `m2-florida-georgia` |
| Sat, Oct 31 | 2:45 PM | Story | Cocktail Party kickoff | — |
| Sat, Oct 31 | 7:00 PM | Story | Halloween: scariest square | `s-story-frames/08` |
| Sun, Nov 1 | 10:30 AM | Story | Jags are home | `m3-colts-jaguars` |
| Sun, Nov 1 | 11:30 AM | Story | Game day checklist | `s-story-frames/06` |
| Sun, Nov 1 | 8:00 PM | Task | Weekly review (15 min) | — |

### Mon, Oct 26, 1:30 PM · Task: Launch prep

- [ ] Open the app link from the bio on your phone and make sure it works.
- [ ] Line up 20 friends who run (or play in) a pool and 3 group chats to post in.
- [ ] Ask 5 friends to share the launch Reel to their stories at 2:05.

### Mon, Oct 26, 2:00 PM · Reel: LAUNCH: How it works in 20 seconds

*Monday Night Football · Cowboys at Eagles · 8:15 PM ET · ESPN/ABC*

**Asset:** `out/01-how-it-works.mp4`, `out/01-how-it-works-cover.png`

**Caption:**

```text
Squares pools, fixed. JaxSquares is live 🏈🟩

Create a board in 20 seconds, drop one link in the group chat, and everyone claims squares from their phone. We draw the numbers live and light up the winner every quarter.

Free. No app. No signup. Running a Cowboys–Eagles board tonight? Link in bio.

#footballsquares #squarespool #mondaynightfootball #officepool #nfl
```

- Videos are exported silent. In the Reels editor, add an upbeat instrumental from Instagram's audio library at low volume.
- Upload the matching cover image as the Reel cover so the profile grid stays clean.
- Pin it first (pinned: this, the carousel, best/worst).

### Mon, Oct 26, 2:10 PM · Task: Personal push

- [ ] Share the Reel to your personal story and to the 3 group chats.
- [ ] Text the 20 people directly: “made this for our pool, try it tonight for MNF?”
- [ ] Reply to every comment for the next hour.

### Tue, Oct 27, 1:00 PM · Reel: On this day: Emmitt breaks the record (2002)

**Asset:** `out/otd1-oct27-emmitt.mp4`, `out/otd1-oct27-emmitt-cover.png`

**Caption:**

```text
On this day in 2002, former Gator Emmitt Smith passed Walter Payton for the NFL's career rushing record 🐊🏈

The final? Seahawks 17, Cowboys 14. History for Emmitt, and the 7–4 square for somebody's pool.

What square would you have had? 👇

#onthisday #nflhistory #gogators #emmittsmith #footballsquares
```

- Videos are exported silent. Add a broadcast-style or nostalgic instrumental at low volume.
- Upload the matching cover image as the Reel cover so the profile grid stays clean.

### Wed, Oct 28, 12:30 PM · Carousel: Every square, ranked

**Asset:** `out/c2-squares-odds/01.png`, `out/c2-squares-odds/02.png`, `out/c2-squares-odds/03.png`, `out/c2-squares-odds/04.png`, `out/c2-squares-odds/05.png`, `out/c2-squares-odds/06.png`

**Caption:**

```text
Every square in football, ranked 📊 (7,276 NFL final scores, 1999–2025)

S-tier digits: 0 and 7. D-tier: 2 and 5. The 2–2 square has hit 4 times in 27 seasons.

Save this before your next draw, and send it to your pool's 2–2 holder.

#footballsquares #squarespool #nfl #footballstats #fantasyfootball
```

**Alt text:** Heat map and rankings of football squares by how often NFL final scores land on them since 1999. Best: 0-7, 4-7 and 0-3. Worst: 2-2, 5-5 and 5-9. Most common final since 1999: 23-20.

### Thu, Oct 29, 12:30 PM · Reel: Every squares pool group chat

*Thursday Night Football · Panthers at Packers · 8:15 PM ET · Prime Video*

**Asset:** `out/05-group-chat.mp4`, `out/05-group-chat-cover.png`

**Caption:**

```text
Every squares pool group chat: “who has the 7–3??” “resend the spreadsheet” “MIKE.” 😭

Or… one link. Everyone claims from their phone, the numbers draw themselves, and the board tells you who won.

Send this to the person who runs your pool 📲

#footballsquares #squarespool #groupchat #officepool #thursdaynightfootball
```

- Videos are exported silent. Add a trending sound (the ↗ arrow in the audio browser) with a build or drop. The chaos and the reveal are cut for it.
- Upload the matching cover image as the Reel cover so the profile grid stays clean.

### Fri, Oct 30, 5:15 PM · Task: Reply with a Reel

- [ ] Pick the best comment or question of the week (“does it work for college?” is perfect).
- [ ] Use Reply → Reel. Screen-record yourself making a board for that exact game.

### Sat, Oct 31, 10:00 AM · Reel: Florida vs Georgia: it left Jax

*Florida vs. Georgia · 3:30 PM ET · ABC · Mercedes-Benz Stadium, Atlanta*

**Asset:** `out/m2-florida-georgia.mp4`, `out/m2-florida-georgia-cover.png`

**Caption:**

```text
The Cocktail Party left Jacksonville this year. Your squares board doesn't have to 🐊🐶

Florida vs. Georgia, 3:30 ET on ABC, in Atlanta while EverBank gets renovated. It's the first time since 1995 the game isn't in Jax.

Run the board from anywhere: 20 seconds, one link, free. Gators or Dawgs? 🐊 / 🐶

#gogators #godawgs #floridageorgia #collegefootball #footballsquares
```

- Videos are exported silent. Add a trending sound (the ↗ arrow in the audio browser) with a build or drop. The chaos and the reveal are cut for it.
- Upload the matching cover image as the Reel cover so the profile grid stays clean.

### Sun, Nov 1, 8:00 PM · Task: Weekly review (15 min)

- [ ] Reel insights: note sends per reach, skip rate and saves for each post.
- [ ] Run the boards-created query (see KPIs).
- [ ] Write down the one format to repeat and the one to drop.

**Stories:**

- **Mon, Oct 26 6:30 PM** · MNF board is open · frame `m1-mnf-cowboys-eagles` · sticker: Link → app. “Start tonight's board 👇”
- **Mon, Oct 26 9:30 PM** · Q1 poll · sticker: Poll: 🙋 me / 😭 not me. “Who's got the Q1 square?”
- **Tue, Oct 27 6:00 PM** · Poll: 0–0 or 7–7? · frame `s-story-frames/01` · sticker: Poll: 0–0 / 7–7. “(Place the poll in the empty middle band.)”
- **Wed, Oct 28 6:00 PM** · Poll answer · frame `s-story-frames/02` · sticker: None (or a link to the carousel). “Answer frame. Basically a coin flip.”
- **Thu, Oct 29 6:45 PM** · TNF: Panthers at Packers · sticker: Link → app. “TNF: Panthers at Packers, 8:15 on Prime. Board's a link away 👇”
- **Fri, Oct 30 5:00 PM** · Who's running squares this weekend? · frame `s-story-frames/05` · sticker: Questions. “(Questions sticker in the middle band.)”
- **Sat, Oct 31 2:45 PM** · Cocktail Party kickoff · sticker: Link → app. “Kickoff 3:30 on ABC. Florida–Georgia board's open 🐊🐶”
- **Sat, Oct 31 7:00 PM** · Halloween: scariest square · frame `s-story-frames/08` · sticker: Emoji slider 💀 → 🔥. “Happy Halloween 👻 Scariest square on the board: 2–2.”
- **Sun, Nov 1 10:30 AM** · Jags are home · frame `m3-colts-jaguars` · sticker: Link → app. “Jags are home at 1. Lock your board by kickoff 🐆”
- **Sun, Nov 1 11:30 AM** · Game day checklist · frame `s-story-frames/06` · sticker: Link → app. “Board full? Lock it before 1.”

## Week 2 · Nov 2–8: Proof and personality

**Goal:** Jaguars primetime, the commissioner cheat sheet, on-this-day hits. First creator DMs.

| Day | Time (ET) | Type | Post | Asset |
|---|---|---|---|---|
| Mon, Nov 2 | 2:00 PM | Reel | 1 year ago: Cam Little's 68-yarder | `otd2-nov02-cam-little` |
| Mon, Nov 2 | 7:00 PM | Story | MNF: Bears at Seahawks | — |
| Tue, Nov 3 | 12:00 PM | Story | Quiz: most common final | `s-story-frames/03` |
| Tue, Nov 3 | 8:15 PM | Story | First CFP rankings | — |
| Wed, Nov 4 | 12:30 PM | Carousel | Commissioner cheat sheet | `c3-commissioner-cheat-sheet` |
| Wed, Nov 4 | 6:00 PM | Story | Quiz answer: 23–20 | `s-story-frames/04` |
| Thu, Nov 5 | 12:00 PM | Reel | Jags in primetime | `m4-tnf-jaguars-ravens` |
| Thu, Nov 5 | 6:30 PM | Story | Jags board: lock by 8:15 | — |
| Thu, Nov 5 | 11:30 PM | Story | Which square cashed? | — |
| Fri, Nov 6 | 12:00 PM | Story | 1869: the first college football game | — |
| Fri, Nov 6 | 12:15 PM | Task | Optional: comment-to-DM link | — |
| Sat, Nov 7 | 11:00 AM | Reel | Miami at Notre Dame | `m5-miami-notre-dame` |
| Sat, Nov 7 | 7:00 PM | Story | Miami at Notre Dame board | — |
| Sun, Nov 8 | 9:15 AM | Story | Madrid game | — |
| Sun, Nov 8 | 11:00 AM | Reel | On this day: Dempsey's 63-yarder (1970) | `otd3-nov08-dempsey` |
| Sun, Nov 8 | 8:00 PM | Task | Weekly review + creator outreach | — |

### Mon, Nov 2, 2:00 PM · Reel: 1 year ago: Cam Little's 68-yarder

*Monday Night Football · Bears at Seahawks · 8:15 PM ET · ESPN*

**Asset:** `out/otd2-nov02-cam-little.mp4`, `out/otd2-nov02-cam-little-cover.png`

**Caption:**

```text
One year ago today: Cam Little drilled an NFL-record 68-yard field goal in Las Vegas 🦵💥

Jaguars 30, Raiders 29 in overtime. That's the 0–9 square, which lands on 0.7% of NFL finals.

Duval, where were you for this one?

#duuuval #jaguars #onthisday #nflhistory #footballsquares
```

- Videos are exported silent. Add a broadcast-style or nostalgic instrumental at low volume.
- Upload the matching cover image as the Reel cover so the profile grid stays clean.

### Wed, Nov 4, 12:30 PM · Carousel: Commissioner cheat sheet

**Asset:** `out/c3-commissioner-cheat-sheet/01.png`, `out/c3-commissioner-cheat-sheet/02.png`, `out/c3-commissioner-cheat-sheet/03.png`, `out/c3-commissioner-cheat-sheet/04.png`, `out/c3-commissioner-cheat-sheet/05.png`, `out/c3-commissioner-cheat-sheet/06.png`

**Caption:**

```text
The squares commissioner cheat sheet 📋 5 rules that keep your pool fair.

Lock before kickoff. Cap squares per player. Pay out every quarter. Make the office pool free. Let the board do the math.

Save it, then send it to whoever runs your pool.

#footballsquares #squarespool #officepool #commissioner #fantasyfootball
```

**Alt text:** Six slides of tips for running a football squares pool: lock the board before kickoff, cap squares per player, pay out every quarter, make office pools free, and let the app call the winners.

### Thu, Nov 5, 12:00 PM · Reel: Jags in primetime

*Thursday Night Football · Jaguars at Ravens · 8:15 PM ET · Prime Video*

**Asset:** `out/m4-tnf-jaguars-ravens.mp4`, `out/m4-tnf-jaguars-ravens-cover.png`

**Caption:**

```text
Jags in primetime 🐆 Thursday Night Football: Jaguars at Ravens, 8:15 ET on Prime Video.

Make the board at lunch, drop the link in the group chat, lock it before kickoff. We'll call every quarter's winner.

Who's running the Duval board tonight? 👇

#duuuval #jaguars #thursdaynightfootball #footballsquares #squarespool
```

- Videos are exported silent. Add a trending sound (the ↗ arrow in the audio browser) with a build or drop. The chaos and the reveal are cut for it.
- Upload the matching cover image as the Reel cover so the profile grid stays clean.

### Fri, Nov 6, 12:15 PM · Task: Optional: comment-to-DM link

- [ ] Set up a comment keyword (e.g. BOARD) that DMs the app link (ManyChat or Meta's own automation).
- [ ] Then end one caption a week with “Comment BOARD and we'll DM you the link.” It's allowed because it delivers something.

### Sat, Nov 7, 11:00 AM · Reel: Miami at Notre Dame

*Miami at Notre Dame · 7:30 PM ET · NBC/Peacock*

**Asset:** `out/m5-miami-notre-dame.mp4`, `out/m5-miami-notre-dame-cover.png`

**Caption:**

```text
Saturday night in South Bend: Miami at Notre Dame, 7:30 ET on NBC 🏟️

College boards work exactly the same: create, share one link, lock it before kickoff. Free.

Canes or Irish? 👇

#collegefootball #canes #notredame #footballsquares #squarespool
```

- Videos are exported silent. Add a trending sound (the ↗ arrow in the audio browser) with a build or drop. The chaos and the reveal are cut for it.
- Upload the matching cover image as the Reel cover so the profile grid stays clean.

### Sun, Nov 8, 11:00 AM · Reel: On this day: Dempsey's 63-yarder (1970)

**Asset:** `out/otd3-nov08-dempsey.mp4`, `out/otd3-nov08-dempsey-cover.png`

**Caption:**

```text
On this day in 1970, Tom Dempsey kicked a 63-yard field goal at the gun. Saints 19, Lions 17 🦵

19–17 is a squares legend: the Miracle at the Meadowlands (1978) ended 19–17 too. The 9–7 square keeps cashing in chaos.

Got a 9 this week? 👀

#onthisday #nflhistory #saints #footballsquares #squarespool
```

- Videos are exported silent. Add a broadcast-style or nostalgic instrumental at low volume.
- Upload the matching cover image as the Reel cover so the profile grid stays clean.

### Sun, Nov 8, 8:00 PM · Task: Weekly review + creator outreach

- [ ] Weekly review (same as last Sunday).
- [ ] DM 5 micro-creators (Jax sports, Gators, fantasy football) with the creator template. Goal: 1 Collab for Nov 15.
- [ ] DM 3 local bars or office managers with the bar template (free boards only).

**Stories:**

- **Mon, Nov 2 7:00 PM** · MNF: Bears at Seahawks · sticker: Link → app. “MNF: Bears at Seahawks. Make the board before 8:15 👇”
- **Tue, Nov 3 12:00 PM** · Quiz: most common final · frame `s-story-frames/03` · sticker: Quiz: 20–17 / 23–20 ✓ / 27–24 / 24–17. “(Quiz sticker in the middle band.)”
- **Tue, Nov 3 8:15 PM** · First CFP rankings · sticker: Questions. “First CFP rankings are out. Who's your #1?”
- **Wed, Nov 4 6:00 PM** · Quiz answer: 23–20 · frame `s-story-frames/04` · sticker: None. “Answer frame.”
- **Thu, Nov 5 6:30 PM** · Jags board: lock by 8:15 · sticker: Link → app. “Jags board. Lock it by 8:15 🐆”
- **Thu, Nov 5 11:30 PM** · Which square cashed? · sticker: Questions. “Final: Jaguars __, Ravens __. That's the _–_ square. Who had it? 🙋” (Fill in the final score and digits after the game.)
- **Fri, Nov 6 12:00 PM** · 1869: the first college football game · sticker: None. “On this day in 1869: Rutgers 6, Princeton 4, the first college football game ever. If they'd had squares, 6–4 cashes. 🏈”
- **Sat, Nov 7 7:00 PM** · Miami at Notre Dame board · sticker: Link → app. “Canes at Irish in 30. Board's open 👇”
- **Sun, Nov 8 9:15 AM** · Madrid game · sticker: Link → app. “Breakfast football from Madrid 🇪🇸 Bengals vs Falcons at 9:30.”

## Week 3 · Nov 9–15: Community and creators

**Goal:** Founder story, first Collab post, first small boost on the best $0 Reel.

| Day | Time (ET) | Type | Post | Asset |
|---|---|---|---|---|
| Mon, Nov 9 | 2:00 PM | Reel | POV: you hit LOCK | `03-the-draw` |
| Mon, Nov 9 | 7:00 PM | Story | MNF: Bills at Vikings | — |
| Tue, Nov 10 | 1:00 PM | Reel | Winners light up | `06-winners-light-up` |
| Tue, Nov 10 | 1:30 PM | Task | Boost decision | — |
| Wed, Nov 11 | 9:00 AM | Story | Veterans Day | — |
| Wed, Nov 11 | 12:30 PM | Reel (film it) | Founder Reel: why we built it | — |
| Thu, Nov 12 | 12:00 PM | Task | Lock in Sunday's Collab | — |
| Thu, Nov 12 | 6:45 PM | Story | TNF: Commanders at Giants | `s-story-frames/06` |
| Fri, Nov 13 | 5:00 PM | Story | Friday night: FSU at Pitt | — |
| Sat, Nov 14 | 12:00 PM | Story | College Saturday | — |
| Sun, Nov 15 | 9:15 AM | Story | Munich game | — |
| Sun, Nov 15 | 11:00 AM | Reel | COLLAB: a free pool for your crew | `02-how-it-works-free` |
| Sun, Nov 15 | 8:00 PM | Task | Weekly review | — |

### Mon, Nov 9, 2:00 PM · Reel: POV: you hit LOCK

*Monday Night Football · Bills at Vikings · 8:15 PM ET · ESPN/ABC*

**Asset:** `out/03-the-draw.mp4`, `out/03-the-draw-cover.png`

**Caption:**

```text
POV: the board is full and you hit LOCK 🎲

The numbers draw live, right in front of everyone. Somebody gets 0–7. Somebody gets 2–2. Nobody can say you rigged it.

Send this to your commissioner 📲

#footballsquares #squarespool #mondaynightfootball #officepool #nfl
```

- Videos are exported silent. Add a trending sound (the ↗ arrow in the audio browser) with a build or drop. The chaos and the reveal are cut for it.
- Upload the matching cover image as the Reel cover so the profile grid stays clean.

### Tue, Nov 10, 1:00 PM · Reel: Winners light up

*NFL trade deadline 4 PM ET · CFP rankings 9 PM ET*

**Asset:** `out/06-winners-light-up.mp4`, `out/06-winners-light-up-cover.png`

**Caption:**

```text
Who won the quarter? The board already knows 🏆

Enter the score at Q1, Half, Q3 and Final and the winning square lights up with its payout. No math, no arguing, no “wait, which way do the numbers go?”

Send this to the friend who always does the math wrong.

#footballsquares #squarespool #officepool #nfl #fantasyfootball
```

- Videos are exported silent. In the Reels editor, add an upbeat instrumental from Instagram's audio library at low volume.
- Upload the matching cover image as the Reel cover so the profile grid stays clean.

### Tue, Nov 10, 1:30 PM · Task: Boost decision

- [ ] Compare sends per reach across the $0 creatives: 02, 04, 07 (and 03 if you re-cut it without the pot pill).
- [ ] Boost the winner with $50–150 over 5 days. Audience: US, 21+, football / fantasy football interests. Goal: profile visits.
- [ ] Judge it on boards created, not likes.

### Wed, Nov 11, 12:30 PM · Reel (film it): Founder Reel: why we built it

**Script:**

1. 0–2s (on-screen text): “I built a squares app because our group chat broke.”
1. 2–10s: hold up the old way. Show the whiteboard photo, the spreadsheet, the 99+ unread chat.
1. 10–25s: screen-record making a real board, start to share link (you recorded this in Prep).
1. 25–35s, to camera: “Free, no app, no signup. Numbers draw live, winners light up.”
1. 35–40s, ask: “What do we build next: Pick'em, Bracket Battles, or King of the Hill?”

**Caption:**

```text
Why we built JaxSquares 🟩 (and what's next)

Our squares pool lived in a group chat, a blurry whiteboard photo and a spreadsheet nobody could find. So we built the board we wanted: one link, everyone claims from their phone, numbers draw live, winners light up.

Next up: Pick'em, Bracket Battles or King of the Hill? Vote in the comments 👇

#buildinpublic #startup #jacksonville #footballsquares #squarespool
```

- Film vertical, natural light, captions on (Instagram's auto-captions are fine).

### Thu, Nov 12, 12:00 PM · Task: Lock in Sunday's Collab

- [ ] Confirm the creator or friend account for Sunday.
- [ ] Send them the 02 video and the caption. Post it from @jaxsquares and use Tag people → Invite collaborator.

### Sun, Nov 15, 11:00 AM · Reel: COLLAB: a free pool for your crew

*Jaguars at Titans · 1:00 PM ET · FOX*

**Asset:** `out/02-how-it-works-free.mp4`, `out/02-how-it-works-free-cover.png`

**Caption:**

```text
A free squares pool for your whole crew 🏈 No money, no app, no signup.

Set the price to $0 and play for bragging rights. Create the board, share one link, and we'll draw the numbers and call every quarter.

Jags at Titans at 1. Board's open 👇

#duuuval #footballsquares #squarespool #officepool #nfl
```

- Post as a Collab (Tag people → Invite collaborator).
- Videos are exported silent. In the Reels editor, add an upbeat instrumental from Instagram's audio library at low volume.
- Upload the matching cover image as the Reel cover so the profile grid stays clean.

### Sun, Nov 15, 8:00 PM · Task: Weekly review

- [ ] Weekly review.
- [ ] Reshare any boards people tagged you in (ask first).

**Stories:**

- **Mon, Nov 9 7:00 PM** · MNF: Bills at Vikings · sticker: Link → app. “MNF: Bills at Vikings. Draw your numbers live 🎲”
- **Wed, Nov 11 9:00 AM** · Veterans Day · sticker: None. “Thank you to everyone who served 🇺🇸” (Optional. Keep it simple, with no product mention.)
- **Thu, Nov 12 6:45 PM** · TNF: Commanders at Giants · frame `s-story-frames/06` · sticker: Link → app. “TNF: Commanders at Giants 👇”
- **Fri, Nov 13 5:00 PM** · Friday night: FSU at Pitt · sticker: Link → app. “Friday night football: FSU at Pitt, 7:00 on ESPN. Board? 👇”
- **Sat, Nov 14 12:00 PM** · College Saturday · sticker: Link → app. “College Saturday: Florida at Kentucky tonight · Duke at Miami. One board per game 👇” (Check kickoff times the week of. Florida–Kentucky was in a 6–8 PM window when this plan was written.)
- **Sun, Nov 15 9:15 AM** · Munich game · sticker: Link → app. “Breakfast football from Munich 🇩🇪 Patriots vs Lions at 9:30.”

## Week 4 · Nov 16–22: Road to Thanksgiving

**Goal:** Make JaxSquares the Thanksgiving plan: slate, playbook, Mexico City SNF.

| Day | Time (ET) | Type | Post | Asset |
|---|---|---|---|---|
| Mon, Nov 16 | 2:00 PM | Reel | Thanksgiving slate: 6 games, 6 boards | `08-thanksgiving-slate` |
| Mon, Nov 16 | 7:00 PM | Story | MNF: Chargers at Ravens | — |
| Tue, Nov 17 | 12:00 PM | Story | Thanksgiving boards poll | `s-story-frames/07` |
| Tue, Nov 17 | 9:30 PM | Story | CFP rankings reaction | — |
| Wed, Nov 18 | 12:30 PM | Carousel | Thanksgiving squares playbook | `c4-thanksgiving-playbook` |
| Thu, Nov 19 | 12:30 PM | Reel | On this day: Rams 54, Chiefs 51 (2018) | `otd4-nov19-rams-chiefs` |
| Thu, Nov 19 | 6:45 PM | Story | TNF: Colts at Texans | — |
| Fri, Nov 20 | 12:00 PM | Reel | On this day: The Play (1982) | `otd5-nov20-the-play` |
| Sat, Nov 21 | 11:00 AM | Story | College Saturday | — |
| Sun, Nov 22 | 11:30 AM | Story | Jags at Giants | `s-story-frames/06` |
| Sun, Nov 22 | 12:00 PM | Reel | SNF from Mexico City | `m6-snf-mexico-city` |
| Sun, Nov 22 | 8:00 PM | Task | Weekly review + Thanksgiving prep | — |

### Mon, Nov 16, 2:00 PM · Reel: Thanksgiving slate: 6 games, 6 boards

*Monday Night Football · Chargers at Ravens · 8:15 PM ET · ESPN*

**Asset:** `out/08-thanksgiving-slate.mp4`, `out/08-thanksgiving-slate-cover.png`

**Caption:**

```text
Thanksgiving week: 5 NFL games + Florida–FSU in 3 days 🦃🏈

Wed: Packers at Rams, 8:00 Netflix (the first-ever Thanksgiving Eve game)
Thu: Bears at Lions 1:00 CBS · Eagles at Cowboys 4:30 FOX · Chiefs at Bills 8:20 NBC
Fri: Broncos at Steelers 3:00 Prime · Florida at FSU 3:30 ABC

One board per game. Kids' table board = $0. Save this.

#thanksgivingfootball #thanksgiving #footballsquares #squarespool #friendsgiving
```

- Videos are exported silent. In the Reels editor, add an upbeat instrumental from Instagram's audio library at low volume.
- Upload the matching cover image as the Reel cover so the profile grid stays clean.
- Check the Florida–FSU kickoff the week of. ACC and CBS list 3:30; one outlet listed 8:30.

### Wed, Nov 18, 12:30 PM · Carousel: Thanksgiving squares playbook

**Asset:** `out/c4-thanksgiving-playbook/01.png`, `out/c4-thanksgiving-playbook/02.png`, `out/c4-thanksgiving-playbook/03.png`, `out/c4-thanksgiving-playbook/04.png`, `out/c4-thanksgiving-playbook/05.png`, `out/c4-thanksgiving-playbook/06.png`

**Caption:**

```text
The Thanksgiving squares playbook 🦃 Save it for next week.

One board per game, a $0 kids' table board, and stakes that aren't cash: loser does the dishes, winner gets the first plate.

Send this to whoever's hosting.

#thanksgiving #thanksgivingfootball #friendsgiving #footballsquares #familygamenight
```

**Alt text:** Six-slide Thanksgiving guide to football squares: the 2026 Thanksgiving week schedule, one board per game, a free kids' table board, and non-cash stakes like doing the dishes.

### Thu, Nov 19, 12:30 PM · Reel: On this day: Rams 54, Chiefs 51 (2018)

*Thursday Night Football · Colts at Texans · 8:15 PM ET · Prime Video*

**Asset:** `out/otd4-nov19-rams-chiefs.mp4`, `out/otd4-nov19-rams-chiefs-cover.png`

**Caption:**

```text
On this day in 2018: Rams 54, Chiefs 51 on Monday Night Football, the first NFL game where both teams scored 50+ 🤯

105 points, and the winning square was 4–1.

Send this to the friend who still talks about this game.

#onthisday #nflhistory #mondaynightfootball #footballsquares #squarespool
```

- Videos are exported silent. Add a broadcast-style or nostalgic instrumental at low volume.
- Upload the matching cover image as the Reel cover so the profile grid stays clean.

### Fri, Nov 20, 12:00 PM · Reel: On this day: The Play (1982)

**Asset:** `out/otd5-nov20-the-play.mp4`, `out/otd5-nov20-the-play-cover.png`

**Caption:**

```text
On this day in 1982: The Play. Five laterals, the Stanford band on the field, Cal wins 25–20 🎺

Stanford led 20–19 with four seconds left. The winning square flipped from 9–0 to 5–0 on the very last play. That's squares.

Send this to the most heartbroken squares player you know.

#onthisday #collegefootball #theplay #calbears #footballsquares
```

- Videos are exported silent. Add a broadcast-style or nostalgic instrumental at low volume.
- Upload the matching cover image as the Reel cover so the profile grid stays clean.

### Sun, Nov 22, 12:00 PM · Reel: SNF from Mexico City

*Sunday Night Football · Vikings vs. 49ers · Estadio Banorte, Mexico City · 8:20 PM ET · NBC*

**Asset:** `out/m6-snf-mexico-city.mp4`, `out/m6-snf-mexico-city-cover.png`

**Caption:**

```text
Squares go international 🇲🇽 Sunday Night Football from Mexico City: Vikings vs. 49ers, 8:20 ET on NBC.

Make the board during the early games, send the link, lock it by kickoff.

Who's taking the Vikings–49ers board? 👇

#sundaynightfootball #nfl #mexicocity #footballsquares #squarespool
```

- Videos are exported silent. Add a trending sound (the ↗ arrow in the audio browser) with a build or drop. The chaos and the reveal are cut for it.
- Upload the matching cover image as the Reel cover so the profile grid stays clean.

### Sun, Nov 22, 8:00 PM · Task: Weekly review + Thanksgiving prep

- [ ] Weekly review.
- [ ] Line up Thanksgiving: remind the 20 launch-day friends to make family boards.
- [ ] Ask 3 Collab partners to share the Thanksgiving playbook.

**Stories:**

- **Mon, Nov 16 7:00 PM** · MNF: Chargers at Ravens · sticker: Link → app. “MNF: Chargers at Ravens 👇”
- **Tue, Nov 17 12:00 PM** · Thanksgiving boards poll · frame `s-story-frames/07` · sticker: Poll: 1 / 2–3 / All of them. “(Poll sticker in the middle band.)”
- **Tue, Nov 17 9:30 PM** · CFP rankings reaction · sticker: Questions. “New CFP rankings. Who got robbed?”
- **Thu, Nov 19 6:45 PM** · TNF: Colts at Texans · sticker: Link → app. “TNF: Colts at Texans 👇”
- **Sat, Nov 21 11:00 AM** · College Saturday · sticker: Link → app. “College Saturday: Vandy at Florida · NC State at FSU. Board up? 👇” (Check kickoff times the week of.)
- **Sun, Nov 22 11:30 AM** · Jags at Giants · frame `s-story-frames/06` · sticker: Link → app. “Jags at Giants at 1. Lock the board 🐆”

## Bonus · Nov 23–29: Thanksgiving week payoff

**Goal:** One board per game, story coverage all day Thursday, collect user boards.

| Day | Time (ET) | Type | Post | Asset |
|---|---|---|---|---|
| Mon, Nov 23 | 2:00 PM | Reel | Every Thanksgiving family group chat | `05b-group-chat-thanksgiving` |
| Mon, Nov 23 | 7:00 PM | Story | MNF: Bengals at Commanders | — |
| Tue, Nov 24 | 12:00 PM | Story | Hosting Thursday? | `s-story-frames/07` |
| Wed, Nov 25 | 12:00 PM | Reel | Thanksgiving Eve: Packers at Rams | `m7-thanksgiving-eve` |
| Wed, Nov 25 | 7:00 PM | Story | Thanksgiving Eve board | — |
| Thu, Nov 26 | 9:30 AM | Reel | Happy Thanksgiving: Red Grange, 101 years ago | `otd6-nov26-grange` |
| Thu, Nov 26 | 12:30 PM | Story | Board 1: Bears at Lions | — |
| Thu, Nov 26 | 4:00 PM | Story | Board 2: Eagles at Cowboys | — |
| Thu, Nov 26 | 8:00 PM | Story | Board 3: Chiefs at Bills | — |
| Thu, Nov 26 | 10:30 PM | Story | Show us your boards | — |
| Fri, Nov 27 | 1:00 PM | Story | Leftovers board | — |
| Sat, Nov 28 | 11:00 AM | Story | Rivalry Saturday | — |
| Sun, Nov 29 | 3:30 PM | Story | Titans at Jaguars | — |
| Sun, Nov 29 | 8:00 PM | Task | Launch retro | — |

### Mon, Nov 23, 2:00 PM · Reel: Every Thanksgiving family group chat

*Monday Night Football · Bengals at Commanders · 8:15 PM ET · ESPN*

**Asset:** `out/05b-group-chat-thanksgiving.mp4`, `out/05b-group-chat-thanksgiving-cover.png`

**Caption:**

```text
Every Thanksgiving family group chat: “what's a square” “I call the 7–0” “spreadsheet attached” 😭🦃

Or… one link. Grandma claims from her phone, the numbers draw themselves, and the board calls the winner every quarter. Free.

Send this to the family group chat. You know the one.

#thanksgiving #familygroupchat #thanksgivingfootball #footballsquares #friendsgiving
```

- Videos are exported silent. Add a trending sound (the ↗ arrow in the audio browser) with a build or drop. The chaos and the reveal are cut for it.
- Upload the matching cover image as the Reel cover so the profile grid stays clean.

### Wed, Nov 25, 12:00 PM · Reel: Thanksgiving Eve: Packers at Rams

*Packers at Rams · 8:00 PM ET · Netflix · first-ever Thanksgiving Eve game*

**Asset:** `out/m7-thanksgiving-eve.mp4`, `out/m7-thanksgiving-eve-cover.png`

**Caption:**

```text
The first-ever Thanksgiving Eve NFL game: Packers at Rams, 8:00 ET on Netflix 🦃📺

Friendsgiving board, anyone? 20 seconds to make, one link to share, free to run.

Who's hosting Friendsgiving tonight? 👇

#thanksgivingeve #friendsgiving #thanksgivingfootball #footballsquares #nfl
```

- Videos are exported silent. Add a trending sound (the ↗ arrow in the audio browser) with a build or drop. The chaos and the reveal are cut for it.
- Upload the matching cover image as the Reel cover so the profile grid stays clean.

### Thu, Nov 26, 9:30 AM · Reel: Happy Thanksgiving: Red Grange, 101 years ago

**Asset:** `out/otd6-nov26-grange.mp4`, `out/otd6-nov26-grange-cover.png`

**Caption:**

```text
101 years ago today, Red Grange made his NFL debut on Thanksgiving. Bears 0, Cardinals 0 🦃

A 0–0 tie means the same square paid every quarter. Happy Thanksgiving from JaxSquares: three games today, three boards, one link each.

What's your square for Bears–Lions? 👇

#thanksgiving #thanksgivingfootball #onthisday #nflhistory #footballsquares
```

- Videos are exported silent. Add a broadcast-style or nostalgic instrumental at low volume.
- Upload the matching cover image as the Reel cover so the profile grid stays clean.

### Sun, Nov 29, 8:00 PM · Task: Launch retro

- [ ] Pull 6 weeks of insights: top 3 Reels by sends per reach, top carousel by saves.
- [ ] Boards created per week (query in KPIs). Compare with the posting calendar.
- [ ] Plan December around what worked: rivalry week, conference title games, the Big Game run-up.
- [ ] Post a thank-you carousel of the best user boards (with permission).

**Stories:**

- **Mon, Nov 23 7:00 PM** · MNF: Bengals at Commanders · sticker: Link → app. “MNF: Bengals at Commanders 👇”
- **Tue, Nov 24 12:00 PM** · Hosting Thursday? · frame `s-story-frames/07` · sticker: Link → app. “Hosting Thursday? Make your boards tonight. 20 seconds each 🦃”
- **Wed, Nov 25 7:00 PM** · Thanksgiving Eve board · sticker: Link → app. “Packers at Rams in an hour. Friendsgiving board 👇”
- **Thu, Nov 26 12:30 PM** · Board 1: Bears at Lions · sticker: Link → app. “Board 1 of 3: Bears at Lions, 1:00 🦃”
- **Thu, Nov 26 4:00 PM** · Board 2: Eagles at Cowboys · sticker: Link → app. “Board 2 of 3: Eagles at Cowboys, 4:30 🦃”
- **Thu, Nov 26 8:00 PM** · Board 3: Chiefs at Bills · sticker: Link → app. “Nightcap board: Chiefs at Bills, 8:20 🦃”
- **Thu, Nov 26 10:30 PM** · Show us your boards · sticker: Add Yours. “Show us your Thanksgiving board 📸 Screenshot + tag @jaxsquares”
- **Fri, Nov 27 1:00 PM** · Leftovers board · sticker: Link → app. “Leftovers board 🥪 Broncos at Steelers 3:00 · Florida at FSU 3:30”
- **Sat, Nov 28 11:00 AM** · Rivalry Saturday · sticker: Link → app. “Rivalry Saturday. One board per game 👇”
- **Sun, Nov 29 3:30 PM** · Titans at Jaguars · sticker: Link → app. “Jags home at 4:05. Last board of the holiday weekend 🐆”

## Research behind this plan

Summaries of the Oct 19, 2026 research (Instagram ranking and cadence, sports-app case studies, the 2026 NFL and college calendars, verified on-this-day facts) are in `research/`. Squares odds come from nflverse `games.csv` (NFL final scores 1999–2025) via `marketing/studio/scripts/digit_odds.py`.
