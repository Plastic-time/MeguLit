-- SPDX-License-Identifier: GPL-3.0-or-later
-- E397 public profiles, follows and 同好 (relay/src/social.js). Applies after 0006.

-- When each shared game was last read (unix seconds; 0 = unknown). Sent only by readers who share game titles.
ALTER TABLE leaderboard_games ADD COLUMN last_at INTEGER NOT NULL DEFAULT 0;

-- One profile per leaderboard id hash (always an account: profiles need a signed-in account). pid is a random public
-- handle, handed out only while public=1, so a private reader can never be looked up or followed.
CREATE TABLE IF NOT EXISTS profiles (
  id_hash    TEXT PRIMARY KEY,
  pid        TEXT NOT NULL UNIQUE,
  bio        TEXT NOT NULL DEFAULT '',
  public     INTEGER NOT NULL DEFAULT 0,
  -- 1 = reported and hidden until the maintainer reviews it (social.js profileReport); counts as private everywhere
  hidden     INTEGER NOT NULL DEFAULT 0,
  updated_at INTEGER NOT NULL
);

-- Up to five favourite games, in the order the reader chose. vndb: 'v123' or ''.
CREATE TABLE IF NOT EXISTS profile_favorites (
  id_hash  TEXT NOT NULL,
  pos      INTEGER NOT NULL,
  game_key TEXT NOT NULL,
  title    TEXT NOT NULL,
  vndb     TEXT NOT NULL DEFAULT '',
  PRIMARY KEY (id_hash, pos)
);
CREATE INDEX IF NOT EXISTS favorites_by_key ON profile_favorites(game_key);

-- follower and followee are id hashes; at most 500 follows per reader (social.js).
CREATE TABLE IF NOT EXISTS follows (
  follower   TEXT NOT NULL,
  followee   TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (follower, followee)
);
CREATE INDEX IF NOT EXISTS follows_by_followee ON follows(followee);

-- Profile reports: one per reporter and profile. kind: discrimination | nudity | racism | harassment | spam | other.
-- reason is optional free text (up to 500 characters). issue_url: the issue in the private REPORT_REPO, if any.
CREATE TABLE IF NOT EXISTS profile_reports (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  target     TEXT NOT NULL,
  reporter   TEXT NOT NULL,
  kind       TEXT NOT NULL,
  reason     TEXT NOT NULL DEFAULT '',
  issue_url  TEXT NOT NULL DEFAULT '',
  created_at INTEGER NOT NULL,
  UNIQUE (target, reporter)
);
