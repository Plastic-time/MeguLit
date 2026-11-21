// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {EventEmitter}=require('node:events'),{PassThrough}=require('node:stream'),Module=require('node:module');
const root=path.join(__dirname,'..'),svcFile=path.join(root,'services/cold-test.cjs'),requireSvc=Module.createRequire(svcFile);
const turn=()=>new Promise(r=>setImmediate(r));
function fixture({exitOnStop=true,key=async()=> '1'.repeat(64)}={}){
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'cold-stop-')),app=path.join(dir,'app'),game=path.join(dir,'game'),exe=path.join(game,'Safety.exe');
 fs.mkdirSync(path.join(game,'savedata'),{recursive:true});fs.mkdirSync(path.join(app,'native'),{recursive:true});fs.writeFileSync(exe,'MZ');fs.writeFileSync(path.join(game,'savedata','save.dat'),'original');fs.writeFileSync(path.join(app,'native','ColdDesk.exe'),'');
 const helper=new EventEmitter();helper.stdout=new PassThrough();helper.pid=7001;helper.stdin={write:()=>true,end:()=>{helper.stopRequested=true;}};
 let workerExited=false;const worker=new EventEmitter();worker.pid=6001;worker.send=(m,cb)=>{cb?.(null);if(m?.exe)queueMicrotask(()=>{worker.emit('message',{type:'cold-worker-ready',protocol:1});worker.emit('message',{type:'cold-native-spawn'});});if((m?.stop&&exitOnStop)||m?.type==='cold-native-error')queueMicrotask(()=>exitWorker());return true;};worker.kill=()=>assert.fail('must not kill the worker to assume native cleanup');
 const exitWorker=()=>{if(workerExited)return;workerExited=true;worker.emit('exit',0);worker.emit('close',0);};
 for(const id of ['./background-games.cjs','./cold-native-session.cjs'])delete require.cache[requireSvc.resolve(id)];
 const bg=requireSvc('./background-games.cjs'),session=requireSvc('./cold-native-session.cjs');
 const deps={forker:()=>worker,spawner:()=>helper,stopTimeoutMs:50};
 const nativeSession={runInWorker:(opts,over={})=>session.runInWorker(opts,{...deps,...over})};
 const realFs={...fs,statfsSync:()=>({bavail:1000000,bsize:4096})};
 const m=new Module(svcFile,module);m.filename=svcFile;m.paths=Module._nodeModulePaths(path.dirname(svcFile));
 m.require=id=>id==='node:fs'?realFs:id==='node:child_process'?{...require('node:child_process'),fork:()=>worker}:id==='../core/auto-profile.cjs'?{exeKeySync:()=>'',exeKey:key}:id==='../core/profiles/index.cjs'?{profileFor:()=>null}:id==='./cold-native-session.cjs'?nativeSession:requireSvc(id);
 const source=process.env.MEGULIT_COLD_BASELINE?require('node:child_process').execFileSync('git',['show',process.env.MEGULIT_COLD_BASELINE+':services/cold-test.cjs'],{cwd:root,encoding:'utf8'}):fs.readFileSync(svcFile,'utf8');
 m._compile(source,svcFile);
 let helperClosed=false;const closeHelper=(safe=true,code=0)=>{if(helperClosed)return;helperClosed=true;helper.stdout.write(JSON.stringify({type:'cleanup',safe})+'\n');helper.stdout.end();helper.emit('close',code,null);};
 return {dir,app,game,exe,bg,svc:m.exports,worker,helper,exitWorker,closeHelper,cleanup:()=>fs.rmSync(dir,{recursive:true,force:true})};
}
test('worker exit cannot release foreground or restore saves before native close',async()=>{
 const f=fixture();let finished=false;
 try{
  const run=f.svc.testOne(f.app,{id:'safety',title:'Safety',exe:f.exe,engine:'kirikiri',exeKey:'1'.repeat(64)},{deps:{env:{},runner:o=>f.svc.runInWorker(o).then(r=>{finished=true;return r;})}});
  await turn();let released=false;const stop=f.bg.foreground().then(()=>{released=true;});await turn();
  try{assert.equal(released,false,'worker exit alone released the player');assert.equal(finished,false,'save restore became possible before native cleanup');fs.writeFileSync(path.join(f.game,'savedata','save.dat'),'last cold write');}
  finally{f.closeHelper();f.exitWorker();await stop;await run;}
  assert.equal(fs.readFileSync(path.join(f.game,'savedata','save.dat'),'utf8'),'original');await turn();assert.equal(fs.readFileSync(path.join(f.game,'savedata','save.dat'),'utf8'),'original');
 }finally{f.cleanup();}
});
test('two stop timeouts keep tracking until late native close confirms cleanup',async()=>{
 const f=fixture();try{const run=f.svc.runInWorker({root:f.app,exe:f.exe,budgetMs:1000});await turn();
  await assert.rejects(f.bg.foreground(),{code:'COLD_STOP_TIMEOUT'});assert.equal(f.bg.occupied(),true);
  await assert.rejects(f.bg.foreground(),{code:'COLD_STOP_TIMEOUT'});assert.equal(f.bg.occupied(),true);
  f.closeHelper();f.exitWorker();const r=await run;assert.equal(r.cleanupConfirmed,true);assert.equal(f.bg.occupied(),false);
 }finally{f.closeHelper();f.exitWorker();f.cleanup();}
});
test('helper error rejects the pending foreground stop; unconfirmed cleanup preserves the save journal',async()=>{
 const f=fixture();try{const run=f.svc.testOne(f.app,{id:'safety',title:'Safety',exe:f.exe,engine:'kirikiri',exeKey:'1'.repeat(64)},{deps:{env:{},runner:o=>f.svc.runInWorker(o)}});await turn();
  const stop=f.bg.foreground();f.helper.emit('error',Error('helper pipe failure'));f.closeHelper(false,1);f.exitWorker();
  await assert.rejects(stop,{code:'COLD_CLEANUP_UNCONFIRMED'});const out=await run;assert.equal(out.why,'cleanup-unconfirmed');assert.equal(f.bg.occupied(),true);
  const saves=require('../core/cold-test/saves.cjs');assert.equal(saves.pending(f.app).length,0);assert.equal(saves.failed(f.app).length,1);assert.match(saves.failed(f.app)[0].errors.join(' '),/cleanup/);assert.equal(saves.failed(f.app)[0].coldCleanup.state,'closed-unconfirmed');
 }finally{f.cleanup();}
});
test('foreground during retest fetch prevents a late cold launch',async()=>{
 const f=fixture();let resume,entered;const inFetch=new Promise(r=>entered=r);let runs=0;
 try{const tick=f.svc.tick(f.app,{deps:{platform:'win32',helper:true,reading:async()=>({idleMs:1200000,cpu:.01,ac:true,fullscreen:false}),playing:()=>false,games:()=>[{id:'safety',title:'Safety',exe:f.exe,engine:'kirikiri'}],env:{},retest:()=>{entered();return new Promise(r=>resume=r);},runner:async()=>{runs++;return {shots:[]};}}});
  await inFetch;await f.bg.foreground();resume({keys:{},games:{}});const out=await tick;assert.equal(runs,0);assert.equal(out.reason,'foreground');
 }finally{f.cleanup();}
});
test('foreground during executable hashing prevents snapshot and native launch',async()=>{
 let resume,entered;const hashing=new Promise(r=>entered=r);const f=fixture({key:()=>{entered();return new Promise(r=>resume=r);}});let runs=0;
 try{const run=f.svc.testOne(f.app,{id:'safety',title:'Safety',exe:f.exe,engine:'kirikiri'},{deps:{env:{},runner:async()=>{runs++;return {shots:[]};}}});await hashing;await f.bg.foreground();resume('1'.repeat(64));const out=await run;assert.equal(runs,0);assert.equal(out.why,'foreground');assert.equal(require('../core/cold-test/saves.cjs').failed(f.app).length,0);
 }finally{f.cleanup();}
});
test('capture stop times out without forgetting its process, then accepts confirmed late exit',async()=>{
 const f=fixture();let finish;try{f.bg.capture({helper:'fixture',exe:f.exe},[f.exe,'fixture.dll','report','45'],()=>{},{stopTimeoutMs:15,execute:(_p,_a,_o,cb)=>{finish=cb;return {stdin:{end:()=>{}},kill:()=>assert.fail('cannot assume killed means restored')};}});
  await assert.rejects(f.bg.foreground(),{code:'COLD_STOP_TIMEOUT'});await assert.rejects(f.bg.foreground(),{code:'COLD_STOP_TIMEOUT'});assert.equal(f.bg.occupied(),true);
  finish(null,'cancelled');await f.bg.foreground();assert.equal(f.bg.occupied(),false);
 }finally{f.cleanup();}
});
test('capture cleanup failure keeps a failed barrier for later player attempts',async()=>{
 const f=fixture();let finish;try{f.bg.capture({helper:'fixture',exe:f.exe},[f.exe,'fixture.dll','report','45'],()=>{},{execute:(_p,_a,_o,cb)=>{finish=cb;return {stdin:{end:()=>{}}};}});
  finish(null,'cleanup-unconfirmed');await assert.rejects(f.bg.foreground(),{code:'COLD_CLEANUP_UNCONFIRMED'});await assert.rejects(f.bg.foreground(),{code:'COLD_CLEANUP_UNCONFIRMED'});assert.equal(f.bg.occupied(),true);
 }finally{f.cleanup();}
});
test('native spawn exception closes the worker without waiting for a nonexistent process',async()=>{
 const f=fixture();try{const session=requireSvc('./cold-native-session.cjs');const r=await session.runInWorker({root:f.app,exe:f.exe,budgetMs:1000},{forker:()=>f.worker,spawner:()=>{throw Error('spawn denied fixture');},stopTimeoutMs:50});assert.equal(r.cleanupConfirmed,true);assert.match(r.errors.join(' '),/spawn denied fixture/);assert.equal(f.bg.occupied(),false);}
 finally{f.cleanup();}
});
test('real worker IPC proxy relays a fake native stream and exits after native close',async()=>{
 const f=fixture();try{const session=requireSvc('./cold-native-session.cjs');const r=await session.runInWorker({root:f.app,exe:f.exe,runDir:path.join(f.dir,'run'),budgetMs:1000},{spawner:()=>{setImmediate(()=>{f.helper.stdout.write(JSON.stringify({type:'ended',why:'fixture-only'})+'\n');f.closeHelper();});return f.helper;},stopTimeoutMs:1000});assert.equal(r.cleanupConfirmed,true);assert.equal(r.end,'fixture-only');assert.equal(f.bg.occupied(),false);assert.equal(fs.existsSync(path.join(f.dir,'run','run.json')),true);}
 finally{f.cleanup();}
});
test('real worker proxy receives close after a synchronous native spawn failure',async()=>{
 const f=fixture();try{const session=requireSvc('./cold-native-session.cjs');const r=await session.runInWorker({root:f.app,exe:f.exe,runDir:path.join(f.dir,'run'),budgetMs:1000},{spawner:()=>{throw Error('fixture spawn failure');},stopTimeoutMs:1000});assert.equal(r.cleanupConfirmed,true);assert.equal(r.end,'helper-error');assert.match(r.errors.join(' '),/spawn failure/);assert.equal(f.bg.occupied(),false);}
 finally{f.cleanup();}
});
test('idle may ignore only its own registered release function and keeps every real idle condition',async()=>{
 const f=fixture();const idle={idleMs:600000,ac:true,fullscreen:false,cpu:.01},reading=async()=>idle;
 const own=f.bg.track(f.exe,async()=>{}),other=f.bg.track('another-owned-task',async()=>{});
 try{assert.equal(await f.bg.idle(f.app,{reading,ignore:own}),false);other();assert.equal(await f.bg.idle(f.app,{reading,ignore:own}),true);
  assert.equal(await f.bg.idle(f.app,{reading,ignore:()=>{}}),false);for(const change of [{idleMs:0},{ac:false},{fullscreen:true},{cpu:.99}])assert.equal(await f.bg.idle(f.app,{reading:async()=>({...idle,...change}),ignore:own}),false);
  f.bg.configure(()=>true);assert.equal(await f.bg.idle(f.app,{reading,ignore:own}),false);f.bg.configure(()=>false);own();const later=f.bg.track('later-task',async()=>{});assert.equal(await f.bg.idle(f.app,{reading,ignore:own}),false);later();
  f.bg.pause();assert.equal(await f.bg.idle(f.app,{reading,ignore:own}),false);
 }finally{own();other();f.cleanup();}
});
test('cold tick re-reads real idle conditions after network and hashing before any snapshot or spawn',async()=>{
 const f=fixture();let reads=0,runs=0;try{const out=await f.svc.tick(f.app,{deps:{platform:'win32',helper:true,reading:async()=>({idleMs:reads++?0:1200000,cpu:.01,ac:true,fullscreen:false}),playing:()=>false,games:()=>[{id:'safety',title:'Safety',exe:f.exe,engine:'kirikiri'}],env:{},retest:async()=>({keys:{},games:{}}),runner:async()=>{runs++;return {shots:[]};}}});assert.equal(reads,2);assert.equal(runs,0);assert.equal(out.result.why,'not-idle');assert.equal(require('../core/cold-test/saves.cjs').failed(f.app).length,0);}
 finally{f.cleanup();}
});
test('an old worker without the parent-owned native protocol cannot claim safe cleanup',async()=>{
 const f=fixture();try{f.worker.send=(m,cb)=>{cb?.(null);if(m?.exe)queueMicrotask(()=>f.exitWorker());return true;};const r=await f.svc.runInWorker({root:f.app,exe:f.exe,budgetMs:1000});assert.equal(r.cleanupConfirmed,false);assert.match(r.errors.join(' '),/PROTOCOL_UNCONFIRMED/);await assert.rejects(f.bg.foreground(),{code:'COLD_CLEANUP_UNCONFIRMED'});}
 finally{f.cleanup();}
});
