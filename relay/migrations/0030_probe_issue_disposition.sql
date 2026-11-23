-- Durable disposition before any legacy adapter-probe issue is closed.
CREATE TABLE IF NOT EXISTS probe_issue_disposition (
 repo TEXT NOT NULL,
 issue INTEGER NOT NULL,
 markdown TEXT,
 created_at TEXT NOT NULL,
 last_attempt_at TEXT,
 closed_at TEXT,
 PRIMARY KEY (repo,issue)
);
CREATE INDEX IF NOT EXISTS probe_issue_open ON probe_issue_disposition(repo,closed_at,last_attempt_at,created_at);
