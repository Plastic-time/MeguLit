-- Additive control plane. No old reports, signatures, winners or credits are changed.
CREATE TABLE IF NOT EXISTS seed_admin_meta (name TEXT PRIMARY KEY, value TEXT NOT NULL);
INSERT OR IGNORE INTO seed_admin_meta VALUES('coverage_since',strftime('%Y-%m-%dT%H:%M:%fZ','now'));
CREATE TABLE IF NOT EXISTS seed_admin_items (
 id TEXT PRIMARY KEY, kind TEXT NOT NULL, layer TEXT NOT NULL, game_key TEXT NOT NULL,
 seed_rev TEXT, settings_hash TEXT, profile_hash TEXT, body TEXT NOT NULL,
 engine TEXT NOT NULL DEFAULT '', title TEXT, author_torch_no INTEGER,
 uploaded_at TEXT, updated_at TEXT NOT NULL, state TEXT NOT NULL DEFAULT 'pending'
 CHECK(state IN ('pending','reviewing','needs-change','passed','deleted')),
 priority REAL NOT NULL DEFAULT 0, revision INTEGER NOT NULL DEFAULT 1,
 reason TEXT, last_audit_id TEXT, published INTEGER NOT NULL DEFAULT 0,
 source_path TEXT
);
CREATE INDEX IF NOT EXISTS seed_admin_state ON seed_admin_items(state,priority,id);
CREATE INDEX IF NOT EXISTS seed_admin_exact ON seed_admin_items(kind,layer,game_key,seed_rev,profile_hash,settings_hash);
CREATE TABLE IF NOT EXISTS seed_admin_audit (
 id TEXT PRIMARY KEY, item_id TEXT NOT NULL, action TEXT NOT NULL,
 old_state TEXT NOT NULL,new_state TEXT NOT NULL,reason TEXT NOT NULL,
 before_revision INTEGER NOT NULL,after_revision INTEGER NOT NULL,
 actor TEXT NOT NULL,at TEXT NOT NULL,detail TEXT NOT NULL DEFAULT '{}'
);
CREATE INDEX IF NOT EXISTS seed_admin_audit_item ON seed_admin_audit(item_id,after_revision);
CREATE TABLE IF NOT EXISTS seed_admin_uploads (
 upload_id TEXT PRIMARY KEY,item_id TEXT NOT NULL,reporter_tag TEXT NOT NULL,at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS seed_admin_upload_item ON seed_admin_uploads(item_id,at);
CREATE TABLE IF NOT EXISTS seed_usage (
 event_id TEXT PRIMARY KEY,request_digest TEXT NOT NULL,seed_hash TEXT NOT NULL,
 layer TEXT NOT NULL,seed_key TEXT NOT NULL,revision INTEGER NOT NULL,
 exe_sha256 TEXT NOT NULL,engine TEXT NOT NULL,at TEXT NOT NULL,received_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS seed_usage_seed ON seed_usage(seed_hash,received_at);
