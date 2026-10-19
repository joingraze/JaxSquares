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
};

const AUDIO_EXPLAINER =
  "Videos are exported silent. In the Reels editor, add an upbeat instrumental from Instagram's audio library at low volume.";
const AUDIO_TRENDING =
  "Videos are exported silent. Add a trending sound (the ↗ arrow in the audio browser) with a build or drop. The chaos and the reveal are cut for it.";
const AUDIO_NOSTALGIC =
  "Videos are exported silent. Add a broadcast-style or nostalgic instrumental at low volume.";
const COVER = "Upload the matching cover image as the Reel cover so the profile grid stays clean.";

export const PLAN = {
  title: "JaxSquares Instagram Launch",
  handle: "@jaxsquares",
  start: "2026-10-20",
  end: "2026-11-29",
  timezone: "America/New_York",

  strategy: {
    positioning:
      "Squares for any game. No app, no signup, no math, and we never touch the money. Competitors charge per grid ($10–$13), need a download, or need an account. Nobody in the category has a personality-led Instagram.",
    pillars: [
      { name: "Show the product", share: "35%", what: "20-second demos, the live draw, winners lighting up. Every post shows the real app." },
      { name: "Squares nerdery", share: "25%", what: "Real odds from 7,276 NFL finals: best/worst squares, digit tiers, most common scores. Built to be saved and sent." },
      { name: "This game, this week", share: "25%", what: "Primetime, Jaguars, Gators and Thanksgiving games. Make the board the plan for the game." },
      { name: "On this day", share: "15%", what: "Verified history with a squares twist: which square that famous final score paid." },
    ],
    cadence: [
      "4–5 feed posts a week: about 4 Reels and 1 carousel. Buffer's 2026 data: 3–5 posts/week roughly doubles follower growth vs. 1–2.",
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
      "Say 'the Big Game', never 'Super Bowl', in posts and ads (NFL trademark). Team names are fine to identify a game. No logos, uniforms, team colors, broadcast footage or player photos.",
      "Never use 'bet', 'wager', 'gamble' or 'cash out'. Say 'squares pool', 'board', 'bragging rights'.",
      "Paid boosts: only $0-pool creatives. Meta requires prior written permission for ads where money is part of both entry and prize. Boost candidates: 02, 04, 07.",
      "Lean on 'we never touch the money'. Buy-ins are just numbers you track, or set to $0.",
      "Bars and offices: only pitch free boards with no purchase needed to claim a square.",
      "Giveaways need official rules, eligibility, and a 'not sponsored by Instagram' line. Don't require follows or tags to enter. Skip them for this launch.",
      "Add 'Not affiliated with the NFL or NCAA' to the bio.",
    ],
    kpis: [
      { metric: "Boards created (north star)", how: "npx wrangler d1 execute jaxsquares --remote --command \"SELECT date(created_at/1000,'unixepoch') AS day, COUNT(*) AS boards FROM games GROUP BY day ORDER BY day DESC LIMIT 14\"" },
      { metric: "Sends per reach and skip rate", how: "Reel insights. Double down on whatever gets sent." },
      { metric: "Saves", how: "Carousel insights. Saves mean the odds and how-to content is working." },
      { metric: "Profile visits → link taps", how: "Professional dashboard. If taps lag visits, rewrite the bio's first line." },
    ],
    targets:
      "Stretch targets, not forecasts: 400+ followers and 150+ boards created by Nov 29, and one Reel past 10k views. Benchmarks for brand-new accounts are thin; the boards count matters more than followers.",
    setup: {
      name: "JaxSquares · Football Squares",
      bio: "Football squares for any game 🏈\nFree · no app · no signup\nWe draw the numbers + call the winners\nNot affiliated w/ NFL or NCAA 👇",
      link: "Your app URL with ?ref=ig on the end, so Instagram visits show up in Cloudflare analytics.",
      highlights: ["How it works", "Odds", "Game days", "Thanksgiving"],
    },
    outreach: {
      creator:
        "Hey [name]! Love your [team] content. We built JaxSquares, a free squares pool app (no download, no signup). Want to run a free followers' board for [game]? We set it up, you share the link, and we co-post the Reel as a Collab. Costs you and your followers nothing.",
      bar:
        "Hi! We make JaxSquares, a free squares board your regulars can join with a QR code or link. No app and no purchase needed to play. Want us to set up a free board for [game] for your crowd?",
      ugc: "Screenshot your board and tag @jaxsquares. We reshare the best ones (with your OK).",
    },
  },

  weeks: [
    {
      key: "prep",
      label: "Prep",
      dates: "Oct 20–25",
      theme: "Set up and seed the grid",
      goal: "A profile that looks alive before launch: bio, link, 3 seed posts, highlights.",
    },
    {
      key: "w1",
      label: "Week 1",
      dates: "Oct 26–Nov 1",
      theme: "Launch: what it is",
      goal: "Launch on Cowboys–Eagles MNF. Personal push to friends and group chats. First 25 boards.",
    },
    {
      key: "w2",
      label: "Week 2",
      dates: "Nov 2–8",
      theme: "Proof and personality",
      goal: "Jaguars primetime, the commissioner cheat sheet, on-this-day hits. First creator DMs.",
    },
    {
      key: "w3",
      label: "Week 3",
      dates: "Nov 9–15",
      theme: "Community and creators",
      goal: "Founder story, first Collab post, first small boost on the best $0 Reel.",
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
    {
      date: "2026-10-20", time: "10:00", kind: "task", week: "prep",
      title: "Set up the account",
      checklist: [
        "Switch @jaxsquares to a Professional account (category: App Page).",
        "Name field: “JaxSquares · Football Squares”. The name field is searchable.",
        "Paste the bio and link from Setup. Link = app URL + ?ref=ig.",
        "Make 4 Highlights: How it works, Odds, Game days, Thanksgiving. Use story frames as covers.",
        "Run a real test board with 3 friends and screen-record it (B-roll for the founder Reel).",
        "Save quick replies for “link?”, “is it free?” and “do I need the app?”.",
      ],
    },
    {
      date: "2026-10-21", time: "12:30", kind: "carousel", week: "prep",
      title: "Seed post: how football squares works",
      asset: "c1-how-squares-works", slides: 7,
      caption:
        "How football squares works, in 7 slides 🏈\n\nThe grid, the draw, the last-digit rule and how a quarter gets paid. Save this for game day.\n\nSend it to the person who always asks “wait, which square is mine?”\n\nRun your own board free → link in bio",
      hashtags: [...H.core, H.office, H.fantasy, "#gameday"],
      altText:
        "Seven-slide explainer of football squares: a 10 by 10 grid, friends claim squares, digits 0 to 9 are drawn for each row and column, and the last digit of each team's score picks the winning square each quarter.",
      notes: ["Pin this post (pin 3 total by launch)."],
    },
    {
      date: "2026-10-22", time: "12:30", kind: "reel", week: "prep",
      title: "Seed post: feature rundown",
      asset: "07-features",
      caption:
        "Football squares, minus the spreadsheet 🏈\n\nNo app to download. No accounts. Free pools at $0, or track a buy-in. Cap squares per player. Winners called automatically.\n\nWorks for football, hoops, baseball, hockey and soccer. Link in bio.",
      hashtags: [...H.core, H.office, H.fantasy, "#gamedayparty"],
      notes: [AUDIO_EXPLAINER, COVER, "Boost candidate later: no dollar amounts on screen."],
    },
    {
      date: "2026-10-22", time: "18:45", kind: "story", week: "prep",
      title: "TNF: Patriots at Bears",
      asset: "s-story-frames/06",
      tieIn: "Thursday Night Football · Patriots at Bears · 8:15 PM ET · Prime Video",
      story: { sticker: "Link → app", text: "TNF: Patriots at Bears, 8:15 on Prime. Board takes 20 seconds 👇" },
    },
    {
      date: "2026-10-23", time: "13:00", kind: "reel", week: "prep",
      title: "Seed post: best and worst squares",
      asset: "04-best-worst-squares",
      caption:
        "The best and worst squares in football, from 7,276 NFL final scores 📊\n\n0–7 lands on 3.6% of finals. 2–2 has hit 4 times since 1999. 💀\n\nSend this to whoever drew 2–2 this week.",
      hashtags: [...H.core, H.nfl, H.stats, H.fantasy],
      notes: [AUDIO_TRENDING, COVER, "Pin it. Top boost candidate (no money on screen).", "Data: nflverse games.csv, NFL finals 1999–2025."],
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
      story: { sticker: "Link → app", text: "(Frame says it all.) Lock before the 1:00 kickoffs." },
    },
    {
      date: "2026-10-25", time: "19:30", kind: "story", week: "prep",
      title: "SNF: Chiefs at Seahawks poll",
      tieIn: "Sunday Night Football · Chiefs at Seahawks · 8:20 PM ET · NBC",
      story: { sticker: "Poll: Yes / No", text: "SNF: do the Chiefs stay unbeaten?" },
    },

    // ------------------------------------------------------------ WEEK 1
    {
      date: "2026-10-26", time: "13:30", kind: "task", week: "w1",
      title: "Launch prep",
      checklist: [
        "Open the app link from the bio on your phone and make sure it works.",
        "Line up 20 friends who run (or play in) a pool and 3 group chats to post in.",
        "Ask 5 friends to share the launch Reel to their stories at 2:05.",
      ],
    },
    {
      date: "2026-10-26", time: "14:00", kind: "reel", week: "w1",
      title: "LAUNCH: How it works in 20 seconds",
      asset: "01-how-it-works",
      tieIn: "Monday Night Football · Cowboys at Eagles · 8:15 PM ET · ESPN/ABC",
      caption:
        "Squares pools, fixed. JaxSquares is live 🏈🟩\n\nCreate a board in 20 seconds, drop one link in the group chat, and everyone claims squares from their phone. We draw the numbers live and light up the winner every quarter.\n\nFree. No app. No signup. Running a Cowboys–Eagles board tonight? Link in bio.",
      hashtags: [...H.core, H.mnf, H.office, H.nfl],
      notes: [AUDIO_EXPLAINER, COVER, "Pin it first (pinned: this, the carousel, best/worst)."],
    },
    {
      date: "2026-10-26", time: "14:10", kind: "task", week: "w1",
      title: "Personal push",
      checklist: [
        "Share the Reel to your personal story and to the 3 group chats.",
        "Text the 20 people directly: “made this for our pool, try it tonight for MNF?”",
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
      date: "2026-10-27", time: "13:00", kind: "reel", week: "w1",
      title: "On this day: Emmitt breaks the record (2002)",
      asset: "otd1-oct27-emmitt",
      caption:
        "On this day in 2002, former Gator Emmitt Smith passed Walter Payton for the NFL's career rushing record 🐊🏈\n\nThe final? Seahawks 17, Cowboys 14. History for Emmitt, and the 7–4 square for somebody's pool.\n\nWhat square would you have had? 👇",
      hashtags: [H.otd, H.history, H.gators, "#emmittsmith", "#footballsquares"],
      notes: [AUDIO_NOSTALGIC, COVER],
    },
    {
      date: "2026-10-27", time: "18:00", kind: "story", week: "w1",
      title: "Poll: 0–0 or 7–7?",
      asset: "s-story-frames/01",
      story: { sticker: "Poll: 0–0 / 7–7", text: "(Place the poll in the empty middle band.)" },
    },
    {
      date: "2026-10-28", time: "12:30", kind: "carousel", week: "w1",
      title: "Every square, ranked",
      asset: "c2-squares-odds", slides: 6,
      caption:
        "Every square in football, ranked 📊 (7,276 NFL final scores, 1999–2025)\n\nS-tier digits: 0 and 7. D-tier: 2 and 5. The 2–2 square has hit 4 times in 27 seasons.\n\nSave this before your next draw, and send it to your pool's 2–2 holder.",
      hashtags: [...H.core, H.nfl, H.stats, H.fantasy],
      altText:
        "Heat map and rankings of football squares by how often NFL final scores land on them since 1999. Best: 0-7, 4-7 and 0-3. Worst: 2-2, 5-5 and 5-9. Most common final since 1999: 23-20.",
    },
    {
      date: "2026-10-28", time: "18:00", kind: "story", week: "w1",
      title: "Poll answer",
      asset: "s-story-frames/02",
      story: { sticker: "None (or a link to the carousel)", text: "Answer frame. Basically a coin flip." },
    },
    {
      date: "2026-10-29", time: "12:30", kind: "reel", week: "w1",
      title: "Every squares pool group chat",
      asset: "05-group-chat",
      tieIn: "Thursday Night Football · Panthers at Packers · 8:15 PM ET · Prime Video",
      caption:
        "Every squares pool group chat: “who has the 7–3??” “resend the spreadsheet” “MIKE.” 😭\n\nOr… one link. Everyone claims from their phone, the numbers draw themselves, and the board tells you who won.\n\nSend this to the person who runs your pool 📲",
      hashtags: [...H.core, "#groupchat", H.office, H.tnf],
      notes: [AUDIO_TRENDING, COVER],
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
      story: { sticker: "Questions", text: "(Questions sticker in the middle band.)" },
    },
    {
      date: "2026-10-30", time: "17:15", kind: "task", week: "w1",
      title: "Reply with a Reel",
      checklist: [
        "Pick the best comment or question of the week (“does it work for college?” is perfect).",
        "Use Reply → Reel. Screen-record yourself making a board for that exact game.",
      ],
    },
    {
      date: "2026-10-31", time: "10:00", kind: "reel", week: "w1",
      title: "Florida vs Georgia: it left Jax",
      asset: "m2-florida-georgia",
      tieIn: "Florida vs. Georgia · 3:30 PM ET · ABC · Mercedes-Benz Stadium, Atlanta",
      caption:
        "The Cocktail Party left Jacksonville this year. Your squares board doesn't have to 🐊🐶\n\nFlorida vs. Georgia, 3:30 ET on ABC, in Atlanta while EverBank gets renovated. It's the first time since 1995 the game isn't in Jax.\n\nRun the board from anywhere: 20 seconds, one link, free. Gators or Dawgs? 🐊 / 🐶",
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
      story: { sticker: "Quiz: 20–17 / 23–20 ✓ / 27–24 / 24–17", text: "(Quiz sticker in the middle band.)" },
    },
    {
      date: "2026-11-03", time: "20:15", kind: "story", week: "w2",
      title: "First CFP rankings",
      tieIn: "First College Football Playoff rankings · 7 PM ET · ESPN",
      story: { sticker: "Questions", text: "First CFP rankings are out. Who's your #1?" },
    },
    {
      date: "2026-11-04", time: "12:30", kind: "carousel", week: "w2",
      title: "Commissioner cheat sheet",
      asset: "c3-commissioner-cheat-sheet", slides: 6,
      caption:
        "The squares commissioner cheat sheet 📋 5 rules that keep your pool fair.\n\nLock before kickoff. Cap squares per player. Pay out every quarter. Make the office pool free. Let the board do the math.\n\nSave it, then send it to whoever runs your pool.",
      hashtags: [...H.core, H.office, "#commissioner", H.fantasy],
      altText:
        "Six slides of tips for running a football squares pool: lock the board before kickoff, cap squares per player, pay out every quarter, make office pools free, and let the app call the winners.",
    },
    {
      date: "2026-11-04", time: "18:00", kind: "story", week: "w2",
      title: "Quiz answer: 23–20",
      asset: "s-story-frames/04",
      story: { sticker: "None", text: "Answer frame." },
    },
    {
      date: "2026-11-05", time: "12:00", kind: "reel", week: "w2",
      title: "Jags in primetime",
      asset: "m4-tnf-jaguars-ravens",
      tieIn: "Thursday Night Football · Jaguars at Ravens · 8:15 PM ET · Prime Video",
      caption:
        "Jags in primetime 🐆 Thursday Night Football: Jaguars at Ravens, 8:15 ET on Prime Video.\n\nMake the board at lunch, drop the link in the group chat, lock it before kickoff. We'll call every quarter's winner.\n\nWho's running the Duval board tonight? 👇",
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
      title: "Which square cashed?",
      story: { sticker: "Questions", text: "Final: Jaguars __, Ravens __. That's the _–_ square. Who had it? 🙋" },
      notes: ["Fill in the final score and digits after the game."],
    },
    {
      date: "2026-11-06", time: "12:00", kind: "story", week: "w2",
      title: "1869: the first college football game",
      story: {
        sticker: "None",
        text: "On this day in 1869: Rutgers 6, Princeton 4, the first college football game ever. If they'd had squares, 6–4 cashes. 🏈",
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
        "Saturday night in South Bend: Miami at Notre Dame, 7:30 ET on NBC 🏟️\n\nCollege boards work exactly the same: create, share one link, lock it before kickoff. Free.\n\nCanes or Irish? 👇",
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
        "On this day in 1970, Tom Dempsey kicked a 63-yard field goal at the gun. Saints 19, Lions 17 🦵\n\n19–17 is a squares legend: the Miracle at the Meadowlands (1978) ended 19–17 too. The 9–7 square keeps cashing in chaos.\n\nGot a 9 this week? 👀",
      hashtags: [H.otd, H.history, "#saints", ...H.core],
      notes: [AUDIO_NOSTALGIC, COVER],
    },
    {
      date: "2026-11-08", time: "20:00", kind: "task", week: "w2",
      title: "Weekly review + creator outreach",
      checklist: [
        "Weekly review (same as last Sunday).",
        "DM 5 micro-creators (Jax sports, Gators, fantasy football) with the creator template. Goal: 1 Collab for Nov 15.",
        "DM 3 local bars or office managers with the bar template (free boards only).",
      ],
    },

    // ------------------------------------------------------------ WEEK 3
    {
      date: "2026-11-09", time: "14:00", kind: "reel", week: "w3",
      title: "POV: you hit LOCK",
      asset: "03-the-draw",
      tieIn: "Monday Night Football · Bills at Vikings · 8:15 PM ET · ESPN/ABC",
      caption:
        "POV: the board is full and you hit LOCK 🎲\n\nThe numbers draw live, right in front of everyone. Somebody gets 0–7. Somebody gets 2–2. Nobody can say you rigged it.\n\nSend this to your commissioner 📲",
      hashtags: [...H.core, H.mnf, H.office, H.nfl],
      notes: [AUDIO_TRENDING, COVER],
    },
    {
      date: "2026-11-09", time: "19:00", kind: "story", week: "w3",
      title: "MNF: Bills at Vikings",
      tieIn: "8:15 PM ET · ESPN/ABC",
      story: { sticker: "Link → app", text: "MNF: Bills at Vikings. Draw your numbers live 🎲" },
    },
    {
      date: "2026-11-10", time: "13:00", kind: "reel", week: "w3",
      title: "Winners light up",
      asset: "06-winners-light-up",
      tieIn: "NFL trade deadline 4 PM ET · CFP rankings 9 PM ET",
      caption:
        "Who won the quarter? The board already knows 🏆\n\nEnter the score at Q1, Half, Q3 and Final and the winning square lights up with its payout. No math, no arguing, no “wait, which way do the numbers go?”\n\nSend this to the friend who always does the math wrong.",
      hashtags: [...H.core, H.office, H.nfl, H.fantasy],
      notes: [AUDIO_EXPLAINER, COVER],
    },
    {
      date: "2026-11-10", time: "13:30", kind: "task", week: "w3",
      title: "Boost decision",
      checklist: [
        "Compare sends per reach across the $0 creatives: 02, 04, 07 (and 03 if you re-cut it without the pot pill).",
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
      title: "Founder Reel: why we built it",
      script: [
        "0–2s (on-screen text): “I built a squares app because our group chat broke.”",
        "2–10s: hold up the old way. Show the whiteboard photo, the spreadsheet, the 99+ unread chat.",
        "10–25s: screen-record making a real board, start to share link (you recorded this in Prep).",
        "25–35s, to camera: “Free, no app, no signup. Numbers draw live, winners light up.”",
        "35–40s, ask: “What do we build next: Pick'em, Bracket Battles, or King of the Hill?”",
      ],
      caption:
        "Why we built JaxSquares 🟩 (and what's next)\n\nOur squares pool lived in a group chat, a blurry whiteboard photo and a spreadsheet nobody could find. So we built the board we wanted: one link, everyone claims from their phone, numbers draw live, winners light up.\n\nNext up: Pick'em, Bracket Battles or King of the Hill? Vote in the comments 👇",
      hashtags: ["#buildinpublic", "#startup", "#jacksonville", ...H.core],
      notes: ["Film vertical, natural light, captions on (Instagram's auto-captions are fine)."],
    },
    {
      date: "2026-11-12", time: "12:00", kind: "task", week: "w3",
      title: "Lock in Sunday's Collab",
      checklist: [
        "Confirm the creator or friend account for Sunday.",
        "Send them the 02 video and the caption. Post it from @jaxsquares and use Tag people → Invite collaborator.",
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
      title: "COLLAB: a free pool for your crew",
      asset: "02-how-it-works-free",
      tieIn: "Jaguars at Titans · 1:00 PM ET · FOX",
      caption:
        "A free squares pool for your whole crew 🏈 No money, no app, no signup.\n\nSet the price to $0 and play for bragging rights. Create the board, share one link, and we'll draw the numbers and call every quarter.\n\nJags at Titans at 1. Board's open 👇",
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
        "Thanksgiving week: 5 NFL games + Florida–FSU in 3 days 🦃🏈\n\nWed: Packers at Rams, 8:00 Netflix (the first-ever Thanksgiving Eve game)\nThu: Bears at Lions 1:00 CBS · Eagles at Cowboys 4:30 FOX · Chiefs at Bills 8:20 NBC\nFri: Broncos at Steelers 3:00 Prime · Florida at FSU 3:30 ABC\n\nOne board per game. Kids' table board = $0. Save this.",
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
      story: { sticker: "Poll: 1 / 2–3 / All of them", text: "(Poll sticker in the middle band.)" },
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
        "The Thanksgiving squares playbook 🦃 Save it for next week.\n\nOne board per game, a $0 kids' table board, and stakes that aren't cash: loser does the dishes, winner gets the first plate.\n\nSend this to whoever's hosting.",
      hashtags: ["#thanksgiving", H.tg, H.friendsgiving, "#footballsquares", "#familygamenight"],
      altText:
        "Six-slide Thanksgiving guide to football squares: the 2026 Thanksgiving week schedule, one board per game, a free kids' table board, and non-cash stakes like doing the dishes.",
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
        "Every Thanksgiving family group chat: “what's a square” “I call the 7–0” “spreadsheet attached” 😭🦃\n\nOr… one link. Grandma claims from her phone, the numbers draw themselves, and the board calls the winner every quarter. Free.\n\nSend this to the family group chat. You know the one.",
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
      story: { sticker: "Link → app", text: "Hosting Thursday? Make your boards tonight. 20 seconds each 🦃" },
    },
    {
      date: "2026-11-25", time: "12:00", kind: "reel", week: "tg",
      title: "Thanksgiving Eve: Packers at Rams",
      asset: "m7-thanksgiving-eve",
      tieIn: "Packers at Rams · 8:00 PM ET · Netflix · first-ever Thanksgiving Eve game",
      caption:
        "The first-ever Thanksgiving Eve NFL game: Packers at Rams, 8:00 ET on Netflix 🦃📺\n\nFriendsgiving board, anyone? 20 seconds to make, one link to share, free to run.\n\nWho's hosting Friendsgiving tonight? 👇",
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
        "101 years ago today, Red Grange made his NFL debut on Thanksgiving. Bears 0, Cardinals 0 🦃\n\nA 0–0 tie means the same square paid every quarter. Happy Thanksgiving from JaxSquares: three games today, three boards, one link each.\n\nWhat's your square for Bears–Lions? 👇",
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
        "Plan December around what worked: rivalry week, conference title games, the Big Game run-up.",
        "Post a thank-you carousel of the best user boards (with permission).",
      ],
    },
  ],
};
