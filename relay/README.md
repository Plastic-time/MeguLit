# MeguLit relay

One Cloudflare Worker that MeguLit's online features talk to, so nothing depends on reaching GitHub from mainland China:

| Endpoint | Used by | Storage |
|---|---|---|
| `POST /api/diagnostics` | 诊断上传 (`services/diagnostics-upload.cjs`) | zip in R2, a GitHub issue on `ilynthn/MeguLit` |
| `POST /api/adaptation`, `POST /api/adaptation/query`, `GET /api/adaptation?fp=` | 共享适配 (`services/shared-adaptation-sync.cjs`) | D1 `adaptation_records` |
| `POST` / `GET` / `DELETE /api/leaderboard` | 排行榜 (`services/leaderboard.cjs`) | D1 `leaderboard_*` |
| `GET /api/health` | checks | none |

Nothing is deployed yet. The app works without the relay: each feature reports "not configured" until the
client knows the relay's address (see [Point the app at the relay](#5-point-the-app-at-the-relay)).

## What you need

- A Cloudflare account, with the domain you want to use added as a zone (for example `megulit.example` → `relay.megulit.example`).
- A GitHub fine-grained token with access to **ilynthn/MeguLit** only, permission **Issues: Read and write**. Nothing else.
- Node.js 18 or newer. Wrangler comes from `npm install` in this folder.

The token file the debug session reads should hold these lines (it stays outside the repo and is never committed):

```
CLOUDFLARE_ACCOUNT_ID=...
RELAY_HOST=relay.megulit.example
GITHUB_TOKEN=github_pat_...
```

## Deploy

All commands run inside `relay/`.

### 1. Install and sign in

```bash
cd relay
npm install
npx wrangler login
npx wrangler whoami
```

`wrangler login` opens a browser for the Cloudflare sign-in. In a non-interactive shell, use an API token instead:
`CLOUDFLARE_API_TOKEN=... CLOUDFLARE_ACCOUNT_ID=...` in the environment (token permissions: Workers Scripts Edit,
D1 Edit, Workers R2 Storage Edit, Zone → Workers Routes Edit for the zone).

### 2. Create the database and the bucket

```bash
npx wrangler d1 create megulit-relay
```

Copy the `database_id` it prints into `wrangler.toml` (replace `REPLACE_WITH_D1_DATABASE_ID`). Then:

```bash
npx wrangler d1 migrations apply megulit-relay --remote
npx wrangler r2 bucket create megulit-diagnostics
```

Optional, keeps the bucket small: delete diagnostics after 90 days.

```bash
npx wrangler r2 bucket lifecycle add megulit-diagnostics expire-diagnostics diagnostics/ --expire-days 90
```

### 3. Secrets

Each command asks for the value on stdin; nothing is written to disk.

```bash
npx wrangler secret put GITHUB_TOKEN
npx wrangler secret put LINK_SECRET
npx wrangler secret put HASH_SALT
```

- `GITHUB_TOKEN`: the fine-grained token above. Without it, uploads are still stored and the reply has an empty `issueUrl`.
- `LINK_SECRET`: any long random string (`node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`). It signs the time-limited download links in issues.
- `HASH_SALT`: another random string; client IPs are only stored as salted hashes for rate limiting.
- Optional `DIAG_TOKEN`: if set, `POST /api/diagnostics` needs `Authorization: Bearer <DIAG_TOKEN>`. It ships inside the app, so it only stops casual abuse.

From a script, pipe the value in: `printf '%s' "$GITHUB_TOKEN" | npx wrangler secret put GITHUB_TOKEN`.

### 4. Custom domain and deploy

In `wrangler.toml`, replace `relay.example.com` in

```toml
routes = [
  { pattern = "relay.example.com", custom_domain = true }
]
```

with the real host (`RELAY_HOST`). With `custom_domain = true` Cloudflare creates the DNS record and certificate on
deploy; the zone must be on the same account. Then:

```bash
npx wrangler deploy
curl https://relay.megulit.example/api/health
```

The last command should print `{"ok":true,"service":"megulit-relay"}`.

Create the `diagnostics` label in the GitHub repo once (Issues → Labels), or let the first issue create it (GitHub
creates unknown labels when the token can write issues).

### 5. Point the app at the relay

The client reads one address for all three features: `services/relay-config.cjs` → `relayBase(root)`.

- For a release: set `DEFAULT_RELAY_BASE = 'https://relay.megulit.example'` in `services/relay-config.cjs`.
- For testing without a release: Settings → 联网服务 → 联网服务地址, or the `MEGULIT_RELAY_BASE` environment variable.

## Local testing

```bash
npx wrangler d1 migrations apply megulit-relay --local
npx wrangler dev
```

Put local-only secrets in `relay/.dev.vars` (git-ignored), e.g. `LINK_SECRET=dev`. Then set `MEGULIT_RELAY_BASE=http://127.0.0.1:8787`
before starting MeguLit. The handler logic is also covered by `node --test validation/relay.test.cjs` from the repo root,
which runs the Worker against an in-memory SQLite stand-in for D1.

## API

All JSON replies have `cache-control: no-store`. Errors are `{"ok":false,"error":"CODE"}` with 400 (validation),
401, 404, 405, 410 (expired link), 413 (too large) or 429 (rate limited).

### Leaderboard

```
POST /api/leaderboard
{"version":1,"id":"<uuid v4>","name":"めぐみん","keys":{"week":"2026-W46","month":"2026-11"},
 "stats":{"week":{"characters":0,"seconds":0,"words":0,"streak":0},"month":{...},"all":{...}},
 "games":[{"title":"ATRI","characters":120000,"seconds":36000}]}          → {"ok":true}
GET /api/leaderboard?period=week|month|all&metric=characters|seconds|words|streak[&key=2026-W46][&me=<sha256 of id>]
                                                                        → {"entries":[{"rank","name","value","me"}],"total","me":{"rank","value"}|null}
GET /api/leaderboard?metric=games                                       → {"games":[{"title","readers","top":{"name","value"}}]}
GET /api/leaderboard?metric=games&game=ATRI                             → {"entries":[...],"total","me"}
DELETE /api/leaderboard?id=<uuid>                                       → {"ok":true}
```

- Only `sha256(id)` is stored. Replies never contain ids or hashes, only names and numbers.
- Nicknames: 2–16 characters after NFKC, no links, quotes, control or zero-width characters, and a block list (same rules as the client).
- Period keys must match the server's current week/month within ±14 hours. Values above realistic caps (`CAPS` in `src/validate.js`) are rejected.
- Sending a POST without `games` removes the user's per-game rows (the user turned 公开读过的游戏 off).

### Shared adaptation

```
POST /api/adaptation        {"version":1,"records":[<megulit.adaptation v1>, ...]}   (≤ 50, ≤ 16 KB each) → {"ok":true,"accepted","rejected"}
POST /api/adaptation/query  {"version":1,"keys":["<64 hex>", ...]}                   (≤ 50)             → {"records":[...]}
GET  /api/adaptation?fp=<64 hex>,<64 hex>                                                                → {"records":[...]}
```

Records are keyed by `record.key` (64 hex). A later upload for the same key replaces the stored record and counts a report.
Records that look like they carry a Windows path or user folder are rejected.

### Diagnostics

```
POST /api/diagnostics   multipart/form-data
  meta     JSON  {"schema":1,"version":"1.2.8d","game":{"id","title","engine"},"os","size","sha256","createdAt","note"}
  package  zip   ≤ 20 MB   (the part may also be named "file")
→ 201 {"ok":true,"id":"<uuid>","issueUrl":"https://github.com/ilynthn/MeguLit/issues/<n>"}
```

The zip must start with `PK`; when `meta.sha256` is given it must match. The issue (label `diagnostics`) lists the meta
and a link `GET /api/diagnostics/download/<id>?exp=&sig=` signed with `LINK_SECRET`, valid for `LINK_DAYS` (30) days.
Issues on a public repo are public, so anyone with the issue can download the package until the link expires.

## Rate limits

Fixed windows in D1 (`RATE` in `src/worker.js`): 120 requests/min per IP overall; leaderboard writes 6 per 10 min per IP
and 20 per hour per install id; leaderboard reads 60/min; adaptation writes 30/hour, reads 120/hour; diagnostics uploads
5/hour and downloads 30/hour per IP.
