// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
const relay=require('./relay-config.cjs');
const receiver=require('./torch-receive.cjs');
const auto=require('../core/auto-profile.cjs');
const wait=require('node:timers/promises').setTimeout;

async function reconcile(root,rows,signal){
 const wanted=new Set(rows.map(r=>r.game_key));
 const db=require('./store.cjs').openStore(root);
 let games;
 try{games=db.prepare("SELECT id,executable FROM games WHERE removed_at IS NULL AND executable!=''").all();}finally{db.close();}
 for(const game of games){
  signal.throwIfAborted();
  const key=await auto.exeKey(root,game.executable);
  if(!wanted.has(key))continue;
  const state=await receiver.receive(root,game.id,{signal,fresh:true,liveSync:true});
  if(['TORCH_INSTALL_FAILED','TORCH_RELAY_UNAVAILABLE','TORCH_DEFERRED'].includes(state.code))throw Error(state.code);
 }
}

function subscribe(root,{base,Socket=globalThis.WebSocket,fetcher=fetch,apply=reconcile}={}){
 if(!Socket||process.env.MEGULIT_OFFLINE==='1'||process.env.MEGULIT_CARDINAL_REPLAY==='1')return;
 const bases=base?[base]:relay.seedBases(root,'receive');
 if(!bases.length)return;
 const owner=new AbortController();
 let cursor=0;
 async function run(){
  let delay=1000,attempt=0;
  while(!owner.signal.aborted){
   const base=bases[attempt++%bases.length];
   const connection=new AbortController(),signal=AbortSignal.any([owner.signal,connection.signal]);
   let socket,work,dirty=false;
   try{
    socket=new Socket(base.replace(/^http/,'ws')+'/api/torch-release/events');
    const closed=new Promise(resolve=>signal.addEventListener('abort',resolve,{once:true}));
    let timeout=setTimeout(()=>connection.abort(),15000);
    async function drain(){
     while(dirty&&!signal.aborted){
      dirty=false;
      const res=await fetcher(base+'/api/torch-release/changes?after='+cursor,{signal:AbortSignal.any([signal,AbortSignal.timeout(15000)]),redirect:'error',cache:'no-store'});
      if(!res.ok)throw Error('changes unavailable');
      const {changes}=await receiver.body(res);
      if(!Array.isArray(changes)||changes.length>128)throw Error('invalid changes');
      let end=cursor;
      for(const row of changes){
       if(!Number.isSafeInteger(row.seq)||row.seq<=end||!/^[a-f0-9]{64}$/.test(row.game_key))throw Error('invalid revision');
       end=row.seq;
      }
      if(changes.length)await apply(root,changes,signal);
      signal.throwIfAborted();cursor=end;
      if(changes.length===128)dirty=true;
      delay=1000;
     }
    }
    function wake(){
     dirty=true;
     if(!work)work=drain().catch(()=>connection.abort()).finally(()=>{work=null;if(dirty&&!signal.aborted)wake();});
    }
    socket.onopen=()=>{
     clearTimeout(timeout);
     // Renew an idle transport so an undetected broken proxy or lost broadcast can recover.
     timeout=setTimeout(()=>connection.abort(),(25+Math.random()*10)*60000);
     wake();
    };
    socket.onmessage=e=>{if(e.data==='changed')wake();};
    socket.onerror=socket.onclose=()=>connection.abort();
    await closed;clearTimeout(timeout);
   }finally{connection.abort();socket?.close(1000,'reconnect');await work;}
   if(!owner.signal.aborted)await wait(delay,null,{signal:owner.signal,ref:false});
   delay=Math.min(delay*2,60000);
  }
 }
 const done=run().catch(e=>{if(!owner.signal.aborted)console.error('Seed subscription stopped',e.message);});
 return ()=>{owner.abort();return done;};
}
module.exports={subscribe};
