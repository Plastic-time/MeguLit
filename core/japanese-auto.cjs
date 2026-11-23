'use strict';
/* E590 automatic Japanese: a localized build (Steam zh/en, fan patch) whose folder still holds the Japanese data is switched to
   Japanese without the user opening 工具 › 日文原版恢复. Same detection and writers as that tool (core/japanese-restore.cjs).
   Order: the game's own language setting (no game file touched) > a read redirect at launch (plug-in, see registerRedirect) >
   the file restore (backup first, verified on the next launch, reverted when the game did not start or the table is bad).
   No Japanese data in the folder: nothing automatic. A user undo or an automatic revert is final for that game. */
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const STATE='japanese-auto.json';
const sha=b=>crypto.createHash('sha256').update(b).digest('hex');
const jr=()=>require('./japanese-restore.cjs');
const redirects=[];
const AUTO_ADAPTERS=new Set(['language-switch','siglus-dbs','yuris-update']);
const NO_TEXT_GRACE=15000;
/* a provider redirects the game's reads to the Japanese data at launch (e.g. the early launcher MeguLitLaunch):
   {name, can(gameDir,detected)->bool, prepare(gameDir,detected)->launch options}. None is registered on this line yet. */
function registerRedirect(p){if(p&&typeof p.can==='function'&&!redirects.includes(p))redirects.push(p);return ()=>{const i=redirects.indexOf(p);if(i>=0)redirects.splice(i,1);};}
function redirectFor(gameDir,d){return redirects.find(p=>{try{return p.can(gameDir,d);}catch{return false;}})||null;}

function file(root){return path.join(root,STATE);}
function read(root){try{const s=JSON.parse(fs.readFileSync(file(root),'utf8'));return {enabled:s.enabled!==false,games:s.games&&typeof s.games==='object'?s.games:{},notices:Array.isArray(s.notices)?s.notices:[]};}catch{return {enabled:true,games:{},notices:[]};}}
function write(root,s){fs.mkdirSync(root,{recursive:true});const f=file(root),tmp=f+'.tmp';fs.writeFileSync(tmp,JSON.stringify(s,null,1));fs.renameSync(tmp,f);return s;}
function update(root,id,fn){const s=read(root),g={...(s.games[id]||{})};fn(g,s);s.games[id]=g;write(root,s);return g;}

/* what the existing check says, as one of: setting | redirect | files | already | applied | none | wait */
function decide(gameDir,options={}){
 let d;try{d=jr().detect(gameDir,options);}catch(error){return {action:'none',reason:'DETECT_FAILED',error:String(error?.message||error)};}
 if(d.state==='already')return {action:'already',detected:d};
 if(d.state==='applied')return {action:'applied',detected:d};
 if(d.state==='steam-guide'||d.state==='first-run')return {action:'wait',detected:d}; /* Steam must be closed / the game must write its config once */
 if(d.state!=='restorable'){const hidden=hiddenJapanese(gameDir);return hidden?{action:'unsupported',reason:hidden,detected:d}:{action:'none',detected:d};}
 /* E595 a patch over the release is only turned off when the user asks (日文原版恢复 › 恢复日文) */
 if(d.adapter==='overlay-patch')return {action:'unsupported',reason:'OVERLAY_PATCH_MANUAL',detected:d};
 /* E598 only writers proven on real installs run unasked; the rest stay in 工具 › 日文原版恢复 (Artemis turned the user's
    Steam The Shell black at boot) */
 if(!AUTO_ADAPTERS.has(d.adapter))return {action:'unsupported',reason:'MANUAL_ONLY',detected:d};
 if(d.adapter==='language-switch')return {action:'setting',detected:d};
 const r=redirectFor(gameDir,d);
 return r?{action:'redirect',provider:r.name,detected:d}:{action:'files',detected:d};
}

/* Japanese in the data but no switch MeguLit can make yet (Steam The Shell: Artemis .ast hold ja/en/cn/tw, the
   language list and the pluto save offer no Japanese). The reader still reads the Japanese lines (E352). */
function hiddenJapanese(gameDir){
 let names=[];try{names=fs.readdirSync(gameDir).filter(n=>/\.pfs$/i.test(n));}catch{return '';}
 const sc=require('../services/original-engines/scenes.cjs');
 for(const n of names){let t;try{t=sc.pfsList(path.join(gameDir,n));}catch{continue;}if(!t)continue;
  for(const e of t.files.filter(e=>/\.ast$/i.test(e.name)).slice(0,6)){let text='';try{text=sc.pfsRead(path.join(gameDir,n),e,t.key).toString('utf8');}catch{continue;}
   if(/\bja\s*=\s*\{[^]{0,400}?[ぁ-ヿ]/.test(text)&&/\b(en|cn|tw)\s*=\s*\{/.test(text))return 'ARTEMIS_MULTILANG';}}
 return '';
}
function allowed(root,id){const s=read(root),g=s.games[id]||{};
 if(!s.enabled)return 'GLOBAL_OFF';if(g.off)return 'GAME_OFF';if(g.state==='undone')return 'USER_UNDID';if(g.state==='reverted')return 'AUTO_REVERTED';if(g.state==='auto')return 'ALREADY_AUTO';return '';}

/* trigger: 'scan' | 'launch'. Returns what happened; never throws. */
function run(root,id,gameDir,{options={},trigger='scan',apply}={}){
 id=String(id);const blocked=allowed(root,id);if(blocked)return {done:false,reason:blocked};
 const plan=decide(gameDir,options);
 if(['already','none','wait','applied','unsupported'].includes(plan.action)){
  update(root,id,g=>{g.checked=new Date().toISOString();g.found=plan.action==='none'?'no-japanese':plan.action==='already'?'japanese':plan.action;});
  return {done:false,reason:plan.action};}
 if(plan.action==='redirect'){update(root,id,g=>Object.assign(g,{state:'auto',mode:'redirect',provider:plan.provider,at:new Date().toISOString(),launch:''}));return notice(root,id,{done:true,mode:'redirect',trigger});}
 let result;try{result=(apply||jr().apply)(gameDir,options);}catch(error){if(error.message==='JAPANESE_REPAIR_BLOCKED')throw error;update(root,id,g=>{g.lastError=String(error?.message||error).slice(0,160);g.checked=new Date().toISOString();});return {done:false,reason:'APPLY_FAILED',error:String(error?.message||error)};}
 const mode=plan.action==='setting'?'setting':'files';
 update(root,id,g=>Object.assign(g,{state:'auto',mode,adapter:plan.detected.adapter,dir:path.resolve(gameDir),at:new Date().toISOString(),launch:''}));
 return notice(root,id,{done:true,mode,trigger,result});
}
function notice(root,id,r){const s=read(root);s.notices=[{id,at:new Date().toISOString(),mode:r.mode},...s.notices.filter(n=>n.id!==id)].slice(0,50);write(root,s);return r;}
function takeNotices(root){const s=read(root),out=s.notices;if(out.length){s.notices=[];write(root,s);}return out;}

/* is the table MeguLit wrote still readable and unshared (E278: Siglus crashed on shared strings) */
function verifyFiles(gameDir){
 const J=jr(),m=J._internal.readManifest(path.resolve(gameDir));if(!m)return {ok:false,reason:'MANIFEST_MISSING'};
 if(m.adapter==='artemis-pfs')return require('./artemis-language.cjs').verify(gameDir);
 if(m.adapter!=='siglus-dbs')return {ok:true};
 const dat=path.join(gameDir,'dat');
 for(const e of m.files){if(e.kind==='chinese-source')continue;const f=path.join(dat,e.file);let buf;try{buf=fs.readFileSync(f);}catch{return {ok:false,reason:'FILE_MISSING',file:e.file};}
  if(sha(buf)!==e.patchedSha256)continue; /* changed by an update or another tool: not ours to judge */
  try{const {marker,raw}=J._internal.decrypt(buf),t=J._internal.parse(raw,marker);if(!t.rows||!t.cols)return {ok:false,reason:'TABLE_EMPTY',file:e.file};}catch{return {ok:false,reason:'TABLE_UNREADABLE',file:e.file};}
  try{if(J._internal.sharedPool(f))return {ok:false,reason:'SHARED_STRINGS',file:e.file};}catch{return {ok:false,reason:'TABLE_UNREADABLE',file:e.file};}}
 return {ok:true};
}
/* launch preflight: a file switch that never reached a game window last time, or a bad table, is put back */
function selfCheck(root,id,gameDir,{restore,options={}}={}){
 id=String(id);const g=read(root).games[id];if(!g||g.state!=='auto'||g.mode!=='files')return {checked:false};
 let why='';
 /* E598 a window alone is not a working game (black screen): only text read from it is */
 if(g.launch==='pending'||g.launch==='failed'||g.launch==='window')why=g.launch==='window'?'NO_TEXT':'LAUNCH_FAILED';
 else{const v=verifyFiles(gameDir);if(!v.ok)why=v.reason;}
 if(!why){update(root,id,x=>{x.launch='pending';});return {checked:true,ok:true};}
 try{(restore||jr().restore)(gameDir,options);}catch(error){if(error.message==='JAPANESE_REPAIR_BLOCKED')throw error;update(root,id,x=>{x.launch='';x.lastError=String(error?.message||error).slice(0,160);});return {checked:true,ok:false,reverted:false,reason:why,error:String(error?.message||error)};}
 update(root,id,x=>Object.assign(x,{state:'reverted',reason:why,launch:'',at:new Date().toISOString()}));
 return {checked:true,ok:false,reverted:true,reason:why};
}
/* the launch reached a game window (ok) or failed before it */
function launchResult(root,id,ok){id=String(id);const g=read(root).games[id];if(!g||g.state!=='auto'||g.launch!=='pending')return;update(root,id,x=>{x.launch=ok?'window':'failed';if(ok)x.windowAt=Date.now();});}
/* E598 the game showed text after the switch: it works */
function textSeen(root,id){id=String(id);const g=read(root).games[id];if(!g||g.state!=='auto'||!['pending','window'].includes(g.launch))return false;update(root,id,x=>{x.launch='ok';});return true;}
/* E598 the game was closed without one line of text after a file switch (black screen, hang): put the files back at once
   and say so, instead of leaving the user to rename files */
function gameClosed(root,id,{restore,now=Date.now(),options={}}={}){id=String(id);const g=read(root).games[id];
 if(!g||g.state!=='auto'||g.mode!=='files'||g.launch!=='window'||!g.dir||now-(g.windowAt||now)<NO_TEXT_GRACE)return {reverted:false};
 try{(restore||jr().restore)(g.dir,options);}catch(error){update(root,id,x=>{x.lastError=String(error?.message||error).slice(0,160);});return {reverted:false,error:String(error?.message||error)};}
 update(root,id,x=>Object.assign(x,{state:'reverted',reason:'NO_TEXT',launch:'',at:new Date().toISOString()}));
 const s=read(root);s.notices=[{id,at:new Date().toISOString(),mode:'reverted'},...s.notices.filter(n=>n.id!==id)].slice(0,50);write(root,s);return {reverted:true};}

/* user undo from the notice or the tool: final for this game */
function undo(root,id,gameDir,{restore,options={}}={}){
 id=String(id);const g=read(root).games[id];
 if(g?.mode!=='redirect')(restore||jr().restore)(gameDir,options);
 update(root,id,x=>Object.assign(x,{state:'undone',launch:'',at:new Date().toISOString()}));
 const s=read(root);s.notices=s.notices.filter(n=>n.id!==id);write(root,s);return {ok:true};
}
function setEnabled(root,on){const s=read(root);s.enabled=on!==false;write(root,s);return {enabled:s.enabled};}
function setGameOff(root,id,off){return update(root,String(id),g=>{g.off=!!off;});}
/* 自动已恢复 / 已是日文 / 没有日文数据 for the tool and the game page */
function status(root,id,gameDir,options={}){
 const s=read(root),g=s.games[String(id)]||{},base={enabled:s.enabled,gameOff:!!g.off,mode:g.mode||'',at:g.at||'',reason:g.reason||''};
 if(['auto','reverted','undone'].includes(g.state))return {...base,state:g.state};
 const p=decide(gameDir,options);
 /* E592 a translation launcher next to the Japanese data: the same answer the restore tool gives */
 if(['none','unsupported'].includes(p.action)&&options.executable){const tl=require('./translated-launcher.cjs').inspect(options.executable);if(tl.translated)return {...base,state:'translated',original:tl.original};}
 return {...base,state:p.action==='already'?'japanese':p.action==='none'?'no-japanese':p.action==='applied'?'manual':p.action==='unsupported'?'unsupported':'available',detail:p.reason||''};
}
module.exports={decide,run,selfCheck,launchResult,textSeen,gameClosed,AUTO_ADAPTERS,undo,status,setEnabled,setGameOff,takeNotices,registerRedirect,verifyFiles,read,_internal:{allowed,file}};
