-- 2026-11-21 传火碑 at scale (relay/src/torch-credit.js): indexes and small counter tables so a list / month page / name search / "my
-- numbers" never scans or COUNT(*)s the whole of torch_credits. Additive only.
--   torch_counter  one row (id 1): the total, kept up to date when a number is handed out
--   torch_months   one row per month (UTC, 'YYYY-MM'): how many numbers were handed out in it (the monument's sections)
--   torch_names    torch_no -> name_key (the name folded: NFKC, lower case, no spaces) for prefix search; a row only while a name is shown
CREATE TABLE IF NOT EXISTS torch_counter (id INTEGER PRIMARY KEY, total INTEGER NOT NULL DEFAULT 0);
CREATE TABLE IF NOT EXISTS torch_months (month TEXT PRIMARY KEY, n INTEGER NOT NULL DEFAULT 0);
CREATE TABLE IF NOT EXISTS torch_names (torch_no INTEGER PRIMARY KEY, name_key TEXT NOT NULL);
CREATE INDEX IF NOT EXISTS torch_names_key ON torch_names(name_key, torch_no);
CREATE INDEX IF NOT EXISTS torch_credits_at ON torch_credits(at, torch_no);
CREATE INDEX IF NOT EXISTS torch_credits_reporter ON torch_credits(reporter_hash, torch_no);
INSERT OR REPLACE INTO torch_counter(id,total) SELECT 1,COUNT(*) FROM torch_credits;
INSERT OR REPLACE INTO torch_months(month,n) SELECT strftime('%Y-%m',at,'unixepoch'),COUNT(*) FROM torch_credits GROUP BY 1;
INSERT OR REPLACE INTO torch_names(torch_no,name_key) SELECT torch_no,lower(replace(name,' ','')) FROM torch_credits WHERE name IS NOT NULL AND name<>'';
