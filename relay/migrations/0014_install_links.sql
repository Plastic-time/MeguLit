-- 2026-11-12 (user: the same player showed twice on the leaderboard, as the install and as the account): an install that
-- once posted signed in belongs to that account; later posts from it, signed in or not, count for the account.
CREATE TABLE IF NOT EXISTS install_links (
  install_hash TEXT PRIMARY KEY,
  account_hash TEXT NOT NULL,
  linked_at INTEGER NOT NULL
);
