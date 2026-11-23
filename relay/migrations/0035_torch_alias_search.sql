-- Generated aliases use Japanese characters or ASCII IDs, with no spaces.
CREATE INDEX torch_credits_alias_folded ON torch_credits(lower(alias),torch_no) WHERE name IS NULL;
