CREATE TABLE IF NOT EXISTS game_request_evidence (
 selector TEXT NOT NULL,
 kind TEXT NOT NULL CHECK(kind IN ('available','skeleton','backlog','generating')),
 ref TEXT NOT NULL,
 registered_at TEXT NOT NULL,
 expires_at TEXT,
 ended_at TEXT,
 PRIMARY KEY(kind,ref)
);
CREATE INDEX IF NOT EXISTS game_request_evidence_selector ON game_request_evidence(selector,kind,registered_at);

CREATE TABLE IF NOT EXISTS game_request_jobs (
 repo TEXT NOT NULL,
 issue INTEGER NOT NULL,
 selector TEXT NOT NULL,
 created_at TEXT NOT NULL,
 last_attempt_at TEXT,
 matched_kind TEXT,
 matched_ref TEXT,
 closing_token TEXT,
 closing_until TEXT,
 closed_at TEXT,
 PRIMARY KEY(repo,issue)
);
CREATE INDEX IF NOT EXISTS game_request_pending ON game_request_jobs(repo,closed_at,last_attempt_at,created_at);
