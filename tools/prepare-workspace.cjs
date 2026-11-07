// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { spawnSync } = require('node:child_process');
const root = path.resolve(__dirname, '..');
const source = path.resolve(process.argv[2]);
const snapshot = path.join(root, 'migration', 'baseline-20261103');
const hash = file => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const excluded = /(?:\.bak(?:[-.]|$)|\.updated\.exe$|^__pycache__$)/i;
function copy(from, to, filter = () => true) {
  if (!fs.existsSync(from)) return;
  fs.mkdirSync(path.dirname(to), { recursive: true });
  fs.cpSync(from, to, { recursive: true, force: false, errorOnExist: false, filter: p => !excluded.test(path.basename(p)) && filter(p) });
}
function inventory(dir, prefix = '') {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap(entry => {
    const relative = path.join(prefix, entry.name);
    const absolute = path.join(dir, entry.name);
    if (entry.isSymbolicLink()) return [{ file: relative, link: true }];
    return entry.isDirectory() ? inventory(absolute, relative) : [{ file: relative, size: fs.statSync(absolute).size, sha256: hash(absolute) }];
  });
}
async function main() {
  if (fs.existsSync(path.join(snapshot, 'baseline.json'))) throw Error('Baseline already exists; it must not be overwritten');
  for (const name of ['app', 'native', 'validation']) copy(path.join(source, name), path.join(root, 'preserved', name), p => !/[/\\](?:skip[^/\\]*|island-regression-handoff[^/\\]*)[/\\]/i.test(p) && !/\.(mp4|webm|log|dmp)$/i.test(p));
  for (const name of ['HANDOFF-OPUS55-20261103.md', 'ENGINE-ADAPTATION-NOTES.md', 'LICENSE']) copy(path.join(source, name), path.join(root, 'preserved', name));
  copy(path.join(source, 'config'), path.join(snapshot, 'config'));
  const legacy = path.join(process.env.APPDATA, 'com.daishi.tomoyo');
  if (fs.existsSync(path.join(legacy, 'immersion.db'))) {
    const result = spawnSync('python', [path.join(__dirname, 'backup-sqlite.py'), path.join(legacy, 'immersion.db'), path.join(snapshot, 'legacy.sqlite')], { windowsHide: true, encoding: 'utf8' });
    if (result.status !== 0) throw Error('SQLite snapshot failed: ' + result.stderr);
  }
  for (const name of ['covers', 'profile', 'word-images', 'settings.json']) copy(path.join(legacy, name), path.join(snapshot, name));
  const profileWarnings = [];
  const leveldb = path.join(source, 'cache', 'webview-profile', 'EBWebView', 'Default', 'Local Storage', 'leveldb');
  if (fs.existsSync(leveldb)) {
    const destination = path.join(snapshot, 'webview-local-storage');
    fs.mkdirSync(destination, { recursive: true });
    for (const name of fs.readdirSync(leveldb)) {
      if (name === 'LOCK') continue;
      try { copy(path.join(leveldb, name), path.join(destination, name)); }
      catch (error) { profileWarnings.push({ file: name, code: error.code }); }
    }
  }
  const runtime = path.join(root, 'runtime');
  fs.mkdirSync(runtime, { recursive: true });
  copy(path.join(source, 'runtime', 'node.exe'), path.join(runtime, 'node.exe'));
  for (const name of ['hook', 'hook-island', 'hook-mages', 'hook-readonly', 'locale-emulator']) copy(path.join(source, 'runtime', name), path.join(root, 'preserved', 'runtime', name));
  const adapted = path.join(source, 'source', 'mages-embed-20261027');
  // Preserve the actual adapted source, excluding rebuildable objects and binaries.
  copy(adapted, path.join(root, 'preserved', 'source', 'lunahoook-adapted'), p => !/[/\\](?:build[^/\\]*|\.git|out|\.vs)[/\\]/i.test(p) && !/\.(obj|pdb|ilk|pch|lib|exp)$/i.test(p));
  const records = inventory(path.join(root, 'preserved'));
  const baseline = {
    schema: 1, createdAt: new Date().toISOString(), source,
    upstreamExecutableCopied: false, upstreamApplicationSourceCopied: false,
    sourceLauncherSha256: hash(path.join(source, 'ToMe.exe')),
    sourceEngineSha256: hash(path.join(source, 'runtime', 'engine', 'ToMe.exe')),
    preservedFiles: records,
    data: inventory(snapshot), profileWarnings,
    gameVerification: 'NOT RUN; inherited results are reported in the handoff only',
    localStorageStatus: 'Raw best-effort checkpoint only; tome-* and tomoyo-* value migration must be verified before replacement',
  };
  fs.writeFileSync(path.join(snapshot, 'baseline.json'), JSON.stringify(baseline, null, 2));
  console.log(JSON.stringify({ root, preservedFiles: records.length, snapshot, profileWarnings, engineCopied: false }));
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
