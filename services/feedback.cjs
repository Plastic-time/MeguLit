// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
/* E394 in-app feedback and game requests: the same relay form as megulit.com (POST /api/feedback), never a GitHub link,
   since GitHub does not open for many users in mainland China. The relay stores each entry first and opens the issue
   itself. send() resolves {ok:true,url} or {ok:false,error}. */
const {endpoints}=require('./relay-config.cjs');
const KINDS=new Set(['feedback','game']),LANGS=new Set(['zh','ja','en']);
async function send(root,{kind,text,contact='',lang='zh',version=''}={},{fetcher=globalThis.fetch,env=process.env}={}){
 if(!KINDS.has(kind))return {ok:false,error:'INVALID_KIND'};
 const body=String(text||'').trim();if(!body)return {ok:false,error:'EMPTY'};
 const urls=endpoints(root,'/api/feedback',env);if(!urls.length)return {ok:false,error:'RELAY_NOT_CONFIGURED'};
 const page=('app/'+String(version||'').replace(/[^\w.-]/g,'')).slice(0,40).replace(/\/$/,'');
 /* 2026-11-15 both relays, cn-api first; the next one only when this one is unreachable, rate limited or 5xx */
 const payload=JSON.stringify({kind,text:body.slice(0,kind==='game'?256:2000),contact:String(contact||'').slice(0,120),lang:LANGS.has(lang)?lang:'zh',page});
 let last={ok:false,error:'NETWORK'};
 for(const url of urls){
  try{
   const response=await fetcher(url,{method:'POST',headers:{'content-type':'application/json'},body:payload,signal:AbortSignal.timeout(20000)});
   let data={};try{data=await response.json();}catch{}
   if(!response.ok||data.ok===false){last={ok:false,error:String(data.error||('HTTP_'+response.status)).slice(0,60)};if(response.status===429||response.status>=500)continue;return last;}
   return {ok:true,url:/^https:\/\//.test(String(data.url||''))?String(data.url):''};
  }catch(error){last={ok:false,error:error?.name==='TimeoutError'?'TIMEOUT':'NETWORK'};}
 }
 return last;
}
module.exports={send};
