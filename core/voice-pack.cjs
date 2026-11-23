// SPDX-License-Identifier: GPL-3.0-or-later
// Recommended AivisSpeech voices: four male and four female original characters from AivisHub, all ACML 1.0
// (free to use, no credit required). Each download is checked against the size and SHA-256 that AivisHub publishes.
'use strict';
const fs=require('node:fs'),path=require('node:path');
const VOICES=[
 {uuid:'a59cb814-0083-4369-8542-f51a29e72af7',name:'まお',gender:'female',recommended:true,bundledDefault:true},
 {uuid:'22e8ed77-94fe-4ef2-871f-a86f94e9a579',name:'コハク',gender:'female',recommended:true,bundledDefault:true},
 {uuid:'f5017410-fbb5-49e1-97cb-e785f42e15f5',name:'凛音エル',gender:'female'},
 {uuid:'1b2830f4-8cf1-4184-a0d9-3a1bace3a844',name:'みちのくあいり',gender:'female'},
 {uuid:'2e1fdde8-d089-42d7-b64f-cf89952b1bdc',name:'澤原 玄二郎',gender:'male'},
 {uuid:'e40d5b99-8cde-4442-a45b-0ebec9167506',name:'kokuren_voice',gender:'male'},
 {uuid:'6d11c6c2-f4a4-4435-887e-23dd60f8b8dd',name:'にせ',gender:'male'},
 {uuid:'71e72188-2726-4739-9aa9-39567396fb2a',name:'fumifumi',gender:'male'}];
const API='https://api.aivis-project.com/v1/aivm-models/';
const modelsDir=()=>path.join(process.env.APPDATA||path.join(process.env.USERPROFILE||'',"AppData/Roaming"),'AivisSpeech-Engine','Models');
class VoicePack{
 async fetchVoice(url,options){
  for(let attempt=0;;attempt++){
   const response=await this.fetch(url,options);
   if(response.status!==429||attempt>=2)return response;
   const header=response.headers?.get?.('retry-after');
   const delay=header==null?1000*(2**attempt):/^\d+$/.test(header)?Number(header)*1000:Date.parse(header)-Date.now();
   // Let the caller surface long cooldowns instead of retrying before the server permits.
   if(!Number.isFinite(delay)||delay>30000)return response;
   await response.body?.cancel?.();
   await require('node:timers/promises').setTimeout(Math.max(0,delay),undefined,{signal:options.signal});
  }
 }
 constructor(options={}){this.fetch=options.fetch||fetch;this.dir=options.dir||modelsDir();this.log=options.log||(()=>{});this.job=null;this.jobs=new Map();this.state={running:false,done:0,total:0,current:'',bytes:0,size:0,error:'',installed:[]};this.sweep();}
 // A half-written download left by a crash or a closed app is removed at start; only this pack's own temp names.
 sweep(){for(const v of VOICES){const tmp=path.join(this.dir,v.uuid+'.aivmx.tome-download');if(!this.jobs.has(v.uuid))try{fs.unlinkSync(tmp);}catch{}}}
 installed(){let names=[];try{names=fs.readdirSync(this.dir);}catch{}return VOICES.filter(v=>names.includes(v.uuid+'.aivmx')).map(v=>v.uuid);}
 // Per voice: installed, or its own download job with progress / error (user picks voices one by one, 2026-11-02).
 status(){const installed=this.installed(),current=this.jobs.get(this.currentUuid);return {...this.state,bytes:current?.bytes??this.state.bytes,size:current?.size??this.state.size,installed,voices:VOICES.map(v=>{const job=this.jobs.get(v.uuid);return {name:v.name,gender:v.gender,uuid:v.uuid,recommended:v.recommended===true,installed:installed.includes(v.uuid),running:!!job?.running,bytes:job?.bytes||0,size:job?.size||0,error:job?.error||''};})};}
 // Starts (or joins) the background download of every missing voice; progress is read with status().
 start(onDone){if(this.job)return this.status();const missing=VOICES.filter(v=>!this.installed().includes(v.uuid));this.state={running:true,done:0,total:missing.length,current:'',bytes:0,size:0,error:'',installed:[]};
  if(!missing.length){this.state.running=false;return this.status();}
  this.job=(async()=>{try{for(const voice of missing){
    this.state.current=voice.name;this.currentUuid=voice.uuid;
    this.startOne(voice.uuid);
    const item=this.jobs.get(voice.uuid);await item?.completion;
    if(item?.error)throw Error(item.error);
    if(item?.controller.signal.aborted)break;
    this.state.bytes=item?.bytes||0;this.state.size=item?.size||0;this.state.done++;
   }this.state.current='';if(this.state.done)await onDone?.();}
   catch(e){this.state.error=String(e.message||e).slice(0,300);this.log('[ToMe] voice pack: '+this.state.error);}finally{this.currentUuid=null;this.state.running=false;this.job=null;}})();return this.status();}
 // One voice: its own job and AbortController, so several voices download side by side and each can be cancelled.
 startOne(uuid,onDone){const voice=VOICES.find(v=>v.uuid===uuid);if(!voice)throw Error('未知的声音');if(this.installed().includes(uuid)||this.jobs.get(uuid)?.running)return this.status();
  const job={running:true,bytes:0,size:0,error:'',controller:new AbortController()};this.jobs.set(uuid,job);
  job.completion=(async()=>{try{fs.mkdirSync(this.dir,{recursive:true});await this.download(voice,job);await onDone?.();}
   catch(e){job.error=job.controller.signal.aborted?'':String(e.message||e).slice(0,300);if(job.error)this.log('[ToMe] voice '+voice.name+': '+job.error);}
   finally{job.running=false;if(!job.error)this.jobs.delete(uuid);}})();return this.status();}
 // Cancel really stops the transfer; download() then deletes the partly written file.
 cancel(uuid){const job=this.jobs.get(uuid);if(job?.running)job.controller.abort();return this.status();}
 // Deletes exactly this voice's model file (all styles of that voice; AIVMX models are per voice). Nothing else in the
 // engine's folder is touched. The engine must not hold the file: the caller stops it first and restarts it after.
 remove(uuid){const voice=VOICES.find(v=>v.uuid===uuid);if(!voice)throw Error('未知的声音');if(this.jobs.get(uuid)?.running)throw Error(voice.name+' 正在下载，请先取消');
  const target=path.join(this.dir,voice.uuid+'.aivmx');if(path.dirname(target)!==path.resolve(this.dir))throw Error('路径无效');try{fs.unlinkSync(target);}catch(e){if(e.code!=='ENOENT')throw e;}this.jobs.delete(uuid);this.log('[ToMe] voice removed: '+voice.name);return this.status();}
 async download(voice,job=null,cancel=job?.controller.signal){
  const progress=job||this.state,signal=cancel?AbortSignal.any([cancel,AbortSignal.timeout(1800000)]):AbortSignal.timeout(1800000);
  const metadata=await this.fetchVoice(API+voice.uuid,{signal:cancel?AbortSignal.any([cancel,AbortSignal.timeout(30000)]):AbortSignal.timeout(30000)});if(metadata.ok===false)throw Error(voice.name+' 下载失败 HTTP '+metadata.status);const meta=await metadata.json();const file=(meta.model_files||[]).find(f=>f.model_type==='AIVMX');
  if(!file||!/^[a-f0-9]{64}$/i.test(String(file.checksum||''))||!(file.file_size>0))throw Error('AivisHub 没有 '+voice.name+' 的 AIVMX 文件信息');
  if(!['ACML 1.0','CC0'].includes(file.license_type))throw Error(voice.name+' 的许可已变为 '+file.license_type+'，已跳过');
  const target=path.join(this.dir,voice.uuid+'.aivmx'),tmp=target+'.tome-download';progress.bytes=0;progress.size=file.file_size;
  const endpoint=API+voice.uuid+'/download?model_type=AIVMX',downloader=require('./fast-download.cjs');
  let source=endpoint,renewal,renewed=false;
  const redirected=response=>response.ok&&response.redirected&&response.url?.startsWith('https://')?response.url:'';
  const renewSource=async options=>{
   const response=await this.fetchVoice(endpoint,{...options,headers:{...options.headers,Range:'bytes=0-0'},signal:AbortSignal.any([signal,AbortSignal.timeout(downloader.DEFAULTS.probeCapMs)])});
   const next=redirected(response);
   void response.body?.cancel().catch(()=>{});
   if(!next)return false;
   source=next;renewed=true;
   return true;
  };
  // Reuse the HTTPS URL reached by the initial request so later ranges don't each request a new AivisHub link.
  const fetchModel=async(_url,options)=>{
   const url=source,usedRenewal=renewed,response=await this.fetchVoice(url,options);
   if(url===endpoint){source=redirected(response)||source;return response;}
   if(response.status!==403||usedRenewal)return response;
   void response.body?.cancel().catch(()=>{});
   // Several ranges can receive the same refusal. Share one bounded request for a new link.
   if(!await (renewal??=renewSource(options).catch(()=>false)))return response;
   return this.fetchVoice(source,options);
  };
  try{
   await downloader.download({
    urls:[endpoint],dest:tmp,size:file.file_size,sha256:String(file.checksum).toLowerCase(),
    // Reuse the signed storage URL for ranges and allow the initial connection time to settle.
    probeCapMs:90000,
    fetch:async(url,opts)=>{
     const response=await fetchModel(url,opts);
     if(response.status===429){
      await response.body?.cancel?.();
      throw Object.assign(Error('HTTP 429'),{fatal:true});
     }
     return response;
    },
    signal,onProgress:p=>{progress.bytes=p.received;}
   });
   fs.renameSync(tmp,target);this.log('[ToMe] voice installed: '+voice.name);
  }catch(e){
   const corrupt=['HASH_MISMATCH','SIZE_MISMATCH'].includes(e.code);
   // Explicit cancellation discards the download. Transport errors keep the hash-bound Range checkpoint for retry.
   if(corrupt||e.last?.status===403||/HTTP 403/.test(e.last?.message||'')||job?.controller.signal.aborted){
    for(const f of [tmp,tmp+'.part',tmp+'.part.json'])try{fs.unlinkSync(f);}catch{}
   }
   if(corrupt)throw Error(voice.name+' 校验失败');
   if(e.code==='DOWNLOAD_FAILED')throw Error(voice.name+' 下载失败 '+String(e.last?.message||e.message));
   throw e;
  }
 }
}

// Use the bundled defaults for an empty folder or a first-run publication we previously started.
async function prepareDefaultVoices({fetch,signal,dir=modelsDir()}){
 signal.throwIfAborted();
 fs.mkdirSync(dir,{recursive:true});
 const marker=path.join(dir,'.megulit-default-voices-pending'),voices=VOICES.filter(voice=>voice.bundledDefault);
 const remaining=()=>{
  const installed=new Set(fs.readdirSync(dir,{withFileTypes:true}).filter(entry=>/\.aivmx$/i.test(entry.name)&&!entry.isDirectory()).map(entry=>entry.name.toLowerCase()));
  if(installed.size&&(!fs.existsSync(marker)||[...installed].some(file=>!voices.some(voice=>file===voice.uuid+'.aivmx'))))return [];
  return voices.filter(voice=>!installed.has(voice.uuid+'.aivmx'));
 };
 const missing=remaining();
 if(!missing.length){fs.rmSync(marker,{force:true});return;}
 const stage=fs.mkdtempSync(path.join(dir,'.megulit-first-voices-'));
 try{
  const pack=new VoicePack({dir:stage,fetch});
  for(const voice of missing){signal.throwIfAborted();await pack.download(voice,null,signal);}
  signal.throwIfAborted();
  if(!remaining().length){fs.rmSync(marker,{force:true});return;}
  // Keep enough state to resume an incomplete publish without unlinking a possibly replaced model.
  try{fs.writeFileSync(marker,'',{flag:'wx'});}catch(e){if(e.code!=='EEXIST')throw e;}
  for(const voice of missing){
   const file=voice.uuid+'.aivmx';
   // Publish a complete model without replacing a file installed by another downloader.
   try{fs.linkSync(path.join(stage,file),path.join(dir,file));}catch(e){if(e.code!=='EEXIST')throw e;}
  }
  if(!remaining().length)fs.rmSync(marker,{force:true});
 }finally{fs.rmSync(stage,{recursive:true,force:true});}
}
module.exports={VoicePack,VOICES,prepareDefaultVoices};
