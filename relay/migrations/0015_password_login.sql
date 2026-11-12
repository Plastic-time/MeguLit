-- 2026-11-12 (user: a code by mail every time is slow; add a Steam-like user name and password): a user name chosen once
-- and never changed (username_key = its lower case, unique), and a password (PBKDF2-SHA256, per-account salt). Either the
-- e-mail or the user name signs in with the password; the e-mail code stays for new accounts and forgotten passwords.
ALTER TABLE accounts ADD COLUMN username TEXT;
ALTER TABLE accounts ADD COLUMN username_key TEXT;
ALTER TABLE accounts ADD COLUMN pass_hash TEXT;
ALTER TABLE accounts ADD COLUMN pass_salt TEXT;
ALTER TABLE accounts ADD COLUMN pass_set_at INTEGER NOT NULL DEFAULT 0;
CREATE UNIQUE INDEX IF NOT EXISTS accounts_username_key ON accounts(username_key) WHERE username_key IS NOT NULL;
