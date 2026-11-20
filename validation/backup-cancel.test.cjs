// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
const test=require('node:test'), assert=require('node:assert/strict');
const fs=require('node:fs'), os=require('node:os'), path=require('node:path');
const {startEdge,startWeb}=require('./library-views-perf.cjs');
const {exportBackup,previewBackup,applyBackup,discardBackup}=require('../services/backup.cjs');
const hasEdge=[process.env.MEGULIT_EDGE,'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
 'C:/Program Files/Microsoft/Edge/Application/msedge.exe'].some(p=>p&&fs.existsSync(p));

test('a committed restore keeps its checkpoint if preview cleanup fails',async t=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'megulit-restored-preview-'));
 t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
 const file=path.join(root,'copy.megulitbak');
 await exportBackup(root,file);
 const {id}=previewBackup(root,file),folder=path.join(root,'cache',id);
 const rm=fs.rmSync;
 const locked=t.mock.method(fs,'rmSync',(target,options)=>{
  if(target===folder)throw Object.assign(Error('busy'),{code:'EBUSY'});
  return rm(target,options);
 });
 const result=applyBackup(root,id);
 assert.equal(result.restored,true);
 assert.ok(fs.existsSync(path.join(result.rollback,'megulit.sqlite')));
 assert.throws(()=>applyBackup(root,id),/INVALID_BACKUP_ID/);
 assert.equal(fs.readdirSync(path.dirname(path.dirname(result.rollback))).length,1);
 locked.mock.restore();
 discardBackup(root,id);
 assert.ok(!fs.existsSync(folder));
 assert.doesNotThrow(()=>discardBackup(root,id));
 assert.throws(()=>discardBackup(root,'not-a-preview'),/INVALID_BACKUP_ID/);
});

test('backup previews can be cancelled, retried, and restored',{skip:!hasEdge},async t=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'megulit-backup-cancel-'));
 const previous=process.env.MEGULIT_ROOT;
 process.env.MEGULIT_ROOT=root;
 const {dispatch}=require('../services/bridge.cjs');
 let server,browser;
 t.after(async()=>{
  if(previous===undefined)delete process.env.MEGULIT_ROOT;else process.env.MEGULIT_ROOT=previous;
  await browser?.send('Browser.close').catch(()=>{});
  browser?.stop();server?.close();
  await fs.promises.rm(root,{recursive:true,force:true,maxRetries:10,retryDelay:150});
 });
 const file=path.join(root,'copy.megulitbak');
 await exportBackup(root,file);
 const other=previewBackup(root,file);
 server=await startWeb({call:request=>dispatch(request)});
 browser=await startEdge(path.join(root,'edge'));
 await browser.send('Page.navigate',{url:'http://127.0.0.1:'+server.address().port+'/backup-ui.js'});
 await browser.evaluate(`(async()=>{
  const {renderBackup}=await import('/backup-ui.js');
  let lastCall;
  const messages=[];window.discards=0;
  const api=(action,params)=>{
   if(action==='backup_discard'){
    window.discards++;
    if(window.busyDiscard){window.busyDiscard=false;return Promise.reject(Error('BACKUP_BUSY'));}
   }
   if(action==='backup_apply'&&window.failOnce){
    window.failOnce=false;
    return new Promise((_,reject)=>{window.rejectApply=()=>reject(Error('BACKUP_BUSY'));});
   }
   return lastCall=fetch('/svc',{method:'POST',body:JSON.stringify({action,...params})})
   .then(r=>r.json()).then(r=>{if(!r.ok)throw Error(r.error);return r.data;});
  };
  renderBackup({target:document.body,api,invoke:async()=>${JSON.stringify(file)},locale:'en',esc:String,
   toast:msg=>messages.push(msg),onSaved:async()=>{if(window.refreshFails)throw Error('OFFLINE');}});
  window.openPreview=()=>document.querySelector('[data-import]').onclick();
  window.dismiss=async cancel=>{
   const dialog=document.querySelector('dialog[open]');
   const closed=new Promise(resolve=>dialog.addEventListener('close',resolve,{once:true}));
   if(cancel)dialog.querySelector('[data-cancel]').click();else dialog.requestClose();
   await closed;await lastCall;
  };
  window.retryRestore=async()=>{
   const dialog=document.querySelector('dialog'),button=dialog.querySelector('[data-restore]');
   window.failOnce=true;
   button.click();dialog.requestClose();
   const pending=dialog.open&&button.disabled&&dialog.querySelector('[data-cancel]').disabled;
   rejectApply();await new Promise(resolve=>setTimeout(resolve,0));
   return {pending,canRetry:dialog.open&&!button.disabled,failed:messages.at(-1)};
  };
  window.restore=async refreshFails=>{
   window.refreshFails=refreshFails;
   const button=document.querySelector('[data-restore]');
   button.click();await lastCall;await new Promise(resolve=>setTimeout(resolve,0));
   return {message:messages.at(-1),rollback:document.querySelector('[data-result]').textContent};
  };
 })()`);
 const previews=()=>fs.readdirSync(path.join(root,'cache')).filter(name=>name.startsWith('backup-import-'));
 for(const cancel of [true,false]){
  await browser.evaluate('openPreview()');
  assert.equal(previews().length,2);
  await browser.evaluate('dismiss('+cancel+')');
  assert.deepEqual(previews(),[other.id]);
 }
 assert.ok(fs.existsSync(file));
 assert.ok(fs.existsSync(path.join(root,'data','megulit.sqlite')));
 await browser.evaluate('openPreview()');
 assert.equal(await browser.evaluate(`(async()=>{
  window.busyDiscard=true;
  const cancel=document.querySelector('[data-cancel]');
  cancel.click();await new Promise(resolve=>setTimeout(resolve,0));
  return cancel.closest('dialog').open&&!cancel.disabled;
 })()`),true);
 assert.equal(previews().length,2);
 await browser.evaluate('dismiss(true)');
 assert.deepEqual(previews(),[other.id]);
 await browser.evaluate('openPreview()');
 assert.deepEqual(await browser.evaluate('retryRestore()'),{
  pending:true,canRetry:true,failed:'Operation failed. Check the backup file or try again later'
 });
 for(const refreshFails of [true,false]){
  if(!refreshFails)await browser.evaluate('openPreview()');
  const result=await browser.evaluate('restore('+refreshFails+')');
  assert.equal(result.message,refreshFails?'Data restored. Reopen the window to refresh settings':'Data restored');
  assert.ok(fs.existsSync(path.join(result.rollback,'megulit.sqlite')));
  assert.deepEqual(previews(),[other.id]);
 }
 assert.equal(await browser.evaluate('window.discards'),4);
});
