// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
/* 2026-11-21 (owner: 游戏差分全自动生成, the server half) this PC's calibration goes to the relay, the agreed result of other
   players comes back (relay/src/auto-profile.js, docs/auto-profile.md).
   - report(root, record): after a calibration or a gate step-down, the record's upload block (core/auto-profile.cjs diagnostic)
     is posted to /api/auto-profile/report. Same switch as the other shared adaptation data (共享适配, shared-adaptation.cjs).
   - cached(root, key): the last answer for a game, kept in data/config/auto-profiles-feed/<key>.json (sync, used at game start).
   - refresh(root, key): fetches the answer again when the copy is older than a day (a "none" answer is kept 6 hours).
   The shared result is the auto layer only while this PC has no calibration of its own (services/self-check-live.cjs). */
const fs=require('node:fs'),path=require('node:path');
const auto=require('../core/auto-profile.cjs');
const TIMEOUT=15000,FRESH_MS=24*3600000,NONE_MS=6*3600000,KEY=/^[a-z0-9][a-z0-9-]{1,62}$/;
const dir=root=>path.join(root,'data','config','auto-profiles-feed');
function sharing(root){try{return require('./shared-adaptation.cjs').enabled(root);}catch{return true;}}
function endpoints(root,route){try{return require('./relay-config.cjs').endpoints(root,route);}catch{return [];}}
function cached(root,key){if(!KEY.test(String(key||'')))return null;try{const v=JSON.parse(fs.readFileSync(path.join(dir(root),key+'.json'),'utf8'));return v&&typeof v==='object'?v:null;}catch{return null;}}
function keep(root,key,v){fs.mkdirSync(dir(root),{recursive:true});const f=path.join(dir(root),key+'.json'),tmp=f+'.'+process.pid+'.tmp';fs.writeFileSync(tmp,JSON.stringify(v));fs.renameSync(tmp,f);}
/* the answer as an auto layer, or null (none, malformed, another key) */
function layer(answer,key){if(!answer||answer.none||answer.schema!=='megulit.auto-profile'||answer.key!==key||!['hide','read'].includes(answer.mode)||!answer.settings||typeof answer.settings!=='object')return null;
 return {mode:answer.mode,settings:answer.mode==='read'?{...answer.settings,hide:{textEffectsRead:true}}:answer.settings,agree:answer.agree|0,reporters:answer.reporters|0};}
async function refresh(root,key,{fetcher=globalThis.fetch,now=Date.now(),force=false}={}){if(!KEY.test(String(key||''))||!fetcher)return null;
 const old=cached(root,key);if(!force&&old&&now-(old.fetchedAt||0)<(old.none?NONE_MS:FRESH_MS))return old;
 for(const url of endpoints(root,'/api/auto-profile/'+key)){try{const r=await fetcher(url,{headers:{'user-agent':'MeguLit',accept:'application/json'},signal:AbortSignal.timeout(TIMEOUT)});
   if(r.status===404){const v={none:true,key,fetchedAt:now};keep(root,key,v);return v;}
   if(!r.ok)continue;const text=await r.text();if(text.length>64*1024)continue;const v=JSON.parse(text);if(!layer(v,key))continue;v.fetchedAt=now;keep(root,key,v);return v;}catch{}}
 return old;}
async function report(root,record,{fetcher=globalThis.fetch}={}){if(!record||!sharing(root))return {state:'skipped'};const block=auto.diagnostic(record)?.profile;if(!block||!KEY.test(String(block.key||'')))return {state:'skipped'};
 const body=JSON.stringify({version:1,profile:block});
 for(const url of endpoints(root,'/api/auto-profile/report')){try{const r=await fetcher(url,{method:'POST',headers:{'content-type':'application/json','user-agent':'MeguLit'},body,signal:AbortSignal.timeout(TIMEOUT)});if(r.ok)return {state:'sent'};if(r.status>=400&&r.status<500&&r.status!==429)return {state:'refused',status:r.status};}catch{}}
 return {state:'failed'};}
module.exports={cached,refresh,report,layer,dir};
