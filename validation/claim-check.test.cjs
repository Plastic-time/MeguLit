// SPDX-License-Identifier: GPL-3.0-or-later
/* tools/claim-check.cjs reads HANDOFF.md tables and sorts its arguments; the gh and git calls are not exercised here. */
const test = require('node:test'), assert = require('node:assert/strict');
const { classifyArgs, overlap, tableRows, branchesIn } = require('../tools/claim-check.cjs');

const HANDOFF = `# HANDOFF
## 已适配的游戏

| 游戏 | VNDB | 发行版 | 引擎 | 状态 | 谁 | PR / seed |
|---|---|---|---|---|---|---|
| 千恋＊万花 | v19073 | 待补 | KiriKiri | verified | 魚魚棟 | kirikiri/senren-banka |

## 进行中

| 谁 | 做什么 | issue | 分支 | 开始 | 状态 |
|---|---|---|---|---|---|
| 魚魚棟 | 名字框 | — | fix/revert-1436、fix/speaker-name-channel | 11-29 | 等 CI |
| 魚魚棟 | 文库迁移 | — | （未开） | 11-29 | 暂停 |
`;

test('arguments split into keywords, files and VNDB works', () => {
  const r = classifyArgs(['原声', 'services/reader.cjs', 'web/', 'V19073', 'HANDOFF.md', '--no-fetch'], new Set(['HANDOFF.md']));
  assert.deepEqual(r.keywords, ['原声']);
  assert.deepEqual(r.files, ['services/reader.cjs', 'web/', 'HANDOFF.md']);
  assert.deepEqual(r.vndb, ['v19073']);
  assert.equal(r.fetch, false);
});

test('a trailing slash covers the directory, a plain path only itself', () => {
  assert.deepEqual(overlap(['web/'], ['web/app.js', 'services/reader.cjs']), ['web/app.js']);
  assert.deepEqual(overlap(['web/app.js'], ['web/app.json', 'web/app.js']), ['web/app.js']);
});

test('table rows come from their own section only, without header and divider', () => {
  const doing = tableRows(HANDOFF, '进行中');
  assert.equal(doing.length, 2);
  assert.equal(doing[0][1], '名字框');
  assert.deepEqual(tableRows(HANDOFF, '已适配的游戏').map((r) => r[1]), ['v19073']);
  assert.deepEqual(tableRows(HANDOFF, '没有这节'), []);
});

test('branch cells list several branches and skip placeholders', () => {
  assert.deepEqual(branchesIn('fix/revert-1436、fix/speaker-name-channel'), ['fix/revert-1436', 'fix/speaker-name-channel']);
  assert.deepEqual(branchesIn('（未开）'), []);
});
