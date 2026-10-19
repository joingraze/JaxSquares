-- The Club Pass (docs/payments.md "Club Pass"): a yearly plan for bars,
-- booster clubs, offices and fundraisers that run boards every week. It's a
-- Host Pass with more in it, so it lives in the same table: a row's `plan`
-- says which one it is. Nothing here is ever between players.

-- 'host': the Host Pass (every row before this migration).
-- 'club': the Club Pass. It covers the host fee like the Host Pass
--         (activePass counts both), and while it's active the holder's boards
--         carry the club's branding, take up to 10 co-hosts and can export a
--         players CSV; the club gets a TV link that rotates its boards.
-- Owned by the payments module (worker/payments/store.ts). A web pass's plan
-- follows its Stripe Price (STRIPE_CLUB_PASS_PRICE_ID), re-read on every
-- webhook, so a plan change in Stripe lands here too.
ALTER TABLE host_passes ADD COLUMN plan TEXT NOT NULL DEFAULT 'host' CHECK (plan IN ('host', 'club'));

-- A Club Pass holder's club: its name, logo and TV link. Owned by the clubs
-- module: only worker/clubs/store.ts queries it.
--
-- `owner_client_id` is the holder's canonical clientId (c.get("clientId"), the
-- account's when signed in; buying the pass on the web needs a sign-in). Like
-- every clientId column it never leaves the server: the public state carries
-- the club's own random `id` (Game.club), never who owns it. Signing in on
-- another device moves that device's club here in the sign-in merge
-- (docs/auth.md); deleting the account deletes the club (its name and logo go
-- with the account).
CREATE TABLE IF NOT EXISTS clubs (
  id              TEXT PRIMARY KEY,                 -- random, public: /api/clubs/<id>/logo, /club/<id>/tv
  owner_client_id TEXT NOT NULL UNIQUE,             -- the holder (see above); one club per identity
  name            TEXT NOT NULL DEFAULT '',         -- '' until the holder names it (nothing is shown then)
  -- The logo the holder's browser resized to at most 256x256 and re-encoded
  -- (WebP, or PNG where the browser can't make WebP), under 60 KB, checked by
  -- type, magic bytes, dimensions and size before it's stored. Base64.
  logo            TEXT,
  logo_type       TEXT CHECK (logo_type IN ('image/webp', 'image/png')),
  logo_etag       TEXT,                             -- SHA-256 of the bytes (16 hex): the ETag and the URL's ?v=
  -- SHA-256 (hex) of the TV link's token (/club/<id>/tv#k=<token>). Only the
  -- hash is kept; the holder rotates the token to cut off an old link.
  tv_token_hash   TEXT,
  created_at      INTEGER NOT NULL,
  updated_at      INTEGER NOT NULL
);
