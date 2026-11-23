// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const crypto = require('node:crypto');
const embedded = require('../services/embedded-japanese.cjs');
const { localizationBundles } = require('../services/original-engines/naninovel.cjs')._internal;
const { packBundle } = require('../services/original-engines/utage-embedded.cjs')._internal;
const { string } = require('./helpers/utage-embedded-fixture.cjs');

function folder(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'megulit-folder-diagnostic-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  return dir;
}
const hash = file => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');

test('detects addressable Naninovel and counts only the documented Japanese and Chinese sides', t => {
  const dir = folder(t);
  const bundles = path.join(dir, 'Game_Data/StreamingAssets/aa/StandaloneWindows64');
  fs.mkdirSync(bundles, { recursive: true });
  const file = path.join(bundles, 'fixture-localization-zhhans-scripts-start.bundle');
  const text = '; Japanese <ja-JP> to Chinese <zh-Hans> localization document for `Start` naninovel script\n\n' +
    '# voiced\n; > Test: |#voiced|\n; 一緒に出掛けましょう。\n一起出门吧。\n\n' +
    '# untranslated\n; まだ翻訳はありません。\n\n';
  const unrelated = '; English <en> to Chinese <zh-Hans> localization document for `Other` naninovel script\n\n' +
    '# unrelated\n; This is not Japanese.\n路边的谈话。\n';
  const packed = packBundle('CAB-fixture', Buffer.concat([string(text), string(unrelated)]), '2020.3.7f1');
  fs.writeFileSync(file, packed);
  const before = hash(file);
  const result = embedded.scan(dir);
  assert.equal(result.state, 'read-only');
  assert.equal(result.engine, 'Unity (Naninovel)');
  assert.equal(result.coverage.japaneseLines, 2);
  assert.equal(result.coverage.localTranslations, 1);
  assert.equal(result.coverage.missingTranslations, 1);
  assert.equal(result.partial, false);
  assert.equal(result.canRestore, false);
  assert.equal(result.scanToken, '');
  assert.equal(result.sources[0].sha256, before);
  assert.equal(hash(file), before);
  assert.equal(fs.existsSync(path.join(dir, '.megulit-japanese')), false);
});

test('plain scripts, archive signatures, and limits produce different read-only outcomes', t => {
  const dir = folder(t);
  const game = path.join(dir, 'game');
  fs.mkdirSync(game);
  const file = path.join(game, 'story.rpy');
  assert.equal(embedded.scan(dir).state, 'unknown');
  fs.writeFileSync(file, 'label start:\n    "今天一起去旅行吧。秦の君说好。"\n');
  assert.equal(embedded.scan(dir).state, 'no-japanese');
  fs.writeFileSync(file, 'label start:\n    "これからみんなで旅行に行きます。"\n');
  assert.equal(embedded.scan(dir).state, 'read-only');
  fs.truncateSync(file, 3 << 20);
  const limited = embedded.scan(dir);
  assert.equal(limited.state, 'detected');
  assert.equal(limited.partial, true);
  assert.deepEqual(limited.warnings, ['EMBEDDED_BYTE_BUDGET']);
  assert.equal(limited.sources.length, 0);
  const archive = folder(t);
  fs.writeFileSync(path.join(archive, 'SceneZH.pck'), 'signature by name only');
  const report = embedded.scan(archive);
  assert.equal(report.state, 'detected');
  assert.equal(report.engine, 'SiglusEngine');
  assert.equal(report.canRestore, false);
});

test('does not scan an external Unity streaming directory linked into the game', t => {
  const dir = folder(t), external = folder(t);
  const data = path.join(dir, 'Game_Data');
  fs.mkdirSync(data);
  fs.writeFileSync(path.join(dir, 'Game.exe'), 'fixture, never execute');
  fs.writeFileSync(path.join(external, 'fake.scenarios.asset'), 'must not be read');
  fs.symlinkSync(external, path.join(data, 'StreamingAssets'), 'junction');
  const result = embedded.scan(dir);
  assert.equal(result.state, 'detected');
  assert.deepEqual(result.sources, []);
  assert.deepEqual(result.warnings, []);
});

const manosaba = process.env.MEGULIT_TEST_MANOSABA_DIR;
test('Manosaba installed addressable scripts are diagnosed without changing the checked files', { skip: !manosaba }, () => {
  const bundles = localizationBundles(manosaba);
  assert.ok(bundles.length > 10);
  const checked = [...bundles, path.join(manosaba, 'manosaba_Data', 'ScriptingAssemblies.json')];
  const before = checked.map(hash);
  const result = embedded.scan(manosaba);
  assert.equal(result.state, 'read-only');
  assert.equal(result.engine, 'Unity (Naninovel)');
  assert.ok(result.coverage.japaneseLines > 30000);
  assert.ok(result.coverage.localTranslations > 30000);
  assert.equal(result.sources.length, bundles.length);
  assert.equal(result.scanToken, '');
  assert.equal(result.canRestore, false);
  assert.equal(result.partial, false);
  assert.deepEqual(checked.map(hash), before);
});
