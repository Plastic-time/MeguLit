// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const original = require('../services/original-text.cjs');
const { scan } = require('../services/embedded-japanese.cjs');
const { census } = require('../services/align-sample.cjs');
const { cases } = require('./helpers/align-sample-fixtures.cjs');
const dbs = require('./helpers/siglus-dbs-table.cjs');

test('Japanese backups and interface translations cannot enable the native script provider', async t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'megulit-zero-coverage-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const game = path.join(root, 'games', 'installed');
  const exe = path.join(game, 'SiglusEngine_Steam.exe');
  const dat = path.join(game, 'dat');
  const backup = path.join(game, '.megulit-japanese', 'dat');
  const side = path.join(game, '..', 'chinese', 'dat');
  const store = path.join(root, 'store');
  for (const dir of [dat, backup, side]) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(exe, 'fixture, never execute');
  fs.writeFileSync(path.join(backup, '..', 'manifest.json'), JSON.stringify({ adapter: 'siglus-dbs' }));
  const { ja, zh } = cases(6);
  const words = ['音量を変更します', '画面を切り替えます', '表示を元に戻します'];
  const menu = ['调整音量', '切换画面', '恢复显示'];
  const story = (chinese, offset = 0) => dbs(ja.map((line, i) => ['【登場人物】', line, chinese[i], i * 10 + offset]), [50, 0, 2, 500]);
  const ui = values => dbs(words.map((line, i) => [line, values[i], i * 10]), [0, 2, 500]);
  fs.writeFileSync(path.join(dat, 'text00.dbs'), story(ja));
  fs.writeFileSync(path.join(backup, 'text00.dbs'), story(ja));
  fs.writeFileSync(path.join(dat, 'config_options.dbs'), ui(words));
  fs.writeFileSync(path.join(backup, 'config_options.dbs'), ui(menu));
  fs.writeFileSync(path.join(side, 'text00.dbs'), story(zh, 1)); // same length, different serials
  const db = { prepare: () => ({ get: () => ({ executable: exe }) }) };

  const report = scan(game);
  assert.equal(report.state, 'read-only');
  assert.equal(report.coverage.localTranslations, 0);
  assert.deepEqual(report.sources.map(source => path.basename(source.path)), ['config_options.dbs', 'text00.dbs']);
  assert.equal(report.canRestore, false);
  assert.ok((await original.autoPatch(store, db, 'g', { drives: false, force: true })).notFound);
  const status = original.status(store, db, 'g');
  assert.equal(status.patchStatus, 'interface-only');
  assert.deepEqual(status.patch.coverage, {
    originalEntries: 9,
    script: { originalEntries: 6, translations: 0, paired: 0 },
    interface: { originalEntries: 3, translations: 3, paired: 3 },
  });
  assert.deepEqual(status.patch.sources, [path.join(backup, 'config_options.dbs')]);
  assert.equal(original.localPairs(store, db, 'g').hasPairs, false);

  const module = await import(pathToFileURL(path.join(__dirname, '../web/game-language.js')).href);
  const view = module.zeroPatchReport('zh', status);
  assert.match(view.text, /仅找到界面译文/);
  assert.match(view.text, /正文 0 条译文、已配对 0 \/ 6/);
  assert.match(view.text, /界面 3 条译文、已配对 3 \/ 3/);
  assert.equal(view.title, status.patch.sources[0]);

  fs.writeFileSync(path.join(side, 'text00.dbs'), story(zh));
  assert.ok((await original.autoPatch(store, db, 'g', { drives: false, force: true })).found);
  const ready = original.status(store, db, 'g');
  assert.equal(ready.patchStatus, 'ready');
  assert.deepEqual(ready.patch.coverage.script, { originalEntries: 6, translations: 6, paired: 6 });
  assert.equal(original.provider(store, exe).resolve(ja[0]).translation, zh[0]);
});

test('punctuation or character width changes alone are not translations', () => {
  const report = census(['姓名!', '設定 10'], ['姓名！', '設定１０']);
  assert.equal(report.total, 0);
  assert.equal(report.paired, 0);
});
