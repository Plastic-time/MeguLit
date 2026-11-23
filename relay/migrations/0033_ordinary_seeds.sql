CREATE TABLE ordinary_seed_jobs (
  id TEXT PRIMARY KEY,
  game_key TEXT NOT NULL,
  revision INTEGER NOT NULL,
  candidate TEXT NOT NULL,
  issued_at TEXT NOT NULL,
  state TEXT NOT NULL DEFAULT 'pending' CHECK(state IN ('pending','published','quarantined','superseded','blocked')),
  retry_at INTEGER NOT NULL DEFAULT 0,
  retry_reason TEXT,
  lease TEXT,
  scan TEXT,
  profile_hash TEXT,
  UNIQUE(game_key, revision)
);
CREATE INDEX ordinary_seed_due ON ordinary_seed_jobs(state, retry_at);
CREATE UNIQUE INDEX ordinary_seed_profile ON ordinary_seed_jobs(profile_hash);

-- Part of the same D1 transaction as publication or withdrawal.
CREATE TRIGGER ordinary_change_status AFTER UPDATE OF state ON ordinary_seed_jobs
WHEN (OLD.state='pending' AND NEW.state='published') OR (OLD.state='published' AND NEW.state='blocked')
BEGIN
  INSERT INTO torch_changes(game_key) VALUES (NEW.game_key);
END;
CREATE TRIGGER ordinary_change_revoke AFTER INSERT ON torch_release_revocations
BEGIN
  UPDATE ordinary_seed_jobs SET state='blocked' WHERE profile_hash=NEW.profile_hash AND state='published';
END;
