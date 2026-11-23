// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
/* read mode for a text-effect game is remembered per executable (data/config/text-effects.json); 切回隐藏 removes it */
const assert = require('node:assert'), fs = require('node:fs'), os = require('node:os'), path = require('node:path');
const lib = require('../services/text-effects.cjs');
const root = fs.mkdtempSync(path.join(process.env.MEGULIT_TMP || os.tmpdir(), 'fx-'));
try {
  const exe = 'D:\Games\Fata\fata.exe';
  assert.ok(!lib.has(root, exe));
  lib.set(root, exe, { paired: 2, orphan: 4 });
  assert.ok(lib.has(root, exe.toUpperCase()), 'kept per exe, any case');
  assert.ok(!lib.has(root, 'D:\Games\Senren\senren.exe'), 'other games untouched');
  lib.clear(root, exe); assert.ok(!lib.has(root, exe), '切回隐藏 forgets it');
  console.log('PASS text effects store');
} finally { fs.rmSync(root, { recursive: true, force: true }); }
