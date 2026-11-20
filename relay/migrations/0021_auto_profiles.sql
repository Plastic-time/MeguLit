-- 2026-11-21 game diffs (docs/auto-profile.md, relay/src/auto-profile.js). Keys are 'x-' + 40 hex of the game exe's SHA-256.
-- auto_profile_reports: one calibration / self-check result per exe and reporter (hashed IP), newest wins, at most 50 per exe.
-- game_diffs: the one signed document handed out per exe and source ('official' from the maintainer, 'auto' = the agreed
-- best report, signed by the relay); official wins.
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
