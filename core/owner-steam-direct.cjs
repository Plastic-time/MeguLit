// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
const fs=require('node:fs'),path=require('node:path');
const Owner=require('./owner-tests.cjs');
const LIMITS=Object.freeze({files:4096,fileBytes:2*1024**3,totalBytes:6*1024**3,deadline:45000,floor:10*1024**3,reserve:1024**2});
const sessions=new WeakMap(),CAPS=['roles','embed','diagnostic-input','lua-input'];
const OMIT=/^(?:steam_appid\.txt|megulit[-_.].*|log\.txt|traceback\.txt|errors\.txt|.*\.sav|save.*\.(?:dat|json|rvdata\d?)|global\.(?:dat|sav))$/i;
const DATA=/\.(?:exe|dll|cfg|config|ini|json|xml|py|pyc|pyd|dat|xp3|rpa|pfs(?:\.\d{3})?|hcb|paz|int|arc|mpk|bin|pak|npk|nsa|ypf|ain|rld|mes|spt|iga|pack|g00|tbl|wad)$|^(?:drlanguage|gamecontrollerdb)\.txt$/i;
const PRIVATE_DIR=/^(?:save(?:data|s)?|config|cache|logs?|userdata|user[_-]?data|screenshots?|backups?)$/i;
const fail=code=>{throw Object.assign(Error(code),{code});};
function canonical(file){let p=path.resolve(file);for(;;){if(fs.lstatSync(p).isSymbolicLink())fail('OWNER_STEAM_REPARSE');const q=path.dirname(p);if(q===p)break;p=q;}const real=fs.realpathSync.native(file);if(real.toLowerCase()!==path.resolve(file).toLowerCase())fail('OWNER_STEAM_REPARSE');return real;}
const stamp=s=>[s.dev,s.ino,s.size,s.mtimeNs,s.ctimeNs].join(':');
const freeBytes=root=>{const s=fs.statfsSync(root,{bigint:true});return Number(s.bavail*s.bsize);};
function permitted(root,exe,engine,token){return Owner.privateMode(root)&&Owner.lookup(root,exe,engine)===token&&Owner.identity(token,exe)===canonical(exe)&&CAPS.some(capability=>Owner.allowed(token,{exe,engine,capability}));}
function plan(exe){const source=canonical(exe),dir=path.dirname(source),files=[],directories=[],emptyDirectories=[];let total=0;const entries=fs.readdirSync(dir,{withFileTypes:true});if(entries.length>LIMITS.files)fail('OWNER_STEAM_FILE_BUDGET');for(const e of entries){const from=path.join(dir,e.name),s=fs.lstatSync(from);if(s.isSymbolicLink())fail('OWNER_STEAM_REPARSE');if(s.isDirectory()){(PRIVATE_DIR.test(e.name)?emptyDirectories:directories).push({from,name:e.name});continue;}if(!s.isFile()||OMIT.test(e.name)||!DATA.test(e.name))continue;if(s.size>LIMITS.fileBytes||(total+=s.size)>LIMITS.totalBytes)fail('OWNER_STEAM_COPY_BUDGET');files.push({from,name:e.name,bytes:s.size,stamp:stamp(fs.statSync(from,{bigint:true}))});}if(!files.some(f=>f.from===source))fail('OWNER_STEAM_EXE');return {source,dir,files,directories,emptyDirectories,totalBytes:total};}
async function prepare({root,exe,engine,appid,token,signal,trace=()=>{}},{space=freeBytes,query,copyStep,clock=()=>performance.now()}={}){
 if(!/^[1-9]\d{0,9}$/.test(String(appid))||Number(appid)>0xffffffff)fail('OWNER_STEAM_APPID');
 root=canonical(root);exe=canonical(exe);
 if(!permitted(root,exe,engine,token)||Owner.launchPolicy(root,exe,engine)!=='private-steam'||Owner.describe(token).phase!=='prepared')fail('RESTART_FROM_OWNER_TEST_ENTRY');
 if(sessions.has(token))fail('OWNER_STEAM_SESSION_BUSY');
 let lastPermissionCheck=-Infinity;const state={stopped:false,confirmed:null,copying:null,off:null},deadline=clock()+LIMITS.deadline;
 sessions.set(token,state);
 const check=()=>{if(state.stopped||signal?.aborted)fail('OWNER_STEAM_CANCELLED');if(clock()>deadline&&!state.copyComplete)fail('OWNER_STEAM_COPY_TIMEOUT');if(clock()-lastPermissionCheck>250){lastPermissionCheck=clock();if(!permitted(root,exe,engine,token))fail('OWNER_STEAM_IDENTITY_CHANGED');}};
 const stop=async()=>{state.stopped=true;Owner.revoke(token);state.off?.();signal?.removeEventListener('abort',abort);if(state.copying)await state.copying.catch(()=>{});};
 state.off=Owner.onRevoke(token,()=>{state.stopped=true;});
 const abort=()=>{state.stopped=true;Owner.revoke(token);};signal?.addEventListener('abort',abort,{once:true});
 let shadow,lastSpace=-Infinity;
 try{
  const selected=plan(exe),parent=path.join(root,'data','steam-shadow');check();
  if(space(root)-selected.totalBytes-LIMITS.reserve<LIMITS.floor)fail('OWNER_STEAM_DISK_BUDGET');
  fs.mkdirSync(parent,{recursive:true});canonical(parent);shadow=fs.mkdtempSync(path.join(parent,'session-'));canonical(shadow);
  state.copying=(async()=>{for(const item of selected.files){check();let input,output;try{input=await fs.promises.open(item.from,'r');if(stamp(await input.stat({bigint:true}))!==item.stamp)fail('OWNER_STEAM_IDENTITY_CHANGED');output=await fs.promises.open(path.join(shadow,item.name),'wx');const buffer=Buffer.allocUnsafe(256*1024);let n=0;for(;;){check();if(clock()-lastSpace>500){lastSpace=clock();if(space(root)<LIMITS.floor)fail('OWNER_STEAM_DISK_BUDGET');}const r=await input.read(buffer,0,Math.min(buffer.length,item.bytes-n+1),null);if(!r.bytesRead)break;n+=r.bytesRead;if(n>item.bytes)fail('OWNER_STEAM_IDENTITY_CHANGED');let written=0;while(written<r.bytesRead){const w=await output.write(buffer,written,r.bytesRead-written,null);if(!w.bytesWritten)fail('OWNER_STEAM_COPY_WRITE');written+=w.bytesWritten;}await copyStep?.(item,n);}if(n!==item.bytes||stamp(await input.stat({bigint:true}))!==item.stamp||stamp(fs.statSync(item.from,{bigint:true}))!==item.stamp)fail('OWNER_STEAM_IDENTITY_CHANGED');}finally{const closed=await Promise.allSettled([input?.close(),output?.close()]);const error=closed.find(r=>r.status==='rejected');if(error)throw error.reason;}}})();
  await state.copying;lastPermissionCheck=-Infinity;check();
  // Resource directories remain references; this is not a general game-save sandbox.
  for(const d of selected.directories){check();if(canonical(d.from)!==d.from)fail('OWNER_STEAM_REPARSE');await fs.promises.symlink(d.from,path.join(shadow,d.name),'junction');}
  for(const d of selected.emptyDirectories)fs.mkdirSync(path.join(shadow,d.name));
  fs.writeFileSync(path.join(shadow,'steam_appid.txt'),String(appid),{flag:'wx'});
  const alias=path.join(shadow,path.basename(exe));
  if(!await Owner.registerLaunch(token,{exe:alias,engine,kind:'steam-direct',signal}))fail('OWNER_STEAM_ALIAS_REJECTED');
  check();state.copyComplete=true;
  fs.writeFileSync(path.join(shadow,'megulit-owner-steam.json'),JSON.stringify({version:1,source:exe,engine,copiedBytes:selected.totalBytes,resourceDirectories:selected.directories.map(d=>d.name),saveIsolation:false}),{flag:'wx'});
  const actualQuery=query||((r,x)=>require('../services/game-process.cjs').gameProcesses(r,x));
  const confirm=async pid=>{try{check();const found=await actualQuery(root,alias);check();const matches=found.filter(p=>p.pid===pid&&typeof p.started==='string'&&p.started);if(matches.length!==1||!Owner.confirmLaunch(token,{exe:alias,pid,birth:matches[0].started}))fail('RESTART_FROM_OWNER_TEST_ENTRY');state.confirmed={pid,birth:matches[0].started};return true;}catch(e){await stop();throw e;}};
  const session={get stopped(){return state.stopped;},stop,exited:stop,confirm};
  trace('owner-steam-prepared',{copiedBytes:selected.totalBytes,referenceDirectories:selected.directories.length});
  return {exe:alias,cwd:shadow,shadow,env:{SteamAppId:String(appid),SteamGameId:String(appid),SteamOverlayGameId:String(appid),TEMP:path.join(root,'cache','owner-temp'),TMP:path.join(root,'cache','owner-temp')},session,confirm,ownerTestGrant:token,privateOwner:true};
 }catch(e){state.stopped=true;Owner.revoke(token);state.off?.();trace('owner-steam-incomplete',{code:e.code||e.message,shadow});if(!/^(?:OWNER_STEAM_|RESTART_FROM_OWNER_TEST_ENTRY)/.test(e?.code||e?.message||''))throw Object.assign(Error('OWNER_STEAM_PREPARE_FAILED'),{code:'OWNER_STEAM_PREPARE_FAILED',detail:e?.code||'IO'});throw e;}
 finally{if(state.stopped)signal?.removeEventListener('abort',abort);}
}
module.exports={LIMITS,plan,prepare};
