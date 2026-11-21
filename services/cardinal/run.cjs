// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
/* One Cardinal replay as a child process (services/cardinal/driver.cjs), for the app (services/cardinal.cjs) and the acceptance
   fixtures alike. -> the driver's out.json, or {errors:[...]} when it did not finish. low: below-normal priority (the app). */
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),{spawn}=require('node:child_process');
const stop=p=>{if(!p||p.exitCode!==null)return;try{if(process.platform==='win32')require('node:child_process').spawnSync('taskkill',['/T','/F','/PID',String(p.pid)],{windowsHide:true,stdio:'ignore'});else p.kill('SIGKILL');}catch{}};
function replay(scenario,{data='',work=path.join(os.tmpdir(),'megulit-cardinal'),low=false,timeoutMs=420000,keep=false,name='run',env={},onSpawn=null}={}){
 fs.mkdirSync(work,{recursive:true});const dir=fs.mkdtempSync(path.join(work,name+'-'));const file=path.join(dir,'scenario.json'),out=path.join(dir,'out.json'),err=path.join(dir,'err.txt');
 fs.writeFileSync(file,JSON.stringify(scenario));
 return new Promise(resolve=>{let fd=null;try{fd=fs.openSync(err,'w');}catch{}
  const p=spawn(process.execPath,[path.join(__dirname,'driver.cjs'),file,out],{env:{...process.env,...env,MEGULIT_REPLAY_DATA:data,MEGULIT_REPLAY_WORK:dir,...(low?{MEGULIT_CARDINAL_LOW:'1'}:{}),...(keep?{MEGULIT_REPLAY_KEEP:'1'}:{})},stdio:['ignore','ignore',fd??'ignore'],windowsHide:true});
  if(low)try{os.setPriority(p.pid,os.constants.priority.PRIORITY_BELOW_NORMAL);}catch{}
  onSpawn?.(p);
  /* the driver and the browser it started end together (a killed driver cannot close its browser) */
  const kill=setTimeout(()=>stop(p),timeoutMs);
  const done=()=>{clearTimeout(kill);if(fd!=null)try{fs.closeSync(fd);}catch{}let o=null;try{o=JSON.parse(fs.readFileSync(out,'utf8'));}catch{}
   if(!o){let tail='';try{tail=fs.readFileSync(err,'utf8').slice(-1200);}catch{}o={errors:['replay did not finish'+(tail?': '+tail:'')],samples:[],hookEvents:[],hbSent:[]};}
   o.dir=dir;if(!keep)try{fs.rmSync(dir,{recursive:true,force:true});}catch{}resolve(o);};
  let once=false;const end=()=>{if(!once){once=true;done();}};p.on("exit",end);p.on("error",end);});}
module.exports={replay,stop};
