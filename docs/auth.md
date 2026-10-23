# Optional sign-in (Sign in with Apple / Google)

Playing never needs an account. Signing in, one or two taps with Apple or
Google, keeps a person's boards on every device: the squares they picked, the
boards they host (with full host controls) and their invites. The yearly Host
Pass will be tied to the account later, which is the main reason to sign in.

Code: `worker/auth/` (Worker), `src/lib/auth.ts` + `src/lib/authSdk.ts` +
`src/features/account/` (app). Tables: `migrations/0010_accounts.sql`.

## The model

### Canonical identity

Identity is still the device's secret `clientId` (`x-client-id`, see CLAUDE.md
→ Identity). An account adds no new credential; it maps devices to one
**canonical clientId**:

- `accounts`: `id` (random), `canonical_client_id` (UNIQUE), `email` and `name`
  (if the provider shared them; shown only to the owner), timestamps.
- `account_identities`: `(provider, subject)` UNIQUE → `account_id`; for Apple
  also `refresh_token` + `token_client_id` (for revocation).
- `client_links`: `client_id` (PRIMARY KEY) → `account_id`, one row per
  signed-in device, the canonical device included.

The canonical clientId is the clientId of the **first device that signed in**,
so that device's rows never move. Every request's `x-client-id` is resolved to
it before a route reads it (`canonicalClientId` in `worker/auth/canonical.ts`,
used by `requireClient` in `worker/index.ts` and by the push routes):

- One indexed D1 read (`client_links` by primary key joined to `accounts`),
  cached per isolate for 30 s. Sign-in, sign-out and deletion update this
  isolate's entries at once.
- The app sends `x-signed-in: 1` while it's signed in. That always skips a
  cached "not linked" answer (a sign-in another isolate handled), so a device
  never acts as its bare self right after signing in. The hint only forces a
  fresh read; it can't make a device act as anyone else.
- A stale "linked" entry in another isolate can outlive a sign-out by up to
  30 s; only the device that signed out could use it, and the app throws that
  clientId away on sign-out.
- Missing tables (migration 0010 not applied) fail open to the header id. Any
  other read error fails open for a device that isn't signed in and is a 503 for
  one that is.

Everything downstream (`c.get("clientId")`, `c.get("playerId")`, rate limits,
push, squares, members, host checks, `GET /api/me/games`) then works on the
account. Every device signed in to one account is **one player** with one
public player id: `GameState`, activity and the live socket's `?player=` all
show the account's id. The socket's `player` is still only a hint for the
watcher count (unchanged trust): two devices of one account count once.

### One account per email, and adding a sign-in

- **Email matching.** A sign-in whose Apple ID or Google account isn't known
  yet joins the account that already has its email (lowercased; the oldest
  if several) instead of making a second one, merging the device in as below.
  Only an email the provider says it verified (`email_verified` true), and
  never an Apple private relay address (`@privaterelay.appleid.com`: each app
  gets its own, so it never matches). `matchEmailOf` in `routes.ts`; the
  lookup uses `idx_accounts_email` (migration 0018). The account's email is
  never replaced by a relay address once it has a real one.
- **Adding one** (Profile → Account → "Another way to sign in", for the
  providers the account doesn't have): `POST /api/auth/:provider/link` adds
  the identity to the account this device is signed in to. Someone who hid
  their email from Apple adds Google (or the other way) here.
- **Combining.** When the sign-in being added already has its own account,
  the server answers 409 `account_exists`; the app asks ("Combine your
  accounts?") and resends the same token with `combine: true`. That account's
  canonical clientId's rows move into this one with the same merge statements
  as a device sign-in, then its devices (`client_links`) and sign-ins
  (`account_identities`) move over and it's deleted (`combineAccountStatements`).
  The person proved both: this device is signed in to one, and the token is a
  fresh sign-in to the other.

### Signing in on another device (the merge)

When a device that isn't the canonical one signs in to an existing account,
one D1 batch moves its rows to the canonical clientId and writes its link
(`linkDevice` in `worker/auth/store.ts`, with statements built by each table's
owner):

| Table | What happens |
|---|---|
| `games.host_client_id` | the boards it hosts become the account's |
| `players` | `INSERT OR IGNORE` under the canonical id, then the device's rows are deleted (where both were on a board, the account's row and name stay) |
| `squares` | moved to the canonical id |
| `activity` | its public id is renamed to the account's in `actor` (and a legacy row's clientId) and in winner rows' `playerIds` |
| `games.version` | bumped for every board touched; their rooms get the new state (up to 50, deferred) |
| `push_subscriptions` | moved, so the account's pushes reach every signed-in device |
| `game_mutes` | `INSERT OR IGNORE`, then the device's rows deleted (a mute is now the account's) |
| `cohosts` | `INSERT OR IGNORE` under the canonical id, then the device's rows deleted, so a co-host who signs in on another device stays one (and the board's version bumps); where the account now hosts a board the device co-hosted, its co-host row goes (it's the host) |
| `host_passes` | moved (payments, `worker/payments/store.ts`): the device's Annual Pass and Annual Pass + Venue rows (`plan`, migration 0016) join the account's, and all are kept; the account is covered while any is active, and has the club features while an Annual Pass + Venue is |
| `stripe_customers` | moved with `UPDATE OR IGNORE`, then the device's leftover deleted: the account keeps its own Customer if it has one for the same Stripe keys (it can't really have two: the web only sells the pass to a signed-in device, which already acts as the canonical clientId) |
| `email_subscriptions` | moved (email notices, `worker/email/store.ts`, docs/email.md); where both have an address on a board, the confirmed one stays (else the account's) and the other is deleted. `email_suppressions` is keyed by the address, so nothing moves |
| `clubs` | moved (clubs, `worker/clubs/store.ts`, migration 0016): the device's club (name, logo, TV link) becomes the account's, unless the account has a club of its own with a name or a logo, which stays (the device's is deleted); an account's empty club gives way to the device's. Its TV link keeps working. The account's branding cache is dropped in that isolate (`forgetClubBrand`) |
| `prize_claims` | moved (venue boards' prizes handed over, migration 0019): a collected prize stays collected for the account's player |
| `client_links` | the device's link |

`purchases` and `cohost_invites` have no client column (an invite is always
the board host's), and `rate_limits` are short-lived windows, so none of them
moves. **A new table keyed by a clientId must add its statements to
this merge** (and say so here). A board can end up with more of the account's
squares than its squares-per-player cap: each was picked within it.

After the merge the device's own clientId works only through `client_links`.

Rules:

- A device linked to account X that signs in to account Y gets **409 "Sign out
  first"** (also a device whose clientId is another account's canonical one).
- Signing in again on a device already linked to that account is a no-op.
- A new Apple/Google identity creates a new account with this device as
  canonical (UNIQUE races retry once).

### Host access

`GET /api/me` and the sign-in response carry `hostTokens`: game id → admin
token for every board the canonical identity hosts (newest 200), never anyone
else's. The app stores them like the creator's device does
(`saveAdminToken`), so host tools show on every signed-in device. The server's
token overwrites a different one held locally (it's authoritative, unlike a
host link's).

They also carry `cohostGames`: the ids of the boards the identity co-hosts
(newest 200), with **no token**. A co-host is authorized by the request's
canonical clientId (docs/ARCHITECTURE.md "Co-hosts"), so every device signed
in to the account runs those boards as a co-host; the app keeps the list
(`jaxsquares.cohosts`) only to load host tools early, and each board's
`Game.cohostIds` says for sure.

### `GET /api/me`

```ts
interface MeResponse {
  playerId: string;                // the account's public id when signed in, else the device's
  account: { provider: "apple" | "google"; email: string | null; name: string | null; since: number } | null;
  hostTokens: Record<string, string>;
  profile?: { name: string; color: string; emoji: string } | null; // last board profile, for a new device
  hostPass?: HostPass | null;      // the identity's Annual Pass (docs/payments.md), null when it never had one
  clubPass?: HostPass | null;      // the identity's Annual Pass + Venue (docs/payments.md "Annual Pass + Venue"), null when it never had one
  cohostGames?: string[];          // ids of the boards the identity co-hosts (no tokens)
}
```

The app primes its Annual Pass state from `hostPass` and `clubPass` (`src/lib/hostPassStore.ts`).
It always reads the link
fresh (503 when it can't, so the app never mistakes an error for "signed
out"). The app calls it on start (`refreshMe` in `src/lib/auth.ts`, deferred a
second) and gets the same shape back from every sign-in.

### In the app

- `getPlayerId()` returns the server-confirmed id when signed in. It's stored
  as `jaxsquares.playerId` = `{ for: <the device's derived id>, id }` next to the
  clientId (localStorage + Capacitor Preferences), so "mine" works offline at
  startup, and only counts for the clientId it was given for.
  `jaxsquares.account` holds the `AccountInfo`. `getClientId()` is still only
  for the request header.
- `completeSignIn` adopts the response: player id, account, host tokens, and
  the profile when the device has none; then Home refetches (`resetMyGames`).
- **Sign out** (`signOut`): the server drops the device's link and removes this
  device's push registration from the account, then the device starts fresh
  (`wipeIdentity`): a new clientId, and the stored player id, account, profile,
  known boards and their admin tokens, the seen list and cached mutes are
  cleared; theme and the push on/off setting stay. Push then re-registers as
  the new device. Copy: "Signing out takes your boards off this device. Sign
  back in to get them back." Offline, nothing changes and the app says so.
- A device that thinks it's signed in but whose `GET /api/me` says
  `account: null` (signed out or deleted from another device) starts fresh the
  same way.

### Deleting the account

`DELETE /api/account` (from any signed-in device):

1. Stops the account's web Annual Pass from renewing (Stripe
   `cancel_at_period_end`; one still waiting for its first payment is
   canceled), since nobody could manage it afterwards. If Stripe can't be
   reached, nothing is deleted (502). An App Store Annual Pass is Apple's to
   cancel: the confirm sheet says it keeps renewing until canceled in Settings,
   and Restore purchases brings it back on any device.
2. Revokes each Apple refresh token at `https://appleid.apple.com/auth/revoke`
   (skipped, with a log, when the Sign in with Apple key isn't configured or the
   identity has no refresh token).
3. Deletes the account, its identities and every device link, and the push
   registrations under the canonical clientId (each device re-registers as
   itself), its email notice addresses (docs/email.md: nobody could manage
   them afterwards) and an Annual Pass + Venue holder's club (its name, logo and TV link:
   the branding goes with the account; docs/payments.md "Annual Pass + Venue"). A web
   Annual Pass + Venue stops renewing in step 1, like a web Annual Pass.
4. **The boards and squares stay** as anonymous data under the canonical
   clientId, so friends' games carry on. Every signed-in device starts fresh
   (this one now, the others on their next start), so nobody can change them
   from a device any more. The confirm sheet says what's deleted and what stays.

### Token verification

`worker/auth/jwt.ts`: RS256 ID tokens verified with WebCrypto against
`https://www.googleapis.com/oauth2/v3/certs` and
`https://appleid.apple.com/auth/keys`, cached per the response's
`Cache-Control: max-age` (5 min to 24 h; 1 h without one), refetched early (at
most once a minute) for an unknown key id. Checks: signature, `iss`
(`https://accounts.google.com` / `accounts.google.com`;
`https://appleid.apple.com`), `aud` (Google: the web and iOS client ids; Apple:
the bundle id and the Services ID; `azp` too when there are several
audiences), `exp`/`iat` with 60 s skew, a `sub`, and the nonce.

Nonce: the app hashes a fresh random nonce (SHA-256, lowercase hex) into every
sign-in request (Apple native, Apple JS, Google iOS, Google Identity Services)
and sends the raw value with the token. A token that carries a nonce must come
with the matching raw nonce; a raw nonce with a token that has none fails. A
token lifted from somewhere can't be replayed: the thief only sees the hash.

### Apple token revocation

When the app sends Apple's `authorizationCode` and `APPLE_TEAM_ID`,
`APPLE_KEY_ID` and `APPLE_SIGNIN_PRIVATE_KEY` are set, the Worker exchanges it
(after responding) at `https://appleid.apple.com/auth/token` with an ES256
client secret (iss = team id, sub = the token's audience: the bundle id for the
iOS app, the Services ID for the web) and stores the refresh token. Accounts
created while the key isn't set have nothing to revoke later, so **set the key
up before the iOS app with sign-in ships** (App Store guideline 5.1.1(v)).

### Hosts sign in

Making a board needs a sign-in wherever web sign-in is set up
(`hostsSignIn` in `worker/auth/config.ts`: a Google web client id or an Apple
Services ID). `POST /api/games` checks the device's account link first
(`freshLink`) and answers 409 `account_required` without one; boards made
before the rule, and their hosts, keep working as they are. Without either id
(local dev, most tests) anyone can make a board. Players never need an account.

In the app:
- **Create** (`src/pages/CreateGame.tsx`): Review says "You'll sign in with
  Google or Apple to create it"; Create opens `SignInSheet` and makes the board
  right after the sign-in. An `account_required` answer opens the same sheet.
  A first-time host sees what they're making before being asked.
- **A host who signed in here before** (and has signed out since) is asked up
  front instead: "Sign in before you start?" opens over the first step, with
  "Not now" (asked once a visit, `sessionStorage`
  `jaxsquares.signInFirstAsked`; Create still asks as usual). The device keeps
  only the provider it last signed in with (`jaxsquares.signedInBefore`,
  "apple" or "google", `signedInBeforeWith()` in `src/lib/identity.ts`):
  sign-out keeps it, deleting the account forgets it, and it's never an id,
  name or email.
- **Home**: a "Sign in" button at the top right of the welcome screen and of
  the dashboard (`SignInPill`), on a device that isn't signed in where sign-in
  is set up.
- **Hosts from before the rule**: the host sheet's "Run it from any device"
  (`SignInToHostRow` in `HostSheet.tsx`) signs them in, which puts the board's
  host controls on their account.
- **Players**: never asked before picking. After joining, the "You're in" card
  has "Only on this device for now. Save it to your account"
  (`JoinedCard.tsx`), and the board shows `SignInCard place="board"` under the
  grid to someone holding squares or hosting it, as Home shows it to a device
  with boards. "Remind me in 3 days" snoozes both
  (`jaxsquares.signinCard.snoozedUntil`).

### Rate limits

`auth` (20 per device per hour) and `auth-ip` (60 per address per hour) count
sign-in attempts, sign-outs and deletions (`worker/rateLimit.ts`).

### The Annual Pass (and the Annual Pass + Venue)

The Annual Pass + Venue (docs/payments.md "Annual Pass + Venue") is a `host_passes` row with
`plan` 'club', so everything below holds for it too; its club (`clubs`) joins
the merge and goes with a deleted account (above). `MeResponse.clubPass`
carries it, and buying it on the web needs a sign-in the same way.

Built (docs/payments.md "Annual Pass"): the pass is keyed by the canonical
clientId (`host_passes`, owned by the payments module), so it's the account's
on every device and joins the merge above. `MeResponse.hostPass` carries it.
Buying one on the web requires `SignInSheet` first (`startPassPurchase()` in
`src/lib/useHostPass.ts`), and the server refuses a web subscription for a
device with no account link (409 `account_required`, checked with
`freshLink`, which `worker/auth/index.ts` exports). The iOS app and the test
pass need no account.

## Setup checklist (owner)

Nothing here is a secret except the Sign in with Apple key. Client ids go in
`wrangler.jsonc` → `vars`; the key goes in with `npx wrangler secret put`.
Never paste a key into a chat, an issue or a commit.

### 0. Database

The deploy workflow applies migrations before deploying; by hand:

```bash
npx wrangler d1 migrations apply jaxsquares --remote   # applies 0010_accounts.sql
```

Until it's applied, sign-in answers 500 and everything else works as before.

### 1. Google Cloud (Sign in with Google)

1. console.cloud.google.com → pick or create the project → **APIs & Services
   → OAuth consent screen** (Google Auth Platform → Branding):
   - App name JaxSquares, support email, logo optional.
   - Authorized domain `jaxsquares.com`; home page `https://jaxsquares.com`,
     privacy policy `https://jaxsquares.com/privacy`, terms
     `https://jaxsquares.com/terms`.
   - Scopes: `openid`, `email`, `profile` only (no verification needed).
   - Audience: **External**, then **Publish app** (In production).
2. **Credentials → Create credentials → OAuth client ID → Web application**:
   - Name "JaxSquares web".
   - Authorized JavaScript origins: `https://jaxsquares.com` and
     `https://www.jaxsquares.com` (add `http://localhost:5173` and
     `http://localhost` for local testing).
   - No redirect URIs are needed (Google's button uses a popup).
   - Copy the client id (`…apps.googleusercontent.com`) →
     `GOOGLE_WEB_CLIENT_ID`.
3. **Create credentials → OAuth client ID → iOS**:
   - Bundle ID `com.jaxsquares.app`, your Team ID.
   - Copy the client id → `GOOGLE_IOS_CLIENT_ID`, and note its **iOS URL
     scheme** (the reversed client id, `com.googleusercontent.apps.…`).
4. The iOS app, for Google (needs a new build):
   - Add the reversed client id as a URL scheme in `ios/App/App/Info.plist`,
     as a second entry in `CFBundleURLTypes`:
     ```xml
     <dict>
       <key>CFBundleURLSchemes</key>
       <array><string>com.googleusercontent.apps.REPLACE_ME</string></array>
     </dict>
     ```
   - Build with the same iOS client id:
     `VITE_GOOGLE_IOS_CLIENT_ID=<the iOS client id> npm run ios` (or add
     `VITE_GOOGLE_IOS_CLIENT_ID=…` to a committed `.env.production`; it isn't a
     secret). A build only offers Google when this matches the server's
     `GOOGLE_IOS_CLIENT_ID`: Google's SDK crashes the app if the URL scheme is
     missing, so turning the var on never reaches older builds.

### 2. Apple Developer (Sign in with Apple)

1. developer.apple.com → **Certificates, IDs & Profiles → Identifiers** →
   the App ID `com.jaxsquares.app` → tick **Sign in with Apple** (Enable as a
   primary App ID) → Save. (Xcode's automatic signing also turns it on from
   `App.entitlements`, which now has `com.apple.developer.applesignin`.)
   Native Sign in with Apple needs nothing else: its token audience is the
   bundle id (`APPLE_BUNDLE_ID`, default `com.jaxsquares.app`).
2. For the web: **Identifiers → + → Services IDs**:
   - Description "JaxSquares web", identifier e.g. `com.jaxsquares.web`.
   - Tick **Sign in with Apple → Configure**: primary App ID
     `com.jaxsquares.app`; Domains `jaxsquares.com` (and `www.jaxsquares.com`
     if it serves the app); Return URLs `https://jaxsquares.com/auth/apple`
     (and the `www.` one). Apple JS runs in a popup and posts back to that
     origin; the path never loads.
   - The identifier → `APPLE_SERVICES_ID`.
3. For revocation on account deletion: **Keys → +** → name "JaxSquares Sign in
   with Apple", tick **Sign in with Apple → Configure** (primary App ID
   `com.jaxsquares.app`) → Register → download `AuthKey_XXXXXXXXXX.p8` (only
   once). The Key ID is `APPLE_KEY_ID`. `APPLE_TEAM_ID` is your Team ID
   (Membership), already used for universal links.

### 3. Where each value goes

`wrangler.jsonc` → `vars` (public, committed):

```jsonc
"GOOGLE_WEB_CLIENT_ID": "1234-abc.apps.googleusercontent.com",
"GOOGLE_IOS_CLIENT_ID": "1234-def.apps.googleusercontent.com",
"APPLE_SERVICES_ID": "com.jaxsquares.web"
```

Secrets (run from the repo root; each prompts for the value):

```bash
npx wrangler secret put APPLE_TEAM_ID              # if not set already (universal links use it)
npx wrangler secret put APPLE_KEY_ID               # e.g. ABCDE12345
npx wrangler secret put APPLE_SIGNIN_PRIVATE_KEY < AuthKey_ABCDE12345.p8
```

`APPLE_BUNDLE_ID` stays as it is: payments and universal links already read it
(default `com.jaxsquares.app`). Don't add it to `vars` if it's set as a secret:
Cloudflare refuses a var and a secret with the same name.

Then `npm run deploy`. A provider shows in the app once its id is set:

| | Web | iOS app |
|---|---|---|
| Apple | `APPLE_SERVICES_ID` | always (bundle id) |
| Google | `GOOGLE_WEB_CLIENT_ID` | `GOOGLE_IOS_CLIENT_ID` + a build with `VITE_GOOGLE_IOS_CLIENT_ID` and the URL scheme |

App Store guideline 4.8: the iOS app offers Sign in with Apple wherever it
offers Google, and shows Apple first.

### 4. Check it

```bash
curl -s https://jaxsquares.com/api/config | jq .auth
# { "googleWebClientId": "…", "googleIosClientId": "…", "appleServicesId": "com.jaxsquares.web", "appleNative": true }
npx wrangler tail   # "Sign in with Apple token exchange skipped: … not set" means the key is missing
```

Then sign in on two devices, check both show the same boards, sign out on one
(it goes back to the welcome screen), and delete the account from Profile →
Account.

### Local development

Put the same names in `.dev.vars` (see `.dev.vars.example`). Google's web
client needs `http://localhost:5173` as an authorized origin; Apple JS needs a
real https domain registered on the Services ID, so test Apple on the web
against production or a tunnel.

## Content Security Policy

The Worker sets no CSP (or other security headers that would block it), so
nothing changed there. If one is added later, allow: `script-src`
`https://accounts.google.com/gsi/client` and
`https://appleid.cdn-apple.com`; `frame-src` and `connect-src`
`https://accounts.google.com/gsi/`; `frame-src`/popups `https://appleid.apple.com`.
