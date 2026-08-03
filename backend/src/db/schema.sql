-- D1 (SQLite) schema.
-- The pixel grid itself is NOT here: it lives in the CanvasEconomy Durable
-- Object's own SQLite storage, so that pixel writes and credit debits can
-- be serialized together. See src/do/CanvasEconomy.js.

CREATE TABLE IF NOT EXISTS users (
  id             TEXT PRIMARY KEY,
  email          TEXT UNIQUE,
  password_hash  TEXT,
  pseudo         TEXT NOT NULL,
  avatar         TEXT NOT NULL,
  credits        INTEGER NOT NULL DEFAULT 100,
  pixels_placed  INTEGER NOT NULL DEFAULT 0,
  created_at     INTEGER NOT NULL,
  last_seen_at   INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS sessions (
  id         TEXT PRIMARY KEY,
  user_id    TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS achievements (
  id              TEXT PRIMARY KEY,
  code            TEXT UNIQUE NOT NULL,
  name            TEXT NOT NULL,
  description     TEXT NOT NULL,
  icon            TEXT NOT NULL,
  condition_type  TEXT NOT NULL,
  condition_value INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS user_achievements (
  user_id        TEXT NOT NULL,
  achievement_id TEXT NOT NULL,
  unlocked_at    INTEGER NOT NULL,
  PRIMARY KEY (user_id, achievement_id)
);

CREATE TABLE IF NOT EXISTS events (
  id             TEXT PRIMARY KEY,
  code           TEXT UNIQUE NOT NULL,
  name           TEXT NOT NULL,
  description    TEXT NOT NULL,
  config         TEXT NOT NULL,
  schedule_cron  TEXT NOT NULL,
  active         INTEGER NOT NULL DEFAULT 1,
  last_run_at    INTEGER
);

CREATE TABLE IF NOT EXISTS ip_signups (
  ip     TEXT NOT NULL,
  period TEXT NOT NULL,
  count  INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (ip, period)
);

-- One row per device token that has ever been used to create an account.
-- The token itself is a random UUID generated client-side and stored in
-- localStorage (see frontend/src/device.js), so it survives across tabs and
-- sessions but not across browsers/devices or a cleared localStorage. Used
-- together with the per-IP cap in ip_signups: registration is blocked if
-- EITHER limit is hit.
CREATE TABLE IF NOT EXISTS device_signups (
  device_token TEXT PRIMARY KEY,
  user_id      TEXT NOT NULL,
  created_at   INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
