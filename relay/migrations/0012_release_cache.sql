-- SPDX-License-Identifier: GPL-3.0-or-later
-- 2026-11-12 E461: GitHub's release JSON for the in-app update check, kept so players who cannot reach api.github.com
-- get it from the relay even while GitHub rate-limits the shared Cloudflare egress.
CREATE TABLE IF NOT EXISTS release_cache (which TEXT PRIMARY KEY, body TEXT NOT NULL, fetched_at INTEGER NOT NULL);
