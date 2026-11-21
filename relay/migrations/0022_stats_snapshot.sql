-- 2026-11-21 dashboard D1 reads (relay/src/probe-stats.js): the computed live / wide stats are kept here so one compute
-- per TTL serves every relay node and every open dashboard (the Cache API is per data centre). Aggregates only.
CREATE TABLE IF NOT EXISTS stats_snapshot (
  key TEXT PRIMARY KEY,
  data TEXT NOT NULL,
  at INTEGER NOT NULL
);
