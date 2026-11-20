// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
/* 2026-11-21 hot update of the official per-game diff (core/profiles/remote.cjs). When a game is bound and its program hash is
   known, GET <relay>/api/profile/<exeSha256> once per run in the background:
     200 {signed megulit.profile document}  -> checked (schema, exe hash, kernel keys, Ed25519) and stored when newer
     404 / 204                              -> no official diff for this version
   The stored file is what the next profileFor reads; services/reader.cjs applies it to the running game at once.
   ?have=<version> lets the relay answer 304 when this PC already has that version. Nothing is sent but the exe hash. */
const Remote=require('../core/profiles/remote.cjs');
const TIMEOUT=8000,MAX_BYTES=64*1024;
const pulled=new Map();/* exeSha256 -> time of the last pull this run */
async function pull(root,exeSha256,{fetcher=globalThis.fetch,trace=()=>{},keys,force=false,env=process.env}={}){
 if(!/^[0-9a-f]{64}$/.test(String(exeSha256||'')))return {state:'no-hash'};
 if(!force&&pulled.has(exeSha256)&&Date.now()-pulled.get(exeSha256)<6*3600e3)return {state:'recent'};pulled.set(exeSha256,Date.now());
 let base='';try{base=require('./relay-config.cjs').relayBase(root,env);}catch{}if(!base||typeof fetcher!=='function')return {state:'not-configured'};
 const have=Remote.load(root,exeSha256,keys);const url=base+'/api/profile/'+exeSha256+(have.ok?'?have='+have.doc.version:'');
 let r;try{r=await fetcher(url,{headers:{'user-agent':'MeguLit',accept:'application/json'},signal:AbortSignal.timeout(TIMEOUT)});}catch(e){trace('profile pull failed: '+(e?.name==='TimeoutError'?'timeout':e?.message||e));return {state:'offline'};}
 if(r.status===304)return {state:'current',version:have.ok?have.doc.version:0};
 if(r.status===404||r.status===204)return {state:'none'};
 if(!r.ok){trace('profile pull HTTP '+r.status);return {state:'error',status:r.status};}
 const text=await r.text();if(text.length>MAX_BYTES){trace('profile pull rejected: too large');return {state:'rejected',reason:'too large'};}
 let doc;try{doc=JSON.parse(text);}catch{trace('profile pull rejected: not JSON');return {state:'rejected',reason:'not JSON'};}
 if(doc?.exeSha256!==exeSha256){trace('profile pull rejected: exeSha256 is another program');return {state:'rejected',reason:'exeSha256'};}
 let res;try{res=Remote.store(root,doc,keys);}catch(e){return {state:'error',reason:e.message};}
 if(res.stored){trace('profile pull stored v'+res.version+' exe='+exeSha256.slice(0,8));return {state:'stored',version:res.version};}
 if(/^not newer/.test(res.reason))return {state:'current',version:have.ok?have.doc.version:0};
 trace('profile pull rejected: '+res.reason);return {state:'rejected',reason:res.reason};}
module.exports={pull,_reset:()=>pulled.clear()};
