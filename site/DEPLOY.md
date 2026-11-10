# Deploying megulit.com

Two pieces, both on Cloudflare:

| Piece | Source | Lives at |
|---|---|---|
| Website (Cloudflare Pages) | `site/public/` | `https://megulit.com` (and `www.megulit.com`) |
| Download mirror (Worker + R2 + cron) | `site/mirror/` | `https://dl.megulit.com` |

The mirror checks GitHub Releases every 10 minutes. When the asset `MeguLit-vX.Y.Z-win-x64.zip` is new, or keeps its
name but has a new digest (a hotfix), it streams the file into R2 under `files/<sha256>/<name>`. R2 refuses the upload
if the bytes do not match GitHub's SHA-256, and the Worker hashes the stream a second time. Only then does
`latest.json` move to the new file, so visitors never get an unverified or half-uploaded installer. The current file
and the two before it are kept; older ones are deleted.

Nothing here has been deployed yet. Everything below runs from the repository root unless it says otherwise, with
Node.js 20+ installed. `npx wrangler` downloads Wrangler on first use.

## 0. Account access

Either log in interactively:

```bash
npx wrangler login
```

or use an API token (Cloudflare dashboard → My Profile → API Tokens → Create custom token) with these permissions,
scoped to your account and the `megulit.com` zone:

- Account · Cloudflare Pages · Edit
- Account · Workers Scripts · Edit
- Account · Workers R2 Storage · Edit
- Zone · Workers Routes · Edit
- Zone · DNS · Edit

```bash
export CLOUDFLARE_API_TOKEN=...      # never commit this
export CLOUDFLARE_ACCOUNT_ID=...     # dashboard → Workers & Pages → right sidebar
```

The `megulit.com` zone must be active on the same account (nameservers pointed at Cloudflare).

## 1. R2 bucket

```bash
npx wrangler r2 bucket create megulit-downloads
```

The bucket stays private. Files are served only through the Worker on `dl.megulit.com`.

## 2. Mirror Worker

```bash
cd site/mirror
npx wrangler deploy
```

`wrangler.toml` already declares:

- the custom domain `dl.megulit.com` (`custom_domain = true` creates the DNS record and certificate),
- the cron trigger `*/10 * * * *`,
- the R2 binding `BUCKET` → `megulit-downloads`.

Secrets (typed in at the prompt, stored by Cloudflare, never in the repo):

```bash
npx wrangler secret put SYNC_TOKEN     # any long random string; protects POST /sync
npx wrangler secret put GITHUB_TOKEN   # optional: fine-grained token, public repositories read-only.
                                       # Without it the Worker shares GitHub's 60 requests/hour anonymous limit.
```

First sync by hand (otherwise wait up to 10 minutes for the cron):

```bash
curl -X POST -H "Authorization: Bearer $SYNC_TOKEN" https://dl.megulit.com/sync
```

Expected: `{"changed":true,"reason":"first","label":"1.2.8"}`. Then check:

```bash
curl -s https://dl.megulit.com/latest.json
curl -sIL https://dl.megulit.com/latest
curl -sL https://dl.megulit.com/latest -o MeguLit.zip && sha256sum MeguLit.zip
```

The SHA-256 must equal `sha256` in `latest.json` and the digest shown on the GitHub release page.

`POST /sync?force` re-checks even when GitHub reports no change. Logs: `npx wrangler tail megulit-dl`.

### Workers plan and CPU time

Streaming 20 MB is mostly waiting on the network, but hashing it costs CPU. On the Workers Free plan (10 ms CPU per
invocation) the Worker's own second hash can exceed the limit; the log then says `Exceeded CPU Limit`. Either use the
Workers Paid plan, or set `VERIFY_IN_WORKER = "0"` in `wrangler.toml` and deploy again. R2 still verifies the
SHA-256 on upload, so no unverified file is ever published.

### Endpoints

| Path | What it returns |
|---|---|
| `/latest` | 302 to the current installer, `/files/<sha256>/MeguLit-vX.Y.Z-win-x64.zip` |
| `/MeguLit-vX.Y.Z-win-x64.zip` | same redirect (handy for links that name the file) |
| `/files/<sha256>/<name>` | the installer; immutable, edge-cached, supports `Range` so broken downloads resume |
| `/latest.json` | version label, tag, size, sha256, release date, bilingual notes, GitHub URL (CORS `*`) |
| `/releases.json` | the last 40 app releases for the changelog page (CORS `*`) |
| `POST /sync` | runs a sync now; needs `Authorization: Bearer <SYNC_TOKEN>` |

## 3. Website on Cloudflare Pages

Refresh the generated data first (engine list from the source, release snapshot from GitHub):

```bash
node site/tools/gen-data.mjs
```

Create the project once, then deploy:

```bash
npx wrangler pages project create megulit --production-branch main
npx wrangler pages deploy site/public --project-name megulit --branch main
```

Custom domains for Pages are added in the dashboard (Wrangler has no command for it): Workers & Pages → `megulit`
→ Custom domains → Set up a domain → `megulit.com`, then again for `www.megulit.com`. Cloudflare creates the DNS
records. The same through the API:

```bash
for d in megulit.com www.megulit.com; do
  curl -X POST "https://api.cloudflare.com/client/v4/accounts/$CLOUDFLARE_ACCOUNT_ID/pages/projects/megulit/domains" \
    -H "Authorization: Bearer $CLOUDFLARE_API_TOKEN" -H "Content-Type: application/json" --data "{\"name\":\"$d\"}"
done
```

To send `www` to the bare domain, add a Redirect Rule on the zone: `www.megulit.com/*` → `https://megulit.com/${1}`, 301.

`site/public/_headers` sets caching and a Content-Security-Policy. The CSP allows the one inline script (the theme
switch in each page's `<head>`) by its hash. If that script changes, recompute the hash:

```bash
python -c "import re,hashlib,base64;s=re.search(r'<script>(.*?)</script>',open('site/public/index.html',encoding='utf8').read(),re.S).group(1);print(base64.b64encode(hashlib.sha256(s.encode()).digest()).decode())"
```

and replace the `sha256-...` value in `_headers`.

## 4. How the download button picks a source

`site/public/assets/js/app.js` loads `https://dl.megulit.com/latest.json` (3 s timeout).

1. Mirror reachable: the main button points at the R2 file on `dl.megulit.com`.
2. Mirror unreachable: the page uses `site/public/data/latest.json` (the snapshot from step 3) and the main button
   falls back to `https://gh-proxy.com/<GitHub URL>`.
3. "备用下载" always lists the remaining sources in order: `gh-proxy.com`, `ghproxy.net`, GitHub direct.

The order lives in `downloadSources()` in `site/public/assets/js/core.mjs` and is covered by
`validation/site-mirror.test.cjs`.

## 5. Rebuilding assets

Only needed when screenshots, the logo or heading text change:

```bash
python -I site/tools/build-assets.py
```

The hero's background video lives in `site/public/assets/video/` (360p / 720p / 1080p, no larger than 8 MB each, so
well under Pages' 25 MB file limit). To rebuild it from a new 16:9 cut, for each width 640 / 1280 / 1920:

```bash
ffmpeg -i MeguLit-16x9.mp4 -vf scale=1280:-2 -c:v libx264 -preset slow -crf 27 -pix_fmt yuv420p -c:a aac -b:a 96k -movflags +faststart site/public/assets/video/megulit-720.mp4
```

The page picks the smallest file that is sharp on the visitor's screen, starts it muted, pauses it off-screen, and
skips it entirely when the visitor prefers reduced motion or has Data Saver on (the poster stays).

`build-assets.py` converts `docs/screenshots/*` and the logo to WebP and subsets Noto Serif SC (OFL, ships with Windows 11) to the
characters used in headings, about 100 KB. No font is loaded from Google or any other third party.

## 6. Local preview

```bash
node site/tools/serve.mjs 4173
```

Then open `http://localhost:4173`. `?lang=ja` / `?lang=en` switch languages; the page remembers the last choice.

## 7. Tests

```bash
node --test validation/*.test.cjs
```

## Rollback

- Website: Workers & Pages → `megulit` → Deployments → pick an earlier one → Rollback.
- Mirror: `npx wrangler rollback` in `site/mirror`. To pin downloads to an older verified installer, put the
  previous `latest.json` back with `npx wrangler r2 object put megulit-downloads/latest.json --file latest.json --remote`
  (the last three installers stay in the bucket).

## Notes for mainland China

Cloudflare's normal network serves China from nearby regions without an ICP filing; it is usually far faster than
GitHub's release CDN but not guaranteed. If the mirror is slow for many users, the GitHub proxy fallbacks still
work, and a domestic object store (with an ICP filing) can be added as a fourth source in `downloadSources()`.
