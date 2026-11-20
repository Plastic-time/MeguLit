// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
/* 2026-11-21 (owner: 每部游戏按 exe 哈希一份差分；官方差分优先，自动校准兜底；签名下发，客户端验签) game diffs from the relay
   (relay/src/auto-profile.js, docs/auto-profile.md). Hot update: nothing is rebuilt or reinstalled, a fetched diff is a profile
   layer the next time (or the moment) the game starts.
   - report(root, record): after a calibration or a gate step-down this PC's result goes to /api/game-profile/report (the
     共享适配 switch, shared-adaptation.cjs). A step-down also puts the exe in the maintainer's repair queue.
   - cached(root, key) / refresh(root, key): the relay's answer per exe key, kept in data/config/auto-profiles-feed/<key>.json
     (a day; a "none" answer 6 hours).
   - layer(answer, key): the answer as a layer, or null. Checked here, whatever the relay said: the document shape and every
     value (core/game-diff.cjs, core/profiles/domains.cjs), and its Ed25519 signature by one of our profile keys
     (services/profile-keys.json; we sign offline, tools/sign-profile.cjs, the relay holds no key). Anything else is ignored, so a
     broken or poisoned relay can at worst hand out nothing. */
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const auto=require('../core/auto-profile.cjs'),gameDiff=require('../core/game-diff.cjs');
const TIMEOUT=15000,FRESH_MS=24*3600000,NONE_MS=6*3600000;
const dir=root=>path.join(root,'data','config','auto-profiles-feed');
/* 2026-11-21 (owner: 「这两个可以都开了 我已经和他们说了 全答应了」) uploading calibrations has its own switch, library.json
   autoProfileShare, on unless the player turns it off (=== false), on top of 共享适配 (sharedAdaptation, used by other features, untouched).
   Fetching diffs is not an upload and is always on. */
function sharing(root){let lib={};try{lib=JSON.parse(fs.readFileSync(path.join(root,'data','config','library.json'),'utf8'))||{};}catch{}if(lib.autoProfileShare===false)return false;try{return require('./shared-adaptation.cjs').enabled(root);}catch{return false;}}
function setSharing(root,on){const f=path.join(root,'data','config','library.json');let lib={};try{lib=JSON.parse(fs.readFileSync(f,'utf8'))||{};}catch{}fs.mkdirSync(path.dirname(f),{recursive:true});const tmp=f+'.'+process.pid+'.tmp';fs.writeFileSync(tmp,JSON.stringify({...lib,autoProfileShare:on===true},null,2));fs.renameSync(tmp,f);return sharing(root);}
function endpoints(root,route){try{return require('./relay-config.cjs').endpoints(root,route);}catch{return [];}}
function keyList(file){try{const raw=JSON.parse(fs.readFileSync(path.join(__dirname,file),'utf8'));return (Array.isArray(raw.keys)?raw.keys:[]).filter(k=>k&&k.alg==='ed25519'&&typeof k.id==='string'&&typeof k.publicKey==='string'&&!k.revoked);}catch{return [];}}
let trusted=null;
/* {official:[maintainer keys], auto:[relay keys + maintainer keys]} */
function keys(){return trusted||keyList('profile-keys.json');}
/* tests trust their own keys */
function _trust(v){trusted=v||null;}
function verify(doc,list){const s=doc?.signature;if(!s||s.alg!=='ed25519'||typeof s.keyId!=='string'||typeof s.value!=='string')return false;const k=list.find(x=>x.id===s.keyId);if(!k)return false;
 try{return crypto.verify(null,Buffer.from(gameDiff.canonical(gameDiff.unsigned(doc))),crypto.createPublicKey({key:Buffer.from(k.publicKey,'base64'),format:'der',type:'spki'}),Buffer.from(s.value,'base64'));}catch{return false;}}
function layer(answer,key){const d=answer?.diff;if(!answer||answer.schema!=='megulit.game-diff-feed'||answer.key!==key||!d||(d.layer!=='game'&&d.key!==key))return null;
 if(!gameDiff.validate(d).ok)return null;if(!verify(d,keys()))return null;
 return {source:d.source,mode:d.mode,settings:d.settings,agree:d.agree|0,reporters:d.reporters|0,issuedAt:d.issuedAt||''};}
function cached(root,key){if(!gameDiff.KEY.test(String(key||'')))return null;try{const v=JSON.parse(fs.readFileSync(path.join(dir(root),key+'.json'),'utf8'));return v&&typeof v==='object'?v:null;}catch{return null;}}
function keep(root,key,v){fs.mkdirSync(dir(root),{recursive:true});const f=path.join(dir(root),key+'.json'),tmp=f+'.'+process.pid+'.tmp';fs.writeFileSync(tmp,JSON.stringify(v));fs.renameSync(tmp,f);}
async function refresh(root,key,{fetcher=globalThis.fetch,now=Date.now(),force=false}={}){if(!gameDiff.KEY.test(String(key||''))||!fetcher)return null;
 const old=cached(root,key);if(!force&&old&&now-(old.fetchedAt||0)<(old.none?NONE_MS:FRESH_MS))return old;
 for(const url of endpoints(root,'/api/game-profile/'+key)){try{const r=await fetcher(url,{headers:{'user-agent':'MeguLit',accept:'application/json'},signal:AbortSignal.timeout(TIMEOUT)});
   if(r.status===404){const v={none:true,key,fetchedAt:now};keep(root,key,v);return v;}
   if(!r.ok)continue;const text=await r.text();if(text.length>64*1024)continue;const v=JSON.parse(text);if(!layer(v,key))continue;v.fetchedAt=now;keep(root,key,v);return v;}catch{}}
 return old;}
async function report(root,record,{fetcher=globalThis.fetch}={}){if(!record||!sharing(root))return {state:'skipped'};const block=auto.diagnostic(record)?.profile;if(!block||!gameDiff.KEY.test(String(block.key||'')))return {state:'skipped'};
 const body=JSON.stringify({version:1,profile:block});
 for(const url of endpoints(root,'/api/game-profile/report')){try{const r=await fetcher(url,{method:'POST',headers:{'content-type':'application/json','user-agent':'MeguLit'},body,signal:AbortSignal.timeout(TIMEOUT)});if(r.ok)return {state:'sent'};if(r.status>=400&&r.status<500&&r.status!==429)return {state:'refused',status:r.status};}catch{}}
 return {state:'failed'};}
module.exports={cached,refresh,report,layer,verify,keys,_trust,dir,sharing,setSharing};
