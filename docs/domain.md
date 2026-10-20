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

## After it's live

- Stripe: register `jaxsquares.com` for Apple Pay (docs/payments.md).
- Resend: its DNS records go in Cloudflare now (docs/email.md).
- Google / Apple sign-in: the web origins and return URLs use
  `https://jaxsquares.com` (docs/auth.md).
- The `jaxsquares.turnoverapp.workers.dev` address keeps working; the deploy
  smoke test uses it.
