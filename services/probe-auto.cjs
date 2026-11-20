// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
/* 2026-11-14 automatic, quiet probe upload (owner: 默认打开就行了…给他们默认打开冷上传就好了。然后去重).
   Users did not find or understand the confirm-each-item upload, so the games that do not read well are now probed and
   their desensitized structure uploaded in the background, one game at a time, without a dialog:
     - on unless Settings library.probeUpload is false (enabled())
     - a library probe (adapter-probe.cjs, idle-priority worker, time-budgeted) at most once a week
     - per problem game: its identity (probe-identity.cjs) → GET /api/probe/has?id= → skip when the relay already has a
       complete probe of that game (or one with at least as many items); else prepare a one-game bundle (same content
       rules as always: adapter-sample.cjs, only desensitized structure and gzip samples, sizes capped) and upload it
     - failures wait and retry (15 min doubling, at most a day); nothing here blocks the game or the UI
     - every bundle sent stays in the outbox and in the log (status().log), so the probe dialog can show what was sent
   State: data/adapter-probe/auto.json {version, probedAt, games:{gameId:{identity,state,items,hash,at,attempts,nextAt,
   seen,runtimeAt}}, log:[…last 40]}. */
const fs=require('node:fs'),path=require('node:path');
const RETRY_MIN=15*60000,RETRY_MAX=24*3600000,PROBE_EVERY=7*86400000,FIRST_DELAY=10*60000,EVERY=6*3600000,KICK_DELAY=60000,LOG_MAX=40;
const fileOf=root=>path.join(root,'data','adapter-probe','auto.json');
function readJSON(file,fallback){try{const v=JSON.parse(fs.readFileSync(file,'utf8'));return v&&typeof v==='object'?v:fallback;}catch{return fallback;}}
function atomic(file,v){fs.mkdirSync(path.dirname(file),{recursive:true});const tmp=file+'.'+process.pid+'.tmp';fs.writeFileSync(tmp,JSON.stringify(v));fs.renameSync(tmp,file);}
function load(root){const v=readJSON(fileOf(root),{});return {version:1,probedAt:Number(v.probedAt)||0,games:v.games&&typeof v.games==='object'?v.games:{},log:Array.isArray(v.log)?v.log.slice(0,LOG_MAX):[]};}
const save=(root,s)=>atomic(fileOf(root),s);
/* the Settings switch (library.json probeUpload; on unless false) */
function enabled(root){return readJSON(path.join(root,'data','config','library.json'),{}).probeUpload!==false;}
function setEnabled(root,on){const f=path.join(root,'data','config','library.json');atomic(f,{...readJSON(f,{}),probeUpload:on!==false});return {enabled:enabled(root)};}

/* has(root,id,{seen}) → {state:'none'|'partial'|'complete'|'failed',items} | null (offline / not configured) */
async function has(root,id,{seen=false,fetcher=globalThis.fetch,endpoint}={}){
 const url=endpoint||(()=>{try{return require('./relay-config.cjs').endpoint(root,'/api/probe/has');}catch{return '';}})();if(!url)return null;
 try{const r=await fetcher(url+'?id='+id+(seen?'&seen=1':''),{headers:{'user-agent':'MeguLit'},signal:AbortSignal.timeout(20000)});if(!r.ok)return null;const j=await r.json();
  return {state:['partial','complete','failed'].includes(j.state)?j.state:'none',items:Number(j.items)|0};}catch{return null;}}
/* the relay already holds what we have: complete, or at least as many items */
const covered=(remote,items)=>!!remote&&(remote.state==='complete'||remote.state!=='none'&&remote.state!=='failed'&&remote.items>=items);

const runtimeAt=(root,id)=>{try{return require('./runtime-harvest.cjs').load(root,id)?.at||0;}catch{return 0;}};
function logEntry(s,entry){s.log=[{at:Date.now(),...entry},...s.log.filter(x=>!(x.gameId===entry.gameId&&x.identity===entry.identity))].slice(0,LOG_MAX);}

/* one game: → 'known' | 'sent' | 'duplicate' | 'nothing' | 'failed' | 'offline' | 'skipped' */
/* transport-level failures worth one try on the other built-in relay */
const RELAY_RETRY=/^(NETWORK|TIMEOUT|HTTP_5\d\d|HTTP_4(?:03|08|13|29)|RATE_LIMITED)$/;
async function one(root,db,game,result,s,{fetcher,endpoint,hasEndpoint,sampler,now=Date.now()}){
 const sample=require('./adapter-sample.cjs'),pi=require('./probe-identity.cjs');
 const rec=s.games[game.id]||{};if(rec.nextAt&&rec.nextAt>now)return 'skipped';
 const ident=pi.identity({executable:game.executable,result,vndb:pi.vndbOf(db,game.id)});if(!ident.id)return 'skipped';
 const rtAt=runtimeAt(root,game.id);
 /* already handled this identity and nothing new (a runtime read since) to add */
 if(rec.identity===ident.id&&['sent','duplicate','known'].includes(rec.state)&&(rec.runtimeAt||0)>=rtAt)return 'skipped';
 const remote=await has(root,ident.id,{seen:!rec.seen||rec.identity!==ident.id,fetcher,endpoint:hasEndpoint});
 if(!remote){s.games[game.id]={...rec,identity:ident.id,state:'offline',attempts:(rec.attempts|0)+1,nextAt:now+Math.min(RETRY_MAX,RETRY_MIN*2**Math.min(6,rec.attempts|0))};return 'offline';}
 const seen={seen:true};
 if(remote.state==='complete'){s.games[game.id]={identity:ident.id,state:'known',items:remote.items,at:now,runtimeAt:rtAt,...seen};return 'known';}
 const prep=await sample.prepare(root,db,{ids:[game.id],sampler});
 if(!prep?.hash){s.games[game.id]={identity:ident.id,state:prep?.empty?'nothing':'failed',at:now,runtimeAt:rtAt,...seen,...(prep?.empty?{}:{error:String(prep?.error||'PREPARE').slice(0,40),attempts:(rec.attempts|0)+1,nextAt:now+RETRY_MAX})};return prep?.empty?'nothing':'failed';}
 const g=prep.manifest[0]||{},items=g.probeItems|0,state=g.probeState||'partial';
 if(covered(remote,items)){s.games[game.id]={identity:ident.id,state:'known',items,at:now,runtimeAt:rtAt,...seen};return 'known';}
 /* 2026-11-16 (QQ group, Fate/stay night REMASTERED: 上传失败 again and again, the relay never saw a part): a transport failure on one built-in relay (cn-api through EdgeOne, or api.megulit.com) is tried once on the other; an address from Settings stays the only one */
 const urls=endpoint?[endpoint]:(()=>{try{return require('./relay-config.cjs').endpoints(root,'/api/probe');}catch{return [];}})();
 let u={state:'not-configured'};for(const url of urls.length?urls:[undefined]){u=await sample.upload(root,{hash:prep.hash,fetcher,endpoint:url,identity:{id:ident.id,items,state,vndb:ident.vndb}});if(!RELAY_RETRY.test(String(u.error||'')))break;}
 if(u.state==='uploaded'||u.state==='duplicate'){s.games[game.id]={identity:ident.id,state:u.state==='uploaded'?'sent':'duplicate',items,hash:prep.hash,at:now,runtimeAt:rtAt,...seen};
  logEntry(s,{gameId:game.id,title:game.title,identity:ident.id,hash:prep.hash,bytes:prep.bytes,state:u.state==='uploaded'?'sent':'duplicate'});return u.state==='uploaded'?'sent':'duplicate';}
 if(u.state==='not-configured')return 'offline';
 const attempts=(rec.attempts|0)+1;s.games[game.id]={identity:ident.id,state:'failed',error:String(u.error||'').slice(0,40),items,hash:prep.hash,at:now,attempts,nextAt:now+Math.min(RETRY_MAX,RETRY_MIN*2**Math.min(6,attempts-1)),runtimeAt:rtAt,...seen};return 'failed';}

/* 2026-11-15 closed beta: the full probe of a problem game (probe-full.cjs: its script entries, its exe and DLLs cut down
   to code, versions), once per identity, after the desensitized one. Kept under games[id].full {identity,state,hash,
   bytes,at,attempts,nextAt}; the collected file stays in data/adapter-probe/full only until the relay has it. */
const appVersion=root=>{try{return require('./shared-adaptation.cjs').appVersion(root);}catch{return '';}};
async function fullOne(root,db,game,result,s,{fetcher,fullBase,fuller,now=Date.now()}){
 const pf=require('./probe-full.cjs'),pi=require('./probe-identity.cjs');
 const ident=pi.identity({executable:game.executable,result,vndb:pi.vndbOf(db,game.id)});if(!ident.id)return 'skipped';
 const rec=s.games[game.id]||(s.games[game.id]={}),f=rec.full&&rec.full.identity===ident.id?rec.full:{};
 if(['sent','duplicate','nothing'].includes(f.state)||f.nextAt&&f.nextAt>now)return 'skipped';
 const retry=(state,extra={})=>{const attempts=(f.attempts|0)+1;rec.full={...f,identity:ident.id,state,at:now,attempts,nextAt:now+Math.min(RETRY_MAX,RETRY_MIN*2**Math.min(6,attempts-1)),...extra};return state;};
 let file=pf.pending(root,f.hash),bytes=f.bytes|0,hash=f.hash||'';
 if(!file){const c=await fuller(game,result,{out:pf.fullDir(root),runtime:(()=>{try{return require('./runtime-sample.cjs').dirFor(root,game.executable);}catch{return '';}})(),identity:ident.id,title:String(game.title||''),vndb:ident.vndb||'',app:appVersion(root)});
  if(c?.empty){rec.full={identity:ident.id,state:'nothing',at:now};return 'nothing';}
  if(!c?.file)return retry('failed',{error:String(c?.error||'COLLECT').slice(0,40)});
  file=c.file;bytes=c.bytes;hash=c.sha256;}
 const u=await pf.upload(root,{file,identity:ident.id,title:String(game.title||''),vndb:ident.vndb||'',step:result.step||'',app:appVersion(root),fetcher,base:fullBase});
 if(u.state==='uploaded'||u.state==='duplicate'){const state=u.state==='uploaded'?'sent':'duplicate';rec.full={identity:ident.id,state,hash,bytes,at:now};
  logEntry(s,{gameId:game.id,title:game.title,identity:ident.id,hash,bytes,state,kind:'full'});return state;}
 if(u.state==='not-configured')return 'offline';
 return retry('failed',{hash,bytes,error:String(u.error||'').slice(0,40)});}

/* run(root,db,opts) → {state, results:{gameId:outcome}}: the library probe when due, then every problem game in turn */
let busy=null;
async function run(root,db,{ids=null,fetcher=globalThis.fetch,endpoint,hasEndpoint,fullBase,sampler,fuller,probeFirst=true,wait=ms=>new Promise(r=>setTimeout(r,ms))}={}){
 if(!enabled(root))return {state:'off',results:{}};
 if(busy)return {state:'busy',results:{}};
 busy=(async()=>{const probe=require('./adapter-probe.cjs');sampler=sampler||probe.sampleInWorker;fuller=fuller||probe.fullInWorker;try{require('./probe-full.cjs').sweep(root);}catch{}
  const s=load(root);
  if(probeFirst&&!ids&&Date.now()-s.probedAt>PROBE_EVERY&&probe.status(root).state!=='running'){
   s.probedAt=Date.now();save(root,s);probe.start(root,db,{reason:'auto'});
   for(let i=0;i<2400&&probe.status(root).state==='running';i++)await wait(1000);}
  const results=probe.results(root),games=probe.libraryGames(db),want=ids?new Set(ids.map(String)):null,out={},errors={},full={},contrib=require('./adapter-contrib.cjs'),contribOut={};
  /* rule 3 (adapter-contrib.cjs): local packages never stay longer than KEEP_DAYS, nor at all once the switch is off */
  contrib.purgeOutbox(root,contrib.enabled(root)?{olderThan:contrib.KEEP_DAYS*86400000}:{});
  for(const p of probe.problems(root)){if(want&&!want.has(p.id))continue;const g=games.find(x=>x.id===p.id);if(!g||!results[p.id])continue;
   const keep=s.games[p.id]?.full;let o;try{o=await one(root,db,g,results[p.id],s,{fetcher,endpoint,hasEndpoint,sampler});}catch(e){o='failed';/* an exception used to leave no record (no error code, no backoff): the dialog said 上传失败 with nothing to go on */const rec=s.games[p.id]||{},attempts=(rec.attempts|0)+1;s.games[p.id]={...rec,state:'failed',error:('EXC '+String(e?.message||e)).replace(/[^ -~]/g,'?').slice(0,40),at:Date.now(),attempts,nextAt:Date.now()+Math.min(RETRY_MAX,RETRY_MIN*2**Math.min(6,attempts-1))};}
   if(o==='failed')errors[p.id]=String(s.games[p.id]?.error||'');
   if(keep&&s.games[p.id]&&!s.games[p.id].full)s.games[p.id].full=keep;
   out[p.id]=o;save(root,s);if(o==='offline')break;
   /* 2026-11-16 informed consent (adapter-contrib.cjs consentState): the contribution and the full script + exe upload
      run only after the player agreed (update card 同意并下一步 or the Settings switch); without it nothing of the game is sent */
   if(contrib.enabled(root)){
    try{contribOut[p.id]=await contrib.forGame(root,db,g,results[p.id],{fetcher});}catch{contribOut[p.id]='failed';}
    let fo;try{fo=await fullOne(root,db,g,results[p.id],s,{fetcher,fullBase,fuller});}catch{fo='failed';}
    full[p.id]=fo;save(root,s);if(fo==='offline')break;if(fo!=='skipped')await wait(1500);}
   await wait(o==='skipped'?0:1500);}
  save(root,s);return {state:'done',results:out,errors,contrib:contribOut,full};})();
 try{return await busy;}finally{busy=null;}}

/* status(root) → {enabled, busy, games, log} (the probe dialog shows log + each bundle's manifest as the record) */
function status(root){const s=load(root);return {enabled:enabled(root),busy:!!busy,games:s.games,log:s.log};}

/* background schedule: FIRST_DELAY after start, then every EVERY; kick() after a runtime harvest or a finished probe */
let timer=null,opener=null,started=null;
function schedule(root,delay){if(!opener)return;clearTimeout(timer);timer=setTimeout(async()=>{timer=null;let db;try{db=opener();await run(root,db);}catch{}finally{try{db?.close?.();}catch{}}schedule(root,EVERY);},delay);timer.unref?.();}
function start(root,openDb,{delay=FIRST_DELAY}={}){if(process.env.NODE_TEST_CONTEXT||started===root)return null;started=root;opener=openDb;schedule(root,delay);return true;}
function kick(root,{delay=KICK_DELAY}={}){if(!opener||started!==root||!enabled(root))return false;schedule(root,delay);return true;}

module.exports={enabled,setEnabled,has,covered,run,fullOne,status,start,kick,load,fileOf,RETRY_MIN,RETRY_MAX};
