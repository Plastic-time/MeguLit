-- SPDX-License-Identifier: GPL-3.0-or-later
-- E377 MeguLit relay schema (Cloudflare D1). Apply: npx wrangler d1 migrations apply megulit-relay --remote

-- Leaderboard: only sha256(install id) is stored, never the id itself.
CREATE TABLE IF NOT EXISTS leaderboard_users (
  id_hash TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  share_games INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
-- period: week | month | all; period_key: 2026-W46 | 2026-11 | all
CREATE TABLE IF NOT EXISTS leaderboard_stats (
  id_hash TEXT NOT NULL,
  period TEXT NOT NULL,
  period_key TEXT NOT NULL,
  characters INTEGER NOT NULL DEFAULT 0,
  seconds INTEGER NOT NULL DEFAULT 0,
  words INTEGER NOT NULL DEFAULT 0,
  streak INTEGER NOT NULL DEFAULT 0,
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (id_hash, period, period_key)
);
CREATE INDEX IF NOT EXISTS stats_by_characters ON leaderboard_stats(period, period_key, characters DESC);
CREATE INDEX IF NOT EXISTS stats_by_seconds ON leaderboard_stats(period, period_key, seconds DESC);
CREATE INDEX IF NOT EXISTS stats_by_words ON leaderboard_stats(period, period_key, words DESC);
CREATE INDEX IF NOT EXISTS stats_by_streak ON leaderboard_stats(period, period_key, streak DESC);
-- Per-game totals, only for users who chose to show the games they read.
CREATE TABLE IF NOT EXISTS leaderboard_games (
  id_hash TEXT NOT NULL,
  game_key TEXT NOT NULL,
  title TEXT NOT NULL,
  characters INTEGER NOT NULL DEFAULT 0,
  seconds INTEGER NOT NULL DEFAULT 0,
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (id_hash, game_key)
);
CREATE INDEX IF NOT EXISTS games_by_key ON leaderboard_games(game_key, characters DESC);

-- Shared adaptation records (megulit.adaptation v1), keyed by the 64-hex game fingerprint key.
CREATE TABLE IF NOT EXISTS adaptation_records (
  key TEXT PRIMARY KEY,
  record TEXT NOT NULL,
  submitter TEXT NOT NULL,
  reports INTEGER NOT NULL DEFAULT 1,
  updated_at INTEGER NOT NULL
);

-- Diagnostics packages: the zip is in R2 under object_key; ip_hash is a salted hash, not the address.
CREATE TABLE IF NOT EXISTS diagnostics (
  id TEXT PRIMARY KEY,
  object_key TEXT NOT NULL,
  issue_url TEXT NOT NULL DEFAULT '',
  ip_hash TEXT NOT NULL,
  size INTEGER NOT NULL,
  sha256 TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL
);

-- Fixed-window rate limits; bucket = kind:subject:window_start.
CREATE TABLE IF NOT EXISTS rate_limits (
  bucket TEXT PRIMARY KEY,
  count INTEGER NOT NULL,
  reset_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS rate_limits_by_reset ON rate_limits(reset_at);
