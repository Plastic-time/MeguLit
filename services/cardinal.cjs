// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
/* Cardinal in MeguLit (2026-11-21): did the seed work on this PC? When a game session ends, or the live self-check finished a
   calibration or its first window, the session's last cardinal.lines dialogue lines (core/cardinal/tape.cjs: what the two bridges
   said) are played back through the whole chain into a hidden reader (services/cardinal/driver.cjs: its own process below normal
   priority, a headless Edge, its own temporary MeguLit root) and scored on what the player saw (core/cardinal/score.cjs). The
   result goes to data/The Seed/cardinal/<exe sha256>.json and, with 共享适配 on, to the relay (services/auto-profile-feed.cjs
   reportScore). One run at a time; a run never touches the live reader, the game or any mode (read mode stays a manual switch).
   The rules (weights, thresholds, N, the replay clock) are the running game's profile cardinal.* (signed diffs can retune them). */
const fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const Tape=require('../core/cardinal/tape.cjs'),Score=require('../core/cardinal/score.cjs'),{fromTape}=require('../core/cardinal/timeline.cjs');
const Profiles=require('../core/profiles/index.cjs');
const Identity=require('./cardinal/identity.cjs');
const KEY=/^[0-9a-f]{64}$/;
const MIN_LINES=10;
const dir=root=>path.join(root,'data','The Seed','cardinal');
const fileOf=(root,key)=>path.join(dir(root),key+'.json');
const blockFile=root=>path.join(dir(root),'blocked.json');
function blocked(root){if(cleanupBarrier)return cleanupBarrier;try{return JSON.parse(fs.readFileSync(blockFile(root),'utf8'))||{reason:'cleanup barrier requires verification'};}catch(error){return error.code==='ENOENT'?null:{reason:'cannot read cleanup barrier: '+error.message};}}
function block(job,failure){const value={at:new Date().toISOString(),key:job.key,...failure};cleanupBarrier=value;try{fs.mkdirSync(dir(job.root),{recursive:true});fs.writeFileSync(blockFile(job.root),JSON.stringify(value,null,1));}catch(error){value.persistenceError=error.message;}trace(job.reader,'cardinal BLOCKED cleanup verification required '+JSON.stringify(value));return value;}
let running=null,pending=[],cleanupBarrier=null;const QUEUE_MAX=8,lastRun=new Map();
function trace(reader,line){try{reader?.gal?.hooks?.trace?.(line);}catch{}}
function load(root,key){if(!KEY.test(String(key||'')))return null;try{return JSON.parse(fs.readFileSync(fileOf(root,key),'utf8'));}catch{return null;}}
function save(root,key,value){fs.mkdirSync(dir(root),{recursive:true});const f=fileOf(root,key),tmp=f+'.'+process.pid+'.tmp';fs.writeFileSync(tmp,JSON.stringify(value,null,1));fs.renameSync(tmp,f);}
function appVersion(root){try{const v=require('./shared-adaptation.cjs').appVersion(root);return /^\d+\.\d+\.\d+/.test(v)?v:'0.0.0';}catch{return '0.0.0';}}
/* which diff the session ran with: official (the maintainer's, relay or built-in seed), auto (the players' agreed diff, this PC's
   calibration or step-down), none; and its revision (version layer v<rev>, game layer g<rev>) */
function sourceOf(s,profile){const from=s?.from||'';const sh=s?.shared;const relayRev=l=>l?[l.version?'v'+(l.version.rev|0):'',l.game?'g'+(l.game.rev|0):''].filter(Boolean).join('.')||null:null;
 if(from==='official')return {source:'official',seedRev:relayRev(sh)};
 if(from==='shared')return {source:'auto',seedRev:relayRev(sh)};
 if(from==='local'||from==='local-gate')return {source:'auto',seedRev:null};
 const p=profile||s?.profile;if(from==='seed'||/seed/.test(String(p?.layers||''))){let v=null,g=null;try{const S=require('../core/profiles/seed.cjs');v=S.versionOf(s?.key||p?.exeSha256)?.rev??null;g=S.seeds().games.find(x=>x.key===p?.gameKey)?.seedRev??null;}catch{}
  return {source:'official',seedRev:[v!=null?'v'+v:'',g!=null?'g'+g:''].filter(Boolean).join('.')||null};}
 return {source:'none',seedRev:null};}
/* the game as the tape's attach records name it (for a tape that lost them: the bridge state) */
function gameOf(reader,key){const st=reader?.gal?.state||{};return {pid:st.gameProcessId||4242,started:String(st.gameStarted||'638994190000000000'),hwnd:String(st.gameHwnd||'1234'),sha:key,title:String(st.gameTitle||''),process:String(st.processName||'game'),exe:String(reader?.gameExe||st.gameExecutable||'C:/Games/game.exe'),layout:st.clientWidth?{clientWidth:st.clientWidth,clientHeight:st.clientHeight,clientX:st.clientX,clientY:st.clientY}:undefined};}
/* why: 'session-end' | 'calibrated' | 'self-check'; a session's end always runs, the others at most every cardinal.minIntervalMin */
function kick(reader,why,{now=Date.now(),replay=null,fetcher=undefined,manual=false}={}){try{
 /* never from inside a replay (the replay's own reader runs this same code) */
 if(process.env.MEGULIT_CARDINAL_REPLAY==='1')return {state:'skipped',why:'inside a replay'};
 if(!reader?.root)return {state:'skipped',why:'no reader'};const root=reader.root;
 const barrier=blocked(root);if(barrier)return {state:'blocked',why:'previous replay cleanup requires verification',cleanupFailure:barrier};
 const live=require('./self-check-live.cjs').current();const s=live&&live.reader===reader?live:null;
 const key=s?.key||(()=>{try{return require('../core/auto-profile.cjs').exeKeySync(root,reader.gameExe);}catch{return '';}})();
 if(!KEY.test(String(key||'')))return {state:'skipped',why:'no exe key'};
 const profile=s?.profile||Profiles.profileFor({exe:reader.gameExe,exeSha256:key});const rules={...Profiles.DEFAULTS.cardinal,...(profile.cardinal||{})};
 Tape.keep(rules.lines);
 if(why!=='session-end'&&now-(lastRun.get(key)||0)<rules.minIntervalMin*60000)return {state:'skipped',why:'ran lately'};
 const snap=Tape.snapshot(rules.lines);if(snap.lines<MIN_LINES)return {state:'skipped',why:'too few lines ('+snap.lines+')'};
 const job={root,key,why,rules,pairing:snap.pairing,rows:snap.rows,lines:snap.lines,game:gameOf(reader,key),...sourceOf(s,profile),reader,replay,fetcher,manual,trace:line=>trace(reader,line)};
 try{job.identity=Identity.capture({root,game:job.game,profile,source:job.source,seedRev:job.seedRev,context:s?.input});}catch(error){const code=Identity.reasonCode(error);trace(reader,'cardinal deferred key='+key.slice(0,8)+' '+code);return {state:'deferred',why:'session identity unavailable',code};}
 if(running){const at=pending.findIndex(x=>x.root===root&&x.key===key);
  if(at>=0){pending[at]=job;lastRun.set(key,now);return {state:'queued',replaced:true};}
  if(pending.length>=QUEUE_MAX){trace(reader,'cardinal queue full key='+key.slice(0,8)+' deferred: retry on next kick');return {state:'deferred',why:'queue full'};}
  pending.push(job);lastRun.set(key,now);return {state:'queued'};}
 lastRun.set(key,now);
 running=drain(job);
 return {state:'started'};}catch(e){return {state:'failed',why:String(e?.message||e)};}}
async function drain(job){try{while(job){try{const result=await go(job);if(result?.cleanupFailure){for(const waiting of pending){lastRun.delete(waiting.key);trace(waiting.reader,'cardinal deferred key='+waiting.key.slice(0,8)+' queue halted: cleanup verification required');}pending=[];break;}}catch(e){const errors=[String(e?.message||e).slice(0,1200)];trace(job.reader,'cardinal failed key='+job.key.slice(0,8)+' '+errors[0]);try{save(job.root,job.key,{...(load(job.root,job.key)||{}),failed:{at:new Date().toISOString(),why:job.why,errors}});}catch{}}
 job=pending.shift()||null;}}finally{running=null;}}
async function go(job){const {root,key,rules,reader}=job;const started=Date.now();
 trace(reader,'cardinal replay key='+key.slice(0,8)+' why='+job.why+' lines='+job.lines);
 const steps=fromTape(job.rows,job.game);
 const scenario={game:job.game,steps,maxGap:rules.maxGapMs,sampleEvery:rules.sampleMs,models:false,tailMs:1200,attachSettleMs:2000};
 const data=path.join(root,'data'),defer=(code='CARDINAL_IDENTITY_CHANGED')=>({deferred:true,errors:[code],samples:[],processClosed:true});
 const boundReplay=async(sc,options)=>{
  try{job.proof=await Identity.prepare(job.identity,{data,game:job.game,signal:options.signal});}
  catch(error){return options.signal?.aborted?{interrupted:true,processClosed:true}:defer(Identity.reasonCode(error));}
  const output=await (job.replay||require('./cardinal/run.cjs').replay)({...sc,sessionIdentity:job.proof},options);
  if(!output.cleanupFailure&&output.processClosed!==false&&!output.deferred&&!output.interrupted){try{await Identity.verify(job.proof,{data,game:job.game,signal:options.signal});}catch(error){return options.signal?.aborted?{interrupted:true,processClosed:true}:defer(Identity.reasonCode(error));}}
  return output;
 };
 const o=await require('./cardinal/automatic.cjs').automatic({...job,replay:boundReplay},scenario,{data,work:path.join(os.tmpdir(),'megulit-cardinal'),low:true,timeoutMs:15*60000,name:'cardinal'});
 if(o.cleanupFailure||o.processClosed===false){const failure=o.cleanupFailure||{reason:'driver-tree-stop-unconfirmed'};block(job,failure);return {cleanupFailure:failure};}
 if(o.deferred){lastRun.delete(key);trace(reader,'cardinal deferred key='+key.slice(0,8)+' '+(o.errors||[]).join('; '));return o;}
 try{Identity.unchanged(job.proof,{data,game:job.game});}catch{lastRun.delete(key);trace(reader,'cardinal deferred key='+key.slice(0,8)+' session identity changed before score');return defer();}
 const errors=(o.errors||[]).slice(0,4);if(!(o.samples||[]).length&&!errors.length)errors.push('replay produced no DOM samples');
 if(errors.length&&!(o.samples||[]).length){trace(reader,'cardinal failed key='+key.slice(0,8)+' '+String(errors[0]).slice(0,200));save(root,key,{...(load(root,key)||{}),failed:{at:new Date().toISOString(),why:job.why,errors}});return null;}
 const result=Score.score({name:'session',steps,o,livePairing:job.pairing},rules);
 const timing=require('../core/cardinal/timing.cjs').check({steps,o,rules});result.detail.timing=timing;
 const rec=Score.record({key,seedRev:job.seedRev,source:job.source,app:appVersion(root),result,cardinalRev:rules.rev});
 /* Errors, a missing measured delivery clock, or excessive replay lag cannot supply a reliable relay vote. */
 const lag=o.lag||null,unreliable=!timing.reliable||!result.detail.pairObservation.reliable||o.models===true||!result.detail.leakObservation.observed||!result.detail.timeline.reliable||!result.detail.choiceObservation.reliable||errors.length>0;
 const identity={schema:1,digest:job.proof.digest,candidate:job.proof.candidate,configHash:job.proof.config?.digest,scripts:(job.proof.scripts||[]).map(({path,sha256})=>({path,sha256}))};
 const doc={record:rec,why:job.why,identity,applies:result.applies,below:result.below,detail:result.detail,ms:Date.now()-started,lag,unreliable,errors,sent:false};
 try{save(root,key,doc);}catch(error){doc.persistenceError=String(error?.message||error);doc.unreliable=true;trace(reader,'cardinal not uploaded: local score persistence failed key='+key.slice(0,8)+' '+doc.persistenceError);return doc;}
 trace(reader,'cardinal scored key='+key.slice(0,8)+' total='+rec.total+' lines='+rec.lines+' source='+rec.source+' seedRev='+(rec.seedRev||'-')+' '+Score.KEYS.map(k=>k+'='+rec.scores[k]).join(' ')+(lag?' lagP95='+lag.stepP95:'')+(unreliable?(!timing.reliable?' unreliable (timing: '+timing.why+'): not uploaded':!result.detail.pairObservation.reliable?' unreliable (translation display unobserved): not uploaded':o.models===true?' unreliable (modeled visibility): not uploaded':!result.detail.leakObservation.observed?' unreliable (original visibility unobserved): not uploaded':!result.detail.choiceObservation.reliable?' unreliable (unobserved option state): not uploaded':!result.detail.timeline.reliable?' unreliable (missing delivery clock): not uploaded':errors.length?' unreliable (replay errors): not uploaded':' unreliable (busy PC): not uploaded'):''));
 if(unreliable||!require('../core/cardinal/upload.cjs').eligible(doc))return doc;
 try{const r=await require('./auto-profile-feed.cjs').reportScore(root,rec,job.fetcher?{fetcher:job.fetcher}:{});doc.upload={state:r.state,...(r.status?{status:r.status}:{})};if(r.state==='sent')doc.sent=true;save(root,key,doc);}catch{}
 return doc;}
const idle=()=>running||Promise.resolve();
module.exports={kick,load,fileOf,dir,sourceOf,idle,_reset(){running=null;pending=[];cleanupBarrier=null;lastRun.clear();}};
