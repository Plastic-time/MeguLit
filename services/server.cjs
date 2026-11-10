// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
const path=require('node:path'),readline=require('node:readline');
const {dispatch}=require('./bridge.cjs'),{Runtime}=require('./runtime.cjs');
const root=(process.env.MEGULIT_ROOT||process.env.TOME_FINAL_ROOT)?path.resolve(process.env.MEGULIT_ROOT||process.env.TOME_FINAL_ROOT):path.resolve(__dirname,'..');
const reply=value=>process.stdout.write(JSON.stringify(value)+'\n');
const runtime=new Runtime(root,(event,data)=>reply({event,data}));let closing=false,active=0,maintenance=false;
const input=readline.createInterface({input:process.stdin,crlfDelay:Infinity});
async function handle(line){
 let id=null,counted=false,exclusive=false;
 try{if(line.length>512*1024)throw Error('REQUEST_TOO_LARGE');const envelope=JSON.parse(line);id=envelope.id;const request=envelope.request;
  if(!Number.isSafeInteger(id)||!request||typeof request.action!=='string')throw Error('INVALID_REQUEST');
  if(request.action==='__shutdown'){closing=true;await runtime.stop();reply({id,ok:true,data:{stopped:true}});input.close();return;}
  if(closing)throw Error('RUNTIME_STOPPED');if(maintenance)throw Error('BACKUP_BUSY');if(request.action==='backup_apply'){if(active)throw Error('BACKUP_BUSY');maintenance=true;exclusive=true;}active++;counted=true;const data=await dispatch(request,runtime);reply({id,ok:true,data});
 }catch(error){reply({id,ok:false,error:/^[A-Z_]+$/.test(error.message)?error.message:'SERVICE_FAILED'});}finally{if(counted)active--;if(exclusive)maintenance=false;}
}
setTimeout(()=>{if(!closing)runtime.ankiProcess().auto().catch(()=>{});},1500).unref();
/* E361 read library games' scripts in a worker thread, a while after start */
try{require('./script-prewarm.cjs').start(root,{onDone:()=>{if(!closing)reply({event:'library-updated',data:{}});}});}catch{}
input.on('line',line=>{handle(line).catch(()=>{});});
input.on('close',()=>{closing=true;runtime.stop().finally(()=>process.exit(0));});
