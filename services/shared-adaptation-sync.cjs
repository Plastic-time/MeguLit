// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
/* E370 relay for shared adaptation records (services/shared-adaptation.cjs).

   The relay is meant to be a Cloudflare Worker + D1 on the maintainer's own domain (GitHub is unreliable from China):
     https://<domain>/api/adaptation
   It is not set up yet. Endpoint, in order: MEGULIT_ADAPTATION_ENDPOINT, then data/config/library.json
   "sharedAdaptationEndpoint". Only https (http only for localhost). With none, push and pull return
   {state:'not-configured'}; with the Settings switch 共享适配数据（匿名） off (library.json sharedAdaptation:false) they
   return {state:'disabled'}. Nothing but cleaned records is ever sent: no logs, paths, user names or game text.

   push(records) — POST <endpoint>
     request : {"version":1,"records":[<record v1>, ...]}          at most 50 records, each passed through clean()
     response: {"accepted":<n>,"rejected":<n>}                     200; any other status is an error
   pull(fingerprints) — POST <endpoint>/query
     request : {"version":1,"keys":["<64 hex fingerprint key>", ...]}   at most 50 keys
     response: {"records":[<record v1>, ...]}                      unknown keys are simply absent
   Pulled records are cleaned again and saved with origin "remote"; a local record for the same key is never replaced.
   Results: {state:'ok',accepted,rejected} / {state:'ok',records:[...]} / {state:'error',error:'HTTP_503'|'TIMEOUT'|...}. */
const fs=require('node:fs'),path=require('node:path');
const LIMIT=50,TIMEOUT=8000;
function readJSON(file){try{return JSON.parse(fs.readFileSync(file,'utf8'))||{};}catch{return {};}}
function endpointOf(value){if(typeof value!=='string'||!value.trim())return '';let url;try{url=new URL(value.trim());}catch{return '';}
 const local=['127.0.0.1','localhost','[::1]'].includes(url.hostname);if(url.username||url.password||url.search||url.hash||!(url.protocol==='https:'||url.protocol==='http:'&&local))return '';return url.href.replace(/\/+$/,'');}
function config(root,options={}){
 const lib=root?readJSON(path.join(root,'data','config','library.json')):{};
 const enabled=options.enabled??(lib.sharedAdaptation!==false);
 const endpoint=endpointOf(options.endpoint??process.env.MEGULIT_ADAPTATION_ENDPOINT??lib.sharedAdaptationEndpoint??'');
 return {enabled,endpoint};
}
async function post(url,body,fetcher){
 let r;try{r=await fetcher(url,{method:'POST',headers:{'content-type':'application/json','user-agent':'MeguLit'},body:JSON.stringify(body),signal:AbortSignal.timeout(TIMEOUT)});}
 catch(e){return {state:'error',error:e?.name==='TimeoutError'?'TIMEOUT':'NETWORK'};}
 if(!r.ok)return {state:'error',error:'HTTP_'+r.status};try{return {state:'ok',data:await r.json()};}catch{return {state:'error',error:'BAD_RESPONSE'};}
}
async function push(records,options={}){
 const {enabled,endpoint}=config(options.root,options);if(!enabled)return {state:'disabled'};if(!endpoint)return {state:'not-configured'};
 const {clean}=require('./shared-adaptation.cjs');const list=(Array.isArray(records)?records:[]).map(r=>clean(r)).filter(Boolean).slice(0,LIMIT);
 if(!list.length)return {state:'ok',accepted:0,rejected:0};
 const res=await post(endpoint,{version:1,records:list},options.fetch||fetch);if(res.state!=='ok')return res;
 return {state:'ok',accepted:Number(res.data?.accepted)||0,rejected:Number(res.data?.rejected)||0};
}
async function pull(fingerprints,options={}){
 const {enabled,endpoint}=config(options.root,options);if(!enabled)return {state:'disabled'};if(!endpoint)return {state:'not-configured'};
 const keys=[...new Set((Array.isArray(fingerprints)?fingerprints:[]).map(f=>typeof f==='string'?f:f?.key).filter(k=>/^[a-f0-9]{64}$/.test(String(k||''))))].slice(0,LIMIT);
 if(!keys.length)return {state:'ok',records:[]};
 const res=await post(endpoint+'/query',{version:1,keys},options.fetch||fetch);if(res.state!=='ok')return res;
 const shared=require('./shared-adaptation.cjs'),records=(Array.isArray(res.data?.records)?res.data.records:[]).map(r=>shared.clean(r)).filter(r=>r&&keys.includes(r.key));
 if(options.root)for(const r of records)shared.save(options.root,r,'remote');
 return {state:'ok',records};
}
module.exports={push,pull,config,endpointOf};
