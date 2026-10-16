-- Push notifications: one row per device subscription (a web push endpoint or an
-- FCM registration token), plus per-game mutes. Devices are anonymous: they are
-- keyed by the same clientId the rest of the app uses.

CREATE TABLE push_subscriptions (
  endpoint_or_token TEXT PRIMARY KEY,               -- web push endpoint URL, or FCM token (ios/android)
  client_id         TEXT NOT NULL,
  platform          TEXT NOT NULL CHECK (platform IN ('web', 'ios', 'android')),
  p256dh            TEXT,                           -- web only: subscription public key (base64url)
  auth              TEXT,                           -- web only: subscription auth secret (base64url)
  unread            INTEGER NOT NULL DEFAULT 0,     -- pushes since the device last opened the app; drives the badge
  created_at        INTEGER NOT NULL,
  updated_at        INTEGER NOT NULL,               -- last (re-)registration, i.e. last app open
  last_ok_at        INTEGER                         -- last push the service accepted
);

CREATE INDEX idx_push_subscriptions_client ON push_subscriptions(client_id, updated_at);

CREATE TABLE game_mutes (
  game_id    TEXT NOT NULL,
  client_id  TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (game_id, client_id),
  FOREIGN KEY (game_id) REFERENCES games(id) ON DELETE CASCADE
);
