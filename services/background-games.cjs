// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
/* All automatic game launches yield to a player request before process discovery or focus. */
const path=require('node:path'),fs=require('node:fs');
const running=new Set();let blockedUntil=0,playing=()=>false;
function configure(fn){playing=fn;}
function pause(ms=300000){blockedUntil=Math.max(blockedUntil,Date.now()+ms);}
function blocked(){return Date.now()<blockedUntil||playing();}
async function idle(root,{reading=require('./cold-test.cjs').reading}={}){if(blocked()||running.size)return false;const r=await reading(root);return !blocked()&&!running.size&&!!r&&r.idleMs>=300000&&r.ac!==false&&!r.fullscreen&&Number.isFinite(r.cpu)&&r.cpu<.2;}
function track(exe,stop){const entry={exe,stop};running.add(entry);return ()=>running.delete(entry);}
async function foreground(){pause();await Promise.all([...running].map(e=>e.stop()));}
function unmute(root,pid,{execute=require('node:child_process').execFile}={}){if(!Number.isInteger(Number(pid))||Number(pid)<=0)return Promise.resolve(false);const helper=path.join(root,'native','ColdCapture64.exe');if(!fs.existsSync(helper))return Promise.resolve(false);return new Promise(resolve=>{try{execute(helper,['--unmute',String(pid)],{windowsHide:true,timeout:12000},error=>resolve(!error));}catch{resolve(false);}});}
/* Cancellation asks the helper to restore audio and close its job, then waits for its exit. */
function capture(job,args,done,{execute=require('node:child_process').execFile}={}){let ended=false,resolveExit;const exited=new Promise(r=>resolveExit=r);const child=execute(job.helper,args,{windowsHide:true},(error,stdout)=>{ended=true;clearTimeout(watch);off();resolveExit();done(String(stdout||'').trim().split(/\s+/).pop()||(error?'failed':''));});
 const stop=async()=>{if(ended)return;try{child.stdin.end('stop\n');}catch{}const timer=setTimeout(()=>{try{child.kill();}catch{}},5000);try{await exited;}finally{clearTimeout(timer);}};
 const off=track(job.exe||job.game.executable,stop),watch=setTimeout(stop,(Number(args[3])+10)*1000);watch.unref?.();return child;}
module.exports={configure,pause,blocked,idle,track,foreground,unmute,capture};
