// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const sourceRoot=process.env.MEGULIT_ORIGINAL_SCAN_SOURCE_ROOT||path.resolve(__dirname,'..');
const modulePromise=import('data:text/javascript;base64,'+Buffer.from(fs.readFileSync(path.join(sourceRoot,'web/original-scan.js'),'utf8')+'\n//# sourceURL=original-scan-production.js').toString('base64'));
const flush=async()=>{for(let i=0;i<20;i++)await Promise.resolve();};
async function flow(reply){const {createOriginalScanController}=await modulePromise;let applied=0,appliedResult,starts=0,queries=0,serial=0;const timers=new Map();
 const c=createOriginalScanController({api:async(action,args)=>{if(['jp_restore_apply','jp_restore_undo'].includes(action))starts++;else queries++;return reply(action,args);},makeRequestId:()=> 'legacy-nonce-001',onApplied:result=>{applied++;appliedResult=result;},schedule:fn=>{timers.set(++serial,fn);return serial;},unschedule:id=>timers.delete(id)});c.selectGame('g1');return {c,timers,applied:()=>applied,appliedResult:()=>appliedResult,starts:()=>starts,queries:()=>queries};}
const resultByAdapter={siglus:{applied:2,cells:35,patch:true},language:{applied:1,cells:0,mode:'setting',patch:false},overlay:{imported:2,replaced:0,added:0,removed:2,exe:'',applied:2,cells:0,patch:true}};
for(const [adapter,result]of Object.entries(resultByAdapter)){
 test(adapter+' direct legacy restore preserves its result, unlocks and notifies exactly once',async()=>{const f=await flow(()=>result);assert.equal(await f.c.runExisting('jp_restore_apply',{id:'g1'}),result);await flush();assert.equal(f.c.busy(),false);assert.equal(f.c.canClose(),true);assert.equal(f.applied(),1);assert.equal(f.timers.size,0);assert.equal(f.starts(),1);});
 test(adapter+' lost-start legacy completion recovers without another write',async()=>{const f=await flow((action,args)=>{if(action==='jp_restore_apply')throw Error('CONTROLLED_REPLY_LOST');return {jobId:'legacy-job',requestId:args.requestId,operation:'restore',state:'done',cancellable:false,legacy:true,result};});
  await assert.rejects(f.c.runExisting('jp_restore_apply',{id:'g1'}),/CONTROLLED_REPLY_LOST/);await flush();assert.equal(f.c.busy(),true);assert.equal(f.c.canClose(),false);assert.equal(f.c.cancel(),false);assert.equal(f.applied(),0);
  await f.c.refresh();await flush();assert.equal(f.c.state().error,'');assert.equal(f.c.busy(),false);assert.equal(f.c.canClose(),true);assert.equal(f.applied(),1);assert.equal(f.starts(),1);assert.equal(f.queries(),1);assert.equal(f.timers.size,0);await f.c.refresh();await flush();assert.equal(f.applied(),1);assert.equal(f.starts(),1);
 });
}
test('legacy undo completion keeps skipped files and resolves a lost reply once',async()=>{
 const result={restored:2,skipped:['changed-file']},f=await flow((action,args)=>{if(action==='jp_restore_undo')throw Error('CONTROLLED_REPLY_LOST');return {jobId:'legacy-undo',requestId:args.requestId,operation:'undo',state:'done',cancellable:false,legacy:true,result};});
 await assert.rejects(f.c.runExisting('jp_restore_undo',{id:'g1'}),/CONTROLLED_REPLY_LOST/);assert.equal(f.c.canClose(),false);await f.c.refresh();await flush();assert.equal(f.appliedResult(),result);assert.equal(f.c.busy(),false);assert.equal(f.applied(),1);assert.equal(f.starts(),1);assert.equal(f.queries(),1);
});
test('wrong nonce, forged legacy marker and malformed legacy values never become restore success',async()=>{
 for(const change of [r=>r.requestId='other-nonce',r=>r.operation='undo',r=>r.legacy='true',r=>r.legacy=false,r=>r.cancellable=true,r=>r.result.applied='1',r=>r.result.cells=-1,r=>r.result=[],r=>r.result=null]){
  const f=await flow((action,args)=>{if(action==='jp_restore_apply')throw Error('CONTROLLED_REPLY_LOST');const dto={jobId:'legacy-job',requestId:args.requestId,operation:'restore',state:'done',cancellable:false,legacy:true,result:{applied:1,cells:0}};change(dto);return dto;});await assert.rejects(f.c.runExisting('jp_restore_apply',{id:'g1'}),/CONTROLLED_REPLY_LOST/);await f.c.refresh();await flush();assert.equal(f.applied(),0);assert.equal(f.starts(),1);assert.equal(f.c.state().error,'ORIGINAL_SCAN_PROTOCOL');
 }
 for(const marker of [{legacy:true},{legacy:false},{requestId:'legacy-nonce-001'}]){
  const f=await flow(()=>({...marker,applied:1,cells:0}));await assert.rejects(f.c.runExisting('jp_restore_apply',{id:'g1'}),/ORIGINAL_SCAN_PROTOCOL/);await flush();assert.equal(f.applied(),0);assert.equal(f.c.busy(),true);
 }
});
test('embedded restore cannot use legacy marker or omit its confirmed local index',async()=>{
 for(const result of [{applied:1,cells:2,patch:false},{applied:1,cells:2,patch:true},{applied:1,cells:2,patch:true,localIndex:true}]){
  const forged=result.localIndex===true;
  let nonce;const f=await flow((action,args)=>{if(action==='jp_restore_scan'){nonce=args.requestId;return {jobId:'scan',requestId:nonce,operation:'scan',state:'done',cancellable:false,result:{state:'restorable',adapter:'utage-embedded',scanToken:'a'.repeat(64),canRestore:true,sources:[{path:'H:/neutral/book.bytes',bytes:12,sha256:'a'.repeat(64)}],coverage:{japaneseLines:2,localTranslations:2,missingTranslations:0}}};}
   return {jobId:'write',requestId:args.requestId,operation:'restore',state:'done',cancellable:false,...(forged?{legacy:true}:{}),result};});
  await f.c.scan();assert.equal(f.c.requestRestore(),true);const pending=f.c.confirm();pending.catch(()=>{});
  if(forged){await flush();assert.equal(f.c.state().error,'ORIGINAL_SCAN_PROTOCOL');assert.equal(f.c.busy(),true);assert.equal(f.c.canClose(),false);assert.equal(f.c.cancel(),false);}else await assert.rejects(pending,/ORIGINAL_SCAN_PROTOCOL/);
  assert.equal(f.applied(),0);
 }
});
test('actual overlay bridge branch preserves restoration counts and enables only usable pairings',async()=>{
 const raw={imported:2,replaced:0,added:0,removed:2,exe:''};let writes=0,closed=false,refreshes=0;
 let hasPairs=false,enabled=false,enabledWrites=0,searches=0;
 const db={prepare(){return {get:()=>({id:'g1',executable:'H:/neutral/game.exe',original:'{}'}),run:()=>({changes:1})};},close(){closed=true;}};
 const deps={'node:fs':{},'./store.cjs':{openStore:()=>db},'./relay-gate.cjs':{install(){}},'./embedded-japanese-jobs.cjs':{known:()=>null,runLegacy:async(id,dir,opts,perform)=>perform()},'./embedded-japanese.cjs':{manifest:()=>null},
  '../core/japanese-restore.cjs':{_internal:{gameRunning:()=>false},detect:()=>({adapter:'overlay-patch'})},'../core/japanese-import.cjs':{detect:()=>null},'../core/game-language-switch.cjs':{_internal:{steamApp:()=>null}},'./japanese-restore-options.cjs':{forExecutable:()=>({})},'../core/profiles/index.cjs':{profileFor:()=>({}),get:()=>false},'../core/japanese-import-original.cjs':{readManifest:()=>null,async apply(){writes++;return raw;}},'./game-language.cjs':{originalExecutable(){}},'../core/locale-emulator.cjs':{x86:()=>false,steamApi:()=>false},
  './settings.cjs':{Settings:class {read(){return {scriptTranslation:enabled};}setScriptTranslation(value){enabled=value;enabledWrites++;}}},
  './text-source-worker.cjs':{run:async(_,task)=>{if(task==='localPairs')return {hasPairs};assert.equal(task,'autoPatch');searches++;return {kept:true};}}};
 const module={exports:{}},req=id=>{if(Object.hasOwn(deps,id))return deps[id];if(id.startsWith('node:'))return require(id);throw Error('UNEXPECTED_DEPENDENCY:'+id);};req.main=null;
 vm.runInNewContext('(function(require,module,exports,__dirname,process){'+fs.readFileSync(path.join(sourceRoot,'services/bridge.cjs'),'utf8')+'\n})',{Buffer,console,setTimeout,clearTimeout},{filename:'actual-bridge.cjs'})(req,module,module.exports,path.join(sourceRoot,'services'),{env:{MEGULIT_ROOT:'H:/neutral-root'}});
 const dispatch=requestId=>module.exports.dispatch({action:'jp_restore_apply',id:'g1',requestId},{reader:{refreshTextSource(){refreshes++;}}});
 const result=await dispatch('legacy-nonce-001');assert.equal(result.applied,2);assert.equal(result.cells,0);for(const key of ['imported','replaced','added','removed','exe'])assert.equal(result[key],raw[key]);
 assert.equal(result.patch,false);assert.equal(searches,1);assert.equal(enabledWrites,0);
 hasPairs=true;
 const paired=await dispatch('legacy-nonce-002');assert.equal(paired.patch,true);assert.equal(enabled,true);assert.equal(enabledWrites,1);assert.equal(writes,2);assert.equal(refreshes,2);assert.equal(closed,true);assert.equal(Object.hasOwn(raw,'applied'),false);
});
