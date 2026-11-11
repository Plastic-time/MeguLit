-- SPDX-License-Identifier: GPL-3.0-or-later
-- #117 交流 board (relay/src/forum.js). Applies after 0009. Anyone can read; only signed-in accounts write.
-- author is the account's leaderboard id hash (sha256('account:'+id)); name is a snapshot of the shown name.
-- deleted: 0 = visible, 1 = removed by its author, 2 = removed by the maintainer. Removed rows keep no text.
CREATE TABLE IF NOT EXISTS forum_posts (
  id         TEXT PRIMARY KEY,
  author     TEXT NOT NULL,
  name       TEXT NOT NULL,
  title      TEXT NOT NULL,
  body       TEXT NOT NULL,
  tag        TEXT NOT NULL,
  game_key   TEXT NOT NULL DEFAULT '',
  game_title TEXT NOT NULL DEFAULT '',
  engine     TEXT NOT NULL DEFAULT '',
  replies    INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  active_at  INTEGER NOT NULL,
  deleted    INTEGER NOT NULL DEFAULT 0,
  ip_hash    TEXT NOT NULL DEFAULT ''
);
CREATE INDEX IF NOT EXISTS forum_posts_active ON forum_posts(deleted, active_at DESC);
CREATE INDEX IF NOT EXISTS forum_posts_game ON forum_posts(game_key, deleted, active_at DESC);
CREATE INDEX IF NOT EXISTS forum_posts_author ON forum_posts(author);

CREATE TABLE IF NOT EXISTS forum_replies (
  id         TEXT PRIMARY KEY,
  post_id    TEXT NOT NULL,
  author     TEXT NOT NULL,
  name       TEXT NOT NULL,
  body       TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  deleted    INTEGER NOT NULL DEFAULT 0,
  ip_hash    TEXT NOT NULL DEFAULT ''
);
CREATE INDEX IF NOT EXISTS forum_replies_post ON forum_replies(post_id, created_at);
CREATE INDEX IF NOT EXISTS forum_replies_author ON forum_replies(author);
