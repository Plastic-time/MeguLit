// SPDX-License-Identifier: GPL-3.0-or-later
// Generates the website's data files from the repository and GitHub:
//   site/public/data/engines.json   engine list from core/library.cjs + the dedicated adapters in services/original-engines
//   site/public/data/latest.json    snapshot of the latest release (used when dl.megulit.com cannot be reached)
//   site/public/data/releases.json  snapshot for the changelog page
// Usage (from the repo root): node site/tools/gen-data.mjs [--offline]
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { pickAsset, assetSha256, shapeLatest, shapeReleases, REPO } from '../mirror/src/release.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const out = path.join(root, 'site', 'public', 'data');
fs.mkdirSync(out, { recursive: true });

// ---- engines ---------------------------------------------------------------------------------------------------------
const lib = fs.readFileSync(path.join(root, 'core', 'library.cjs'), 'utf8');
const block = lib.slice(lib.indexOf('const ENGINES=['), lib.indexOf('];', lib.indexOf('const ENGINES=[')));
const detected = [...block.matchAll(/\{name:(['"])(.+?)\1,hook:(true|null)(,generic:true)?/g)]
  .map(m => ({ name: m[2], generic: Boolean(m[4]) }));
if (detected.length < 20) throw new Error(`engine parse found only ${detected.length} engines`);

// Engines with their own adapter (zero-latency bilingual tables, Japanese import or page layout). Each entry names the
// files it relies on; a missing file fails the build so the site never claims an adapter that was removed.
const ADAPTERS = [
  { name: 'KiriKiri', files: ['xp3.cjs', 'ks-cx.cjs', 'psb.cjs', 'cx-worker.cjs'], games: ['千恋＊万花', '魔法使いの夜'] },
  { name: 'BGI / Ethornell', files: ['bgi.cjs'], games: [] },
  { name: 'SiglusEngine', files: ['scenes.cjs'], marker: "id:'siglus'", games: ['CLANNAD'] },
  { name: 'YU-RIS', files: ['yuris.cjs'], games: ['euphoria'] },
  { name: 'Artemis', files: ['scenes.cjs'], marker: "id:'artemis'", games: ['The Shell'] },
  { name: 'CatSystem2', files: ['catsystem2.cjs', 'blowfish.cjs'], games: ['ISLAND'] },
  { name: "Ren'Py", files: ['scenes.cjs'], marker: "id:'renpy'", games: [] },
  { name: 'HuneX', files: ['hunex.cjs'], games: ['魔法使いの夜'] },
  { name: 'Unity (Naninovel)', files: ['naninovel.cjs', 'unityfs.cjs'], games: ['魔法少女ノ魔女裁判'] },
  { name: 'MAGES', files: ['mages.cjs'], games: ['STEINS;GATE'] },
  { name: 'Leaf / AQUAPLUS', files: ['aquaplus.cjs'], games: ['WHITE ALBUM2'] },
  { name: 'NScripter', files: ['nscripter.cjs'], games: ['月姫'] },
  { name: 'Unity', files: ['unity-text.cjs', 'higurashi.cjs', 'capcom-msg.cjs'], games: [] },
];
const adapterDir = path.join(root, 'services', 'original-engines');
for (const a of ADAPTERS) for (const f of a.files) {
  const p = path.join(adapterDir, f);
  if (!fs.existsSync(p)) throw new Error(`adapter file missing: ${f}`);
  if (a.marker && !fs.readFileSync(p, 'utf8').includes(a.marker)) throw new Error(`${f} has no ${a.marker}`);
}
const GAMES = [
  { title: 'ISLAND', engine: 'CatSystem2' },
  { title: '魔法使いの夜', en: 'Witch on the Holy Night', engine: 'HuneX · KiriKiri' },
  { title: 'WHITE ALBUM2', engine: 'Leaf / AQUAPLUS' },
  { title: 'euphoria', engine: 'YU-RIS' },
  { title: '千恋＊万花', en: 'Senren＊Banka', engine: 'KiriKiri Z' },
  { title: 'CLANNAD', engine: 'SiglusEngine' },
  { title: 'The Shell', engine: 'Artemis' },
  { title: '魔法少女ノ魔女裁判', en: 'Magical Girl Witch Trials', engine: 'Unity (Naninovel)' },
  { title: 'STEINS;GATE', engine: 'MAGES' },
  { title: '月姫', en: 'Tsukihime', engine: 'NScripter' },
];
const engines = {
  adapters: ADAPTERS.map(({ name, games }) => ({ name, games })),
  detected: detected.map(d => d.name),
  games: GAMES,
};
write('engines.json', engines);

// ---- releases ----------------------------------------------------------------------------------------------------------
if (!process.argv.includes('--offline')) {
  const headers = { 'user-agent': 'megulit-site-build', accept: 'application/vnd.github+json' };
  if (process.env.GITHUB_TOKEN) headers.authorization = `Bearer ${process.env.GITHUB_TOKEN}`;
  const list = await (await fetch(`https://api.github.com/repos/${REPO}/releases?per_page=60`, { headers })).json();
  if (!Array.isArray(list)) throw new Error('GitHub API: ' + JSON.stringify(list).slice(0, 200));
  const latest = list.filter(r => !r.draft && !r.prerelease && pickAsset(r))
    .sort((a, b) => String(b.published_at).localeCompare(String(a.published_at)))[0];
  const asset = pickAsset(latest);
  // The snapshot has no R2 key: it is only used when the mirror is unreachable, so the site skips straight to mirrors.
  const snap = shapeLatest(latest, asset, assetSha256(asset), { syncedAt: new Date().toISOString() });
  delete snap.key;
  delete snap.url;
  write('latest.json', snap);
  write('releases.json', shapeReleases(list));
}

function write(name, value) {
  fs.writeFileSync(path.join(out, name), JSON.stringify(value, null, 1) + '\n');
  console.log('wrote', path.relative(root, path.join(out, name)));
}
