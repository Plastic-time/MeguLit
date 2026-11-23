// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
const test=require('node:test'), assert=require('node:assert/strict');
const fs=require('node:fs'), os=require('node:os'), path=require('node:path');
const {startEdge,startWeb}=require('./library-views-perf.cjs');
const {Settings}=require('../services/settings.cjs');
const hasEdge=[process.env.MEGULIT_EDGE,'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
 'C:/Program Files/Microsoft/Edge/Application/msedge.exe'].some(p=>p&&fs.existsSync(p));

test('settings actions can be retried after their service calls fail',{skip:!hasEdge},async t=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'megulit-settings-buttons-'));
 let server,browser;
 t.after(async()=>{
  await browser?.stop();
  server?.close();
  await fs.promises.rm(root,{recursive:true,force:true,maxRetries:10,retryDelay:150});
 });
 server=await startWeb();
 browser=await startEdge(path.join(root,'edge'));
 const origin='http://127.0.0.1:'+server.address().port;
 await browser.send('Page.navigate',{url:origin+'/settings.js'});
 const settings=new Settings(root).get();
 settings.values.translation.provider='gpt';
 await browser.evaluate(`(async()=>{
  const {renderSettings}=await import('/settings.js');
  window.exercise=async(section,action,open,confirm)=>{
   document.body.innerHTML='<main></main>';
   const messages=[],calls=[],main=document.querySelector('main');
   let rejectFirst;
   const api=async(name,request)=>{
    if(name==='settings_get')return ${JSON.stringify(settings)};
    if(name===action){calls.push(name);if(calls.length===1)return new Promise((_,reject)=>{rejectFirst=reject;});return {id:'fixture'};}
    return {};
   };
   await renderSettings({main,section,api,locale:'en',esc:String,
    toast:msg=>messages.push(msg),heading:()=>'<div class="page-tools"></div>',text:{settings:'Settings',serviceFailed:'Service failed'},
    isCurrent:()=>true,onSaved:async()=>{}});
   const tick=()=>new Promise(resolve=>setTimeout(resolve,0));
   if(open){main.querySelector(open).click();await tick();}
   if(action==='save_key')main.querySelector('#translation-key').value='fixture';
   const button=document.querySelector(confirm);
   button.click();button.click();
   const busy=button.disabled&&calls.length===1;
   rejectFirst(Error('BUSY'));await tick();
   const canRetry=!button.disabled;
   button.click();await tick();
   return {busy,canRetry,calls:calls.length,messages,finished:action==='save_key'?!button.disabled:!!document.querySelector('[data-undo]')};
  };
 })()`);
 for(const [action,section,open,confirm,failure,success] of [
  ['settings_reset','data','[data-reset-all]','[data-confirm]','Something went wrong. Try again later',null],
  ['save_key','translation',null,'#save-translation-key','Service failed','Key saved encrypted'],
 ]){
  await t.test(action,async()=>{
   const result=await browser.evaluate('exercise(...'+JSON.stringify([section,action,open,confirm])+')');
   assert.equal(result.busy,true);
   assert.equal(result.canRetry,true);
   assert.equal(result.calls,2);
   assert.equal(result.finished,true);
   assert.ok(result.messages.includes(failure));
   if(success)assert.ok(result.messages.includes(success));
  });
 }
});
