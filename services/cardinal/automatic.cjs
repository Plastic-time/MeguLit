// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
const Games=require('../background-games.cjs'),Budget=require('../background-budget.cjs');
/* The registration closes the permission/launch race; cancellation is remembered even before spawn. */
async function automatic(job,scenario,options,{games=Games,budget=Budget,intervalMs=2000,delayMs=30000}={}){
 const replay=job.replay||require('./run.cjs').replay;
 if(job.manual)return replay(scenario,options);
 for(let attempt=0;attempt<3;attempt++){
  const allowed=await budget.wait(job.root,{delay:delayMs});if(!allowed)return {deferred:true,errors:['idle wait cancelled']};
  const controller=new AbortController();let finished,operation=null,timer=null,checking=false;
  const completed=new Promise(resolve=>finished=resolve);
  const cancel=async()=>{controller.abort();await completed;if(out?.cleanupFailure||out?.processClosed===false)throw Error('CARDINAL_TREE_EXIT_UNCONFIRMED '+JSON.stringify(out.cleanupFailure||{}));};
  const release=games.track(job.game.exe,cancel);
  let out;
  try{
   const stillIdle=await games.idle(job.root,{ignore:release});
   if(controller.signal.aborted||!stillIdle||games.blocked()){out={interrupted:true,processClosed:true};}
   else{
    operation=replay(scenario,{...options,signal:controller.signal});
    timer=setInterval(async()=>{if(checking||controller.signal.aborted)return;checking=true;try{if(!await games.idle(job.root,{ignore:release}))controller.abort();}catch{controller.abort();}finally{checking=false;}},intervalMs);timer.unref?.();
    try{out=await operation;}catch(error){out={cleanupFailure:{reason:'replay rejected after start: '+String(error?.message||error),processClosed:false}};}
   }
  }finally{clearInterval(timer);if(!out?.cleanupFailure&&out?.processClosed!==false)release();finished();}
  if(out?.cleanupFailure||out?.processClosed===false)return out;
  if(!out?.interrupted)return out;
  job.trace?.('cardinal paused for player activity attempt='+(attempt+1)+' key='+job.key.slice(0,8));
 }
 return {deferred:true,errors:['player activity interrupted replay three times; retry on next kick']};
}
module.exports={automatic};
