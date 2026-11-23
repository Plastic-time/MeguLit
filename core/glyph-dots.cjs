// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
/* Text architecture ① in the normal launch flow (docs/text-architecture.md, "Early injection", "Placement").
   When 文字显示 places MeguLit's text over the game (data/config/gal-preferences.json textRenderer "placed", or the older
   "compositor" value), or MEGULIT_GLYPH_MODE=place|dot is set:
   - a game MeguLit starts itself as a plain process goes through native/MeguLitLaunch<bit>.exe, which loads
     MeguLitFont<bit>.dll before the game's main thread runs (with the dialogue font this game taught earlier);
   - HookBridge starts in that mode for every write-back and read-only stream (all).
   The mode is "blank" (blank glyphs + per-character records with on-screen cell origins, for the reader overlay; not
   blind: a blind blank in the dialogue font would also erase names and menus the overlay never draws). "dot" (the retired
   capture compositor's dot glyphs, blind) only with MEGULIT_CAPTURE_COMPOSITOR=1 or MEGULIT_GLYPH_MODE=dot.
   Steam launches keep the late attach here (feat/text-paths starts the exe directly where it can). */
const fs = require('node:fs'), path = require('node:path');

/* 'place', 'dot' or '' (off). */
function mode(root) {
  if(require('./library-mode.cjs').libraryOnly(root))return '';
  const env = process.env.MEGULIT_GLYPH_MODE;
  /* 2026-11-21 (owner: 打点可以不要了，精度差、容易漏点) dot glyphs are retired: every request for them is the blank mode */
  if (env === 'dot' || env === 'blank' || env === 'place') return 'blank';
  try { const r = JSON.parse(fs.readFileSync(path.join(root, 'data', 'config', 'gal-preferences.json'), 'utf8').replace(/^\uFEFF/, '')).textRenderer; if (r !== 'placed' && r !== 'compositor') return ''; } catch { return ''; }
  return 'blank';
}
function wanted(root) { return !!mode(root); }
/* Extra environment for HookBridge.exe. */
function bridgeEnv(root) {
  const m = mode(root);
  return !m ? {} : m === 'dot' ? {MEGULIT_GLYPH_MODE: 'dot', MEGULIT_GLYPH_ALL: '1', MEGULIT_GLYPH_BLIND: '1'} : {MEGULIT_GLYPH_MODE: 'blank', MEGULIT_GLYPH_ALL: '1'};
}
/* The dialogue font HookBridge remembered for this exact program (data/glyph-hide/<name>-<size>.json, the name with
   the characters HookBridge's MemoryPath replaces turned into _), as "<px> <face>". */
function seed(root, exe) {
  try {
    const size = fs.statSync(exe).size, key = path.basename(exe).replace(/[^A-Za-z0-9._-]/g, '_') + '-' + size;
    const j = JSON.parse(fs.readFileSync(path.join(root, 'data', 'glyph-hide', key + '.json'), 'utf8'));
    const px = Number(j.size), face = String(j.face || '');
    if (px > 0 && px < 1000 && face && face.length <= 64 && !/[\r\n]/.test(face)) return px + ' ' + face;
  } catch {}
  return '';
}
/* {file,args,env} to start exe through the early-injection launcher, or null (setting off, binaries missing). */
function earlyStart(root, exe, args, x86, baseEnv = process.env) {
  const m = mode(root);
  if (!m) return null;
  const bit = x86 ? '32' : '64', file = path.join(root, 'native', 'MeguLitLaunch' + bit + '.exe'), dll = path.join(root, 'native', 'MeguLitFont' + bit + '.dll');
  if (!fs.existsSync(file) || !fs.existsSync(dll)) return null;
  const env = {...baseEnv, MEGULIT_GLYPH_MODE: m === 'dot' ? 'dot-blind' : 'blank'}, font = seed(root, exe);
  if (font) env.MEGULIT_GLYPH_FONT = font; else delete env.MEGULIT_GLYPH_FONT;
  return {file, args: [dll, exe, ...args], env};
}
/* 日文环境: the launcher creates the game through Locale Emulator's LoaderDll (ja-JP, cp932), still suspended. LoaderDll
   finds LocaleEmulator.dll beside the process that calls it, so a copy of MeguLitLaunch32.exe is kept in the LE folder
   (refreshed when the shipped one changes). Returns null when off or when the copy cannot be placed (LEProc is used). */
function earlyLocale(root, leDir, exe, baseEnv = process.env) {
  const start = earlyStart(root, exe, [], true, baseEnv);
  if (!start || !leDir) return null;
  try {
    const copy = path.join(leDir, 'MeguLitLaunch32.exe'), a = fs.statSync(start.file);
    let b = null; try { b = fs.statSync(copy); } catch {}
    if (!b || b.size !== a.size || b.mtimeMs < a.mtimeMs) fs.copyFileSync(start.file, copy);
    return {file: copy, args: start.args, env: {...start.env, MEGULIT_LAUNCH_LE: leDir}};
  } catch { return null; }
}
module.exports = {mode, wanted, bridgeEnv, seed, earlyStart, earlyLocale};
