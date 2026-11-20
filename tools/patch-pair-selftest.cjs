// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
/* Offline pairing self-test (2026-11-21, owner: 「这是官方的中文，不可能会对不上，没对上那就是我们的问题」): every line of a game's imported
   script is looked up the way the running game hands it over, in each form the hook may give (as written; the speaker taken off by the name
   plate; without the outer brackets; half-width; ruby markup; blanks; a line break), through the same lookup the reader uses
   (core/hook-native.cjs resolveSource), one pass per form in script order (the provider follows the reading position, as in play).
   Lines that are no dialogue (HookNative.nonDialogue, or a short label repeated all over the script) are counted apart and never looked up.
   When the game's own lookup cannot be built (the game is not installed) the pairing table itself is used (mode "table").
   Prints lookups / paired / unpaired / nonDialogue with the reasons; exit 1 when anything is unpaired.
   Usage: node tools/patch-pair-selftest.cjs <MeguLit root> (<game exe> | --id <game id>) */
const path = require('node:path'), fs = require('node:fs');
const ot = require('../services/original-text.cjs'), { HookNative } = require('../core/hook-native.cjs');
const args = process.argv.slice(2), root = path.resolve(args[0] || '');
if (!args[0] || !args[1]) { console.error('usage: node tools/patch-pair-selftest.cjs <MeguLit root> (<game exe> | --id <game id>)'); process.exit(2); }
const all = JSON.parse(fs.readFileSync(path.join(root, 'data', 'config', 'original-text.json'), 'utf8'));
let id = args[1] === '--id' ? args[2] : null; const exe = id ? null : path.resolve(args[1]);
if (!id) { const dir = path.dirname(exe).toLowerCase(); id = Object.keys(all).find(k => { const s = all[k]; return s?.runtime?.index && [s.runtime.file, s.patch?.dir].some(d => d && (path.resolve(d).toLowerCase() === dir || path.dirname(path.resolve(d)).toLowerCase() === dir)); }); }
const state = all[id]; if (!state?.runtime?.index || !state?.patch?.index) { console.error('no imported script and patch for ' + (exe || id)); process.exit(2); }
const lines = JSON.parse(fs.readFileSync(state.runtime.index, 'utf8')).lines, zh = JSON.parse(fs.readFileSync(state.patch.index, 'utf8')).lines;
const live = () => { try { return exe ? ot.provider(root, exe) : null; } catch { return null; } };
/* the table itself, following the reading position like the game's lookup: normal key -> its rows; the first row after the last one read */
const tableProvider = () => { const map = new Map(), norm = t => String(t || '').replace(/[\s　]+/g, ''); let last = -1;
  lines.forEach((l, i) => { const k = norm(l), z = String(zh[i] || '').trim(); if (!k || !z) return; (map.get(k) || map.set(k, []).get(k)).push(i); });
  return { kind: 'patch', resolve: t => { const rows = map.get(norm(t)); if (!rows) return { status: 'none' }; const i = rows.find(r => r > last) ?? rows[0]; last = i; return { status: 'exact', translation: String(zh[i]).trim(), indices: [i] }; } }; };
const mode = live() ? 'game' : 'table';
const counts = new Map(); for (const l of lines) { const t = String(l || '').trim(); counts.set(t, (counts.get(t) || 0) + 1); }
const label = t => counts.get(t) >= 10 && [...t].length <= 8 && !/[。、！？!?…「『（]/.test(t);
const forms = t => {
  const out = [['as written', t]];
  const m = /^([「『])([？?]{2,}|[一-龯々ァ-ヶー・]{2,8})[\s　]+(.*)$/s.exec(t); if (m) out.push(['speaker taken off', m[1] + m[3]]);
  if (/^[「『].*[」』]$/s.test(t)) out.push(['no brackets', t.slice(1, -1)]);
  const half = t.replace(/[０-９Ａ-Ｚａ-ｚ]/g, c => String.fromCharCode(c.charCodeAt(0) - 0xFEE0)); if (half !== t) out.push(['half-width', half]);
  const k = /[一-龯々]{1,3}/.exec(t); if (k) out.push(['ruby markup', t.slice(0, k.index) + '｜' + k[0] + '《よみ》' + t.slice(k.index + k[0].length)]);
  out.push(['blanks', t.replace(/、/g, '、　')]);
  if (t.length > 12) { let at = Math.ceil(t.length / 2); for (const m of t.matchAll(/%[^;%\n]{0,40};|#[0-9a-fA-F]{6,8};|\[[^\]\n]{0,12}\]/g)) if (at > m.index && at < m.index + m[0].length) at = m.index + m[0].length; if (at < t.length) out.push(['line break', t.slice(0, at) + '\n' + t.slice(at)]); } /* never inside an engine tag */
  return out;
};
/* a row the patch leaves in Japanese (empty, or the Japanese itself with kana) has no human translation to pair: counted apart (the running game fills it: fill / machine translation) */
const untranslatedRow = i => { const z = String(zh[i] || '').trim(), j = String(lines[i] || '').trim(); return !z || z.replace(/\s/g, '') === j.replace(/\s/g, '') && /[ぁ-ゖァ-ヺ]{2}/.test(j); };
let total = 0, paired = 0, nonDialogue = 0, untranslated = 0; const misses = {}, skipped = [], kinds = ['as written', 'speaker taken off', 'no brackets', 'half-width', 'ruby markup', 'blanks', 'line break'];
for (const kind of kinds) { const p = live() || tableProvider(), hh = { originalText: p, trace() {}, resolveSource: HookNative.prototype.resolveSource };
  lines.forEach((raw, i) => { const t = String(raw || '').trim(); if (!t || !/[぀-ヿ一-鿿]/.test(t)) return;
    if (HookNative.nonDialogue(t) || label(t)) { if (kind === 'as written') { nonDialogue++; if (skipped.length < 8) skipped.push(t.slice(0, 30)); } return; }
    if (untranslatedRow(i)) { if (kind === 'as written') untranslated++; return; }
    const f = forms(t).find(x => x[0] === kind); if (!f) return; total++; const r = hh.resolveSource(f[1]);
    if (r && (r.status === 'exact' || r.status === 'high')) paired++; else (misses[kind] = misses[kind] || []).push([i, t, r?.status || 'none']); }); }
console.log(JSON.stringify({ mode, lookups: total, paired, unpaired: total - paired, nonDialogue, untranslatedInPatch: untranslated, nonDialogueExamples: skipped, byForm: Object.fromEntries(Object.entries(misses).map(([k, v]) => [k, { count: v.length, examples: v.slice(0, 5) }])) }, null, 1));
process.exit(total === paired ? 0 : 1);
