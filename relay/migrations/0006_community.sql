-- SPDX-License-Identifier: GPL-3.0-or-later
-- E379 leaderboard avatars (moderated) and weekly hot-lookup awards (relay/src/community.js). Applies after 0005.

-- One avatar per leaderboard id hash. status: pending (being checked, never served) | approved | rejected | hidden (reported).
CREATE TABLE IF NOT EXISTS avatars (
  id_hash TEXT PRIMARY KEY,
  avatar_id TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL,
  reason TEXT NOT NULL DEFAULT '',
  reports INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  reviewed_at INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS avatars_by_status ON avatars(status);
-- reporter = id hash of a joined user, or a salted IP hash
CREATE TABLE IF NOT EXISTS avatar_reports (
  avatar_id TEXT NOT NULL,
  reporter TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (avatar_id, reporter)
);
-- Items waiting for a human (README: "Moderation queue").
CREATE TABLE IF NOT EXISTS moderation_queue (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  kind TEXT NOT NULL,
  subject TEXT NOT NULL,
  reason TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  resolved_at INTEGER NOT NULL DEFAULT 0
);

-- Raw weekly lookup counts per joined user (term + count only). Deleted once the week is settled.
CREATE TABLE IF NOT EXISTS hot_lookups (
  week_key TEXT NOT NULL,
  id_hash TEXT NOT NULL,
  term TEXT NOT NULL,
  count INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (week_key, id_hash, term)
);
CREATE INDEX IF NOT EXISTS hot_lookups_by_term ON hot_lookups(week_key, term);
-- Frozen results. category: word | phrase | sentence; reason_ai = 1 when the reason is an AI guess.
CREATE TABLE IF NOT EXISTS hot_awards (
  week_key TEXT NOT NULL,
  category TEXT NOT NULL,
  rank INTEGER NOT NULL,
  term TEXT NOT NULL,
  users INTEGER NOT NULL,
  lookups INTEGER NOT NULL,
  reason TEXT NOT NULL DEFAULT '',
  reason_ai INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (week_key, category, rank)
);
CREATE TABLE IF NOT EXISTS hot_weeks (
  week_key TEXT PRIMARY KEY,
  settled_at INTEGER NOT NULL,
  participants INTEGER NOT NULL
);
