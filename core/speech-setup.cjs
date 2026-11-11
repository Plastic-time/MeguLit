'use strict';
const fs=require('node:fs'),path=require('node:path'),{createHash}=require('node:crypto'),{Readable,Transform}=require('node:stream'),{pipeline}=require('node:stream/promises'),manifest=require('./speech-model.json');
// Hugging Face is slow or unreachable from many networks in mainland China (user, 2026-11-08). Try the official host,
// then the hf-mirror.com mirror; a stalled connection (no data for 30 s) moves on to the next source, and a partial
// download resumes with an HTTP Range request instead of starting over. Every byte is still checked against SHA-256.
/* E443 dl.megulit.com/hf mirrors the same files from R2 (Cloudflare), for players who reach neither Hugging Face nor hf-mirror */
const SOURCES=['https://huggingface.co','https://hf-mirror.com','https://dl.megulit.com/hf'];let preferred=0;
async function download(item,tmp,log){
 let lastError;
 for(let attempt=0;attempt<SOURCES.length*2;attempt++){
  const source=SOURCES[(preferred+attempt)%SOURCES.length],url=source+'/'+manifest.repository+'/resolve/'+manifest.revision+'/'+item.name;
  let have=0;try{have=fs.statSync(tmp).size;}catch{}if(have>=item.size){fs.rmSync(tmp,{force:true});have=0;}
  const controller=new AbortController();let idle=setTimeout(()=>controller.abort(),30000);
  try{
   log('Downloading speech model '+item.name+' from '+source+(have?' (resuming at '+have+' bytes)':''));
   const response=await fetch(url,{signal:controller.signal,headers:have?{Range:'bytes='+have+'-'}:{}});
   if(!response.ok||!response.body)throw Error('HTTP '+response.status);
   const resumed=have>0&&response.status===206;if(!resumed)have=0;
   const hash=createHash('sha256');if(resumed)for await(const chunk of fs.createReadStream(tmp))hash.update(chunk);
   let size=have;const verify=new Transform({transform(chunk,encoding,done){clearTimeout(idle);idle=setTimeout(()=>controller.abort(),30000);size+=chunk.length;if(size>item.size){done(Error('语音模型大小超出预期'));return;}hash.update(chunk);done(null,chunk);}});
   await pipeline(Readable.fromWeb(response.body),verify,fs.createWriteStream(tmp,{flags:resumed?'a':'w'}));
   if(size!==item.size||hash.digest('hex')!==item.sha256){fs.rmSync(tmp,{force:true});throw Error('语音模型校验失败：'+item.name);}
   preferred=SOURCES.indexOf(source);return;
  }catch(error){lastError=error;log('Speech model source failed: '+source+' '+(controller.signal.aborted?'stalled':error.message));}
  finally{clearTimeout(idle);}
 }
 throw Error('语音模型下载失败：'+item.name+'（官方源、国内镜像和 MeguLit 镜像都不可用，请检查网络后重试：'+(lastError?.message||'')+'）');
}
async function prepareSpeechModel(log=()=>{}){
 const base=path.join(process.env.APPDATA||path.join(process.env.USERPROFILE,'AppData/Roaming'),'AivisSpeech-Engine/BertModelCaches/models--'+manifest.repository.replace('/','--')),snapshot=path.join(base,'snapshots',manifest.revision);
 fs.mkdirSync(snapshot,{recursive:true});
 for(const item of manifest.files){const target=path.join(snapshot,item.name);let ready=false;try{const stat=fs.lstatSync(target);ready=stat.isFile()&&!stat.isSymbolicLink()&&await matches(target,item);}catch{}if(ready)continue;
  const tmp=target+'.tomoyo-download';let copied=false;try{const resolved=fs.realpathSync(target);if(resolved.startsWith(base+path.sep)&&await matches(resolved,item)){fs.copyFileSync(resolved,tmp);copied=true;}}catch{}
  if(!copied)await download(item,tmp,log);
  else if(createHash('sha256').update(fs.readFileSync(tmp)).digest('hex')!==item.sha256)throw Error('语音模型缓存校验失败：'+item.name);
  try{if(fs.lstatSync(target).isSymbolicLink())fs.renameSync(target,target+'.link-backup-'+Date.now());}catch{}fs.renameSync(tmp,target);
 }
 fs.mkdirSync(path.join(base,'refs'),{recursive:true});fs.writeFileSync(path.join(base,'refs/main'),manifest.revision);log('Speech model cache verified');return snapshot;
}
async function matches(file,item){if(fs.statSync(file).size!==item.size)return false;const hash=createHash('sha256');for await(const chunk of fs.createReadStream(file))hash.update(chunk);return hash.digest('hex')===item.sha256;}
module.exports={prepareSpeechModel};
