// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),{EventEmitter}=require('node:events');
const {automatic}=require('../services/cardinal/automatic.cjs'),Run=require('../services/cardinal/run.cjs');
const tick=()=>new Promise(resolve=>setImmediate(resolve));
function gate(){let paused=false,stops=[],checks=0;return {get checks(){return checks;},blocked:()=>paused,idle:async()=>{checks++;return !paused;},track(exe,stop){stops.push(stop);return ()=>{stops=stops.filter(x=>x!==stop);};},async foreground(){paused=true;await Promise.all(stops.map(stop=>stop()));},resume(){paused=false;}};}
const job=replay=>({root:'virtual-root',key:'b'.repeat(64),game:{exe:'virtual-game.exe'},replay});
test('an idle answer arriving after foreground completed cannot spawn a replay',async()=>{
 const games=gate();let allow,spawned=0;const waiting=new Promise(resolve=>allow=resolve);
 const result=automatic(job(async()=>{spawned++;}),{}, {},{games,budget:{wait:async()=>waiting}});
 await games.foreground();allow(true);assert.equal((await result).deferred,true);assert.equal(spawned,0);
});
test('foreground before permission recheck completes is remembered and never spawns',async()=>{
 const games=gate();let answer,spawned=0;games.idle=()=>new Promise(resolve=>answer=resolve);
 const result=automatic(job(async()=>{spawned++;}),{}, {},{games,budget:{wait:async()=>true}});await tick();
 const stopped=games.foreground();answer(true);await stopped;await tick();
 // The retry now waits on a new recheck; do not leave it pending.
 for(let i=0;i<3;i++){answer?.(false);await tick();}assert.equal((await result).deferred,true);assert.equal(spawned,0);
});
test('foreground waits for replay close before allowing retry or returning',async()=>{
 const games=gate();let finish,spawns=0,waits=0;
 const result=automatic(job(async(sc,{signal})=>{spawns++;await new Promise(resolve=>{signal.addEventListener('abort',()=>finish=resolve,{once:true});});return {interrupted:true,processClosed:true};}),{}, {},{games,budget:{wait:async()=>++waits===1},intervalMs:10000});
 await tick();let stopped=false;const foreground=games.foreground().then(()=>stopped=true);await tick();assert.equal(stopped,false);assert.equal(spawns,1);finish();await foreground;assert.equal(stopped,true);assert.equal((await result).deferred,true);assert.equal(spawns,1);
});
test('automatic jobs pause on loss of actual idle and activity retries are bounded',async()=>{
 const games=gate();let calls=0;
 games.idle=async()=>++calls%2===1;
 const hold=setInterval(()=>{},100);
 const result=await automatic(job((sc,{signal})=>new Promise(resolve=>{signal.addEventListener('abort',()=>resolve({interrupted:true,processClosed:true}),{once:true});})),{}, {},{games,budget:{wait:async()=>true},intervalMs:1});
 clearInterval(hold);assert.equal(result.deferred,true);assert.equal(calls,6);
});
test('an unconfirmed browser cleanup is returned immediately without retry',async()=>{
 const games=gate();let calls=0;const failure={browserPid:42,profile:'owned-profile',processClosed:false};
 const result=await automatic(job(async()=>{calls++;return {interrupted:true,cleanupFailure:failure};}),{}, {},{games,budget:{wait:async()=>true}});
 assert.equal(result.cleanupFailure,failure);assert.equal(calls,1);
});
test('stop needs successful process-tree termination and child close, never just exit',async()=>{
 const p=new EventEmitter();p.pid=12;p.exitCode=null;let kills=0;
 const stopping=Run.stop(p,{platform:'win32',timeoutMs:50,cleanupConfirmed:()=>true,spawnSync(){kills++;queueMicrotask(()=>p.emit('exit',1));return {status:0};}});
 let complete=false;stopping.then(()=>complete=true);await tick();assert.equal(complete,false);p.emit('close',1);assert.equal(await stopping,true);assert.equal(kills,1);assert.equal(await Run.stop(p),true);
 const missing=new EventEmitter();missing.pid=13;assert.equal(await Run.stop(missing,{platform:'win32',timeoutMs:1,spawnSync:()=>({status:1})}),false);
});
function fakeReplay(stop){const p=new EventEmitter();p.pid=99;p.exitCode=null;const writes=new Map(),removed=[];
 const io={fs:{mkdirSync(){},mkdtempSync:()=>'/virtual/owned-run',writeFileSync:(f,s)=>writes.set(f,s),openSync:()=>5,closeSync(){},readFileSync(f){if(f.endsWith('out.json'))return JSON.stringify({errors:[],samples:[1]});return '';},rmSync:f=>removed.push(f)},spawn:()=>p,stop};return {p,removed,io};}
test('runner ignores exit until close, and cancellation waits for tree confirmation',async()=>{
 let stopped;const h=fakeReplay(()=>new Promise(resolve=>stopped=resolve)),controller=new AbortController();
 const result=Run.replay({}, {work:'/virtual',signal:controller.signal,onSpawn:p=>p.emit('exit',0)},h.io);
 let complete=false;result.then(()=>complete=true);await tick();assert.equal(complete,false);controller.abort();await tick();assert.equal(complete,false);assert.deepEqual(h.removed,[]);h.p.emit('close',0);stopped(true);
 const out=await result;assert.equal(out.interrupted,true);assert.equal(out.processClosed,true);assert.equal(h.removed.length,1);
});
test('runner retains its files when tree shutdown cannot be confirmed',async()=>{
 const h=fakeReplay(async()=>false),controller=new AbortController();const result=Run.replay({}, {work:'/virtual',signal:controller.signal},h.io);controller.abort();const out=await result;
 assert.equal(out.processClosed,false);assert.equal(out.cleanupFailure.driverPid,99);assert.deepEqual(h.removed,[]);
});


test('foreground rejects when the replay cannot confirm its tree exited',async()=>{
 const games=gate();const failure={browserPid:42,profile:'owned-profile',processClosed:false};
 const result=automatic(job((sc,{signal})=>new Promise(resolve=>{signal.addEventListener('abort',()=>resolve({cleanupFailure:failure}),{once:true});})),{}, {},{games,budget:{wait:async()=>true},intervalMs:10000});
 await tick();await assert.rejects(games.foreground(),/CARDINAL_TREE_EXIT_UNCONFIRMED/);assert.equal((await result).cleanupFailure,failure);
});
test('aborted before onSpawn still terminates the child and waits for close',async()=>{
 let stopped=0;const h=fakeReplay(async p=>{stopped++;p.emit('close',1);return true;}),controller=new AbortController();
 h.io.spawn=()=>{controller.abort();return h.p;};
 const out=await Run.replay({}, {work:'/virtual',signal:controller.signal},h.io);assert.equal(stopped,1);assert.equal(out.interrupted,true);assert.equal(out.processClosed,true);
});


test('a driver crash without a cleanup acknowledgement blocks cleanup and the next browser',async()=>{
 const h=fakeReplay(async()=>true);const result=Run.replay({}, {work:'/virtual'},h.io);h.p.emit('close',1);const out=await result;
 assert.equal(out.cleanupFailure.reason,'missing-driver-cleanup-ack');assert.deepEqual(h.removed,[]);
});
test('normal child close with its explicit cleanup acknowledgement releases owned replay files',async()=>{
 const h=fakeReplay(async()=>true);const read=h.io.fs.readFileSync;h.io.fs.readFileSync=f=>f.endsWith('out.json')?JSON.stringify({errors:[],samples:[1],cleanupComplete:true}):read(f);
 const result=Run.replay({}, {work:'/virtual'},h.io);h.p.emit('close',0);const out=await result;assert.equal(out.cleanupFailure,undefined);assert.equal(out.processClosed,true);assert.equal(h.removed.length,1);
});


test('real background API ignores only this replay and retains unsafe occupancy',async()=>{
 const id=require.resolve('../services/background-games.cjs');delete require.cache[id];const bg=require(id);
 const idleReading=async()=>({idleMs:300001,ac:true,fullscreen:false,cpu:0});
 const games={...bg,idle:(root,options)=>bg.idle(root,{...options,reading:idleReading})};let calls=0;
 const result=await automatic(job(async()=>{calls++;return {cleanupFailure:{browserPid:99,processClosed:false,reason:'injected unsafe exit'}};}),{}, {},{games,budget:{wait:async()=>true}});
 assert.ok(result.cleanupFailure);assert.equal(calls,1);assert.equal(bg.occupied(),true);assert.equal(await bg.idle('virtual',{reading:idleReading}),false);await assert.rejects(bg.foreground(),/CARDINAL_TREE_EXIT_UNCONFIRMED/);assert.equal(bg.occupied(),true);await assert.rejects(bg.foreground(),/CARDINAL_TREE_EXIT_UNCONFIRMED/);
 delete require.cache[id];
});
test('real background API still refuses a second task during the final own-token recheck',async()=>{
 const id=require.resolve('../services/background-games.cjs');delete require.cache[id];const bg=require(id);let calls=0;
 const off=bg.track('other.exe',async()=>{}),games={...bg,idle:(root,options)=>bg.idle(root,{...options,reading:async()=>({idleMs:300001,ac:true,fullscreen:false,cpu:0})})};
 const result=await automatic(job(async()=>{calls++;return {};}),{}, {},{games,budget:{wait:async()=>true}});assert.equal(result.deferred,true);assert.equal(calls,0);off();delete require.cache[id];
});


test('a closed driver without browser cleanup proof never confirms the process tree',async()=>{
 const p=new EventEmitter();p.pid=17;p.exitCode=1;const stopping=Run.stop(p,{platform:'win32',timeoutMs:20,spawnSync:()=>({status:0})});p.emit('close',1);assert.equal(await stopping,false);assert.equal(await Run.stop(p),false);
});
test('cooperative stop waits for close and browser cleanup acknowledgement without taskkill',async()=>{
 const p=new EventEmitter();p.pid=18;p.connected=true;let acknowledged=false,forced=0;
 p.send=(message,cb)=>{assert.equal(message.type,'cardinal-stop');queueMicrotask(()=>{acknowledged=true;p.emit('close',0);cb();});};
 assert.equal(await Run.stop(p,{timeoutMs:20,cleanupConfirmed:()=>acknowledged,spawnSync(){forced++;return {status:0};}}),true);assert.equal(forced,0);
});


test('the actual server error boundary preserves the exact Cardinal stop reason',async()=>{
 const games=gate(),detail={browserPid:42,profile:'owned-profile',processClosed:false},traces=[];let stoppedError;
 const work=job((sc,{signal})=>new Promise(resolve=>{signal.addEventListener('abort',()=>resolve({cleanupFailure:detail}),{once:true});}));work.trace=line=>traces.push(line);
 const running=automatic(work,{}, {},{games,budget:{wait:async()=>true},intervalMs:10000});await tick();try{await games.foreground();}catch(error){stoppedError=error;}await running;
 assert.equal(stoppedError.message,'CARDINAL_TREE_EXIT_UNCONFIRMED');assert.equal(stoppedError.code,'CARDINAL_TREE_EXIT_UNCONFIRMED');assert.deepEqual(stoppedError.detail,detail);assert.ok(traces.some(line=>line.includes(JSON.stringify(detail))));
 const fs=require('node:fs'),vm=require('node:vm'),path=require('node:path'),input=new EventEmitter(),replies=[];let unexpectedFs=0;input.close=()=>{};
 const sandbox={__dirname:__dirname,process:{env:{},stdin:{},stdout:{write:text=>replies.push(JSON.parse(text))},exit(){}},setTimeout:()=>({unref(){}}),require(name){if(name==='node:path')return path;if(name==='node:readline')return {createInterface:()=>input};if(name==='./bridge.cjs')return {dispatch:async()=>{throw stoppedError;}};if(name==='./runtime.cjs')return {Runtime:class{}};if(name==='./background-games.cjs')return {configure(){}};if(name==='node:fs')unexpectedFs++;throw Error('disabled unit infrastructure: '+name);}};
 // Execute unmodified server.cjs; only OS/runtime dependencies are injected, no surrogate error mapper.
 vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../services/server.cjs'),'utf8'),sandbox);input.emit('line',JSON.stringify({id:7,request:{action:'library_launch',id:1}}));await tick();
 assert.deepEqual(replies,[{id:7,ok:false,error:'CARDINAL_TREE_EXIT_UNCONFIRMED'}]);assert.equal(unexpectedFs,0,'the reason was not degraded to SERVICE_FAILED');
});


test('known driver exit or signal never taskkills a reusable PID while close is delayed',async()=>{
 for(const field of ['exitCode','signalCode']){
  const p=new EventEmitter();p.pid=31;p.exitCode=null;p.signalCode=null;p[field]=field==='exitCode'?0:'SIGTERM';p.connected=true;let kills=0,sends=0;p.send=()=>sends++;
  const stopping=Run.stop(p,{platform:'win32',timeoutMs:30,cleanupConfirmed:()=>true,spawnSync:()=>{kills++;return {status:0};}});let complete=false;stopping.then(()=>complete=true);await tick();assert.equal(complete,false);assert.equal(kills,0);assert.equal(sends,0);p.emit('close',0);assert.equal(await stopping,true);assert.equal(kills,0);
  const unsafe=new EventEmitter();unsafe.pid=32;unsafe.exitCode=null;unsafe.signalCode=null;unsafe[field]=field==='exitCode'?0:'SIGTERM';
  assert.equal(await Run.stop(unsafe,{platform:'win32',timeoutMs:1,spawnSync:()=>{kills++;return {status:0};}}),false);assert.equal(kills,0);
 }
});
