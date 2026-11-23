'use strict';
/* E590 runs core/japanese-auto.cjs for the library after a scan (one game at a time, off the start-up path, each game once)
   and for one game at launch. Notices wait in japanese-auto.json until the UI takes them (jp_auto_notices). */
const path=require('node:path');
const auto=require('../core/japanese-auto.cjs');
const {forExecutable}=require('./japanese-restore-options.cjs');
let queue=[],timer=null;
function considerLibrary(root,games,{delay=45000,gap=4000,onDone}={}){
 if(require('../core/library-mode.cjs').libraryOnly(root))return 0;
 const seen=auto.read(root).games;
 for(const g of games){const id=String(g.id);if(!g.executable||seen[id]?.checked||seen[id]?.state)continue;if(!queue.some(q=>q.id===id))queue.push({id,dir:path.dirname(g.executable),executable:g.executable});}
 if(timer||!queue.length)return queue.length;
 const step=()=>{timer=null;const next=queue.shift();if(!next)return;
  try{if(require('../core/library-mode.cjs').libraryOnly(root)){queue=[];return;}const r=auto.run(root,next.id,next.dir,{trigger:'scan',options:forExecutable(next.executable)});if(r.done)onDone?.(next.id,r);}catch(error){try{require('../core/log-sink.cjs').append(path.join(root,'logs','japanese-auto.log'),new Date().toISOString()+' '+String(error?.message||error).slice(0,160)+'\n');}catch{}}
  if(queue.length)timer=setTimeout(step,gap);};
 timer=setTimeout(step,delay);if(timer.unref)timer.unref();return queue.length;
}
/* launch preflight: self-check an earlier automatic file switch, then a first automatic switch for this game */
function beforeLaunch(root,id,gameDir,trace=()=>{},options={}){
 if(require('../core/library-mode.cjs').libraryOnly(root))return {disabled:true};
 const out={};
 try{const c=auto.selfCheck(root,id,gameDir,{options});if(c.checked){out.check=c;trace('japanese-auto-check',c);}}catch(error){trace('japanese-auto-check-failed',{error:String(error?.message||error).slice(0,160)});if(error.message==='JAPANESE_REPAIR_BLOCKED')throw error;}
 try{const r=auto.run(root,id,gameDir,{trigger:'launch',options});if(r.done){out.run=r;trace('japanese-auto',{mode:r.mode});
  /* a file switch made just now is verified on this launch too */
  if(r.mode==='files')auto.selfCheck(root,id,gameDir,{options});}}catch(error){trace('japanese-auto-failed',{error:String(error?.message||error).slice(0,160)});if(error.message==='JAPANESE_REPAIR_BLOCKED')throw error;}
 return out;
}
module.exports={considerLibrary,beforeLaunch,_internal:{queue:()=>queue}};
