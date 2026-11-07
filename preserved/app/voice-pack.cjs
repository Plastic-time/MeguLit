// SPDX-License-Identifier: GPL-3.0-or-later
// Recommended AivisSpeech voices: four male and four female original characters from AivisHub, all ACML 1.0
// (free to use, no credit required). Downloaded only when the user asks (about 250 MB each), checked against the size
// and SHA-256 that AivisHub publishes, then placed where AivisSpeech Engine loads models at start.
'use strict';
const fs=require('node:fs'),path=require('node:path'),{createHash}=require('node:crypto'),{Readable,Transform}=require('node:stream'),{pipeline}=require('node:stream/promises');
const VOICES=[
 {uuid:'a59cb814-0083-4369-8542-f51a29e72af7',name:'まお',gender:'female',recommended:true},
 {uuid:'22e8ed77-94fe-4ef2-871f-a86f94e9a579',name:'コハク',gender:'female',recommended:true},
 {uuid:'f5017410-fbb5-49e1-97cb-e785f42e15f5',name:'凛音エル',gender:'female'},
 {uuid:'1b2830f4-8cf1-4184-a0d9-3a1bace3a844',name:'みちのくあいり',gender:'female'},
 {uuid:'2e1fdde8-d089-42d7-b64f-cf89952b1bdc',name:'澤原 玄二郎',gender:'male'},
 {uuid:'e40d5b99-8cde-4442-a45b-0ebec9167506',name:'kokuren_voice',gender:'male'},
 {uuid:'6d11c6c2-f4a4-4435-887e-23dd60f8b8dd',name:'にせ',gender:'male'},
 {uuid:'71e72188-2726-4739-9aa9-39567396fb2a',name:'fumifumi',gender:'male'}];
const API='https://api.aivis-project.com/v1/aivm-models/';
const modelsDir=()=>path.join(process.env.APPDATA||path.join(process.env.USERPROFILE||'',"AppData/Roaming"),'AivisSpeech-Engine','Models');
class VoicePack{
 constructor(options={}){this.fetch=options.fetch||fetch;this.dir=options.dir||modelsDir();this.log=options.log||(()=>{});this.job=null;this.jobs=new Map();this.state={running:false,done:0,total:0,current:'',bytes:0,size:0,error:'',installed:[]};this.sweep();}
 // A half-written download left by a crash or a closed app is removed at start; only this pack's own temp names.
 sweep(){for(const v of VOICES){const tmp=path.join(this.dir,v.uuid+'.aivmx.tome-download');if(!this.jobs.has(v.uuid))try{fs.unlinkSync(tmp);}catch{}}}
 installed(){let names=[];try{names=fs.readdirSync(this.dir);}catch{}return VOICES.filter(v=>names.includes(v.uuid+'.aivmx')).map(v=>v.uuid);}
 // Per voice: installed, or its own download job with progress / error (user picks voices one by one, 2026-11-02).
 status(){const installed=this.installed();return {...this.state,installed,voices:VOICES.map(v=>{const job=this.jobs.get(v.uuid);return {name:v.name,gender:v.gender,uuid:v.uuid,recommended:v.recommended===true,installed:installed.includes(v.uuid),running:!!job?.running,bytes:job?.bytes||0,size:job?.size||0,error:job?.error||''};})};}
 // Starts (or joins) the background download of every missing voice; progress is read with status().
 start(onDone){if(this.job)return this.status();const missing=VOICES.filter(v=>!this.installed().includes(v.uuid));this.state={running:true,done:0,total:missing.length,current:'',bytes:0,size:0,error:'',installed:[]};
  this.job=(async()=>{try{fs.mkdirSync(this.dir,{recursive:true});for(const voice of missing){this.state.current=voice.name;await this.download(voice);this.state.done++;}this.state.current='';if(missing.length)await onDone?.();}
   catch(e){this.state.error=String(e.message||e).slice(0,300);this.log('[ToMe] voice pack: '+this.state.error);}finally{this.state.running=false;this.job=null;}})();return this.status();}
 // One voice: its own job and AbortController, so several voices download side by side and each can be cancelled.
 startOne(uuid,onDone){const voice=VOICES.find(v=>v.uuid===uuid);if(!voice)throw Error('未知的声音');if(this.installed().includes(uuid)||this.jobs.get(uuid)?.running)return this.status();
  const job={running:true,bytes:0,size:0,error:'',controller:new AbortController()};this.jobs.set(uuid,job);
  (async()=>{try{fs.mkdirSync(this.dir,{recursive:true});await this.download(voice,job);await onDone?.();}
   catch(e){job.error=job.controller.signal.aborted?'':String(e.message||e).slice(0,300);if(job.error)this.log('[ToMe] voice '+voice.name+': '+job.error);}
   finally{job.running=false;if(!job.error)this.jobs.delete(uuid);}})();return this.status();}
 // Cancel really stops the transfer; download() then deletes the partly written file.
 cancel(uuid){const job=this.jobs.get(uuid);if(job?.running)job.controller.abort();return this.status();}
 // Deletes exactly this voice's model file (all styles of that voice; AIVMX models are per voice). Nothing else in the
 // engine's folder is touched. The engine must not hold the file: the caller stops it first and restarts it after.
 remove(uuid){const voice=VOICES.find(v=>v.uuid===uuid);if(!voice)throw Error('未知的声音');if(this.jobs.get(uuid)?.running)throw Error(voice.name+' 正在下载，请先取消');
  const target=path.join(this.dir,voice.uuid+'.aivmx');if(path.dirname(target)!==path.resolve(this.dir))throw Error('路径无效');try{fs.unlinkSync(target);}catch(e){if(e.code!=='ENOENT')throw e;}this.jobs.delete(uuid);this.log('[ToMe] voice removed: '+voice.name);return this.status();}
 async download(voice,job=null){
  const progress=job||this.state,signal=job?AbortSignal.any([job.controller.signal,AbortSignal.timeout(1800000)]):AbortSignal.timeout(1800000);
  const meta=await(await this.fetch(API+voice.uuid,{signal:job?AbortSignal.any([job.controller.signal,AbortSignal.timeout(30000)]):AbortSignal.timeout(30000)})).json();const file=(meta.model_files||[]).find(f=>f.model_type==='AIVMX');
  if(!file||!/^[a-f0-9]{64}$/i.test(String(file.checksum||''))||!(file.file_size>0))throw Error('AivisHub 没有 '+voice.name+' 的 AIVMX 文件信息');
  if(!['ACML 1.0','CC0'].includes(file.license_type))throw Error(voice.name+' 的许可已变为 '+file.license_type+'，已跳过');
  const response=await this.fetch(API+voice.uuid+'/download?model_type=AIVMX',{signal});if(!response.ok||!response.body)throw Error(voice.name+' 下载失败 HTTP '+response.status);
  const target=path.join(this.dir,voice.uuid+'.aivmx'),tmp=target+'.tome-download',hash=createHash('sha256');progress.bytes=0;progress.size=file.file_size;
  const count=new Transform({transform:(chunk,encoding,done)=>{progress.bytes+=chunk.length;if(progress.bytes>file.file_size){done(Error(voice.name+' 大小超出预期'));return;}hash.update(chunk);done(null,chunk);}});
  try{await pipeline(Readable.fromWeb(response.body),count,fs.createWriteStream(tmp),{signal});if(progress.bytes!==file.file_size||hash.digest('hex')!==String(file.checksum).toLowerCase())throw Error(voice.name+' 校验失败');fs.renameSync(tmp,target);this.log('[ToMe] voice installed: '+voice.name);}
  catch(e){try{fs.unlinkSync(tmp);}catch{}throw e;}}
}
module.exports={VoicePack,VOICES};
