// SPDX-License-Identifier: GPL-3.0-or-later
// Optional runtime packs for the slim release. setup/runtime.json lists each pack (zip of runtime/<...>)
// with its download URLs, SHA-256, download size and unpacked size. The first-launch window installs
// "base" (and optionally the rest); this store lets Settings install the remaining packs later.
'use strict';
const fs=require('node:fs'),path=require('node:path'),{createHash}=require('node:crypto'),{spawn}=require('node:child_process');

const MARKERS={base:'runtime/node.exe',reading:'runtime/reading/sudachidict_full/resources/system.dic',voice:'runtime/aivis/run.exe'};

class RuntimePacks{
 constructor(root){this.root=root;this.jobs={};}
 manifest(){try{return JSON.parse(fs.readFileSync(path.join(this.root,'setup','runtime.json'),'utf8'));}catch{return {packs:{}};}}
 installed(id){const marker=MARKERS[id];return !!marker&&fs.existsSync(path.join(this.root,marker));}
 status(){const m=this.manifest();return {version:m.version||'',packs:Object.entries(m.packs||{}).map(([id,p])=>{const j=this.jobs[id];return {id,size:p.size||0,unpacked:p.unpacked||0,installed:this.installed(id),job:j?{state:j.state,stage:j.stage,received:j.received,total:j.total,error:j.error}:null};})};}
 download(ids){
  const m=this.manifest(),list=(Array.isArray(ids)&&ids.length?ids:Object.keys(m.packs||{})).filter(id=>m.packs?.[id]&&!this.installed(id));
  if(this.running)return this.status();
  for(const id of list)this.jobs[id]={state:'queued',stage:'',received:0,total:m.packs[id].size||0,error:''};
  this.running=(async()=>{for(const id of list){const job=this.jobs[id];if(job.state==='cancelled')continue;try{await this.install(id,m.packs[id],job);job.state='done';}catch(error){if(job.state!=='cancelled'){job.state='error';job.error=String(error.message||error);}}}})().finally(()=>{this.running=null;});
  return this.status();
 }
 cancel(){for(const job of Object.values(this.jobs)){if(['queued','downloading'].includes(job.state)){job.state='cancelled';job.controller?.abort();}}return this.status();}
 async install(id,pack,job){
  const part=path.join(this.root,'runtime-'+id+'.part'),stage=path.join(this.root,'runtime-'+id+'.unpack');
  let lastError=null;
  for(const url of pack.urls||[]){
   job.state='downloading';job.stage='download';job.received=0;job.controller=new AbortController();
   try{
    const res=await fetch(url,{redirect:'follow',signal:job.controller.signal});if(!res.ok||!res.body)throw Error('HTTP '+res.status);
    job.total=Number(res.headers.get('content-length'))||pack.size||0;
    const hash=createHash('sha256'),out=fs.createWriteStream(part);
    for await(const chunk of res.body){if(job.state==='cancelled')throw Error('cancelled');hash.update(chunk);job.received+=chunk.length;if(!out.write(chunk))await new Promise(r=>out.once('drain',r));}
    await new Promise((r,j)=>out.end(e=>e?j(e):r()));
    if(hash.digest('hex').toLowerCase()!==String(pack.sha256).toLowerCase())throw Error('文件校验失败');
    lastError=null;break;
   }catch(error){lastError=error;try{fs.rmSync(part,{force:true});}catch{}if(job.state==='cancelled')throw error;}
  }
  if(lastError)throw lastError;
  job.stage='unpack';
  fs.rmSync(stage,{recursive:true,force:true});fs.mkdirSync(stage,{recursive:true});
  await new Promise((resolve,reject)=>{const p=spawn(path.join(process.env.SystemRoot||'C:\\Windows','System32','tar.exe'),['-xf',part,'-C',stage],{windowsHide:true});p.on('error',reject);p.on('exit',code=>code===0?resolve():reject(Error('解压失败')));});
  const from=path.join(stage,'runtime'),to=path.join(this.root,'runtime');fs.mkdirSync(to,{recursive:true});
  for(const name of fs.readdirSync(from)){const target=path.join(to,name);fs.rmSync(target,{recursive:true,force:true});fs.renameSync(path.join(from,name),target);}
  fs.rmSync(stage,{recursive:true,force:true});fs.rmSync(part,{force:true});
  if(!this.installed(id))throw Error('安装不完整');
 }
}
module.exports={RuntimePacks,MARKERS};
