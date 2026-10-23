// JaxSquares Instagram launch plan: single source of truth.
// `node marketing/launch-plan/build.mjs` turns this into LAUNCH_PLAN.md,
// jaxsquares-launch.ics and plan.json (used by the published calendar page).
//
// Times are US Eastern. `asset` ids match marketing/studio compositions
// (rendered to marketing/out/). Story frames are `s-story-frames/NN`.

const H = {
  core: ["#footballsquares", "#squarespool"],
  office: "#officepool",
  nfl: "#nfl",
  fantasy: "#fantasyfootball",
  stats: "#footballstats",
  duval: "#duuuval",
  jags: "#jaguars",
  gators: "#gogators",
  otd: "#onthisday",
  history: "#nflhistory",
  cfb: "#collegefootball",
  tg: "#thanksgivingfootball",
  friendsgiving: "#friendsgiving",
  mnf: "#mondaynightfootball",
  tnf: "#thursdaynightfootball",
  snf: "#sundaynightfootball",
  hoops: "#basketballsquares",
};

const AUDIO_EXPLAINER =
  "Has its own soundtrack: original JaxSquares music, cut to the video, so post it as is (it shows as Original audio, and it's yours to boost).";
const AUDIO_TRENDING =
  "Has its own soundtrack, with the drop on the reveal. To ride a trending sound instead (the ↗ arrow in the audio browser), add it in the Reels editor and turn the original audio down to 0–20%.";
const AUDIO_NOSTALGIC =
  "Has its own retro soundtrack (original music). Post it as is.";
const COVER = "Upload the matching cover image as the Reel cover so the profile grid stays clean.";
const GRID_COVER =
  "Cover: save the grid cover above. On the share screen tap Edit cover → Add from camera roll → pick it, then open the Profile grid tab: the whole square shows, board map included.";
const NO_PIN = "Don't pin it: pinned posts jump to the top of the grid and break the logo.";

// The profile, exactly as it goes into Instagram (the setup steps copy from here).
const PROFILE = {
  name: "JaxSquares · Sports Squares",
  username: "jaxsquares",
  bio: "Football & basketball squares 🏈🏀\nFree to set up · no app for players\nLive scores call winners. Make a board 👇\nNot affiliated w/ any league or team",
  linkUrl: "https://jaxsquares.com",
  linkTitle: "Make a board",
  category: "Sports & Recreation",
  replies: [
    { shortcut: "link", text: "Here's the link: https://jaxsquares.com 🏈 Make a board, text it to your crew, and everyone picks from their phone." },
    { shortcut: "free", text: "Free to set up and invite, and free to draw with up to 5 players. Bigger boards are $4.99 for the host. Players never pay." },
    { shortcut: "app", text: "No app needed. Friends tap the link and pick their squares from any phone. Same room? They can scan the code." },
  ],
};

export const PLAN = {
  title: "JaxSquares Instagram Launch",
  handle: "@jaxsquares",
  start: "2026-10-20",
  end: "2026-11-29",
  timezone: "America/New_York",

  strategy: {
    positioning:
      "Football and basketball squares, run by Jax and live now at jaxsquares.com. No app or account for players, no math, and no money between players: JaxSquares never collects or sends it. Free to set up and invite; boards with up to 5 players draw free, bigger boards are a $4.99 host fee (or the $19.99/yr Annual Pass). Competitors charge per grid ($10–$13), need a download, or need an account. Nobody in the category has a personality-led Instagram, and nobody else has a dog.",
    pillars: [
      { name: "Show the product", share: "35%", what: "Real-app demos: the 30-second setup, Let Jax pick, the live draw, winners lighting up, and the use cases (TV mode at the bar, basketball boards, joining from a link, every phone live). Every video is screen footage of the real app." },
      { name: "Squares nerdery", share: "25%", what: "Real numbers from 7,276 NFL finals: best/worst squares, digit tiers, most common scores. Built to be saved and sent." },
      { name: "This game, this week", share: "25%", what: "Primetime, Jaguars, Gators and Thanksgiving games. Make the board the plan for the game." },
      { name: "On this day", share: "15%", what: "Verified history with a squares twist: which square that famous final score landed on." },
    ],
    cadence: [
      "Launch (Oct 22–30): one grid Reel a day, nothing else in the feed. Reels reach the most people who don't follow you yet, which is everyone at launch.",
      "After that, 4–5 feed posts a week: about 4 Reels and 1 carousel. Buffer's 2026 data: 3–5 posts/week roughly doubles follower growth vs. 1–2.",
      "Stories on most days, always on game days, each with a link sticker to start a board.",
      "Best slots (ET): Tue 1–7 PM and Wed 12–9 PM are strongest; Mon 2–4 PM and Thu 12–2 PM are good. Game-day boards go up 11 AM–12:30 PM Sunday and 6–7:30 PM before TNF/MNF.",
    ],
    rules: [
      "Hook in the first second. Every video opens on its headline, because Instagram now reports skip rate on Reels.",
      "Optimize for sends. 'Sends per reach' is one of Instagram's top ranking signals for reaching non-followers, so every caption ends with one specific send prompt ('send this to whoever got 2–2'), never 'tag a friend'.",
      "Max 5 hashtags. Instagram capped it at 5 on Dec 18, 2025. Use specific tags, never #reels or #explore.",
      "Keywords first. Captions and alt text feed Instagram search and Google. Lead with 'football squares' or 'squares pool'.",
      "Original content only. Instagram cuts recommendations for reposted content and for videos with other apps' watermarks. Everything here is original and has no watermarks.",
      "Reply to every comment in the first hour after posting. Answer good questions with 'Reply with Reel'.",
    ],
    compliance: [
      "Say 'the big game', never 'Super Bowl', in posts and ads (NFL trademark). Team names are fine to identify a game. No logos, uniforms, team colors, broadcast footage or player photos.",
      "Never use the words the app bans: bet, wager, pot, payout, buy-in, jackpot, odds, stakes, gamble (and 'cash out'). Say 'board', 'square price', 'prize', 'bragging rights'.",
      "No money between players, ever. JaxSquares never collects, holds or sends it, so never imply it handles winnings. Prizes in captions are notes: 'loser buys wings', 'winner skips dish duty'.",
      "'Free' means free to set up, invite and pick squares, and free to draw with up to 5 players. Bigger boards have a $4.99 host fee at the draw (the Annual Pass covers it). Say 'free to set up'; never call a big board totally free. Players never pay.",
      "Paid boosts: only creatives with no amounts on screen (the Just for fun ones are safest; skip any that show the create flow's review step, which carries the host-fee line). Meta requires prior written permission for ads where money is part of both entry and prize. Boost candidates (no review step or host-fee line on screen): 02-let-jax-pick (Grid 5), u4-every-phone (Grid 2), u6-join-from-link (Grid 8), and after the launch u2-bar-big-screen, 04-best-worst-squares and 07-features. Not 01-how-it-works or u1-speedrun: they show the create flow's host-fee line.",
      "Bars and offices: pitch Just for fun boards with no purchase needed to pick a square.",
      "Giveaways need official rules, eligibility, and a 'not sponsored by Instagram' line. Don't require follows or tags to enter. Skip them for this launch.",
      "Keep 'Not affiliated w/ any league or team' in the bio. The Terms and landing-page footers name the leagues.",
    ],
    kpis: [
      { metric: "Boards created (north star)", how: "npx wrangler d1 execute jaxsquares --remote --command \"SELECT date(created_at/1000,'unixepoch') AS day, COUNT(*) AS boards FROM games GROUP BY day ORDER BY day DESC LIMIT 14\"" },
      { metric: "Sends per reach and skip rate", how: "Reel insights. Double down on whatever gets sent." },
      { metric: "Saves", how: "Carousel insights. Saves mean the data and how-to content is working." },
      { metric: "Profile visits → link taps", how: "Professional dashboard. If taps lag visits, rewrite the bio's first line." },
    ],
    targets:
      "Stretch targets, not forecasts: 400+ followers and 150+ boards created by Nov 29, and one Reel past 10k views. Benchmarks for brand-new accounts are thin; the boards count matters more than followers.",
    grid: {
      summary:
        "Your first nine posts are nine Reels, one a day (Thu Oct 22 to Fri Oct 30). Each explains one thing about JaxSquares and can reach people who don't follow you yet, and each has a square of the JaxSquares mark as its cover, so the profile turns into the 3×3 logo with the gold winning square. Instagram fills the grid newest-first from the top left, so the board goes up from the bottom right.",
      preview: "g-grid-preview/01",
      rules: [
        "First archive the four static squares from Wednesday night and update the name and bio, so the Reels start on a clean grid.",
        "One grid Reel a day, in order (1 → 9). Upload its grid cover as the Reel cover and check the Profile grid tab before you share.",
        "Nothing else in the feed until square 9 is up: one extra post shifts the logo by a square. Game-day posts and the on-this-day video go in Stories.",
        "Don't pin anything: pinned posts jump to the top of the grid and break the logo.",
        "After square 9, later posts slide the board down a square at a time. It lines up again whenever the posts since then reach a multiple of three; in between, every tile is still a whole board square.",
      ],
    },
    setup: {
      name: PROFILE.name,
      bio: PROFILE.bio,
      link: `${PROFILE.linkUrl} (title: “${PROFILE.linkTitle}”). Link taps show in Instagram's Insights; the site runs no analytics, so no tracking tag.`,
      highlights: ["How it works", "Square stats", "Game days", "Thanksgiving"],
      category:
        "Sports & Recreation. It tells visitors this is a sports account. Avoid App Page: the label sits under your name and contradicts “no app to download”. Website is the most literal fallback. You can also hide the label in Edit profile.",
      profilePictures: [
        { file: "p-profile-picture/01", label: "Option 1 (recommended): Jax over the board, the app icon. A face reads at every size." },
        { file: "p-profile-picture/02", label: "Option 2: the website's 3×3 mark with the gold winning square" },
      ],
    },
    audiences: [
      { who: "Group chats and friend groups", sells: "One link, everyone picks from their own phone, no app or account.", reels: ["05-group-chat", "u6-join-from-link", "u4-every-phone"] },
      { who: "The host (whoever runs the board)", sells: "A board in seconds, Jax draws the numbers, live scores call the winners.", reels: ["01-how-it-works", "u1-speedrun", "03-the-draw"] },
      { who: "Bars, restaurants and watch parties", sells: "TV mode with a QR code to join; Just for fun boards, no purchase needed to play.", reels: ["u2-bar-big-screen"] },
      { who: "Offices", sells: "No spreadsheet, no reply-all; Just for fun boards with prize notes.", reels: ["u5-office-squares"] },
      { who: "Families (Thanksgiving)", sells: "One board for every house, live on every phone.", reels: ["05b-group-chat-thanksgiving", "08-thanksgiving-slate", "u4-every-phone"] },
      { who: "Basketball fans", sells: "NBA and college games with live scores, or any matchup.", reels: ["u3-basketball-squares"] },
    ],
    outreach: {
      creator:
        "Hey [name]! Love your [team] content. We built JaxSquares: football and basketball squares, no download or signup for players. Want to run a Just for fun followers' board for [game]? We set it up (on us), you share the link, and we co-post the Reel as a Collab. Costs you and your followers nothing.",
      bar:
        "Hi! We make JaxSquares, a squares board your regulars join with a QR code or link. No app, and no purchase needed to play. Want us to set up a Just for fun board for [game] for your crowd (on us)?",
      ugc: "Screenshot your board and tag @jaxsquares. We reshare the best ones (with your OK).",
    },
  },

  weeks: [
    {
      key: "prep",
      label: "Prep",
      dates: "Oct 20–25",
      theme: "Set up and start the grid",
      goal: "Profile set up step by step, then the launch grid: nine Reels, one a day from Thu Oct 22, whose covers make the profile the JaxSquares mark.",
    },
    {
      key: "w1",
      label: "Week 1",
      dates: "Oct 26–Nov 1",
      theme: "Launch: what it is",
      goal: "Grid Reels 5–9 (MNF on Monday, basketball on Friday), then the Highlights. Personal push to friends and group chats. First 25 boards.",
    },
    {
      key: "w2",
      label: "Week 2",
      dates: "Nov 2–8",
      theme: "Proof and personality",
      goal: "Jaguars primetime, the host cheat sheet, on-this-day hits. First creator DMs.",
    },
    {
      key: "w3",
      label: "Week 3",
      dates: "Nov 9–15",
      theme: "Community and creators",
      goal: "Founder story (and Jax), first Collab post, first small boost on the best Reel.",
    },
    {
      key: "w4",
      label: "Week 4",
      dates: "Nov 16–22",
      theme: "Road to Thanksgiving",
      goal: "Make JaxSquares the Thanksgiving plan: slate, playbook, Mexico City SNF.",
    },
    {
      key: "tg",
      label: "Bonus",
      dates: "Nov 23–29",
      theme: "Thanksgiving week payoff",
      goal: "One board per game, story coverage all day Thursday, collect user boards.",
    },
  ],

  items: [
    // ------------------------------------------------------------ PREP
    // ------------------------------------------------------------ START HERE: the profile, step by step
    {
      date: "2026-10-21", time: "14:30", kind: "task", week: "prep", start: true,
      title: "Profile 1/7: Switch to a professional account",
      checklist: [
        "Instagram → your profile → ☰ → Account type and tools → Switch to professional account.",
        "Choose Business (a brand, not a person): it unlocks insights, contact options and boosting.",
        "Category: search “Sports & Recreation” and pick it. Leave “Display on profile” on.",
        "Skip the contact and Facebook steps for now (step 6 has the optional email).",
      ],
      copy: [{ label: "Category", text: PROFILE.category }],
      notes: ["Not App Page: that label sits under your name and contradicts “no app to download”."],
    },
    {
      date: "2026-10-21", time: "14:35", kind: "task", week: "prep", start: true,
      title: "Profile 2/7: Profile picture",
      checklist: [
        "Save the picture to your phone (Save, above).",
        "Edit profile → Edit picture → Choose from library → pick it.",
        "It's built for the circle crop: don't zoom or move it. Jax's face sits in the middle, the gold square top right.",
      ],
      extras: [
        { label: "Profile picture (use this): Jax over the board", file: "p-profile-picture/01.png" },
        { label: "Alternative: the 3×3 mark", file: "p-profile-picture/02.png" },
      ],
    },
    {
      date: "2026-10-21", time: "14:40", kind: "task", week: "prep", start: true,
      title: "Profile 3/7: Name and username",
      checklist: [
        "Set it Wednesday? Replace it: the name is now “JaxSquares · Sports Squares” (football and basketball both fit; the bio's first line carries the search words).",
        "Edit profile → Name: paste the name.",
        "Username: make sure it's jaxsquares (the whole plan uses @jaxsquares).",
        "Instagram allows two name changes every 14 days: this is your second, so paste it carefully.",
      ],
      copy: [
        { label: "Name", text: PROFILE.name },
        { label: "Username", text: PROFILE.username },
      ],
    },
    {
      date: "2026-10-21", time: "14:45", kind: "task", week: "prep", start: true,
      title: "Profile 4/7: Bio",
      checklist: [
        "Set it Wednesday? Replace it: it now leads with football & basketball 🏈🏀, ends its third line with “Make a board 👇” (the link sits right under the bio), and the last line disclaims any league or team.",
        "Edit profile → Bio → paste the bio. Keep the line breaks.",
        "149 characters, inside Instagram's 150. Leave Pronouns empty.",
      ],
      copy: [{ label: "Bio", text: PROFILE.bio }],
    },
    {
      date: "2026-10-21", time: "14:50", kind: "task", week: "prep", start: true,
      title: "Profile 5/7: Link",
      checklist: [
        "Edit profile → Links → Add external link.",
        "Paste the URL and the title. Already added jaxsquares.com/?ref=ig? Edit it to the plain address: nothing reads the tag, and link taps show in Insights.",
        "Tap the link on your profile once to check it opens jaxsquares.com.",
      ],
      copy: [
        { label: "URL", text: PROFILE.linkUrl },
        { label: "Title", text: PROFILE.linkTitle },
      ],
    },
    {
      date: "2026-10-21", time: "14:55", kind: "task", week: "prep", start: true,
      title: "Profile 6/7: Privacy, sharing and security",
      checklist: [
        "Settings → Account privacy: Private account off (public).",
        "Settings → Sharing and reuse: allow sharing posts and reels to stories, remixing and downloads. Shares and sends are how new people find you.",
        "Settings → Notifications: comments, mentions and messages on, so you can reply within the hour.",
        "Accounts Center → Password and security → Two-factor authentication: on. It's the brand account; keep it locked down.",
        "Optional: Edit profile → Contact options → add a business email you check.",
      ],
    },
    {
      date: "2026-10-21", time: "15:00", kind: "task", week: "prep", start: true,
      title: "Profile 7/7: Saved replies",
      checklist: [
        "Settings → Business tools and controls → Saved replies → add the three above (shortcut, then message).",
        "In a DM or comment reply, type the shortcut and tap the suggestion to send it.",
      ],
      copy: PROFILE.replies.map((r) => ({ label: `Shortcut “${r.shortcut}”`, text: r.text })),
    },
    {
      date: "2026-11-09", time: "14:00", kind: "carousel", week: "w3",
      title: "How football squares works",
      asset: "c1-how-squares-works", slides: 7,
      caption:
        "How football squares works, in 7 slides 🏈\n\nThe grid, the draw, the last-digit rule and how a quarter gets won. Save this for game day.\n\nSend it to the person who always asks “wait, which square is mine?”\n\nSet up your own board free → link in bio",
      hashtags: [...H.core, H.office, H.fantasy, "#gameday"],
      altText:
        "Seven-slide explainer of football squares: a 10 by 10 grid, friends pick squares, digits 0 to 9 are drawn for each row and column, and the last digit of each team's score picks the winning square each quarter.",
      notes: ["The save-worthy explainer for everyone the grid Reels brought in."],
    },
    {
      date: "2026-10-22", time: "18:45", kind: "story", week: "prep",
      title: "TNF: Patriots at Bears",
      asset: "s-story-frames/06",
      tieIn: "Thursday Night Football · Patriots at Bears · 8:15 PM ET · Prime Video",
      story: { sticker: "Link → app", text: "TNF: Patriots at Bears, 8:15 on Prime. Board takes 30 seconds 👇" },
    },
    {
      date: "2026-11-01", time: "11:30", kind: "reel", week: "w1",
      title: "Best and worst squares",
      asset: "04-best-worst-squares",
      caption:
        "The best and worst squares in football, from 7,276 NFL final scores 📊\n\n0–7 lands on 3.6% of finals. 2–2 has hit 4 times since 1999. 💀\n\nSend this to whoever drew 2–2 this week.",
      hashtags: [...H.core, H.nfl, H.stats, H.fantasy],
      notes: [AUDIO_TRENDING, COVER, "Top boost candidate (no money on screen).", "Data: nflverse games.csv, NFL finals 1999–2025."],
    },
    {
      date: "2026-10-24", time: "11:00", kind: "story", week: "prep",
      title: "College Saturday slate",
      tieIn: "Ole Miss at Texas 7:30 PM ABC · Houston at Utah 10:15 PM ESPN (GameDay) · BYU at UCF 3:30 PM FOX",
      story: {
        sticker: "Link → app",
        text: "College Saturday 🏈\nBYU at UCF · 3:30 FOX\nOle Miss at Texas · 7:30 ABC\nHouston at Utah · 10:15 ESPN\nRunning a board? 👇",
      },
    },
    {
      date: "2026-10-25", time: "09:15", kind: "story", week: "prep",
      title: "Breakfast football from Paris",
      tieIn: "Steelers vs. Saints · Stade de France · 9:30 AM ET",
      story: { sticker: "Link → app", text: "Breakfast football from Paris 🇫🇷 Steelers vs Saints at 9:30. Coffee + a squares board?" },
    },
    {
      date: "2026-10-25", time: "11:30", kind: "story", week: "prep",
      title: "Game day checklist",
      asset: "s-story-frames/06",
      story: { sticker: "Link → app", text: "Draw before the 1:00 kickoffs 👇" },
      notes: ["The frame carries the checklist: add only this line, above the link sticker."],
    },
    {
      date: "2026-10-25", time: "19:30", kind: "story", week: "prep",
      title: "SNF: Chiefs at Seahawks poll",
      tieIn: "Sunday Night Football · Chiefs at Seahawks · 8:20 PM ET · NBC",
      story: { sticker: "Poll: Yes / No", text: "SNF: do the Chiefs stay unbeaten?" },
    },

    // ------------------------------------------------------------ LAUNCH GRID: nine Reels, one a day (Thu Oct 22 – Fri Oct 30)
    {
      date: "2026-10-22", time: "09:00", kind: "task", week: "prep", start: true,
      title: "Archive the 4 static grid posts",
      checklist: [
        "The launch grid is nine Reels now. The four static squares from Wednesday night (JaxSquares is live, Scores update themselves, Jax draws the numbers, Your square hits) come off the grid first.",
        "On your profile, open each one → ⋯ → Archive. It hides the post and keeps it (Profile → ☰ → Archive brings it back).",
        "Then redo Profile 3/7 and 4/7 (the name and bio changed), and post Grid 1/9 at 12:30.",
      ],
      notes: ["Archive rather than delete: nothing is lost, and the Reels start on a clean grid."],
    },
    {
      date: "2026-10-25", time: "13:00", kind: "task", week: "prep", start: true,
      title: "Launch check-in: Reels 1–2",
      checklist: [
        "Compare Grid 1 and 2 at 48 hours each (their notes list the numbers).",
        "Which hook held people past 2 seconds? If one fell flat, rewrite the next caption's first line to lead with the payoff.",
        "Note Insights → Most active times. If your followers peak well away from 12:30, move the next grid Reels to that hour.",
      ],
    },
    {
      date: "2026-10-28", time: "14:30", kind: "task", week: "w1", start: true,
      title: "Launch check-in: Reels 3–5",
      checklist: [
        "Same five numbers for Grid 3, 4 and 5; compare with 1 and 2.",
        "Reply to every comment still open, and save the best question for Fri Nov 6's Reply with a Reel.",
        "Note the Reel with the most sends: it's the first boost candidate.",
      ],
    },
    {
      date: "2026-11-02", time: "13:00", kind: "task", week: "w2", start: true,
      title: "Launch check-in: Reels 6–9",
      checklist: [
        "Compare Grid 6–9 at 48 hours each (their notes list the numbers) with Reels 1–5.",
        "Rank all nine by sends per reach: the top two lead the Nov 10 boost decision.",
        "Open your profile: is the logo whole? Reply to any comments still open.",
      ],
    },
    {
      date: "2026-10-22", time: "12:30", kind: "reel", week: "prep", start: true,
      title: "Grid 1/9: JaxSquares is live (How it works)",
      asset: "01-how-it-works", cover: "r-grid-covers/01",
      tieIn: "Thursday Night Football · Patriots at Bears · 8:15 PM ET · Prime Video",
      caption:
        "JaxSquares is live 🏈🏀🐶\n\nFootball and basketball squares, run for you: pick the game, text one link, and everyone grabs squares from their phone. Jax draws the numbers live, scores update themselves, and the winning square lights up every quarter.\n\nFree to set up, and your friends never need an app or an account. Make your board: link in bio.\n\nSend this to whoever runs your squares 📲",
      hashtags: [...H.core, H.hoops, "#gameday", "#bears"],
      altText:
        "Screen recording of JaxSquares, the football and basketball squares app: a live score lands on a winning square, then picking a game, texting the board link, friends picking squares and Jax drawing the numbers.",
      notes: ["At 48 hours (Sat Oct 24, 12:30): Insights → plays, average watch time, skip rate, sends, saves, profile visits.", AUDIO_EXPLAINER, GRID_COVER, NO_PIN, "Square 1 sits bottom right of the logo."],
    },
    {
      date: "2026-10-23", time: "12:15", kind: "task", week: "prep", start: true,
      title: "Fix the live Grid 1 caption and the bio",
      checklist: [
        "Grid 1 (posted yesterday): open it → ⋯ → Edit → select the whole caption, delete it, paste the new one below → Done.",
        "Bio: Edit profile → Bio → paste the new bio below. One line changed: hosts now sign in to make a board, so “no signup” is out.",
        "Then post Grid 2 at 12:30.",
      ],
      // Filled in below the plan from Grid 1 and the profile, so they can't drift apart.
      copy: [],
      notes: ["The old caption had “Square 1 of 9” (a note for us, not for followers) and “No signup”, which no longer holds for hosts."],
    },
    {
      date: "2026-10-23", time: "12:30", kind: "reel", week: "prep", start: true,
      title: "Grid 2/9: Scores update themselves (One score, every phone)",
      asset: "u4-every-phone", cover: "r-grid-covers/02",
      caption:
        "Football squares, live on every phone 📲\n\nPick an NFL, college or NBA game and the board follows it live. When the quarter ends, everyone sees it at the same moment: the winner gets the celebration, everyone else gets the news. No refreshing, no group-chat math.\n\nSend this to whoever keeps score with a pen. Your board → link in bio.",
      hashtags: [...H.core, H.hoops, "#groupchat"],
      altText:
        "Three phones side by side showing the same JaxSquares board. The third quarter ends 10 to 13; Maya's phone in the middle shows You won with Jax cheering, and the two others show Maya wins Q3.",
      notes: ["At 48 hours (Sun Oct 25, 12:30): Insights → plays, average watch time, skip rate, sends, saves, profile visits.", AUDIO_EXPLAINER, GRID_COVER, NO_PIN, "Square 2: bottom row, middle."],
    },
    {
      date: "2026-10-24", time: "11:00", kind: "reel", week: "prep", start: true,
      title: "Grid 3/9: Jax draws the numbers (POV: you hit Draw)",
      asset: "03-the-draw", cover: "r-grid-covers/03",
      tieIn: "College Saturday · BYU at UCF 3:30 PM FOX · Ole Miss at Texas 7:30 PM ABC · Houston at Utah 10:15 PM ESPN",
      caption:
        "POV: your squares board is full and you hit Draw 🔢\n\nJax shuffles 0–9 for each team, live, in front of everyone. Somebody gets 0–7. Somebody gets 2–2. Nobody can say you rigged it.\n\nRunning a board for Ole Miss–Texas tonight? Link in bio. Send this to your board's most suspicious player.",
      hashtags: [...H.core, H.cfb, "#texaslonghorns"],
      altText:
        "Screen recording of JaxSquares: the host taps Draw on a full board, the digits 0 to 9 shuffle for both teams, and the app shows The numbers are in.",
      notes: ["At 48 hours (Mon Oct 26, 11:00): Insights → plays, average watch time, skip rate, sends, saves, profile visits.", AUDIO_EXPLAINER, GRID_COVER, NO_PIN, "Square 3: bottom left. The bottom row is done: the grid story goes up at 11:20."],
    },
    {
      date: "2026-10-25", time: "11:00", kind: "reel", week: "prep", start: true,
      title: "Grid 4/9: Your square hits, the gold one (Winners light up)",
      asset: "06-winners-light-up", cover: "r-grid-covers/04",
      tieIn: "NFL Sunday · Steelers vs. Saints in Paris 9:30 AM ET · 1:00 PM kickoffs · SNF Chiefs at Seahawks 8:20 PM",
      caption:
        "Every football squares board has a winning square. When it's yours, you'll know 🏆\n\nLive scores are built in, so the winning square lights up at Q1, Half, Q3 and the Final, and the winner's phone gets the news. No math, no arguing.\n\nChiefs–Seahawks tonight? Your board is one link away: link in bio. Send this to the friend who always does the math wrong.",
      hashtags: [...H.core, H.office, "#chiefs"],
      altText:
        "Screen recording of JaxSquares on game day: a push notification, the score landing on the viewer's square as it lights up gold, then the home screen and the activity feed.",
      notes: ["At 48 hours (Tue Oct 27, 11:00): Insights → plays, average watch time, skip rate, sends, saves, profile visits.", AUDIO_EXPLAINER, GRID_COVER, NO_PIN, "Square 4: middle row, right. The gold square of the logo."],
    },
    {
      date: "2026-10-26", time: "14:00", kind: "reel", week: "w1", start: true,
      title: "Grid 5/9: Meet Jax (Let Jax pick)",
      asset: "02-let-jax-pick", cover: "r-grid-covers/05",
      tieIn: "Monday Night Football · Cowboys at Eagles · 8:15 PM ET · ESPN/ABC",
      caption:
        "Meet Jax 🐶 the dog behind JaxSquares, football and basketball squares.\n\nCan't pick a square? Tap “Let Jax pick”, choose how many, and he grabs random open squares for you. No favorites (unless you count treats).\n\nRunning a Cowboys–Eagles board tonight? Link in bio. Send this to the friend who'd let Jax pick 🐶",
      hashtags: ["#footballsquares", "#squarespool", H.office, "#eagles"],
      altText:
        "Jax, an illustrated tan and white dog, then a screen recording of JaxSquares where Let Jax pick claims five random open squares on a board.",
      notes: ["At 48 hours (Wed Oct 28, 14:00): Insights → plays, average watch time, skip rate, sends, saves, profile visits.", AUDIO_EXPLAINER, GRID_COVER, NO_PIN, "Square 5: the center of the logo."],
    },
    {
      date: "2026-10-27", time: "13:00", kind: "reel", week: "w1", start: true,
      title: "Grid 6/9: Text one link (Every squares group chat)",
      asset: "05-group-chat", cover: "r-grid-covers/06",
      caption:
        "Every football squares group chat: “who has the 7–3??” “resend the spreadsheet” “MIKE.” 😭\n\nOr… one link. Everyone picks from their own phone, Jax draws the numbers, and the board shows who won.\n\nSend this to the person who runs your squares 📲 Your board → link in bio.",
      hashtags: [...H.core, "#groupchat", H.office],
      altText:
        "A chaotic group chat about a squares spreadsheet freezes, one JaxSquares invite link drops in, and a phone shows friends picking squares on the board.",
      notes: ["At 48 hours (Thu Oct 29, 13:00): Insights → plays, average watch time, skip rate, sends, saves, profile visits.", AUDIO_EXPLAINER, GRID_COVER, NO_PIN, "Square 6: middle row, left. The middle row is done: the grid story goes up at 13:20."],
    },
    {
      date: "2026-10-28", time: "12:30", kind: "reel", week: "w1", start: true,
      title: "Grid 7/9: Free to set up (Squares board speedrun)",
      asset: "u1-speedrun", cover: "r-grid-covers/07",
      caption:
        "Make a squares board in 10 seconds ⏱\n\nPick the game, how squares win, prizes or just for fun, a name, create. Then one text to the group chat. 10 seconds flat with the defaults once you're signed in; read every step and it's still under a minute.\n\nFree to set up and invite, and players never pay. Boards with up to 5 players draw free; bigger boards are $4.99 for the host at the draw.\n\nSend this to whoever still makes the board on paper. Link in bio.",
      hashtags: [...H.core, H.office, "#gameday"],
      altText:
        "Screen recording of the JaxSquares squares app with a running stopwatch: picking a game, choosing how squares win, Just for fun, naming the board and creating it, then sending the invite to a group chat. The stopwatch stops at 10 seconds.",
      notes: ["At 48 hours (Fri Oct 30, 12:30): Insights → plays, average watch time, skip rate, sends, saves, profile visits.", AUDIO_EXPLAINER, GRID_COVER, NO_PIN, "Square 7: top row, right.", "Not a boost pick: the review step shows the host-fee line."],
    },
    {
      date: "2026-10-29", time: "12:30", kind: "reel", week: "w1", start: true,
      title: "Grid 8/9: No app needed (Join from the link)",
      asset: "u6-join-from-link", cover: "r-grid-covers/08",
      tieIn: "Thursday Night Football · Panthers at Packers · 8:15 PM ET · Prime Video",
      caption:
        "No app needed 📲 Here's a football squares link from the friend's side:\n\nTap a square, type your name, you're in. Nothing to download, no account, no password. Same room? Scan the code on the host's screen.\n\nPanthers–Packers tonight? Link in bio. Send this to the friend who always asks “do I have to download something?”",
      hashtags: [...H.core, "#packers"],
      altText:
        "A text from Maya with a JaxSquares link. The board opens on a phone with no app; the friend taps a square, types Sam and joins, then grabs a second square. A timer reads 3.6 seconds.",
      notes: ["At 48 hours (Sat Oct 31, 12:30): Insights → plays, average watch time, skip rate, sends, saves, profile visits.", AUDIO_EXPLAINER, GRID_COVER, NO_PIN, "Square 8: top row, middle."],
    },
    {
      date: "2026-10-30", time: "12:30", kind: "reel", week: "w1", start: true,
      title: "Grid 9/9: Football and basketball squares (Basketball squares)",
      asset: "u3-basketball-squares", cover: "r-grid-covers/09",
      tieIn: "NBA Cup group play starts Oct 30 · college basketball opens Nov 1–2",
      caption:
        "Squares aren't just for football 🏀\n\nJaxSquares runs basketball squares too: pick tonight's NBA game or type in any matchup, choose how squares win, and live scores call every winner. College hoops tips off next week.\n\nSend this to your hoops group chat. Your board → link in bio.",
      hashtags: [H.hoops, "#footballsquares", "#nba", "#collegebasketball", "#squarespool"],
      altText:
        "Screen recording of JaxSquares: tapping Basketball, picking tonight's game and making a basketball squares board in five taps, then the third quarter ending 75 to 70 on the viewer's square as Jax cheers.",
      notes: ["At 48 hours (Sun Nov 1, 12:30): Insights → plays, average watch time, skip rate, sends, saves, profile visits.", 
        AUDIO_EXPLAINER,
        GRID_COVER,
        NO_PIN,
        "Square 9: top left, the last one. Open your profile and check the logo lines up, then post the grid story at 12:50.",
        "On screen the league tab reads “Pro”, like the App Store art; the caption names the NBA to describe the games (not affiliated).",
      ],
    },
    {
      date: "2026-10-24", time: "11:20", kind: "story", week: "prep", start: true,
      title: "Grid story: the board is open",
      asset: "s-grid-progress/01",
      story: { sticker: "Link → app", text: "Our grid is a squares board 🟩 3 of 9 squares claimed. One more every day." },
    },
    {
      date: "2026-10-27", time: "13:20", kind: "story", week: "w1", start: true,
      title: "Grid story: 6 of 9",
      asset: "s-grid-progress/02",
      story: { sticker: "Question: “Who runs your squares?”", text: "6 of 9 squares claimed 👀 Three to go. Who runs your squares? Tell us 👇" },
    },
    {
      date: "2026-10-30", time: "12:50", kind: "story", week: "w1", start: true,
      title: "Grid story: board's full",
      asset: "s-grid-progress/03",
      story: { sticker: "Link → app", text: "Board's full. That's our logo 🟩 Tap to make yours." },
    },
    {
      date: "2026-10-30", time: "14:00", kind: "task", week: "w1", start: true,
      title: "Profile: Highlights",
      checklist: [
        "Save the 4 covers (above).",
        "Profile → + → Highlight → pick the 3 grid stories → name it “How it works” → Edit cover → choose the “How it works” cover.",
        "Make “Game days” from your game-day stories (TNF Oct 22, Sunday Oct 25) with its cover.",
        "Add “Square stats” after the Oct 27–28 poll stories and “Thanksgiving” in November, each with its cover.",
      ],
      copy: [
        { label: "Highlight 1", text: "How it works" },
        { label: "Highlight 2", text: "Game days" },
        { label: "Highlight 3", text: "Square stats" },
        { label: "Highlight 4", text: "Thanksgiving" },
      ],
      extras: [
        { label: "Cover: How it works", file: "p-highlight-covers/01.jpg" },
        { label: "Cover: Square stats", file: "p-highlight-covers/02.jpg" },
        { label: "Cover: Game days", file: "p-highlight-covers/03.jpg" },
        { label: "Cover: Thanksgiving", file: "p-highlight-covers/04.jpg" },
      ],
    },
    {
      date: "2026-10-22", time: "18:00", kind: "task", week: "prep",
      title: "Record a real test board (B-roll)",
      checklist: [
        "Make a board for tonight's TNF game with 3 friends.",
        "Screen-record making it and sharing the link: B-roll for the founder Reel (Nov 11).",
      ],
    },

    // ------------------------------------------------------------ WEEK 1
    {
      date: "2026-10-22", time: "11:30", kind: "task", week: "prep", start: true,
      title: "Launch prep (before Grid 1)",
      checklist: [
        "Open the app link from the bio on your phone and make sure it works.",
        "Line up 20 friends who run (or play in) squares and 3 group chats to post in.",
        "Ask 5 friends to share Grid 1/9 to their stories when it goes up at 12:30.",
      ],
    },
    {
      date: "2026-10-22", time: "12:40", kind: "task", week: "prep", start: true,
      title: "Personal push",
      checklist: [
        "Share Grid 1/9 to your personal story and to the 3 group chats.",
        "Text the 20 people directly: “made this for our squares, try it tonight for TNF?”",
        "Reply to every comment for the next hour.",
      ],
    },
    {
      date: "2026-10-26", time: "18:30", kind: "story", week: "w1",
      title: "MNF board is open",
      asset: "m1-mnf-cowboys-eagles",
      tieIn: "Cowboys at Eagles · 8:15 PM ET · ESPN/ABC",
      story: { sticker: "Link → app", text: "Start tonight's board 👇" },
    },
    {
      date: "2026-10-26", time: "21:30", kind: "story", week: "w1",
      title: "Q1 poll",
      story: { sticker: "Poll: 🙋 me / 😭 not me", text: "Who's got the Q1 square?" },
    },
    {
      date: "2026-10-27", time: "16:30", kind: "story", week: "w1",
      title: "On this day: Emmitt breaks the record (2002)",
      asset: "otd1-oct27-emmitt",
      story: { sticker: "Link → app", text: "On this day in 2002: former Gator Emmitt Smith passes Walter Payton 🐊 The final (17–14) landed on the 7–4 square. Make your board 👇" },
      notes: ["Post the video as a Story (it's 9:16). Feed posts wait until the grid is done.", AUDIO_NOSTALGIC],
    },
    {
      date: "2026-10-27", time: "18:00", kind: "story", week: "w1",
      title: "Poll: 0–0 or 7–7?",
      asset: "s-story-frames/01",
      story: { sticker: "Poll: 0–0 / 7–7", text: "" },
      notes: ["No text to add: the frame asks the question. Place the poll sticker in the frame's empty middle band."],
    },
    {
      date: "2026-11-13", time: "12:30", kind: "carousel", week: "w3",
      title: "Every square, ranked",
      asset: "c2-every-square-ranked", slides: 6,
      caption:
        "Every square in football, ranked 📊 (7,276 NFL final scores, 1999–2025)\n\nS-tier digits: 0 and 7. D-tier: 2 and 5. The 2–2 square has hit 4 times in 27 seasons.\n\nSave this before your next draw, and send it to your board's 2–2 holder.",
      hashtags: [...H.core, H.nfl, H.stats, H.fantasy],
      altText:
        "Heat map and rankings of football squares by how often NFL final scores land on them since 1999. Best: 0-7, 4-7 and 0-3. Worst: 2-2, 5-5 and 5-9. Most common final since 1999: 23-20.",
    },
    {
      date: "2026-10-28", time: "18:00", kind: "story", week: "w1",
      title: "Poll answer",
      asset: "s-story-frames/02",
      story: { sticker: "None (or a link to the carousel)", text: "Basically a coin flip." },
      notes: ["The frame shows the answer: add only this line."],
    },
    {
      date: "2026-10-29", time: "18:45", kind: "story", week: "w1",
      title: "TNF: Panthers at Packers",
      tieIn: "8:15 PM ET · Prime Video",
      story: { sticker: "Link → app", text: "TNF: Panthers at Packers, 8:15 on Prime. Board's a link away 👇" },
    },
    {
      date: "2026-10-30", time: "17:00", kind: "story", week: "w1",
      title: "Who's running squares this weekend?",
      asset: "s-story-frames/05",
      story: { sticker: "Questions", text: "" },
      notes: ["No text to add: the frame asks the question. Place the Questions sticker in the frame's middle band."],
    },
    {
      date: "2026-11-06", time: "17:15", kind: "task", week: "w2",
      title: "Reply with a Reel",
      checklist: [
        "Pick the best comment or question of the week (“does it work for college?” is perfect).",
        "Use Reply → Reel. Screen-record yourself making a board for that exact game. It lands on your grid like any Reel, so it waits until the logo is done.",
      ],
    },
    {
      date: "2026-10-31", time: "10:00", kind: "reel", week: "w1",
      title: "Florida vs Georgia: it left Jax",
      asset: "m2-florida-georgia",
      tieIn: "Florida vs. Georgia · 3:30 PM ET · ABC · Mercedes-Benz Stadium, Atlanta",
      caption:
        "The Cocktail Party left Jacksonville this year. Your squares board doesn't have to 🐊🐶\n\nFlorida vs. Georgia, 3:30 ET on ABC, in Atlanta while EverBank gets renovated. It's the first time since 1995 the game isn't in Jax.\n\nRun the board from anywhere: 30 seconds, one link, free to set up. Gators or Dawgs? 🐊 / 🐶",
      hashtags: [H.gators, "#godawgs", "#floridageorgia", H.cfb, "#footballsquares"],
      notes: [AUDIO_TRENDING, COVER],
    },
    {
      date: "2026-10-31", time: "14:45", kind: "story", week: "w1",
      title: "Cocktail Party kickoff",
      tieIn: "Florida vs. Georgia · 3:30 PM ET · ABC",
      story: { sticker: "Link → app", text: "Kickoff 3:30 on ABC. Florida–Georgia board's open 🐊🐶" },
    },
    {
      date: "2026-10-31", time: "19:00", kind: "story", week: "w1",
      title: "Halloween: scariest square",
      asset: "s-story-frames/08",
      story: { sticker: "Emoji slider 💀 → 🔥", text: "Happy Halloween 👻 Scariest square on the board: 2–2." },
    },
    {
      date: "2026-11-01", time: "10:30", kind: "story", week: "w1",
      title: "Jags are home",
      asset: "m3-colts-jaguars",
      tieIn: "Colts at Jaguars · 1:00 PM ET · CBS · EverBank Stadium (clocks fell back overnight)",
      story: { sticker: "Link → app", text: "Jags are home at 1. Lock your board by kickoff 🐆" },
    },
    {
      date: "2026-11-01", time: "11:30", kind: "story", week: "w1",
      title: "Game day checklist",
      asset: "s-story-frames/06",
      story: { sticker: "Link → app", text: "Board full? Lock it before 1." },
    },
    {
      date: "2026-11-01", time: "20:00", kind: "task", week: "w1",
      title: "Weekly review (15 min)",
      checklist: [
        "Reel insights: note sends per reach, skip rate and saves for each post.",
        "Run the boards-created query (see KPIs).",
        "Write down the one format to repeat and the one to drop.",
      ],
    },

    // ------------------------------------------------------------ WEEK 2
    {
      date: "2026-11-02", time: "14:00", kind: "reel", week: "w2",
      title: "1 year ago: Cam Little's 68-yarder",
      asset: "otd2-nov02-cam-little",
      tieIn: "Monday Night Football · Bears at Seahawks · 8:15 PM ET · ESPN",
      caption:
        "One year ago today: Cam Little drilled an NFL-record 68-yard field goal in Las Vegas 🦵💥\n\nJaguars 30, Raiders 29 in overtime. That's the 0–9 square, which lands on 0.7% of NFL finals.\n\nDuval, where were you for this one?",
      hashtags: [H.duval, H.jags, H.otd, H.history, "#footballsquares"],
      notes: [AUDIO_NOSTALGIC, COVER],
    },
    {
      date: "2026-11-02", time: "19:00", kind: "story", week: "w2",
      title: "MNF: Bears at Seahawks",
      tieIn: "8:15 PM ET · ESPN",
      story: { sticker: "Link → app", text: "MNF: Bears at Seahawks. Make the board before 8:15 👇" },
    },
    {
      date: "2026-11-03", time: "12:00", kind: "story", week: "w2",
      title: "Quiz: most common final",
      asset: "s-story-frames/03",
      tieIn: "Election Day. Keep the feed quiet today.",
      story: { sticker: "Quiz: 20–17 / 23–20 ✓ / 27–24 / 24–17", text: "" },
      notes: ["No text to add: the frame asks the question. Place the quiz sticker in the frame's middle band and mark 23–20 as the answer."],
    },
    {
      date: "2026-11-03", time: "20:15", kind: "story", week: "w2",
      title: "First CFP rankings",
      tieIn: "First College Football Playoff rankings · 7 PM ET · ESPN",
      story: { sticker: "Questions", text: "First CFP rankings are out. Who's your #1?" },
    },
    {
      date: "2026-11-04", time: "12:30", kind: "carousel", week: "w2",
      title: "Host cheat sheet",
      asset: "c3-host-cheat-sheet", slides: 6,
      caption:
        "The squares host cheat sheet 📋 5 rules that keep your board fair.\n\nDraw before kickoff. Cap squares per player. Winners every quarter. Make the office board Just for fun. Let the board do the math.\n\nSave it, then send it to whoever runs your squares.",
      hashtags: [...H.core, H.office, "#gameday", H.fantasy],
      altText:
        "Six slides of tips for hosting a football squares board: draw the numbers before kickoff, cap squares per player, have a winner every quarter, make office boards Just for fun, and let the app call the winners.",
    },
    {
      date: "2026-11-04", time: "18:00", kind: "story", week: "w2",
      title: "Quiz answer: 23–20",
      asset: "s-story-frames/04",
      story: { sticker: "None", text: "" },
      notes: ["No text to add: the frame shows the answer."],
    },
    {
      date: "2026-11-05", time: "12:00", kind: "reel", week: "w2",
      title: "Jags in primetime",
      asset: "m4-tnf-jaguars-ravens",
      tieIn: "Thursday Night Football · Jaguars at Ravens · 8:15 PM ET · Prime Video",
      caption:
        "Jags in primetime 🐆 Thursday Night Football: Jaguars at Ravens, 8:15 ET on Prime Video.\n\nMake the board at lunch, drop the link in the group chat, lock it before kickoff. Live scores call every quarter's winner.\n\nWho's running the Duval board tonight? 👇",
      hashtags: [H.duval, H.jags, H.tnf, ...H.core],
      notes: [AUDIO_TRENDING, COVER],
    },
    {
      date: "2026-11-05", time: "18:30", kind: "story", week: "w2",
      title: "Jags board: lock by 8:15",
      tieIn: "Jaguars at Ravens · 8:15 PM ET · Prime Video",
      story: { sticker: "Link → app", text: "Jags board. Lock it by 8:15 🐆" },
    },
    {
      date: "2026-11-05", time: "23:30", kind: "story", week: "w2",
      title: "Which square hit?",
      story: { sticker: "Questions", text: "Jaguars–Ravens is final 🐆 Who had the winning square? 🙋" },
      notes: ["Post it after the final whistle."],
    },
    {
      date: "2026-11-06", time: "12:00", kind: "story", week: "w2",
      title: "1869: the first college football game",
      story: {
        sticker: "None",
        text: "On this day in 1869: Rutgers 6, Princeton 4, the first college football game ever. If they'd had squares, the 6–4 square takes it. 🏈",
      },
    },
    {
      date: "2026-11-06", time: "12:15", kind: "task", week: "w2",
      title: "Optional: comment-to-DM link",
      checklist: [
        "Set up a comment keyword (e.g. BOARD) that DMs the app link (ManyChat or Meta's own automation).",
        "Then end one caption a week with “Comment BOARD and we'll DM you the link.” It's allowed because it delivers something.",
      ],
    },
    {
      date: "2026-11-07", time: "11:00", kind: "reel", week: "w2",
      title: "Miami at Notre Dame",
      asset: "m5-miami-notre-dame",
      tieIn: "Miami at Notre Dame · 7:30 PM ET · NBC/Peacock",
      caption:
        "Saturday night in South Bend: Miami at Notre Dame, 7:30 ET on NBC 🏟️\n\nCollege boards work the same: pick the game, share one link, and scores update themselves. Free to set up.\n\nCanes or Irish? 👇",
      hashtags: [H.cfb, "#canes", "#notredame", ...H.core],
      notes: [AUDIO_TRENDING, COVER],
    },
    {
      date: "2026-11-07", time: "19:00", kind: "story", week: "w2",
      title: "Miami at Notre Dame board",
      tieIn: "7:30 PM ET · NBC",
      story: { sticker: "Link → app", text: "Canes at Irish in 30. Board's open 👇" },
    },
    {
      date: "2026-11-08", time: "09:15", kind: "story", week: "w2",
      title: "Madrid game",
      tieIn: "Bengals vs. Falcons · Bernabéu, Madrid · 9:30 AM ET",
      story: { sticker: "Link → app", text: "Breakfast football from Madrid 🇪🇸 Bengals vs Falcons at 9:30." },
    },
    {
      date: "2026-11-08", time: "11:00", kind: "reel", week: "w2",
      title: "On this day: Dempsey's 63-yarder (1970)",
      asset: "otd3-nov08-dempsey",
      caption:
        "On this day in 1970, Tom Dempsey kicked a 63-yard field goal at the gun. Saints 19, Lions 17 🦵\n\n19–17 is a squares legend: the Miracle at the Meadowlands (1978) ended 19–17 too. The 9–7 square keeps winning in chaos.\n\nGot a 9 this week? 👀",
      hashtags: [H.otd, H.history, "#saints", ...H.core],
      notes: [AUDIO_NOSTALGIC, COVER],
    },
    {
      date: "2026-11-08", time: "20:00", kind: "task", week: "w2",
      title: "Weekly review + creator outreach",
      checklist: [
        "Weekly review (same as last Sunday).",
        "DM 5 micro-creators (Jax sports, Gators, fantasy football) with the creator template. Goal: 1 Collab for Nov 15.",
        "DM 3 local bars or office managers with the bar template (Just for fun boards only).",
      ],
    },

    // ------------------------------------------------------------ WEEK 3
    {
      date: "2026-11-09", time: "19:00", kind: "story", week: "w3",
      title: "MNF: Bills at Vikings",
      tieIn: "8:15 PM ET · ESPN/ABC",
      story: { sticker: "Link → app", text: "MNF: Bills at Vikings. Draw your numbers live 🔢" },
    },
    {
      date: "2026-11-10", time: "13:30", kind: "task", week: "w3",
      title: "Boost decision",
      checklist: [
        "Compare sends per reach across the boost candidates (no amounts on screen): u4-every-phone, u6-join-from-link, 02-let-jax-pick, u2-bar-big-screen, 04-best-worst-squares.",
        "Boost the winner with $50–150 over 5 days. Audience: US, 21+, football / fantasy football interests. Goal: profile visits.",
        "Judge it on boards created, not likes.",
      ],
    },
    {
      date: "2026-11-11", time: "09:00", kind: "story", week: "w3",
      title: "Veterans Day",
      story: { sticker: "None", text: "Thank you to everyone who served 🇺🇸" },
      notes: ["Optional. Keep it simple, with no product mention."],
    },
    {
      date: "2026-11-11", time: "12:30", kind: "film", week: "w3",
      title: "Founder Reel: why we built it (and who Jax is)",
      script: [
        "0–2s (on-screen text): “I built a squares app because our group chat broke.”",
        "2–10s: hold up the old way. Show the whiteboard photo, the spreadsheet, the 99+ unread chat.",
        "10–25s: screen-record making a real board, start to share link (you recorded this in Prep).",
        "25–35s, to camera: “Free to set up, and your friends never need an app or an account. Jax draws the numbers live, winners light up.” If you can, film the real Jax here: he's the logo.",
        "35–40s, ask: “What do we build next: Pick'em, Bracket Battles, or King of the Hill?”",
      ],
      caption:
        "Why we built JaxSquares 🐶 (and what's next)\n\nOur squares lived in a group chat, a blurry whiteboard photo and a spreadsheet nobody could find. So we built the board we wanted, and named it after Jax: one link, everyone picks from their phone, numbers draw live, winners light up.\n\nNext up: Pick'em, Bracket Battles or King of the Hill? Vote in the comments 👇",
      hashtags: ["#buildinpublic", "#startup", "#jacksonville", ...H.core],
      notes: ["Film vertical, natural light, captions on (Instagram's auto-captions are fine)."],
    },
    {
      date: "2026-11-12", time: "12:00", kind: "task", week: "w3",
      title: "Lock in Sunday's Collab",
      checklist: [
        "Confirm the creator or friend account for Sunday.",
        "Send them the 07 video and the caption. Post it from @jaxsquares and use Tag people → Invite collaborator.",
      ],
    },
    {
      date: "2026-11-12", time: "18:45", kind: "story", week: "w3",
      title: "TNF: Commanders at Giants",
      asset: "s-story-frames/06",
      tieIn: "8:15 PM ET · Prime Video",
      story: { sticker: "Link → app", text: "TNF: Commanders at Giants 👇" },
    },
    {
      date: "2026-11-13", time: "17:00", kind: "story", week: "w3",
      title: "Friday night: FSU at Pitt",
      tieIn: "Florida State at Pitt · 7:00 PM ET · ESPN",
      story: { sticker: "Link → app", text: "Friday night football: FSU at Pitt, 7:00 on ESPN. Board? 👇" },
    },
    {
      date: "2026-11-14", time: "12:00", kind: "story", week: "w3",
      title: "College Saturday",
      tieIn: "Florida at Kentucky (evening) · Duke at Miami",
      story: { sticker: "Link → app", text: "College Saturday: Florida at Kentucky tonight · Duke at Miami. One board per game 👇" },
      notes: ["Check kickoff times the week of. Florida–Kentucky was in a 6–8 PM window when this plan was written."],
    },
    {
      date: "2026-11-15", time: "09:15", kind: "story", week: "w3",
      title: "Munich game",
      tieIn: "Patriots vs. Lions · Munich · 9:30 AM ET",
      story: { sticker: "Link → app", text: "Breakfast football from Munich 🇩🇪 Patriots vs Lions at 9:30." },
    },
    {
      date: "2026-11-15", time: "11:00", kind: "reel", week: "w3",
      title: "COLLAB: Feature rundown",
      asset: "07-features",
      tieIn: "Jaguars at Titans · 1:00 PM ET · FOX",
      caption:
        "Football squares, minus the spreadsheet 🏈\n\nNo app to download. Same room? Scan the code. Can't decide? Let Jax pick. Prize notes, or just for fun. Scores update themselves.\n\nJags at Titans at 1. Board's open 👇",
      hashtags: [H.duval, ...H.core, H.office, H.nfl],
      notes: ["Post as a Collab (Tag people → Invite collaborator).", AUDIO_EXPLAINER, COVER],
    },
    {
      date: "2026-11-15", time: "20:00", kind: "task", week: "w3",
      title: "Weekly review",
      checklist: ["Weekly review.", "Reshare any boards people tagged you in (ask first)."],
    },

    // ------------------------------------------------------------ WEEK 4
    {
      date: "2026-11-16", time: "14:00", kind: "reel", week: "w4",
      title: "Thanksgiving slate: 6 games, 6 boards",
      asset: "08-thanksgiving-slate",
      tieIn: "Monday Night Football · Chargers at Ravens · 8:15 PM ET · ESPN",
      caption:
        "Thanksgiving week: 5 NFL games + Florida–FSU in 3 days 🦃🏈\n\nWed: Packers at Rams, 8:00 Netflix (the first-ever Thanksgiving Eve game)\nThu: Bears at Lions 1:00 CBS · Eagles at Cowboys 4:30 FOX · Chiefs at Bills 8:20 NBC\nFri: Broncos at Steelers 3:00 Prime · Florida at FSU 3:30 ABC\n\nOne board per game. Kids' table board? Just for fun. Save this.",
      hashtags: [H.tg, "#thanksgiving", ...H.core, H.friendsgiving],
      notes: [AUDIO_EXPLAINER, COVER, "Check the Florida–FSU kickoff the week of. ACC and CBS list 3:30; one outlet listed 8:30."],
    },
    {
      date: "2026-11-16", time: "19:00", kind: "story", week: "w4",
      title: "MNF: Chargers at Ravens",
      tieIn: "8:15 PM ET · ESPN",
      story: { sticker: "Link → app", text: "MNF: Chargers at Ravens 👇" },
    },
    {
      date: "2026-11-17", time: "12:00", kind: "story", week: "w4",
      title: "Thanksgiving boards poll",
      asset: "s-story-frames/07",
      story: { sticker: "Poll: 1 / 2–3 / All of them", text: "" },
      notes: ["No text to add: the frame asks the question. Place the poll sticker in the frame's middle band."],
    },
    {
      date: "2026-11-17", time: "21:30", kind: "story", week: "w4",
      title: "CFP rankings reaction",
      tieIn: "CFP rankings · 9 PM ET · ESPN",
      story: { sticker: "Questions", text: "New CFP rankings. Who got robbed?" },
    },
    {
      date: "2026-11-18", time: "12:30", kind: "carousel", week: "w4",
      title: "Thanksgiving squares playbook",
      asset: "c4-thanksgiving-playbook", slides: 6,
      caption:
        "The Thanksgiving squares playbook 🦃 Save it for next week.\n\nOne board per game, a Just for fun board for the kids' table, and prizes that aren't cash: loser does the dishes, winner gets the first plate.\n\nSend this to whoever's hosting.",
      hashtags: ["#thanksgiving", H.tg, H.friendsgiving, "#footballsquares", "#familygamenight"],
      altText:
        "Six-slide Thanksgiving guide to football squares: the 2026 Thanksgiving week schedule, one board per game, a Just for fun kids' table board, and prizes like doing the dishes.",
    },
    {
      date: "2026-11-19", time: "12:30", kind: "reel", week: "w4",
      title: "On this day: Rams 54, Chiefs 51 (2018)",
      asset: "otd4-nov19-rams-chiefs",
      tieIn: "Thursday Night Football · Colts at Texans · 8:15 PM ET · Prime Video",
      caption:
        "On this day in 2018: Rams 54, Chiefs 51 on Monday Night Football, the first NFL game where both teams scored 50+ 🤯\n\n105 points, and the winning square was 4–1.\n\nSend this to the friend who still talks about this game.",
      hashtags: [H.otd, H.history, H.mnf, ...H.core],
      notes: [AUDIO_NOSTALGIC, COVER],
    },
    {
      date: "2026-11-19", time: "18:45", kind: "story", week: "w4",
      title: "TNF: Colts at Texans",
      tieIn: "8:15 PM ET · Prime Video",
      story: { sticker: "Link → app", text: "TNF: Colts at Texans 👇" },
    },
    {
      date: "2026-11-20", time: "12:00", kind: "reel", week: "w4",
      title: "On this day: The Play (1982)",
      asset: "otd5-nov20-the-play",
      caption:
        "On this day in 1982: The Play. Five laterals, the Stanford band on the field, Cal wins 25–20 🎺\n\nStanford led 20–19 with four seconds left. The winning square flipped from 9–0 to 5–0 on the very last play. That's squares.\n\nSend this to the most heartbroken squares player you know.",
      hashtags: [H.otd, H.cfb, "#theplay", "#calbears", "#footballsquares"],
      notes: [AUDIO_NOSTALGIC, COVER],
    },
    {
      date: "2026-11-21", time: "11:00", kind: "story", week: "w4",
      title: "College Saturday",
      tieIn: "Vanderbilt at Florida (midday) · NC State at FSU · BYU at Kansas",
      story: { sticker: "Link → app", text: "College Saturday: Vandy at Florida · NC State at FSU. Board up? 👇" },
      notes: ["Check kickoff times the week of."],
    },
    {
      date: "2026-11-22", time: "11:30", kind: "story", week: "w4",
      title: "Jags at Giants",
      asset: "s-story-frames/06",
      tieIn: "Jaguars at Giants · 1:00 PM ET · CBS",
      story: { sticker: "Link → app", text: "Jags at Giants at 1. Lock the board 🐆" },
    },
    {
      date: "2026-11-22", time: "12:00", kind: "reel", week: "w4",
      title: "SNF from Mexico City",
      asset: "m6-snf-mexico-city",
      tieIn: "Sunday Night Football · Vikings vs. 49ers · Estadio Banorte, Mexico City · 8:20 PM ET · NBC",
      caption:
        "Squares go international 🇲🇽 Sunday Night Football from Mexico City: Vikings vs. 49ers, 8:20 ET on NBC.\n\nMake the board during the early games, send the link, lock it by kickoff.\n\nWho's taking the Vikings–49ers board? 👇",
      hashtags: [H.snf, H.nfl, "#mexicocity", ...H.core],
      notes: [AUDIO_TRENDING, COVER],
    },
    {
      date: "2026-11-22", time: "20:00", kind: "task", week: "w4",
      title: "Weekly review + Thanksgiving prep",
      checklist: [
        "Weekly review.",
        "Line up Thanksgiving: remind the 20 launch-day friends to make family boards.",
        "Ask 3 Collab partners to share the Thanksgiving playbook.",
      ],
    },

    // ------------------------------------------------------------ THANKSGIVING WEEK
    {
      date: "2026-11-23", time: "14:00", kind: "reel", week: "tg",
      title: "Every Thanksgiving family group chat",
      asset: "05b-group-chat-thanksgiving",
      tieIn: "Monday Night Football · Bengals at Commanders · 8:15 PM ET · ESPN",
      caption:
        "Every Thanksgiving family group chat: “what's a square” “I call the 7–0” “spreadsheet attached” 😭🦃\n\nOr… one link. Grandma picks from her phone, Jax draws the numbers, and the board calls the winner every quarter. Free to set up.\n\nSend this to the family group chat. You know the one.",
      hashtags: ["#thanksgiving", "#familygroupchat", H.tg, "#footballsquares", H.friendsgiving],
      notes: [AUDIO_TRENDING, COVER],
    },
    {
      date: "2026-11-23", time: "19:00", kind: "story", week: "tg",
      title: "MNF: Bengals at Commanders",
      tieIn: "8:15 PM ET · ESPN",
      story: { sticker: "Link → app", text: "MNF: Bengals at Commanders 👇" },
    },
    {
      date: "2026-11-24", time: "12:00", kind: "story", week: "tg",
      title: "Hosting Thursday?",
      asset: "s-story-frames/07",
      story: { sticker: "Link → app", text: "Hosting Thursday? Make your boards tonight. 30 seconds each 🦃" },
    },
    {
      date: "2026-11-25", time: "12:00", kind: "reel", week: "tg",
      title: "Thanksgiving Eve: Packers at Rams",
      asset: "m7-thanksgiving-eve",
      tieIn: "Packers at Rams · 8:00 PM ET · Netflix · first-ever Thanksgiving Eve game",
      caption:
        "The first-ever Thanksgiving Eve NFL game: Packers at Rams, 8:00 ET on Netflix 🦃📺\n\nFriendsgiving board, anyone? 30 seconds to make, one link to share, free to set up.\n\nWho's hosting Friendsgiving tonight? 👇",
      hashtags: ["#thanksgivingeve", H.friendsgiving, H.tg, "#footballsquares", H.nfl],
      notes: [AUDIO_TRENDING, COVER],
    },
    {
      date: "2026-11-25", time: "19:00", kind: "story", week: "tg",
      title: "Thanksgiving Eve board",
      tieIn: "8:00 PM ET · Netflix",
      story: { sticker: "Link → app", text: "Packers at Rams in an hour. Friendsgiving board 👇" },
    },
    {
      date: "2026-11-26", time: "09:30", kind: "reel", week: "tg",
      title: "Happy Thanksgiving: Red Grange, 101 years ago",
      asset: "otd6-nov26-grange",
      caption:
        "101 years ago today, Red Grange made his NFL debut on Thanksgiving. Bears 0, Cardinals 0 🦃\n\nA 0–0 tie means the same square won every quarter. Happy Thanksgiving from JaxSquares: three games today, three boards, one link each.\n\nWhat's your square for Bears–Lions? 👇",
      hashtags: ["#thanksgiving", H.tg, H.otd, H.history, "#footballsquares"],
      notes: [AUDIO_NOSTALGIC, COVER],
    },
    {
      date: "2026-11-26", time: "12:30", kind: "story", week: "tg",
      title: "Board 1: Bears at Lions",
      tieIn: "1:00 PM ET · CBS",
      story: { sticker: "Link → app", text: "Board 1 of 3: Bears at Lions, 1:00 🦃" },
    },
    {
      date: "2026-11-26", time: "16:00", kind: "story", week: "tg",
      title: "Board 2: Eagles at Cowboys",
      tieIn: "4:30 PM ET · FOX",
      story: { sticker: "Link → app", text: "Board 2 of 3: Eagles at Cowboys, 4:30 🦃" },
    },
    {
      date: "2026-11-26", time: "20:00", kind: "story", week: "tg",
      title: "Board 3: Chiefs at Bills",
      tieIn: "8:20 PM ET · NBC",
      story: { sticker: "Link → app", text: "Nightcap board: Chiefs at Bills, 8:20 🦃" },
    },
    {
      date: "2026-11-26", time: "22:30", kind: "story", week: "tg",
      title: "Show us your boards",
      story: { sticker: "Add Yours", text: "Show us your Thanksgiving board 📸 Screenshot + tag @jaxsquares" },
    },
    {
      date: "2026-11-27", time: "13:00", kind: "story", week: "tg",
      title: "Leftovers board",
      tieIn: "Broncos at Steelers 3:00 PM ET Prime Video · Florida at Florida State 3:30 PM ET ABC",
      story: { sticker: "Link → app", text: "Leftovers board 🥪 Broncos at Steelers 3:00 · Florida at FSU 3:30" },
    },
    {
      date: "2026-11-28", time: "11:00", kind: "story", week: "tg",
      title: "Rivalry Saturday",
      story: { sticker: "Link → app", text: "Rivalry Saturday. One board per game 👇" },
    },
    {
      date: "2026-11-29", time: "15:30", kind: "story", week: "tg",
      title: "Titans at Jaguars",
      tieIn: "4:05 PM ET · CBS · EverBank Stadium",
      story: { sticker: "Link → app", text: "Jags home at 4:05. Last board of the holiday weekend 🐆" },
    },
    {
      date: "2026-11-29", time: "20:00", kind: "task", week: "tg",
      title: "Launch retro",
      checklist: [
        "Pull 6 weeks of insights: top 3 Reels by sends per reach, top carousel by saves.",
        "Boards created per week (query in KPIs). Compare with the posting calendar.",
        "Plan December around what worked: rivalry week, conference title games, the big game run-up.",
        "Post a thank-you carousel of the best user boards (with permission).",
      ],
    },

    // ------------------------------------------------------------ USE-CASE REELS (who it's for, how it feels)
    {
      date: "2026-11-12", time: "12:30", kind: "reel", week: "w3",
      title: "Squares on the bar TV",
      asset: "u2-bar-big-screen",
      tieIn: "Thursday Night Football · Commanders at Giants · 8:15 PM ET · Prime Video",
      caption:
        "Thursday night at the bar? Put the squares on the TV 📺\n\nOpen the board in TV mode on any screen (AirPlay, Chromecast, HDMI or the TV's browser). The room scans the code to grab a square, no app needed. The numbers get drawn on the big screen and every winner pops up live.\n\nBars and watch parties: run it Just for fun, no purchase needed to play. Send this to the bar you watch at every week.",
      hashtags: ["#footballsquares", "#watchparty", "#sportsbar", "#thursdaynightfootball"],
      altText:
        "A bar at night with a TV showing a JaxSquares board and a big QR code. A guest scans it, types their name and claims a square; the board fills, the numbers are drawn on the TV and a winner card for Rosa pops up with Jax cheering.",
      notes: [AUDIO_EXPLAINER, COVER, "Pair it with the bar outreach DM (Outreach templates → Bars and offices).", "Boost candidate: no amounts on screen, Just for fun."],
    },
    {
      date: "2026-11-24", time: "13:00", kind: "reel", week: "tg",
      title: "Office squares, minus the spreadsheet",
      asset: "u5-office-squares",
      caption:
        "Running the office squares for Thanksgiving? Ditch the spreadsheet 📊\n\nOne link in the team chat, everyone picks from their desk, Jax draws the numbers and live scores call every winner. No reply-all, no locked file.\n\nMake it Just for fun with prize notes like “winner picks Friday lunch”. Send this to whoever owns the squares spreadsheet.",
      hashtags: [H.office, "#footballsquares", H.tg, "#worklife"],
      altText:
        "A messy office squares spreadsheet with conflicting names and reply-all emails freezes, then the JaxSquares invite sheet for an Office Game Day board, coworkers picking squares and a live score calling a winner.",
      notes: [AUDIO_EXPLAINER, COVER, "Offices: pitch Just for fun boards with no purchase needed.", "Boost candidate: no amounts on screen."],
    },
  ],
};

// The fix-up step copies the live texts from their source.
{
  const fix = PLAN.items.find((it) => it.title === "Fix the live Grid 1 caption and the bio");
  const grid1 = PLAN.items.find((it) => it.title.startsWith("Grid 1/9"));
  fix.copy = [
    { label: "Grid 1 caption", text: `${grid1.caption}\n\n${grid1.hashtags.join(" ")}` },
    { label: "Bio", text: PROFILE.bio },
  ];
}
