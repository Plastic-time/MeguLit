'use strict';
const fs=require('node:fs'),path=require('node:path'),{createHash}=require('node:crypto'),{Readable,Transform}=require('node:stream'),{pipeline}=require('node:stream/promises'),manifest=require('./speech-model.json');
async function prepareSpeechModel(log=()=>{}){
 const base=path.join(process.env.APPDATA||path.join(process.env.USERPROFILE,'AppData/Roaming'),'AivisSpeech-Engine/BertModelCaches/models--'+manifest.repository.replace('/','--')),snapshot=path.join(base,'snapshots',manifest.revision);
 fs.mkdirSync(snapshot,{recursive:true});
 for(const item of manifest.files){const target=path.join(snapshot,item.name);let ready=false;try{const stat=fs.lstatSync(target);ready=stat.isFile()&&!stat.isSymbolicLink()&&await matches(target,item);}catch{}if(ready)continue;
  const tmp=target+'.tomoyo-download';let copied=false;try{const resolved=fs.realpathSync(target);if(resolved.startsWith(base+path.sep)&&await matches(resolved,item)){fs.copyFileSync(resolved,tmp);copied=true;}}catch{}
  if(!copied){log('Preparing speech model: '+item.name);const url='https://huggingface.co/'+manifest.repository+'/resolve/'+manifest.revision+'/'+item.name,response=await fetch(url,{signal:AbortSignal.timeout(180000)});if(!response.ok||!response.body)throw Error('语音模型下载失败：'+item.name+' HTTP '+response.status);const hash=createHash('sha256');let size=0;const verify=new Transform({transform(chunk,encoding,done){size+=chunk.length;if(size>item.size){done(Error('语音模型大小超出预期'));return;}hash.update(chunk);done(null,chunk);}});await pipeline(Readable.fromWeb(response.body),verify,fs.createWriteStream(tmp));if(size!==item.size||hash.digest('hex')!==item.sha256)throw Error('语音模型校验失败：'+item.name);}
  else if(createHash('sha256').update(fs.readFileSync(tmp)).digest('hex')!==item.sha256)throw Error('语音模型缓存校验失败：'+item.name);
  try{if(fs.lstatSync(target).isSymbolicLink())fs.renameSync(target,target+'.link-backup-'+Date.now());}catch{}fs.renameSync(tmp,target);
 }
 fs.mkdirSync(path.join(base,'refs'),{recursive:true});fs.writeFileSync(path.join(base,'refs/main'),manifest.revision);log('Speech model cache verified');return snapshot;
}
async function matches(file,item){if(fs.statSync(file).size!==item.size)return false;const hash=createHash('sha256');for await(const chunk of fs.createReadStream(file))hash.update(chunk);return hash.digest('hex')===item.sha256;}
module.exports={prepareSpeechModel};
