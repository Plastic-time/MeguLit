'use strict';
const fs=require('node:fs'),path=require('node:path'),{createHash}=require('node:crypto'),manifest=require('./speech-model.json');
// Hugging Face is slow or unreachable from many networks in mainland China (user, 2026-11-08). Try the official host,
// then the hf-mirror.com mirror; a stalled connection (no data for 30 s) moves on to the next source, and a partial
// download resumes with an HTTP Range request instead of starting over. Every byte is still checked against SHA-256.
/* E443 dl.megulit.com/hf mirrors the same files from R2 (Cloudflare), for players who reach neither Hugging Face nor hf-mirror */
const SOURCES=['https://huggingface.co','https://hf-mirror.com','https://dl.megulit.com/hf','https://cn-dl.megulit.com/hf'];let preferred=0;
/* 2026-11-19: core/fast-download.cjs measures every source at once and pulls the fast ones in parallel Range pieces; a
   slow or silent connection (15 s) moves to another source and finished pieces survive a retry (<tmp>.part.json). */
async function download(item,tmp,log){
 const urls=SOURCES.map((_,i)=>SOURCES[(preferred+i)%SOURCES.length]+'/'+manifest.repository+'/resolve/'+manifest.revision+'/'+item.name);
 log('Downloading speech model '+item.name);
 try{const r=await require('./fast-download.cjs').download({urls,dest:tmp,size:item.size,sha256:item.sha256,log:line=>log('Speech model '+line)});const used=SOURCES.findIndex(s=>r.sources&&r.sources[0]&&r.sources[0].startsWith(s+'/'));if(used>=0)preferred=used;}
 catch(error){if(/^(HASH|SIZE)_MISMATCH$/.test(error.code||''))throw Error('语音模型校验失败：'+item.name);throw Error('语音模型下载失败：'+item.name+'（官方源、国内镜像和 MeguLit 镜像都不可用，请检查网络后重试：'+String((error.last&&error.last.message)||error.message||'')+'）');}
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
