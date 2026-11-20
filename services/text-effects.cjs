// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
/* Games whose text effect cannot be hidden line by line (2026-11-21, ファタモルガーナの館): read mode is remembered per executable in
   data/config/text-effects.json; 切回隐藏 (the user's own 隐藏游戏原文) removes the entry. */
const fs = require('fs'), path = require('path');
const file = root => path.join(root, 'data', 'config', 'text-effects.json');
const key = exe => String(exe || '').toLowerCase();
function load(root) { try { const v = JSON.parse(fs.readFileSync(file(root), 'utf8').replace(/^\uFEFF/, '')); return v && typeof v === 'object' && !Array.isArray(v) ? v : {}; } catch { return {}; } }
function store(root, v) { const f = file(root); fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f + '.tmp', JSON.stringify(v, null, 2)); fs.renameSync(f + '.tmp', f); }
module.exports = {
  has: (root, exe) => !!exe && !!load(root)[key(exe)],
  set(root, exe, info = {}) { if (!exe) return; const v = load(root); v[key(exe)] = { readMode: true, at: new Date().toISOString(), ...info }; store(root, v); },
  clear(root, exe) { const v = load(root); if (!(key(exe) in v)) return; delete v[key(exe)]; store(root, v); }
};
