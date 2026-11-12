'use strict';
// SPDX-License-Identifier: GPL-3.0-or-later
// E455 voice separation for clips recorded from the game's sound (player, 2026-11-12: the card's voice carried the BGM).
// A local MDX-Net vocal model (UVR-MDX-NET-Voc_FT, MIT, 66.8 MB) runs in MeguLit's own Python with numpy and onnxruntime
// (installed once into data/vocal-sep/pylib with pip). Everything is fetched the first time it is needed, in the
// background; until then callers get null and keep the recording as it is. One clip at a time.
const fs=require('node:fs'),path=require('node:path'),{createHash}=require('node:crypto'),{execFile}=require('node:child_process'),{Readable,Transform}=require('node:stream'),{pipeline}=require('node:stream/promises');
const MODEL={repository:'LeeAeron/uvr_mdx-net',revision:'aec129801d2f6d8c44e27d1524991dddfb0988ab',name:'UVR-MDX-NET-Voc_FT.onnx',size:66762490,sha256:'534b2070fcc7df514b13ef660dc8cbb328679c2374d04354a5c42bb14ecce111'};
const PACKAGES=['numpy==2.5.4','onnxruntime==1.31.1'];
const HF=['https://huggingface.co','https://hf-mirror.com','https://dl.megulit.com/hf'];
const PYPI=[null,'https://pypi.tuna.tsinghua.edu.cn/simple','https://mirrors.aliyun.com/pypi/simple/'];
const dir=root=>path.join(root,'data','vocal-sep'),modelPath=root=>path.join(dir(root),MODEL.name),pylib=root=>path.join(dir(root),'pylib');
const pythonExe=()=>{if(process.env.MEGULIT_VOCAL_PYTHON)return process.env.MEGULIT_VOCAL_PYTHON;try{const own=require('../core/layout.cjs').python;if(fs.existsSync(own))return own;}catch{}return null;};
const script=path.join(__dirname,'vocal-sep.py');
let preparing=null,failedAt=0,lastError='';const log=(root,m)=>{try{fs.appendFileSync(path.join(root,'logs','vocal-sep.log'),new Date().toISOString()+' '+m+'\n');}catch{}};
function ready(root){try{return fs.statSync(modelPath(root)).size===MODEL.size&&fs.existsSync(path.join(pylib(root),'onnxruntime'))&&fs.existsSync(path.join(pylib(root),'numpy'))&&!!pythonExe();}catch{return false;}}
function run(file,args,timeout){return new Promise((resolve,reject)=>execFile(file,args,{windowsHide:true,timeout,maxBuffer:8<<20},(e,out,err)=>e?reject(Object.assign(e,{stderr:String(err||'')})):resolve(String(out||''))));}
async function fetchModel(root){
 const file=modelPath(root),tmp=file+'.part';if(fs.existsSync(file)&&fs.statSync(file).size===MODEL.size)return;let last;
 for(const source of HF){const url=source+'/'+MODEL.repository+'/resolve/'+MODEL.revision+'/'+MODEL.name,controller=new AbortController();let idle=setTimeout(()=>controller.abort(),30000);
  try{log(root,'model from '+source);const response=await fetch(url,{signal:controller.signal});if(!response.ok||!response.body)throw Error('HTTP '+response.status);
   const hash=createHash('sha256');let size=0;const check=new Transform({transform(chunk,enc,done){clearTimeout(idle);idle=setTimeout(()=>controller.abort(),30000);size+=chunk.length;if(size>MODEL.size)return done(Error('too large'));hash.update(chunk);done(null,chunk);}});
   await pipeline(Readable.fromWeb(response.body),check,fs.createWriteStream(tmp));
   if(size!==MODEL.size||hash.digest('hex')!==MODEL.sha256){fs.rmSync(tmp,{force:true});throw Error('checksum');}
   fs.renameSync(tmp,file);return;
  }catch(e){last=e;log(root,'model source failed '+source+' '+(controller.signal.aborted?'stalled':e.message));}finally{clearTimeout(idle);}}
 throw Error('MODEL_DOWNLOAD_FAILED '+(last?.message||''));}
async function installPackages(root){
 const py=pythonExe();if(!py)throw Error('PYTHON_MISSING');const target=pylib(root);if(fs.existsSync(path.join(target,'onnxruntime'))&&fs.existsSync(path.join(target,'numpy')))return;let last;
 for(const index of PYPI){try{log(root,'pip '+(index||'pypi.org'));fs.rmSync(target,{recursive:true,force:true});
   await run(py,['-I','-m','pip','install','--disable-pip-version-check','--no-warn-script-location','--only-binary=:all:','--target',target,...(index?['--index-url',index]:[]),...PACKAGES],600000);return;
  }catch(e){last=e;log(root,'pip failed '+(index||'pypi.org')+' '+String(e.stderr||e.message).slice(-300));}}
 throw Error('PACKAGES_FAILED '+(last?.message||''));}
// Fetch the model and packages once; a failure waits ten minutes before another try.
function prepare(root){if(ready(root))return Promise.resolve(true);if(process.env.MEGULIT_VOCAL_NO_FETCH)return Promise.resolve(false);if(preparing)return preparing;if(Date.now()-failedAt<600000)return Promise.resolve(false);
 fs.mkdirSync(dir(root),{recursive:true});preparing=(async()=>{try{await Promise.all([fetchModel(root),installPackages(root)]);log(root,'ready');return ready(root);}catch(e){failedAt=Date.now();lastError=e.message;log(root,'prepare failed '+e.message);return false;}finally{preparing=null;}})();return preparing;}
let queue=Promise.resolve();
// Separate one WAV clip (Buffer or base64). Resolves to a WAV Buffer of the voice alone, or null when not ready or failed.
function isolate(root,wav){const input=Buffer.isBuffer(wav)?wav:Buffer.from(String(wav||''),'base64');if(input.length<1000)return Promise.resolve(null);
 if(!ready(root)){prepare(root);return Promise.resolve(null);}
 const job=queue.then(async()=>{const id=createHash('sha1').update(input).digest('hex').slice(0,12),src=path.join(dir(root),'in-'+id+'.wav'),dst=path.join(dir(root),'out-'+id+'.wav');
  try{fs.writeFileSync(src,input);const started=Date.now();await run(pythonExe(),['-I',script,pylib(root),modelPath(root),src,dst],120000);const out=fs.readFileSync(dst);log(root,'isolated '+(input.length/48000).toFixed(1)+' s in '+(Date.now()-started)+' ms');return out.length>44?out:null;}
  catch(e){log(root,'isolate failed '+String(e.stderr||e.message).slice(-300));return null;}
  finally{fs.rmSync(src,{force:true});fs.rmSync(dst,{force:true});}});
 queue=job.catch(()=>null);return job;}
const status=root=>({ready:ready(root),preparing:!!preparing,error:lastError});
module.exports={isolate,prepare,ready,status,MODEL,PACKAGES};
