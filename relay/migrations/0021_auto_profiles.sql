-- 2026-11-21 auto game diffs (docs/auto-profile.md): one calibration / self-check result per game and reporter (hashed IP),
-- newest wins; GET /api/auto-profile/<key> picks the agreed best one (relay/src/auto-profile.js)
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
