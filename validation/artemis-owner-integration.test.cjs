// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os'),crypto=require('node:crypto');
const {spawn}=require('node:child_process'),{once}=require('node:events');
const O=require('../core/owner-tests.cjs'),A=require('../core/artemis-session.cjs'),L=require('../core/text-paths-launch.cjs');
const digest=b=>crypto.createHash('sha256').update(b).digest('hex');
function fixture(t){
 const temp=fs.mkdtempSync(path.join(os.tmpdir(),'megulit-artemis-owner-joint-')),root=path.join(temp,'private'),game=path.join(temp,'fixture-game'),exe=path.join(game,'fixture.exe');
 for(const d of ['data/config','cache','logs'])fs.mkdirSync(path.join(root,d),{recursive:true});fs.mkdirSync(game);
 const write=(name,value)=>fs.writeFileSync(path.join(root,'data/config',name),JSON.stringify(value));
 const library=libraryOnly=>write('library.json',{runtimeSampleShare:false,autoProfileShare:false,sharedAdaptation:false,libraryOnly});library(false);write('online.json',{relayUrl:''});
 // Only copy the exact EXE and three small Lua members into a disposable synthetic archive, never run the game
 const source='H:/MeguLit-Work/samples/amakano3-trial',modules=A._internal.effectiveModules(source).modules;
 fs.copyFileSync(path.join(source,'Amakano3_tr.exe'),exe);const bytes=require('../core/artemis-language.cjs')._internal.pf8(Object.entries(modules).map(([name,data])=>({name,data})));fs.writeFileSync(path.join(game,'fixture.pfs'),bytes);
 write('owner-tests.json',{schema:'megulit.owner-tests',version:1,root,entries:[{id:'artemis-integration',engine:'artemis',exe,sha256:digest(fs.readFileSync(exe)),files:[{path:'fixture.pfs',bytes:bytes.length,sha256:digest(bytes)}],draw:{},capabilities:['lua-input']}]});
 const saved={};for(const[k,v]of Object.entries({MEGULIT_ROOT:root,MEGULIT_SIDE_BY_SIDE:'1',MEGULIT_OWNER_TESTS:'1',MEGULIT_RELAY_BASE:'off'})){saved[k]=process.env[k];process.env[k]=v;}
 const sessions=[];t.after(async()=>{for(const p of sessions)await p.session.stop();O.revokeFor(root);for(const[k,v]of Object.entries(saved)){if(v===undefined)delete process.env[k];else process.env[k]=v;}fs.rmSync(temp,{recursive:true,force:true});});
 return {root,exe,library,sessions,resolve:()=>O.resolve(root,{exe,engine:'artemis'}),async prepare(token){const p=await L.prepare({root,exe,profile:{engine:'artemis'},enabled:false,ownerTestGrant:token});if(p)sessions.push(p);return p;}};
}

test('actual launch shares the opaque module: library-only wins, compositor-off Lua grant registers only its owned alias',async t=>{
 const f=fixture(t);f.library(true);const off=await f.resolve();assert.ok(off);assert.equal(await f.prepare(off),null);assert.equal(fs.existsSync(path.join(f.root,'data/artemis-shadow')),false);O.revoke(off);
 f.library(false);const token=await f.resolve();assert.ok(token);assert.equal(await f.prepare({...token}),null);const p=await f.prepare(token);assert.equal(p.path,'artemis');
 assert.equal(O.lookup(f.root,p.exe,'artemis'),token);assert.equal(O.identity(token,p.exe),fs.realpathSync.native(f.exe));assert.equal(O.allowed(token,{exe:p.exe,engine:'artemis',capability:'lua-input'}),true);assert.equal(O.allowed(token,{exe:p.exe,engine:'artemis',capability:'roles'}),false);
 assert.deepEqual(fs.readdirSync(path.join(p.cwd,'savedata')),[]);await p.session.stop();assert.equal(O.lookup(f.root,p.exe,'artemis'),null);
});

test('Artemis off-write failure still awaits the owned Node helper and retains a retryable session',async t=>{
 const f=fixture(t),token=await f.resolve(),p=await f.prepare(token),{HookNative}=require('../core/hook-native.cjs');assert.ok(p);
 const h=new HookNative({native:f.root,hook:f.root,logs:path.join(f.root,'logs')},()=>{},()=>{throw Error('NATIVE_SPAWN_FORBIDDEN');});h.trace=()=>{};L.attach(p,h);t.after(()=>h.stop());
 const child=spawn(process.execPath,['-e',"process.stdin.resume();process.stdin.on('end',()=>setTimeout(()=>process.exit(0),80));console.log('ready');"],{windowsHide:true,stdio:['pipe','pipe','pipe']});t.after(()=>{if(child.exitCode===null&&child.signalCode===null)child.kill();});await once(child.stdout,'data');h.process=child;
 fs.unlinkSync(p.session.control);fs.mkdirSync(p.session.control);let done=false;const result=h.stop(false).then(()=>{done=true;return null;},e=>{done=true;return e;});await new Promise(r=>setImmediate(r));assert.equal(done,false);
 const error=await result;assert.equal(error.code,'READER_STOP_INCOMPLETE');assert.equal(child.exitCode,0);assert.equal(h.textPath,p.session);assert.equal(h.stopError.code,'READER_STOP_INCOMPLETE');assert.equal(O.allowed(token,{exe:f.exe,engine:'artemis',capability:'lua-input'}),false);
 fs.rmdirSync(p.session.control);await h.stop(false);assert.equal(h.stopError,null);assert.match(fs.readFileSync(p.session.control,'utf8'),/ 0\n$/);
});

test('actual HookNative stop(false) revokes an Artemis session even before the asynchronous Reader stores its token',async t=>{
 const f=fixture(t),token=await f.resolve(),p=await f.prepare(token);assert.ok(p);
 // The actual authority is used throughout; this is the one controlled OS query boundary, not a game birth proof
 t.mock.method(require('../services/game-process.cjs'),'gameProcesses',async()=>[{pid:process.pid,started:'638990000000000000'}]);assert.equal(await p.connect(),true);clearInterval(p.session.timer);
 const {HookNative}=require('../core/hook-native.cjs'),h=new HookNative({native:f.root,hook:f.root,logs:path.join(f.root,'logs')},()=>{},()=>{throw Error('NATIVE_SPAWN_FORBIDDEN');});h.trace=()=>{};h.target={...p.session.owner};h.wanted=true;L.attach(p,h);t.after(()=>h.stop());
 assert.equal(h.ownerTestGrant==null,true,'Reader has not stored the already-bound launch token yet');
 const packet=text=>({nonce:p.session.nonce,generation:p.session.generation,role:'line',text,ruby:[]});let held;const original=p.session.onSource;p.session.onSource=m=>{held=m;return original(m);};
 assert.equal(p.session.accept(packet('最初の合成本文です。')),true);h.engineDialog=false;h.engineDialogAt=h.now();assert.equal(p.session.accept(packet('次の合成本文を待ちます。')),false);const queued=held,before=h.state.hookSequence;
 h.wanted=false;assert.equal(p.session.accept(packet('停止予定の合成本文です。')),false);h.deliverSource(queued.text,'artemis-lua-input','',0,queued);h.emitSource(queued.text,'artemis-lua-input','',0,queued);assert.equal(h.state.hookSequence,before,'wanted=false rejects an already-held private delivery before teardown finishes');
 await h.stop(false);const sequence=h.state.hookSequence;
 assert.equal(p.session.accept(packet('停止後の合成本文です。')),false);h.deliverSource('遅延した合成本文です。','artemis-lua-input','',0,held);h.emitSource('遅延した合成本文です。','artemis-lua-input','',0,held);assert.equal(h.state.hookSequence,sequence);
 assert.equal(p.session.stopped,true);assert.equal(O.allowed(token,{exe:f.exe,engine:'artemis',capability:'lua-input'}),false);assert.match(fs.readFileSync(p.session.control,'utf8'),/ 0\n$/);
});
