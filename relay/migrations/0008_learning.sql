-- SPDX-License-Identifier: GPL-3.0-or-later
-- E401 learning metrics on the leaderboard: word reviews (MeguLit reviews and Anki reviews) and kana practice
-- (questions answered in the kana games). Older clients do not send them; they stay 0. Applies after 0007.
ALTER TABLE leaderboard_stats ADD COLUMN reviews INTEGER NOT NULL DEFAULT 0;
ALTER TABLE leaderboard_stats ADD COLUMN kana INTEGER NOT NULL DEFAULT 0;
CREATE INDEX IF NOT EXISTS stats_by_reviews ON leaderboard_stats(period, period_key, reviews DESC);
CREATE INDEX IF NOT EXISTS stats_by_kana ON leaderboard_stats(period, period_key, kana DESC);
