-- 2026-11-21 Cardinal (relay/src/cardinal.js): a player's MeguLit replays a game's reading layer and scores it; the relay
-- collects the scores and moves an auto diff to verified or into the repair queue. Additive only; no identities.
-- cardinal_scores: one vote per reporter (hashed + salted IP, never stored raw) per exe key and seed rev, newest wins.
--   seed_rev '' = the app sent null; scores = {row,stable,clean,clear,choice,pair,leak} as JSON.
-- cardinal_status: the verdict for one exe key and seed rev: 'verified' | 'repair' | 'open'. Only a status: the signature
--   stays offline, the relay holds no private key. upgraded_at / repaired_at = when it last became verified / was queued.
CREATE TABLE IF NOT EXISTS cardinal_scores (
  game_key TEXT NOT NULL,
  seed_rev TEXT NOT NULL DEFAULT '',
  reporter TEXT NOT NULL,
  source TEXT NOT NULL,
  total REAL NOT NULL,
  scores TEXT NOT NULL,
  lines INTEGER NOT NULL,
  app TEXT NOT NULL DEFAULT '',
  cardinal_rev TEXT NOT NULL DEFAULT '',
  scored_at INTEGER NOT NULL,
  received_at INTEGER NOT NULL,
  PRIMARY KEY (game_key, seed_rev, reporter)
);
CREATE INDEX IF NOT EXISTS cardinal_scores_received ON cardinal_scores(received_at);
CREATE TABLE IF NOT EXISTS cardinal_status (
  game_key TEXT NOT NULL,
  seed_rev TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'open',
  voters INTEGER NOT NULL DEFAULT 0,
  mean REAL NOT NULL DEFAULT 0,
  lowest REAL NOT NULL DEFAULT 0,
  upgraded_at INTEGER,
  repaired_at INTEGER,
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (game_key, seed_rev)
);
CREATE INDEX IF NOT EXISTS cardinal_status_state ON cardinal_status(status, updated_at);
