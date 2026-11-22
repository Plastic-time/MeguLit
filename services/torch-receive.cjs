// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),os=require('node:os');
const protocol=require('../core/torch-release.cjs'),diff=require('../core/game-diff.cjs'),feed=require('./auto-profile-feed.cjs');
const jobs=new Map(),states=new Map(),last=new Map(),locks=new Map(),queues=new Map(),controllers=new Map();
const fail=code=>{throw Object.assign(new Error(code),{code});};
const idKey=(root,id)=>path.resolve(root)+'\0'+String(id);
function getGame(root,id){const db=require('./store.cjs').openStore(root);try{return db.prepare('SELECT id,title,executable,original FROM games WHERE id=? AND removed_at IS NULL').get(String(id));}finally{db.close();}}
function stamp(file){const s=fs.statSync(file);if(!s.isFile())fail('TORCH_LOCAL_FILE');return [s.dev,s.ino,s.size,s.mtimeMs,s.ctimeMs].join(':');}
async function fileHash(file,{signal,maxBytes=2*1024**3,check=()=>{}}={}){check();const before=stamp(file);if(fs.statSync(file).size>maxBytes)fail('TORCH_LOCAL_LIMIT');const h=crypto.createHash('sha256');let used=0,next=16*1024**2;for await(const chunk of fs.createReadStream(file,{signal})){used+=chunk.length;if(used>maxBytes)fail('TORCH_LOCAL_LIMIT');if(used>=next){check();next=used+16*1024**2;}h.update(chunk);}check();if(stamp(file)!==before)fail('TORCH_LOCAL_CHANGED');return h.digest('hex');}
function resources(root,{paths=[],freemem=os.freemem,statfs=fs.statfsSync}={}){try{const available=freemem();if(!Number.isFinite(available)||available<256*1024**2)return false;for(const file of new Set([root,...paths])){const s=statfs(file),free=s.bavail*s.bsize;if(!Number.isFinite(free)||free<16*1024**2)return false;}return true;}catch{return false;}}
const deferred=()=>Object.assign(new Error('TORCH_DEFERRED'),{code:'TORCH_DEFERRED'});
function sleep(ms,signal){return new Promise(resolve=>{let timer;const done=()=>{clearTimeout(timer);signal.removeEventListener('abort',done);resolve();};timer=setTimeout(done,ms);timer.unref?.();signal.addEventListener('abort',done,{once:true});if(signal.aborted)done();});}
function scriptPath(exe,relative){if(!protocol.scriptFile(relative))fail('TORCH_SCRIPT_PATH');const base=fs.realpathSync(path.dirname(exe));let here=base;for(const part of relative.split('/')){here=path.join(here,part);if(fs.lstatSync(here).isSymbolicLink())fail('TORCH_SCRIPT_PATH');}const real=fs.realpathSync(here),rel=path.relative(base,real);if(!rel||rel==='..'||rel.startsWith('..'+path.sep)||path.isAbsolute(rel))fail('TORCH_SCRIPT_PATH');return real;}
function trust(){let keys=[];try{keys=JSON.parse(fs.readFileSync(path.join(__dirname,'torch-review-keys.json'),'utf8')).keys||[];}catch{}return {profileKeys:feed.keys(),releaseKeys:feed.keys(),reviewKeys:keys};}
async function body(response){if(Number(response.headers?.get('content-length'))>protocol.MAX_BYTES)fail('TORCH_LIMIT');if(!response.body?.getReader)fail('TORCH_RESPONSE');const reader=response.body.getReader(),parts=[];let size=0;try{for(;;){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>protocol.MAX_BYTES)fail('TORCH_LIMIT');parts.push(Buffer.from(value));}}finally{await reader.cancel().catch(()=>{});reader.releaseLock();}try{return JSON.parse(Buffer.concat(parts,size).toString('utf8'));}catch{fail('TORCH_RESPONSE');}}
function atomic(file,value){fs.mkdirSync(path.dirname(file),{recursive:true});const tmp=file+'.'+process.pid+'.'+crypto.randomUUID()+'.tmp';try{fs.writeFileSync(tmp,JSON.stringify(value),{flag:'wx'});fs.renameSync(tmp,file);}finally{try{fs.unlinkSync(tmp);}catch{}}}
function credit(c,n){return c&&c.torchNo===n?{torchNo:n,name:feed.cleanName(c.name)}:{torchNo:n,name:null};}
const exactProfile=(answer,key)=>answer?.version===2&&answer.versionLayer?.match==='exe'&&answer.versionLayer.diff?.key===key?answer.versionLayer.diff:answer?.diff?.key===key?answer.diff:null;
function builtinCompatible(r){const builtin=require('../core/profiles/seed.cjs').versionOf(r.key);return !builtin||r.profile.rev>Number(builtin.rev||0)||protocol.same(builtin.settings,r.profile.settings);}
function compatibleCached(answer,key,keys=trust(),{exe}={}){try{const r=answer.torchRelease,l=answer.torchLocal;protocol.releaseShape(r);if(typeof exe!=='string'||!exe||!l)return false;const current=fs.realpathSync(exe),bound=fs.realpathSync(l.exe),samePath=(a,b)=>process.platform==='win32'?a.toLowerCase()===b.toLowerCase():a===b;if(!samePath(current,bound)||r.key!==key||!builtinCompatible(r)||!protocol.same(r.profile,answer.diff)||l.key!==key||stamp(current)!==l.exeStamp||!samePath(scriptPath(current,r.review.identity.scriptFile),l.script)||stamp(l.script)!==l.scriptStamp)return false;const active=(list,doc)=>{const a=Array.isArray(list)?list.filter(k=>k.alg==='ed25519'&&!k.revoked&&k.id===doc.signature.keyId):[];return a.length===1?a:[];},h=crypto.createHash('sha256').update(diff.canonical(r.profile)).digest('hex');return h===r.review.candidateHash&&feed.verify(r.profile,active(keys.profileKeys,r.profile))&&feed.verify(r,active(keys.releaseKeys||keys.profileKeys,r))&&feed.verify(r.review,active(keys.reviewKeys,r.review));}catch{return false;}}
async function installed(root,key,{keys=trust(),exe}={}){const answer=feed.cached(root,key);if(!answer||!feed.layer(answer,key,{torchTrust:keys,exe})?.exact)return null;
 if(answer.torchRelease){try{const p=await protocol.checked(answer.torchRelease,keys);if(answer.torchRelease.key!==key||!protocol.same(answer.diff,answer.torchRelease.profile))return null;return {version:1,status:'installed',verified:true,origin:'torch-release',key,hash:p.hash,serverTime:answer.torchPublication?.hash===p.hash&&protocol.iso(answer.torchPublication.at)?answer.torchPublication.at:null,credit:credit(answer.torchCredit,answer.torchRelease.review.torchNo),revision:answer.torchRelease.revision,cardinalRev:answer.torchRelease.review.cardinalRev};}catch{return null;}}
 const p=exactProfile(answer,key);if(p&&Number.isSafeInteger(p.rev)&&p.rev>0)return {version:1,status:'installed',verified:true,origin:'legacy-feed',key,hash:await protocol.hash({profile:p,gameLayer:answer.gameLayer||null}),serverTime:null,credit:null,revision:p.rev,cardinalRev:null};
 return null;}
function receiveEndpoints(root,key,legacy=false,env=process.env){
 if(!diff.KEY.test(String(key||'')))return [];
 const route=legacy?'/api/game-profile'+feed.query(key,{exe:key},null):'/api/torch-release?exe='+key;
 const relay=require('./relay-config.cjs');
 if(!require('../core/owner-tests.cjs').privateMode(root,env))return relay.endpoints(root,route,env);
 if(env.MEGULIT_OWNER_TORCH_RECEIVE!=='1'||env.MEGULIT_OFFLINE==='1'||env.MEGULIT_CARDINAL_REPLAY==='1')return [];
 return [relay.CN_RELAY_BASE+route,relay.DEFAULT_RELAY_BASE+route];
}
async function lookup(urls,fetcher,signal,{release=false,ownerTest=false}={}){
 if(!fetcher||!urls.length)return {state:'disabled'};
 for(const url of urls){
  let response;
  try{response=await fetcher(url,{method:'GET',redirect:'error',headers:{accept:'application/json','user-agent':'MeguLit'},signal:AbortSignal.any([signal,AbortSignal.timeout(15000)])});}
  catch{signal.throwIfAborted();continue;}
  if(response.status===404||release&&response.status===410){
   const missing=response.status===404;
   let confirmed=false;
   if(missing||ownerTest){
    let answer;
    try{answer=await body(response);}catch{signal.throwIfAborted();}
    confirmed=answer?.ok===false&&answer.error===(missing?'NOT_FOUND':'TORCH_REVOKED');
    if(ownerTest&&!confirmed)continue;
   }else await response.body?.cancel().catch(()=>{});
   return {state:missing?'missing':'revoked',confirmed};
  }
  if(!response.ok){await response.body?.cancel().catch(()=>{});continue;}
  try{return {state:'found',answer:await body(response)};}
  catch(e){signal.throwIfAborted();if(/^TORCH_[A-Z_]+$/.test(e.code||''))throw e;}
 }
 fail('TORCH_RELAY_UNAVAILABLE');
}
async function legacy(root,key,fetcher,signal,ownerTest){
 const result=await lookup(receiveEndpoints(root,key,true),fetcher,signal,{ownerTest});
 if(result.state!=='found')return result;
 const answer=result.answer;
 if(!answer||Object.keys(answer).some(k=>k.startsWith('torch'))||!feed.layer(answer,key))fail('TORCH_RESPONSE');
 const exact=ownerTest?{schema:answer.schema,version:1,key,diff:answer.version===2
  ? (answer.versionLayer?.match==='exe'&&answer.versionLayer.key===key?answer.versionLayer.diff:null)
  : answer.diff}:answer;
 return {state:'found',answer:{...exact,fetchedAt:Date.now()}};
}
function status(root,id){return states.get(idKey(root,id))||null;}
async function serial(key,fn){const old=locks.get(key)||Promise.resolve(),next=old.catch(()=>{}).then(fn);locks.set(key,next);try{return await next;}finally{if(locks.get(key)===next)locks.delete(key);}}
async function receive(root,id,options={}){const jobKey=idKey(root,id);if(jobs.has(jobKey))return jobs.get(jobKey);
 const rootKey=path.resolve(root);if(!controllers.has(rootKey))controllers.set(rootKey,new AbortController());const owner=controllers.get(rootKey);if(owner.signal.aborted)return {state:'install-failed',code:'TORCH_STOPPED'};
 const signal=AbortSignal.any([owner.signal,AbortSignal.timeout(60000),...(options.signal?[options.signal]:[])]);
 const resourcePaths=[],check=()=>{signal.throwIfAborted();if((options.resources||resources)(root,{paths:resourcePaths})!==true||options.permission&&options.permission()!==true||options.priority==='user'&&options.active&&options.active()!==true)throw deferred();};
 const work=(async()=>{check();const read=options.getGame||getGame,row=read(root,id);if(!row?.executable)return {state:'hidden'};const exe=row.executable;resourcePaths.push(exe);const exeStamp=stamp(exe),key=await (options.hashExe||fileHash)(exe,{signal,check});if(stamp(exe)!==exeStamp)fail('TORCH_LOCAL_CHANGED');if(!diff.KEY.test(key))fail('TORCH_KEY');states.set(jobKey,{state:'installing',key});
  return serial(path.resolve(root)+'\0'+key,async()=>{
   const still=()=>{check();const now=read(root,id);if(!now||now.executable!==exe||stamp(exe)!==exeStamp)fail('TORCH_GAME_CHANGED');};still();
   const fetcher=options.fetcher===undefined?globalThis.fetch:options.fetcher,keys=options.keys||trust(),urls=options.urls||receiveEndpoints(root,key);
   const ownerTest=require('../core/owner-tests.cjs').privateMode(root);
   const result=await lookup(urls,fetcher,signal,{release:true,ownerTest});
   let missing=false;
   if(result.state==='revoked'){
    const old=feed.cached(root,key);
    if(old?.torchRelease){still();(options.atomicWrite||atomic)(path.join(feed.dir(root),key+'.json'),{none:true,key,torchQuarantined:{release:old.torchRelease},fetchedAt:Date.now()});}
    fail('TORCH_REVOKED');
   }
   if(result.state==='found'){const remote=result.answer,release=remote?.release,p=await protocol.checked(release,keys);if(release.key!==key)fail('TORCH_IDENTITY');if(!builtinCompatible(release))fail('TORCH_BUILTIN_NEWER');check();const script=scriptPath(exe,p.identity.scriptFile);resourcePaths.push(script);const scriptStamp=stamp(script);if(await fileHash(script,{signal,check})!==p.identity.script)fail('TORCH_SCRIPT_IDENTITY');const old=feed.cached(root,key);
    const previous=old?.torchRelease||old?.torchQuarantined?.release;if(previous){await protocol.checked(previous,keys);if(release.revision<previous.revision||release.revision===previous.revision&&(!protocol.same(release,previous)||old.torchQuarantined))fail('TORCH_ROLLBACK');}
    still();if(stamp(script)!==scriptStamp)fail('TORCH_LOCAL_CHANGED');
    const publication=remote.publication?.hash===p.hash&&protocol.iso(remote.publication.at)&&Date.parse(remote.publication.at)>=Date.parse(release.preparedAt)&&Date.parse(remote.publication.at)<=Date.now()+300000?{hash:p.hash,at:remote.publication.at}:null;
    if(!publication)fail('TORCH_PUBLICATION');
    (options.atomicWrite||atomic)(path.join(feed.dir(root),key+'.json'),{schema:'megulit.game-diff-feed',version:1,key,diff:release.profile,torchRelease:release,torchPublication:publication,torchCredit:credit(remote.credit,release.review.torchNo),torchLocal:{key,exe,exeStamp,script,scriptStamp},fetchedAt:Date.now()});
   }else if(result.state==='missing'){
    /* Legacy exact signed profiles remain usable with unknown provenance. */
    const old=feed.cached(root,key);
    if(!old?.torchRelease&&!old?.torchQuarantined){
     const fallback=options.refresh?{answer:await options.refresh(root,key,{fetcher,signal})}:await legacy(root,key,fetcher,signal,ownerTest);
     missing=result.confirmed&&fallback.state==='missing'&&fallback.confirmed;
     const answer=fallback.answer,p=exactProfile(answer,key),latest=feed.cached(root,key),prior=exactProfile(latest,key);
     if(!latest?.torchRelease&&!latest?.torchQuarantined&&answer&&!answer.none&&feed.layer(answer,key)?.exact&&p&&Number.isSafeInteger(p.rev)&&p.rev>0){
      if(prior&&(p.rev<prior.rev||p.rev===prior.rev&&!protocol.same(p,prior)))fail('TORCH_ROLLBACK');
      still();(options.atomicWrite||atomic)(path.join(feed.dir(root),key+'.json'),{...answer,torchInstalled:true});
     }
    }
   }
   still();const receipt=await installed(root,key,{keys,exe});const state=receipt?{state:'received',key,receipt}:{state:'hidden',key,...(missing?{code:'TORCH_NOT_PUBLISHED',checkedAt:Date.now()}:{})};states.set(jobKey,state);return state;
  });
 })().catch(e=>{const reason=signal.aborted?signal.reason:e,paused=reason?.code==='TORCH_DEFERRED'||e.code==='TORCH_DEFERRED',v={state:paused?'hidden':'install-failed',key:states.get(jobKey)?.key||'',code:paused?'TORCH_DEFERRED':/^TORCH_[A-Z_]+$/.test(e.code||'')?e.code:'TORCH_INSTALL_FAILED'};states.set(jobKey,v);return v;}).finally(()=>{jobs.delete(jobKey);last.set(jobKey,Date.now());});jobs.set(jobKey,work);return work;}
function enqueue(root,ids,options={}){
 if(!Array.isArray(ids)||ids.length>5000)fail('TORCH_QUEUE_LIMIT');const qKey=path.resolve(root);if(controllers.get(qKey)?.signal.aborted)return false;
 let q=queues.get(qKey);if(!q){q={items:new Map(),running:false,current:null};queues.set(qKey,q);}
 for(const id of new Set(ids.map(String))){const key=idKey(root,id),user=options.priority==='user';
  if(q.current?.id===id&&q.current.stage==='running'){if(user){q.current.entry.options.priority='user';if(options.active)q.current.entry.options.active=options.active;}continue;}
  if(jobs.has(key))continue;if(!options.force&&(!user||options.cooldown)&&Date.now()-(last.get(key)||0)<60000)continue;
  const prior=q.items.get(id);if(!prior&&q.items.size>=5000){const victim=user?[...q.items].reverse().find(([,e])=>e.options.priority!=='user'):null;if(victim)q.items.delete(victim[0]);else fail('TORCH_QUEUE_LIMIT');}const entry={options:{...options,priority:user?'user':prior?.options.priority||'bulk'},deadline:Date.now()+(user?120000:30*60000),deferrals:prior?.deferrals||0};
  if(user){q.items.delete(id);q.items=new Map([[id,entry],...q.items]);if(q.current?.entry.options.priority!=='user')q.current?.controller.abort(deferred());}else if(!prior)q.items.set(id,entry);
 }
 if(!q.running){q.running=true;q.closed=new Promise(resolve=>setImmediate(async()=>{try{while(q.items.size){const [id,entry]=q.items.entries().next().value;q.items.delete(id);if(Date.now()>entry.deadline)continue;const controller=new AbortController();q.current={id,entry,controller,stage:'budget'};let timer=null,poll=null;
   try{if(entry.options.priority!=='user'){
    const allowed=()=>Promise.resolve((entry.options.resources||resources)(root)).then(ok=>ok&&(entry.options.allowedIdle?entry.options.allowedIdle():require('./background-games.cjs').idle(root)));
    const ok=await require('./background-budget.cjs').wait(root,{allowed,cancelled:()=>controller.signal.aborted||Date.now()>entry.deadline,delay:30000,sleep:ms=>sleep(ms,controller.signal)});if(!ok)continue;
   }
   if(entry.options.priority==='user'&&((entry.options.resources||resources)(root)!==true||entry.options.active&&entry.options.active()!==true)){entry.options.priority='bulk';controller.abort(deferred());continue;}
   q.current.stage='running';timer=setInterval(()=>{if(poll||controller.signal.aborted)return;poll=Promise.resolve().then(async()=>{try{const ok=(entry.options.resources||resources)(root)===true&&(!(entry.options.priority==='user'&&entry.options.active)||entry.options.active()===true)&&(entry.options.priority==='user'||await (entry.options.allowedIdle?entry.options.allowedIdle():require('./background-games.cjs').idle(root)));if(!ok)controller.abort(deferred());}catch{controller.abort(deferred());}}).finally(()=>{poll=null;});},2000);timer.unref?.();
   const external=entry.options.signal;await receive(root,id,{...entry.options,permission:()=>entry.options.priority!=='user'||!entry.options.active||entry.options.active()===true,signal:external?AbortSignal.any([external,controller.signal]):controller.signal});
   }finally{clearInterval(timer);if(poll)await poll;if(controller.signal.reason?.code==='TORCH_DEFERRED'&&++entry.deferrals<=3&&Date.now()<entry.deadline&&!q.items.has(id)&&q.items.size<5000){if(entry.options.priority==='user')q.items=new Map([[id,entry],...q.items]);else q.items.set(id,entry);}q.current=null;}
   await new Promise(r=>setImmediate(r));
  }}finally{queues.delete(qKey);resolve();}}));}return true;
}
async function stop(root){const key=path.resolve(root);let c=controllers.get(key);if(!c){c=new AbortController();controllers.set(key,c);}c.abort();const q=queues.get(key);if(q){q.items.clear();q.current?.controller.abort();}await Promise.allSettled([...jobs.entries()].filter(([k])=>k.startsWith(key+'\0')).map(([,p])=>p));if(q?.closed)await q.closed;return {cleanupConfirmed:true};}
function resume(root){const key=path.resolve(root);if(controllers.has(key)&&!controllers.get(key).signal.aborted)return true;if([...jobs.keys()].some(k=>k.startsWith(key+'\0'))||queues.has(key))fail('TORCH_STOP_PENDING');controllers.set(key,new AbortController());return true;}
module.exports={receive,enqueue,installed,status,fileHash,scriptPath,body,compatibleCached,stop,resume,resources};
