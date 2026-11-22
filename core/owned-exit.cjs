// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
const {ChildProcess}=require('node:child_process');
const pending=new WeakMap();
// Hold the actual spawned child, never look up or terminate a process by PID.
function stopOwned(child,request,{graceMs=2000,killMs=2000}={}){
 if(!child)return Promise.resolve();
 if(child.exitCode!=null||child.signalCode!=null){const neverStarted=child instanceof ChildProcess&&child.pid===undefined&&child.exitCode<0&&child.signalCode==null;const result=child.exitCode===0||neverStarted?Promise.resolve():Promise.reject(Error('READER_STOP_INCOMPLETE'));result.catch(()=>{});return result;}
 if(pending.has(child))return pending.get(child);
 let result;
 result=new Promise((resolve,reject)=>{
  let timer,done=false,forced=false;
  const finish=error=>{if(done)return;done=true;clearTimeout(timer);child.removeListener('exit',exit);child.removeListener('error',failed);if(error)reject(error);else resolve();};
  const exit=(code,signal)=>finish(forced||code!==0||signal?Error('READER_STOP_INCOMPLETE'):undefined),failed=()=>{if(!child.pid)finish();};
  child.once('exit',exit);child.on('error',failed);
  timer=setTimeout(()=>{forced=true;try{child.kill();}catch{}timer=setTimeout(()=>finish(Error('READER_STOP_INCOMPLETE')),killMs);},graceMs);
  try{request?.();}catch{} // Exit, not a successful stdin write, is the completion proof.
  if(child.exitCode!=null||child.signalCode!=null)exit(child.exitCode,child.signalCode);
 });
 pending.set(child,result);
 result.then(()=>pending.delete(child),()=>pending.delete(child));
 return result;
}
function trackStop(owner,child,request,options){
 const stops=owner.ownedStops??=new Map();
 if(child&&!stops.has(child)){
  const p=stopOwned(child,request,options);stops.set(child,p);
  p.then(()=>stops.delete(child),()=>{});
 }
 const result=Promise.allSettled([...stops.values()]).then(results=>{const failed=results.find(r=>r.status==='rejected');if(failed)throw failed.reason;});result.catch(()=>{});return result;
}
module.exports={stopOwned,trackStop};
