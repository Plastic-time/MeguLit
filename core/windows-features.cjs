// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
/* 2026-11-12 (user: a game opened a Windows "install this feature, then restart" window; "一定要做完善"). Windows installs
   missing optional features on demand through Fondue.exe: DirectPlay (old games), .NET Framework 3.5 (games written for .NET
   2.0 to 3.5), and others. A player should never meet that window or a restart because of a game:
   - before a launch: DirectPlay is handled by core/directplay.cjs; a .NET 2.0-3.5 program on a PC without .NET 3.5 gets a
     <program>.config that lets it run on the .NET 4 that every Windows 10/11 has (no install at all);
   - during a launch: watch() closes a Fondue.exe that the game's own programs started (the game gets the answer it gets when
     the window is cancelled) and remembers the feature for this folder, so the next launch prepares for it; DirectPlay is
     prepared at once, while the game runs;
   - a game that cannot run without the feature: install() enables it with DISM /NoRestart behind one permission prompt. */
const fs=require('node:fs'),path=require('node:path'),{execFile,spawn}=require('node:child_process');
const manifest=require('./compat-manifest.cjs'),{pe}=require('./directplay.cjs');
const WINDOWS=()=>process.env.SystemRoot||'C:\\Windows';

/* .NET 3.5 (which carries the 2.0 runtime) is there when its runtime DLL is */
const netfx35=(windows=WINDOWS())=>['Framework','Framework64'].every(f=>fs.existsSync(path.join(windows,'Microsoft.NET',f,'v2.0.50727','mscorwks.dll')));
const V4='<supportedRuntime version="v4.0"/>';
function runtimeConfig(text){
 if(/<supportedRuntime\b[^>]*version\s*=\s*["']v4\.0/i.test(text))return null;
 if(/<startup\b[^>]*\/>/i.test(text))return text.replace(/<startup\b([^>]*)\/>/i,(m,a)=>`<startup${/useLegacyV2RuntimeActivationPolicy/i.test(a)?a:a+' useLegacyV2RuntimeActivationPolicy="true"'}>${V4}</startup>`);
 if(/<startup\b[^>]*>/i.test(text))return text.replace(/<startup\b([^>]*)>/i,(m,a)=>`<startup${/useLegacyV2RuntimeActivationPolicy/i.test(a)?a:a+' useLegacyV2RuntimeActivationPolicy="true"'}>${V4}`);
 if(/<configuration\b[^>]*>/i.test(text))return text.replace(/<configuration\b[^>]*>/i,m=>`${m}<startup useLegacyV2RuntimeActivationPolicy="true">${V4}</startup>`);
 return null;
}
/* prepareDotnet(gameDir) gives each .NET 1.x-3.5 program in the folder a config that allows .NET 4; returns the configs written */
function prepareDotnet(dir,{windows=WINDOWS()}={}){
 if(netfx35(windows))return [];
 let exes=[];try{exes=fs.readdirSync(dir,{withFileTypes:true}).filter(e=>e.isFile()&&/\.exe$/i.test(e.name)).map(e=>e.name);}catch{return [];}
 const m=manifest.read(dir),written=[];
 for(const exe of exes){
  let info=null;try{if(fs.statSync(path.join(dir,exe)).size>256*1024*1024)continue;info=pe(fs.readFileSync(path.join(dir,exe)));}catch{continue;}
  if(!info?.clr||!/^v[12]\./.test(info.clr))continue;
  const name=exe+'.config',file=path.join(dir,name);let before=null;try{before=fs.readFileSync(file,'utf8');}catch{}
  const after=before===null?`<?xml version="1.0" encoding="utf-8"?>\r\n<configuration>\r\n  <startup useLegacyV2RuntimeActivationPolicy="true">\r\n    <supportedRuntime version="v4.0"/>\r\n  </startup>\r\n</configuration>\r\n`:runtimeConfig(before);
  if(!after)continue;
  try{fs.writeFileSync(file,after);}catch{continue;}
  if(before===null){if(!m.files.includes(name))m.files.push(name);m.kinds[name]='dotnet-config';}else if(!(name in m.configs))m.configs[name]=before;
  written.push(name);
 }
 if(written.length)manifest.write(dir,m);
 return written;
}

/* Fondue.exe processes with their command line and the program that started them */
function listFondue(){
 return new Promise(resolve=>execFile('tasklist.exe',['/FI','IMAGENAME eq fondue.exe','/FO','CSV','/NH'],{windowsHide:true,timeout:5000},(error,out)=>{
  if(error||!/fondue\.exe/i.test(String(out)))return resolve([]);
  const ps="[Console]::OutputEncoding=[Text.Encoding]::UTF8;@(Get-CimInstance Win32_Process -Filter \"Name='Fondue.exe'\" | ForEach-Object { $p=Get-CimInstance Win32_Process -Filter ('ProcessId='+$_.ParentProcessId); [pscustomobject]@{pid=$_.ProcessId;cmd=$_.CommandLine;parentPath=$p.ExecutablePath} }) | ConvertTo-Json -Compress";
  execFile(path.join(WINDOWS(),'System32','WindowsPowerShell','v1.0','powershell.exe'),['-NoProfile','-NonInteractive','-Command',ps],{windowsHide:true,timeout:15000,encoding:'utf8'},(e,o)=>{
   if(e)return resolve([]);try{const v=JSON.parse(String(o).trim()||'[]');resolve((Array.isArray(v)?v:[v]).filter(Boolean));}catch{resolve([]);}});
 }));
}
const killPid=pid=>new Promise(resolve=>execFile('taskkill.exe',['/PID',String(pid),'/F'],{windowsHide:true,timeout:5000},()=>resolve()));
const featureOf=cmd=>(/[/-]enable-feature:\s*"?([A-Za-z0-9_.-]+)/i.exec(String(cmd||''))||[])[1]||'unknown';
/* Fondue is started by the Program Compatibility Assistant service and names the program that asked: /caller-name:"saya.exe" */
const callerOf=cmd=>(/[/-]caller-name:\s*(?:"([^"]+)"|(\S+))/i.exec(String(cmd||''))||[]).slice(1).find(Boolean)||'';
const inside=(file,dir)=>{const f=path.resolve(String(file||'')).toLowerCase(),d=path.resolve(dir).toLowerCase();return f===d||f.startsWith(d.endsWith(path.sep)?d:d+path.sep);};
/* watch(gameDir) closes a Windows feature install window the game starts, until stop(); found lists the features asked for */
function watch(dir,{trace=()=>{},interval=1000,list=listFondue,kill=killPid,onFeature=()=>{}}={}){
 const found=[],seen=new Set();let stopped=false,timer=null,busy=false,names=null;
 const programNames=()=>names||(names=new Set(require('./directplay.cjs').programs(dir).filter(f=>/\.exe$/i.test(f)).map(f=>path.basename(f).toLowerCase())));
 const tick=async()=>{
  if(stopped||busy)return;busy=true;
  try{for(const p of await list()){
   if(!p?.pid||seen.has(p.pid))continue;seen.add(p.pid);
   /* only a window one of the game's programs asked for (its name, or Fondue started from the game folder) */
   const caller=path.basename(callerOf(p.cmd)).toLowerCase();
   /* the .NET shim asks as mscoreei.dll: during the game's launch that is the game */
   if(!(caller&&(programNames().has(caller)||caller==='mscoreei.dll'))&&!(p.parentPath&&inside(p.parentPath,dir))){trace('windows-feature-window-not-ours',{feature:featureOf(p.cmd),caller});continue;}
   const feature=featureOf(p.cmd);await kill(p.pid);found.push(feature);
   trace('windows-feature-window-closed',{feature,by:caller||(p.parentPath?path.basename(p.parentPath):'')});
   try{manifest.remember(dir,feature);}catch{}try{await onFeature(feature);}catch{}
  }}catch{}finally{busy=false;}
  if(!stopped)timer=setTimeout(tick,interval);
 };
 timer=setTimeout(tick,0);
 return {found,stop(){stopped=true;clearTimeout(timer);}};
}

/* install(feature) enables a Windows optional feature without a restart; one permission prompt */
function install(feature,{windows=WINDOWS(),run=null}={}){
 if(!/^[A-Za-z0-9][A-Za-z0-9_.-]{1,63}$/.test(String(feature||'')))return Promise.reject(Error('WINDOWS_FEATURE_UNKNOWN'));
 const dism=path.join(windows,'System32','dism.exe');
 const command=`$p=Start-Process -FilePath '${dism}' -ArgumentList '/Online','/Enable-Feature','/FeatureName:${feature}','/All','/NoRestart','/Quiet' -Verb RunAs -WindowStyle Hidden -Wait -PassThru;exit $p.ExitCode`;
 return new Promise((resolve,reject)=>{
  const done=code=>code===0||code===3010?resolve({ok:true,feature}):reject(Error(code===1?'WINDOWS_FEATURE_INSTALL_CANCELLED':'WINDOWS_FEATURE_INSTALL_FAILED '+code));
  if(run)return run(command).then(done,reject);
  const child=spawn(path.join(windows,'System32','WindowsPowerShell','v1.0','powershell.exe'),['-NoProfile','-NonInteractive','-Command',command],{windowsHide:true,stdio:'ignore'});
  child.on('error',reject);child.on('exit',done);});
}
module.exports={prepareDotnet,runtimeConfig,netfx35,watch,listFondue,featureOf,callerOf,install};
