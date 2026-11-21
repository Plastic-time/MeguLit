-- 2026-11-21 传火署名 (relay/src/torch-credit.js): every accepted auto-profile upload gets a global, ever-increasing 传火人编号
-- (torch_no) per exe key and reporter; the reporter may attach a display name (cleaned, 1-20 characters), change it later or
-- withdraw it (name NULL; the number stays). reporter_hash = the same salted IP hash the reports use, never a raw IP.
-- Additive only. torch_no is assigned in the insert itself (MAX+1) and is unique.
CREATE TABLE IF NOT EXISTS torch_credits (
  game_key TEXT NOT NULL,
  reporter_hash TEXT NOT NULL,
  torch_no INTEGER NOT NULL,
  name TEXT,
  at INTEGER NOT NULL,
  PRIMARY KEY (game_key, reporter_hash)
);
CREATE UNIQUE INDEX IF NOT EXISTS torch_credits_no ON torch_credits(torch_no);
