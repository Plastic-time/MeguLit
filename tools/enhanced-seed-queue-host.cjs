// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
const path=require('node:path');
const fs=require('node:fs'),crypto=require('node:crypto');
const {spawnSync}=require('node:child_process');
const Runner=require('../services/cardinal-trusted-runner.cjs');
const Conditions=require('../core/cold-test/conditions.cjs');
const {jsonRequest,baseURL,publisherSigner,candidate}=require('./seed-release-runner.cjs');
const protocol=require('../core/torch-release.cjs');
const diff=require('../core/game-diff.cjs');

async function processOne({base,token,keys,collect,sign,signal,fetcher}){
 const request=(route,body,abort=signal)=>jsonRequest(base,route,{token,body,signal:abort,fetcher});
 const job=(await request('/api/enhanced-seed/claim',{})).job;
 if(!job)return false;
 const work=new AbortController(),abort=signal?AbortSignal.any([signal,work.signal]):work.signal;
 const call=(action,fields)=>request('/api/enhanced-seed/'+action,{id:job.id,lease:job.lease,...fields},abort);
 let renewal;
 const timer=setInterval(()=>{
   if(!renewal)renewal=call('renew').then(reply=>{
     if(reply.ok!==true)work.abort();
   }).catch(()=>work.abort()).finally(()=>{renewal=undefined;});
 },60000);
 try{
   // A provisioned queue identity may come online before the first accepted collector.
   // Never handle a saved proposal with an unconfigured inventory or signer.
   if(!collect){
     if((await call('retry')).ok!==true)throw Error('RETRY_UNCONFIRMED');
     return 'awaiting-sample';
   }
   let baseline=null;
   try{baseline=(await request('/api/torch-release?exe='+encodeURIComponent(job.candidate.key),undefined,abort)).release;
     await protocol.checked(baseline,keys);
   }catch(e){if(e.status!==404)throw e;}
   let proposal=job.proposal;
   if(!proposal){
     const evidence=await collect(job.candidate,{baseline,signal:abort});
     if(!evidence){await call('retry');return true;}
     proposal=(await call('receipt',{profile:evidence.profile,review:evidence.review})).proposal;
     if(!protocol.same(proposal?.profile,evidence.profile)||!protocol.same(proposal?.review,evidence.review))throw Error('RECEIPT_MISMATCH');
   }
   const ready=(await call('ready')).proposal;
   if(!protocol.same(ready,proposal))throw Error('PROPOSAL_CHANGED');
   const {profile,review}=proposal,c=job.candidate;
   if(!(await candidate(profile,review,keys)).ready||profile.key!==c.key||profile.mode!==c.mode||
     !protocol.same(profile.settings,c.settings)||c.engine&&profile.engine!==c.engine||
     c.script&&profile.prints?.script!==c.script||review.torchNo!==c.torchNo||
     proposal.action!=='promote'||proposal.previous!==(baseline?await protocol.hash(baseline):null))throw Error('CANDIDATE_MISMATCH');
   protocol.transition({...proposal,signature:{...profile.signature}},baseline);
   abort.throwIfAborted();
   const signed=await sign(structuredClone(proposal));
   if(!protocol.same(diff.unsigned(signed),proposal))throw Error('PROPOSAL_CHANGED');
   const proof=await protocol.checked(signed,keys);
   const published=await call('publish',{release:signed});
   if(published.status!=='published'||published.hash!==proof.hash)throw Error('PUBLISH_UNCONFIRMED');
   return true;
 }catch(e){await call('retry').catch(()=>{});throw e;}
 finally{clearInterval(timer);work.abort();await renewal;}
}

// Windows CRT _O_TEMPORARY makes the shared exclusive file disappear when
// the OS closes the descriptor, including after forcible process termination.
function lockQueue(file) {
  const {O_CREAT, O_EXCL, O_WRONLY} = fs.constants;
  let fd;
  try {
    fd = fs.openSync(file, O_CREAT | O_EXCL | O_WRONLY | (process.platform === 'win32' ? 0x40 : 0), 0o600);
  } catch (error) {
    if (error.code === 'EEXIST') return null;
    throw error;
  }
  return () => {
    fs.closeSync(fd);
    if (process.platform !== 'win32') fs.unlinkSync(file);
  };
}

async function serve(run, signal, {wait = require('node:timers/promises').setTimeout, report = console.log, observe} = {}) {
  let delay = 1000, previous;
  while (!signal.aborted) {
    let state;
    try { state = (await run(signal)).state; }
    catch (error) {
      if (signal.aborted) break;
      state = /^[A-Z_]+$/.test(error.message) ? error.message : 'ENHANCED_HOST_FAILURE';
    }
    observe?.(state);
    if (state !== previous) report(JSON.stringify({state}));
    previous = state;
    delay = state === 'processed' ? 1000 : Math.min(delay * 2, 60000);
    try { await wait(delay, undefined, {signal}); }
    catch (error) { if (!signal.aborted) throw error; }
  }
}

async function guardedTick(cfg,policy,work){
  if (fs.existsSync(path.join(policy.stateRoot,'paused')) ||
      fs.existsSync(path.join(policy.stateRoot,'blocked.json')) || !Runner.resources(policy)) return {state:'unavailable'};
  if (!cfg.samples.length) return {state:await work() || 'empty'};
  const releaseLock = lockQueue(cfg.queueLock);
  if (!releaseLock) return {state:'busy'};
  try {
    const status = spawnSync(path.join(policy.appRoot,'native','ColdDesk.exe'),['status'],{
      windowsHide:true,encoding:'utf8',timeout:7000,maxBuffer:16384,
      env:{SystemRoot:process.env.SystemRoot,WINDIR:process.env.WINDIR}
    });
    if (status.status !== 0 || !Conditions.check(JSON.parse(status.stdout)).ok) return {state:'busy'};
    return {state:await work()?'processed':'empty'};
  } finally { releaseLock(); }
}

function createCollector({samples,policy,signProfile,reviewer,requestFile,runHost=Runner.runHost}){
 return async(c,{baseline,signal})=>{
   const matches=samples.filter(s=>protocol.identity(s.identity)&&s.identity.exe===c.key&&(!c.script||s.identity.script===c.script)&&(!c.engine||s.identity.engine===c.engine));
   if(matches.length!==1)return null;
   const {identity,exe}=matches[0];
   const doc=diff.build({layer:'version',key:c.key,mode:c.mode,settings:c.settings,source:'auto',rev:(baseline?.profile.rev||0)+1,
     engine:identity.engine,prints:{exe:c.key,script:identity.script},issuedAt:c.issuedAt});
   protocol.profileShape({...doc,signature:{alg:'ed25519',keyId:'shape',value:'A'.repeat(86)+'=='}},identity);
   const profile=await signProfile(doc);
   const request={schema:'megulit.cardinal-trusted-request',version:1,exe,identity,candidate:profile,baseline,torchNo:c.torchNo};
   if(requestFile){
     signal?.throwIfAborted();
     if(!protocol.same(diff.unsigned(profile),doc)||!await protocol.verify(profile,policy.profileKeys))throw Error('HOST_PROFILE_SIGNATURE');
     Runner.atomic(requestFile,request);
   }
   const result=await runHost(request,policy,{signal,signing:reviewer});
   return result.state==='reviewed'?{profile,review:result.review}:null;
 };
}

function readHostToken(file,policy){
 if(!path.isAbsolute(file))throw Error('HOST_PRIVATE_CONFIG');
 const resolved=fs.realpathSync.native(file);
 if(path.relative(resolved,path.resolve(file))!=='')throw Error('HOST_PRIVATE_CONFIG');
 for(const dir of [path.join(__dirname,'..'),policy.appRoot,policy.sampleRoot,policy.stateRoot]){
   const rel=path.relative(fs.realpathSync(dir),resolved);
   if(!path.isAbsolute(rel)&&rel!=='..'&&!rel.startsWith('..'+path.sep))throw Error('HOST_PRIVATE_CONFIG');
 }
 const fd=fs.openSync(resolved,'r');
 try{
   const stat=fs.fstatSync(fd);
   if(!stat.isFile()||stat.nlink!==1||stat.size<1||stat.size>4096)throw Error('HOST_PRIVATE_CONFIG');
   const buffer=Buffer.alloc(4097);
   const count=fs.readSync(fd,buffer,0,buffer.length,0);
   const token=buffer.toString('utf8',0,count).trim();
   if(count!==stat.size||!/^\S{1,4096}$/.test(token))throw Error('HOST_PRIVATE_CONFIG');
   return token;
 }finally{fs.closeSync(fd);}
}

async function main(args){
 const service=args[1]==='--service';
 const configFile=service?args[0]:args[1];
 if(!configFile||!path.isAbsolute(configFile))throw Error('HOST_CONFIGURATION');
 const cfg=Runner.readJSON(configFile),{samples}=cfg;
 if(typeof cfg.policy==='string'&&!path.isAbsolute(cfg.policy))throw Error('HOST_CONFIGURATION');
 const policy=typeof cfg.policy==='string'?Runner.readJSON(cfg.policy):cfg.policy;
 const base=baseURL(service?cfg.base:args[0]);
 if(!Array.isArray(samples)||samples.length>4096||!policy||(samples.length&&!policy.collector?.file))throw Error('HOST_CONFIGURATION');
 if(service){
   const allowed=new Set(['base','policy','samples','queueLock','tokenFile','publisher','reviewer']);
   if(Object.keys(cfg).some(k=>!allowed.has(k))||!path.isAbsolute(cfg.queueLock||''))throw Error('HOST_CONFIGURATION');
 }
 for(const role of ['publisher','reviewer']){
   if(cfg[role]&&(Object.keys(cfg[role]).sort().join(',')!=='id,store,vault'||
      !path.isAbsolute(cfg[role].store||'')||!path.isAbsolute(cfg[role].vault||'')||
      !/^[a-z0-9][a-z0-9._-]{0,79}$/i.test(cfg[role].id||'')))throw Error('HOST_SIGNING_CONFIG');
 }
 const token=cfg.tokenFile?readHostToken(cfg.tokenFile,policy):process.env.ENHANCED_HOST_TOKEN;
 delete process.env.ENHANCED_HOST_TOKEN;
 if(typeof token!=='string'||!token)throw Error('HOST_CONFIGURATION');
 cfg.queueLock??=path.join(policy.stateRoot,'enhanced-queue.lock');
 if(!path.isAbsolute(cfg.queueLock))throw Error('HOST_CONFIGURATION');
 const keys={profileKeys:policy.profileKeys,reviewKeys:policy.reviewKeys};
 keys.releaseKeys=keys.profileKeys;
 const signing=cfg.publisher?{...cfg.publisher,keys}:{keys,store:process.env.ENHANCED_KEY_STORE,id:process.env.ENHANCED_PUBLISHER_ID,vault:process.env.ENHANCED_VAULT};
 const sign=publisherSigner(signing),signProfile=publisherSigner({...signing,scope:'profile'});
 const reviewer=cfg.reviewer||(signing.store?{store:signing.store,vault:signing.vault,id:process.env.ENHANCED_REVIEWER_ID}:undefined);
 const collect=samples.length?createCollector({samples,policy,signProfile,reviewer,requestFile:path.join(policy.stateRoot,'current-request.json')}):null;
 if(collect&&(!path.isAbsolute(policy.collector.file)||fs.statSync(policy.collector.file).size>64*1024**2||
    crypto.createHash('sha256').update(fs.readFileSync(policy.collector.file)).digest('hex')!==policy.collector.sha256))throw Error('COLLECTOR_CONFIGURATION');
 const stop=new AbortController(),abort=()=>stop.abort();
 process.once('SIGTERM',abort);process.once('SIGINT',abort);
 if(service){process.stdin.once('end',abort);process.stdin.resume();}
 try{
   let lastRetry=null;
   const observe=service?state=>{
     const now=new Date().toISOString();
     if(state==='awaiting-sample')lastRetry=now;
     Runner.atomic(path.join(policy.stateRoot,'enhanced-host-status.json'),{
       state,checkedAt:now,lastRetry,samples:samples.length,pid:process.pid
     });
   }:undefined;
   await serve(signal=>guardedTick(cfg,policy,()=>processOne({base,token,keys,collect,sign,signal})),stop.signal,{observe});
 }finally{
   process.removeListener('SIGTERM',abort);process.removeListener('SIGINT',abort);
 }
}
if(require.main===module)main(process.argv.slice(2)).catch(()=>{console.error('HOST_CONFIGURATION');process.exitCode=1;});
module.exports={processOne,serve,lockQueue,createCollector};
