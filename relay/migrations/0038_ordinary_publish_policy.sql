CREATE TABLE ordinary_publish_policy (
 id INTEGER PRIMARY KEY CHECK (id=1),
 enabled INTEGER NOT NULL CHECK (enabled IN (0,1)),
 revision INTEGER NOT NULL CHECK (revision>=1),
 changed_at INTEGER
);
INSERT INTO ordinary_publish_policy VALUES (1,1,1,NULL);

-- A scan started before a pause cannot publish after a subsequent resume.
CREATE TRIGGER ordinary_pause_leases AFTER UPDATE OF enabled ON ordinary_publish_policy
WHEN NEW.enabled=0 AND OLD.enabled=1 BEGIN
 UPDATE ordinary_seed_jobs SET lease=NULL,retry_at=0 WHERE state='pending' AND lease IS NOT NULL;
END;

-- Also fence alternative/older writers at the database boundary. Withdrawals still work.
CREATE TRIGGER ordinary_pause_insert BEFORE INSERT ON game_diffs
WHEN NEW.withdrawn_at IS NULL AND json_extract(NEW.body,'$.signature.keyId') GLOB 'ordinary-*'
 AND (SELECT enabled FROM ordinary_publish_policy WHERE id=1)=0 BEGIN
 SELECT RAISE(ABORT,'ORDINARY_PUBLISH_PAUSED');
END;
CREATE TRIGGER ordinary_pause_update BEFORE UPDATE ON game_diffs
WHEN NEW.withdrawn_at IS NULL AND json_extract(NEW.body,'$.signature.keyId') GLOB 'ordinary-*'
 AND (SELECT enabled FROM ordinary_publish_policy WHERE id=1)=0 BEGIN
 SELECT RAISE(ABORT,'ORDINARY_PUBLISH_PAUSED');
END;
