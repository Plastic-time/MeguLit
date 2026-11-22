-- Signed publication history. Names remain in torch_credits and are resolved at read time.
CREATE TABLE IF NOT EXISTS torch_release_history (
 hash TEXT PRIMARY KEY, game_key TEXT NOT NULL, revision INTEGER NOT NULL,
 previous_hash TEXT, profile_hash TEXT NOT NULL, body TEXT NOT NULL,
 published_at TEXT NOT NULL, UNIQUE(game_key, revision)
);
CREATE TABLE IF NOT EXISTS torch_release_winners (game_key TEXT PRIMARY KEY, hash TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS torch_release_pending (
 hash TEXT PRIMARY KEY, game_key TEXT NOT NULL, previous_hash TEXT, body TEXT NOT NULL, created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS torch_release_revocations (profile_hash TEXT PRIMARY KEY, revoked_at TEXT NOT NULL, body TEXT NOT NULL);
