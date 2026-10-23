// The copy for every landing page. Plain language, no betting vocabulary
// (BANNED_WORDS in site.ts; seo.test.ts checks), no prices (the host fee is
// changing: say "free to set up and invite"), and amounts only ever described
// as the host's display-only information. "NFL", "NBA", "WNBA", "NCAA" and
// "March Madness" are used only to describe the games; those pages carry the
// matching "not affiliated" line. The football championship is "the big game",
// never its trademarked name (TRADEMARKED_EVENT in site.ts; seo.test.ts checks).

import { boardDiagram, callout, features, link, paras, printableCards, shots, steps, table, terms, ticks } from "./blocks.ts";
import type { LandingPage } from "./render.ts";
import { PRINT_QR_LABEL } from "./site.ts";

const HOW_TO = "how-to-play-football-squares";
const PRINTABLES = "printable-football-squares";
const BASKETBALL = "basketball-squares";
const MARCH = "march-madness-squares";
const SOCCER = "soccer-squares";

const hub: LandingPage = {
  slug: "football-squares",
  nav: "Football squares",
  blurb: "What squares is, how a board works, and why it's better live on everyone's phone.",
  title: "Football Squares Online, Free to Set Up | JaxSquares",
  description:
    "Play football squares on everyone's phone. Make a board, text the link, and watch each score light up the winning square live. Free to set up, no app needed.",
  eyebrow: "Football squares",
  h1: `Football squares, <span class="hl">live on every phone</span>`,
  lede:
    "The classic 100-square game without the paper sheet. Make a board in a minute, text one link to your group, and watch the winning square light up the moment each quarter ends.",
  hero: {
    jax: "cheer",
    win: { x: 7, y: 4 },
    art: "An example squares board: Hawks across the top, Wolves down the side, most squares claimed and the Hawks 7, Wolves 4 square lit gold as the winner.",
  },
  sections: [
    {
      id: "what-is-football-squares",
      h2: "What is football squares?",
      body:
        paras(`
Football squares is the easiest game to play with a crowd during a football game. There's no strategy and no football knowledge required, just a grid, a few friends and a little luck.

A board is a 10×10 grid: 100 squares. One team goes across the top and the other down the side. Everyone claims squares, by writing their name in them on paper or, on JaxSquares, by tapping them. Once the board is full, the numbers 0 to 9 are drawn at random across the top and again down the side, so every square ends up with one digit for each team.

When a quarter ends, look at the last digit of each team's score. If it's Hawks 17, Wolves 14, the winning square is where the Hawks 7 meets the Wolves 4. That's the whole game. Because the numbers are drawn after everyone picks, nobody can grab the "good" squares, and the person who has never watched a down has exactly the same chance as the superfan.`) +
        `<figure class="diagram">${boardDiagram({
          id: "hub-diagram",
          win: { x: 7, y: 4 },
          guide: true,
          title: "At Hawks 17, Wolves 14, follow the Hawks 7 column down and the Wolves 4 row across: the square where they meet wins.",
        })}<figcaption>Hawks 17, Wolves 14: the Hawks 7 column meets the Wolves 4 row.</figcaption></figure>`,
    },
    {
      id: "how-it-works",
      h2: "How a game of squares works",
      body: steps([
        ["Make the board", "Pick the game, choose when squares win (every quarter is the classic) and set how many squares each person can take."],
        ["Fill the squares", "Share the board and let everyone claim their squares. Each pick shows up for everyone right away."],
        ["Draw the numbers", "Once the picks are in, the digits 0 to 9 are shuffled across the top and down the side. Now every square has its two numbers."],
        ["Watch the score", "At the end of each quarter, the square matching the last digit of each team's score wins."],
      ]),
    },
    {
      id: "ways-to-play",
      h2: "Ways to play",
      body:
        terms([
          ["Every quarter", "Winners at the end of Q1, at halftime, at the end of Q3 and at the final score. The classic."],
          ["Halftime and final", "Two winners, so each one is a bigger moment."],
          ["Final score", "One winner, decided by the final score, overtime included."],
          ["Every score", "Each time the scoreboard changes, the square matching the new score wins. It keeps everyone in it all game."],
          ["Reverse winners", "The square with the two digits swapped wins too, so at 17–14 both the 7–4 and the 4–7 squares win."],
          ["10×10 or 5×5", "100 squares for a big group, or 25 squares, with two numbers per row and column, for a small one."],
        ]) + `<p>The ${link(HOW_TO, "full rules guide")} covers each of these in detail, plus what to do when a winning square is empty.</p>`,
    },
    {
      id: "why-jaxsquares",
      h2: "Why run your squares on JaxSquares",
      body:
        features([
          ["A live board", "Every pick, the draw and every score land on every phone within a second. No refreshing, and no more “can someone send a photo of the sheet?”"],
          ["Every score, on its own", "Link your board to a real pro or college game and the scores fill in by themselves. Typing in your own matchup? A score takes two taps."],
          ["Free to set up", "Making a board, inviting your group and picking squares cost nothing. Players never pay to join."],
          ["Made for phones", "Built for one hand on the couch: big tap targets, a dark theme for the TV room, and a gold glow when your square hits."],
          ["No app needed", "Friends tap the link and they're in, with no download and no account. Same room? Show a QR code or a six-character board code."],
          ["Fair by design", "The numbers are drawn at random after the board locks, every pick is visible to everyone, and a square limit stops one person taking half the board."],
        ]) + shots(["make", "pick", "draw", "winning"]),
    },
    {
      id: "every-game",
      h2: "Squares for every game",
      body: paras(`
The big game in February is the biggest squares day of the year, and the ${link("big-game-squares", "big game squares guide")} covers planning a board for a party, an office or a family group chat. Running a board every week? ${link("nfl-squares", "NFL squares")} has ideas for Sunday afternoons, prime-time games, Thanksgiving and the playoffs.

College fans get a full slate every Saturday, plus rivalry week and bowl season: see ${link("college-football-squares", "college football squares")}. And if you'd like a sheet for the fridge door too, grab a ${link(PRINTABLES, "free printable football squares template")}. Each one has a QR code that turns it into a live board.

Squares isn't just for football, either. ${link(BASKETBALL, "Basketball squares")} works the same way for NBA, WNBA and college games, and the ${link(MARCH, "March Madness squares guide")} covers a board for every tournament game. On a ${link(SOCCER, "soccer squares")} board, every square is a minute of the match and each goal's minute wins.`),
    },
    {
      id: "prizes",
      h2: "Prizes without the awkward part",
      body: paras(`
JaxSquares never collects, holds or sends money, and nobody pays anyone through the app. If your group likes to play for something, the host can show a square price and prizes on the board as plain information, in dollars or in points, so everyone sees the rules before they pick. Any settling up happens among yourselves.

Plenty of groups skip amounts entirely. Mark the board Just for fun, or add a prize note like “Loser brings the wings” or “Winner picks the halftime playlist.”`),
    },
  ],
  faqs: [
    {
      q: "Is JaxSquares free?",
      a: "Making a board, inviting your group and claiming squares cost nothing, players never pay to join, and drawing the numbers is free on a board of up to 5 players. Bigger boards have a small host fee, paid by the host when they draw the numbers and shown clearly before they pay.",
    },
    {
      q: "Do my friends need to download an app?",
      a: "No. They open the link you send, pick a name, a color and an emoji, and tap their squares. It works in any phone or computer browser.",
    },
    {
      q: "How are the numbers drawn?",
      a: "At random, once the host locks the board. The digits 0 to 9 are shuffled once for the top and once for the side, and every phone sees the result at the same moment.",
    },
    {
      q: "What happens if the winning square is empty?",
      a: "Decide that before kickoff. Common house rules are to carry that prize to the next period or to give it to the nearest claimed square. On JaxSquares the host can also pick a winner by hand.",
    },
    {
      q: "Can people play from different places?",
      a: "Yes. Everyone follows the same live board on their own phone, wherever they're watching, so the cousin across the country is as much in it as the people on the couch.",
    },
    {
      q: "Does JaxSquares handle any money?",
      a: "No. JaxSquares never collects, holds or sends money between players. A square price or prize amount on a board is information the host chooses to show, and any settling up happens among the players.",
    },
  ],
  related: ["big-game-squares", "nfl-squares", "college-football-squares", HOW_TO],
  nflNotice: true,
  cta: {
    h2: "Make your board in a minute",
    text: "Pick the game, text the link, and let the scores do the rest. Your friends don't need to download a thing.",
  },
};

const bigGame: LandingPage = {
  slug: "big-game-squares",
  nav: "Big game squares",
  blurb: "Plan a board for the biggest squares day of the year, for a party, an office or the family chat.",
  title: "Big Game Squares: A Live Board, Free to Set Up | JaxSquares",
  description:
    "Plan big game squares for your party, office or family in minutes. Text one link, draw the numbers live, and let every score light up the winner. Free to set up.",
  eyebrow: "Big game squares",
  h1: `Big game squares, <span class="hl">the easy way</span>`,
  lede:
    "The biggest game of the year is also the biggest squares day of the year. Set up a live board for your party, office or family group chat in a couple of minutes, and let the scores do the rest.",
  hero: {
    jax: "cheer",
    win: { x: 1, y: 4 },
    art: "An example big game squares board with the Hawks 1, Wolves 4 square lit gold as the winner.",
  },
  sections: [
    {
      id: "why-squares",
      h2: "Why squares and the big game go together",
      body: paras(`
Big game parties are full of people who came for the food, the commercials, the halftime show or each other. Squares gives every one of them a reason to care about the score in the fourth quarter. It takes ten seconds to explain, nobody needs to know a single player's name, and the winner is often the person who asked which team is which.

It's built for a crowd, too. A 10×10 board has 100 squares, so a big party, a whole office or an extended family can all play on one board. With a winner at the end of every quarter, there's something to cheer about from the opening kickoff to the final whistle.`),
    },
    {
      id: "plan",
      h2: "Plan your big game board",
      body: steps([
        [
          "A week or two before: make the board",
          "Once the matchup is set, link your board to the game so the scores arrive on their own, or type in the two teams. Pick a format: every quarter is the classic for the big game.",
        ],
        [
          "When the invites go out: text the link",
          "Drop it in the party thread, the office channel or the family group chat. Set a square limit so the early birds don't take the whole board.",
        ],
        [
          "Before kickoff: lock and draw",
          "When the board is full, or right before kickoff, lock it and draw the numbers. Everyone sees their digits land at the same moment, which is half the fun.",
        ],
        [
          "During the game: watch it play out",
          "The board shows whose square is winning right now, and the winner lights up gold at the end of each quarter. Halftime gets its own winner, right around the halftime show.",
        ],
      ]),
    },
    {
      id: "party",
      h2: "Make it work for a party",
      body:
        ticks([
          "Guests who just walked in: they join from a QR code or a six-character board code on your phone. Nobody has to type a long link.",
          "Friends who can't make it: they still play, following the same live board from wherever they're watching.",
          "A screen near the TV: open the board on a laptop or tablet so the whole room can see the numbers.",
          `A paper copy: if you'd like one on the fridge too, print a ${link(PRINTABLES, "free squares template")} and fill it in from the live board.`,
          "Rules nobody argues about: the board shows the format, prize notes and anything else the host sets, so halftime is for snacks, not debates.",
        ]) + shots(["invite", "pick", "winning", "pinged"]),
    },
    {
      id: "format",
      h2: "Which format for the big game?",
      body: paras(`
<strong>Every quarter</strong> is the big game standard. Four winners, at the end of Q1, at halftime, at the end of Q3 and at the final score, keep the whole party in it. For a bigger crowd, add <strong>reverse winners</strong>: the square with the digits swapped wins too, which doubles the winning squares without changing anything else.

Small group? A <strong>5×5 board</strong> has 25 squares and fills up fast, and since each row and column gets two numbers, every score is still covered. Want something happening all night? Try <strong>every score</strong>: each time the scoreboard changes, a square wins.

One more big-game detail: if the game goes to overtime, the final score includes it. JaxSquares handles that for you. The ${link(HOW_TO, "rules guide")} has every format in detail.`),
    },
    {
      id: "office-family",
      h2: "Office and family boards",
      body: paras(`
An office board is the classic big game squares setup (some people still call it the office pool). On JaxSquares there's no sheet to walk around the building and nobody has to photograph it for the people working from home. Post the link in the team channel and everyone, in the office or not, picks from their own phone. Keep it friendly: plenty of offices play just for fun or for a prize like first pick of the leftover snacks, and JaxSquares never handles money between players.

For a family board, 100 squares leave room for every cousin, and the kids can play too: picking squares is just tapping a grid.`),
    },
  ],
  faqs: [
    {
      q: "When should I draw the numbers for big game squares?",
      a: "After everyone has picked their squares and before kickoff. Drawing after the picks keeps it fair: nobody knows which squares will get the good numbers when they choose. If the board isn't full by kickoff, decide as a group whether to draw anyway.",
    },
    {
      q: "Does overtime count?",
      a: "Yes, for the final score. The final winner is decided by the score when the game ends, overtime included. Quarter and halftime winners use the score at the end of those periods.",
    },
    {
      q: "How many people can play on one board?",
      a: "A classic board has 100 squares, so up to 100 people can each take one, or fewer people can take several. Set a per-person square limit to keep it fair. For a small group, a 5×5 board has 25 squares.",
    },
    {
      q: "Do guests need the app or an account?",
      a: "No. Guests open your link in their phone's browser, pick a name, a color and an emoji, and tap their squares. There's nothing to download and no account to make.",
    },
    {
      q: "Is JaxSquares affiliated with the NFL?",
      a: "No. JaxSquares isn't affiliated with or endorsed by the NFL or any team. Team names appear only to describe the game your board is for.",
    },
    {
      q: "Does JaxSquares collect money for the board?",
      a: "Not from players, ever. JaxSquares never collects, holds or sends money between players. If your group plays for prizes, the host can show a square price and prize amounts as information on the board, and you settle among yourselves.",
    },
  ],
  related: ["football-squares", HOW_TO, PRINTABLES, "nfl-squares"],
  nflNotice: true,
  cta: {
    h2: "Get your big game board ready",
    text: "Make the board now, text the link this week, and draw the numbers before kickoff. Setting it up is free.",
  },
};

const nfl: LandingPage = {
  slug: "nfl-squares",
  nav: "NFL squares",
  blurb: "Live boards for Sunday games, prime time, Thanksgiving and the playoffs, with scores that fill in on their own.",
  title: "NFL Squares: Live Boards for Every Game | JaxSquares",
  description:
    "Run NFL squares for Sunday, Monday or Thursday games, Thanksgiving or the playoffs. Link a real game and the scores fill in live. Free to set up, no app needed.",
  eyebrow: "NFL squares",
  h1: `NFL squares for <span class="hl">every game of the season</span>`,
  lede:
    "Squares isn't just for February. Link a board to any NFL game and the scores arrive on their own, so your group can play on Sunday afternoons, in prime time and all the way through the playoffs.",
  hero: {
    jax: "sit",
    win: { x: 0, y: 7 },
    art: "An example NFL squares board with the Hawks 0, Wolves 7 square lit gold as the winner.",
  },
  sections: [
    {
      id: "link-a-game",
      h2: "Link a real game, skip the scorekeeping",
      body: paras(`
When you make a board on JaxSquares, this week's NFL games are right there to pick from, with the soonest kickoff already selected. Link your board to one and the scores keep themselves up to date during the game: the scorebug ticks over, the square that's winning right now glows, and the winner lights up the moment each quarter ends. Nobody has to keep one eye on the TV and the other on a sheet of paper.

Watching a game that isn't listed? Type in any two teams instead. Entering a score takes two taps, and the host can correct one or pick a winner by hand if something goes sideways.`),
    },
    {
      id: "great-games",
      h2: "Great games for squares",
      body: ticks([
        "Sunday afternoons: the early and late windows are made for a group chat board while everyone watches from their own couch.",
        "Prime time: Sunday, Monday and Thursday night games give you a whole evening with one game, which is exactly what a board wants.",
        "Thanksgiving: a family board on the holiday games gives the whole house something to follow between plates.",
        "The playoffs: from the wild card round to the conference championships, the games get bigger and so do the crowds on the couch.",
        `The big game: the biggest squares day of the year. See the ${link("big-game-squares", "big game squares guide")} for planning a party board.`,
      ]),
    },
    {
      id: "weekly",
      h2: "Run a weekly board with the same group",
      body:
        paras(`
Lots of groups run a board every week of the season. JaxSquares keeps every board you're in on one Home screen, sorted into Live now, Needs you, Up next and Final, so last week's winners and this week's picks are always a tap away. The host makes the new board and texts the same group, and everyone's name, color and emoji are already saved on their phone.

Mix it up from week to week: <strong>every quarter</strong> for a classic board, <strong>final score</strong> for a quick one, or <strong>every score</strong> for a game you expect to be a shootout. Reverse winners and new numbers each quarter keep things fresh for a group that has played a lot.`) +
        shots(["make", "home", "winning", "pinged"]),
    },
    {
      id: "digits",
      h2: "How NFL scores land on the board",
      body: paras(`
In squares, only the last digit of each score matters. A team on 24 is a 4 and a team on 10 is a 0. Because touchdowns with the extra point (7) and field goals (3) are the most common scores in the NFL, some digits turn up far more than others: 0, 7, 3 and 4 come up a lot, while 2 and 5 are rare.

That's exactly why the numbers are drawn at random after everyone has picked. Nobody gets to choose a good digit, so everyone starts even. If you want every square to have more chances, play every score: each time a team scores, the square matching the new score wins, so a high-scoring game can produce a dozen winners. The ${link(HOW_TO, "rules guide")} explains every format.`),
    },
  ],
  faqs: [
    {
      q: "Can I link my board to a live NFL game?",
      a: "Yes. When you make a board, pick from this week's NFL games and the scores update on their own during the game. You can also type in any two teams and enter the scores yourself.",
    },
    {
      q: "What if a score is entered wrong?",
      a: "The host can correct a score at any time and the board updates the winner for everyone. The host can also pick a winner by hand.",
    },
    {
      q: "Do the numbers stay the same all game?",
      a: "By default, yes: the numbers are drawn once and kept for the whole game. If you'd rather reshuffle, turn on new numbers each quarter.",
    },
    {
      q: "Do I need a new board every week?",
      a: "Yes, one board per game. Making one takes about a minute, and your friends' names, colors and emoji are already saved on their phones.",
    },
    {
      q: "Is JaxSquares affiliated with the NFL?",
      a: "No. JaxSquares isn't affiliated with or endorsed by the NFL. We use the name only to describe the games your board can follow.",
    },
  ],
  related: ["football-squares", "big-game-squares", "college-football-squares", HOW_TO],
  nflNotice: true,
  cta: {
    h2: "Pick this week's game",
    text: "Link a board to a real game and the scores take care of themselves. Free to set up, and friends join from a link.",
  },
};

const college: LandingPage = {
  slug: "college-football-squares",
  nav: "College football squares",
  blurb: "Boards for rivalry week, bowl season and the tailgate, linked to a real game or any matchup you type in.",
  title: "College Football Squares: Live Boards for Game Day | JaxSquares",
  description:
    "Run college football squares for rivalry week, bowl games or a Saturday tailgate. Link a real game for live scores, or type in any matchup. Free to set up.",
  eyebrow: "College football squares",
  h1: `College football squares, <span class="hl">made for Saturdays</span>`,
  lede:
    "Rivalry games, conference title games, bowl season. College football gives you a full slate every week, and a squares board turns any game into something the whole tailgate can follow.",
  hero: {
    jax: "sit",
    win: { x: 5, y: 8 },
    art: "An example college football squares board with the Hawks 5, Wolves 8 square lit gold as the winner.",
  },
  sections: [
    {
      id: "college-crowd",
      h2: "Squares for the college crowd",
      body: paras(`
College football is built for groups: alumni chats, tailgate crews, dorm floors and families split between two schools. Squares fits right in. A board takes a minute to make, the link works in any phone's browser, and nobody needs to know the depth chart to play. Your aunt who went to the other school has exactly the same chance as you do.

On JaxSquares you can pick a college game from this week's schedule so the scores arrive live, or type in any matchup, from the season opener to your old high school's homecoming game.`),
    },
    {
      id: "higher-scores",
      h2: "Scores run wilder on Saturdays",
      body: paras(`
College games tend to be higher scoring than pro games, with more two-point tries, missed kicks and wild fourth quarters. In squares that means the last digits spread out more, so the "bad" numbers aren't quite as bad and an unlikely square can hit when you least expect it.

It's also why <strong>every score</strong> is such a fun format for college games. Each time the scoreboard changes, the square matching the new score wins, so a back-and-forth shootout can light up a dozen squares before the final whistle. Prefer the classic? <strong>Every quarter</strong> gives you four winners, and overtime counts toward the final.`),
    },
    {
      id: "game-days",
      h2: "Game days that work well",
      body:
        ticks([
          "Rivalry week: the one game the whole family is watching, whichever side they're on.",
          "Conference championship weekend: a board for each game, for the group that watches all of them.",
          "Bowl season: a long run of games over the holidays, perfect for a board a day.",
          "The playoff: bigger games, bigger couches, and a board everyone can join from wherever they are.",
          "Your tailgate: a 5×5 board fills up fast with a small crew and still covers every score.",
        ]) + shots(["make", "invite", "draw", "winning"]),
    },
    {
      id: "tailgate",
      h2: "Set up a board before the tailgate",
      body: steps([
        ["Make the board", "Pick the game and the format. Every quarter is the classic; halftime and final suits a crowd that'll be busy at the grill in the second quarter."],
        ["Share it", "Text the link or show the QR code in the parking lot. People join with a name, a color and an emoji."],
        ["Draw the numbers", "Lock the board when it's full, before kickoff, and the digits land on every phone at once."],
        ["Follow it live", "The winning square glows as the score changes and lights up when each period ends, even for the friend watching from another state."],
      ]) + `<p>New to squares? The ${link(HOW_TO, "how-to-play guide")} covers the rules, and there are ${link(PRINTABLES, "free printable templates")} if you want a paper board as well.</p>`,
    },
  ],
  faqs: [
    {
      q: "Can I link a board to a college game?",
      a: "Yes. Pick a college game from this week's schedule when you make a board and the scores fill in live. Any matchup that isn't listed can be typed in, and the host enters the scores.",
    },
    {
      q: "What's the best board size for a tailgate?",
      a: "For a small group, a 5×5 board: 25 squares, with two numbers in each row and column so every score is still covered. For a bigger crowd, the classic 10×10.",
    },
    {
      q: "Does overtime count in college football squares?",
      a: "Yes. The final winner is decided by the score when the game ends, however many overtimes it takes.",
    },
    {
      q: "Can people join from the stadium?",
      a: "Yes, as long as they have a signal. The board is a web page, so there's nothing to install, and it updates on its own.",
    },
    {
      q: "Do players need an account?",
      a: "No. They open the link, pick a name and tap their squares. Signing in is optional and only useful if you want your boards on more than one device.",
    },
  ],
  related: ["football-squares", "nfl-squares", HOW_TO, PRINTABLES],
  cta: {
    h2: "Get the tailgate board going",
    text: "Make the board, text the link to the group, and draw the numbers before kickoff. Free to set up, no app needed.",
  },
};

/** The share image is the same for every sport; on the basketball pages its alt text doesn't say football. */
const NEUTRAL_IMAGE_ALT = "JaxSquares squares board";

const basketball: LandingPage = {
  slug: BASKETBALL,
  nav: "Basketball squares",
  blurb: "Live boards for NBA, WNBA and college games, with winners each quarter or each half.",
  title: "Basketball Squares for NBA, WNBA and College Games | JaxSquares",
  description:
    "Run basketball squares for NBA, WNBA and college games. Link a real game and the scores fill in live, quarter by quarter or half by half. Free to set up.",
  eyebrow: "Basketball squares",
  h1: `Basketball squares, <span class="hl">from tip-off to the final buzzer</span>`,
  lede:
    "The same 100-square game, made for the hardwood. Link an NBA, WNBA or college game, text one link to your group, and watch the winning square light up at the end of each quarter, at halftime and at the final buzzer.",
  hero: {
    jax: "cheer",
    win: { x: 2, y: 8 },
    art: "An example basketball squares board: Hawks across the top, Wolves down the side, most squares claimed and the Hawks 2, Wolves 8 square lit gold as the winner.",
  },
  sections: [
    {
      id: "how-basketball-squares-works",
      h2: "How basketball squares works",
      body:
        paras(`
Basketball squares works just like the football version. A board is a 10×10 grid of 100 squares, with one team across the top and the other down the side. Everyone claims their squares first. Then the digits 0 to 9 are drawn at random across the top and again down the side, so every square ends up with one number for each team.

When a quarter ends, take the last digit of each team's score. At Hawks 102, Wolves 98, the Hawks digit is 2 and the Wolves digit is 8, and the square where they meet wins. Everything in front of the last digit is ignored, so a three-digit score works exactly like a two-digit one. Nobody knows which square gets which numbers when they pick, so the friend who can't name a single player has the same chance as the one who never misses a game.`) +
        `<figure class="diagram">${boardDiagram({
          id: "basketball-diagram",
          win: { x: 2, y: 8 },
          guide: true,
          title: "At Hawks 102, Wolves 98, follow the Hawks 2 column down and the Wolves 8 row across: the square where they meet wins.",
        })}<figcaption>Hawks 102, Wolves 98: the Hawks 2 column meets the Wolves 8 row.</figcaption></figure>`,
    },
    {
      id: "when-squares-win",
      h2: "When squares win",
      body:
        terms([
          ["Every quarter", "Winners at the end of Q1, at halftime, at the end of Q3 and at the final buzzer. The classic for NBA, WNBA and women's college games, which all play four quarters."],
          ["Halftime and final", "Two winners. Men's college games play two halves, so this is how their boards work: one winner at halftime and one at the final."],
          ["Final only", "One winner, decided by the final score, overtime included."],
          ["Reverse winners", "The square with the two digits swapped wins too, so at 102–98 both the 2–8 and the 8–2 squares win. It works with any of the above."],
          ["New numbers each quarter", "The digits are reshuffled before every quarter (every half in men's college), so a cold start doesn't sink anyone's night."],
          ["10×10 or 5×5", "100 squares for a big group, or 25 squares, with two numbers per row and column, for a small one."],
        ]) +
        paras(`
Football boards can also have a winner on every score. Basketball boards don't: a game has well over a hundred baskets and free throws, far too many winners to follow, so a basketball board sticks to the quarters, the half and the final. The ${link(HOW_TO, "rules guide")} covers reverse winners, board sizes and what to do when a winning square is empty.`),
    },
    {
      id: "digits",
      h2: "Why every digit has a shot",
      body: paras(`
In football, scores come in sevens and threes, so some digits turn up all the time and others hardly ever. Basketball is different. Points arrive in ones, twos and threes, dozens of times a game, so by the end of a quarter the last digit of a team's score could be anything. Over a season, the digits 0 to 9 come up close to evenly.

That makes basketball squares one of the fairest boards there is. No square is a lost cause, and the winning square can change hands in a few seconds: a late three or a pair of free throws right before the buzzer changes everything. The board shows whose square is winning right now and how close yours is, a basket, a three or a free throw away, so the last minute of every quarter is worth watching.`),
    },
    {
      id: "leagues",
      h2: "Link an NBA, WNBA or college game",
      body:
        paras(`
When you make a board, pick Basketball and then the league: NBA, WNBA, men's college or women's college. The next seven days of games are listed by day, and you can pick a date to look further ahead. Link your board to a game and the scores keep themselves up to date: the scorebug ticks over, the square that's winning right now glows, and the winner lights up the moment each quarter or half ends. Overtime counts toward the final.

Watching a game that isn't listed, like a high school game or a rec league final? Type in any two teams instead and the host enters the scores. The score pad takes a three-digit score in a few taps, and the host can correct a score or pick a winner by hand.`) +
        ticks([
          "Opening night: the first night of the NBA season is a natural first board for the group chat.",
          "Holiday games: the Christmas Day slate gives the whole family something to follow between courses.",
          "Summer nights: the WNBA season brings a full schedule and plenty of close finishes.",
          `College hoops: conference rivalries all winter, then the tournament in March. See the ${link(MARCH, "March Madness squares guide")} for planning a board for every tournament game.`,
          "The playoffs: a board for every game of a series, for the group that watches them all.",
        ]),
    },
    {
      id: "why-jaxsquares",
      h2: "Why run your board on JaxSquares",
      body:
        features([
          ["A live board", "Every pick, the draw and every score land on every phone within a second. No refreshing, and nobody has to send a photo of the sheet."],
          ["Scores on their own", "Link a real NBA, WNBA or college game and the scores fill in as it's played. Typing in your own matchup? A score takes a few taps."],
          ["Free to set up", "Making a board, inviting your group and picking squares cost nothing. Players never pay to join."],
          ["No app needed", "Friends tap the link and they're in, with no download and no account. Same room? Show a QR code or a six-character board code."],
        ]) +
        shots(["pick", "draw"]) +
        `<p>Running a football board too? The ${link("football-squares", "football squares guide")} has everything for the NFL and college football seasons.</p>`,
    },
    {
      id: "printable",
      h2: "A printable basketball board",
      body: (ctx) =>
        printableCards(ctx.printableSizes, "basketball") +
        `<p>It prints on one Letter page, with team lines, number boxes, lines for each quarter's winner and a QR code that turns it into a live board. The ${link(PRINTABLES, "printable templates page")} has the football boards, an A4 board and a prize sheet.</p>`,
    },
    {
      id: "prizes",
      h2: "Prizes without the awkward part",
      body: paras(`
JaxSquares never collects, holds or sends money, and nobody pays anyone through the app. If your group likes to play for something, the host can show a square price and prizes on the board as plain information, in dollars or in points, so everyone sees the rules before they pick. Any settling up happens among yourselves.

Plenty of groups skip amounts entirely. Mark the board Just for fun, or add a prize note like “Loser brings the wings” or “Winner picks the next game we watch.”`),
    },
  ],
  faqs: [
    {
      q: "Which basketball games can I link?",
      a: "NBA, WNBA, men's college and women's college games. When you make a board, the next seven days of games are listed by day, and you can pick a date further ahead. Any other game can be typed in, and the host enters the scores.",
    },
    {
      q: "Why is there no every-score option for basketball?",
      a: "A basketball game has well over a hundred scoring plays, so a winner on every one would bury the board. Basketball boards have winners at the end of each quarter, at halftime and at the final, or at the final alone.",
    },
    {
      q: "How do men's college games work?",
      a: "Men's college games are played in two halves instead of four quarters, so their boards have a winner at halftime and at the final, or at the final alone. NBA, WNBA and women's college games are played in quarters.",
    },
    {
      q: "Does overtime count?",
      a: "Yes, toward the final. The final winner is decided by the score when the game ends, however many overtimes it takes. Quarter and halftime winners use the score at the end of those periods.",
    },
    {
      q: "What about scores over 100?",
      a: "Only the last digit of each score counts, so 102 is a 2 and 110 is a 0. Everything in front of the last digit is ignored, on the board and on paper.",
    },
    {
      q: "Is JaxSquares affiliated with the NBA, the WNBA or the NCAA?",
      a: "No. JaxSquares isn't affiliated with or endorsed by the NBA, the WNBA or the NCAA. We use those names only to describe the games your board can follow.",
    },
  ],
  related: [MARCH, "football-squares", HOW_TO, PRINTABLES],
  parent: null,
  nbaNotice: true,
  ncaaNotice: true,
  imageAlt: NEUTRAL_IMAGE_ALT,
  cta: {
    h2: "Make your basketball board",
    text: "Pick the game, text the link, and let the scores do the rest. Free to set up, and friends join from a link.",
  },
};

const marchMadness: LandingPage = {
  slug: MARCH,
  nav: "March Madness squares",
  blurb: "A board for every tournament game: halves for the men's games, quarters for the women's, and no bracket required.",
  title: "March Madness Squares: A Live Board for Every Game | JaxSquares",
  description:
    "Run March Madness squares for the college basketball tournament: a live board for each game, winners at halftime and the final, and no bracket to bust.",
  eyebrow: "March Madness squares",
  h1: `March Madness squares, <span class="hl">one game at a time</span>`,
  lede:
    "A bracket can be over by the first Friday. A squares board starts fresh every game. Make one for each tournament game your group cares about, text the link, and watch the winning square light up at halftime and at the final buzzer.",
  hero: {
    jax: "sit",
    win: { x: 6, y: 3 },
    art: "An example tournament squares board with the Hawks 6, Wolves 3 square lit gold as the winner.",
  },
  sections: [
    {
      id: "squares-or-bracket",
      h2: "Squares or a bracket? Why not both",
      body: paras(`
Brackets are a March tradition, but they take homework, and most of them are in pieces by the end of the first weekend. Squares asks nothing of anyone. There's no seeding to study and no upset to call: claim a few squares, wait for the numbers, and follow the score. The friend who couldn't name a single team in the tournament has the same chance as the one who filled out six brackets.

It works game by game, too. A bracket is one long contest, but a board is a fresh start every game, so the people knocked out of the bracket chat by Friday still have something to cheer for on Sunday. New to squares? The ${link(HOW_TO, "how-to-play guide")} explains the grid, the draw and every way to win.`),
    },
    {
      id: "halves-and-quarters",
      h2: "Halves for the men's games, quarters for the women's",
      body:
        paras(`
The men's and women's games are played differently, and the boards follow. Men's college games are two 20-minute halves, so a men's board has a winner at halftime and a winner at the final, or a single winner at the final. Women's college games are four 10-minute quarters, so a women's board can have a winner at the end of every quarter, just like an NBA game.

JaxSquares sets this up for you: pick Men's college or Women's college when you make the board and only the ways to win that fit the game are offered.`) +
        terms([
          ["Men's games", "Two halves. Winners at halftime and at the final, or at the final only."],
          ["Women's games", "Four quarters. Winners every quarter, at halftime and the final, or at the final only."],
          ["Either way", "Overtime counts toward the final, reverse winners double the winning squares, and new numbers each period keep a cold start from sinking anyone."],
        ]),
    },
    {
      id: "plan",
      h2: "Plan your tournament boards",
      body: steps([
        ["Find the game", "Make a board, pick Basketball, then Men's college or Women's college. The next seven days of games are listed by day, and you can pick a date to look further ahead."],
        ["Choose how squares win", "Halftime and final is the classic for a men's game, and every quarter for a women's game. Add reverse winners for a big group."],
        ["Text the link", "Drop it in the group chat, the team channel or the family thread. Friends tap their squares on their own phones, with no download."],
        ["Draw before tip-off", "Lock the board and draw the numbers before the game starts. Everyone sees their digits land at the same moment."],
        ["Follow it live", "The scores fill in on their own, the winning square glows as the lead changes, and the winner lights up at halftime and at the final buzzer."],
      ]),
    },
    {
      id: "ideas",
      h2: "Ideas for tournament season",
      body: ticks([
        "The opening rounds: two full days of games, back to back. Make a board for the games your group cares about most, or one for each afternoon and evening.",
        "Your school's game: the alumni chat's favorite way to watch, win or lose.",
        "Upset watch: pick the game everyone calls a mismatch. Upsets make for wild scores, and the squares don't care who's favored.",
        "The office: a board in the team channel is easier than a bracket for people who don't follow college basketball, and it's over in two hours.",
        "The title games: the men's and women's championship games are made for a party board, with the whole room watching every possession.",
      ]),
    },
    {
      id: "finishes",
      h2: "Close games, buzzer-beaters and overtime",
      body: paras(`
Tournament games are famous for their finishes, and that's when a squares board is at its best. A late three or a pair of free throws moves the last digit, so the winning square can change hands several times in the final minute. The board shows whose square is winning right now and how close yours is, a basket or a three away.

If a game goes to overtime, the final winner is decided by the score at the end, overtime included, and the halftime winner stays as it was. Because basketball points come in ones, twos and threes, every digit from 0 to 9 has a real chance, so there are no hopeless squares on a tournament board. The ${link(BASKETBALL, "basketball squares guide")} has more on how the digits fall, and a free printable board for the break room.`),
    },
    {
      id: "why-jaxsquares",
      h2: "Why JaxSquares for tournament season",
      body:
        features([
          ["Scores on their own", "Link a men's or women's college game and the scores fill in live, half by half or quarter by quarter."],
          ["A board per game", "Each board takes about a minute to make, and everyone's name, color and emoji are already saved on their phones for the next one."],
          ["Every board on one screen", "Home sorts your boards into Live now, Up next and Final, so a packed day of games stays easy to follow."],
          ["No app needed", "Friends tap the link and they're in. Same room? Show a QR code or a six-character board code."],
        ]) +
        `<p>Back to football in the fall? The ${link("football-squares", "football squares guide")} covers the NFL and college seasons, and the ${link("college-football-squares", "college football squares")} page has ideas for rivalry week and bowl season.</p>`,
    },
    {
      id: "prizes",
      h2: "Prizes, kept simple",
      body:
        paras(`
JaxSquares never collects, holds or sends money, and nobody pays anyone through the app. A host can show a square price and prizes on the board as plain information, in dollars or in points, or mark it Just for fun. Prize notes work on any board: “Winner picks the pizza for the next game” or “Loser wears the rival school's shirt.”`) +
        callout(
          paras(
            "If your group plays with money involved, make sure that's allowed where you live and at your workplace. When in doubt, play for bragging rights.",
          ),
        ),
    },
  ],
  faqs: [
    {
      q: "Is JaxSquares affiliated with the NCAA or March Madness?",
      a: "No. JaxSquares isn't affiliated with or endorsed by the NCAA. We use the name March Madness only to describe the college basketball tournament your board is for.",
    },
    {
      q: "Can I link a board to a tournament game?",
      a: "Yes. Pick Basketball, then Men's college or Women's college, and choose the game from its day in the list. Games show up once they're on the schedule, and the scores fill in live while they're played.",
    },
    {
      q: "Why do men's boards only have halftime and final winners?",
      a: "Men's college games are played in two halves, not four quarters, so there's no end of a first or third quarter to score. Women's college games are played in quarters, so their boards can have a winner every quarter.",
    },
    {
      q: "Can one board cover the whole tournament?",
      a: "A board follows a single game's score, so make one for each game your group wants to follow. It takes about a minute, and friends join each one from a link.",
    },
    {
      q: "Does overtime count?",
      a: "Yes, toward the final. The final winner is decided by the score when the game ends, however many overtimes it takes. The halftime winner is set at halftime.",
    },
    {
      q: "Do my friends need to download an app?",
      a: "No. They open the link you send, pick a name, a color and an emoji, and tap their squares. It works in any phone or computer browser.",
    },
  ],
  related: [BASKETBALL, "football-squares", HOW_TO, "college-football-squares"],
  parent: BASKETBALL,
  ncaaNotice: true,
  imageAlt: NEUTRAL_IMAGE_ALT,
  cta: {
    h2: "Get your tournament board ready",
    text: "Pick the game, text the link, and draw the numbers before tip-off. Free to set up, and friends join from a link.",
  },
};

const soccer: LandingPage = {
  slug: SOCCER,
  nav: "Soccer squares",
  blurb: "A board where every square is a minute, with winners at the first goal, every goal and the last goal.",
  title: "Soccer Squares: Every Square Is a Minute of the Match | JaxSquares",
  description:
    "Run soccer squares for MLS, NWSL, the Premier League and more. Each square is a minute, and the first goal, every goal or the last goal wins. Free to set up.",
  eyebrow: "Soccer squares",
  h1: `Soccer squares, <span class="hl">one minute at a time</span>`,
  lede:
    "Soccer scores are too low for the usual squares game, so on a soccer board every square is a minute instead. Link an MLS, NWSL, Premier League, LaLiga, Liga MX or Champions League match, text one link to your group, and the square for each goal's minute lights up the moment the ball goes in.",
  hero: {
    jax: "cheer",
    win: { x: 3, y: 4 },
    bands: { x: "Minute · ones", y: "Minute · tens" },
    art: "An example soccer squares board: the minute's ones across the top, its tens down the side, and the square for a goal in the 43rd minute lit gold as the winner.",
  },
  sections: [
    {
      id: "how-soccer-squares-works",
      h2: "How soccer squares works",
      body:
        paras(`
A soccer match can end 1–0, so the classic squares game, which reads the last digit of each team's score, would leave most of the board with nothing to cheer for all afternoon. Soccer squares uses the clock instead. The board is still a 10×10 grid of 100 squares, and everyone still claims their squares first. Then the digits 0 to 9 are drawn at random across the top, for the ones digit of the minute, and again down the side, for the tens digit. Every square ends up as one minute of the match, from 00 to 99.

When a goal goes in, read the minute the match shows. A goal in the 43rd minute wins for the square where the 4 row meets the 3 column. It doesn't matter which team scored, and an own goal counts like any other: a goal is a goal. Nobody knows which square is which minute when they pick, so the friend who has never watched a match has the same chance as the one who never misses one.`) +
        `<figure class="diagram">${boardDiagram({
          id: "soccer-diagram",
          win: { x: 3, y: 4 },
          guide: true,
          bands: { x: "Minute · ones", y: "Minute · tens" },
          title: "For a goal in the 43rd minute, follow the 3 column down and the 4 row across: the square where they meet wins.",
        })}<figcaption>A goal in the 43rd minute: the 3 column meets the 4 row.</figcaption></figure>`,
    },
    {
      id: "when-squares-win",
      h2: "When squares win",
      body:
        terms([
          ["Every goal", "Each goal's minute wins, so a match that ends 2–1 has three winners. The classic for a group that wants plenty of moments to cheer."],
          ["First & last goal", "Two winners: the minute of the first goal, and the minute of the last one, settled at the final whistle."],
          ["Last goal", "One winner: the minute of the match's last goal. A late goal changes everything."],
          ["Mix and match", "Combine them, like a winner on every goal plus a bigger prize for the first and the last."],
          ["Reverse winners", "The minute with its digits swapped wins too, so a goal in the 43rd minute also wins for the 34th minute's square."],
          ["No goals", "A 0–0 match still has a winner: the 00 square takes each of the board's goal winners, once."],
          ["10×10 or 5×5", "100 squares for a big group, or 25 squares, with two digits per row and column, for a small one."],
        ]) +
        paras(`
The numbers are drawn once and stay put for the whole match. A soccer board doesn't reshuffle at halftime: a minute is a minute in either half. The ${link(HOW_TO, "rules guide")} covers reverse winners, board sizes and what to do when a winning square is empty.`),
    },
    {
      id: "stoppage-time",
      h2: "Stoppage time and extra time",
      body:
        paras(`
The soccer clock has a few wrinkles, and the board handles each one the same way every time, so nobody has to argue about it at the final whistle.`) +
        terms([
          ["First-half stoppage time", "Counts as the 45th minute. A goal at 45+2' wins for the 45 square."],
          ["Second-half stoppage time", "Runs on. A goal at 90+3' is the 93rd minute, so the 9 row belongs to the late drama."],
          ["Extra time", "Keeps the last two digits: a goal in the 105th minute wins for the 05 square, and one in the 118th for 18. Stoppage time after 105 counts as the 105th minute, and after 120 it runs on, so 120+2' is 22."],
          ["Penalty shootouts", "Don't count. Only goals scored while the match is played decide the winners."],
        ]) +
        paras(`
Each row is a ten-minute stretch of the match. Goals come at any time, and late ones are common, so the squares in the 8 and 9 rows are never out of it until the final whistle.`),
    },
    {
      id: "watch-the-clock",
      h2: "Watch the clock, not just the score",
      body: paras(`
In football squares, a quiet quarter means waiting. In soccer squares, every minute that ticks by hands the spotlight to the next square. On a linked match, the board follows the clock: the square for the current minute glows, so everyone can see whose square a goal would land on right now, and your board tells you how many minutes until one of yours comes up.

When a goal goes in, its minute and the winning square land on every phone within seconds, and anyone with notifications on hears about it. A goal in the 89th minute is just as big as one in the 9th, which makes the last few minutes of every half worth watching, even in a match that's already decided.`),
    },
    {
      id: "leagues",
      h2: "Link an MLS, NWSL, Premier League or LaLiga match",
      body:
        paras(`
When you make a board, pick Soccer and then the league: MLS, NWSL, the Premier League, LaLiga, Liga MX or the Champions League. The next seven days of matches are listed by day, and you can pick a date to look further ahead. Link your board to a match and the goals fill in on their own, each with the minute the match showed.

Watching a match that isn't listed, like a youth tournament, a college game or your Sunday league? Type in any two teams instead and the host adds each goal: tap the team that scored, type the minute and any stoppage time, and the board shows whose square it is before you save. A goal entered wrong can be fixed or removed from the same screen.`) +
        ticks([
          "Weekend mornings: Premier League and LaLiga matches kick off early in the Americas, just right for a board over breakfast.",
          "Derby day: the rivalry match everyone in the group chat has an opinion about.",
          "MLS and NWSL nights: a full schedule from spring into fall, then the playoffs to close the season.",
          "Midweek in Europe: Champions League nights put the top clubs from across Europe on one schedule.",
          "Liga MX: a packed calendar and loud crowds, for the family group chat.",
        ]),
    },
    {
      id: "why-jaxsquares",
      h2: "Why run your board on JaxSquares",
      body:
        features([
          ["A live board", "Every pick, the draw and every goal land on every phone within a second. No refreshing, and nobody has to send a photo of the sheet."],
          ["Goals on their own", "Link a real match and each goal fills in with its minute. Typing in your own match? A goal takes a few taps."],
          ["Free to set up", "Making a board, inviting your group and picking squares cost nothing. Players never pay to join."],
          ["No app needed", "Friends tap the link and they're in, with no download and no account. Same room? Show a QR code or a six-character board code."],
        ]) +
        shots(["pick", "draw"]) +
        `<p>Running a board for another sport too? The ${link("football-squares", "football squares guide")} covers the NFL and college seasons, and the ${link(BASKETBALL, "basketball squares guide")} has the NBA, the WNBA and college hoops.</p>`,
    },
    {
      id: "printable",
      h2: "A printable soccer board",
      body: (ctx) =>
        printableCards(ctx.printableSizes, "soccer") +
        `<p>It prints on one Letter page, with the minute boxes across the top and down the side, lines for the first goal, each goal and the last goal, the stoppage-time rules and a QR code that turns it into a live board. The ${link(PRINTABLES, "printable templates page")} has the football boards, an A4 board and a prize sheet.</p>`,
    },
    {
      id: "prizes",
      h2: "Prizes without the awkward part",
      body: paras(`
JaxSquares never collects, holds or sends money, and nobody pays anyone through the app. If your group likes to play for something, the host can show a square price and prizes on the board as plain information, in dollars or in points, so everyone sees the rules before they pick. Any settling up happens among yourselves.

Plenty of groups skip amounts entirely. Mark the board Just for fun, or add a prize note like “Loser brings breakfast next match day” or “Winner picks the next match we watch.”`),
    },
  ],
  faqs: [
    {
      q: "How does soccer squares work?",
      a: "Each square is a minute of the match. The digits 0 to 9 are drawn across the top for the minute's ones and down the side for its tens, and when a goal goes in, the square for its minute wins. A goal in the 43rd minute is the 4 row and the 3 column.",
    },
    {
      q: "Which soccer matches can I link?",
      a: "MLS, NWSL, Premier League, LaLiga, Liga MX and Champions League matches. When you make a board, the next seven days of matches are listed by day, and you can pick a date further ahead. Any other match can be typed in, and the host adds the goals.",
    },
    {
      q: "How do stoppage time and extra time count?",
      a: "First-half stoppage time counts as the 45th minute. Second-half stoppage time runs on, so 90+3' is the 93 square. In extra time only the last two digits count: the 105th minute is 05 and the 118th is 18. Penalty shootouts don't count.",
    },
    {
      q: "What if nobody scores?",
      a: "The 00 square wins. On a 0–0 match it takes each of the board's goal winners once, so on a first-and-last-goal board, 00 wins both.",
    },
    {
      q: "Does it matter which team scores?",
      a: "No. A soccer board is about when a goal goes in, not who scores it, so own goals count too. The score is on the board for everyone to follow.",
    },
    {
      q: "Is JaxSquares affiliated with any soccer league?",
      a: "No. JaxSquares isn't affiliated with or endorsed by MLS, the NWSL, the Premier League, LaLiga, Liga MX or UEFA. We use those names only to describe the matches your board can follow.",
    },
  ],
  related: ["football-squares", BASKETBALL, HOW_TO, PRINTABLES],
  parent: null,
  soccerNotice: true,
  imageAlt: NEUTRAL_IMAGE_ALT,
  cta: {
    h2: "Make your soccer board",
    text: "Pick the match, text the link, and let the goals do the rest. Free to set up, and friends join from a link.",
  },
};

const printables: LandingPage = {
  slug: PRINTABLES,
  nav: "Printable templates",
  blurb: "Free PDF squares boards in Letter and A4, a 5×5 board and a quarters prize sheet.",
  title: "Printable Football Squares Templates (Free PDF) | JaxSquares",
  description:
    "Free printable football squares templates: a 10×10 board in Letter and A4, a 5×5 board and a quarters prize sheet. Or skip the paper and run your board live.",
  eyebrow: "Free templates",
  h1: `Printable football squares <span class="hl">templates</span>`,
  lede:
    "Four free PDFs, ready to print: the classic 100-square board in Letter and A4, a quick 25-square board, and a prize sheet for tracking winners by quarter. No sign-up and no email, just download.",
  hero: {
    jax: "sit",
    win: { x: 3, y: 0 },
    art: "An example squares board with the Hawks 3, Wolves 0 square lit gold as the winner.",
  },
  sections: [
    {
      id: "download",
      h2: "Download a template",
      body: (ctx) =>
        printableCards(ctx.printableSizes) +
        `<p>Each PDF prints on a single page. Use the Letter files in the US and Canada and the A4 file almost everywhere else. Playing basketball or soccer? There's a ${link(BASKETBALL, "printable basketball squares board")} and a ${link(SOCCER, "printable soccer squares board")} too.</p>`,
    },
    {
      id: "on-the-sheet",
      h2: "What's on each sheet",
      body: ticks([
        "Team lines: one team across the top and one down the side.",
        "Number boxes: blank boxes for the digits you draw, one per row and column (two on the 5×5 board).",
        "Square price and prizes: lines to write them down before anyone picks, if your group uses them. Leave them blank for a board that's just for fun.",
        "Winners: a box for each quarter's score and winner on the boards, and a full page for it on the prize sheet.",
        `A QR code: it opens ${PRINT_QR_LABEL}, for when the paper gets crowded and you want to run it live.`,
      ]),
    },
    {
      id: "paper-board",
      h2: "How to run a paper board",
      body: steps([
        ["Print it and fill in the teams", "Write one team across the top and the other down the side."],
        ["Pass it around", "Everyone writes their name or initials in the squares they want. Set a limit per person if the board is popular."],
        [
          "Draw the numbers",
          "Write 0 to 9 on ten slips of paper and pull them from a hat one at a time for the boxes across the top. Then put them back and do it again for the side.",
        ],
        [
          "Check the score after each quarter",
          "Take the last digit of each team's score and follow the column and row to the winning square. Write the winner on the prize sheet.",
        ],
      ]),
    },
    {
      id: "skip-the-paper",
      h2: "Skip the paper: run it live",
      body:
        paras(`
Paper works until someone's out of the room, the sheet picks up a salsa stain, or a cousin across the country wants in. A live board on JaxSquares does everything the printout does, plus the parts paper can't:`) +
        ticks([
          "Everyone picks from their own phone, from anywhere. No passing a clipboard around the room.",
          "The numbers are drawn at random with one tap, and everyone sees them land at the same time.",
          "Link a real pro or college game and the scores fill in on their own.",
          "The winning square lights up at the end of every quarter, with a ping for the winner.",
          "It's free to set up and invite, and nobody needs to download anything.",
        ]) +
        shots(["pick", "draw", "winning", "home"]) +
        callout(
          paras(`You can do both: run the live board and print a sheet for the fridge door. Every template has a QR code that opens ${PRINT_QR_LABEL}, and the ${link(HOW_TO, "rules guide")} covers every way to play.`),
        ),
    },
  ],
  faqs: [
    {
      q: "Are the templates really free?",
      a: "Yes. Download and print as many as you like. There's no sign-up and no email needed.",
    },
    {
      q: "Which paper size should I use?",
      a: "Use the Letter templates in the US and Canada and the A4 template almost everywhere else. The boards print in landscape and the prize sheet in portrait.",
    },
    {
      q: "How do I draw the numbers for a paper board?",
      a: "Write 0 to 9 on ten slips of paper and draw them one at a time, writing each digit in the next box across the top. Put the slips back and do it again for the side. Do it after the board is full, so nobody knows their numbers when they pick.",
    },
    {
      q: "Can I turn a paper board into a live one?",
      a: `Yes. Scan the QR code on the sheet or go to ${PRINT_QR_LABEL}, make a board with the same teams and format, and share the link. People can tap the same squares they wrote on paper.`,
    },
    {
      q: "Why are there lines for a square price and prizes?",
      a: "So the rules are written down before anyone picks, if your group uses them. They're optional. JaxSquares never collects or sends money, and plenty of boards are played just for fun.",
    },
  ],
  related: ["football-squares", HOW_TO, "big-game-squares", "college-football-squares"],
  cta: {
    h2: "Or run it live",
    text: "Same game, no clipboard. Make a board, text the link, and every score lands on every phone.",
  },
};

const howToSteps = [
  { name: "Set up the grid", text: "Draw a 10×10 grid, or make a board on JaxSquares. Put one team across the top and the other down the side." },
  { name: "Claim squares", text: "Players write their names in the squares they want, or tap them on a live board. A per-person limit keeps it fair." },
  { name: "Draw the numbers", text: "Once the board is full, assign the digits 0 to 9 at random across the top, then again down the side." },
  { name: "Check the score", text: "At the end of each quarter, at halftime and at the final, take the last digit of each team's score." },
  { name: "Find the winner", text: "The square where those two digits meet wins. With reverse winners on, the square with the digits swapped wins too." },
];

const howTo: LandingPage = {
  slug: HOW_TO,
  nav: "How to play football squares",
  blurb: "The rules: the grid, drawing numbers, who wins when, 10×10 vs 5×5, prizes and etiquette.",
  title: "How to Play Football Squares: Rules and Winners | JaxSquares",
  description:
    "Football squares rules, explained: how the grid works, how numbers are drawn, quarter, every-score and reverse winners, 10×10 vs 5×5, prizes and etiquette.",
  eyebrow: "Rules guide",
  h1: `How to play <span class="hl">football squares</span>`,
  lede:
    "Everything you need to run a fair, fun board: how the grid works, how the numbers get drawn, who wins when, which board size to pick, and how to handle prizes without any awkwardness.",
  hero: {
    jax: "cheer",
    win: { x: 4, y: 1 },
    art: "An example squares board with the Hawks 4, Wolves 1 square lit gold as the winner.",
  },
  howTo: {
    name: "How to play football squares",
    description: "Set up a 10×10 grid, claim squares, draw the numbers and match the last digit of each team's score.",
    steps: howToSteps,
  },
  sections: [
    {
      id: "quick-start",
      h2: "Football squares in five steps",
      body:
        `<ol class="steps">${howToSteps
          .map(
            (s, i) =>
              `<li id="step-${i + 1}"><span class="step-n" aria-hidden="true">${i + 1}</span><div><h3>${s.name}</h3><p>${s.text}</p></div></li>`,
          )
          .join("")}</ol>`,
    },
    {
      id: "grid",
      h2: "How the grid works",
      body: paras(`
A football squares board is a grid with one team across the top and the other down the side. The classic board is 10 columns by 10 rows, which makes 100 squares.

Players claim squares before the game. On paper, they write their initials in the boxes; on JaxSquares they tap them, and each player's color and emoji show up in their squares. At this point the squares have no numbers yet, and that's the point: nobody can pick a good square, because nobody knows which square is which.`),
    },
    {
      id: "numbers",
      h2: "How the numbers get drawn",
      body:
        paras(`
Once the board is full, or at a time everyone agreed on, the board locks and the numbers are drawn. The digits 0 to 9 are shuffled into a random order across the top, then shuffled again, separately, down the side. Every square now has two numbers: one for the team across the top and one for the team down the side.

On paper, the usual way is to pull ten numbered slips from a hat, once for each team. On JaxSquares the host taps Draw the numbers and the digits land on every phone at the same moment. Some groups like <strong>new numbers each quarter</strong>: the digits are reshuffled before every quarter, so a bad draw early doesn't sink your whole night.`) +
        `<figure class="diagram">${boardDiagram({
          id: "rules-diagram",
          win: { x: 7, y: 4 },
          guide: true,
          title: "A drawn board: Hawks digits across the top, Wolves digits down the side. At Hawks 17, Wolves 14, the Hawks 7 column and Wolves 4 row meet at the winning square.",
        })}<figcaption>Hawks 17, Wolves 14 at the end of Q1: the Hawks 7 column meets the Wolves 4 row.</figcaption></figure>`,
    },
    {
      id: "who-wins",
      h2: "Who wins",
      body:
        paras(`
Winners are decided by the last digit of each team's score. If the score is Hawks 17, Wolves 14, the Hawks digit is 7 and the Wolves digit is 4, so the winning square is the one in the Hawks 7 column and the Wolves 4 row. A score of 20–10 points to the 0 and 0 square. Everything before the last digit is ignored.

When winners are decided depends on the format your group picks:`) +
        terms([
          ["Every quarter", "A winner at the end of the first quarter, at halftime, at the end of the third quarter and at the final score. Four winners: the classic setup."],
          ["Halftime and final", "Two winners, one at halftime and one at the final score."],
          ["Final score", "A single winner, decided by the score when the game ends. Overtime counts."],
          [
            "Every score",
            "Each time the score changes, the square matching the new score wins, so a busy game can have a dozen winners. JaxSquares can even show a different prize for touchdowns, field goals, extra points, two-point conversions and safeties.",
          ],
          [
            "Reverse",
            "The square with the two digits swapped wins too. At 17–14, both the 7–4 square and the 4–7 square win. If the digits match, like 7–7, that one square takes both. Reverse can be added to any format.",
          ],
        ]) +
        paras(`
Quarter winners use the total score at the end of the quarter, not the points scored during it. A team with 10 at the end of the first quarter and 17 at halftime is a 0 for Q1 and a 7 for halftime.

Agree ahead of time on what happens if a winning square is empty. The usual choices are carrying that prize to the next period or giving it to the nearest claimed square. On JaxSquares, the host can also pick a winner by hand.`),
    },
    {
      id: "board-size",
      h2: "10×10 or 5×5?",
      body:
        paras(`
The classic <strong>10×10</strong> board has 100 squares with one number per row and column. Each square matches exactly one score combination, so it suits a big group: a party, an office or a family reunion, with people often taking several squares each.

A <strong>5×5</strong> board has 25 squares with two numbers in each row and column. Each square covers four score combinations (two digits for each team), so a small group still covers every possible score and the board fills up fast. It's the one for four to ten people, a tailgate, or a weeknight game with a couple of friends.`) +
        table(
          "Board sizes compared",
          ["", "10×10", "5×5"],
          [
            ["Squares", "100", "25"],
            ["Numbers per row and column", "1", "2"],
            ["Score combinations per square", "1", "4"],
            ["Best for", "Parties, offices, big families", "Small groups and tailgates"],
          ],
        ) +
        `<p>Either way, set a square limit per person so everyone gets a fair shot at the board.</p>`,
    },
    {
      id: "square-price-and-prizes",
      h2: "Square price and prizes, without JaxSquares touching the money",
      body:
        paras(`
Squares works great just for fun, for bragging rights or for a prize like the last slice of pizza. Some groups like to play with a square price and prizes too. Here's how that works on JaxSquares:`) +
        ticks([
          "The host shows it, the app never touches it: when you make a board, you can show a square price and a prize for each period, in dollars or in points. It's display-only information that everyone sees before they pick.",
          "Players settle among themselves: JaxSquares never collects, holds or sends money between players, and it doesn't keep track of who owes what. Any settling up happens directly within your group, just as it would with a paper sheet.",
          "Just for fun is one tap: mark the board Just for fun and no amounts appear anywhere. Prize notes like “Loser brings the wings” or “Winner picks the halftime playlist” work on any board.",
          "Amounts stay on the board: they never appear in invite messages, link previews or notifications.",
        ]) +
        callout(
          paras(
            "If your group plays with money involved, make sure that's allowed where you live and at your workplace. When in doubt, play for bragging rights.",
          ),
        ),
    },
    {
      id: "etiquette",
      h2: "Squares etiquette",
      body:
        ticks([
          "Share the rules before anyone picks: the format, the square limit, what happens with an empty winning square, and any prizes.",
          "Draw after the board is full, never before: that's what keeps it fair.",
          "No swapping after the draw: once the numbers are on the board, everyone keeps what they picked.",
          "Give everyone a fair shot: a square limit stops one early bird from taking half the board, and the last few open squares can go to whoever's still waiting.",
          "Settle up promptly and directly: if your group plays for prizes, sort it out among yourselves soon after the game, and be a gracious winner.",
          "Keep it friendly: it's a party game. Cheer for the score you need, and save some sympathy for whoever drew the 2 and the 5.",
        ]) +
        shots(["pick", "draw", "winning", "pinged"]) +
        `<p>Ready to try it? Our guides for ${link("big-game-squares", "big game squares")}, ${link("nfl-squares", "NFL squares")} and ${link("college-football-squares", "college football squares")} have ideas for every kind of game day, and the ${link(PRINTABLES, "printable templates")} are free.</p>`,
    },
  ],
  faqs: [
    {
      q: "Do you need to know football to play squares?",
      a: "No. Once the numbers are drawn, squares is pure luck. All you need to do is read the score.",
    },
    {
      q: "What are the best numbers in football squares?",
      a: "In football, 0, 7, 3 and 4 tend to come up most because of touchdowns, extra points and field goals, while 2 and 5 are rare. That's why the numbers are drawn at random after everyone picks: nobody chooses their digits.",
    },
    {
      q: "How does reverse work?",
      a: "With reverse winners on, the square with the two digits swapped also wins. At 21–14, both the 1–4 square and the 4–1 square win. If the two digits match, like 7–7, that one square takes both.",
    },
    {
      q: "Does overtime count?",
      a: "Overtime counts toward the final score. Quarter and halftime winners are set at the end of those periods.",
    },
    {
      q: "What happens if nobody owns the winning square?",
      a: "Agree on it before the game. Most groups carry that prize to the next period or give it to the nearest claimed square, and on JaxSquares the host can pick a winner by hand.",
    },
    {
      q: "How many squares can each person take?",
      a: "Whatever your group agrees on. On JaxSquares the host sets a per-player limit when making the board and can change it later.",
    },
  ],
  related: ["football-squares", "big-game-squares", "nfl-squares", PRINTABLES],
  cta: {
    h2: "Run your first board",
    text: "JaxSquares draws the numbers, keeps the score and lights up every winner. Free to set up, and friends join from a link.",
  },
};

export const PAGES: readonly LandingPage[] = [hub, bigGame, nfl, college, basketball, marchMadness, soccer, printables, howTo];
