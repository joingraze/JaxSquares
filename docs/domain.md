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

1. **Add the domain to Cloudflare** (the account that hosts the Worker):
   Add a domain → `jaxsquares.com` → Free plan. Cloudflare copies the DNS
   records it finds at Squarespace. Review them:
   - Keep any MX, TXT (SPF, verification) and email records.
   - Delete the A/CNAME records for `@` and `www` that point at a Squarespace
     website (Squarespace's own IPs or `ext-sq.squarespace.com`); the Worker
     takes `@`, and step 5 handles `www`.
   Cloudflare then shows two nameservers, like `xxx.ns.cloudflare.com`.
2. **Turn off DNSSEC at Squarespace** if it's on (Domains → jaxsquares.com →
   DNS → DNSSEC). Changing nameservers with DNSSEC on breaks the domain.
3. **Change the nameservers at Squarespace**: Domains → jaxsquares.com → DNS →
   Domain nameservers → Use custom nameservers → enter Cloudflare's two
   exactly → Save.
4. **Wait for Cloudflare to say the domain is Active** (usually under an hour,
   up to 24). Then the next deploy attaches `jaxsquares.com` to the Worker by
   itself (`scripts/custom-domain.sh`, the last step of the Deploy workflow).
   If its log says the token can't, attach it by hand: Workers & Pages →
   jaxsquares → Settings → Domains & Routes → Add → Custom domain →
   `jaxsquares.com`. Cloudflare creates the DNS record and the certificate.
5. **www**: in the jaxsquares.com zone, Rules → Redirect Rules → Create from
   template → "Redirect from WWW to root". It needs a proxied DNS record for
   `www` (the template offers to add one).
6. Optional, afterwards: turn DNSSEC on in Cloudflare (DNS → Settings) and add
   the DS record it gives you at Squarespace.

## After it's live

- Stripe: register `jaxsquares.com` for Apple Pay (docs/payments.md).
- Resend: its DNS records go in Cloudflare now (docs/email.md).
- Google / Apple sign-in: the web origins and return URLs use
  `https://jaxsquares.com` (docs/auth.md).
- The `jaxsquares.turnoverapp.workers.dev` address keeps working; the deploy
  smoke test uses it.
