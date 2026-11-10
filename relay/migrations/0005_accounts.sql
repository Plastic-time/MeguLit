-- SPDX-License-Identifier: GPL-3.0-or-later
-- E378 MeguLit accounts + cloud sync (relay/src/accounts.js). Applies after 0001_init.sql.
-- Apply: npx wrangler d1 migrations apply megulit-relay --remote

-- One row per email. The email is kept only to log in and to show it back to its owner.
CREATE TABLE IF NOT EXISTS accounts (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  created_at INTEGER NOT NULL,
  last_login_at INTEGER NOT NULL,
  sync_seq INTEGER NOT NULL DEFAULT 0
);

-- Pending login codes: only sha256(pepper:email) and sha256(pepper:email:code); 10 minutes, 5 tries.
CREATE TABLE IF NOT EXISTS auth_codes (
  email_hash TEXT PRIMARY KEY,
  code_hash TEXT NOT NULL,
  expires_at INTEGER NOT NULL,
  tries INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL
);

-- Device sessions: the token is stored hashed; rotated at most daily, the previous hash stays valid until prev_until.
CREATE TABLE IF NOT EXISTS account_sessions (
  id TEXT PRIMARY KEY,
  account_id TEXT NOT NULL,
  token_hash TEXT NOT NULL UNIQUE,
  prev_hash TEXT,
  prev_until INTEGER NOT NULL DEFAULT 0,
  device TEXT NOT NULL DEFAULT '',
  created_at INTEGER NOT NULL,
  last_used_at INTEGER NOT NULL,
  rotated_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS account_sessions_by_account ON account_sessions(account_id, last_used_at);
CREATE INDEX IF NOT EXISTS account_sessions_by_prev ON account_sessions(prev_hash);

-- Synced records. kind: words | sentences | reading | settings. data is the JSON document (NULL for a tombstone);
-- updated_at is the client's ms clock (last writer wins); seq is a per-account counter for incremental pulls.
CREATE TABLE IF NOT EXISTS sync_records (
  account_id TEXT NOT NULL,
  kind TEXT NOT NULL,
  key TEXT NOT NULL,
  data TEXT,
  updated_at INTEGER NOT NULL,
  deleted INTEGER NOT NULL DEFAULT 0,
  seq INTEGER NOT NULL,
  PRIMARY KEY (account_id, kind, key)
);
CREATE INDEX IF NOT EXISTS sync_records_by_seq ON sync_records(account_id, kind, seq);

-- Same table as 0001_init.sql (kept here so this file also works on its own in tests).
CREATE TABLE IF NOT EXISTS rate_limits (
  bucket TEXT PRIMARY KEY,
  count INTEGER NOT NULL,
  reset_at INTEGER NOT NULL
);
