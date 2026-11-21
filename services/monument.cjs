// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
/* 2026-11-21 传火碑 (the torch monument): the names of the players who shared a calibration, read from the relay
   GET /api/torch/monument?cursor=&limit= -> {items:[{torchNo,name,at,game}], next, total}. A relay without the route, no network or
   a bad answer gives an empty monument ({items:[],next:null,total:0,offline:true}), never an error. mine(root) lists the torch numbers
   this PC uploaded (data/The Seed/<key>.sent.json), so the page can light those entries. */
const fs=require('node:fs'),path=require('node:path');
const feed=require('./auto-profile-feed.cjs');
const TIMEOUT=8000,MAX_LIMIT=200;
const EMPTY={items:[],next:null,total:0,offline:true};
const text=(v,n)=>typeof v==='string'?[...v.replace(/[\u0000-\u001f\u007f]/g,' ').trim()].slice(0,n).join(''):'';
function clean(j){if(!j||typeof j!=='object'||!Array.isArray(j.items))return null;const items=[];
 for(const x of j.items.slice(0,MAX_LIMIT)){if(!x||typeof x!=='object')continue;const n=Number(x.torchNo);if(!Number.isInteger(n)||n<1)continue;const at=typeof x.at==='string'||Number.isFinite(x.at)?x.at:'';items.push({torchNo:n,name:feed.cleanName(x.name),at,game:text(x.game,80)});}
 const next=typeof j.next==='string'&&j.next.length<=200?j.next:Number.isInteger(j.next)&&j.next>=0?j.next:null,total=Number.isInteger(j.total)&&j.total>=0?j.total:items.length;
 return {items,next,total};}
async function page(root,{cursor='',limit=60,fetcher=globalThis.fetch}={}){
 const lim=Math.max(1,Math.min(MAX_LIMIT,Number(limit)|0||60)),q=new URLSearchParams();if(cursor!==''&&cursor!==null&&cursor!==undefined)q.set('cursor',String(cursor).slice(0,200));q.set('limit',String(lim));
 if(!fetcher)return EMPTY;let urls=[];try{urls=require('./relay-config.cjs').endpoints(root,'/api/torch/monument?'+q.toString());}catch{}
 for(const url of urls){try{const r=await fetcher(url,{headers:{'user-agent':'MeguLit',accept:'application/json'},signal:AbortSignal.timeout(TIMEOUT)});if(!r.ok)continue;const t=await r.text();if(t.length>512*1024)continue;const c=clean(JSON.parse(t));if(c)return c;}catch{}}
 return EMPTY;}
function mine(root){const out=[];try{for(const f of fs.readdirSync(feed.dir(root))){if(!/\.sent\.json$/.test(f))continue;try{const m=JSON.parse(fs.readFileSync(path.join(feed.dir(root),f),'utf8'));const n=Number(m?.credit?.torchNo);if(Number.isInteger(n)&&n>0)out.push(n);}catch{}}}catch{}return {torchNos:[...new Set(out)]};}
module.exports={page,mine,clean};
