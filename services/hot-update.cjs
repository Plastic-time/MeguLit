'use strict';
/* SPDX-License-Identifier: GPL-3.0-or-later
   Updates without a restart (user 2026-11-13: 不重启装更新). When a release changes only page and service files (not
   MeguLit.exe's own code, native helpers or HTML), Release.ps1 also publishes a small package of just those files:
     MeguLit-v<version>-hot-from-v<previous version>-<first 12 hex of the previous package's sha256>.zip
   It is offered only to an install that runs exactly that previous version from exactly that package (the digest kept in
   data/update-installed.json); everyone else gets the full package as before. The files are checked against hot.json in
   the package, the old copies kept in cache/update/hot-rollback, then written in place. data/hot-update.json names the
   exe they belong to, so MeguLit.exe serves the new pages from the web folder (desktop/src/hot_assets.rs) and the main
   window restarts the service and reloads its pages (hot_reload). */
const fs=require('fs'),path=require('path'),crypto=require('crypto'),{spawnSync}=require('child_process');
const NAME=/^MeguLit-v([0-9A-Za-z.-]+?)-hot-from-v([0-9A-Za-z.-]+?)-([a-f0-9]{12})\.zip$/i;
const HOSTS=new Set(['github.com','objects.githubusercontent.com','release-assets.githubusercontent.com']);
/* Only these folders may change in a hot update; native helpers, the runtime and user data never do. */
const ALLOWED=/^(web|services|core|setup)\//;
const sha=b=>crypto.createHash('sha256').update(b).digest('hex');

function asset(rel){
 for(const a of rel.assets||[]){const m=NAME.exec(a.name||'');if(!m)continue;
  try{const u=new URL(a.browser_download_url);if(u.protocol!=='https:'||!HOSTS.has(u.hostname))continue;}catch{continue;}
  const digest=/^sha256:[a-f0-9]{64}$/i.test(a.digest||'')?a.digest.slice(7).toLowerCase():'';if(!digest)continue;
  return {name:a.name,url:a.browser_download_url,size:a.size||0,digest,from:m[2],fromDigest:m[3].toLowerCase()};}
 return null;
}
/* the running install is exactly the one this package was made from */
function fits(hot,current,installed){return !!(hot&&installed&&String(current).replace(/^v/,'')===hot.from&&String(installed.digest||'').toLowerCase().startsWith(hot.fromDigest));}
function exeStamp(root){const s=fs.statSync(path.join(root,'MeguLit.exe'));return s.size+'-'+Math.floor(s.mtimeMs);}
function safe(rel){return typeof rel==='string'&&ALLOWED.test(rel)&&!/\.html?$/i.test(rel)&&rel.split('/').every(p=>p&&p!=='.'&&p!=='..'&&!/[:\\]/.test(p));}

function extract(zip,dest,run=spawnSync){
 fs.rmSync(dest,{recursive:true,force:true});fs.mkdirSync(dest,{recursive:true});
 const r=run('powershell.exe',['-NoProfile','-NonInteractive','-ExecutionPolicy','Bypass','-Command','Expand-Archive -LiteralPath $env:MEGULIT_HOT_ZIP -DestinationPath $env:MEGULIT_HOT_DEST -Force'],{windowsHide:true,env:{...process.env,MEGULIT_HOT_ZIP:zip,MEGULIT_HOT_DEST:dest}});
 if(!r||r.status!==0)throw Error('HOT_EXTRACT_FAILED');
}
/* Writes the files of a verified hot package; returns its manifest. Nothing is written unless every file checks out. */
function apply(root,zip,{run}={}){
 const stage=path.join(root,'cache','update','hot-stage');extract(zip,stage,run);
 try{
  const src=path.join(stage,'MeguLit');let manifest;
  try{manifest=JSON.parse(fs.readFileSync(path.join(src,'hot.json'),'utf8'));}catch{throw Error('HOT_MANIFEST_MISSING');}
  const files=Array.isArray(manifest.files)?manifest.files:[];if(!files.length)throw Error('HOT_MANIFEST_MISSING');
  const data=files.map(f=>{if(!safe(f.path))throw Error('HOT_PATH_REJECTED');let b;try{b=fs.readFileSync(path.join(src,...f.path.split('/')));}catch{throw Error('HOT_FILE_MISSING');}if(sha(b)!==String(f.sha256||'').toLowerCase())throw Error('HOT_HASH_MISMATCH');return {path:f.path,bytes:b};});
  const back=path.join(root,'cache','update','hot-rollback',String(manifest.version||'unknown').replace(/[^0-9A-Za-z.-]/g,'_'));
  fs.rmSync(back,{recursive:true,force:true});
  for(const f of data){const to=path.join(root,...f.path.split('/'));if(fs.existsSync(to)){const keep=path.join(back,...f.path.split('/'));fs.mkdirSync(path.dirname(keep),{recursive:true});fs.copyFileSync(to,keep);}}
  /* each file goes to a temporary name first, then replaces the old one in one step */
  for(const f of data){const to=path.join(root,...f.path.split('/')),tmp=to+'.hot-new';fs.mkdirSync(path.dirname(to),{recursive:true});fs.writeFileSync(tmp,f.bytes);fs.renameSync(tmp,to);}
  fs.mkdirSync(path.join(root,'data'),{recursive:true});
  fs.writeFileSync(path.join(root,'data','hot-update.json'),JSON.stringify({version:String(manifest.version||''),from:String(manifest.from||''),exe:exeStamp(root),files:data.length,at:new Date().toISOString()}));
  return manifest;
 }finally{fs.rmSync(stage,{recursive:true,force:true});}
}
module.exports={asset,fits,apply,exeStamp,safe,NAME};
