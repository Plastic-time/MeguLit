// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
/* Offline pairing self-test (2026-11-21, owner: 「这是官方的中文，不可能会对不上，没对上那就是我们的问题」): every line of a game's imported
   script is looked up the way the running game hands it over, in each form the hook may give (as written; the speaker taken off by the name
   plate; without the outer brackets; with blanks and line breaks; with ruby markup), through the same lookup the reader uses
   (core/hook-native.cjs resolveSource). Prints total / paired / unpaired with the reasons; exit 1 when anything is unpaired.
   Usage: node tools/patch-pair-selftest.cjs <MeguLit root> <game exe> */
const path = require('node:path');
const ot = require('../services/original-text.cjs'), { HookNative } = require('../core/hook-native.cjs');
const [root, exe] = process.argv.slice(2);
if (!root || !exe) { console.error('usage: node tools/patch-pair-selftest.cjs <MeguLit root> <game exe>'); process.exit(2); }
const provider = ot.provider(path.resolve(root), path.resolve(exe));
if (!provider) { console.error('no imported script for ' + exe); process.exit(2); }
const dir = path.dirname(path.resolve(exe)).toLowerCase(), state = Object.values(require(path.join(path.resolve(root), 'data', 'config', 'original-text.json'))).find(s => s?.runtime?.index && [s.runtime.file, s.patch?.dir].some(d => d && (path.resolve(d).toLowerCase() === dir || path.dirname(path.resolve(d)).toLowerCase() === dir)));
const lines = require(state.runtime.index).lines;
const h = { originalText: provider, trace() {}, resolveSource: HookNative.prototype.resolveSource };
const forms = t => {
  const out = [['as written', t]];
  const m = /^([「『])([？?]{2,}|[一-龯々ァ-ヶー・]{1,8})[\s　]+(.*)$/s.exec(t); if (m) out.push(['speaker taken off', m[1] + m[3]]);
  if (/^[「『].*[」』]$/s.test(t)) out.push(['no brackets', t.slice(1, -1)]);
  if (t.length > 12) out.push(['line break', t.slice(0, Math.ceil(t.length / 2)) + '\n' + t.slice(Math.ceil(t.length / 2))]);
  return out;
};
let total = 0, paired = 0; const misses = {};
lines.forEach((raw, i) => { const t = String(raw || '').trim(); if (!t || !/[぀-ヿ一-鿿]/.test(t)) return;
  for (const [kind, v] of forms(t)) { total++; const r = h.resolveSource(v); if (r && (r.status === 'exact' || r.status === 'high')) paired++; else (misses[kind] = misses[kind] || []).push([i, t]); } });
console.log(JSON.stringify({ lookups: total, paired, unpaired: total - paired, byForm: Object.fromEntries(Object.entries(misses).map(([k, v]) => [k, { count: v.length, examples: v.slice(0, 5) }])) }, null, 1));
process.exit(total === paired ? 0 : 1);
