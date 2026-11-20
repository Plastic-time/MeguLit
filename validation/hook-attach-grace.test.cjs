'use strict';
/* #468 (寒蝉 rig, 2026-11-20, fate2/base1420 logs): a bridge injecting into a Unity game that is still starting is silent for
   up to 12 s (it waits for the hook loader). The 12 s heartbeat ended it mid-handshake; the DLL stayed injected, never connected
   to the next bridges ("already injected", bridge-shutdown every ~20 s) and the game hung. Until the bridge reports the process
   attached it gets 45 s; once attached the 12 s heartbeat holds again. */
const test = require('node:test'), assert = require('node:assert/strict'), fs = require('node:fs'), os = require('node:os'), path = require('node:path');
const { EventEmitter } = require('node:events'), { PassThrough } = require('node:stream'), { HookNative } = require('../core/hook-native.cjs');

function rig() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'grace-')); fs.writeFileSync(path.join(dir, 'HookBridge.exe'), '');
  const hook = path.join(dir, 'hook'); fs.mkdirSync(hook); for (const n of ['LunaHost64.dll', 'LunaHook32.dll', 'LunaHook64.dll']) fs.writeFileSync(path.join(hook, n), '');
  let now = 1e6; const kills = []; let child = null;
  const spawn = () => { const c = new EventEmitter(); c.stdout = new PassThrough(); c.stderr = new PassThrough(); c.stdin = new PassThrough(); c.pid = 7; c.kill = () => kills.push(now); child = c; return c; };
  const h = new HookNative({ native: dir, hook, logs: dir }, () => {}, spawn, () => now); clearInterval(h.timer); h.trace = () => {};
  h.configure({ hookAutoStart: true, bindEnabled: true, hookProfile: 'embed', maskMode: 'hook' }, { gameProcessId: process.pid, gameHwnd: '123', processName: 'Game', gameStarted: '6393074252169613', bound: true });
  return { h, kills, dir, say: m => child.stdout.write(JSON.stringify(m) + '\n'), at: ms => { now = 1e6 + ms; h.tick(); } };
}

test('a bridge still injecting is not ended at 12 s; it is at 45 s', async () => {
  const r = rig();
  try { r.at(13000); assert.deepEqual(r.kills, [], 'silent while injecting: kept'); r.at(46000); assert.equal(r.kills.length, 1, 'no word for 45 s: ended'); }
  finally { r.h.stop?.(); fs.rmSync(r.dir, { recursive: true, force: true }); }
});

test('once the process is attached the 12 s heartbeat holds', async () => {
  const r = rig();
  try {
    r.say({ type: 'hookStatus', processAttached: true, hookActive: false }); await new Promise(res => setImmediate(res));
    r.at(13000); assert.equal(r.kills.length, 1, 'attached and silent for 13 s: ended as before');
  } finally { r.h.stop?.(); fs.rmSync(r.dir, { recursive: true, force: true }); }
});
