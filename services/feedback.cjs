// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
/* E394 in-app feedback and game requests: the same relay form as megulit.com (POST /api/feedback), never a GitHub link,
   since GitHub does not open for many users in mainland China. The relay stores each entry first and opens the issue
   itself. send() resolves {ok:true,url} or {ok:false,error}. */
const {endpoint}=require('./relay-config.cjs');
const KINDS=new Set(['feedback','game']),LANGS=new Set(['zh','ja','en']);
async function send(root,{kind,text,contact='',lang='zh',version=''}={},{fetcher=globalThis.fetch,env=process.env}={}){
 if(!KINDS.has(kind))return {ok:false,error:'INVALID_KIND'};
 const body=String(text||'').trim();if(!body)return {ok:false,error:'EMPTY'};
 const url=endpoint(root,'/api/feedback',env);if(!url)return {ok:false,error:'RELAY_NOT_CONFIGURED'};
 const page=('app/'+String(version||'').replace(/[^\w.-]/g,'')).slice(0,40).replace(/\/$/,'');
 try{
  const response=await fetcher(url,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({kind,text:body.slice(0,kind==='game'?200:2000),contact:String(contact||'').slice(0,120),lang:LANGS.has(lang)?lang:'zh',page}),signal:AbortSignal.timeout(20000)});
  let data={};try{data=await response.json();}catch{}
  if(!response.ok||data.ok===false)return {ok:false,error:String(data.error||('HTTP_'+response.status)).slice(0,60)};
  return {ok:true,url:/^https:\/\//.test(String(data.url||''))?String(data.url):''};
 }catch(error){return {ok:false,error:error?.name==='TimeoutError'?'TIMEOUT':'NETWORK'};}
}
module.exports={send};
