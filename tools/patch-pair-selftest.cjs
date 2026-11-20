// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
/* Offline pairing self-test (2026-11-21, owner: 「这是官方的中文，不可能会对不上，没对上那就是我们的问题」): every line of a game's imported
   script is looked up the way the running game hands it over, in each form the hook may give (as written; the speaker taken off by the name
   plate; without the outer brackets; half-width; ruby markup; blanks; a line break), through the same lookup the reader uses
   (core/hook-native.cjs resolveSource).
   Lines that are no dialogue (HookNative.nonDialogue, or a short label repeated all over the script) are counted apart and never looked up.
   Rows the table leaves in Japanese are counted apart too (the running game fills them), split into scenes the release left wholly in
   Japanese (out of the table) and single rows.
   Prints lookups / paired / unpaired / nonDialogue with the reasons; exit 1 when anything is unpaired.
   Usage: node tools/patch-pair-selftest.cjs <MeguLit root> (<game exe> | --id <game id>) [--json]

   2026-11-21 (pair-uncertain):
   - reading as in play: each form is one pass over every script line in order, with one provider and one reader (its line cache included);
     a line without that form, or one the table leaves in Japanese, is read as written and not counted, so the reading position moves as in
     play. A pairing that took another place of the line, translated differently, is unpaired ('wrong place'), not paired.
   - modes: 'game' scans the game the way the app does at launch, into a scratch copy of the settings (the MeguLit root is only read), so a
     stored state an older reader left behind (DDLC Plus: runtime read by the generic Unity reader) does not hide the pairing; 'stored script'
     is the same lookup over the imported script when the game files are gone or changed (WITCH ON THE HOLY NIGHT uninstalled); 'table' is the
     plain table when neither can be built. */
const fs = require('node:fs'), os = require('node:os'), path = require('node:path');
const ot = require('../services/original-text.cjs'), { HookNative } = require('../core/hook-native.cjs');
const args = process.argv.slice(2), json = args.includes('--json'), pos = args.filter(a => a !== '--json'), root = path.resolve(pos[0] || '');
if (!pos[0] || !pos[1]) { console.error('usage: node tools/patch-pair-selftest.cjs <MeguLit root> (<game exe> | --id <game id>) [--json]'); process.exit(2); }
const settings = path.join(root, 'data', 'config', 'original-text.json'), all = JSON.parse(fs.readFileSync(settings, 'utf8'));
const runningDir = rt => (ot.ADAPTERS[rt.engine || 'system4']?.folder ? rt.file : path.dirname(rt.file));
let id = pos[1] === '--id' ? pos[2] : null;
if (!id) { const dir = path.dirname(path.resolve(pos[1])).toLowerCase(), same = d => d && (path.resolve(d).toLowerCase() === dir || path.dirname(path.resolve(d)).toLowerCase() === dir);
  id = Object.keys(all).find(k => all[k]?.runtime?.file && path.resolve(runningDir(all[k].runtime)).toLowerCase() === dir) || Object.keys(all).find(k => { const s = all[k]; return s?.runtime?.index && [s.runtime.file, s.patch?.dir, s.gameDir].some(same); }); }
let state = all[id]; if (!state?.runtime?.index) { console.error('no imported script for ' + pos.slice(1).join(' ')); process.exit(2); }
const exe = pos[1] === '--id' ? path.join(runningDir(state.runtime), 'game.exe') : path.resolve(pos[1]);
/* the app's launch scan, into a scratch copy of the settings */
const scratch = fs.mkdtempSync(path.join(process.env.MEGULIT_SELFTEST_TMP || os.tmpdir(), 'pair-selftest-'));
fs.mkdirSync(path.join(scratch, 'data', 'config'), { recursive: true }); fs.copyFileSync(settings, path.join(scratch, 'data', 'config', 'original-text.json'));
if (fs.existsSync(path.dirname(exe))) try { const s = ot.scanRunning(scratch, id, exe, { noBackup: true }); if (s?.runtime?.index) state = s; } catch {}
let mode = 'game', make = () => { try { return ot.provider(scratch, exe); } catch { return null; } };
if (!make()) { state = all[id]; mode = 'stored script'; make = () => { try { return ot.provider(root, exe, { indexOnly: true }); } catch { return null; } }; }
const tableIndex = state.patch?.index && state.patchStatus === 'ready' ? state.patch.index : state.original?.index;
if (!tableIndex) { console.error('no pairing table for ' + exe + ' (status ' + (state.status || '?') + ')'); process.exit(2); }
const lines = JSON.parse(fs.readFileSync(state.runtime.index, 'utf8')).lines, zh = JSON.parse(fs.readFileSync(tableIndex, 'utf8')).lines;
const rt = JSON.parse(fs.readFileSync(state.runtime.index, 'utf8'));
/* the table itself, following the reading position like the game's lookup: normal key -> its rows; the first row after the last one read */
const tableProvider = () => { const map = new Map(), norm = t => String(t || '').replace(/[\s　]+/g, ''); let last = -1;
  lines.forEach((l, i) => { const k = norm(l), z = String(zh[i] || '').trim(); if (!k || !z) return; (map.get(k) || map.set(k, []).get(k)).push(i); });
  return { kind: 'patch', resolve: t => { const rows = map.get(norm(t)); if (!rows) return { status: 'none' }; const i = rows.find(r => r > last) ?? rows[0]; last = i; return { status: 'exact', translation: String(zh[i]).trim(), indices: [i] }; } }; };
if (!make()) { mode = 'table'; make = tableProvider; }
const counts = new Map(); for (const l of lines) { const t = String(l || '').trim(); counts.set(t, (counts.get(t) || 0) + 1); }
const label = t => counts.get(t) >= 10 && [...t].length <= 8 && !/[。、！？!?…「『（]/.test(t);
const forms = t => {
  const out = [['as written', t]];
  /* only what a name plate takes in play: an unknown speaker ？？？ (a first word with a space is often no speaker: 『浜田　和紀』) */
  const m = /^([「『])([？?]{2,})[\s　]+(.*)$/s.exec(t); if (m) out.push(['speaker taken off', m[1] + m[3]]);
  /* the outer pair only when it is one pair (「…」 or 『…』 around the whole line, not 『楽園』…」) */
  if (/^「[^]*」$/.test(t) && !/^「[^「」]*」[^」]/.test(t) || /^『[^]*』$/.test(t) && !/^『[^『』]*』[^』]/.test(t)) out.push(['no brackets', t.slice(1, -1)]);
  const half = t.replace(/[０-９Ａ-Ｚａ-ｚ]/g, c => String.fromCharCode(c.charCodeAt(0) - 0xFEE0)); if (half !== t) out.push(['half-width', half]);
  const k = /[一-龯々]{1,3}/.exec(t); if (k) out.push(['ruby markup', t.slice(0, k.index) + '｜' + k[0] + '《よみ》' + t.slice(k.index + k[0].length)]);
  out.push(['blanks', t.replace(/、/g, '、　')]);
  if (t.length > 12) { let at = Math.ceil(t.length / 2); for (const m of t.matchAll(/%[^;%\n]{0,40};|#[0-9a-fA-F]{6,8};|\[[^\]\n]{0,12}\]/g)) if (at > m.index && at < m.index + m[0].length) at = m.index + m[0].length; if (at < t.length) out.push(['line break', t.slice(0, at) + '\n' + t.slice(at)]); } /* never inside an engine tag */
  return out;
};
/* a row the patch leaves in Japanese (empty, or the Japanese itself with kana) has no human translation to pair: counted apart (the running game fills it: fill / machine translation) */
const untranslatedRow = i => { const z = String(zh[i] || '').trim(), j = String(lines[i] || '').trim(); return !z || z.replace(/\s/g, '') === j.replace(/\s/g, '') && /[ぁ-ゖァ-ヺ]{2}/.test(j); };
/* scenes the release left in Japanese (95 % of their kana rows or more: a few rows read the same in Chinese) */
const sceneOf = (() => { const sizes = Array.isArray(rt.sizes) ? rt.sizes : [lines.length], at = new Int32Array(lines.length); let i = 0; sizes.forEach((n, s) => { for (let k = 0; k < n && i < lines.length; k++) at[i++] = s; }); return at; })();
const outScenes = (() => { const kept = new Map(), seen = new Map(); lines.forEach((t, i) => { if (!/[ぁ-ゖァ-ヺ]{2}/.test(String(t || ''))) return; const s = sceneOf[i]; seen.set(s, (seen.get(s) || 0) + 1); if (untranslatedRow(i)) kept.set(s, (kept.get(s) || 0) + 1); }); const out = new Set(); for (const [s, n] of seen) if ((kept.get(s) || 0) >= n * 0.95) out.add(s); return out; })();
const key = t => String(t ?? '').replace(/\s+/g, '');
/* a translation that differs only by the outer brackets is the same: the hook gave the line without them */
const bare = t => key(t).replace(/^[「『“"]+|[」』”"]+$/g, '');
const samePlace = (a, b) => a === b || bare(lines[a]) === bare(lines[b]) && bare(zh[a]) === bare(zh[b]);
let total = 0, paired = 0, nonDialogue = 0, untranslated = 0, outOfTable = 0; const misses = {}, skipped = [], kinds = ['as written', 'speaker taken off', 'no brackets', 'half-width', 'ruby markup', 'blanks', 'line break'];
for (const kind of kinds) {
  const hh = { originalText: make(), trace() {}, resolveSource: HookNative.prototype.resolveSource }; let prev = -1;
  lines.forEach((raw, i) => { const t = String(raw || '').trim(); if (!t || !/[぀-ヿ一-鿿]/.test(t)) return;
    if (HookNative.nonDialogue(t) || label(t)) { if (kind === 'as written') { nonDialogue++; if (skipped.length < 8) skipped.push(t.slice(0, 30)); } return; }
    const f = forms(t).find(x => x[0] === kind);
    if (untranslatedRow(i) || !f) { if (untranslatedRow(i) && kind === 'as written') { untranslated++; if (outScenes.has(sceneOf[i])) outOfTable++; } hh.resolveSource(t); prev = i; return; } /* read as written: the reading goes on */
    total++; const r = hh.resolveSource(f[1]); let why = null;
    if (!r || !(r.status === 'exact' || r.status === 'high')) why = (r?.status || 'none') + ':' + (r?.method || '');
    else if (Array.isArray(r.indices) && r.indices.length && !r.indices.some(j => samePlace(j, i))) why = prev === r.indices.at(-1) && key(lines[prev]) === key(t) ? 'same words twice in a row (read as the line just before drawn again; its own translation of the same words)' : 'wrong place (another occurrence, translated differently)';
    prev = i; if (!why) { paired++; return; }
    const byKind = misses[kind] || (misses[kind] = {}), m = byKind[why] || (byKind[why] = { count: 0, examples: [] });
    m.count++; if (m.examples.length < 5) m.examples.push([i, t.slice(0, 60), String(zh[i] ?? '').slice(0, 40), r?.indices?.[0] ?? r?.candidates ?? null]); });
}
const reasons = {}; for (const byKind of Object.values(misses)) for (const [why, m] of Object.entries(byKind)) reasons[why] = (reasons[why] || 0) + m.count;
try { fs.rmSync(scratch, { recursive: true, force: true }); } catch {}
const report = { mode, engine: state.runtime.engine, lookups: total, paired, unpaired: total - paired, reasons, nonDialogue, untranslatedInPatch: untranslated, untranslatedOutOfTable: outOfTable, scenesOutOfTable: outScenes.size, nonDialogueExamples: skipped, byForm: misses };
console.log(json ? JSON.stringify(report) : JSON.stringify(report, null, 1));
process.exit(total === paired ? 0 : 1);
