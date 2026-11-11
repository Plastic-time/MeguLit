-- SPDX-License-Identifier: GPL-3.0-or-later
-- 2026-11-12 转职: each reader's chosen element (fire, ice, thunder, wind, water, earth, light, dark; '' = none yet)
-- and their level, sent with the leaderboard submission and shown next to their name on the board.
ALTER TABLE leaderboard_users ADD COLUMN element TEXT NOT NULL DEFAULT '';
ALTER TABLE leaderboard_users ADD COLUMN level INTEGER NOT NULL DEFAULT 0;
