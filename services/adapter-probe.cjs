// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
/* E560 library probe: every library game gets a structured probe result (adapter-probe-core.cjs), in the background.
     start(root,db,{ids,reason,budgetMs,perGameMs,force})  queue the library (or ids) and begin; returns status()
     cancel(root)    stops now; the queue is kept, so start({resume:true}) or resume() continues where it stopped
     status(root)    {state:'idle'|'running'|'paused'|'cancelled'|'done', done, total, current, startedAt, budgetMs, counts}
     results(root)   {gameId: result}
   One worker process at idle priority probes one game at a time. A game that runs over perGameMs kills the worker and
   is recorded as step 'timeout'; the next worker carries on. The whole run stops (state 'paused') when budgetMs is
   used up and continues on the next start/resume. A result is kept per game with a stamp (exe size + mtime, folder
   mtime, reader code); a game whose stamp has not changed is not probed again unless force.
   State: data/adapter-probe/state.json (written after every game). Nothing here uploads. */
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),{fork}=require('node:child_process');
const DEFAULT_BUDGET=20*60000,PER_GAME=90000,FRESH_DAYS=14;
const fileOf=root=>path.join(root,'data','adapter-probe','state.json');
function readJSON(file){try{const v=JSON.parse(fs.readFileSync(file,'utf8'));return v&&typeof v==='object'?v:null;}catch{return null;}}
function atomic(file,value){fs.mkdirSync(path.dirname(file),{recursive:true});const tmp=file+'.'+process.pid+'.tmp';fs.writeFileSync(tmp,JSON.stringify(value));fs.renameSync(tmp,file);}
function load(root){const v=readJSON(fileOf(root))||{};return {version:1,run:v.run&&typeof v.run==='object'?v.run:null,results:v.results&&typeof v.results==='object'?v.results:{}};}
const save=(root,s)=>atomic(fileOf(root),s);
const runs=new Map();/* root → live run {child,timer,cancelled,emit} */

function stampOf(executable){try{const st=fs.statSync(executable),dir=fs.statSync(path.dirname(executable));return st.size+'-'+Math.floor(st.mtimeMs)+'-'+Math.floor(dir.mtimeMs)+'-'+require('./adapter-probe-core.cjs').reader();}catch{return '';}}
/* the library games to probe: [{id,title,executable}] */
function libraryRows(db){try{
 const rows=db.prepare("SELECT id,title,executable FROM games WHERE removed_at IS NULL AND executable<>''").all();
 return rows.map(r=>({id:String(r.id),title:String(r.title||''),executable:String(r.executable)}));
}catch{return [];}}
const eligible=g=>!require('./adapter-probe-core.cjs').isWindowsDirectory(path.dirname(g.executable));
const libraryGames=db=>libraryRows(db).filter(eligible);
/* the zero-latency side of a game: pairing of the Chinese script against the Japanese one (counts only) */
function pairingOf(root,id){try{const s=readJSON(path.join(root,'data','config','original-text.json'))?.[id];const p=s?.patchAlignment?.pairing;
 const out={brief:require('./original-text.cjs').brief(root,id),status:String(s?.status||''),patchStatus:String(s?.patchStatus||'')};
 if(p&&Number.isFinite(p.total)&&p.total>0)Object.assign(out,{total:p.total,paired:p.paired|0,unpaired:p.unpaired|0,added:p.added?.count|0,rate:Math.round(p.paired/p.total*10000)/10000,reasons:Object.fromEntries(Object.entries(p.reasons||{}).filter(([k,v])=>/^[a-z-]{1,40}$/.test(k)&&Number.isFinite(v)).slice(0,12))});
 return out;}catch{return null;}}
const LOW_PAIRING=.98;
function finish(root,game,result){const pairing=pairingOf(root,game.id);const r={...result,pairing};
 if(r.step==='ok'&&pairing?.rate!==undefined&&pairing.rate<LOW_PAIRING)Object.assign(r,{step:'low-pairing',detail:r.detected+':'+pairing.rate});
 return {...r,title:game.title,stamp:stampOf(game.executable),at:Date.now()};}
function counts(results){const c={};for(const r of Object.values(results))c[r.step]=(c[r.step]||0)+1;return c;}
function status(root){const s=load(root),run=s.run,live=runs.get(path.resolve(root));
 return {state:run?.state||'idle',reason:run?.reason||'',done:run?.done?.length||0,total:run?.queue?.length||0,current:live?.current||null,startedAt:run?.startedAt||null,updatedAt:run?.updatedAt||null,budgetMs:run?.budgetMs||0,usedMs:run?.usedMs||0,counts:counts(s.results)};}
function results(root){return load(root).results;}

function spawnWorker(){const child=fork(path.join(__dirname,'adapter-probe-worker.cjs'),[],{execPath:process.execPath,stdio:['ignore','ignore','ignore','ipc'],windowsHide:true,env:{...process.env,MEGULIT_PROBE_WORKER:'1',MEGULIT_NO_PREWARM:'1'}});
 child.on('error',()=>{});try{os.setPriority(child.pid,os.constants.priority.PRIORITY_LOW);}catch{}return child;}
function start(root,db,{ids=null,reason='manual',budgetMs=DEFAULT_BUDGET,perGameMs=PER_GAME,force=false,resume=false,emit=()=>{}}={}){
 const key=path.resolve(root);if(runs.has(key))return status(root);
 const s=load(root),rows=libraryRows(db),allGames=rows.filter(eligible);
 if(!(resume&&s.run?.queue?.length&&s.run.done.length<s.run.queue.length)){
  let games=allGames;if(Array.isArray(ids)&&ids.length){const want=new Set(ids.map(String));games=games.filter(g=>want.has(g.id));}
  const fresh=Date.now()-FRESH_DAYS*86400000;
  const queue=games.filter(g=>force||!s.results[g.id]||s.results[g.id].stamp!==stampOf(g.executable)||s.results[g.id].step==='preparing'||(s.results[g.id].at||0)<fresh);
  s.run={reason:String(reason).slice(0,30),queue,done:[],state:'running',startedAt:Date.now(),updatedAt:Date.now(),budgetMs,perGameMs,usedMs:0};}
 else Object.assign(s.run,{state:'running',updatedAt:Date.now(),budgetMs:Math.max(budgetMs,s.run.budgetMs||0),usedMs:0});
 if(rows.length){const known=new Set(allGames.map(g=>g.id));for(const id of Object.keys(s.results))if(!known.has(id))delete s.results[id];}
 if(!s.run.queue.length||s.run.done.length>=s.run.queue.length){s.run.state='done';save(root,s);return status(root);}
 save(root,s);
 const live={child:null,timer:null,cancelled:false,current:null,emit};runs.set(key,live);
 loop(root,live).catch(()=>{}).finally(()=>{try{live.child?.send({type:'exit'});live.child?.kill();}catch{}live.child=null;if(runs.get(key)===live)runs.delete(key);try{emit('adapter-probe',status(root));}catch{}try{require('./probe-auto.cjs').kick(root);}catch{}});
 return status(root);}
function resume(root,db,options={}){const s=load(root);if(!s.run||!['running','paused','cancelled'].includes(s.run.state)||!s.run.queue?.length)return status(root);return start(root,db,{...options,resume:true});}
async function loop(root,live){
 const began=Date.now();
 for(;;){const s=load(root),run=s.run;if(!run||live.cancelled)return;
  const next=run.queue.find(g=>!run.done.includes(g.id));if(!next){run.state='done';run.updatedAt=Date.now();save(root,s);return;}
  if(Date.now()-began>=run.budgetMs){run.state='paused';run.updatedAt=Date.now();save(root,s);return;}
  live.current={id:next.id,title:next.title};try{live.emit('adapter-probe',status(root));}catch{}
  let result;const dir=path.dirname(next.executable);
  if(!fs.existsSync(next.executable))result={schema:'megulit.probe-result',version:1,step:'no-script',detail:'GAME_MISSING',engines:[],inventory:{files:0,bytes:0,ext:{},archives:[]},lines:0,japaneseLines:0};
  else result=await probeOne(live,{dir,executable:next.executable,title:next.title},run.perGameMs||PER_GAME);
  if(live.cancelled)return;
  const now=load(root);if(!now.run)return;now.results[next.id]=finish(root,next,result);now.run.done.push(next.id);now.run.updatedAt=Date.now();now.run.usedMs=Date.now()-began;save(root,now);
  live.current=null;await new Promise(r=>setTimeout(r,150));}
}
/* S5 what a worker killed on the budget had done: its last progress (adapter-probe-core.cjs probeGame report) as a
   result. A reader that already read text decides the step as usual; otherwise 'timeout' with the stage it was in. */
function partialResult(progress){const empty={schema:'megulit.probe-result',version:1,step:'timeout',detail:'PER_GAME_BUDGET',engines:[],inventory:{files:0,bytes:0,ext:{},archives:[]},lines:0,japaneseLines:0};
 if(!progress||typeof progress!=='object')return empty;
 const engines=Array.isArray(progress.engines)?progress.engines:[],inventory=progress.inventory||empty.inventory,stage=String(progress.stage||'').slice(0,40);
 const base={...empty,engines,inventory,tried:engines.map(e=>e.id).slice(0,24),budgetMs:progress.budgetMs||0,timedOut:stage||true,detail:'PER_GAME_BUDGET'+(stage?':'+stage:'')};
 if(!engines.some(e=>e.lines>0))return base;
 try{const core=require('./adapter-probe-core.cjs'),c=core.classify({engines,inventory,unsupported:null,preparing:null,title:progress.title});const best=engines.find(e=>e.id===c.detected);
  return {...base,step:c.step,detail:c.detail,detected:c.detected,lines:best?.lines||0,japaneseLines:best?.japaneseLines||0,dialogueLines:best?.dialogueLines||0,chineseLines:best?.chineseLines||0};}catch{return base;}}
const readProgress=file=>{try{return JSON.parse(fs.readFileSync(file,'utf8'));}catch{return null;}};
function probeOne(live,{dir,executable,title},perGameMs){
 return new Promise(resolve=>{
  if(!live.child||live.child.exitCode!==null||live.child.killed)live.child=spawnWorker();
  const child=live.child,id=Math.random().toString(36).slice(2),began=Date.now(),progressFile=path.join(os.tmpdir(),'megulit-probe-'+process.pid+'-'+id+'.json');let settled=false,timer=null;
  const done=r=>{if(settled)return;settled=true;clearTimeout(timer);child.off('message',onMessage);child.off('exit',onExit);try{fs.rmSync(progressFile,{force:true});}catch{}resolve(r);};
  const onMessage=m=>{if(m?.type==='result'&&m.id===id)done(m.result);};
  const onExit=()=>{live.child=null;done({schema:'megulit.probe-result',version:1,step:live.cancelled?'cancelled':'parse-failed',detail:'WORKER_EXIT',engines:[],inventory:{files:0,bytes:0,ext:{},archives:[]},lines:0,japaneseLines:0});};
  /* the worker may grow its own budget with the size of the game (scaledBudget): one extension to that, then kill */
  const expire=()=>{const p=readProgress(progressFile),limit=(p?.budgetMs||0)+5000,used=Date.now()-began;
   if(used<limit&&!settled){timer=setTimeout(expire,limit-used);live.timer=timer;return;}
   try{child.kill();}catch{}live.child=null;done(partialResult(p&&{...p,title}));};
  timer=setTimeout(expire,perGameMs);
  live.timer=timer;child.on('message',onMessage);child.once('exit',onExit);
  try{child.send({type:'probe',id,dir,executable,title,progressFile,budgetMs:Math.max(5000,perGameMs-5000)});}catch{done({schema:'megulit.probe-result',version:1,step:'parse-failed',detail:'WORKER_SEND',engines:[],inventory:{files:0,bytes:0,ext:{},archives:[]},lines:0,japaneseLines:0});}
 });}
/* one job in a fresh worker (structural samples for the upload): resolves its answer, or null on timeout / crash */
function inWorker(message,timeout=120000){return new Promise(resolve=>{let child;try{child=spawnWorker();}catch{return resolve(null);}const id=Math.random().toString(36).slice(2);
 const end=v=>{clearTimeout(t);try{child.kill();}catch{}resolve(v);};const t=setTimeout(()=>end(null),timeout);
 child.on('message',m=>{if(m?.type==='result'&&m.id===id)end(m.result);});child.once('exit',()=>end(null));try{child.send({...message,id});}catch{end(null);}});}
/* 2026-11-15 the closed-beta full probe (probe-full.cjs collect) of one game, written to out */
const fullInWorker=(game,result,job)=>inWorker({type:'full',job:{dir:path.dirname(game.executable),executable:game.executable,result,...job}},300000);
const sampleInWorker=(game,result)=>inWorker({type:'sample',dir:path.dirname(game.executable),executable:game.executable,result});
function cancel(root){const key=path.resolve(root),live=runs.get(key);if(live){live.cancelled=true;clearTimeout(live.timer);try{live.child?.kill();}catch{}runs.delete(key);}
 const s=load(root);if(s.run&&s.run.state==='running'){s.run.state='cancelled';s.run.updatedAt=Date.now();save(root,s);}return {...status(root),state:'cancelled'};}
/* a run the app was closed in the middle of goes on a while after the next start */
function resumeLater(root,openDb,{delay=180000}={}){if(process.env.NODE_TEST_CONTEXT)return null;const s=load(root);if(!s.run||!['running','paused'].includes(s.run.state))return null;
 const t=setTimeout(()=>{let db;try{db=openDb();const games=libraryRows(db);try{db.close();}catch{}resume(root,{prepare:()=>({all:()=>games})});}catch{try{db?.close();}catch{}}},delay);t.unref?.();return t;}
/* the games whose probe found a problem: [{id,title,step,detail}] */
/* #468 (ひぐらしのなく頃に解: the library probe found Unity and its script, step ok, while the reader fell back to OCR every few
   lines; nothing was ever uploaded). What the reader saw at runtime counts too: a game whose lines came from OCR is a problem
   game whatever the static probe said. data/adapter-probe/runtime.json {gameId:{step,detail,at}}; kept 30 days. */
const runtimeFile=root=>path.join(root,'data','adapter-probe','runtime.json');
function runtimeProblems(root){const v=readJSON(runtimeFile(root))||{},now=Date.now(),out={};for(const [id,r] of Object.entries(v))if(r&&typeof r.step==='string'&&now-(+r.at||0)<30*86400000)out[id]=r;return out;}
function markRuntime(root,id,step,detail=''){id=String(id||'');if(!id||!step)return false;const v=runtimeProblems(root);if(v[id]?.step===step)return false;v[id]={step:String(step),detail:String(detail).slice(0,200),at:Date.now()};atomic(runtimeFile(root),v);try{require('./probe-auto.cjs').kick(root);}catch{}return true;}
function problems(root){const rs=results(root),rt=runtimeProblems(root),out=Object.entries(rs).filter(([,r])=>r.step&&r.step!=='ok'&&r.step!=='no-script'&&r.step!=='preparing').map(([id,r])=>({id,title:r.title||'',step:r.step,detail:r.detail||''}));
 for(const [id,r] of Object.entries(rt))if(rs[id]&&!out.some(x=>x.id===id))out.push({id,title:rs[id].title||'',step:r.step,detail:r.detail||''});return out;}
/* one row for the 适配总览 dialog: {step,detail,lines,pairing,at} or null */
function brief(root,id){const r=results(root)[String(id)];if(!r)return null;return {step:r.step,detail:r.detail||'',engine:r.detected||null,lines:r.lines||0,japaneseLines:r.japaneseLines||0,pairing:r.pairing?.rate??null,at:r.at||null};}
module.exports={markRuntime,runtimeProblems,partialResult,inWorker,sampleInWorker,fullInWorker,start,resume,cancel,status,results,problems,brief,resumeLater,load,fileOf,LOW_PAIRING,finish,pairingOf,libraryGames};
