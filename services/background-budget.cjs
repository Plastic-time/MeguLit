// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
/* Automatic maintenance uses the same player/game gate as cold capture; manual requests never wait here. */
const games=require('./background-games.cjs');
function schedule(root,work,{delay=60000,retry=60000,repeat=0,allowed=()=>games.idle(root),later=setTimeout,cancel=clearTimeout}={}){
 let timer=null,stopped=false;
 const queue=ms=>{if(stopped)return;timer=later(run,ms);timer.unref?.();};
 const run=async()=>{timer=null;if(stopped)return;let idle=false;try{idle=await allowed();}catch{}if(stopped)return;if(!idle){queue(retry);return;}try{await work();}catch{}if(repeat)queue(repeat);};
 queue(delay);return {stop(){stopped=true;if(timer)cancel(timer);timer=null;},unref(){timer?.unref?.();}};
}
async function wait(root,{allowed=()=>games.idle(root),delay=30000,sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms))}={}){while(!await allowed())await sleep(delay);}
module.exports={schedule,wait};
