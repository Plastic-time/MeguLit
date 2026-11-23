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
  function closeTap(reason){
    if(!socket.destroyed)writeDiagnostic(reason);
    socket.destroy();
  }
  function writeDiagnostic(reason){
    try{require('node:fs').appendFileSync(path.join(root,'logs','cardinal-tap-stop.log'),reason+'\n');}catch{}
  }
  socket.on('error',error=>closeTap('pipe '+error.code));
  process.once('uncaughtExceptionMonitor',error=>writeDiagnostic('service exception '+String(error.message).slice(0,200)));
  process.once('exit',code=>writeDiagnostic('exit '+code));
  const live=challenge.length===64;
  function write(frame) {
    if(socket.destroyed)return;
    if(socket.writableLength>262144){closeTap('delivery backlog');return;}
    socket.write(JSON.stringify({challenge,servicePid:process.pid,...frame})+'\n');
  }
  // GalWindowBridge also emits screenshots/OCR payloads which are not Reader
  // observations. Bound the raw native stream separately from evidence IPC.
  const maxNativeRecord=8*1024*1024;
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
        if (line.length > maxNativeRecord) { closeTap(name+' raw record '+line.length); return; }
        let m;
        try { m = JSON.parse(line); } catch { continue; }
        if (enumerateWindows && (name !== 'GalWindowBridge.exe' || m.type !== 'windows')) continue;
        if(live){
          if(name==='GalWindowBridge.exe' && !['ready','windows','bound','readerInput','hookVisual','choiceLocate'].includes(m.type))continue;
          if(name==='HookBridge.exe' && !['hookSource','hookChars','hookChoices','hookProcess','hookError','hookStatus','hookHeartbeat'].includes(m.type))continue;
        }
        if (!live && !enumerateWindows && !(name === 'GalWindowBridge.exe' ? ['ready','bound'].includes(m.type) : m.type === 'hookSource')) continue;
        if (Buffer.byteLength(line)>64000) { closeTap(name+' evidence '+m.type+' '+line.length); return; }
        if (socket.writableLength > 262144) { closeTap('native delivery backlog'); return; }
        write({kind:'native',wireNs:process.hrtime.bigint().toString(),bridgePid:child.pid,name,args,m});
      }
      if (pending.length > maxNativeRecord) closeTap(name+' partial record '+pending.length);
    });
    return child;
  };
  if(live){
    const {GalNative}=require(path.join(root,'core','gal-native.cjs'));
    const {DisplayPairs}=require(path.join(root,'core','cardinal','display-pairs.cjs'));
    const target=process.env.MEGULIT_DIALOGUE_TARGET;
    delete process.env.MEGULIT_DIALOGUE_TARGET;
    let boundGal;
    if(target){
      const {HookNative}=require(path.join(root,'core','hook-native.cjs'));
      // This run uses the engine callback as its sole source.
      HookNative.prototype.start=function(){};
      const decoder=new StringDecoder('utf8');
      let buffer='',sequence=0;
      socket.on('data',chunk=>{
        buffer+=decoder.write(chunk);
        let end;
        while((end=buffer.indexOf('\n'))>=0){
          if(end>65536)throw Error('LIVE_DIALOGUE_LIMIT');
          const frame=JSON.parse(buffer.slice(0,end));buffer=buffer.slice(end+1);
          const state=boundGal?.state;
          if(frame.challenge!==challenge || frame.sequence!==++sequence || !state?.bound ||
              String(state.gameProcessId)+'|'+state.gameStarted!==target)throw Error('LIVE_DIALOGUE_BINDING');
          const m={type:'hookSource',origin:'live',text:frame.text,sourceName:'RenPyCharacterCallback'};
          write({kind:'gameDialogue',wireNs:process.hrtime.bigint().toString(),m,sequence});
          boundGal.hooks.source(m,m.sourceName);
        }
        if(buffer.length>65536)throw Error('LIVE_DIALOGUE_LIMIT');
      });
    }
    const apply=GalNative.prototype.setGameProfile;
    GalNative.prototype.setGameProfile=function(profile,input){
      const result=apply.apply(this,arguments);
      if(target)boundGal=this;
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
    const setPolicy=DisplayPairs.prototype.setPolicy;
    DisplayPairs.prototype.setPolicy=function(message,target){
      const result=setPolicy.apply(this,arguments);
      if(result?.descriptor)write({kind:'pairPolicy',descriptor:result.descriptor,sequence:this.current.sequence});
      return result;
    };
    const observe=DisplayPairs.prototype.observe;
    DisplayPairs.prototype.observe=function(message,target){
      const accepted=observe.apply(this,arguments);
      if(accepted && this.current?.id===message.episode)write({kind:'ack',message,sequence:this.current.sequence});
      return accepted;
    };
  }
}
