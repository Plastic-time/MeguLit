// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
// E280: Chinese-only packages (装甲悪鬼村正 repack, user 2026-11-10) are named as such, and a Nitroplus package can
// import nss.npa / system.npa plus the program from a Japanese original, with backup and undo.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const ji = require('../core/japanese-import.cjs');

const big = tag => Buffer.concat([Buffer.from('MZ' + tag), Buffer.alloc(210000, tag.length)]);
function muramasa() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'megulit-import-'));
  const zh = path.join(root, '装甲恶鬼村正(带步兵)'), ja = path.join(root, '装甲悪鬼村正');
  fs.mkdirSync(zh); fs.mkdirSync(ja);
  fs.writeFileSync(path.join(zh, 'Muramasa_chs.exe'), big('chs'));
  fs.writeFileSync(path.join(zh, '装甲恶鬼村正 中文攻略.exe'), big('guide'));
  fs.writeFileSync(path.join(zh, 'nss.npa'), 'chinese script');
  fs.writeFileSync(path.join(zh, 'system.npa'), 'chinese system');
  fs.writeFileSync(path.join(zh, 'cg.npa'), 'cg');
  fs.writeFileSync(path.join(ja, 'Muramasa.exe'), big('ja'));
  fs.writeFileSync(path.join(ja, 'nss.npa'), 'japanese script');
  fs.writeFileSync(path.join(ja, 'system.npa'), 'japanese system');
  fs.writeFileSync(path.join(ja, 'cg.npa'), 'japanese cg');
  return { root, zh, ja, chs: path.join(zh, 'Muramasa_chs.exe'), src: path.join(ja, 'Muramasa.exe') };
}

test('a folder whose only game program is a Chinese build is named, and Nitroplus can import', () => {
  const g = muramasa();
  assert.strictEqual(ji.translatedOnly(g.zh, g.chs), true);
  assert.deepStrictEqual(ji.detect(g.zh, g.chs), { state: 'importable', adapter: 'nitroplus-npa', scripts: ['nss.npa', 'system.npa'] });
  fs.rmSync(path.join(g.zh, 'nss.npa'));
  assert.deepStrictEqual(ji.detect(g.zh, g.chs), { state: 'translated-only' });
  assert.strictEqual(ji.detect(g.ja, g.src), null);
  fs.writeFileSync(path.join(g.zh, 'Muramasa.exe'), big('ja'));
  assert.strictEqual(ji.translatedOnly(g.zh, g.chs), false, 'a Japanese program beside it is not a Chinese-only package');
});

test('import copies the script archives and the program, undo puts everything back', () => {
  const g = muramasa();
  const r = ji.apply(g.zh, g.chs, g.src);
  assert.strictEqual(r.imported, 2);
  assert.strictEqual(r.exe, path.join(g.zh, 'Muramasa.exe'));
  assert.strictEqual(fs.readFileSync(path.join(g.zh, 'nss.npa'), 'utf8'), 'japanese script');
  assert.strictEqual(fs.readFileSync(path.join(g.zh, 'system.npa'), 'utf8'), 'japanese system');
  assert.strictEqual(fs.readFileSync(path.join(g.zh, 'cg.npa'), 'utf8'), 'cg', 'archives without text are left alone');
  assert.ok(fs.existsSync(path.join(g.zh, 'Muramasa.exe')));
  assert.strictEqual(ji.detect(g.zh, r.exe).state, 'imported');
  assert.throws(() => ji.apply(g.zh, g.chs, g.src), /ALREADY_IMPORTED/);
  const u = ji.restore(g.zh);
  assert.deepStrictEqual(u.skipped, []);
  assert.strictEqual(u.exe, g.chs);
  assert.strictEqual(fs.readFileSync(path.join(g.zh, 'nss.npa'), 'utf8'), 'chinese script');
  assert.strictEqual(fs.readFileSync(path.join(g.zh, 'system.npa'), 'utf8'), 'chinese system');
  assert.ok(!fs.existsSync(path.join(g.zh, 'Muramasa.exe')));
  assert.ok(!fs.existsSync(path.join(g.zh, ji.BACKUP_DIR)));
});

test('import refuses a translated source, the same folder, or a folder without the script', () => {
  const g = muramasa();
  assert.throws(() => ji.apply(g.zh, g.chs, g.chs), /IMPORT_SOURCE_NOT_JAPANESE/);
  const other = path.join(g.ja, 'Muramasa_chs.exe'); fs.writeFileSync(other, big('x'));
  assert.throws(() => ji.apply(g.zh, g.chs, other), /IMPORT_SOURCE_NOT_JAPANESE/);
  fs.rmSync(path.join(g.ja, 'nss.npa'));
  assert.throws(() => ji.apply(g.zh, g.chs, g.src), /IMPORT_SOURCE_NO_SCRIPT/);
  assert.strictEqual(fs.readFileSync(path.join(g.zh, 'nss.npa'), 'utf8'), 'chinese script');
});

test('restore tool is wired: list, detect, import, undo and the launch message', () => {
  const bridge = fs.readFileSync(path.join(__dirname, '..', 'services', 'bridge.cjs'), 'utf8');
  assert.match(bridge, /translatedOnly\(dir,g\.executable\)\)hint='translated'/);
  assert.match(bridge, /case 'jp_import_apply'/);
  assert.match(bridge, /ji\.apply\(dir,row\.executable,request\.source\);importedExecutable\(db,id,r\.exe,'ja'\)/);
  const app = fs.readFileSync(path.join(__dirname, '..', 'web', 'app.js'), 'utf8');
  assert.match(app, /api\('jp_import_apply',\{id,source\}\)/);
  assert.match(fs.readFileSync(path.join(__dirname, '..', 'web', 'launch-feedback.js'), 'utf8'), /纯汉化包/);
});
