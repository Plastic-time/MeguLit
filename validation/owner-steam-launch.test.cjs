// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os'),vm=require('node:vm');
const source=fs.readFileSync(path.join(__dirname,'../services/bridge.cjs'),'utf8');
const launchSource=source.slice(source.indexOf('async function launch('),source.indexOf('\nfunction deleteWord('));
const {Runtime}=require('../services/runtime.cjs');
function harness(t,{running=false,waitError=false,confirmError=false,policy=true,prepareHook,unmuteHook}={}){
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'owner-steam-launch-')),exe=path.join(root,'Original.exe'),alias=path.join(root,'Alias.exe');fs.writeFileSync(exe,'neutral bytes, never run');
 t.after(()=>fs.rmSync(root,{recursive:true,force:true}));const calls=[],token={},game={id:'game',title:'neutral',executable:exe,original:JSON.stringify({library:{engine:'renpy',source:'steam',localeMode:'off'}})};
 const record=(name,...args)=>calls.push([name,...args]);
 let stopped=false;const prepared={exe:alias,cwd:root,shadow:root,env:{TEMP:path.join(root,'cache/owner-temp'),TMP:path.join(root,'cache/owner-temp')},session:{get stopped(){return stopped;},async stop(){stopped=true;await new Promise(r=>setImmediate(r));record('stopped');}},async confirm(pid){record('confirmed',pid);if(confirmError)throw Error('RESTART_FROM_OWNER_TEST_ENTRY');}};
 const modules={
  '../core/library-mode.cjs':{libraryOnly:()=>false},'./import-source.cjs':{backfill(){},targetOf:()=>null},
  './embedded-japanese-jobs.cjs':{reserveLaunch:()=>({release:()=>record('lease-released')})},
  './background-games.cjs':{foreground:async()=>record('foreground'),unmute:async()=>{record('unmute');await unmuteHook?.();}},
  '../core/steam-owned.cjs':{launchAppid:()=> '1173010',partOf:()=>null,installPrograms:()=>[path.join(root,'Sibling.exe')]},
  '../core/owner-tests.cjs':{launchPolicy:()=>policy?'private-steam':null,resolve:async()=>token,revoke:()=>record('revoked')},
  '../core/profiles/index.cjs':require('../core/profiles/index.cjs'),
  './game-language.cjs':{originalExecutable:()=>({blocked:false})},'./locale-launch.cjs':{requiresAdministrator:()=>false},
  './shared-adaptation.cjs':{importFor(){}},'./steam-companion.cjs':{launchArgs:()=>null},
  '../core/owner-steam-direct.cjs':{async prepare(args){assert.equal(args.token,token);args.signal.addEventListener('abort',()=>{stopped=true;},{once:true});await prepareHook?.(args);if(args.signal.aborted)throw Error('OWNER_STEAM_CANCELLED');record('prepared');return prepared;}},
  '../core/glyph-dots.cjs':{earlyStart:()=>null,wanted:()=>true},'../core/locale-emulator.cjs':{x86:()=>false},
  './game-process.cjs':{async gameProcesses(r,x){assert.equal(r,root);record('query',x);if(x===exe)return running?[{pid:99}]:[];assert.equal(x,alias,'private wait cannot adopt original, URI or sibling process');return [{pid:42,started:'fixed-birth'}];}},
  './game-readiness.cjs':{async startProcess(file,args,cwd,error,unused,env){record('start',file,args,cwd,env);return {pid:42,exit:null};},async waitForVisibleGame(query){record('wait');await query();if(waitError)throw Error('GAME_PROCESS_EXITED');return {pid:42};}},
  '../core/japanese-auto.cjs':{launchResult(){}}
 };
 const forbidden=['../core/drm-wrap.cjs','../core/directplay.cjs','../core/windows-features.cjs','../core/japanese-restore.cjs','./japanese-auto-run.cjs','../core/text-paths-launch.cjs','./steam-restart.cjs'];
 const req=name=>{if(forbidden.includes(name))throw Error('UNEXPECTED_ORIGINAL_MUTATION_OR_FALLBACK '+name);if(name in modules)return modules[name];throw Error('UNEXPECTED_MODULE '+name);};
 const launch=vm.runInNewContext('('+launchSource+')',{require:req,fs,path,root,process,console,AbortController,markLaunch:()=>{},neededFeature:new Map(),setTimeout(){throw Error('UNEXPECTED_TIMER');}});
 const db={prepare(sql){return {get:()=>game,run(...args){record('db',sql,...args);}};}},runtime={prepareGame(x){record('reader-prepare',x);},bindLaunched(pid){record('reader-bind',pid);},trackTextPath(x){Runtime.prototype.trackTextPath.call(this,x);record(x===prepared?'tracked':'pending-tracked');},forgetTextPath(x){Runtime.prototype.forgetTextPath.call(this,x);record(x===prepared.session?'forgot':'pending-forgot');},reader:{async stop(){record('reader-stopped');},gal:{send:()=>{}}}};
 return {root,exe,alias,calls,run:()=>launch(db,'game',runtime),stop:()=>Runtime.prototype.stopReading.call(runtime)};
}
test('actual bridge private path preserves TEMP, queries exact alias and confirms before Reader binding',async t=>{
 const h=harness(t);assert.equal((await h.run()).action,'launched');const start=h.calls.find(c=>c[0]==='start');assert.equal(start[1],h.alias);assert.deepEqual([...start[2]],[]);assert.equal(start[4].TEMP,path.join(h.root,'cache/owner-temp'));assert.equal(start[4].TMP,start[4].TEMP);
 const names=h.calls.map(c=>c[0]);assert.ok(names.indexOf('confirmed')<names.indexOf('reader-prepare'));assert.ok(names.indexOf('reader-prepare')<names.indexOf('reader-bind'));assert.equal(h.calls.filter(c=>c[0]==='reader-prepare').length,1);assert.equal(names.includes('stopped'),false);assert.equal(names.at(-1),'lease-released');
});
test('actual bridge refuses existing original before preparing or launching a shadow',async t=>{const h=harness(t,{running:true});await assert.rejects(h.run(),/RESTART_FROM_OWNER_TEST_ENTRY/);assert.equal(h.calls.some(c=>['prepared','start','reader-bind','reader-prepare'].includes(c[0])),false);});
test('actual bridge wait failure never adopts Steam URI/restart and awaits owned cleanup',async t=>{const h=harness(t,{waitError:true});await assert.rejects(h.run(),/RESTART_FROM_OWNER_TEST_ENTRY/);const names=h.calls.map(c=>c[0]);assert.ok(names.indexOf('stopped')<names.indexOf('forgot'));assert.ok(names.indexOf('forgot')<names.indexOf('lease-released'));assert.equal(names.includes('reader-bind'),false);});
test('actual bridge confirmation failure cannot enter Reader and still releases owned session',async t=>{const h=harness(t,{confirmError:true});await assert.rejects(h.run(),/RESTART_FROM_OWNER_TEST_ENTRY/);const names=h.calls.map(c=>c[0]);assert.equal(names.includes('reader-prepare'),false);assert.ok(names.includes('stopped'));assert.ok(names.includes('forgot'));});
test('actual Runtime stop during bridge copy awaits preparation exit and cannot publish a late launch',async t=>{let entered,release,done=false;const began=new Promise(r=>entered=r),gate=new Promise(r=>release=r);const h=harness(t,{prepareHook:async()=>{entered();await gate;}}),run=h.run();await began;const stop=h.stop().then(()=>{done=true;});await new Promise(r=>setImmediate(r));assert.equal(done,false);release();await stop;await assert.rejects(run,/OWNER_STEAM_CANCELLED/);assert.equal(h.calls.some(c=>c[0]==='start'||c[0]==='reader-bind'),false);assert.equal(h.calls.filter(c=>c[0]==='pending-tracked').length,1);});
test('stop after confirmation but before final bind cannot re-enter Reader',async t=>{let h;h=harness(t,{unmuteHook:async()=>h.stop()});await assert.rejects(h.run(),/RESTART_FROM_OWNER_TEST_ENTRY/);assert.ok(h.calls.some(c=>c[0]==='confirmed'));assert.equal(h.calls.some(c=>c[0]==='reader-prepare'||c[0]==='reader-bind'),false);});
test('private Steam errors have useful three-language feedback without a Japanese restore action',async()=>{
 const {launchReason,launchRestorable}=await import('../web/launch-feedback.js');for(const code of ['RESTART_FROM_OWNER_TEST_ENTRY','OWNER_STEAM_DISK_BUDGET','OWNER_STEAM_COPY_BUDGET','OWNER_STEAM_IDENTITY_CHANGED','OWNER_STEAM_SESSION_BUSY','OWNER_STEAM_FILE_BUDGET','OWNER_STEAM_COPY_TIMEOUT','OWNER_STEAM_PREPARE_FAILED','OWNER_STEAM_ALIAS_REJECTED','OWNER_STEAM_ELEVATION_UNSUPPORTED']){assert.equal(launchRestorable(code),false);for(const locale of ['zh','en','ja']){assert.ok(launchReason(code,locale).length>20,code+':'+locale);assert.ok(!launchReason(code,locale).includes(code));}}assert.equal(launchReason('UNRELATED_UNKNOWN','zh'),'');
});
