// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const Bg=require('../services/background-games.cjs');
test('automatic capture waits for idle and foreground launch waits until its helper has restored audio and exited',async()=>{
 const idle={idleMs:600000,ac:true,fullscreen:false,cpu:.02};
 assert.equal(await Bg.idle('',{reading:async()=>idle}),true);
 assert.equal(await Bg.idle('',{reading:async()=>({...idle,idleMs:0})}),false);
 let finish,stop=false,word='';const child={stdin:{end:()=>{stop=true;}},kill:()=>assert.fail('graceful stop must finish first')};
 Bg.capture({helper:'fake.exe',exe:'game.exe'},['game.exe','capture.dll','report','45'],v=>word=v,{execute:(_f,_a,opts,cb)=>{assert.equal(opts.windowsHide,true);finish=cb;return child;}});
 assert.equal(await Bg.idle('',{reading:async()=>idle}),false);
 let foregroundReady=false;const launch=Bg.foreground().then(()=>{foregroundReady=true;});
 await new Promise(r=>setImmediate(r));assert.equal(stop,true);assert.equal(foregroundReady,false);
 finish(null,'cancelled');await launch;assert.equal(word,'cancelled');assert.equal(foregroundReady,true);
 assert.equal(await Bg.idle('',{reading:async()=>idle}),false);
});
test('foreground audio recovery targets only a positive PID and is best effort',async()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'audio-launch-'));fs.mkdirSync(path.join(root,'native'));fs.writeFileSync(path.join(root,'native','ColdCapture64.exe'),'');
 try{let calls=0;const execute=(file,args,opts,cb)=>{calls++;assert.deepEqual(args,['--unmute','42']);assert.equal(opts.windowsHide,true);cb(null);};assert.equal(await Bg.unmute(root,0,{execute}),false);assert.equal(await Bg.unmute(root,42,{execute}),true);assert.equal(calls,1);assert.equal(await Bg.unmute(root,42,{execute:(_f,_a,_o,cb)=>cb(Error('device unavailable'))}),false);}finally{fs.rmSync(root,{recursive:true,force:true});}
});
test('native audio guard restores both original mute states and survives capture termination',()=>{
 const native=path.join(__dirname,'..','native'),cs=fs.readFileSync(path.join(native,'ColdCapture.cs'),'utf8'),desk=fs.readFileSync(path.join(native,'ColdDesk.cs'),'utf8');
 assert.match(cs,/while\(!stop&&!owner.HasExited\)/);assert.match(cs,/finally\{Restore\(\);\}/);assert.match(cs,/finally\{StopAudio\(\)/);assert.match(cs,/KILL_ON_JOB_CLOSE|Marshal.WriteInt32\(limits,16,0x2000\)/);
 assert.match(desk,/StopAudioGuards\(\);RestoreAudio\(\);TerminateJobObject/);
 const exe=path.join(native,'ColdCapture64.exe');if(fs.existsSync(exe)&&process.platform==='win32'){const {spawnSync}=require('node:child_process');const r=spawnSync(exe,['--audio-selftest'],{windowsHide:true,encoding:'utf8'});assert.equal(r.status,0,r.stdout+r.stderr);assert.match(r.stdout,/audio restore false\/true: pass/);}
});
