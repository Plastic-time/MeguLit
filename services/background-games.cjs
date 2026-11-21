// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
/* All automatic game launches yield to a player request before process discovery or focus. */
const path=require('node:path'),fs=require('node:fs');
const running=new Set();let blockedUntil=0,playing=()=>false;
function configure(fn){playing=fn;}
function pause(ms=300000){blockedUntil=Math.max(blockedUntil,Date.now()+ms);}
function blocked(){return Date.now()<blockedUntil||playing();}
const occupiedByOther=ignore=>[...running].some(entry=>entry.release!==ignore);
async function idle(root,{reading=require('./cold-test.cjs').reading,ignore}={}){if(blocked()||occupiedByOther(ignore))return false;const r=await reading(root);return !blocked()&&!occupiedByOther(ignore)&&!!r&&r.idleMs>=300000&&r.ac!==false&&!r.fullscreen&&Number.isFinite(r.cpu)&&r.cpu<.2;}
function track(exe,stop){const entry={exe,stop};entry.release=()=>running.delete(entry);running.add(entry);return entry.release;}
async function foreground(){pause();await Promise.all([...running].map(e=>e.stop()));}
function unmute(root,pid,{execute=require('node:child_process').execFile}={}){if(!Number.isInteger(Number(pid))||Number(pid)<=0)return Promise.resolve(false);const helper=path.join(root,'native','ColdCapture64.exe');if(!fs.existsSync(helper))return Promise.resolve(false);return new Promise(resolve=>{try{execute(helper,['--unmute',String(pid)],{windowsHide:true,timeout:12000},error=>resolve(!error));}catch{resolve(false);}});}
/* Cancellation asks the helper to restore audio and close its job, then waits for its exit. */
function capture(job,args,done,{execute=require('node:child_process').execFile,stopTimeoutMs=12000}={}){let ended=false,resolveExit,unsafe=false;const exited=new Promise(r=>resolveExit=r);const child=execute(job.helper,args,{windowsHide:true},(error,stdout)=>{ended=true;clearTimeout(watch);const word=String(stdout||'').trim().split(/\s+/).pop()||(error?'failed':'');unsafe=word==='cleanup-unconfirmed'||!!error?.signal||child.killed===true;if(!unsafe)off();resolveExit();done(word);});
 const stop=async()=>{const fail=()=>Object.assign(Error('COLD_CLEANUP_UNCONFIRMED'),{code:'COLD_CLEANUP_UNCONFIRMED'});if(ended){if(unsafe)throw fail();return;}try{child.stdin.end('stop\n');}catch{}let timer;try{await Promise.race([exited,new Promise((_,reject)=>{timer=setTimeout(()=>reject(Object.assign(Error('COLD_STOP_TIMEOUT'),{code:'COLD_STOP_TIMEOUT'})),stopTimeoutMs);})]);if(unsafe)throw fail();}finally{clearTimeout(timer);}};
 const off=track(job.exe||job.game.executable,stop),watch=setTimeout(()=>{stop().catch(()=>{});},(Number(args[3])+10)*1000);watch.unref?.();return child;}
module.exports={configure,pause,blocked,idle,track,foreground,unmute,capture,occupied:()=>running.size>0};
