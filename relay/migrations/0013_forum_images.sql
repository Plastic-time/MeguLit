-- SPDX-License-Identifier: GPL-3.0-or-later
-- 2026-11-12 (user: posts and replies can carry pictures, uploaded, pasted or dropped). relay/src/forum.js.
-- A picture is checked by the vision model when it is uploaded and stored in R2 (forum/<id>.webp) only when it passes.
-- post_id stays '' until a post or reply that names it is published; unattached ones are removed after a day.
CREATE TABLE IF NOT EXISTS forum_images (
  id         TEXT PRIMARY KEY,
  author     TEXT NOT NULL,
  post_id    TEXT NOT NULL DEFAULT '',
  width      INTEGER NOT NULL DEFAULT 0,
  height     INTEGER NOT NULL DEFAULT 0,
  bytes      INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS forum_images_post ON forum_images(post_id, created_at);
CREATE INDEX IF NOT EXISTS forum_images_author ON forum_images(author, created_at);
ALTER TABLE forum_posts ADD COLUMN images TEXT NOT NULL DEFAULT '';
ALTER TABLE forum_replies ADD COLUMN images TEXT NOT NULL DEFAULT '';
