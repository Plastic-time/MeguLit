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
if (root && /^(?:[a-f0-9]{32}|[a-f0-9]{64})$/.test(challenge) &&
    path.resolve(process.argv[1] || '') === path.join(root, 'services', 'server.cjs')) {
  const enumerateWindows=process.env.MEGULIT_COLLECTOR_WINDOWS==='1';
  delete process.env.MEGULIT_COLLECTOR_WINDOWS;
  delete process.env.NODE_OPTIONS;
  delete process.env.MEGULIT_COLLECTOR_SESSION;
  const socket = net.createConnection('\\\\.\\pipe\\megulit-cardinal-' + challenge);
  socket.on('error', () => socket.destroy());
  const live=challenge.length===64;
  function write(frame) {
    if(socket.destroyed)return;
    if(socket.writableLength>262144){socket.destroy();return;}
    socket.write(JSON.stringify({challenge,servicePid:process.pid,...frame})+'\n');
  }
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
        if(live){
          if(name==='GalWindowBridge.exe' && !['ready','windows','bound','readerInput','hookVisual','choiceLocate'].includes(m.type))continue;
          if(name==='HookBridge.exe' && !['hookSource','hookChars','hookChoices','hookProcess','hookError','hookStatus','hookHeartbeat'].includes(m.type))continue;
        }
        if (!live && !enumerateWindows && !(name === 'GalWindowBridge.exe' ? ['ready','bound'].includes(m.type) : m.type === 'hookSource')) continue;
        if (socket.writableLength > 262144) { socket.destroy(); return; }
        write({kind:'native',wireNs:process.hrtime.bigint().toString(),bridgePid:child.pid,name,args,m});
      }
      if (pending.length > 65536) socket.destroy();
    });
    return child;
  };
  if(live){
    const {GalNative}=require(path.join(root,'core','gal-native.cjs'));
    const {DisplayPairs}=require(path.join(root,'core','cardinal','display-pairs.cjs'));
    const apply=GalNative.prototype.setGameProfile;
    GalNative.prototype.setGameProfile=function(profile,input){
      const result=apply.apply(this,arguments);
      if(this.profile===profile && input?.exe)write({kind:'profile',exe:input.exe,profile:this.profile});
      return result;
    };
    const {Reader}=require(path.join(root,'services','reader.cjs'));
    const deliver=Reader.prototype.emit;
    Reader.prototype.emit=function(event,data){
      const result=deliver.apply(this,arguments);
      if(event==='reader-event' && data && this.active() && Object.hasOwn(data,'hookChoices'))write({kind:'choices',choices:data.hookChoices});
      return result;
    };
    const send=GalNative.prototype.send;
    GalNative.prototype.send=function(message){
      const result=send.apply(this,arguments);
      if(message?.type==='hitRegions')write({kind:'regions',regions:message.regions});
      return result;
    };
    const source=DisplayPairs.prototype.source;
    DisplayPairs.prototype.source=function(text,options){
      const descriptor=source.apply(this,arguments);
      if(descriptor)write({kind:'episode',descriptor,sequence:this.current.sequence});
      return descriptor;
    };
    const observe=DisplayPairs.prototype.observe;
    DisplayPairs.prototype.observe=function(message,target){
      const accepted=observe.apply(this,arguments);
      if(accepted && this.current?.id===message.episode)write({kind:'ack',message,sequence:this.current.sequence});
      return accepted;
    };
  }
}
