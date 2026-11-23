// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const root=fs.mkdtempSync(path.join(os.tmpdir(),'embedded-bridge-'));process.env.MEGULIT_ROOT=root;
const {dispatch:rawDispatch}=require('../services/bridge.cjs'),store=require('../services/store.cjs');
let serial=0;
const dispatch=(request,runtime)=>rawDispatch((request.action==='jp_restore_scan'||request.action==='jp_restore_apply'&&request.embedded===true||request.action==='jp_restore_undo')&&!request.requestId?{...request,requestId:'fixture-request-'+(++serial)}:request,runtime);
const jobs=require('../services/embedded-japanese-jobs.cjs'),embedded=require('../services/embedded-japanese.cjs');
const {install}=require('./helpers/utage-embedded-fixture.cjs');
test.after(()=>fs.rmSync(root,{recursive:true,force:true}));
function game(id){const f=install(path.join(root,id));const db=store.openStore(root);try{db.prepare('INSERT INTO games(id,title,executable) VALUES(?,?,?)').run(id,'Fixture',f.exe);}finally{db.close();}return f;}
async function completed(id,dto){await jobs._internal.jobs.get(dto.jobId).closed;const status=await dispatch({action:'jp_restore_scan_status',id,jobId:dto.jobId});assert.equal(status.state,'done',status.error);assert.equal(jobs._internal.jobs.get(dto.jobId).child,null);return status.result;}

test('Japanese locale saves and reloads independently for each work',async()=>{
 game('locale-a');game('locale-b');
 await dispatch({action:'game_locale_mode',id:'locale-a',japanese:true});
 assert.equal((await dispatch({action:'game_original_executable',id:'locale-a'})).localeJapanese,true);
 assert.equal((await dispatch({action:'game_original_executable',id:'locale-b'})).localeJapanese,false);
 await assert.rejects(dispatch({action:'game_locale_mode',id:'locale-a',japanese:'false'}),/INVALID_LOCALE_MODE/);
 assert.equal((await dispatch({action:'game_original_executable',id:'locale-a'})).localeJapanese,true);
 await dispatch({action:'game_locale_mode',id:'locale-a',japanese:false});
 const db=store.openStore(root);
 try{assert.equal(store.games(db,root).find(work=>work.id==='locale-a').localeMode,'off');}
 finally{db.close();}
});

test('production bridge → scan worker → explicit core restore → provider → undo is complete',async()=>{
 const f=game('chain'),db=store.openStore(root);try{db.prepare('UPDATE games SET original=? WHERE id=?').run(JSON.stringify({library:{contentLanguage:'zh'}}),'chain');assert.equal(require('../services/game-language.cjs').originalExecutable(db,'chain',root).blocked,true);}finally{db.close();}
 const scanning=await dispatch({action:'jp_restore_scan',id:'chain'});assert.equal(scanning.state,'running');
 const scan=await completed('chain',scanning);assert.equal(scan.state,'restorable');assert.equal(scan.coverage.rows,36);
 assert.equal((await dispatch({action:'text_source_toggle',id:'chain',enabled:false})).active,false);
 await assert.rejects(dispatch({action:'jp_restore_apply',id:'chain',embedded:true}),/INVALID_SCAN_TOKEN/);
 let refreshed=0;const runtime={reader:{refreshTextSource(){refreshed++;}}};
 const applying=await dispatch({action:'jp_restore_apply',id:'chain',embedded:true,scanToken:scan.scanToken},runtime);
 assert.equal(applying.operation,'restore');assert.equal(applying.cancellable,false);
 await assert.rejects(dispatch({action:'jp_restore_scan_cancel',id:'chain',jobId:applying.jobId}),/RESTORE_NOT_CANCELLABLE/);
 for(const action of ['jp_import_apply','jp_restore_apply','jp_restore_undo','jp_auto_undo','launch'])await assert.rejects(dispatch({action,id:'chain'}),/EMBEDDED_JOB_BUSY/);
 const recovered=await dispatch({action:'jp_restore_scan_status',id:'chain',requestId:applying.requestId});assert.equal(recovered.jobId,applying.jobId);assert.equal(recovered.operation,'restore');
 assert.equal((await dispatch({action:'jp_restore_apply',id:'chain',embedded:true,scanToken:scan.scanToken,requestId:applying.requestId})).jobId,applying.jobId);
 const restored=await completed('chain',applying);assert.equal(restored.applied,2);assert.equal(restored.localIndex,true);assert.equal(restored.patch,true);assert.equal(refreshed,1);
 assert.deepEqual(await dispatch({action:'text_source_activity',id:'chain'}),{hasPairs:true,enabled:true,english:false,embedded:true,active:true});
 assert.equal((await dispatch({action:'text_source_toggle',id:'chain',enabled:false})).active,false);
 const state=await dispatch({action:'jp_restore_detect',id:'chain'});assert.equal(state.adapter,'utage-embedded');assert.equal(state.state,'applied');
 const ready=store.openStore(root);try{assert.equal(require('../services/game-language.cjs').originalExecutable(ready,'chain',root).blocked,false);}finally{ready.close();}
 assert.equal(require('../services/original-text.cjs').provider(root,f.exe).resolve('これから最初の旅に出ます。').translation,'从这里出发踏上旅程。');
 const again=await completed('chain',await dispatch({action:'jp_restore_apply',id:'chain',embedded:true,scanToken:scan.scanToken}));assert.equal(again.already,true);assert.equal(again.cells,scan.coverage.rows);assert.equal(again.applied,0);
 assert.equal((await dispatch({action:'text_source_activity',id:'chain'})).enabled,false);
 const undoJob=await dispatch({action:'jp_restore_undo',id:'chain'},runtime),undo=await completed('chain',undoJob);assert.equal(undo.restored,2);assert.deepEqual(undo.skipped,[]);assert.equal(refreshed,2);assert.equal(embedded.manifest(f.dir),null);
 assert.equal((await dispatch({action:'text_source_activity',id:'chain'})).hasPairs,false);
 const recoveredUndo=await dispatch({action:'jp_restore_scan_status',id:'chain',requestId:undoJob.requestId,operation:'undo',retireIfMissing:true});assert.equal(recoveredUndo.state,'done');assert.equal(recoveredUndo.result.restored,2);
 assert.equal((await dispatch({action:'jp_restore_undo',id:'chain',requestId:undoJob.requestId})).jobId,undoJob.jobId);
 const after=store.openStore(root);try{assert.equal(require('../services/game-language.cjs').originalExecutable(after,'chain',root).blocked,true);}finally{after.close();}
});

test('scan cancellation waits for real child close and job ownership is enforced',async()=>{
 const f=game('cancel'),before=fs.readFileSync(f.baseFile),started=await dispatch({action:'jp_restore_scan',id:'cancel'});
 const ended=await dispatch({action:'jp_restore_scan_cancel',id:'cancel',jobId:started.jobId});
 assert.equal(ended.state,'cancelled');assert.equal(jobs._internal.jobs.get(started.jobId).child,null);
 assert.equal(ended.result,undefined);assert.ok(fs.readFileSync(f.baseFile).equals(before));assert.equal(fs.existsSync(path.join(f.dir,'.megulit-japanese')),false);
 await assert.rejects(dispatch({action:'jp_restore_scan_status',id:'chain',jobId:started.jobId}),/SCAN_JOB_NOT_FOUND/);
});

test('a changed source after scan is rejected by the restore worker without backups or writes',async()=>{
 const f=game('stale'),scan=await completed('stale',await dispatch({action:'jp_restore_scan',id:'stale'}));
 fs.appendFileSync(f.baseFile,Buffer.alloc(4));const expected=fs.readFileSync(f.baseFile);
 const job=await dispatch({action:'jp_restore_apply',id:'stale',embedded:true,scanToken:scan.scanToken});await jobs._internal.jobs.get(job.jobId).closed;
 const failed=await dispatch({action:'jp_restore_scan_status',id:'stale',jobId:job.jobId});assert.equal(failed.state,'failed');assert.equal(failed.error,'SCAN_STALE');
 assert.ok(fs.readFileSync(f.baseFile).equals(expected));assert.equal(fs.existsSync(path.join(f.dir,'.megulit-japanese')),false);
});

test('an unknown lost-start nonce can be retired atomically and a late restore cannot execute',async()=>{
 const f=game('retire'),requestId='lost-write-request-0001',before=fs.readFileSync(f.baseFile);
 const retired=await dispatch({action:'jp_restore_scan_status',id:'retire',requestId,retireIfMissing:true,operation:'restore'});
 assert.equal(retired.state,'cancelled');assert.equal(retired.retired,true);assert.equal(retired.notStarted,true);
 const late=await dispatch({action:'jp_restore_apply',id:'retire',requestId,embedded:true,scanToken:'a'.repeat(64)});
 assert.equal(late.state,'cancelled');assert.equal(late.retired,true);assert.equal(late.jobId,retired.jobId);
 assert.ok(fs.readFileSync(f.baseFile).equals(before));assert.equal(embedded.manifest(f.dir),null);
 await assert.rejects(dispatch({action:'jp_restore_scan',id:'retire',requestId}),/REQUEST_ID_REUSED/);
 const cancelled=await dispatch({action:'jp_restore_scan_cancel',id:'retire',requestId:'lost-scan-request-0001'});assert.equal(cancelled.notStarted,true);
 assert.equal((await dispatch({action:'jp_restore_scan',id:'retire',requestId:'lost-scan-request-0001'})).retired,true);
});

test('read jobs register before cancellation awaits and legacy write reservations share the directory guard',async()=>{
 const f=game('queued'),first=await dispatch({action:'jp_restore_scan',id:'queued'}),second=await dispatch({action:'jp_restore_scan',id:'queued'});
 const byNonce=await dispatch({action:'jp_restore_scan_status',id:'queued',requestId:second.requestId});assert.equal(byNonce.jobId,second.jobId);
 const cancelled=await dispatch({action:'jp_restore_scan_cancel',id:'queued',requestId:second.requestId});assert.equal(cancelled.state,'cancelled');
 assert.equal(jobs._internal.jobs.get(first.jobId).child,null);assert.equal(jobs._internal.jobs.get(second.jobId).child,null);
 const release=jobs.reserveLegacyWrite(f.dir);
 try{await assert.rejects(dispatch({action:'jp_restore_scan',id:'queued',requestId:'guarded-scan-request'}),/EMBEDDED_JOB_BUSY/);assert.throws(()=>jobs.assertLaunchSafe(f.dir),/EMBEDDED_JOB_BUSY/);}finally{release();}
 const failed=await dispatch({action:'jp_restore_scan_status',id:'queued',requestId:'guarded-scan-request'});assert.equal(failed.state,'failed');assert.equal(failed.error,'EMBEDDED_JOB_BUSY');
});

test('legacy undo keeps its synchronous result shape while its nonce can recover a lost reply',async()=>{
 const f=game('legacy'),backup=path.join(f.dir,'.megulit-japanese');fs.mkdirSync(path.join(backup,'yuris'),{recursive:true});
 fs.writeFileSync(path.join(backup,'manifest.json'),JSON.stringify({version:1,adapter:'yuris-update',files:[]}));
 const request={action:'jp_restore_undo',id:'legacy',requestId:'legacy-undo-lost-reply'};
 const response=await dispatch(request);assert.equal(response.jobId,undefined);assert.equal(response.restored,0);assert.deepEqual(response.skipped,[]);
 const recovered=await dispatch({action:'jp_restore_scan_status',id:'legacy',requestId:request.requestId,operation:'undo',retireIfMissing:true});
 assert.equal(recovered.operation,'undo');assert.equal(recovered.state,'done');assert.equal(recovered.legacy,true);assert.deepEqual(recovered.result,response);
 assert.deepEqual(await dispatch(request),response);
});

test('two library ids for the same directory share the write guard at real bridge entry points',async()=>{
 const f=game('shared-a'),alias=path.join(f.dir,'Other.exe');fs.writeFileSync(alias,'fixture, never execute');
 const db=store.openStore(root);try{db.prepare('INSERT INTO games(id,title,executable) VALUES(?,?,?)').run('shared-b','Same directory',alias);}finally{db.close();}
 const started=await dispatch({action:'jp_restore_apply',id:'shared-a',embedded:true,scanToken:'0'.repeat(64)});
 try{for(const action of ['jp_import_apply','jp_restore_apply','jp_restore_undo','launch','jp_restore_scan'])await assert.rejects(dispatch({action,id:'shared-b'}),/EMBEDDED_JOB_BUSY/);}finally{await jobs._internal.jobs.get(started.jobId).closed;}
 assert.equal(jobs.status('shared-a',started.jobId).error,'SCAN_STALE');
 jobs.assertLaunchSafe(f.dir);assert.equal(embedded.manifest(f.dir),null);
});

test('a real deferred bridge launch holds its reservation across await and across a junction alias',async()=>{
 const f=game('deferred-launch'),alias=path.join(root,'launch-alias');fs.symlinkSync(f.dir,alias,'junction');fs.writeFileSync(path.join(f.dir,'Other.exe'),'fixture, never execute');
 const db=store.openStore(root);try{db.prepare('INSERT INTO games(id,title,executable) VALUES(?,?,?)').run('deferred-alias','Alias',path.join(alias,'Other.exe'));}finally{db.close();}
 const background=require('../services/background-games.cjs'),old=background.foreground;let entered,stop;
 const waiting=new Promise(resolve=>{entered=resolve;});background.foreground=()=>{entered();return new Promise((resolve,reject)=>{stop=()=>reject(Error('DEFERRED_LAUNCH_END'));});};
 const launching=dispatch({action:'launch',id:'deferred-launch'}).catch(error=>error);
 try{
  await waiting;assert.equal(jobs._internal.launches.size,1);
  for(const request of [{action:'jp_restore_apply',embedded:true,scanToken:'0'.repeat(64)},{action:'jp_import_apply'},{action:'jp_restore_undo'},{action:'jp_restore_scan'},{action:'launch'}])await assert.rejects(dispatch({...request,id:'deferred-alias'}),/EMBEDDED_JOB_BUSY/);
 }finally{stop();const error=await launching;assert.equal(error.message,'DEFERRED_LAUNCH_END');background.foreground=old;}
 assert.equal(jobs._internal.launches.size,0);jobs.assertLaunchSafe(alias);
 const lease=jobs.reserveLaunch(f.dir),nested=jobs.reserveLaunch(alias,lease.token);nested.release();assert.throws(()=>jobs.reserveLegacyWrite(alias),/EMBEDDED_JOB_BUSY/);lease.release();jobs.assertLaunchSafe(alias);
});
