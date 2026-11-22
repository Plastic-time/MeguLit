// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
// Loaded only in the collector-owned service. Observe the same native stdout as
// the normal reader without changing how it binds, translates, or renders.
const path = require('node:path');
const cp = require('node:child_process');
const net = require('node:net');
const { StringDecoder } = require('node:string_decoder');
const root = process.env.MEGULIT_ROOT;
const challenge = process.env.MEGULIT_COLLECTOR_SESSION;
if (root && /^[a-f0-9]{32}$/.test(challenge) &&
    path.resolve(process.argv[1] || '') === path.join(root, 'services', 'server.cjs')) {
  const enumerateWindows=process.env.MEGULIT_COLLECTOR_WINDOWS==='1';
  delete process.env.MEGULIT_COLLECTOR_WINDOWS;
  delete process.env.NODE_OPTIONS;
  delete process.env.MEGULIT_COLLECTOR_SESSION;
  const socket = net.createConnection('\\\\.\\pipe\\megulit-cardinal-' + challenge);
  socket.on('error', () => socket.destroy());
  const spawn = cp.spawn;
  cp.spawn = function (file, args, options) {
    const child = spawn.apply(this, arguments);
    const name = path.basename(file);
    if (!['GalWindowBridge.exe', 'HookBridge.exe'].includes(name) ||
        path.resolve(file) !== path.join(root, 'native', name) || !child.stdout) return child;
    let pending = '';
    const decoder = new StringDecoder('utf8');
    child.stdout.on('data', chunk => {
      if (socket.destroyed) return;
      pending += decoder.write(chunk);
      for (;;) {
        const end = pending.indexOf('\n');
        if (end < 0) break;
        const line = pending.slice(0, end);
        pending = pending.slice(end + 1);
        if (line.length > 65536) { socket.destroy(); return; }
        let m;
        try { m = JSON.parse(line); } catch { continue; }
        if (enumerateWindows && (name !== 'GalWindowBridge.exe' || m.type !== 'windows')) continue;
        if (!enumerateWindows && !(name === 'GalWindowBridge.exe' ? ['ready','bound'].includes(m.type) : m.type === 'hookSource')) continue;
        if (socket.writableLength > 262144) { socket.destroy(); return; }
        socket.write(JSON.stringify({ challenge, servicePid: process.pid, bridgePid: child.pid, name, args, m })+'\n');
      }
      if (pending.length > 65536) socket.destroy();
    });
    return child;
  };
}
