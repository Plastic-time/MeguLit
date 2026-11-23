// SPDX-License-Identifier: GPL-3.0-or-later
// Offline translation models (GGUF weight files) for local servers such as llama.cpp, Ollama or LM Studio.
// ToMe only downloads and deletes these data files in models\; running a model server is up to that server.
'use strict';
const fs=require('node:fs'),path=require('node:path');

// Common Japanese-to-Chinese models from SakuraLLM, plus one general model. size in GB, vram = suggested GB.
const MODELS=[
 {id:'galtransl4b',label:'GalTransl v4 4B（Galgame 专用，推荐）',repo:'SakuraLLM/GalTransl-v4-4B-2601',file:'Galtransl-v4-4B-2601-Q5_K_S.gguf',size:2.63,vram:6},
 {id:'sakuragal7b',label:'Sakura-GalTransl 7B v3.7',repo:'SakuraLLM/Sakura-GalTransl-7B-v3.7',file:'Sakura-Galtransl-7B-v3.7-IQ4_XS.gguf',size:3.96,vram:8},
 {id:'sakura7b',label:'Sakura 7B v1.0（轻小说风格）',repo:'SakuraLLM/Sakura-7B-Qwen2.5-v1.0-GGUF',file:'sakura-7b-qwen2.5-v1.0-iq4xs.gguf',size:3.96,vram:8},
 {id:'sakuragal14b',label:'Sakura-GalTransl 14B v3.8（质量更高）',repo:'SakuraLLM/Sakura-GalTransl-14B-v3.8',file:'Sakura-Galtransl-14B-v3.8-IQ4_XS.gguf',size:7.62,vram:12},
 {id:'sakura14b',label:'Sakura 14B v1.0（质量更高）',repo:'SakuraLLM/Sakura-14B-Qwen2.5-v1.0-GGUF',file:'sakura-14b-qwen2.5-v1.0-iq4xs.gguf',size:7.62,vram:12},
 {id:'qwen3_8b',label:'Qwen3 8B（通用模型）',repo:'Qwen/Qwen3-8B-GGUF',file:'Qwen3-8B-Q4_K_M.gguf',size:4.68,vram:8},
];
// HuggingFace, or its mainland China mirror.
/* E448 every source is tried in turn (the chosen one first), then MeguLit's own relay; a source that sends nothing for 30 s is dropped */
const SOURCES={hf:'https://huggingface.co',mirror:'https://hf-mirror.com',megulit:'https://dl.megulit.com/hf'};

class ModelStore{
 constructor(root){this.dir=path.join(root,'models');this.jobs={};}
 find(id){const m=MODELS.find(x=>x.id===id);if(!m)throw Error('未知模型');return m;}
 file(m){return path.join(this.dir,m.file);}
 status(){return {dir:this.dir,models:MODELS.map(m=>{const j=this.jobs[m.id];return {id:m.id,label:m.label,size:m.size,vram:m.vram,file:m.file,installed:fs.existsSync(this.file(m)),job:j?{state:j.state,received:j.received,total:j.total,error:j.error}:null};})};}
 download(id,source='hf'){
  const m=this.find(id),base=SOURCES[source]||SOURCES.hf;const old=this.jobs[id];if(old?.state==='downloading')return this.status();
  const controller=new AbortController(),job={state:'downloading',received:0,total:0,error:'',controller};this.jobs[id]=job;
  const target=this.file(m);
  (async()=>{try{
    fs.mkdirSync(this.dir,{recursive:true});
    /* 2026-11-19: core/fast-download.cjs measures every source at once (the chosen one first in the list) and pulls the
       fast ones in parallel Range pieces; a slow or silent connection moves to another source and finished pieces survive
       a cancel or a restart (<file>.part.json), so a 5 GB model never starts over. The size comes from the servers. */
    const order=[base,...Object.values(SOURCES).filter(x=>x!==base),'https://cn-dl.megulit.com/hf'];
    const urls=order.map(src=>src+'/'+m.repo+'/resolve/main/'+encodeURIComponent(m.file)+(src.includes('dl.megulit.com')?'':'?download=true'));
    job.total=Math.round(m.size*1073741824);
    try{await require('./fast-download.cjs').download({urls,dest:target,signal:controller.signal,onProgress:p=>{job.received=p.received;if(p.total)job.total=p.total;}});}
    catch(e){if(controller.signal.aborted)throw Error('cancelled');throw Error('下载失败：HuggingFace、国内镜像和 MeguLit 中转都连不上（'+String((e.last&&e.last.message)||e.message||e)+'），请检查网络后重试');}
    job.state='done';
   }catch(e){job.state=controller.signal.aborted?'cancelled':'error';job.error=controller.signal.aborted?'':String(e.message||e);}})();
  return this.status();
 }
 cancel(id){this.jobs[id]?.controller.abort();return this.status();}
 remove(id){const m=this.find(id);if(this.jobs[id]?.state==='downloading')this.cancel(id);fs.rmSync(this.file(m),{force:true});delete this.jobs[id];return this.status();}
}
module.exports={ModelStore,MODELS};
