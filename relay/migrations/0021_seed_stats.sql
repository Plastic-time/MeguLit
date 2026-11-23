-- 2026-11-21 THE SEED panel on the live dashboard (relay/src/seed-stats.js). One row per seed source: 'github' = the
-- repository's "The Seed/" folder (refreshed by the 30-minute cron), later 'community' = seeds the relay stores itself.
-- data is the aggregate only: {games,versions,status:{verified,owner-ok,read,skeleton},rev}. No identities.
CREATE TABLE IF NOT EXISTS seed_stats (
  source TEXT PRIMARY KEY,
  data TEXT NOT NULL,
  at INTEGER NOT NULL
);
