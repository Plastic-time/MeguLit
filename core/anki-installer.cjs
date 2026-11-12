// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
/* 2026-11-12 (user: a player without Anki only got "find the path in Settings", and the settings looked empty; it must
   be a foolproof one-click install). Downloads the official Anki installer (ankitects/anki GitHub release; the same file
   on MeguLit's mirror first, it is the faster one in China), checks its size and SHA-256 against the release digest,
   runs it with a progress bar (msiexec /passive; Windows may ask for permission once), then installs AnkiConnect and
   starts Anki and connects. Anki 25+ is a launcher that fetches Anki itself on its first start: in China its package
   index is pointed at the Tsinghua PyPI mirror. One job at a time; status() reports where it is. */
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),{spawn}=require('node:child_process'),{Readable,Transform}=require('node:stream'),{pipeline}=require('node:stream/promises');
const PACKAGE={version:'26.09.4',name:'anki-26.09.4-win-x64.msi',size:201621504,sha256:'c35e7b90acf2929a71d70ac755a3dd0685f9fbe1a89d2f9edabb6fe7c0d91cba'};
const SOURCES=['https://dl.megulit.com/files/anki/'+PACKAGE.name,'https://cn-dl.megulit.com/files/anki/'+PACKAGE.name,'https://github.com/ankitects/anki/releases/download/'+PACKAGE.version+'/'+PACKAGE.name];
const inChina=()=>{try{const o=Intl.DateTimeFormat().resolvedOptions();return o.timeZone==='Asia/Shanghai'||o.timeZone==='Asia/Urumqi'||/^zh-CN/i.test(o.locale||'');}catch{return false;}};
let state={phase:'idle',received:0,total:PACKAGE.size,error:''},job=null;
const status=()=>({...state,version:PACKAGE.version});
function log(root,m){try{fs.appendFileSync(path.join(root,'logs','anki-process.log'),new Date().toISOString()+' installer '+m+'\n');}catch{}}
async function download(root,fetcher){
 const dir=path.join(root,'data','cache','anki-installer'),file=path.join(dir,PACKAGE.name),tmp=file+'.part';fs.mkdirSync(dir,{recursive:true});
 const ok=f=>{try{if(fs.statSync(f).size!==PACKAGE.size)return false;const h=crypto.createHash('sha256');h.update(fs.readFileSync(f));return h.digest('hex')===PACKAGE.sha256;}catch{return false;}};
 if(ok(file)){state.received=PACKAGE.size;return file;}
 let last;
 for(const url of SOURCES){const controller=new AbortController();let idle=setTimeout(()=>controller.abort(),30000);
  try{log(root,'download '+url);state.received=0;const r=await fetcher(url,{signal:controller.signal,redirect:'follow'});if(!r.ok||!r.body)throw Error('HTTP '+r.status);
   const hash=crypto.createHash('sha256');let size=0;
   const meter=new Transform({transform(chunk,enc,done){clearTimeout(idle);idle=setTimeout(()=>controller.abort(),30000);size+=chunk.length;state.received=size;if(size>PACKAGE.size)return done(Error('too large'));hash.update(chunk);done(null,chunk);}});
   await pipeline(Readable.fromWeb(r.body),meter,fs.createWriteStream(tmp));
   if(size!==PACKAGE.size||hash.digest('hex')!==PACKAGE.sha256){fs.rmSync(tmp,{force:true});throw Error('checksum');}
   fs.renameSync(tmp,file);return file;}
  catch(e){last=e;log(root,'source failed '+url+' '+(controller.signal.aborted?'stalled':e.message));}finally{clearTimeout(idle);}}
 throw Error('ANKI_DOWNLOAD_FAILED '+(last?.message||''));
}
/* msiexec with its own progress bar; 0 and 3010 (restart later) are success, 1602 is "cancelled" (the permission prompt) */
function runInstaller(root,file){return new Promise((resolve,reject)=>{const child=spawn(path.join(process.env.SystemRoot||'C:\\Windows','System32','msiexec.exe'),['/i',file,'/passive','/norestart'],{windowsHide:false,stdio:'ignore'});
 child.on('error',reject);child.on('exit',code=>{log(root,'msiexec exit '+code);if(code===0||code===3010)resolve();else reject(Error(code===1602||code===1223?'ANKI_INSTALL_CANCELLED':'ANKI_INSTALL_FAILED '+code));});});}
/* start(root,{runtime,fetcher}) begins (or joins) the job: download, install, AnkiConnect, start and connect */
function start(root,{runtime=null,fetcher=fetch,find=()=>require('./anki-process.cjs').find('',process.env),install=runInstaller,china=inChina()}={}){
 if(job)return status();
 state={phase:'downloading',received:0,total:PACKAGE.size,error:''};
 job=(async()=>{try{
   if(!find()){const file=await download(root,fetcher);state.phase='installing';await install(root,file);}
   state.phase='connecting';
   if(!find())throw Error('ANKI_EXECUTABLE_MISSING');
   await require('./anki-process.cjs').installAnkiConnect(process.env,{locate:find,fresh:true}).then(r=>log(root,'ankiconnect '+(r.already?'already there':'installed'))).catch(e=>log(root,'ankiconnect '+e.message));
   if(china){process.env.UV_DEFAULT_INDEX??='https://pypi.tuna.tsinghua.edu.cn/simple';process.env.UV_INDEX_URL??='https://pypi.tuna.tsinghua.edu.cn/simple';}
   if(runtime?.ankiProcess)await runtime.ankiProcess().start({hide:false}).catch(e=>log(root,'start '+e.message));
   state.phase='done';log(root,'done');
  }catch(e){state.phase='error';state.error=String(e.message||e).slice(0,120);log(root,'error '+state.error);}finally{job=null;}})();
 return status();
}
module.exports={start,status,PACKAGE,SOURCES};
