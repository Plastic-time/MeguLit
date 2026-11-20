// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
const {spawn}=require('node:child_process');
/* 1.4.21 (user: 「不要让megulit关了游戏也被关」): a game started here used to join MeguLit's job (desktop/src/broker.rs) and end
   when MeguLit closed, crashed or restarted for an update. MeguLit.exe --spawn-outside-job starts it outside the job and prints
   its pid; the game's end is then watched by pid (exit code unknown: null). Without MeguLit.exe (tests, rigs) the direct spawn. */
const fsx=require('node:fs'),pathx=require('node:path');
function outsideJobLauncher(){const root=process.env.MEGULIT_ROOT;if(!root||process.platform!=='win32'||process.env.MEGULIT_GAME_IN_JOB==='1')return null;const exe=pathx.join(root,'MeguLit.exe');return fsx.existsSync(exe)?exe:null;}
function startOutsideJob(launcher,file,args,cwd,errorCode,spawnProcess,env){
 return new Promise((resolve,reject)=>{let out='';
  const helper=spawnProcess(launcher,['--spawn-outside-job',cwd||'',file,...args],{cwd,stdio:['ignore','pipe','ignore'],windowsHide:true,...(env?{env}:{})});
  let state=null;const alive=pid=>{try{process.kill(pid,0);return true;}catch(e){return e.code==='EPERM';}};
  /* line 1: the pid (resolve); line 2: "exit <code>" when the program ends (Steam restart detection needs the code) */
  helper.stdout.on('data',d=>{out+=d;const lines=out.split(/\r?\n/);
   if(!state&&lines.length>1){const pid=Number(lines[0].trim());if(!Number.isSafeInteger(pid)||pid<=0){reject(Object.assign(Error(errorCode),{detail:'OUTSIDE_JOB_PID'}));return;}state={pid,exit:null,outsideJob:true};resolve(state);}
   const m=/^exit (-?\d+|null)$/m.exec(out);if(state&&m&&!state.exit)state.exit={code:m[1]==='null'?null:Number(m[1]),signal:null};});
  helper.stdout.on('error',()=>{});
  helper.once('error',error=>{if(!state)reject(Object.assign(Error(errorCode),{detail:error.code}));});
  helper.once('exit',code=>{if(!state)return reject(Object.assign(Error(errorCode),{detail:'OUTSIDE_JOB_'+code}));
   /* the helper ended without an exit line (ended with MeguLit, or killed): watch the pid, code unknown */
   if(!state.exit){const watch=setInterval(()=>{if(state.exit){clearInterval(watch);return;}if(!alive(state.pid)){state.exit={code:null,signal:null};clearInterval(watch);}},500);watch.unref?.();}});
  helper.unref?.();
 });
}
async function startProcess(file,args,cwd,errorCode,spawnProcess=spawn,env=null){
 const launcher=outsideJobLauncher();if(launcher)return startOutsideJob(launcher,file,args,cwd,errorCode,spawnProcess,env);
 const child=spawnProcess(file,args,{cwd,detached:true,stdio:'ignore',windowsHide:false,...(env?{env}:{})});
 const state={pid:child.pid,exit:null};
 child.once('exit',(code,signal)=>{state.exit={code,signal};});
 await new Promise((resolve,reject)=>{
  child.once('error',error=>reject(Object.assign(Error(errorCode),{detail:error.code})));
  child.once('spawn',resolve);
 });
 child.unref();return state;
}
async function waitForVisibleGame(query,{attempts=60,interval=250,stableSamples=4,timeout=15000,exit,helper=false,helperError='LE_HELPER_FAILED',indirect=false,trace=()=>{},sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms))}={}){
 let pid=null,stable=0,seenProcess=false,exitLogged=false,answered=false,lastError=null;
 const deadline=Date.now()+timeout;
 for(let i=0;i<attempts&&Date.now()<deadline;i++){
  /* A process query can fail on some PCs (security software holding the helper, first-run scan past the timeout).
     One failed sample is no answer, not a failed launch: keep waiting (v1.1.0, Steam games reported as "could not
     check whether the game was running"). */
  let processes;try{processes=await query();answered=true;}catch(error){lastError=error;if(!lastError.logged){trace('process-query-failed',{error:error.message});lastError.logged=true;}if(i+1<attempts)await sleep(interval);continue;}
  const visible=processes.filter(p=>p.visible);
  if(processes.length&&!seenProcess){seenProcess=true;trace('game-process-seen',{pid:processes[0].pid});}
  const game=visible.find(p=>p.pid===pid)||visible[0];
  if(game){stable=pid===game.pid?stable+1:1;pid=game.pid;if(stable>=stableSamples)return {pid};}
  else{pid=null;stable=0;}
  const ended=exit?.();
  if(ended&&!exitLogged){trace(helper?'launch-helper-exited':'game-process-exited',ended);exitLogged=true;}
  if(!processes.length&&((ended&&!helper)||seenProcess&&!indirect))throw Error('GAME_PROCESS_EXITED');
  if(!processes.length&&helper&&!indirect&&ended&&(ended.code!==0||ended.signal))throw Error(helperError);
  if(i+1<attempts)await sleep(interval);
 }
 /* Never got a single answer: the game was started, MeguLit just cannot see processes. Let the reader attach on its own. */
 if(!answered&&lastError){trace('process-query-unavailable',{error:lastError.message});return {pid:null,unverified:true};}
 throw Error('GAME_WINDOW_NOT_READY');
}
module.exports={startOutsideJob,outsideJobLauncher,waitForVisibleGame,startProcess};
