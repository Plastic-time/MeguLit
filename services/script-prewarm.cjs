// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
/* E361 Reading a game's script for zero-latency translation takes up to several seconds on big games (素晴らしき日々
   3 s, Tsukiniyorisou 1.6 s), which used to happen when the game started. A worker thread reads every library game whose
   saved state is missing or stale, a while after MeguLit starts, so the game page can show its zero-latency state and
   the first launch finds the script ready. One game at a time, lowest priority work, never on the main thread. */
const path=require('node:path'),fs=require('node:fs'),{Worker,isMainThread,workerData,parentPort}=require('node:worker_threads');

function start(root,{delay=45000,onDone=()=>{}}={}){
 if(process.env.MEGULIT_NO_PREWARM)return null;
 const timer=setTimeout(()=>{let worker;try{worker=new Worker(__filename,{workerData:{root}});}catch{return;}
  worker.on('message',m=>{if(m?.done)onDone(m);});worker.on('error',()=>{});worker.unref();},delay);
 timer.unref?.();return timer;}

async function run(root){
 const ot=require('./original-text.cjs'),store=require('./store.cjs');let db;try{db=store.openStore(root);}catch{return {done:true,checked:0};}
 let checked=0;
 try{const games=db.prepare('SELECT id,executable FROM games WHERE removed_at IS NULL').all();
  for(const g of games){if(!g.executable||!fs.existsSync(g.executable))continue;
   try{ot.status(root,db,g.id);checked++;await ot.autoPatch(root,db,g.id,{drives:false});}catch{}
   await new Promise(r=>setTimeout(r,200));}}
 finally{try{db.close();}catch{}}
 return {done:true,checked};}

if(!isMainThread&&workerData?.root){run(workerData.root).then(r=>parentPort.postMessage(r),()=>parentPort.postMessage({done:true,checked:0}));}
module.exports={start,run};
