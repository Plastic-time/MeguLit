// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
/* 2026-11-13 card wall (user: Toploaders hang on a wall, 50 by default; the player turns a CG they like, the game's
   cover or a MeguLit scene shot into a card and slides it into a Toploader). Everything lives in data/cards:
   cards.json (Toploaders, cards, wall mode), img/ (each card's face and its moving picture), thumbs/ (picker
   thumbnails), seen/ (pictures an engine reported on screen). Pictures reach the page as data: URLs like covers do.

   NO SPOILERS: a picture is offered only when this computer has proof the player saw it:
    'shot'  MeguLit's own scene shots (services/scene-shots): taken from the game window while it was read
    'save'  the game's own save marks the CG unlocked (services/game-cg: KiriKiri, HuneX, Siglus, YU-RIS readers)
    'seen'  an engine reported the picture on screen (noteSeen), resolved to a loose file of that exact name
    'memory' the runtime dump DLL watched the game window show it (services/runtime-cg, native/runtimedump/modules/Cg.cpp)
    'cover' the game's cover
   Anything else (gallery tables, archive listings, images merely loaded) is never offered, and cards_create only
   accepts a source id the unlocked list gives right now. With the R18 filter on, 'save' CGs follow the local rating
   model like the detail card and 'seen'/'memory' pictures (never rated) are left out. */
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),{spawnSync}=require('node:child_process');
/* the face is drawn at up to ~3x on the inspect stage and the whole CG is toured at that size: keep both sharp there */
const DEFAULT_TOPLOADERS=50,MAX_TOPLOADERS=500,FACE_W=750,FACE_H=1000,THUMB=480,FULL=2048,VIEW=1600;
const sha=v=>crypto.createHash('sha1').update(String(v)).digest('hex');
const dirOf=root=>path.join(root,'data','cards');
const stateFile=root=>path.join(dirOf(root),'cards.json');
const exeKey=exe=>sha(path.resolve(String(exe)).toLowerCase()).slice(0,16);

/* ---- storage: one writer at a time across processes (lock file), every write via tmp + rename ---- */
const sleep=ms=>{try{Atomics.wait(new Int32Array(new SharedArrayBuffer(4)),0,0,ms);}catch{}};
function withLock(root,fn){
 const dir=dirOf(root);fs.mkdirSync(dir,{recursive:true});const lock=path.join(dir,'.lock');let fd=null;
 for(let i=0;i<200&&fd===null;i++){try{fd=fs.openSync(lock,'wx');}catch(e){if(e.code!=='EEXIST')throw e;
  try{if(Date.now()-fs.statSync(lock).mtimeMs>30000)fs.rmSync(lock,{force:true});}catch{}sleep(25);}}
 if(fd===null)throw Error('CARDS_BUSY');
 try{return fn();}finally{try{fs.closeSync(fd);}catch{}try{fs.rmSync(lock,{force:true});}catch{}}}
function atomicWrite(file,data){fs.mkdirSync(path.dirname(file),{recursive:true});const tmp=file+'.'+process.pid+'.'+Date.now().toString(36)+'.tmp';
 try{fs.writeFileSync(tmp,data);fs.renameSync(tmp,file);}
 catch(error){try{fs.rmSync(tmp,{force:true});}catch{}throw error;}}
const newId=p=>p+Date.now().toString(36)+crypto.randomBytes(3).toString('hex');
function clean(raw){
 const v=raw&&typeof raw==='object'?raw:{};
 const cards=(Array.isArray(v.cards)?v.cards:[]).filter(c=>c&&typeof c.id==='string');const ids=new Set(cards.map(c=>c.id));
 let tops=(Array.isArray(v.toploaders)?v.toploaders:[]).filter(t=>t&&typeof t.id==='string');
 if(!Array.isArray(v.toploaders))for(let i=0;i<DEFAULT_TOPLOADERS;i++)tops.push({id:'t'+i,cardId:null,order:i});
 const used=new Set();tops=tops.sort((a,b)=>(a.order||0)-(b.order||0)).map((t,i)=>{let cardId=typeof t.cardId==='string'&&ids.has(t.cardId)&&!used.has(t.cardId)?t.cardId:null;if(cardId)used.add(cardId);return {id:t.id,cardId,order:i};});
 return {version:1,toploaders:tops,cards,mode:v.mode==='b'?'b':'a'};}
function readState(root){try{return clean(JSON.parse(fs.readFileSync(stateFile(root),'utf8')));}catch{return clean(null);}}
function writeState(root,s){atomicWrite(stateFile(root),JSON.stringify(s));}
const mutate=(root,fn)=>withLock(root,()=>{const s=readState(root);const out=fn(s);writeState(root,s);return out;});

/* ---- pictures ---- */
function dataUrl(file){try{const b=fs.readFileSync(file);const t=b[0]===0x89?'image/png':b[0]===0xff?'image/jpeg':b[0]===0x42?'image/bmp':b.toString('latin1',8,12)==='WEBP'?'image/webp':'';return t?'data:'+t+';base64,'+b.toString('base64'):'';}catch{return '';}}
/* runs services/card-image.ps1 over a batch of jobs; returns [{ok,w,h}] (tests may replace it) */
let runner=function(jobs){
 if(!jobs.length)return [];const tmp=path.join(require('node:os').tmpdir(),'megulit-card-'+process.pid+'-'+Date.now().toString(36)+'.json');
 fs.writeFileSync(tmp,JSON.stringify(jobs),'utf8');
 try{const r=spawnSync('powershell.exe',['-NoProfile','-NonInteractive','-ExecutionPolicy','Bypass','-File',path.join(__dirname,'card-image.ps1'),tmp],{encoding:'utf8',windowsHide:true,timeout:120000});
  const out=jobs.map(()=>({ok:false,w:0,h:0}));for(const m of String(r.stdout||'').matchAll(/(\d+)\t(ok|error)\t(\d+)\t(\d+)/g)){const [,i,st,w,h]=m;if(out[+i])out[+i]={ok:st==='ok',w:+w||0,h:+h||0};}return out;}
 finally{try{fs.rmSync(tmp,{force:true});}catch{}}};
function stampOf(file){try{const s=fs.statSync(file);return file+'|'+s.size+'|'+s.mtimeMs;}catch{return null;}}
const thumbsDir=root=>path.join(dirOf(root),'thumbs');
function readMeta(root){try{return JSON.parse(fs.readFileSync(path.join(thumbsDir(root),'meta.json'),'utf8'))||{};}catch{return {};}}
/* cached JPEGs of at most max px for picture files: {file -> {out,w,h}} */
const thumbOf=(root,f,max)=>{const st=stampOf(f);if(!st)return null;const k=sha(st+'|'+max+'|v2').slice(0,24);return {k,out:path.join(thumbsDir(root),k+'.jpg')};};
/* only what is already on disk (never draws): the list the page polls must not wait on a picture */
function cachedThumbs(root,files,max,meta=readMeta(root)){const map=new Map();for(const f of files){const t=thumbOf(root,f,max);if(t&&meta[t.k]&&fs.existsSync(t.out))map.set(f,{out:t.out,w:meta[t.k].w,h:meta[t.k].h,hash:meta[t.k].hash||''});}return map;}
const fileHash=f=>{try{return sha(fs.readFileSync(f)).slice(0,20);}catch{return '';}};
function noteThumbs(root,done){if(!done.length)return;withLock(root,()=>{const m=readMeta(root);for(const d of done)m[d.k]={w:d.w,h:d.h,hash:d.hash||fileHash(d.out)};atomicWrite(path.join(thumbsDir(root),'meta.json'),JSON.stringify(m));});}
function scaled(root,files,max){
 const meta=readMeta(root),map=cachedThumbs(root,files,max,meta),jobs=[];
 for(const f of files){if(map.has(f))continue;const t=thumbOf(root,f,max);if(t&&!jobs.some(j=>j.in===f))jobs.push({mode:'thumb',in:f,out:t.out,max,k:t.k});}
 if(jobs.length){fs.mkdirSync(thumbsDir(root),{recursive:true});const res=runner(jobs.map(({k,...j})=>j)),done=[];
  jobs.forEach((j,i)=>{if(res[i]?.ok){done.push({k:j.k,w:res[i].w,h:res[i].h,out:j.out});map.set(j.in,{out:j.out,w:res[i].w,h:res[i].h});}});noteThumbs(root,done);}
 return map;}

/* ---- 'seen': pictures an engine reported on screen ---- */
const seenFile=(root,exe)=>path.join(dirOf(root),'seen',exeKey(exe)+'.json');
function readSeen(root,exe){try{const v=JSON.parse(fs.readFileSync(seenFile(root,exe),'utf8'));return Array.isArray(v)?v:[];}catch{return [];}}
/* the generic record point: an engine hook says this picture is on the game's screen now (reader 'imageShown') */
function noteSeen(root,exe,name){
 const b=path.basename(String(name||'').replace(/\\/g,'/')).replace(/\.[^.]+$/,'').toLowerCase();if(!root||!exe||!/^[\w\-.]{1,80}$/.test(b))return false;
 return withLock(root,()=>{const list=readSeen(root,exe);if(list.includes(b))return false;list.push(b);atomicWrite(seenFile(root,exe),JSON.stringify(list.slice(-5000)));return true;});}
const IMG=/\.(?:png|jpe?g|bmp)$/i;
function looseByName(dir,names,depth=3,out=new Map()){if(!names.size)return out;let l;try{l=fs.readdirSync(dir,{withFileTypes:true});}catch{return out;}
 for(const e of l){const p=path.join(dir,e.name);if(e.isDirectory()){if(depth>0&&!/^(?:save|savedata|movie|bgm|voice|sound|se)$/i.test(e.name))looseByName(p,names,depth-1,out);}
  else if(IMG.test(e.name)){const b=e.name.replace(/\.[^.]+$/,'').toLowerCase();if(names.has(b)&&!out.has(b))out.set(b,p);}}return out;}

/* ---- sources ---- */
function gameRow(db,id){const g=db.prepare('SELECT id,title,executable,cover FROM games WHERE id=? AND removed_at IS NULL').get(String(id||''));if(!g)throw Error('GAME_NOT_FOUND');return g;}
function safeOn(root){try{return JSON.parse(fs.readFileSync(path.join(root,'data','config','native-preferences.json'),'utf8')).safe_cg===true;}catch{return false;}}
/* every picture the player is known to have seen: [{id,kind,source,file?|name}] (save CGs keep their name; the
   file is decoded only when a picture is needed) */
function sources(root,game,opts={}){
 const out=[],exe=game.executable,safe=opts.safe??safeOn(root);
 if(game.cover){const f=path.join(root,'data','assets','covers',path.basename(game.cover));if(fs.existsSync(f))out.push({id:'cover',kind:'cover',source:'cover',file:f});}
 if(exe){
  try{const shots=require('./scene-shots.cjs'),d=path.join(root,'data','scene-shots',exeKey(exe));for(const s of shots.list(root,exe)){const f=path.join(d,s.file);if(fs.existsSync(f))out.push({id:'shot:'+s.file,kind:'shot',source:'shot',file:f});}}catch{}
  const saved=new Set();
  if(fs.existsSync(exe)){try{const cg=require('./game-cg.cjs'),r=cg.scan(exe);let names=r.supported?[...r.items.keys()]:[];
   /* KiriKiri: only explicit cg_ unlock marks count on the wall (the detail card keeps its wider rule) */
   if(r.engine==='KiriKiri'){const marked=cg.kirikiriMarked(exe)||new Set();names=names.filter(n=>marked.has(n));}
   if(safe&&names.length){const rating=require('./cg-rating.cjs'),known=rating.ratings(path.join(root,'data','cg-cache',sha(path.dirname(String(exe)).toLowerCase()).slice(0,16)));names=names.filter(n=>rating.isSafe(known[n]));}
   /* 2026-11-15 grouped by scene (the engine's gallery entry; else a trailing variant letter, ev101a -> ev101), scene by
      scene in the order the gallery lists them, variants in name order */
   const sceneOf=n=>r.items.get(n)?.group||'n:'+String(n).replace(/(?<=\d)[a-z]$/,''),rank=new Map();for(const n of names){const s=sceneOf(n);if(!rank.has(s))rank.set(s,rank.size);}
   names=[...names].sort((a,b)=>rank.get(sceneOf(a))-rank.get(sceneOf(b))||a.localeCompare(b,undefined,{numeric:true}));
   for(const n of names){saved.add(n);out.push({id:'save:'+n,kind:'cg',source:'save',name:n,group:sceneOf(n)});}}catch{}}
  if(!safe){const want=new Set(readSeen(root,exe).filter(n=>!saved.has(n)));const found=looseByName(path.dirname(exe),want);
   for(const [n,f] of found)out.push({id:'seen:'+n,kind:'cg',source:'seen',file:f});
   try{out.push(...require('./runtime-cg.cjs').sources(exe,{settle:opts.settle}));}catch{}}
 }
 return out;}
function fileOf(root,game,s){if(s.file)return s.file;try{return require('./game-cg.cjs').pictureFile(root,game.executable,s.name)||null;}catch{return null;}}

/* 2026-11-15 save CGs not decoded or not thumbnailed yet go to ONE background worker per game (user: the whole PC
   froze while 142 save CGs decoded). The list the page polls never draws a picture itself: it answers with what is on
   disk (thumbs/meta.json) and counts the rest as pending. The worker (this file, --warm) runs at below-normal CPU
   priority; its thumbnailers (card-image.ps1 -Serve, half the cores, at most 4) run below normal in Windows background
   mode (low I/O and memory priority) and set the worker's own I/O priority to very low. One picture at a time is decoded
   to the cg-cache (pictureFile: decoded once, never again), shrunk to a THUMB jpeg and noted in meta.json right away,
   so pictures appear one by one; nothing large stays in memory. It pauses while the game being read or a full-screen
   program is in front, and runs one thumbnailer while a game is open behind. Pictures that cannot be decoded are
   noted (warm-<exe>-failed.json) and stop counting as pending instead of being retried on every poll. */
const warmFile=(root,exe)=>path.join(dirOf(root),'warm-'+exeKey(exe)+'.json');
const failedFile=(root,exe)=>path.join(dirOf(root),'warm-'+exeKey(exe)+'-failed.json');
const playingFile=root=>path.join(dirOf(root),'playing.json');
const alive=pid=>{try{process.kill(pid,0);return true;}catch(e){return e.code==='EPERM';}};
function readWarm(root,exe){try{const v=JSON.parse(fs.readFileSync(warmFile(root,exe),'utf8'));if(Date.now()-v.at<90000&&alive(v.pid))return v;}catch{}return null;}
const warmBusy=(root,exe)=>!!readWarm(root,exe);
function readFailed(root,exe){try{const v=JSON.parse(fs.readFileSync(failedFile(root,exe),'utf8'));return new Set(Array.isArray(v)?v:[]);}catch{return new Set();}}
/* the reader says which game process is open (reader.cjs gameProcessId / gameClosed); the worker yields to it */
function noteGame(root,pid){try{if(pid)atomicWrite(playingFile(root),JSON.stringify({pid:Number(pid)}));else fs.rmSync(playingFile(root),{force:true});}catch{}}
function playingPid(root){try{const p=Number(JSON.parse(fs.readFileSync(playingFile(root),'utf8')).pid);return p&&alive(p)?p:0;}catch{return 0;}}
let spawnWarm=function(root,exe,items){
 if(warmBusy(root,exe))return;const job=path.join(dirOf(root),'warm-'+exeKey(exe)+'-job.json');atomicWrite(job,JSON.stringify({root,exe,items}));
 const child=require('node:child_process').spawn(process.execPath,[__filename,'--warm',job],{detached:true,stdio:'ignore',windowsHide:true});
 atomicWrite(warmFile(root,exe),JSON.stringify({pid:child.pid,at:Date.now(),done:0,total:items.length}));child.unref();};
const itemKey=it=>typeof it==='string'?'save:'+it:'file:'+it.file;
function itemFile(root,exe,it){if(typeof it!=='string')return it.file;return require('./game-cg.cjs').pictureFile(root,exe,it);}
function noteFailed(root,exe,keys){if(!keys.length)return;try{const s=readFailed(root,exe);for(const k of keys)s.add(k);atomicWrite(failedFile(root,exe),JSON.stringify([...s].slice(-5000)));}catch{}}
/* inline version (tests, and the fallback when the pooled worker cannot start): batches through runner */
function warm(root,exe,items){const failed=[];
 for(let i=0;i<items.length;i+=24){const files=[];for(const it of items.slice(i,i+24)){try{const f=itemFile(root,exe,it);if(f)files.push(f);else failed.push(itemKey(it));}catch{failed.push(itemKey(it));}}if(files.length)scaled(root,files,THUMB);}
 noteFailed(root,exe,failed);}
/* the pooled worker: Node decodes, card-image.ps1 -Serve processes shrink */
function thumbPool(size,parentPid,cacheDir){
 const {spawn}=require('node:child_process'),workers=[];let seq=0,closed=false;
 const ascii=v=>JSON.stringify(v).replace(/[\u007f-￿]/g,c=>'\\u'+c.charCodeAt(0).toString(16).padStart(4,'0'));
 function start(){return new Promise(resolve=>{let child;try{child=spawn('powershell.exe',['-NoProfile','-NonInteractive','-ExecutionPolicy','Bypass','-File',path.join(__dirname,'card-image.ps1'),'-Serve','-ParentPid',String(parentPid),'-CacheDir',cacheDir],{stdio:['pipe','pipe','ignore'],windowsHide:true});}catch{return resolve(null);}
  const w={child,busy:false,wait:null,buf:'',dead:false};let ready=false;
  child.stdout.setEncoding('utf8');child.stdout.on('data',d=>{w.buf+=d;let i;while((i=w.buf.indexOf('\n'))>=0){const line=w.buf.slice(0,i).trim();w.buf=w.buf.slice(i+1);
   if(!ready){if(line==='READY'){ready=true;resolve(w);}continue;}const cb=w.wait;w.wait=null;w.busy=false;if(cb)cb(line.split('\t'));}});
  const dead=()=>{w.dead=true;if(!ready)resolve(null);const cb=w.wait;w.wait=null;if(cb)cb(null);};child.on('exit',dead);child.on('error',dead);
  setTimeout(()=>{if(!ready){try{child.kill();}catch{}}},30000);});}
 const ask=(w,msg)=>new Promise(res=>{if(w.dead)return res(null);w.busy=true;const t=setTimeout(()=>{try{w.child.kill();}catch{}},120000);w.wait=r=>{clearTimeout(t);res(r);};try{w.child.stdin.write(ascii({...msg,seq:++seq})+'\n');}catch{clearTimeout(t);w.wait=null;w.busy=false;res(null);}});
 return {
  /* the first one compiles the small Win32 helper (cached as a dll) and starts working at once; the others start
     behind it and only load the dll */
  async open(){const first=await start();if(!first)return false;workers.push(first);for(let i=1;i<size;i++)start().then(w=>{if(w){if(closed)try{w.child.stdin.end();}catch{}else workers.push(w);}});return true;},
  idle(limit){return workers.slice(0,limit).find(w=>!w.busy&&!w.dead)||null;},
  live(){return workers.filter(w=>!w.dead).length;},
  thumb:(w,job)=>ask(w,job),
  state:w=>ask(w,{mode:'state'}),
  close(){closed=true;for(const w of workers){try{w.child.stdin.end();}catch{}}}};}
async function warmRun(root,exe,items){
 const os=require('node:os');try{os.setPriority(0,os.constants.priority.PRIORITY_BELOW_NORMAL);}catch{}
 const cores=os.availableParallelism?os.availableParallelism():os.cpus().length,size=Math.max(1,Math.min(4,Math.floor(cores/2)));
 let done=0,paused=false,lastState=0,gate={limit:size,pause:false};const failed=[],inflight=new Set();
 const beat=()=>{try{atomicWrite(warmFile(root,exe),JSON.stringify({pid:process.pid,at:Date.now(),done,total:items.length,paused}));}catch{}};
 /* the heartbeat runs on a timer from the start: a slow start on a busy PC must not look dead and get a second worker */
 beat();const heart=setInterval(beat,10000);heart.unref();
 const pool=thumbPool(size,process.pid,path.join(dirOf(root),'bin'));if(!await pool.open()){clearInterval(heart);return warm(root,exe,items);}
 const tick=ms=>new Promise(r=>setTimeout(r,ms));
 async function refresh(){if(Date.now()-lastState<1500)return;lastState=Date.now();const game=playingPid(root);let fg=0,quns=5;
  const w=pool.idle(size);if(w){const r=await pool.state(w);if(r&&r[0]==='S'){quns=Number(r[1])||5;fg=Number(r[2])||0;}}
  /* SHQueryUserNotificationState: 2 busy (full-screen app), 3 Direct3D full screen, 4 presentation mode */
  gate={pause:(!!game&&fg===game)||quns===2||quns===3||quns===4,limit:game?1:size};}
 beat();
 for(const it of items){
  for(;;){await refresh();if(gate.pause){if(!paused){paused=true;beat();}await tick(2000);lastState=0;continue;}if(paused){paused=false;beat();}
   if(pool.idle(gate.limit)||!pool.live())break;await Promise.race([...inflight,tick(500)]);}
  if(!pool.live())break;
  let f=null;try{f=itemFile(root,exe,it);}catch{}
  const t=f&&thumbOf(root,f,THUMB);if(!t){failed.push(itemKey(it));done++;continue;}
  if(readMeta(root)[t.k]&&fs.existsSync(t.out)){done++;continue;}
  fs.mkdirSync(thumbsDir(root),{recursive:true});const w=pool.idle(gate.limit);
  const p=pool.thumb(w,{mode:'thumb',in:f,out:t.out,max:THUMB}).then(r=>{inflight.delete(p);done++;
   if(r&&r[1]==='ok')noteThumbs(root,[{k:t.k,w:Number(r[2])||0,h:Number(r[3])||0,out:t.out}]);else if(r)failed.push(itemKey(it));beat();});
  inflight.add(p);await new Promise(r=>setImmediate(r));}
 await Promise.all(inflight);clearInterval(heart);pool.close();noteFailed(root,exe,failed);}
function split(root,g){
 const list=sources(root,g),files=new Map(),later=[],need=[],cg=require('./game-cg.cjs'),failed=readFailed(root,g.executable),meta=readMeta(root);
 for(const s of list){const f=s.file||cg.cachedPicture(root,g.executable,s.name);
  if(f&&cachedThumbs(root,[f],THUMB,meta).size){files.set(s.id,f);continue;}
  const it=f?{file:f}:s.name;if(failed.has(itemKey(it)))continue;(s.source==='save'?later:need).push({s,it});}
 return {list,files,later,need};}
/* a handful of the player's own files (cover, scene shots) are drawn inline; save CGs and anything more go to the
   worker. known: ids the page already shows, sent back without their picture (the page keeps its copy) */
function unlocked(db,root,gameId,known){
 const g=gameRow(db,gameId);let {list,files,later,need}=split(root,g);
 if(need.length&&need.length<=6){const th=scaled(root,need.map(n=>n.it.file),THUMB);for(const n of need)if(th.get(n.it.file))files.set(n.s.id,n.it.file);need=[];}
 const queue=[...need,...later];if(queue.length)spawnWarm(root,g.executable,queue.map(n=>n.it));
 const th=cachedThumbs(root,[...files.values()],THUMB),have=new Set(Array.isArray(known)?known.map(String):[]);
 /* group: the scene a save CG belongs to (the page shows one picture per scene and opens the variants on demand);
    a CG whose picture is byte-identical to one already listed is left out */
 const shown=new Set();
 return list.flatMap(s=>{const t=th.get(files.get(s.id));if(!t)return [];if(s.kind==='cg'&&t.hash){if(shown.has(t.hash))return [];shown.add(t.hash);}
  return [{id:s.id,kind:s.kind,source:s.source,...(s.group?{group:s.group}:{}),src:have.has(s.id)?'':dataUrl(t.out),w:t.w,h:t.h}];});}
/* pending: pictures still on their way (total: every picture, for an honest count); paused while the game or a
   full-screen program is in front */
function pending(db,root,gameId){const g=gameRow(db,gameId),{list,later,need}=split(root,g),q=[...need,...later];if(q.length)spawnWarm(root,g.executable,q.map(n=>n.it));
 const w=q.length?readWarm(root,g.executable):null;return {pending:q.length,total:list.length,paused:!!w?.paused};}
/* one unlocked picture at viewing size, for the framing step */
function image(db,root,gameId,srcId){
 const g=gameRow(db,gameId),s=sources(root,g).find(x=>x.id===String(srcId||''));if(!s)throw Error('CARD_SOURCE_LOCKED');
 const f=fileOf(root,g,s),t=f&&scaled(root,[f],VIEW).get(f);if(!t)throw Error('CARD_SOURCE_UNREADABLE');return {id:s.id,src:dataUrl(t.out),w:t.w,h:t.h};}

function games(db,root){
 const store=require('./store.cjs'),out=[];
 for(const g of store.games(db,root)){if(g.hidden)continue;const row=db.prepare('SELECT id,title,executable,cover FROM games WHERE id=?').get(g.id);let n=0;try{n=sources(root,row,{settle:false}).length;}catch{}
  if(n)out.push({gameId:g.id,title:g.title,cover:g.cover||'',unlockedCount:n});}
 return out;}

/* ---- cards ---- */
const initialOf=t=>{const c=[...String(t||'').trim()][0]||'?';return c.toUpperCase();};
const num=(v,d,lo,hi)=>{const n=Number(v);return Number.isFinite(n)?Math.min(hi,Math.max(lo,n)):d;};
function publicCard(root,c){const img=path.join(dirOf(root),'img');return {id:c.id,gameId:c.gameId,title:c.title,initial:c.initial,kind:c.kind,source:c.source,srcId:c.srcId,src:dataUrl(path.join(img,c.face)),w:c.w,h:c.h,fullW:c.fullW,fullH:c.fullH,still:c.still,finish:c.finish||'plain',createdAt:c.createdAt};}
function state(root){const s=readState(root);return {toploaders:s.toploaders,cards:s.cards.map(c=>publicCard(root,c)),mode:s.mode};}
function create(db,root,req){
 const g=gameRow(db,req.gameId),srcId=String(req.srcId||'');
 const s=sources(root,g).find(x=>x.id===srcId);if(!s)throw Error('CARD_SOURCE_LOCKED');
 if(req.kind&&req.kind!==s.kind)throw Error('CARD_KIND_MISMATCH');
 const file=fileOf(root,g,s);if(!file)throw Error('CARD_SOURCE_UNREADABLE');
 const st=req.still||{},still={x:num(st.x,0.5,0,1),y:num(st.y,0.5,0,1),scale:num(st.scale,1,1,8)};
 /* the card's finish: plain, 'shine' (闪卡) or 'holo' (镭射); drawn by the page, nothing is baked into the picture */
 const finish=req.finish==='shine'||req.finish==='holo'?req.finish:'plain';
 const id=newId('c'),img=path.join(dirOf(root),'img');fs.mkdirSync(img,{recursive:true});
 const face=id+'-face.jpg',full=id+'-full.jpg';
 let card;
 try{
  const res=runner([{mode:'crop',in:file,out:path.join(img,face),x:still.x,y:still.y,scale:still.scale,w:FACE_W,h:FACE_H},{mode:'thumb',in:file,out:path.join(img,full),max:FULL}]);
  if(!res[0]?.ok||!res[1]?.ok)throw Error('CARD_IMAGE_FAILED');
  const k=Math.min(1,FULL/Math.max(res[1].w,res[1].h));
  card={id,gameId:g.id,title:g.title,initial:initialOf(g.title),kind:s.kind,source:s.source,srcId,face,full,w:FACE_W,h:FACE_H,fullW:Math.round(res[1].w*k),fullH:Math.round(res[1].h*k),still,finish,createdAt:Date.now()};
  mutate(root,x=>{x.cards.push(card);});
 }catch(error){
  // card-image.ps1 writes each JPEG to its .tmp sibling before moving it into place.
  for(const f of [face,full,face+'.tmp',full+'.tmp'])try{fs.rmSync(path.join(img,f),{force:true});}catch{}
  throw error;
 }
 return publicCard(root,card);}
function full(root,cardId){const s=readState(root),c=s.cards.find(x=>x.id===cardId);if(!c)throw Error('CARD_NOT_FOUND');return {id:c.id,full:dataUrl(path.join(dirOf(root),'img',path.basename(c.full))),w:c.fullW,h:c.fullH};}
function remove(root,cardId){
 const c=mutate(root,s=>{const c=s.cards.find(x=>x.id===cardId);if(!c)throw Error('CARD_NOT_FOUND');s.cards=s.cards.filter(x=>x!==c);for(const t of s.toploaders)if(t.cardId===cardId)t.cardId=null;return c;});
 for(const f of [c.face,c.full])try{fs.rmSync(path.join(dirOf(root),'img',path.basename(f)),{force:true});}catch{}return state(root);}
function insert(root,toploaderId,cardId){mutate(root,s=>{const t=s.toploaders.find(x=>x.id===toploaderId);if(!t)throw Error('TOPLOADER_NOT_FOUND');if(!s.cards.some(c=>c.id===cardId))throw Error('CARD_NOT_FOUND');if(t.cardId&&t.cardId!==cardId)throw Error('TOPLOADER_FULL');
 for(const o of s.toploaders)if(o.cardId===cardId)o.cardId=null;t.cardId=cardId;});return state(root);}
function eject(root,toploaderId){mutate(root,s=>{const t=s.toploaders.find(x=>x.id===toploaderId);if(!t)throw Error('TOPLOADER_NOT_FOUND');t.cardId=null;});return state(root);}
/* a made card's finish can be changed later: plain, shine (闪卡) or holo (镭射) */
function setFinish(root,cardId,finish){const f=finish==='shine'||finish==='holo'?finish:'plain';mutate(root,s=>{const c=s.cards.find(x=>x.id===cardId);if(!c)throw Error('CARD_NOT_FOUND');c.finish=f;});return state(root);}
function addToploaders(root,count){const n=Math.floor(num(count,1,1,100));mutate(root,s=>{if(s.toploaders.length+n>MAX_TOPLOADERS)throw Error('TOPLOADER_LIMIT');for(let i=0;i<n;i++)s.toploaders.push({id:newId('t'),cardId:null,order:s.toploaders.length});});return state(root);}
function setMode(root,mode){if(mode!=='a'&&mode!=='b')throw Error('INVALID_MODE');mutate(root,s=>{s.mode=mode;});return state(root);}

function handle(db,root,r){
 switch(r.action){
  case 'cards_state':return state(root);
  case 'cards_games':return games(db,root);
  case 'cards_unlocked':return unlocked(db,root,r.gameId,r.known);
  case 'cards_pending':return pending(db,root,r.gameId);
  case 'cards_image':return image(db,root,r.gameId,r.srcId);
  case 'cards_create':return create(db,root,r);
  case 'cards_full':return full(root,String(r.cardId||''));
  case 'cards_delete':return remove(root,String(r.cardId||''));
  case 'cards_insert':return insert(root,String(r.toploaderId||''),String(r.cardId||''));
  case 'cards_eject':return eject(root,String(r.toploaderId||''));
  case 'cards_add_toploaders':return addToploaders(root,r.count);
  case 'cards_set_finish':return setFinish(root,String(r.cardId||''),r.finish);
  case 'cards_set_mode':return setMode(root,r.mode);
 }
 throw Error('UNKNOWN_ACTION');}
module.exports={handle,state,games,unlocked,image,create,sources,noteSeen,readState,_setRunner:f=>{runner=f;},_setSpawnWarm:f=>{spawnWarm=f;},warm,warmRun,noteGame,DEFAULT_TOPLOADERS};
if(require.main===module&&process.argv[2]==='--warm'){setTimeout(()=>process.exit(0),30*60000).unref();try{const j=JSON.parse(fs.readFileSync(process.argv[3],'utf8'));warmRun(j.root,j.exe,j.items||j.names||[]).catch(()=>{}).finally(()=>{try{fs.rmSync(warmFile(j.root,j.exe),{force:true});fs.rmSync(process.argv[3],{force:true});}catch{}process.exit(0);});}catch{}}
