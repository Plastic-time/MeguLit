// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
// Cold tool glue for the runtime-dump pack (convention: see "dump" in core/runtime-packs.cjs). Called when a game is about to be
// hooked (core/hook-native.cjs): makes sure MeguLitDump32/64.dll sit in <root>/native, where HookBridge looks for them, and
// when the pack is not installed starts a silent background download. No switch, no UI, nothing thrown: a failure is
// remembered for RETRY_MS and the next game start tries again. The game being started now is not held up; HookBridge injects
// the DLL on the next start (or at once when the DLL is already there).
const fs=require('node:fs'),path=require('node:path');
const RETRY_MS=30*60000,FAILED=new Map();
const DLLS=['MeguLitDump32.dll','MeguLitDump64.dll'];

/* copy runtime/runtimedump/*.dll next to HookBridge when missing or older; true when both are in place */
function place(root){const from=path.join(root,'runtime','runtimedump'),to=path.join(root,'native');let ok=true;
 for(const f of DLLS){const src=path.join(from,f),dst=path.join(to,f);
  try{if(!fs.existsSync(src)){ok=ok&&fs.existsSync(dst);continue;}const s=fs.statSync(src);let d=null;try{d=fs.statSync(dst);}catch{}
   if(!d||d.size!==s.size||d.mtimeMs<s.mtimeMs){fs.mkdirSync(to,{recursive:true});fs.copyFileSync(src,dst);}}catch{ok=false;}}
 return ok;}

/* returns 'ready' | 'downloading' | 'skipped'; never throws */
function prepare(root,{packs}={}){try{
 if(process.env.MEGULIT_RUNTIME_DUMP_OFF==='1')return'skipped';
 const store=packs||require('../core/runtime-packs.cjs').RuntimePacks.shared(root),pack=store.manifest().packs?.dump;
 if(!pack)return place(root)?'ready':'skipped';
 if(store.installed('dump'))return place(root)?'ready':'skipped';
 if(!pack.sha256||!(pack.urls||[]).length)return'skipped';          /* not published yet */
 const at=FAILED.get(root);if(at&&Date.now()-at<RETRY_MS)return'skipped';
 if(store.jobs.dump&&['queued','downloading'].includes(store.jobs.dump.state))return'downloading';
 store.ensure('dump',{timeout:10*60000}).then(()=>place(root),()=>FAILED.set(root,Date.now())).catch(()=>{});
 return'downloading';}catch{return'skipped';}}

module.exports={prepare,place,DLLS,_failed:FAILED};
