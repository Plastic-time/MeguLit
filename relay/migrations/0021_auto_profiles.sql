-- 2026-11-21 game diffs (docs/auto-profile.md, relay/src/auto-profile.js). Keys are the 64 hex of the game exe's SHA-256.
-- auto_profile_reports: one calibration / self-check result per exe and reporter (hashed IP), newest wins, at most 50 per exe.
-- auto_profile_picks: the agreed best report per exe, unsigned, waiting for our offline signing tool (tools/sign-profile.cjs).
-- game_diffs: the one signed document handed out per exe and source ('official' made by us from a probe, 'auto' = a signed
-- pick); official wins. The relay holds no private key.
-- auto_profile_queue: exes whose self-check stepped a game down (the repair queue), one row per exe.
CREATE TABLE IF NOT EXISTS auto_profile_reports (
  game_key TEXT NOT NULL,
  reporter TEXT NOT NULL,
  settings_hash TEXT NOT NULL,
  settings TEXT NOT NULL,
  mode TEXT NOT NULL,
  source TEXT NOT NULL DEFAULT 'calibration',
  cost REAL NOT NULL DEFAULT 0,
  metrics TEXT NOT NULL DEFAULT '{}',
  engine TEXT NOT NULL DEFAULT '',
  exe TEXT NOT NULL DEFAULT '',
  app TEXT NOT NULL DEFAULT '',
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (game_key, reporter)
);
CREATE INDEX IF NOT EXISTS auto_profile_reports_key ON auto_profile_reports(game_key, updated_at);
CREATE TABLE IF NOT EXISTS auto_profile_picks (
  game_key TEXT PRIMARY KEY,
  stamp TEXT NOT NULL,
  body TEXT NOT NULL,
  updated_at INTEGER NOT NULL,
  signed_stamp TEXT NOT NULL DEFAULT ''
);
CREATE TABLE IF NOT EXISTS game_diffs (
  game_key TEXT NOT NULL,
  source TEXT NOT NULL,
  body TEXT NOT NULL,
  settings_hash TEXT NOT NULL DEFAULT '',
  updated_at INTEGER NOT NULL,
  withdrawn_at INTEGER,
  PRIMARY KEY (game_key, source)
);
CREATE TABLE IF NOT EXISTS auto_profile_queue (
  game_key TEXT PRIMARY KEY,
  exe TEXT NOT NULL DEFAULT '',
  engine TEXT NOT NULL DEFAULT '',
  reasons TEXT NOT NULL DEFAULT '[]',
  reporters INTEGER NOT NULL DEFAULT 1,
  app TEXT NOT NULL DEFAULT '',
  first_at INTEGER NOT NULL,
  last_at INTEGER NOT NULL,
  closed_at INTEGER
);
-- runtime samples sent on their own (an exe whose full probe the relay already holds): one gzip bundle per exe in R2 under
-- profile-runtime/<key>.json.gz (services/runtime-sample.cjs bundle), the newest wins
CREATE TABLE IF NOT EXISTS profile_runtime (
  game_key TEXT PRIMARY KEY,
  identity TEXT NOT NULL DEFAULT '',
  sha256 TEXT NOT NULL,
  size INTEGER NOT NULL,
  reporters INTEGER NOT NULL DEFAULT 1,
  updated_at INTEGER NOT NULL
);
