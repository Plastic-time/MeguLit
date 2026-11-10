// SPDX-License-Identifier: GPL-3.0-or-later
// Pure functions of the download mirror: which GitHub release asset is the installer, whether it changed since the
// last sync, and the shape of latest.json / releases.json. No I/O here, so validation/site-mirror.test.cjs can run them.

export const REPO = 'ilynthn/MeguLit';
export const ASSET_RE = /^MeguLit-v(\d+\.\d+\.\d+)-win-x64\.zip$/;
const HEX64 = /^[0-9a-f]{64}$/;

// The installer zip of a release, or null (runtime-* releases and drafts carry other assets).
export function pickAsset(release) {
  if (!release || release.draft) return null;
  const assets = Array.isArray(release.assets) ? release.assets : [];
  return assets.find(a => a && ASSET_RE.test(a.name || '')) || null;
}

// GitHub gives asset digests as "sha256:<hex>". Anything else (missing, other algorithm, malformed) is null.
export function assetSha256(asset) {
  const m = /^sha256:([0-9a-fA-F]{64})$/.exec(String(asset?.digest || '').trim());
  return m ? m[1].toLowerCase() : null;
}

// "MeguLit v1.2.8d" -> "1.2.8d". Hotfixes keep the numeric tag and asset name, so the title carries the letter.
// Falls back to the tag, then to the asset's version.
export function versionLabel(release, asset = pickAsset(release)) {
  const fromTitle = /v?(\d+\.\d+\.\d+[a-z]?)\s*$/i.exec(String(release?.name || '').trim());
  if (fromTitle) return fromTitle[1].toLowerCase();
  const fromTag = /^v?(\d+\.\d+\.\d+[a-z]?)$/i.exec(String(release?.tag_name || '').trim());
  if (fromTag) return fromTag[1].toLowerCase();
  const fromAsset = ASSET_RE.exec(asset?.name || '');
  return fromAsset ? fromAsset[1] : '';
}

// The R2 key of an installer. Content-addressed, so a hotfix with the same file name never overwrites the
// object a visitor may be downloading, and latest.json only moves once the new object is verified.
export function objectKey(sha256, name) {
  if (!HEX64.test(sha256 || '')) throw new Error('objectKey needs a sha256 hex digest');
  if (!ASSET_RE.test(name || '')) throw new Error('objectKey needs the installer file name');
  return `files/${sha256}/${name}`;
}

// Decides whether the mirror must fetch the asset again. prev is the latest.json the mirror published last.
// A same-named asset with a new digest (a hotfix) or a new title label counts as a change.
export function syncDecision(prev, release) {
  const asset = pickAsset(release);
  if (!asset) return { sync: false, reason: 'no-asset' };
  const sha = assetSha256(asset);
  if (!sha) return { sync: false, reason: 'no-digest' };
  const label = versionLabel(release, asset);
  if (!prev || !prev.sha256) return { sync: true, reason: 'first', asset, sha256: sha, label };
  if (prev.sha256 !== sha) return { sync: true, reason: prev.name === asset.name ? 'digest' : 'asset', asset, sha256: sha, label };
  if (prev.name !== asset.name) return { sync: true, reason: 'asset', asset, sha256: sha, label };
  // Same file: only the metadata (title letter, notes) may need a refresh, never the 20 MB download.
  if (prev.label !== label || prev.tag !== release.tag_name || prev.notesHash !== hashText(release.body || ''))
    return { sync: false, metaOnly: true, reason: 'meta', asset, sha256: sha, label };
  return { sync: false, reason: 'same' };
}

// Small non-cryptographic hash (FNV-1a 32) to notice edited release notes.
export function hashText(text) {
  let h = 0x811c9dc5;
  for (const ch of String(text)) {
    h ^= ch.codePointAt(0);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, '0');
}

// Release notes are bilingual: <details><summary><b>中文</b></summary> ... </details> then the same for English.
// Returns { zh, en } as Markdown; a body without those blocks goes to both. The download link line on top is dropped.
export function splitNotes(body) {
  const text = String(body || '').replace(/\r\n?/g, '\n');
  const out = { zh: '', en: '' };
  const re = /<details>\s*<summary>\s*(?:<b>)?\s*([^<]+?)\s*(?:<\/b>)?\s*<\/summary>([\s\S]*?)<\/details>/gi;
  let m;
  while ((m = re.exec(text))) {
    const name = m[1].toLowerCase();
    const lang = /中文|chinese|简体|zh/.test(name) ? 'zh' : /english|英文|en\b/.test(name) ? 'en' : '';
    if (lang && !out[lang]) out[lang] = tidy(m[2]);
  }
  if (!out.zh && !out.en) {
    const rest = tidy(text.replace(/^>\s*\*\*\[[^\n]*\n?/m, '').replace(/^##\s+MeguLit[^\n]*\n?/m, ''));
    out.zh = rest;
    out.en = rest;
  }
  if (!out.zh) out.zh = out.en;
  if (!out.en) out.en = out.zh;
  return out;
}

function tidy(md) {
  return String(md).replace(/^\s*\n/, '').replace(/\n{3,}/g, '\n\n').trim();
}

export function githubUrl(release, asset) {
  return asset?.browser_download_url || `https://github.com/${REPO}/releases/download/${release.tag_name}/${asset.name}`;
}

// latest.json: everything the website's download section needs, in one small file served from dl.megulit.com.
export function shapeLatest(release, asset, sha256, { base = 'https://dl.megulit.com', syncedAt } = {}) {
  const label = versionLabel(release, asset);
  return {
    schema: 1,
    label,
    version: (ASSET_RE.exec(asset.name) || [])[1] || label,
    tag: release.tag_name,
    title: release.name || `MeguLit v${label}`,
    name: asset.name,
    size: asset.size,
    sha256,
    published: release.published_at || release.created_at || null,
    updated: asset.updated_at || release.published_at || null,
    notes: splitNotes(release.body),
    notesHash: hashText(release.body || ''),
    key: objectKey(sha256, asset.name),
    url: `${base}/latest`,
    github: githubUrl(release, asset),
    page: release.html_url || `https://github.com/${REPO}/releases/tag/${release.tag_name}`,
    syncedAt: syncedAt || null,
  };
}

// releases.json for the changelog page: published app releases only (no runtime-* packs, drafts or prereleases).
export function shapeReleases(list, limit = 40) {
  return (Array.isArray(list) ? list : [])
    .filter(r => r && !r.draft && !r.prerelease && pickAsset(r))
    .sort((a, b) => String(b.published_at).localeCompare(String(a.published_at)))
    .slice(0, limit)
    .map(r => {
      const asset = pickAsset(r);
      return {
        label: versionLabel(r, asset),
        tag: r.tag_name,
        published: r.published_at,
        size: asset.size,
        sha256: assetSha256(asset),
        notes: splitNotes(r.body),
        page: r.html_url || `https://github.com/${REPO}/releases/tag/${r.tag_name}`,
      };
    });
}
