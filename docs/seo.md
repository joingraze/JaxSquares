# Search and AI assistants

How jaxsquares.com gets found: by search engines (Google, Bing) and by the
assistants that answer questions from the web (ChatGPT, Claude, Gemini,
Perplexity). Most of it runs on every deploy; a few accounts need setting up once.

## Where each one looks

| Who | Reads | So what matters |
| --- | --- | --- |
| Google Search | Googlebot, runs JavaScript | Sitemap dates, page copy, structured data |
| Gemini | Google's index | The same as Google |
| Bing | Bingbot, runs some JavaScript; takes IndexNow pings | IndexNow, the sitemap |
| ChatGPT search | Bing's index, plus OAI-SearchBot and ChatGPT-User (no JavaScript) | Bing, static HTML, `llms.txt` |
| Claude | Brave Search's index, plus Claude-SearchBot and Claude-User (no JavaScript) | Static HTML, links from other sites |
| Perplexity | PerplexityBot (no JavaScript) | Static HTML |

The crawlers that don't run JavaScript see only what's in the HTML, which is
why every page they might land on is static, and the homepage carries a static
copy of the welcome screen.

## What happens on every deploy

`npm run build` runs `scripts/seo/build.ts` after `vite build`. It writes:

- **The landing pages** (`scripts/seo/content.ts`): guides for football,
  the big game, NFL, college, basketball, March Madness, printables, the rules,
  and `/best-football-squares-numbers`, the data page. Each has its title,
  description, canonical, Open Graph tags, one H1, FAQ JSON-LD that matches the
  page, and breadcrumbs or HowTo where they fit.
- **`home.html`**, served at `/` by the Worker: the SPA shell with the
  homepage's own title, description, canonical, link preview and JSON-LD
  (`Organization` with the Instagram profile as `sameAs`, `WebSite`,
  `WebApplication`), and a static copy of the welcome screen inside `#root`:
  what JaxSquares is, how it works, every guide. It's hidden the moment the
  theme script runs and React replaces it, so people never see it. When you
  change the welcome screen's copy (`src/features/home/Welcome.tsx`), change
  `scripts/seo/home.ts` to match.
- **`/robots.txt`**: every crawler may read every page; `/api/` is off limits.
- **`/sitemap.xml`** with a real `lastmod` per page: the build hashes every
  page into `/seo/pages.json` and compares it with the live site's copy
  (`SEO_PREVIOUS_MANIFEST` in deploy.yml), so a page's date moves only when the
  page changed. Google ignores dates that move on every deploy.
- **`/llms.txt`** and **`/llms-full.txt`** ([llmstxt.org](https://llmstxt.org)):
  what JaxSquares is and where each guide lives, and every guide's full text in
  Markdown. Cheap to keep; some assistants read it.
- **The data page's CSV**, `/seo/data/nfl-final-score-squares.csv`, with
  `Dataset` JSON-LD on the page.
- **The IndexNow key file**, `/<INDEXNOW_KEY>.txt` (`scripts/seo/site.ts`).

After the deploy, `scripts/seo/indexnow.ts` pings IndexNow with the pages that
changed (`dist/seo-changes.json`). Bing, Yandex, Seznam and Naver share the
pings; Bing usually recrawls within hours, and ChatGPT search picks the pages
up from Bing. Google doesn't take IndexNow; it goes by the sitemap. The step
skips itself until jaxsquares.com serves the key file and never fails a deploy.

The Worker adds two things at request time:

- **`X-Robots-Tag: noindex`** on `/g/*` (boards list their players' names),
  `/club/*`, `/new`, `/me` and `/tv` (pairing a TV). Link previews in iMessage, WhatsApp and Slack
  don't read it, so invites still unfurl. Crawlers can still fetch those pages
  (robots.txt doesn't block them), which is what lets them see the noindex.
- **This week's games** on `/nfl-squares`, `/college-football-squares` and
  `/basketball-squares` (`worker/weekGames.ts`): the matchups and kickoff times
  from the same ScoreHub the app's game picker reads, so the pages answer
  "squares for tonight's game" with tonight's game. Without a schedule in
  2.5 seconds (the offseason, ESPN down), the page goes out with its static copy.

## The data page

`/best-football-squares-numbers` shows how often every square hits on an NFL
final score: 7,276 games, 1999–2025 seasons, from
[nflverse](https://github.com/nflverse/nfldata)'s `games.csv`.
`scripts/seo/stats.ts` counts them into `scripts/seo/data/nflFinals.ts`; the
page's copy and tables are computed from that file, so a refresh needs no copy
edits. The marketing studio's stat videos read the same file.

Every March 1 (after the season's last game), `.github/workflows/seo-stats.yml`
recounts and opens a pull request when the numbers changed. To run it by hand:

```bash
curl -fsSL https://raw.githubusercontent.com/nflverse/nfldata/master/data/games.csv -o /tmp/games.csv
npm run seo:stats -- /tmp/games.csv
```

A season counts only once its last game has a score, so a season in progress
never skews the table.

## One-time setup (needs your accounts)

1. **Google Search Console** ([search.google.com/search-console](https://search.google.com/search-console)):
   add a *Domain* property for `jaxsquares.com`. It verifies with a DNS TXT
   record; with the domain on Cloudflare, Search Console offers to add it for
   you. Then go to Sitemaps, submit `https://jaxsquares.com/sitemap.xml`, and
   use URL Inspection → Request indexing on `/`, `/football-squares` and
   `/best-football-squares-numbers`.
2. **Bing Webmaster Tools** ([bing.com/webmasters](https://www.bing.com/webmasters)):
   sign in and choose *Import from Google Search Console*. That brings the site
   and its sitemap over in one step. The IndexNow pings show up there after the
   next deploy. This is the one that feeds ChatGPT search.
3. **Cloudflare's AI crawler settings** for `jaxsquares.com`. Cloudflare can
   block AI crawlers, or prepend its own rules to robots.txt, by default on a
   new zone. In the dashboard, open the zone's AI crawler controls (AI Crawl
   Control, under Security or AI) and make sure the crawlers that *answer
   questions* are allowed: OAI-SearchBot and ChatGPT-User (ChatGPT),
   Claude-SearchBot and Claude-User (Claude), PerplexityBot and
   Perplexity-User. Blocking the ones that only collect *training* data
   (GPTBot, ClaudeBot, Google-Extended, CCBot) is up to you and doesn't affect
   search results. Then check `https://jaxsquares.com/robots.txt`: if Cloudflare
   added lines above ours, read them to confirm they don't disallow the
   crawlers above. Also make sure Bot Fight Mode isn't challenging verified
   bots.
4. **GitHub**: in the repository's Settings → Actions → General, turn on
   *Allow GitHub Actions to create and approve pull requests*, so the yearly
   stats refresh can open its pull request.
5. **Links from elsewhere**: Brave (behind Claude's web search) has no
   submission console; it finds sites through links. Point the Instagram bio at
   `https://jaxsquares.com` (the `sameAs` in the JSON-LD names
   `https://www.instagram.com/jaxsquares/`; change `SOCIAL` in
   `scripts/seo/site.ts` if the handle differs), and link the site from any
   other profiles you make.

## Checking it

After a deploy (also in deploy.yml's smoke test):

```bash
curl -s https://jaxsquares.com/ | grep -o '<link rel="canonical"[^>]*>'
curl -sI https://jaxsquares.com/g/abc234 | grep -i x-robots-tag
curl -s https://jaxsquares.com/nfl-squares | grep -o '<span class="match">[^<]*' | head
curl -s https://jaxsquares.com/robots.txt
curl -s https://jaxsquares.com/llms.txt | head
```

To see a page the way a crawler without JavaScript does, use
`curl -A "OAI-SearchBot" https://jaxsquares.com/`. Google's
[Rich Results Test](https://search.google.com/test/rich-results) reads the
structured data.

## Rules for the copy

The landing pages, `home.html` and `llms.txt` follow the product rules in
CLAUDE.md, and `scripts/seo/seo.test.ts` checks them: no betting words ("chance",
never "odds"), no currency amounts, "the big game" instead of the
championship's trademarked name, leagues named only to describe the games with
the matching "not affiliated" line, and no league or team logos.
