// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
/* 2026-11-21 传火碑 (web/torch-monument.js): reads of the relay's monument routes (relay/src/torch-credit.js).
   The page itself cannot reach the network (CSP connect-src is ipc only), so these go through the bridge.

     page(root,{month,cursor,limit})  GET /api/torch/monument   -> {ok,total,month,items:[{torchNo,name,at,game}],next}
     months(root)                     GET /api/torch/months     -> {ok,available,total,months:[{month,n}]}
     find(root,name)                  GET /api/torch/find?name= -> {ok,available,items:[{torchNo,name,at,month}]}
     me(root)                         GET /api/torch/me (+ the credits this PC keeps in data/The Seed/<key>.sent.json)

   Every route is tried on the relay hosts relay-config.endpoints() lists (api / cn-api, or the address saved in Settings).
   A route the relay does not have yet (404 NOT_FOUND) answers available:false so the page hides its button.
   `at` is unix seconds as the relay stores it. Names are cut to 30 characters (the relay's own limit). */
const fs=require('node:fs'),path=require('node:path');
const TIMEOUT=12000,NAME_MAX=30,GAME_MAX=120;
const MONTH=/^\d{4}-(0[1-9]|1[0-2])$/,KEY=/^[0-9a-f]{16,64}$/i;
function endpoints(root,route){try{return require('./relay-config.cjs').endpoints(root,route);}catch{return [];}}
const BAD_CP=c=>c<32||c===127||c===0x2028||c===0x2029||(c>=0x202a&&c<=0x202e)||(c>=0x2066&&c<=0x2069);
function cleanText(v,max){if(typeof v!=='string')return null;const t=[...v].map(ch=>BAD_CP(ch.codePointAt(0))?' ':ch).join('').replace(/\s+/g,' ').trim();
 const c=[...t].slice(0,max).join('').trim();return c||null;}
const seconds=v=>{if(Number.isFinite(v))return v>1e12?Math.floor(v/1000):Math.floor(v);if(typeof v==='string'&&v){const t=Date.parse(v);return Number.isFinite(t)?Math.floor(t/1000):0;}return 0;};
const monthOf=at=>at>0?new Date(at*1000).toISOString().slice(0,7):'';
function cleanItem(r){if(!r||typeof r!=='object')return null;const n=Number(r.torchNo);if(!Number.isInteger(n)||n<1)return null;const at=seconds(r.at);
 return {torchNo:n,name:cleanText(r.name,NAME_MAX),at,game:cleanText(r.game,GAME_MAX),month:MONTH.test(String(r.month||''))?r.month:monthOf(at)};}
/* GET on each relay host in turn: {status:'ok',json} | {status:'missing'} (route not deployed) | {status:'failed'} */
async function get(root,route,fetcher=globalThis.fetch){if(!fetcher)return {status:'failed'};let missing=false;
 for(const url of endpoints(root,route)){try{const r=await fetcher(url,{headers:{'user-agent':'MeguLit',accept:'application/json'},signal:AbortSignal.timeout(TIMEOUT)});
   if(r.status===404){let j=null;try{j=await r.json();}catch{}if(!j||j.error==='NOT_FOUND'){missing=true;continue;}}
   if(!r.ok)continue;const text=await r.text();if(text.length>2*1024*1024)continue;const j=JSON.parse(text);if(j&&j.ok===true)return {status:'ok',json:j};}catch{}}
 return {status:missing?'missing':'failed'};}
async function page(root,{month='',cursor='',limit=300}={},opts={}){
 const q=new URLSearchParams();if(MONTH.test(String(month||'')))q.set('month',month);if(/^\d{1,12}$/.test(String(cursor||'')))q.set('cursor',String(cursor));
 q.set('limit',String(Math.max(1,Math.min(500,Number(limit)||300))));
 const r=await get(root,'/api/torch/monument?'+q.toString(),opts.fetch);if(r.status!=='ok')return {ok:false,error:r.status==='missing'?'NOT_DEPLOYED':'OFFLINE'};
 const items=(Array.isArray(r.json.items)?r.json.items:[]).map(cleanItem).filter(Boolean).slice(0,500);
 return {ok:true,total:Math.max(0,Number(r.json.total)|0),month:MONTH.test(String(r.json.month||''))?r.json.month:null,items,next:/^\d{1,12}$/.test(String(r.json.next??''))?String(r.json.next):null};}
async function months(root,opts={}){const r=await get(root,'/api/torch/months',opts.fetch);if(r.status==='missing')return {ok:true,available:false,months:[]};if(r.status!=='ok')return {ok:false,available:true,months:[]};
 const list=(Array.isArray(r.json.months)?r.json.months:[]).filter(m=>m&&MONTH.test(String(m.month))&&Number(m.n)>0).map(m=>({month:m.month,n:Number(m.n)|0})).sort((a,b)=>a.month<b.month?-1:1);
 return {ok:true,available:true,total:Math.max(0,Number(r.json.total)|0),months:list};}
/* with no name (the page asking whether the route exists): the relay answers 400 INVALID_NAME when it has /find, 404 NOT_FOUND when not */
async function find(root,name,opts={}){const q=cleanText(String(name||''),NAME_MAX);if(!q){const r=await get(root,'/api/torch/find?name=',opts.fetch);return {ok:true,available:r.status!=='missing',items:[]};}
 const r=await get(root,'/api/torch/find?name='+encodeURIComponent(q),opts.fetch);if(r.status==='missing')return {ok:true,available:false,items:[]};if(r.status!=='ok')return {ok:false,available:true,items:[]};
 return {ok:true,available:true,items:(Array.isArray(r.json.items)?r.json.items:[]).map(cleanItem).filter(Boolean).slice(0,50)};}
/* credits this PC filed: data/The Seed/<key>.sent.json {credit:{torchNo,name,at}} (services/auto-profile-feed.cjs) */
function localCredits(root){const dir=path.join(root,'data','The Seed'),out=[];let names=[];try{names=fs.readdirSync(dir);}catch{return out;}
 for(const f of names){const m=/^([0-9a-f]{16,64})\.sent\.json$/i.exec(f);if(!m||!KEY.test(m[1]))continue;let v=null;try{v=JSON.parse(fs.readFileSync(path.join(dir,f),'utf8'));}catch{}
  const c=v&&cleanItem({...(v.credit||{}),...(v.localName!==undefined?{name:v.localName}:{})});if(c)out.push({...c,key:m[1]});}
 return out;}
async function me(root,opts={}){const mine=new Map();for(const c of localCredits(root))mine.set(c.torchNo,c);
 const r=await get(root,'/api/torch/me',opts.fetch);const available=r.status!=='missing';
 if(r.status==='ok')for(const it of (Array.isArray(r.json.items)?r.json.items:[]).map(cleanItem).filter(Boolean))mine.set(it.torchNo,{...(mine.get(it.torchNo)||{}),...it});
 const items=[...mine.values()].map(({key,...it})=>it).sort((a,b)=>a.torchNo-b.torchNo).slice(0,500);
 return {ok:true,available:available||items.length>0,items};}
module.exports={page,months,find,me,localCredits,cleanItem,NAME_MAX};
