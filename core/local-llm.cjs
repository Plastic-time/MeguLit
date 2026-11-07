// SPDX-License-Identifier: GPL-3.0-or-later
// Runs the downloaded offline translation models (user, 2026-11-03: Sakura/GalTransl only printed "fetch failed",
// because nothing served http://127.0.0.1:8080; ToMe downloaded the GGUF files but never ran them).
// ToMe now keeps a pinned llama.cpp runtime (official ggml-org release, Vulkan build: one package for NVIDIA, AMD and
// Intel GPUs, falls back to the CPU), starts llama-server with an installed model when a local engine is used and
// nothing answers on its address, and stops it when ToMe exits. A server the user runs on that address is used as is.
'use strict';
const fs=require('node:fs'),path=require('node:path'),{spawn,execFile}=require('node:child_process'),{createHash}=require('node:crypto');

// Pinned build, about two weeks old when chosen; the digest is GitHub's published SHA-256 for this asset.
const RUNTIME={version:'b11765',file:'llama-b11765-bin-win-vulkan-x64.zip',size:36750848,
 url:'https://github.com/ggml-org/llama.cpp/releases/download/b11765/llama-b11765-bin-win-vulkan-x64.zip',
 sha256:'950f31438859814166547b7d70feb3fb3a7afeffc413a95487cd80a98dd05b45'};
// Which installed model a local engine starts with: Galgame models first for Sakura, the general model first otherwise.
const ORDER={sakura:['galtransl4b','sakuragal7b','sakura7b','sakuragal14b','sakura14b','qwen3_8b'],llamacpp:['qwen3_8b','galtransl4b','sakuragal7b','sakura7b','sakuragal14b','sakura14b']};

class LocalLlm{
 constructor({root,models,logs,fetchImpl=globalThis.fetch,spawnImpl=spawn,extract}){
  this.root=root;this.models=models;this.fetch=fetchImpl;this.spawn=spawnImpl;this.dir=path.join(root,'runtime','llama');
  this.logFile=logs?path.join(logs,'local-llm.log'):null;this.job=null;this.server=null;this.starting=null;
  this.extract=extract||((zip,dir)=>new Promise((resolve,reject)=>execFile(path.join(process.env.SystemRoot||'C:\\Windows','System32','tar.exe'),['-xf',zip,'-C',dir],{windowsHide:true},e=>e?reject(e):resolve())));
 }
 log(line){if(!this.logFile)return;try{fs.appendFileSync(this.logFile,new Date().toISOString()+' '+line+'\n');}catch{}}
 exe(){const direct=path.join(this.dir,'llama-server.exe');if(fs.existsSync(direct))return direct;
  try{for(const d of fs.readdirSync(this.dir,{withFileTypes:true}))if(d.isDirectory()){const p=path.join(this.dir,d.name,'llama-server.exe');if(fs.existsSync(p))return p;}}catch{}return '';}
 status(){const j=this.job;return {version:RUNTIME.version,size:RUNTIME.size,installed:!!this.exe(),running:!!this.server,starting:!!this.starting,model:this.server?.model||'',job:j?{state:j.state,received:j.received,total:j.total,error:j.error}:null};}
 download(){
  if(this.job?.state==='downloading')return this.status();
  const controller=new AbortController(),job={state:'downloading',received:0,total:RUNTIME.size,error:'',controller};this.job=job;
  const zip=path.join(this.root,'runtime',RUNTIME.file+'.part'),stage=this.dir+'.new';
  (async()=>{try{
    fs.mkdirSync(path.dirname(zip),{recursive:true});
    const res=await this.fetch(RUNTIME.url,{redirect:'follow',signal:controller.signal});if(!res.ok||!res.body)throw Error('HTTP '+res.status);
    const hash=createHash('sha256'),out=fs.createWriteStream(zip);
    try{for await(const chunk of res.body){job.received+=chunk.length;hash.update(chunk);if(!out.write(chunk))await new Promise(r=>out.once('drain',r));}}finally{await new Promise(r=>out.end(r));}
    if(hash.digest('hex')!==RUNTIME.sha256)throw Error('checksum mismatch');
    fs.rmSync(stage,{recursive:true,force:true});fs.mkdirSync(stage,{recursive:true});await this.extract(zip,stage);
    if(!fs.existsSync(path.join(stage,'llama-server.exe'))&&!fs.readdirSync(stage).some(n=>fs.existsSync(path.join(stage,n,'llama-server.exe'))))throw Error('llama-server.exe missing');
    await this.stop();fs.rmSync(this.dir,{recursive:true,force:true});fs.renameSync(stage,this.dir);job.state='done';this.log('runtime '+RUNTIME.version+' installed');
   }catch(e){job.state=controller.signal.aborted?'cancelled':'error';job.error=controller.signal.aborted?'':String(e.message||e);this.log('runtime download failed: '+job.error);}
   finally{try{fs.rmSync(zip,{force:true});}catch{}try{fs.rmSync(stage,{recursive:true,force:true});}catch{}}})();
  return this.status();
 }
 cancel(){this.job?.controller?.abort();return this.status();}
 async remove(){await this.stop();fs.rmSync(this.dir,{recursive:true,force:true});this.job=null;return this.status();}
 // A local engine pointing at this machine: make sure something answers there, starting llama-server if needed.
 local(options){const provider=String(options?.provider||'');if(!ORDER[provider])return null;
  let url;try{url=new URL(String(options.baseUrl||'http://127.0.0.1:8080/v1'));}catch{return null;}
  if(!['127.0.0.1','localhost','[::1]'].includes(url.hostname))return null;
  return {provider,port:Number(url.port)||(url.protocol==='https:'?443:80),origin:url.origin,model:String(options.model||'')};}
 async alive(origin){try{const res=await this.fetch(origin+'/health',{signal:AbortSignal.timeout(1500)});return res.ok;}catch{return false;}}
 pick(target){const installed=this.models.status().models.filter(m=>m.installed);if(!installed.length)return null;
  const named=installed.find(m=>m.id===target.model||m.file===target.model);if(named)return named;
  for(const id of ORDER[target.provider]){const m=installed.find(x=>x.id===id);if(m)return m;}return installed[0];}
 async ensure(options){
  const target=this.local(options);if(!target)return;
  if(this.server&&this.server.port===target.port&&await this.alive(target.origin))return;
  if(!this.server&&await this.alive(target.origin))return; // the user's own server
  if(this.starting)return this.starting;
  this.starting=this.start(target).finally(()=>{this.starting=null;});return this.starting;
 }
 async start(target){
  const exe=this.exe();if(!exe)throw Object.assign(Error('LOCAL_RUNTIME_MISSING'),{code:'LOCAL_RUNTIME_MISSING'});
  const model=this.pick(target);if(!model)throw Object.assign(Error('LOCAL_MODEL_MISSING'),{code:'LOCAL_MODEL_MISSING'});
  await this.stop();
  // All layers on the GPU first; if the server cannot start (too little VRAM), retry once on the CPU.
  for(const layers of ['99','0']){
   const args=['-m',this.models.file(model),'--host','127.0.0.1','--port',String(target.port),'-ngl',layers,'-c','4096'];
   this.log('start '+model.file+' port='+target.port+' ngl='+layers);
   const child=this.spawn(exe,args,{cwd:path.dirname(exe),windowsHide:true,stdio:['ignore','pipe','pipe']});
   const server={child,port:target.port,model:model.file,exited:false,tail:''};this.server=server;
   const keep=d=>{server.tail=(server.tail+String(d)).slice(-2000);};child.stdout?.on('data',keep);child.stderr?.on('data',keep);
   child.on('exit',code=>{server.exited=true;this.log('server exit code='+code+' '+server.tail.replace(/\s+/g,' ').slice(-400));if(this.server===server)this.server=null;});
   child.on('error',e=>{server.exited=true;this.log('server error '+e.message);if(this.server===server)this.server=null;});
   // Loading a 4-8 GB model takes a while on the first start.
   for(let waited=0;waited<180000&&!server.exited;waited+=500){if(await this.alive(target.origin))return;await new Promise(r=>setTimeout(r,500));}
   if(!server.exited){this.log('server not ready in time');await this.stop();break;}
  }
  throw Object.assign(Error('LOCAL_SERVER_FAILED'),{code:'LOCAL_SERVER_FAILED'});
 }
 async stop(){const s=this.server;this.server=null;if(!s||s.exited)return;
  await new Promise(resolve=>{s.child.once('exit',resolve);try{s.child.kill();}catch{resolve();}setTimeout(resolve,3000);});}
}
module.exports={LocalLlm,RUNTIME};
