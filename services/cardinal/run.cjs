// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),childProcess=require('node:child_process');
const states=new WeakMap();
function watch(p){let state=states.get(p);if(state)return state;let finish;state={closed:false,stopping:null,done:new Promise(resolve=>finish=resolve)};states.set(p,state);p.once('close',()=>{state.closed=true;finish();});return state;}
async function stop(p,{timeoutMs=5000,platform=process.platform,spawnSync=childProcess.spawnSync}={}){
 if(!p)return true;const state=watch(p);if(state.stopping)return state.stopping;if(state.closed)return true;
 state.stopping=(async()=>{let killed=false;try{if(platform==='win32'){const r=spawnSync('taskkill',['/T','/F','/PID',String(p.pid)],{windowsHide:true,stdio:'ignore',timeout:timeoutMs});killed=r.status===0&&!r.error;}else{p.kill('SIGKILL');/* No portable process-tree acknowledgement: retain the safety barrier. */}}catch{}
  let timer;await Promise.race([state.done,new Promise(resolve=>timer=setTimeout(resolve,timeoutMs))]);clearTimeout(timer);return killed&&state.closed;})();return state.stopping;
}
function replay(scenario,{data='',work=path.join(os.tmpdir(),'megulit-cardinal'),low=false,timeoutMs=420000,keep=false,name='run',env={},onSpawn=null,signal=null,stopTimeoutMs=5000}={},dependencies={}){
 const io={fs,spawn:childProcess.spawn,stop,...dependencies};
 if(signal?.aborted)return Promise.resolve({errors:['replay interrupted before spawn'],samples:[],interrupted:true,processClosed:true});
 io.fs.mkdirSync(work,{recursive:true});const dir=io.fs.mkdtempSync(path.join(work,name+'-')),file=path.join(dir,'scenario.json'),out=path.join(dir,'out.json'),err=path.join(dir,'err.txt');io.fs.writeFileSync(file,JSON.stringify(scenario));
 return new Promise(resolve=>{let fd=null,p=null,timer=null,finished=false,interrupted=false,terminating=false,termination=null;
  try{fd=io.fs.openSync(err,'w');}catch{}
  const finish=(closed,error='')=>{if(finished)return;finished=true;clearTimeout(timer);signal?.removeEventListener('abort',abort);if(fd!=null)try{io.fs.closeSync(fd);}catch{}let o=null;try{o=JSON.parse(io.fs.readFileSync(out,'utf8'));}catch{}
   if(!o){let tail='';try{tail=io.fs.readFileSync(err,'utf8').slice(-1200);}catch{}o={errors:['replay did not finish'+(tail?': '+tail:'')],samples:[],hookEvents:[],hbSent:[]};}
   if(closed&&!interrupted&&o.cleanupComplete!==true&&!o.cleanupFailure)o.cleanupFailure={driverPid:p?.pid||null,profile:dir,processClosed:true,reason:'missing-driver-cleanup-ack'};
   if(error)(o.errors||(o.errors=[])).push(error);o.processClosed=closed;o.interrupted=interrupted;o.dir=dir;
   if(!closed)o.cleanupFailure={...o.cleanupFailure,driverPid:p?.pid||null,profile:dir,processClosed:false,reason:'driver-tree-stop-unconfirmed'};
   if(!keep&&closed&&!o.cleanupFailure)try{io.fs.rmSync(dir,{recursive:true,force:true});}catch(e){o.cleanupFailure={...o.cleanupFailure,driverPid:p?.pid||null,profile:dir,processClosed:true,reason:'replay-directory-cleanup: '+e.message};}
   resolve(o);};
  const terminate=()=>{if(termination)return termination;interrupted=true;terminating=true;termination=(async()=>{let closed=false;try{closed=await io.stop(p,{timeoutMs:stopTimeoutMs});}catch{}finish(closed,closed?'replay interrupted':'replay process tree exit unconfirmed');return closed;})();return termination;};
  const abort=()=>{void terminate();};
  try{p=io.spawn(process.execPath,[path.join(__dirname,'driver.cjs'),file,out],{env:{...process.env,...env,MEGULIT_REPLAY_DATA:data,MEGULIT_REPLAY_WORK:dir,...(low?{MEGULIT_CARDINAL_LOW:'1'}:{}),...(keep?{MEGULIT_REPLAY_KEEP:'1'}:{})},stdio:['ignore','ignore',fd??'ignore'],windowsHide:true});watch(p);
   p.once('close',()=>{if(!terminating)finish(true);});p.once('error',error=>{if(!p.pid)finish(true,'replay spawn: '+error.message);else void terminate();});
   if(low)try{os.setPriority(p.pid,os.constants.priority.PRIORITY_BELOW_NORMAL);}catch{}
   timer=setTimeout(abort,timeoutMs);signal?.addEventListener('abort',abort,{once:true});
   if(signal?.aborted)abort();onSpawn?.(p);
  }catch(error){if(p)void terminate();else finish(true,'replay spawn: '+error.message);}
 });
}
module.exports={replay,stop};
