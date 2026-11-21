-- 2026-11-21 game diffs (docs/auto-profile.md, relay/src/auto-profile.js). Two layers:
--   version: key = the 64 hex SHA-256 of one exe build
--   game:    key = a game identity (64 hex), every build of the game; which prints (main archive, script, Steam, VNDB, title)
--            belong to it is kept in diff_prints, so a report that brings one known print joins the same game.
-- auto_profile_reports: one calibration / self-check result per exe and reporter (hashed IP), newest wins, at most 50 per exe;
--   gid = the game identity it was filed under, prints = its fingerprints (core/game-print.cjs check).
-- auto_profile_picks: the agreed best report per layer and key, unsigned, waiting for our offline signing tool.
-- game_diffs: the signed documents handed out, one per layer, key and source ('official' made by us, 'auto' = a signed pick).
-- diff_prints: fingerprint -> layer key (exe/head/pe -> version key; pack/script/steam/vndb/title -> game key); first one wins.
-- auto_profile_queue: exes whose self-check stepped a game down (the repair queue).
-- profile_runtime: runtime samples sent on their own (R2 profile-runtime/<key>.json.gz).
-- The relay holds no private key.
CREATE TABLE IF NOT EXISTS auto_profile_reports (
  game_key TEXT NOT NULL,
  reporter TEXT NOT NULL,
  gid TEXT NOT NULL DEFAULT '',
  prints TEXT NOT NULL DEFAULT '{}',
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
CREATE INDEX IF NOT EXISTS auto_profile_reports_gid ON auto_profile_reports(gid, updated_at);
CREATE TABLE IF NOT EXISTS auto_profile_picks (
  layer TEXT NOT NULL,
  game_key TEXT NOT NULL,
  stamp TEXT NOT NULL,
  body TEXT NOT NULL,
  rev INTEGER NOT NULL DEFAULT 1,
  updated_at INTEGER NOT NULL,
  signed_stamp TEXT NOT NULL DEFAULT '',
  PRIMARY KEY (layer, game_key)
);
CREATE TABLE IF NOT EXISTS game_diffs (
  layer TEXT NOT NULL,
  game_key TEXT NOT NULL,
  source TEXT NOT NULL,
  body TEXT NOT NULL,
  rev INTEGER NOT NULL DEFAULT 0,
  updated_at INTEGER NOT NULL,
  withdrawn_at INTEGER,
  PRIMARY KEY (layer, game_key, source)
);
CREATE TABLE IF NOT EXISTS diff_prints (
  kind TEXT NOT NULL,
  value TEXT NOT NULL,
  layer TEXT NOT NULL,
  game_key TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (kind, value, layer)
);
CREATE INDEX IF NOT EXISTS diff_prints_key ON diff_prints(layer, game_key);
CREATE TABLE IF NOT EXISTS auto_profile_queue (
  game_key TEXT PRIMARY KEY,
  gid TEXT NOT NULL DEFAULT '',
  prints TEXT NOT NULL DEFAULT '{}',
  exe TEXT NOT NULL DEFAULT '',
  engine TEXT NOT NULL DEFAULT '',
  reasons TEXT NOT NULL DEFAULT '[]',
  note TEXT NOT NULL DEFAULT '',
  kind TEXT NOT NULL DEFAULT 'broken',
  reporters INTEGER NOT NULL DEFAULT 1,
  app TEXT NOT NULL DEFAULT '',
  first_at INTEGER NOT NULL,
  last_at INTEGER NOT NULL,
  closed_at INTEGER
);
CREATE TABLE IF NOT EXISTS profile_runtime (
  game_key TEXT PRIMARY KEY,
  identity TEXT NOT NULL DEFAULT '',
  gid TEXT NOT NULL DEFAULT '',
  prints TEXT NOT NULL DEFAULT '{}',
  sha256 TEXT NOT NULL,
  size INTEGER NOT NULL,
  reporters INTEGER NOT NULL DEFAULT 1,
  updated_at INTEGER NOT NULL
);
