// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),{fork}=require('node:child_process');
const jobs=new Map(),requests=new Map(),legacyWrites=new Set(),ACTIVE=new Set(['queued','running','cancelling']);
const MAX_JOBS=16,MAX_REQUESTS=4096,TIMEOUT_MS=60000;
const directory=dir=>path.resolve(dir).toLowerCase(),requestKey=(id,nonce)=>JSON.stringify([String(id),nonce]);
function nonce(value){if(!/^[a-zA-Z0-9_-]{8,80}$/.test(String(value||'')))throw Error('INVALID_REQUEST_ID');return String(value);}
function dto(job){return {jobId:job.jobId,requestId:job.requestId,operation:job.operation,state:job.state,progress:job.progress,cancellable:job.operation==='scan'&&ACTIVE.has(job.state),...(job.result?{result:job.result}:{}),...(job.error?{error:job.error}:{}),...(job.legacy?{legacy:true}:{}),...(job.retired?{retired:true,notStarted:true}:{})};}
function known(id,requestId){if(!requestId)return null;const job=requests.get(requestKey(id,nonce(requestId)));return job?dto(job):null;}
function active(dir){return [...jobs.values()].filter(job=>job.directory===directory(dir)&&ACTIVE.has(job.state));}
function locked(dir){return fs.existsSync(path.join(dir,'.megulit-embedded-lock'));}
function assertLaunchSafe(dir){if(legacyWrites.has(directory(dir))||active(dir).some(job=>job.operation!=='scan')||locked(dir))throw Error('EMBEDDED_JOB_BUSY');}
function reserveLegacyWrite(dir){if(legacyWrites.has(directory(dir))||active(dir).length||locked(dir))throw Error('EMBEDDED_JOB_BUSY');const key=directory(dir);legacyWrites.add(key);return ()=>legacyWrites.delete(key);}
function owned(id,query={}){
 if(typeof query==='string')query={jobId:query};let job;
 if(query.requestId)job=requests.get(requestKey(id,nonce(query.requestId)));
 else if(query.jobId)job=jobs.get(String(query.jobId))||[...requests.values()].find(j=>j.jobId===String(query.jobId));
 else{const own=[...jobs.values()].filter(j=>j.id===String(id));job=own.filter(j=>ACTIVE.has(j.state)).at(-1)||own.at(-1);}
 if(job&&job.id!==String(id))throw Error('SCAN_JOB_NOT_FOUND');return job;
}
function status(id,query={}){
 if(typeof query==='string')query={jobId:query};let job=owned(id,query);
 if(job)return dto(job);
 if(query.requestId&&query.retireIfMissing===true){
  const requestId=nonce(query.requestId),operation=query.operation||'scan';
  if(!['scan','restore','undo'].includes(operation))throw Error('EMBEDDED_JOB_OPERATION');
  job={id:String(id),requestId,operation,jobId:crypto.randomBytes(12).toString('hex'),state:'cancelled',retired:true,progress:{phase:'not-started'},closed:Promise.resolve()};
  requests.set(requestKey(id,requestId),job);return dto(job);
 }
 if(query.jobId)throw Error('SCAN_JOB_NOT_FOUND');
 return {state:'idle',active:false,requestId:query.requestId||''};
}
function finish(job){
 if(job.settled)return;job.settled=true;
 job.state=job.cancelled?'cancelled':job.error||!job.received?'failed':'done';
 if(!job.received&&!job.cancelled&&!job.error)job.error='EMBEDDED_WORKER_EXIT';
 if(job.cancelled){delete job.result;delete job.error;}job.child=null;job.finish();
 if(job.state==='done')try{job.onDone?.(job.result);}catch{}
}
async function cancel(id,query={}){
 if(typeof query==='string')query={jobId:query};const job=owned(id,query);
 if(!job){if(query.requestId)return status(id,{...query,retireIfMissing:true,operation:'scan'});return {state:'idle',active:false};}
 if(!ACTIVE.has(job.state))return dto(job);
 if(job.operation!=='scan')throw Error('RESTORE_NOT_CANCELLABLE');
 job.state='cancelling';job.cancelled=true;
 if(job.child)job.child.kill();else{await job.priorClosed;finish(job);}
 await job.closed;return dto(job);
}
async function run(job,previous){
 try{
  for(const prior of previous)await cancel(prior.id,{jobId:prior.jobId});
  if(job.cancelled)return;
  const child=fork(path.join(__dirname,'embedded-japanese-worker.cjs'),[],{execPath:process.execPath,execArgv:['--max-old-space-size=384'],stdio:['ignore','ignore','ignore','ipc'],windowsHide:true,env:{...process.env,MEGULIT_NO_PREWARM:'1'}});
  job.child=child;job.state='running';job.progress={phase:'starting'};
  const timer=job.operation==='scan'?setTimeout(()=>{job.error='EMBEDDED_TIME_BUDGET';child.kill();},TIMEOUT_MS):null;timer?.unref?.();
  child.on('message',message=>{if(message.type==='progress')job.progress=message.value;else if(message.type==='result'){job.result=message.result;job.error=message.error;job.received=true;}});
  child.on('error',error=>{job.error=String(error.message||error);});
  child.once('close',()=>{clearTimeout(timer);finish(job);});
  child.send({dir:job.dir,operation:job.operation,scanToken:job.scanToken});
 }catch(error){
  job.error=String(error.message||error);
  if(job.child)job.child.kill();else finish(job);
 }
}
function start(id,dir,{operation='scan',scanToken,requestId,onDone}={}){
 id=String(id);dir=path.resolve(dir);requestId=nonce(requestId);
 if(!['scan','restore','undo'].includes(operation))throw Error('EMBEDDED_JOB_OPERATION');
 const seen=requests.get(requestKey(id,requestId));
 if(seen){if(seen.legacy||seen.operation!==operation||seen.dir&&seen.directory!==directory(dir)||!seen.retired&&operation==='restore'&&seen.scanToken!==scanToken)throw Error('REQUEST_ID_REUSED');return dto(seen);}
 if(operation==='restore'&&!/^[a-f0-9]{64}$/.test(String(scanToken||'')))throw Error('INVALID_SCAN_TOKEN');
 if(requests.size>=MAX_REQUESTS)throw Error('EMBEDDED_REQUEST_LIMIT');
 for(const [key,job] of jobs)if(jobs.size>=MAX_JOBS&&!ACTIVE.has(job.state))jobs.delete(key);
 if(jobs.size>=MAX_JOBS)throw Error('EMBEDDED_JOB_LIMIT');
 const previous=active(dir),job={id,dir,directory:directory(dir),requestId,operation,scanToken,onDone,jobId:crypto.randomBytes(12).toString('hex'),state:'queued',progress:{phase:'queued'},child:null};
 job.closed=new Promise(resolve=>{job.finish=resolve;});
 job.priorClosed=Promise.all(previous.map(prior=>prior.closed));
 /* Register before cancellation waits or fork. A retired nonce cannot be revived
    by a late start on the same service connection. */
 requests.set(requestKey(id,requestId),job);jobs.set(job.jobId,job);
 if(legacyWrites.has(job.directory)||locked(dir)||previous.some(prior=>prior.operation!=='scan'||operation!=='scan')){job.error='EMBEDDED_JOB_BUSY';finish(job);throw Error(job.error);}
 void run(job,previous);return dto(job);
}
async function runLegacy(id,dir,{operation,requestId},perform){
 id=String(id);dir=path.resolve(dir);const requestIdKey=requestId?nonce(requestId):'';
 const seen=requestIdKey?requests.get(requestKey(id,requestIdKey)):null;
 if(seen){
  if(seen.operation!==operation||seen.dir&&seen.directory!==directory(dir))throw Error('REQUEST_ID_REUSED');
  if(seen.retired)return dto(seen);
  if(!seen.legacy)throw Error('REQUEST_ID_REUSED');
  await seen.closed;if(seen.error)throw Error(seen.error);return seen.result;
 }
 if(requestIdKey&&requests.size>=MAX_REQUESTS)throw Error('EMBEDDED_REQUEST_LIMIT');
 const release=reserveLegacyWrite(dir);let job;
 if(requestIdKey){
  job={id,dir,directory:directory(dir),requestId:requestIdKey,operation,jobId:crypto.randomBytes(12).toString('hex'),legacy:true,state:'running',progress:{phase:'legacy-write'},child:null};
  job.closed=new Promise(resolve=>{job.finish=resolve;});requests.set(requestKey(id,requestIdKey),job);jobs.set(job.jobId,job);
 }
 try{const result=await perform();if(job){job.result=result;job.received=true;finish(job);}return result;}
 catch(error){if(job){job.error=String(error.message||error);finish(job);}throw error;}
 finally{release();}
}
module.exports={start,status,cancel,known,runLegacy,assertLaunchSafe,reserveLegacyWrite,_internal:{jobs,requests,legacyWrites,active}};
