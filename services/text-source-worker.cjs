// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
/* 2026-11-14 (user: the 日文原版与语言环境 dialog's buttons were dead, then every click fired at once): the service runs
   requests on one thread, and the zero-latency script work (the patch search walks every folder next to the game and reads
   each candidate's scripts; an import reads and lines up a whole script) ran on it. A search over E:\GAL held every other
   request for many seconds: the game page stayed blank, the dialog did not open, and clicks piled up. That work now runs in
   a worker thread with its own database handle; the service only waits for the answer. */
const {Worker,isMainThread,workerData,parentPort}=require('node:worker_threads');
const TASKS=new Set(['status','importPatch','importOriginal','autoPatch','localPairs','clear']);
const updates=new Map();

function call(root,task,args,cachedOnly){
 const ot=require('./original-text.cjs'),db=require('./store.cjs').openStore(root);
 const perform=()=>{
  if(task==='importPatch')return ot.importPatchSource(root,db,...args);
  if(task==='clear'){
   const [id,kind]=args;
   if(kind==='patch')ot.clearPatch(root,id);
   else if(kind==='original')ot.setMode(root,id,'off');
   else throw Error('INVALID_TEXT_SOURCE');
   return ot.status(root,db,id);
  }
  return ot[task](root,db,...args);
 };
 return Promise.resolve().then(()=>cachedOnly?require('./original-engines/garbro.cjs').withCached(perform):perform()).finally(()=>{try{db.close();}catch{}});
}
const plain=value=>value===undefined?null:JSON.parse(JSON.stringify(value));
const codeOf=error=>{const text=String(error?.message||error||'');return /^[A-Z][A-Z0-9_]+$/.test(text)?text:'SERVICE_FAILED';};

// Runs ot[task](root, db, ...args) off the service thread; resolves with its result, rejects with its error code.
function run(root,task,args=[],options={}){
 if(!TASKS.has(task))return Promise.reject(Error('INVALID_TEXT_SOURCE_TASK'));
 if(task==='localPairs')return execute(root,task,args,options);
 /* These workers update a shared index manifest even when their game IDs differ. */
 const update=(updates.get(root)||Promise.resolve()).catch(()=>{}).then(()=>execute(root,task,args,options));
 updates.set(root,update);
 const done=()=>{if(updates.get(root)===update)updates.delete(root);};
 update.then(done,done);
 return update;
}
function execute(root,task,args,{inline=false,cachedOnly=false}){
 if(inline||process.env.MEGULIT_TEXT_SOURCE_INLINE)return call(root,task,args,cachedOnly).then(plain);
 return new Promise((resolve,reject)=>{
  let worker;try{worker=new Worker(__filename,{workerData:{root,task,args,cachedOnly}});}catch{call(root,task,args,cachedOnly).then(v=>resolve(plain(v)),reject);return;}
  let settled=false;const finish=(fn,value)=>{if(!settled){settled=true;fn(value);}};
  worker.once('message',m=>m?.ok?finish(resolve,m.value):finish(reject,Error(m?.error||'SERVICE_FAILED')));
  worker.once('error',error=>finish(reject,Error(codeOf(error))));
  worker.once('exit',()=>finish(reject,Error('SERVICE_FAILED')));
 });
}

if(!isMainThread&&workerData?.task&&TASKS.has(workerData.task)){
 call(workerData.root,workerData.task,workerData.args||[],workerData.cachedOnly).then(value=>parentPort.postMessage({ok:true,value:plain(value)}),error=>parentPort.postMessage({ok:false,error:codeOf(error)}));
}
module.exports={run,TASKS};
