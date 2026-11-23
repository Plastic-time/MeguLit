-- The report identity already includes executable, script, mode and canonical settings.
ALTER TABLE ordinary_seed_jobs ADD COLUMN seed_id TEXT REFERENCES seed_admin_items(id);
CREATE UNIQUE INDEX ordinary_seed_identity ON ordinary_seed_jobs(seed_id);

-- Compare JSON paths and typed values independent of object property order.
CREATE VIEW ordinary_seed_report_match AS
SELECT j.id AS job_id, i.id AS seed_id
FROM ordinary_seed_jobs j JOIN seed_admin_items i ON i.game_key=j.game_key
 AND i.kind='report' AND i.layer='version'
 AND json_extract(i.body,'$.mode')=json_extract(j.candidate,'$.mode')
 AND json_extract(i.body,'$.script') IS json_extract(j.candidate,'$.prints.script')
WHERE NOT EXISTS (
 SELECT fullkey,type,atom FROM json_tree(i.body,'$.settings')
 EXCEPT SELECT fullkey,type,atom FROM json_tree(j.candidate,'$.settings')
) AND NOT EXISTS (
 SELECT fullkey,type,atom FROM json_tree(j.candidate,'$.settings')
 EXCEPT SELECT fullkey,type,atom FROM json_tree(i.body,'$.settings')
);
UPDATE ordinary_seed_jobs SET seed_id=(SELECT seed_id FROM ordinary_seed_report_match WHERE job_id=ordinary_seed_jobs.id);
-- Also links uploads from a previous Worker during rollout or rollback.
CREATE TRIGGER ordinary_seed_link AFTER INSERT ON ordinary_seed_jobs WHEN NEW.seed_id IS NULL BEGIN
 UPDATE ordinary_seed_jobs SET seed_id=(SELECT seed_id FROM ordinary_seed_report_match WHERE job_id=NEW.id) WHERE id=NEW.id;
END;

-- One durable first-availability record across both signed representations.
CREATE TABLE seed_deliveries(seed_id TEXT PRIMARY KEY);
INSERT OR IGNORE INTO seed_deliveries SELECT coalesce(seed_id,id) FROM ordinary_seed_jobs WHERE state IN ('published','blocked');
INSERT OR IGNORE INTO seed_deliveries SELECT id FROM enhanced_seed_jobs WHERE state='published';
CREATE TRIGGER seed_delivery_link AFTER UPDATE OF seed_id ON ordinary_seed_jobs
WHEN OLD.seed_id IS NULL AND NEW.seed_id IS NOT NULL AND EXISTS(SELECT 1 FROM seed_deliveries WHERE seed_id=OLD.id) BEGIN
 INSERT OR IGNORE INTO seed_deliveries VALUES(NEW.seed_id);
 DELETE FROM seed_deliveries WHERE seed_id=OLD.id AND OLD.id<>NEW.seed_id;
END;
CREATE TRIGGER seed_deliver_scan AFTER UPDATE OF state ON ordinary_seed_jobs WHEN NEW.state='published' BEGIN
 INSERT OR IGNORE INTO seed_deliveries VALUES(coalesce(NEW.seed_id,NEW.id));
END;
CREATE TRIGGER seed_deliver_review AFTER UPDATE OF state ON enhanced_seed_jobs WHEN NEW.state='published' BEGIN
 INSERT OR IGNORE INTO seed_deliveries VALUES(NEW.id);
END;

CREATE VIEW seed_lifecycle AS
SELECT i.id, i.game_key, i.state AS report_state, j.state AS scan, e.state AS review,
 j.revision AS scan_rev, j.profile_hash AS scan_hash, json_extract(e.proposal,'$.review.candidateHash') AS review_hash
FROM seed_admin_items i LEFT JOIN ordinary_seed_jobs j ON j.seed_id=i.id
 LEFT JOIN enhanced_seed_jobs e ON e.id=i.id WHERE i.kind='report'
UNION ALL
SELECT id, game_key, NULL, state, NULL, revision, profile_hash, NULL FROM ordinary_seed_jobs WHERE seed_id IS NULL;

CREATE VIEW seed_lifecycle_block AS
SELECT id, CASE WHEN scan='quarantined' OR EXISTS (
 SELECT 1 FROM seed_malware_current WHERE state='infected' AND profile_hash IN (scan_hash,review_hash)
) THEN 'quarantined' ELSE 'withdrawn' END AS reason FROM seed_lifecycle
WHERE report_state='deleted' OR scan IN ('quarantined','blocked') OR EXISTS (
 SELECT 1 FROM torch_release_revocations WHERE profile_hash IN (scan_hash,review_hash)
) OR EXISTS (SELECT 1 FROM seed_malware_current WHERE state='infected' AND profile_hash IN (scan_hash,review_hash));
