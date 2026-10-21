# JaxSquares Instagram Launch

A 4-week Instagram launch for @jaxsquares (Oct 26 – Nov 22, 2026), plus a prep week and a Thanksgiving-week bonus. All times US Eastern. Every post's asset is rendered from code in `marketing/studio`; run `npm run marketing:render` to regenerate them into `marketing/out/`.

## Start here

Do these in order. Each one is a step in the calendar page's Start here list.

1. **Wed, Oct 21, 2:30 PM** · Profile 1/7: Switch to a professional account
2. **Wed, Oct 21, 2:35 PM** · Profile 2/7: Profile picture
3. **Wed, Oct 21, 2:40 PM** · Profile 3/7: Name and username
4. **Wed, Oct 21, 2:45 PM** · Profile 4/7: Bio
5. **Wed, Oct 21, 2:50 PM** · Profile 5/7: Link
6. **Wed, Oct 21, 2:55 PM** · Profile 6/7: Privacy, sharing and security
7. **Wed, Oct 21, 3:00 PM** · Profile 7/7: Saved replies
8. **Wed, Oct 21, 5:00 PM** · Grid 1/9: JaxSquares is live
9. **Wed, Oct 21, 5:05 PM** · Grid 2/9: Scores update themselves
10. **Wed, Oct 21, 5:10 PM** · Grid 3/9: Jax draws the numbers
11. **Wed, Oct 21, 5:20 PM** · Grid story: the board is open
12. **Thu, Oct 22, 12:30 PM** · Grid 4/9: Your square hits (the gold one)
13. **Thu, Oct 22, 12:35 PM** · Grid 5/9: Meet Jax
14. **Thu, Oct 22, 12:40 PM** · Grid 6/9: Text one link
15. **Thu, Oct 22, 12:50 PM** · Grid story: 6 of 9
16. **Fri, Oct 23, 1:00 PM** · Grid 7/9: Free to set up
17. **Fri, Oct 23, 1:05 PM** · Grid 8/9: No app needed
18. **Fri, Oct 23, 1:10 PM** · Grid 9/9: Football and basketball squares
19. **Fri, Oct 23, 1:20 PM** · Grid story: board's full
20. **Fri, Oct 23, 2:00 PM** · Profile: Highlights

## Positioning

Football and basketball squares, run by Jax and live now at jaxsquares.com. No app for players, no signup, no math, and no money between players: JaxSquares never collects or sends it. Free to set up and invite; boards with up to 5 players draw free, bigger boards are a $4.99 host fee (or the $19.99/yr Host Pass). Competitors charge per grid ($10–$13), need a download, or need an account. Nobody in the category has a personality-led Instagram, and nobody else has a dog.

## Content pillars

| Pillar | Share | What |
|---|---|---|
| Show the product | 35% | Real-app demos: the 30-second setup, Let Jax pick, the live draw, winners lighting up. Every video is screen footage of the real app. |
| Squares nerdery | 25% | Real numbers from 7,276 NFL finals: best/worst squares, digit tiers, most common scores. Built to be saved and sent. |
| This game, this week | 25% | Primetime, Jaguars, Gators and Thanksgiving games. Make the board the plan for the game. |
| On this day | 15% | Verified history with a squares twist: which square that famous final score landed on. |

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

- Say 'the big game', never 'Super Bowl', in posts and ads (NFL trademark). Team names are fine to identify a game. No logos, uniforms, team colors, broadcast footage or player photos.
- Never use the words the app bans: bet, wager, pot, payout, buy-in, jackpot, odds, stakes, gamble (and 'cash out'). Say 'board', 'square price', 'prize', 'bragging rights'.
- No money between players, ever. JaxSquares never collects, holds or sends it, so never imply it handles winnings. Prizes in captions are notes: 'loser buys wings', 'winner skips dish duty'.
- 'Free' means free to set up, invite and pick squares, and free to draw with up to 5 players. Bigger boards have a $4.99 host fee at the draw (the Host Pass covers it). Say 'free to set up'; never call a big board totally free. Players never pay.
- Paid boosts: only creatives with no amounts on screen (true of every video here; the Just for fun ones are safest). Meta requires prior written permission for ads where money is part of both entry and prize. Boost candidates: 02, 04, 07.
- Bars and offices: pitch Just for fun boards with no purchase needed to pick a square.
- Giveaways need official rules, eligibility, and a 'not sponsored by Instagram' line. Don't require follows or tags to enter. Skip them for this launch.
- Keep 'Not affiliated w/ NFL, NBA or NCAA' in the bio.

## Measure

- **Boards created (north star):** `npx wrangler d1 execute jaxsquares --remote --command "SELECT date(created_at/1000,'unixepoch') AS day, COUNT(*) AS boards FROM games GROUP BY day ORDER BY day DESC LIMIT 14"`
- **Sends per reach and skip rate:** Reel insights. Double down on whatever gets sent.
- **Saves:** Carousel insights. Saves mean the data and how-to content is working.
- **Profile visits → link taps:** Professional dashboard. If taps lag visits, rewrite the bio's first line.

Stretch targets, not forecasts: 400+ followers and 150+ boards created by Nov 29, and one Reel past 10k views. Benchmarks for brand-new accounts are thin; the boards count matters more than followers.

## Profile setup

- **Name field:** JaxSquares · Football & Basketball Squares
- **Bio:**

  ```
  Football & basketball squares 🏈🏀
  Free to set up · no app · no signup
  Jax draws numbers, live scores call winners
  Not affiliated w/ NFL, NBA or NCAA 👇
  ```
- **Link:** https://jaxsquares.com/?ref=ig (title: “Make a board”; the ?ref=ig makes Instagram visits show up in Cloudflare analytics).
- **Highlights:** How it works, Square stats, Game days, Thanksgiving
- **Category:** Sports & Recreation. It tells visitors this is a sports account. Avoid App Page: the label sits under your name and contradicts “no app to download”. Website is the most literal fallback. You can also hide the label in Edit profile.
- **Profile picture:** `out/p-profile-picture/01.png` (Option 1 (recommended): Jax over the board, the app icon. A face reads at every size.); `out/p-profile-picture/02.png` (Option 2: the website's 3×3 mark with the gold winning square)

## Launch grid (3×3)

Your first nine posts turn the profile into the JaxSquares mark: a 3×3 board in volt with the winning square in gold. Each square is its own two-slide post (a bold tile, then the real app behind it), so it works alone in the feed too. Instagram fills the grid newest-first from the top left, so the board goes up from the bottom, one row a day: Wednesday, Thursday, Friday.

Preview of the profile on launch day: `out/g-grid-preview/01.png`

- Set up the profile first (steps 1–7), then post each row's three squares back to back, in the order given (1 → 9). Whole rows keep the logo lined up while it fills.
- Don't pin anything: pinned posts jump to the top of the grid and break the logo.
- After the grid, the two weekend seed posts and the launch Reel on Monday make exactly one new row, so the logo sits lined up right under it on launch day.
- Later posts slide the board down a square at a time. It lines up again whenever the posts since launch reach a multiple of three; in between, every tile is still a whole board square, so it reads as a board.

| # | When (ET) | Square |
|---|---|---|
| 1 | Wed, Oct 21 5:00 PM | Grid 1/9: JaxSquares is live |
| 2 | Wed, Oct 21 5:05 PM | Grid 2/9: Scores update themselves |
| 3 | Wed, Oct 21 5:10 PM | Grid 3/9: Jax draws the numbers |
| 4 | Thu, Oct 22 12:30 PM | Grid 4/9: Your square hits (the gold one) |
| 5 | Thu, Oct 22 12:35 PM | Grid 5/9: Meet Jax |
| 6 | Thu, Oct 22 12:40 PM | Grid 6/9: Text one link |
| 7 | Fri, Oct 23 1:00 PM | Grid 7/9: Free to set up |
| 8 | Fri, Oct 23 1:05 PM | Grid 8/9: No app needed |
| 9 | Fri, Oct 23 1:10 PM | Grid 9/9: Football and basketball squares |

## Outreach templates

- **Creators:** Hey [name]! Love your [team] content. We built JaxSquares: football and basketball squares, no download or signup for players. Want to run a Just for fun followers' board for [game]? We set it up (on us), you share the link, and we co-post the Reel as a Collab. Costs you and your followers nothing.
- **Bars / offices:** Hi! We make JaxSquares, a squares board your regulars join with a QR code or link. No app, and no purchase needed to play. Want us to set up a Just for fun board for [game] for your crowd (on us)?
- **UGC ask:** Screenshot your board and tag @jaxsquares. We reshare the best ones (with your OK).

## Prep · Oct 20–25: Set up and seed the grid

**Goal:** Profile set up step by step, the 3×3 launch grid (one row a day, Wed–Fri), Highlights, then two seed posts on the weekend.

| Day | Time (ET) | Type | Post | Asset |
|---|---|---|---|---|
| Wed, Oct 21 | 2:30 PM | Task | Profile 1/7: Switch to a professional account | — |
| Wed, Oct 21 | 2:35 PM | Task | Profile 2/7: Profile picture | — |
| Wed, Oct 21 | 2:40 PM | Task | Profile 3/7: Name and username | — |
| Wed, Oct 21 | 2:45 PM | Task | Profile 4/7: Bio | — |
| Wed, Oct 21 | 2:50 PM | Task | Profile 5/7: Link | — |
| Wed, Oct 21 | 2:55 PM | Task | Profile 6/7: Privacy, sharing and security | — |
| Wed, Oct 21 | 3:00 PM | Task | Profile 7/7: Saved replies | — |
| Wed, Oct 21 | 5:00 PM | Carousel | Grid 1/9: JaxSquares is live | `g1-jaxsquares-is-live` |
| Wed, Oct 21 | 5:05 PM | Carousel | Grid 2/9: Scores update themselves | `g2-scores-update-themselves` |
| Wed, Oct 21 | 5:10 PM | Carousel | Grid 3/9: Jax draws the numbers | `g3-jax-draws-the-numbers` |
| Wed, Oct 21 | 5:20 PM | Story | Grid story: the board is open | `s-grid-progress/01` |
| Thu, Oct 22 | 12:30 PM | Carousel | Grid 4/9: Your square hits (the gold one) | `g4-your-square-hits` |
| Thu, Oct 22 | 12:35 PM | Carousel | Grid 5/9: Meet Jax | `g5-meet-jax` |
| Thu, Oct 22 | 12:40 PM | Carousel | Grid 6/9: Text one link | `g6-text-one-link` |
| Thu, Oct 22 | 12:50 PM | Story | Grid story: 6 of 9 | `s-grid-progress/02` |
| Thu, Oct 22 | 6:00 PM | Task | Record a real test board (B-roll) | — |
| Thu, Oct 22 | 6:45 PM | Story | TNF: Patriots at Bears | `s-story-frames/06` |
| Fri, Oct 23 | 1:00 PM | Carousel | Grid 7/9: Free to set up | `g7-free-to-set-up` |
| Fri, Oct 23 | 1:05 PM | Carousel | Grid 8/9: No app needed | `g8-no-app-needed` |
| Fri, Oct 23 | 1:10 PM | Carousel | Grid 9/9: Football and basketball squares | `g9-football-and-basketball` |
| Fri, Oct 23 | 1:20 PM | Story | Grid story: board's full | `s-grid-progress/03` |
| Fri, Oct 23 | 2:00 PM | Task | Profile: Highlights | — |
| Sat, Oct 24 | 11:00 AM | Story | College Saturday slate | — |
| Sat, Oct 24 | 12:00 PM | Carousel | Seed post: how football squares works | `c1-how-squares-works` |
| Sun, Oct 25 | 9:15 AM | Story | Breakfast football from Paris | — |
| Sun, Oct 25 | 11:30 AM | Story | Game day checklist | `s-story-frames/06` |
| Sun, Oct 25 | 12:00 PM | Reel | Seed post: best and worst squares | `04-best-worst-squares` |
| Sun, Oct 25 | 7:30 PM | Story | SNF: Chiefs at Seahawks poll | — |

### Wed, Oct 21, 2:30 PM · Task: Profile 1/7: Switch to a professional account

- [ ] Instagram → your profile → ☰ → Account type and tools → Switch to professional account.
- [ ] Choose Business (a brand, not a person): it unlocks insights, contact options and boosting.
- [ ] Category: search “Sports & Recreation” and pick it. Leave “Display on profile” on.
- [ ] Skip the contact and Facebook steps for now (step 6 has the optional email).

**Category:**

```text
Sports & Recreation
```

- Not App Page: that label sits under your name and contradicts “no app to download”.

### Wed, Oct 21, 2:35 PM · Task: Profile 2/7: Profile picture

**Asset:** `out/p-profile-picture/01.png`, `out/p-profile-picture/02.png`

- [ ] Save the picture to your phone (Save, above).
- [ ] Edit profile → Edit picture → Choose from library → pick it.
- [ ] It's built for the circle crop: don't zoom or move it. Jax's face sits in the middle, the gold square top right.

### Wed, Oct 21, 2:40 PM · Task: Profile 3/7: Name and username

- [ ] Edit profile → Name: paste the name. The name field is searchable, so “Football & Basketball Squares” helps people find you either way.
- [ ] Username: make sure it's jaxsquares (the whole plan uses @jaxsquares).
- [ ] Instagram allows two name changes every 14 days, so paste it carefully.

**Name:**

```text
JaxSquares · Football & Basketball Squares
```

**Username:**

```text
jaxsquares
```

### Wed, Oct 21, 2:45 PM · Task: Profile 4/7: Bio

- [ ] Edit profile → Bio → paste the bio. Keep the line breaks.
- [ ] 149 characters, inside Instagram's 150. Leave Pronouns empty.

**Bio:**

```text
Football & basketball squares 🏈🏀
Free to set up · no app · no signup
Jax draws numbers, live scores call winners
Not affiliated w/ NFL, NBA or NCAA 👇
```

### Wed, Oct 21, 2:50 PM · Task: Profile 5/7: Link

- [ ] Edit profile → Links → Add external link.
- [ ] Paste the URL and the title. The ?ref=ig shows Instagram visits in Cloudflare analytics.
- [ ] Tap the link on your profile once to check it opens jaxsquares.com.

**URL:**

```text
https://jaxsquares.com/?ref=ig
```

**Title:**

```text
Make a board
```

### Wed, Oct 21, 2:55 PM · Task: Profile 6/7: Privacy, sharing and security

- [ ] Settings → Account privacy: Private account off (public).
- [ ] Settings → Sharing and reuse: allow sharing posts and reels to stories, remixing and downloads. Shares and sends are how new people find you.
- [ ] Settings → Notifications: comments, mentions and messages on, so you can reply within the hour.
- [ ] Accounts Center → Password and security → Two-factor authentication: on. It's the brand account; keep it locked down.
- [ ] Optional: Edit profile → Contact options → add a business email you check.

### Wed, Oct 21, 3:00 PM · Task: Profile 7/7: Saved replies

- [ ] Settings → Business tools and controls → Saved replies → add the three above (shortcut, then message).
- [ ] In a DM or comment reply, type the shortcut and tap the suggestion to send it.

**Shortcut “link”:**

```text
Here's the link: https://jaxsquares.com 🏈 Make a board, text it to your crew, and everyone picks from their phone.
```

**Shortcut “free”:**

```text
Free to set up and invite, and free to draw with up to 5 players. Bigger boards are $4.99 for the host. Players never pay.
```

**Shortcut “app”:**

```text
No app needed. Friends tap the link and pick their squares from any phone. Same room? They can scan the code.
```

### Wed, Oct 21, 5:00 PM · Carousel: Grid 1/9: JaxSquares is live

**Asset:** `out/g1-jaxsquares-is-live/01.png`, `out/g1-jaxsquares-is-live/02.png`

**Caption:**

```text
JaxSquares is live 🟩 Square 1 of 9.

It's the squares app for football and basketball season. Pick an NFL, college or NBA game, text your crew one link, and everyone picks squares from their own phone. Jax draws the numbers and live scores call every winner.

Free to set up at jaxsquares.com (link in bio). Watch this grid fill up this week 👀

#footballsquares #squarespool #basketballsquares #gameday
```

**Alt text:** A bright green board square with the JaxSquares logo, a 3 by 3 board with one gold square, reading “JaxSquares is live” over jaxsquares.com: the squares app for football and basketball games. Slide 2 lists three steps: pick a football or basketball game, text your crew one link, Jax draws the numbers and live scores call every winner.

- Launch grid, bottom row (bottom right). Post squares 1, 2 and 3 back to back, in order.

### Wed, Oct 21, 5:05 PM · Carousel: Grid 2/9: Scores update themselves

**Asset:** `out/g2-scores-update-themselves/01.png`, `out/g2-scores-update-themselves/02.png`

**Caption:**

```text
Square 2 of 9 📺 Scores update themselves.

Pick an NFL, college football, NBA or college basketball game and the board follows it live: who's winning right now, and the score that would change it. No refreshing a score app, no math.

Send this to whoever keeps score with a pen.

#footballsquares #basketballsquares #nfl #collegefootball
```

**Alt text:** A green board square reading “Scores update themselves”: square 2 of 9. Slide 2 shows the JaxSquares scoreboard at 16 to 13 with the next winner called out.

- Launch grid, bottom row (middle).

### Wed, Oct 21, 5:10 PM · Carousel: Grid 3/9: Jax draws the numbers

**Asset:** `out/g3-jax-draws-the-numbers/01.png`, `out/g3-jax-draws-the-numbers/02.png`

**Caption:**

```text
Square 3 of 9 🔢 Jax draws the numbers.

Once the board is full, 0–9 get shuffled live for both teams, right in front of everyone. Nobody can say the host rigged it.

Send this to your board's most suspicious player.

#footballsquares #squarespool #gameday
```

**Alt text:** A green board square reading “Jax draws the numbers”: square 3 of 9. Slide 2 shows the app's “The numbers are in!” screen with digits across both team axes.

- Launch grid, bottom row (bottom left). The bottom row is done.

### Thu, Oct 22, 12:30 PM · Carousel: Grid 4/9: Your square hits (the gold one)

**Asset:** `out/g4-your-square-hits/01.png`, `out/g4-your-square-hits/02.png`

**Caption:**

```text
Square 4 of 9 🏆 Every board has a winning square. This is ours.

Live scores light up the winner every quarter, and their phone gets the news. Prizes are whatever your crew says: wings, dish duty, bragging rights.

Who always wins your squares? 👇

#footballsquares #officepool #gameday
```

**Alt text:** A gold board square with a trophy reading “Your square hits”: square 4 of 9, the winning square of the launch grid. Slide 2 shows the app's “You won!” banner at the end of the third quarter.

- Launch grid, middle row (middle right): the gold square. Post squares 4, 5 and 6 back to back, in order.

### Thu, Oct 22, 12:35 PM · Carousel: Grid 5/9: Meet Jax

**Asset:** `out/g5-meet-jax/01.png`, `out/g5-meet-jax/02.png`

**Caption:**

```text
Square 5 of 9 🐶 Meet Jax.

JaxSquares is named after him. Can't decide where to go on the board? Tap “Let Jax pick” and he grabs random open squares for you. No favorites (unless you count treats).

Drop a 🐶 if you'd let Jax pick.

#footballsquares #dogsofinstagram #gameday
```

**Alt text:** A green board square with an illustration of Jax, a tan and white dog in a harness, reading “Meet Jax”: square 5 of 9. Slide 2 shows the app after “Let Jax pick” chose 5 squares.

- Launch grid, center square.

### Thu, Oct 22, 12:40 PM · Carousel: Grid 6/9: Text one link

**Asset:** `out/g6-text-one-link/01.png`, `out/g6-text-one-link/02.png`

**Caption:**

```text
Square 6 of 9 💬 Text one link.

Drop it in the group chat and everyone picks squares from their own phone. No spreadsheet, no whiteboard photo, no “wait, who has row 4?”

Send this to the person who runs your squares 📲

#footballsquares #groupchat #officepool
```

**Alt text:** A green board square reading “Text one link”: square 6 of 9. Slide 2 shows the app's invite sheet with the message “Grab a square on my Harbor Hawks vs Ridge Wolves board”.

- Launch grid, middle row (middle left). The middle row is done.

### Thu, Oct 22, 6:00 PM · Task: Record a real test board (B-roll)

- [ ] Make a board for tonight's TNF game with 3 friends.
- [ ] Screen-record making it and sharing the link: B-roll for the founder Reel (Nov 11).

### Fri, Oct 23, 1:00 PM · Carousel: Grid 7/9: Free to set up

**Asset:** `out/g7-free-to-set-up/01.png`, `out/g7-free-to-set-up/02.png`

**Caption:**

```text
Square 7 of 9 ✨ Free to set up.

Making a board, inviting friends and picking squares are free, and players never pay a thing. Boards with up to 5 players draw free; bigger boards are $4.99 for the host at the draw, or covered by a Host Pass. JaxSquares never collects or sends money between players.

Two squares left 👀

#footballsquares #squarespool #officepool
```

**Alt text:** A green board square reading “Free to set up”: square 7 of 9. Slide 2 shows the app's review step with Just for fun selected and the line “Free to set up and invite. Free to draw with up to 5 players, $4.99 for bigger boards.”

- Launch grid, top row (top right). Post squares 7, 8 and 9 back to back, in order.

### Fri, Oct 23, 1:05 PM · Carousel: Grid 8/9: No app needed

**Asset:** `out/g8-no-app-needed/01.png`, `out/g8-no-app-needed/02.png`

**Caption:**

```text
Square 8 of 9 📲 No app needed.

Friends tap the link and pick: nothing to download, no account to make. Same room? They scan the code on your screen.

One square left 👀

#footballsquares #gameday #squarespool
```

**Alt text:** A green board square reading “No app needed”: square 8 of 9. Slide 2 shows the app's invite sheet with a QR code and a six-letter join code.

- Launch grid, top row (top middle).

### Fri, Oct 23, 1:10 PM · Carousel: Grid 9/9: Football and basketball squares

**Asset:** `out/g9-football-and-basketball/01.png`, `out/g9-football-and-basketball/02.png`

**Caption:**

```text
Square 9 of 9 🏈🏀 The board's full, and that's our logo up there.

JaxSquares runs football and basketball squares, live now. Pick an NFL or college football game, an NBA or college basketball game, or type in any matchup. Choose how squares win and your board is ready in about 30 seconds.

Football season, then basketball season, then the big game. Make yours → link in bio

#footballsquares #squarespool #basketballsquares #nfl #nba
```

**Alt text:** A bright green board square with a football and a basketball reading “Football and basketball squares. Set up in 30 seconds. Live now.”: square 9 of 9, completing the JaxSquares launch grid. Slide 2 shows the app's game picker with Football and Basketball tabs, NFL and college games, and a custom option.

- Launch grid, top row (top left): the last square. Open your profile and check the logo lines up.

### Fri, Oct 23, 2:00 PM · Task: Profile: Highlights

**Asset:** `out/p-highlight-covers/01.png`, `out/p-highlight-covers/02.png`, `out/p-highlight-covers/03.png`, `out/p-highlight-covers/04.png`

- [ ] Save the 4 covers (above).
- [ ] Profile → + → Highlight → pick the 3 grid stories → name it “How it works” → Edit cover → choose the “How it works” cover.
- [ ] Make “Game days” from the TNF story (Thu) with its cover.
- [ ] Add “Square stats” after the Oct 27–28 poll stories and “Thanksgiving” in November, each with its cover.

**Highlight 1:**

```text
How it works
```

**Highlight 2:**

```text
Game days
```

**Highlight 3:**

```text
Square stats
```

**Highlight 4:**

```text
Thanksgiving
```

### Sat, Oct 24, 12:00 PM · Carousel: Seed post: how football squares works

**Asset:** `out/c1-how-squares-works/01.png`, `out/c1-how-squares-works/02.png`, `out/c1-how-squares-works/03.png`, `out/c1-how-squares-works/04.png`, `out/c1-how-squares-works/05.png`, `out/c1-how-squares-works/06.png`, `out/c1-how-squares-works/07.png`

**Caption:**

```text
How football squares works, in 7 slides 🏈

The grid, the draw, the last-digit rule and how a quarter gets won. Save this for game day.

Send it to the person who always asks “wait, which square is mine?”

Set up your own board free → link in bio

#footballsquares #squarespool #officepool #fantasyfootball #gameday
```

**Alt text:** Seven-slide explainer of football squares: a 10 by 10 grid, friends pick squares, digits 0 to 9 are drawn for each row and column, and the last digit of each team's score picks the winning square each quarter.

- Seed row: this, Sunday's Reel and the launch Reel make one row over the grid. Don't pin it: pinned posts jump to the top and break the grid.

### Sun, Oct 25, 12:00 PM · Reel: Seed post: best and worst squares

**Asset:** `out/04-best-worst-squares.mp4`, `out/04-best-worst-squares-cover.png`

**Caption:**

```text
The best and worst squares in football, from 7,276 NFL final scores 📊

0–7 lands on 3.6% of finals. 2–2 has hit 4 times since 1999. 💀

Send this to whoever drew 2–2 this week.

#footballsquares #squarespool #nfl #footballstats #fantasyfootball
```

- Has its own soundtrack, with the drop on the reveal. To ride a trending sound instead (the ↗ arrow in the audio browser), add it in the Reels editor and turn the original audio down to 0–20%.
- Upload the matching cover image as the Reel cover so the profile grid stays clean.
- Top boost candidate (no money on screen).
- Data: nflverse games.csv, NFL finals 1999–2025.

**Stories:**

- **Wed, Oct 21 5:20 PM** · Grid story: the board is open · frame `s-grid-progress/01` · sticker: Link → app. “Our grid is a squares board 🟩 3 of 9 squares claimed.”
- **Thu, Oct 22 12:50 PM** · Grid story: 6 of 9 · frame `s-grid-progress/02` · sticker: Emoji slider 🟩. “6 of 9 squares claimed 👀 The last 3 drop tomorrow.”
- **Thu, Oct 22 6:45 PM** · TNF: Patriots at Bears · frame `s-story-frames/06` · sticker: Link → app. “TNF: Patriots at Bears, 8:15 on Prime. Board takes 30 seconds 👇”
- **Fri, Oct 23 1:20 PM** · Grid story: board's full · frame `s-grid-progress/03` · sticker: Link → app. “Board's full. That's our logo 🟩 Tap to make yours.”
- **Sat, Oct 24 11:00 AM** · College Saturday slate · sticker: Link → app. “College Saturday 🏈 / BYU at UCF · 3:30 FOX / Ole Miss at Texas · 7:30 ABC / Houston at Utah · 10:15 ESPN / Running a board? 👇”
- **Sun, Oct 25 9:15 AM** · Breakfast football from Paris · sticker: Link → app. “Breakfast football from Paris 🇫🇷 Steelers vs Saints at 9:30. Coffee + a squares board?”
- **Sun, Oct 25 11:30 AM** · Game day checklist · frame `s-story-frames/06` · sticker: Link → app. “(Frame says it all.) Draw before the 1:00 kickoffs.”
- **Sun, Oct 25 7:30 PM** · SNF: Chiefs at Seahawks poll · sticker: Poll: Yes / No. “SNF: do the Chiefs stay unbeaten?”

## Week 1 · Oct 26–Nov 1: Launch: what it is

**Goal:** Launch on Cowboys–Eagles MNF. Personal push to friends and group chats. First 25 boards.

| Day | Time (ET) | Type | Post | Asset |
|---|---|---|---|---|
| Mon, Oct 26 | 1:30 PM | Task | Launch prep | — |
| Mon, Oct 26 | 2:00 PM | Reel | LAUNCH: How it works in 30 seconds | `01-how-it-works` |
| Mon, Oct 26 | 2:10 PM | Task | Personal push | — |
| Mon, Oct 26 | 6:30 PM | Story | MNF board is open | `m1-mnf-cowboys-eagles` |
| Mon, Oct 26 | 9:30 PM | Story | Q1 poll | — |
| Tue, Oct 27 | 1:00 PM | Reel | On this day: Emmitt breaks the record (2002) | `otd1-oct27-emmitt` |
| Tue, Oct 27 | 6:00 PM | Story | Poll: 0–0 or 7–7? | `s-story-frames/01` |
| Wed, Oct 28 | 12:30 PM | Carousel | Every square, ranked | `c2-every-square-ranked` |
| Wed, Oct 28 | 6:00 PM | Story | Poll answer | `s-story-frames/02` |
| Thu, Oct 29 | 12:30 PM | Reel | Every squares group chat | `05-group-chat` |
| Thu, Oct 29 | 6:45 PM | Story | TNF: Panthers at Packers | — |
| Fri, Oct 30 | 12:30 PM | Reel | Feature rundown | `07-features` |
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
- [ ] Line up 20 friends who run (or play in) squares and 3 group chats to post in.
- [ ] Ask 5 friends to share the launch Reel to their stories at 2:05.

### Mon, Oct 26, 2:00 PM · Reel: LAUNCH: How it works in 30 seconds

*Monday Night Football · Cowboys at Eagles · 8:15 PM ET · ESPN/ABC*

**Asset:** `out/01-how-it-works.mp4`, `out/01-how-it-works-cover.png`

**Caption:**

```text
Squares, fixed. JaxSquares is live 🏈🐶

Pick the game, text one link, and everyone grabs squares from their phone. Jax draws the numbers live, scores update themselves, and the winning square lights up every quarter.

Free to set up. No app. No signup. Running a Cowboys–Eagles board tonight? Link in bio.

#footballsquares #squarespool #mondaynightfootball #officepool #nfl
```

- Has its own soundtrack: original JaxSquares music, cut to the video, so post it as is (it shows as Original audio, and it's yours to boost).
- Upload the matching cover image as the Reel cover so the profile grid stays clean.
- Don't pin it: pinned posts jump to the top of the grid and break the logo.

### Mon, Oct 26, 2:10 PM · Task: Personal push

- [ ] Share the Reel to your personal story and to the 3 group chats.
- [ ] Text the 20 people directly: “made this for our squares, try it tonight for MNF?”
- [ ] Reply to every comment for the next hour.

### Tue, Oct 27, 1:00 PM · Reel: On this day: Emmitt breaks the record (2002)

**Asset:** `out/otd1-oct27-emmitt.mp4`, `out/otd1-oct27-emmitt-cover.png`

**Caption:**

```text
On this day in 2002, former Gator Emmitt Smith passed Walter Payton for the NFL's career rushing record 🐊🏈

The final? Seahawks 17, Cowboys 14. History for Emmitt, and the 7–4 square for somebody's board.

What square would you have had? 👇

#onthisday #nflhistory #gogators #emmittsmith #footballsquares
```

- Has its own retro soundtrack (original music). Post it as is.
- Upload the matching cover image as the Reel cover so the profile grid stays clean.

### Wed, Oct 28, 12:30 PM · Carousel: Every square, ranked

**Asset:** `out/c2-every-square-ranked/01.png`, `out/c2-every-square-ranked/02.png`, `out/c2-every-square-ranked/03.png`, `out/c2-every-square-ranked/04.png`, `out/c2-every-square-ranked/05.png`, `out/c2-every-square-ranked/06.png`

**Caption:**

```text
Every square in football, ranked 📊 (7,276 NFL final scores, 1999–2025)

S-tier digits: 0 and 7. D-tier: 2 and 5. The 2–2 square has hit 4 times in 27 seasons.

Save this before your next draw, and send it to your board's 2–2 holder.

#footballsquares #squarespool #nfl #footballstats #fantasyfootball
```

**Alt text:** Heat map and rankings of football squares by how often NFL final scores land on them since 1999. Best: 0-7, 4-7 and 0-3. Worst: 2-2, 5-5 and 5-9. Most common final since 1999: 23-20.

### Thu, Oct 29, 12:30 PM · Reel: Every squares group chat

*Thursday Night Football · Panthers at Packers · 8:15 PM ET · Prime Video*

**Asset:** `out/05-group-chat.mp4`, `out/05-group-chat-cover.png`

**Caption:**

```text
Every squares group chat: “who has the 7–3??” “resend the spreadsheet” “MIKE.” 😭

Or… one link. Everyone picks from their phone, Jax draws the numbers, and the board shows who won.

Send this to the person who runs your squares 📲

#footballsquares #squarespool #groupchat #officepool #thursdaynightfootball
```

- Has its own soundtrack, with the drop on the reveal. To ride a trending sound instead (the ↗ arrow in the audio browser), add it in the Reels editor and turn the original audio down to 0–20%.
- Upload the matching cover image as the Reel cover so the profile grid stays clean.

### Fri, Oct 30, 12:30 PM · Reel: Feature rundown

**Asset:** `out/07-features.mp4`, `out/07-features-cover.png`

**Caption:**

```text
Football squares, minus the spreadsheet 🏈

No app to download. Same room? Scan the code. Can't decide? Let Jax pick. Prize notes, or just for fun. Scores update themselves, and every board lives on one home screen.

NFL, college and NBA games score themselves, or type in any matchup. Free to set up → link in bio.

#footballsquares #squarespool #officepool #fantasyfootball #gamedayparty
```

- Has its own soundtrack: original JaxSquares music, cut to the video, so post it as is (it shows as Original audio, and it's yours to boost).
- Upload the matching cover image as the Reel cover so the profile grid stays clean.
- Boost candidate later: no dollar amounts on screen.

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

Run the board from anywhere: 30 seconds, one link, free to set up. Gators or Dawgs? 🐊 / 🐶

#gogators #godawgs #floridageorgia #collegefootball #footballsquares
```

- Has its own soundtrack, with the drop on the reveal. To ride a trending sound instead (the ↗ arrow in the audio browser), add it in the Reels editor and turn the original audio down to 0–20%.
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

**Goal:** Jaguars primetime, the host cheat sheet, on-this-day hits. First creator DMs.

| Day | Time (ET) | Type | Post | Asset |
|---|---|---|---|---|
| Mon, Nov 2 | 2:00 PM | Reel | 1 year ago: Cam Little's 68-yarder | `otd2-nov02-cam-little` |
| Mon, Nov 2 | 7:00 PM | Story | MNF: Bears at Seahawks | — |
| Tue, Nov 3 | 12:00 PM | Story | Quiz: most common final | `s-story-frames/03` |
| Tue, Nov 3 | 8:15 PM | Story | First CFP rankings | — |
| Wed, Nov 4 | 12:30 PM | Carousel | Host cheat sheet | `c3-host-cheat-sheet` |
| Wed, Nov 4 | 6:00 PM | Story | Quiz answer: 23–20 | `s-story-frames/04` |
| Thu, Nov 5 | 12:00 PM | Reel | Jags in primetime | `m4-tnf-jaguars-ravens` |
| Thu, Nov 5 | 6:30 PM | Story | Jags board: lock by 8:15 | — |
| Thu, Nov 5 | 11:30 PM | Story | Which square hit? | — |
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

- Has its own retro soundtrack (original music). Post it as is.
- Upload the matching cover image as the Reel cover so the profile grid stays clean.

### Wed, Nov 4, 12:30 PM · Carousel: Host cheat sheet

**Asset:** `out/c3-host-cheat-sheet/01.png`, `out/c3-host-cheat-sheet/02.png`, `out/c3-host-cheat-sheet/03.png`, `out/c3-host-cheat-sheet/04.png`, `out/c3-host-cheat-sheet/05.png`, `out/c3-host-cheat-sheet/06.png`

**Caption:**

```text
The squares host cheat sheet 📋 5 rules that keep your board fair.

Draw before kickoff. Cap squares per player. Winners every quarter. Make the office board Just for fun. Let the board do the math.

Save it, then send it to whoever runs your squares.

#footballsquares #squarespool #officepool #gameday #fantasyfootball
```

**Alt text:** Six slides of tips for hosting a football squares board: draw the numbers before kickoff, cap squares per player, have a winner every quarter, make office boards Just for fun, and let the app call the winners.

### Thu, Nov 5, 12:00 PM · Reel: Jags in primetime

*Thursday Night Football · Jaguars at Ravens · 8:15 PM ET · Prime Video*

**Asset:** `out/m4-tnf-jaguars-ravens.mp4`, `out/m4-tnf-jaguars-ravens-cover.png`

**Caption:**

```text
Jags in primetime 🐆 Thursday Night Football: Jaguars at Ravens, 8:15 ET on Prime Video.

Make the board at lunch, drop the link in the group chat, lock it before kickoff. Live scores call every quarter's winner.

Who's running the Duval board tonight? 👇

#duuuval #jaguars #thursdaynightfootball #footballsquares #squarespool
```

- Has its own soundtrack, with the drop on the reveal. To ride a trending sound instead (the ↗ arrow in the audio browser), add it in the Reels editor and turn the original audio down to 0–20%.
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

College boards work the same: pick the game, share one link, and scores update themselves. Free to set up.

Canes or Irish? 👇

#collegefootball #canes #notredame #footballsquares #squarespool
```

- Has its own soundtrack, with the drop on the reveal. To ride a trending sound instead (the ↗ arrow in the audio browser), add it in the Reels editor and turn the original audio down to 0–20%.
- Upload the matching cover image as the Reel cover so the profile grid stays clean.

### Sun, Nov 8, 11:00 AM · Reel: On this day: Dempsey's 63-yarder (1970)

**Asset:** `out/otd3-nov08-dempsey.mp4`, `out/otd3-nov08-dempsey-cover.png`

**Caption:**

```text
On this day in 1970, Tom Dempsey kicked a 63-yard field goal at the gun. Saints 19, Lions 17 🦵

19–17 is a squares legend: the Miracle at the Meadowlands (1978) ended 19–17 too. The 9–7 square keeps winning in chaos.

Got a 9 this week? 👀

#onthisday #nflhistory #saints #footballsquares #squarespool
```

- Has its own retro soundtrack (original music). Post it as is.
- Upload the matching cover image as the Reel cover so the profile grid stays clean.

### Sun, Nov 8, 8:00 PM · Task: Weekly review + creator outreach

- [ ] Weekly review (same as last Sunday).
- [ ] DM 5 micro-creators (Jax sports, Gators, fantasy football) with the creator template. Goal: 1 Collab for Nov 15.
- [ ] DM 3 local bars or office managers with the bar template (Just for fun boards only).

**Stories:**

- **Mon, Nov 2 7:00 PM** · MNF: Bears at Seahawks · sticker: Link → app. “MNF: Bears at Seahawks. Make the board before 8:15 👇”
- **Tue, Nov 3 12:00 PM** · Quiz: most common final · frame `s-story-frames/03` · sticker: Quiz: 20–17 / 23–20 ✓ / 27–24 / 24–17. “(Quiz sticker in the middle band.)”
- **Tue, Nov 3 8:15 PM** · First CFP rankings · sticker: Questions. “First CFP rankings are out. Who's your #1?”
- **Wed, Nov 4 6:00 PM** · Quiz answer: 23–20 · frame `s-story-frames/04` · sticker: None. “Answer frame.”
- **Thu, Nov 5 6:30 PM** · Jags board: lock by 8:15 · sticker: Link → app. “Jags board. Lock it by 8:15 🐆”
- **Thu, Nov 5 11:30 PM** · Which square hit? · sticker: Questions. “Final: Jaguars __, Ravens __. That's the _–_ square. Who had it? 🙋” (Fill in the final score and digits after the game.)
- **Fri, Nov 6 12:00 PM** · 1869: the first college football game · sticker: None. “On this day in 1869: Rutgers 6, Princeton 4, the first college football game ever. If they'd had squares, the 6–4 square takes it. 🏈”
- **Sat, Nov 7 7:00 PM** · Miami at Notre Dame board · sticker: Link → app. “Canes at Irish in 30. Board's open 👇”
- **Sun, Nov 8 9:15 AM** · Madrid game · sticker: Link → app. “Breakfast football from Madrid 🇪🇸 Bengals vs Falcons at 9:30.”

## Week 3 · Nov 9–15: Community and creators

**Goal:** Founder story (and Jax), first Collab post, first small boost on the best Reel.

| Day | Time (ET) | Type | Post | Asset |
|---|---|---|---|---|
| Mon, Nov 9 | 2:00 PM | Reel | POV: you hit Draw | `03-the-draw` |
| Mon, Nov 9 | 7:00 PM | Story | MNF: Bills at Vikings | — |
| Tue, Nov 10 | 1:00 PM | Reel | Winners light up | `06-winners-light-up` |
| Tue, Nov 10 | 1:30 PM | Task | Boost decision | — |
| Wed, Nov 11 | 9:00 AM | Story | Veterans Day | — |
| Wed, Nov 11 | 12:30 PM | Reel (film it) | Founder Reel: why we built it (and who Jax is) | — |
| Thu, Nov 12 | 12:00 PM | Task | Lock in Sunday's Collab | — |
| Thu, Nov 12 | 6:45 PM | Story | TNF: Commanders at Giants | `s-story-frames/06` |
| Fri, Nov 13 | 5:00 PM | Story | Friday night: FSU at Pitt | — |
| Sat, Nov 14 | 12:00 PM | Story | College Saturday | — |
| Sun, Nov 15 | 9:15 AM | Story | Munich game | — |
| Sun, Nov 15 | 11:00 AM | Reel | COLLAB: Let Jax pick | `02-let-jax-pick` |
| Sun, Nov 15 | 8:00 PM | Task | Weekly review | — |

### Mon, Nov 9, 2:00 PM · Reel: POV: you hit Draw

*Monday Night Football · Bills at Vikings · 8:15 PM ET · ESPN/ABC*

**Asset:** `out/03-the-draw.mp4`, `out/03-the-draw-cover.png`

**Caption:**

```text
POV: the board is full and you hit Draw 🔢

Jax shuffles 0–9 for each team, live, in front of everyone. Somebody gets 0–7. Somebody gets 2–2. Nobody can say you rigged it.

Send this to whoever hosts your squares 📲

#footballsquares #squarespool #mondaynightfootball #officepool #nfl
```

- Has its own soundtrack, with the drop on the reveal. To ride a trending sound instead (the ↗ arrow in the audio browser), add it in the Reels editor and turn the original audio down to 0–20%.
- Upload the matching cover image as the Reel cover so the profile grid stays clean.

### Tue, Nov 10, 1:00 PM · Reel: Winners light up

*NFL trade deadline 4 PM ET · CFP rankings 9 PM ET*

**Asset:** `out/06-winners-light-up.mp4`, `out/06-winners-light-up-cover.png`

**Caption:**

```text
Who won the quarter? The board already knows 🏆

Live scores are built in, so the winning square lights up at Q1, Half, Q3 and the Final, and the winner's phone gets the news. No math, no arguing, no “wait, which way do the numbers go?”

Send this to the friend who always does the math wrong.

#footballsquares #squarespool #officepool #nfl #fantasyfootball
```

- Has its own soundtrack: original JaxSquares music, cut to the video, so post it as is (it shows as Original audio, and it's yours to boost).
- Upload the matching cover image as the Reel cover so the profile grid stays clean.

### Tue, Nov 10, 1:30 PM · Task: Boost decision

- [ ] Compare sends per reach across the boost candidates: 02, 04, 07 (none of the videos show amounts).
- [ ] Boost the winner with $50–150 over 5 days. Audience: US, 21+, football / fantasy football interests. Goal: profile visits.
- [ ] Judge it on boards created, not likes.

### Wed, Nov 11, 12:30 PM · Reel (film it): Founder Reel: why we built it (and who Jax is)

**Script:**

1. 0–2s (on-screen text): “I built a squares app because our group chat broke.”
1. 2–10s: hold up the old way. Show the whiteboard photo, the spreadsheet, the 99+ unread chat.
1. 10–25s: screen-record making a real board, start to share link (you recorded this in Prep).
1. 25–35s, to camera: “Free to set up, no app, no signup. Jax draws the numbers live, winners light up.” If you can, film the real Jax here: he's the logo.
1. 35–40s, ask: “What do we build next: Pick'em, Bracket Battles, or King of the Hill?”

**Caption:**

```text
Why we built JaxSquares 🐶 (and what's next)

Our squares lived in a group chat, a blurry whiteboard photo and a spreadsheet nobody could find. So we built the board we wanted, and named it after Jax: one link, everyone picks from their phone, numbers draw live, winners light up.

Next up: Pick'em, Bracket Battles or King of the Hill? Vote in the comments 👇

#buildinpublic #startup #jacksonville #footballsquares #squarespool
```

- Film vertical, natural light, captions on (Instagram's auto-captions are fine).

### Thu, Nov 12, 12:00 PM · Task: Lock in Sunday's Collab

- [ ] Confirm the creator or friend account for Sunday.
- [ ] Send them the 02 video and the caption. Post it from @jaxsquares and use Tag people → Invite collaborator.

### Sun, Nov 15, 11:00 AM · Reel: COLLAB: Let Jax pick

*Jaguars at Titans · 1:00 PM ET · FOX*

**Asset:** `out/02-let-jax-pick.mp4`, `out/02-let-jax-pick-cover.png`

**Caption:**

```text
Can't pick a square? Let Jax pick 🐶

Tap “Let Jax pick”, choose how many, and he grabs random open squares for you. JaxSquares is named after him, and he has no favorites.

Jags at Titans at 1. Board's open 👇

#duuuval #footballsquares #squarespool #officepool #nfl
```

- Post as a Collab (Tag people → Invite collaborator).
- Has its own soundtrack: original JaxSquares music, cut to the video, so post it as is (it shows as Original audio, and it's yours to boost).
- Upload the matching cover image as the Reel cover so the profile grid stays clean.

### Sun, Nov 15, 8:00 PM · Task: Weekly review

- [ ] Weekly review.
- [ ] Reshare any boards people tagged you in (ask first).

**Stories:**

- **Mon, Nov 9 7:00 PM** · MNF: Bills at Vikings · sticker: Link → app. “MNF: Bills at Vikings. Draw your numbers live 🔢”
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

One board per game. Kids' table board? Just for fun. Save this.

#thanksgivingfootball #thanksgiving #footballsquares #squarespool #friendsgiving
```

- Has its own soundtrack: original JaxSquares music, cut to the video, so post it as is (it shows as Original audio, and it's yours to boost).
- Upload the matching cover image as the Reel cover so the profile grid stays clean.
- Check the Florida–FSU kickoff the week of. ACC and CBS list 3:30; one outlet listed 8:30.

### Wed, Nov 18, 12:30 PM · Carousel: Thanksgiving squares playbook

**Asset:** `out/c4-thanksgiving-playbook/01.png`, `out/c4-thanksgiving-playbook/02.png`, `out/c4-thanksgiving-playbook/03.png`, `out/c4-thanksgiving-playbook/04.png`, `out/c4-thanksgiving-playbook/05.png`, `out/c4-thanksgiving-playbook/06.png`

**Caption:**

```text
The Thanksgiving squares playbook 🦃 Save it for next week.

One board per game, a Just for fun board for the kids' table, and prizes that aren't cash: loser does the dishes, winner gets the first plate.

Send this to whoever's hosting.

#thanksgiving #thanksgivingfootball #friendsgiving #footballsquares #familygamenight
```

**Alt text:** Six-slide Thanksgiving guide to football squares: the 2026 Thanksgiving week schedule, one board per game, a Just for fun kids' table board, and prizes like doing the dishes.

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

- Has its own retro soundtrack (original music). Post it as is.
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

- Has its own retro soundtrack (original music). Post it as is.
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

- Has its own soundtrack, with the drop on the reveal. To ride a trending sound instead (the ↗ arrow in the audio browser), add it in the Reels editor and turn the original audio down to 0–20%.
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

Or… one link. Grandma picks from her phone, Jax draws the numbers, and the board calls the winner every quarter. Free to set up.

Send this to the family group chat. You know the one.

#thanksgiving #familygroupchat #thanksgivingfootball #footballsquares #friendsgiving
```

- Has its own soundtrack, with the drop on the reveal. To ride a trending sound instead (the ↗ arrow in the audio browser), add it in the Reels editor and turn the original audio down to 0–20%.
- Upload the matching cover image as the Reel cover so the profile grid stays clean.

### Wed, Nov 25, 12:00 PM · Reel: Thanksgiving Eve: Packers at Rams

*Packers at Rams · 8:00 PM ET · Netflix · first-ever Thanksgiving Eve game*

**Asset:** `out/m7-thanksgiving-eve.mp4`, `out/m7-thanksgiving-eve-cover.png`

**Caption:**

```text
The first-ever Thanksgiving Eve NFL game: Packers at Rams, 8:00 ET on Netflix 🦃📺

Friendsgiving board, anyone? 30 seconds to make, one link to share, free to set up.

Who's hosting Friendsgiving tonight? 👇

#thanksgivingeve #friendsgiving #thanksgivingfootball #footballsquares #nfl
```

- Has its own soundtrack, with the drop on the reveal. To ride a trending sound instead (the ↗ arrow in the audio browser), add it in the Reels editor and turn the original audio down to 0–20%.
- Upload the matching cover image as the Reel cover so the profile grid stays clean.

### Thu, Nov 26, 9:30 AM · Reel: Happy Thanksgiving: Red Grange, 101 years ago

**Asset:** `out/otd6-nov26-grange.mp4`, `out/otd6-nov26-grange-cover.png`

**Caption:**

```text
101 years ago today, Red Grange made his NFL debut on Thanksgiving. Bears 0, Cardinals 0 🦃

A 0–0 tie means the same square won every quarter. Happy Thanksgiving from JaxSquares: three games today, three boards, one link each.

What's your square for Bears–Lions? 👇

#thanksgiving #thanksgivingfootball #onthisday #nflhistory #footballsquares
```

- Has its own retro soundtrack (original music). Post it as is.
- Upload the matching cover image as the Reel cover so the profile grid stays clean.

### Sun, Nov 29, 8:00 PM · Task: Launch retro

- [ ] Pull 6 weeks of insights: top 3 Reels by sends per reach, top carousel by saves.
- [ ] Boards created per week (query in KPIs). Compare with the posting calendar.
- [ ] Plan December around what worked: rivalry week, conference title games, the big game run-up.
- [ ] Post a thank-you carousel of the best user boards (with permission).

**Stories:**

- **Mon, Nov 23 7:00 PM** · MNF: Bengals at Commanders · sticker: Link → app. “MNF: Bengals at Commanders 👇”
- **Tue, Nov 24 12:00 PM** · Hosting Thursday? · frame `s-story-frames/07` · sticker: Link → app. “Hosting Thursday? Make your boards tonight. 30 seconds each 🦃”
- **Wed, Nov 25 7:00 PM** · Thanksgiving Eve board · sticker: Link → app. “Packers at Rams in an hour. Friendsgiving board 👇”
- **Thu, Nov 26 12:30 PM** · Board 1: Bears at Lions · sticker: Link → app. “Board 1 of 3: Bears at Lions, 1:00 🦃”
- **Thu, Nov 26 4:00 PM** · Board 2: Eagles at Cowboys · sticker: Link → app. “Board 2 of 3: Eagles at Cowboys, 4:30 🦃”
- **Thu, Nov 26 8:00 PM** · Board 3: Chiefs at Bills · sticker: Link → app. “Nightcap board: Chiefs at Bills, 8:20 🦃”
- **Thu, Nov 26 10:30 PM** · Show us your boards · sticker: Add Yours. “Show us your Thanksgiving board 📸 Screenshot + tag @jaxsquares”
- **Fri, Nov 27 1:00 PM** · Leftovers board · sticker: Link → app. “Leftovers board 🥪 Broncos at Steelers 3:00 · Florida at FSU 3:30”
- **Sat, Nov 28 11:00 AM** · Rivalry Saturday · sticker: Link → app. “Rivalry Saturday. One board per game 👇”
- **Sun, Nov 29 3:30 PM** · Titans at Jaguars · sticker: Link → app. “Jags home at 4:05. Last board of the holiday weekend 🐆”

## Research behind this plan

Summaries of the Oct 19, 2026 research (Instagram ranking and cadence, sports-app case studies, the 2026 NFL and college calendars, verified on-this-day facts) are in `research/`. Square stats come from nflverse `games.csv` (NFL final scores 1999–2025) via `marketing/studio/scripts/digit_odds.py`.
