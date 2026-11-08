// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
const {spawn}=require('node:child_process');
async function startProcess(file,args,cwd,errorCode,spawnProcess=spawn){
 const child=spawnProcess(file,args,{cwd,detached:true,stdio:'ignore',windowsHide:false});
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
module.exports={waitForVisibleGame,startProcess};
