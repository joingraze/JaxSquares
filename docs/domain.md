# jaxsquares.com

The app runs on a Cloudflare Worker (`jaxsquares`). The domain is registered
at Squarespace. A Worker can only answer on a domain whose DNS Cloudflare
hosts, so the domain stays registered at Squarespace (renewals, billing) and
its nameservers point to Cloudflare. Pointing a Squarespace DNS record at the
Worker doesn't work: an apex domain can't be a CNAME there, and Cloudflare
refuses a CNAME to a `workers.dev` address from outside Cloudflare.

The app already uses `https://jaxsquares.com` everywhere: invite links, pushes,
emails, link previews, the landing pages' canonical URLs and the iOS build's
API base (`APP_ORIGIN` in `wrangler.jsonc`, `VITE_API_BASE`). Once the domain
answers, all of those work.

## Steps

The Deploy workflow's last step (`scripts/custom-domain.sh`) does everything
Cloudflare-side with the deploy's API token, idempotently, on every deploy:

1. Creates the `jaxsquares.com` zone in the Worker's Cloudflare account (Free
   plan) if it isn't there, and prints the two Cloudflare nameservers. No
   records are copied from Squarespace: the domain has no email (MX/TXT)
   records, and its Squarespace website records would clash with the Worker.
2. While the zone is pending, asks Cloudflare to re-check the nameservers.
3. Once it's active: attaches `jaxsquares.com` to the Worker as a Custom
   Domain (Cloudflare adds the DNS record and certificate), adds a proxied
   `www` record with a 301 redirect rule to `https://jaxsquares.com`, and
   checks `https://jaxsquares.com/api/health`.

The one step only the owner can do, at Squarespace: Domains → jaxsquares.com →
DNS → Domain nameservers → Use custom nameservers → enter the two Cloudflare
nameservers from the deploy log exactly → Save. (DNSSEC is off for this
domain; if it's ever on, turn it off first.) Cloudflare activates the zone
within minutes to 24 hours; re-run the Deploy workflow after that.

If the token lacks a permission, the log says which step to do in the
dashboard instead:
- Add a domain → `jaxsquares.com` → Free.
- Workers & Pages → jaxsquares → Settings → Domains & Routes → Add → Custom
  domain → `jaxsquares.com`.
- The zone's Rules → Redirect Rules → template "Redirect from WWW to root".

Optional, afterwards: turn DNSSEC on in Cloudflare (DNS → Settings) and add the
DS record it gives you at Squarespace.

## Status

- Cloudflare zone `jaxsquares.com` added (Free plan) in the account with the
  `jaxsquares` Worker. Squarespace's website A records and `www` CNAME were
  deleted; the `_domainconnect` CNAME (Squarespace's helper) stays.
- Cloudflare nameservers: `lily.ns.cloudflare.com`, `vern.ns.cloudflare.com`
  (set at Squarespace → Domain nameservers → Use custom nameservers).
- 2026-10-19: the zone is active and `jaxsquares.com` is attached to the
  Worker as a Custom Domain (by the deploy step); https://jaxsquares.com
  serves the app. `www.jaxsquares.com` redirects (301, path and query kept)
  through a dashboard redirect rule ("Redirect from WWW to root"; the deploy
  token can't edit redirect rules, so the deploy step only checks it).

## Email (support@ and every other address)

Cloudflare Email Routing forwards every address @jaxsquares.com (support@,
which the receipts, Pricing and Terms give out, included) to the owner's
inbox: `scripts/email-routing.sh`, run by `.github/workflows/email-routing.yml`,
turns it on (Cloudflare adds its MX and SPF records), adds the inbox as a
destination and points the catch-all rule at it. The inbox is the repository
secret `EMAIL_FORWARD_TO`, never written in this public repo or a log, and
Cloudflare emails it a verification link that has to be clicked before
anything forwards. The deploy token needs **Zone · Email Routing Rules ·
Edit** and **Account · Email Routing Addresses · Edit** (plus **Zone · Zone
Settings · Edit** and **Zone · DNS · Edit** while routing is off); the run
names any it lacks. Dashboard instead: the account's Email Routing → the
domain → Routing rules → Catch-all address → Send to an email.

Sending (the email notices, docs/email.md) is separate: Resend's records sit
on their own names and don't clash with Email Routing's.

## After it's live

- Stripe: register `jaxsquares.com` for Apple Pay (docs/payments.md).
- Resend: its DNS records go in Cloudflare now (docs/email.md).
- Google / Apple sign-in: the web origins and return URLs use
  `https://jaxsquares.com` (docs/auth.md).
- The `jaxsquares.turnoverapp.workers.dev` address is the same Worker (same
  database, same boards), not a test site. Its API keeps answering, because the
  deploy smoke test reads it there. Its pages move to the same path on
  `https://jaxsquares.com` before anything loads (a script at the top of
  `index.html` and of each landing page, `scripts/seo/render.ts`;
  `src/test/workersDev.test.ts`): sign-in, Apple Pay and a device's saved
  identity only work on jaxsquares.com. It's a script rather than a Worker
  redirect because most pages are static files the Worker never sees.
