// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
/* Automatic maintenance uses the same player/game gate as cold capture; manual requests never wait here. */
const games=require('./background-games.cjs');
const {isMainThread,parentPort,workerData}=require('node:worker_threads');
/* Workers ask the service that owns player state; their module-local playing callback is a different instance. */
let serial=0;
function workerPermission(){return new Promise(resolve=>{const id=++serial,timer=setTimeout(()=>done(false),10000);const receive=m=>{if(m?.type==='background-permission-result'&&m.id===id)done(m.allowed===true);};function done(value){clearTimeout(timer);parentPort.off('message',receive);resolve(value);}parentPort.on('message',receive);parentPort.postMessage({type:'background-permission',id});});}
const permission=root=>!isMainThread&&workerData?.backgroundBudget?workerPermission():games.idle(root);
function attach(worker,root,{allowed=()=>games.idle(root)}={}){const receive=async m=>{if(m?.type!=='background-permission')return;let idle=false;try{idle=await allowed();}catch{}try{worker.postMessage({type:'background-permission-result',id:m.id,allowed:idle});}catch{}};worker.on('message',receive);worker.once('exit',()=>worker.off('message',receive));return worker;}
function schedule(root,work,{delay=60000,retry=60000,repeat=0,allowed=()=>games.idle(root),later=setTimeout,cancel=clearTimeout}={}){
 let timer=null,stopped=false;
 const queue=ms=>{if(stopped)return;timer=later(run,ms);timer.unref?.();};
 const run=async()=>{timer=null;if(stopped)return;let idle=false;try{idle=await allowed();}catch{}if(stopped)return;if(!idle){queue(retry);return;}try{await work();}catch{}if(repeat)queue(repeat);};
 queue(delay);return {stop(){stopped=true;if(timer)cancel(timer);timer=null;},unref(){timer?.unref?.();}};
}
async function wait(root,{allowed=()=>permission(root),cancelled=()=>false,delay=30000,sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms))}={}){while(!cancelled()){let idle=false;try{idle=await allowed();}catch{}if(cancelled())return false;if(idle)return true;await sleep(delay);}return false;}
module.exports={schedule,wait,attach};
