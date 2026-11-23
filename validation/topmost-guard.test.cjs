// SPDX-License-Identifier: GPL-3.0-or-later
// MeguLit's layers never hold the top of the user's desktop (user 2026-11-15: 「不要让幽灵窗口抢我桌面置顶」).
// Source rules plus the bridge's own stand-in-window self-test (off-screen tool windows, never activated: a "game", a
// "browser" in front of it and a topmost "layer"; the game is minimised from its own thread and closed).
'use strict';
const test = require('node:test'), assert = require('node:assert'), fs = require('node:fs'), path = require('node:path');
const root = path.join(__dirname, '..'), read = p => fs.readFileSync(path.join(root, p), 'utf8');

test('bridge: foreground hook installed, bound-game demotion goes through TopmostGuard.Sink, layers dropped when the game goes', () => {
  const s = read('native/GalWindowBridge.cs');
  assert.match(s, /TopmostGuard\.Install\(\(ev,h\)=>GuardLayers\(ev\)\)/);
  assert.match(s, /finally\{RevealGame\(Target\);TopmostGuard\.Uninstall\(\);/);
  assert.match(s, /if\(IsShown&&TopmostGuard\.Sink\(Overlay,GetAncestor\(Target,2\)\)\)/, 'another program in front: place the visible layer just above the game');
  assert.match(s, /Glass\.Follow\(Overlay,TranslationMode&&Target!=IntPtr\.Zero&&LayersMayFloat&&/, 'the topmost glass host only while the layer may float');
  assert.match(s, /Target=IntPtr\.Zero;DropLayers\(\);Restore\(\);/, 'game window gone: masks / markers / glass dropped');
  assert.match(s, /ModeFallbackAt=DateTime\.UtcNow;\s*DropLayers\(\);Restore\(\);/, 'game exit: masks / markers / glass dropped');
  const g = read('native/TopmostGuard.cs');
  assert.match(g, /SetWinEventHook\(Foreground,Foreground/); assert.match(g, /SetWinEventHook\(MinimizeStart,MinimizeEnd/);
});

test('every build of the bridge compiles TopmostGuard.cs', () => {
  assert.match(read('native/Build-GalWindowBridge.ps1'), /'TopmostGuard\.cs'/);
  assert.match(read('tools/build-reader-bridge.ps1'), /'TopmostGuard\.cs'/);
  const b = JSON.parse(read('native/native-builds.json')), bridge = (b.builds || b).find?.(x => x.name === 'galwindowbridge');
  assert.ok(bridge ? bridge.sources.includes('native/TopmostGuard.cs') : read('native/native-builds.json').includes('native/TopmostGuard.cs'));
});

test('compositor follows foreground / minimise events and never inserts itself after a topmost window', () => {
  const c = read('native/compositor/Compositor.cpp');
  assert.match(c, /SetWinEventHook\(EVENT_SYSTEM_FOREGROUND, EVENT_SYSTEM_FOREGROUND, nullptr, OnForeground/);
  assert.match(c, /SetWinEventHook\(EVENT_SYSTEM_MINIMIZESTART, EVENT_SYSTEM_MINIMIZEEND, nullptr, OnForeground/);
  assert.match(c, /WS_EX_TOPMOST\)\); steps\+\+\) above = GetWindow\(above, GW_HWNDPREV\)/);
});

const exe = path.join(root, 'native', 'GalWindowBridge.exe');
test('stand-in windows: layer under the program in front, down within 100 ms of a minimise, at the bottom when the game closed (when GalWindowBridge.exe is built)', { skip: !fs.existsSync(exe) }, () => {
  for (const mode of ['--topmost-guard-self-test', '--background-window-self-test']) {
    const r = require('node:child_process').spawnSync(process.execPath, [path.join(root,'tools/run-isolated.cjs'),exe,mode], { encoding: 'utf8', timeout:25000, windowsHide: true });
    assert.equal(r.status, 0, r.stdout + r.stderr);
    assert.match(r.stdout, /"passed":true/);
  }
});
