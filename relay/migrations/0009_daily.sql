-- SPDX-License-Identifier: GPL-3.0-or-later
-- E415 每日 page: cached Galgame news and daily hot words (relay/src/daily.js). One row per kind per Japan date.
CREATE TABLE IF NOT EXISTS daily_cache (
  kind TEXT NOT NULL,
  day TEXT NOT NULL,
  payload TEXT NOT NULL,
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (kind, day)
);
