CREATE TABLE enhanced_seed_jobs (
  id TEXT PRIMARY KEY REFERENCES seed_admin_items(id),
  candidate TEXT NOT NULL,
  state TEXT NOT NULL DEFAULT 'pending' CHECK(state IN ('pending','retained','published')),
  lease TEXT,
  available_at INTEGER NOT NULL DEFAULT 0,
  attempts INTEGER NOT NULL DEFAULT 0,
  proposal TEXT,
  reason TEXT
);
CREATE TRIGGER enhanced_pause AFTER UPDATE OF enabled ON ordinary_publish_policy
WHEN NEW.enabled=0 BEGIN
 UPDATE enhanced_seed_jobs SET lease=NULL,available_at=0 WHERE state='pending';
END;
CREATE INDEX enhanced_proposal_hash ON enhanced_seed_jobs(json_extract(proposal,'$.review.candidateHash')) WHERE proposal IS NOT NULL;
CREATE TRIGGER enhanced_pause_publish BEFORE INSERT ON torch_release_history
WHEN (SELECT enabled FROM ordinary_publish_policy WHERE id=1)=0
 AND EXISTS(SELECT 1 FROM enhanced_seed_jobs WHERE state='pending' AND proposal IS NOT NULL
   AND json_extract(proposal,'$.review.candidateHash')=NEW.profile_hash)
BEGIN SELECT RAISE(ABORT,'ENHANCED_PUBLISH_PAUSED'); END;
CREATE TRIGGER enhanced_history AFTER INSERT ON torch_release_history
WHEN json_extract(NEW.body,'$.action')='promote' BEGIN
 UPDATE enhanced_seed_jobs SET state='published',lease=NULL
 WHERE state='pending' AND proposal IS NOT NULL AND json_extract(proposal,'$.review.candidateHash')=NEW.profile_hash;
END;
CREATE INDEX enhanced_seed_ready ON enhanced_seed_jobs(state,available_at,id);
CREATE TABLE enhanced_seed_host (id INTEGER PRIMARY KEY CHECK(id=1),seen_at INTEGER NOT NULL);
