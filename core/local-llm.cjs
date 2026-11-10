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
    /* v1.1.4 (user: download speed is the big problem): mainland China tries the GitHub mirrors from setup/runtime.json
       first, like the runtime packs; a source that sends nothing for 20 s is dropped for the next. SHA-256 must match. */
    let mirrors=[];try{mirrors=JSON.parse(fs.readFileSync(path.join(this.root,'setup','runtime.json'),'utf8')).mirrors||[];}catch{}
    const tz=Intl.DateTimeFormat().resolvedOptions().timeZone||'',china=['Asia/Shanghai','Asia/Chongqing','Asia/Harbin','Asia/Urumqi','PRC'].includes(tz);
    const mirrored=mirrors.map(m=>require('./runtime-packs.cjs').mirrorUrl(m,RUNTIME.url)),urls=china?[...mirrored,RUNTIME.url]:[RUNTIME.url,...mirrored];
    let ok=false,last=null;
    for(const url of urls){
     if(controller.signal.aborted)break;
     const attempt=new AbortController(),stop=()=>attempt.abort();controller.signal.addEventListener('abort',stop,{once:true});
     let idle=setTimeout(stop,20000);const touch=()=>{clearTimeout(idle);idle=setTimeout(stop,20000);};
     job.received=0;const hash=createHash('sha256'),out=fs.createWriteStream(zip);
     try{
      const res=await this.fetch(url,{redirect:'follow',signal:attempt.signal});if(!res.ok||!res.body)throw Error('HTTP '+res.status);
      try{for await(const chunk of res.body){touch();job.received+=chunk.length;hash.update(chunk);if(!out.write(chunk))await new Promise(r=>out.once('drain',r));}}finally{await new Promise(r=>out.end(r));}
      if(hash.digest('hex')!==RUNTIME.sha256)throw Error('checksum mismatch');
      this.log('runtime downloaded from '+new URL(url).host);ok=true;break;
     }catch(e){last=e;if(!out.closed)await new Promise(r=>out.end(r));this.log('runtime source failed '+new URL(url).host+': '+String(e.message||e));}
     finally{clearTimeout(idle);controller.signal.removeEventListener('abort',stop);}
    }
    if(!ok)throw last||Error('download failed');
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
  /* v1.1.1: the model alone cannot translate. Fetch the pinned runtime in the background and say so, instead of failing
     every line; the next line after the download finishes starts the server. */
  if(!this.exe()){if(this.job?.state!=='downloading'){this.log('runtime missing; downloading for '+target.provider);this.download();}
   const j=this.job,pct=j&&j.total?Math.floor(j.received/j.total*100):0;throw Object.assign(Error('LOCAL_RUNTIME_DOWNLOADING:'+pct),{code:'LOCAL_RUNTIME_DOWNLOADING'});}
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
