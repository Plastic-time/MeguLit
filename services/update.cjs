'use strict';
/* SPDX-License-Identifier: GPL-3.0-or-later
   Updates from GitHub Releases. On every start MeguLit checks the latest release; a newer one is downloaded in the
   background with real progress, verified (size, zip header, GitHub's sha256 digest) and kept in cache/update until the
   user restarts. A detached PowerShell script then waits for MeguLit to exit, copies the program files over the old ones
   and reopens it. data / logs / cache / runtime / models are never touched. */
const fs=require('fs'),path=require('path'),crypto=require('crypto'),{spawn}=require('child_process');
const REPO='https://api.github.com/repos/ilynthn/MeguLit/releases';
const ASSET=/^MeguLit-v(\d+)\.(\d+)\.(\d+)-win-x64\.zip$/;
const HOSTS=new Set(['github.com','objects.githubusercontent.com','release-assets.githubusercontent.com']);
const HEADERS={'User-Agent':'MeguLit-Updater','Accept':'application/vnd.github+json'};
const parse=v=>String(v||'').replace(/^v/,'').split('.').map(n=>Number(n)||0);
const newer=(a,b)=>{const x=parse(a),y=parse(b);for(let i=0;i<3;i++){if((x[i]||0)!==(y[i]||0))return (x[i]||0)>(y[i]||0);}return false;};

function asset(rel){
 const a=(rel.assets||[]).find(a=>ASSET.test(a.name));if(!a)throw Error('UPDATE_ASSET_MISSING');
 const url=new URL(a.browser_download_url);if(url.protocol!=='https:'||!HOSTS.has(url.hostname))throw Error('UPDATE_URL_REJECTED');
 return a;
}
async function latest(fetcher=fetch){
 const r=await fetcher(REPO+'/latest',{headers:HEADERS,signal:AbortSignal.timeout(15000)});
 if(!r.ok)throw Error('UPDATE_CHECK_FAILED');
 const rel=await r.json(),a=asset(rel);
 return {version:String(rel.tag_name||'').replace(/^v/,''),name:a.name,size:a.size,url:a.browser_download_url,digest:/^sha256:[a-f0-9]{64}$/i.test(a.digest||'')?a.digest.slice(7).toLowerCase():'',notes:String(rel.body||'').slice(0,6000),page:rel.html_url,published:rel.published_at||''};
}
/* Size of the package the user is running, for "bigger / smaller than now". Unknown is fine. */
async function installedSize(current,fetcher=fetch){
 try{const r=await fetcher(REPO+'/tags/v'+String(current).replace(/^v/,''),{headers:HEADERS,signal:AbortSignal.timeout(10000)});if(!r.ok)return 0;return asset(await r.json()).size||0;}catch{return 0;}
}

let state={phase:'idle'},job=null,found=null;
const status=()=>({...state});

async function check(current,fetcher=fetch){
 const rel=await latest(fetcher),isNewer=newer(rel.version,current);
 found=isNewer?rel:null;
 const previous=isNewer?await installedSize(current,fetcher):0;
 if(isNewer&&!['downloading','ready'].includes(state.phase))state={phase:'available',version:rel.version,total:rel.size,received:0};
 return {current,latest:rel.version,newer:isNewer,size:rel.size,previousSize:previous,delta:previous?rel.size-previous:null,notes:rel.notes,page:rel.page,published:rel.published,phase:state.phase};
}

/* Writes zip + script; resolves when the package is verified and ready to install. */
function start(root,current,fetcher=fetch){
 if(job)return job;
 job=(async()=>{
  try{
   const rel=found&&newer(found.version,current)?found:await latest(fetcher);if(!newer(rel.version,current))throw Error('ALREADY_LATEST');
   const dir=path.join(root,'cache','update');fs.mkdirSync(dir,{recursive:true});
   const zip=path.join(dir,rel.name),ps1=path.join(dir,'apply-update.ps1');
   state={phase:'downloading',version:rel.version,total:rel.size||0,received:0};
   let data=null;
   /* A package downloaded earlier (user chose "later") is reused when it still verifies. */
   if(fs.existsSync(zip)){const old=fs.readFileSync(zip);if((!rel.size||old.length===rel.size)&&(!rel.digest||crypto.createHash('sha256').update(old).digest('hex')===rel.digest))data=old;}
   if(!data){
    const r=await fetcher(rel.url,{headers:{'User-Agent':'MeguLit-Updater'},redirect:'follow',signal:AbortSignal.timeout(600000)});
    if(!r.ok)throw Error('UPDATE_DOWNLOAD_FAILED');
    const final=new URL(r.url||rel.url);if(final.protocol!=='https:'||!HOSTS.has(final.hostname))throw Error('UPDATE_URL_REJECTED');
    const total=Number(r.headers?.get?.('content-length'))||rel.size||0;state.total=total;
    const chunks=[];
    if(r.body&&r.body.getReader){const reader=r.body.getReader();for(;;){const {done,value}=await reader.read();if(done)break;chunks.push(Buffer.from(value));state.received+=value.length;}}
    else{const b=Buffer.from(await r.arrayBuffer());chunks.push(b);state.received=b.length;}
    data=Buffer.concat(chunks);
   }
   state.received=data.length;
   if(rel.size&&data.length!==rel.size)throw Error('UPDATE_SIZE_MISMATCH');
   if(data.subarray(0,2).toString('latin1')!=='PK')throw Error('UPDATE_NOT_ZIP');
   const hash=crypto.createHash('sha256').update(data).digest('hex');if(rel.digest&&hash!==rel.digest)throw Error('UPDATE_HASH_MISMATCH');
   fs.writeFileSync(zip,data);fs.writeFileSync(ps1,'﻿'+script(),'utf8');
   state={phase:'ready',version:rel.version,total:data.length,received:data.length,sha256:hash,zip,ps1};
   return status();
  }catch(error){state={...state,phase:'error',error:/^[A-Z_]+$/.test(error.message)?error.message:'UPDATE_DOWNLOAD_FAILED'};job=null;throw Error(state.error);}
 })();
 job.catch(()=>{});
 return job;
}

/* Hands the verified package to the script; the caller then quits MeguLit.
   v1.1.2 (user, 2026-11-09: "restart and update" reopened the same version, logs/update.log never appeared): a detached
   powershell.exe started from MeguLit's service exits at once without running anything, and a plain child dies with
   MeguLit. The script is therefore started by Windows itself through WMI (Win32_Process.Create), outside MeguLit's
   process tree, and the launcher's return code is checked before MeguLit is allowed to quit. */
function launchScript(root,{run=spawn}={}){
 /* v1.1.4: Windows 11 hands console programs to Windows Terminal, which ignores -WindowStyle Hidden and showed the
    script's progress window. conhost --headless runs it with no window at all; the startup info also asks for SW_HIDE. */
 const line=`conhost.exe --headless powershell.exe -NoProfile -NonInteractive -ExecutionPolicy Bypass -WindowStyle Hidden -File "${state.ps1}" -Root "${root}" -Zip "${state.zip}"`;
 const create='$s=New-CimInstance -ClassName Win32_ProcessStartup -ClientOnly -Property @{ShowWindow=[uint16]0};$r=Invoke-CimMethod -ClassName Win32_Process -MethodName Create -Arguments @{CommandLine=$env:MEGULIT_UPDATE_COMMAND;ProcessStartupInformation=$s};exit [int]$r.ReturnValue';
 return new Promise(resolve=>{
  let child;try{child=run('powershell.exe',['-NoProfile','-ExecutionPolicy','Bypass','-Command',create],{stdio:'ignore',windowsHide:true,env:{...process.env,MEGULIT_UPDATE_COMMAND:line}});}catch{resolve(false);return;}
  const timer=setTimeout(()=>resolve(false),20000);
  child.on('error',()=>{clearTimeout(timer);resolve(false);});
  child.on('exit',code=>{clearTimeout(timer);resolve(code===0);});
 });
}
async function install(root,options){
 if(state.phase!=='ready'||!state.zip||!fs.existsSync(state.zip))throw Error('UPDATE_NOT_READY');
 fs.mkdirSync(path.join(root,'logs'),{recursive:true});
 if(!/^[^"]+$/.test(root+state.ps1+state.zip))throw Error('UPDATE_PATH_REJECTED');
 if(!await launchScript(root,options))throw Error('UPDATE_LAUNCH_FAILED');
 state={...state,phase:'installing'};return status();
}
async function apply(root,current,fetcher=fetch){await start(root,current,fetcher);return {...await install(root),staged:true};}

/* Runs after MeguLit has exited: only files that exist in the zip are copied. */
function script(){return `param([string]$Root,[string]$Zip)
$ErrorActionPreference='Stop'
$ProgressPreference='SilentlyContinue'
$log=Join-Path $Root 'logs\\update.log'
New-Item -ItemType Directory -Force (Split-Path $log) -ErrorAction SilentlyContinue | Out-Null
function Log($m){try{Add-Content -LiteralPath $log -Value ((Get-Date -Format o)+' '+$m) -Encoding utf8}catch{}}
try{
 Log "start $Zip"
 $exe=Join-Path $Root 'MeguLit.exe'
 for($i=0;$i -lt 60;$i++){ if(-not (Get-Process -ErrorAction SilentlyContinue | Where-Object { $_.Path -eq $exe })){break}; Start-Sleep -Milliseconds 500 }
 Get-Process -ErrorAction SilentlyContinue | Where-Object { $_.Path -eq $exe } | Stop-Process -Force
 Start-Sleep -Milliseconds 800
 $stage=Join-Path $Root 'cache\\update\\stage'
 if(Test-Path $stage){Remove-Item $stage -Recurse -Force}
 Expand-Archive -LiteralPath $Zip -DestinationPath $stage -Force
 $src=Join-Path $stage 'MeguLit'
 if(-not (Test-Path (Join-Path $src 'MeguLit.exe'))){throw 'zip has no MeguLit\\MeguLit.exe'}
 $backup=Join-Path $Root ('MeguLit.rollback-update.exe')
 Copy-Item -LiteralPath $exe -Destination $backup -Force
 & robocopy $src $Root /E /R:5 /W:1 /NFL /NDL /NJH /NJS /XD data logs cache runtime models | Out-Null
 if($LASTEXITCODE -ge 8){throw "robocopy failed $LASTEXITCODE"}
 Log 'copied'
 Remove-Item $stage -Recurse -Force -ErrorAction SilentlyContinue
 Remove-Item -LiteralPath $Zip -Force -ErrorAction SilentlyContinue
}catch{ Log ('failed: '+$_) }
Start-Process -FilePath (Join-Path $Root 'MeguLit.exe') -WorkingDirectory $Root
Log 'restarted'
`;}
function reset(){state={phase:'idle'};job=null;found=null;}
module.exports={check,start,status,install,apply,newer,latest,installedSize,reset,launchScript};
