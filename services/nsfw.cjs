// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
/* 2026-11-21 NSFW setting (library.json nsfw, default off; the app asks "are you 18" when it is switched on). While it is off, a cover
   VNDB rates adult is shown behind a veil (web/nsfw.js): a blur with one line of text, a click shows that one cover for now.
   Adult = the rule the Seed catalog already uses (services/seed-catalog.cjs safe): image.sexual >= 1 or image.violence >= 1, a missing
   rating counts as adult. The ratings come from VNDB by the VNDB id of each library game (only ids are sent), kept in
   data/config/cover-ratings.json (30 days; an id VNDB does not know, 7 days), asked in the background. Covers without a VNDB id
   (a picture the player chose, a Steam picture) have no rating and are never veiled.
   The app's R18 filter (native pref safe_cg, "适合录屏或给别人看") forces the veil on whatever this switch says. */
const fs=require('node:fs'),path=require('node:path');
const VNDB='https://api.vndb.org/kana/vn';
const DAY=864e5,FRESH=30*DAY,MISS=7*DAY,RETRY=10*6e4,PAGE=100,TIMEOUT=8000;
const VID=/^v\d{1,7}$/;
const cacheFile=root=>path.join(root,'data','config','cover-ratings.json');
const rating=v=>typeof v==='number'&&Number.isFinite(v)?v:2;
const adult=r=>!(r&&rating(r.sexual)<1&&rating(r.violence)<1);
const vid=v=>{const s=String(v||'').trim().toLowerCase().replace(/^(?=\d)/,'v');return VID.test(s)?'v'+Number(s.slice(1)):'';};
function readJSON(f){try{const v=JSON.parse(fs.readFileSync(f,'utf8'));return v&&typeof v==='object'?v:{};}catch{return {};}}
function safeOnly(root){return readJSON(path.join(root,'data','config','native-preferences.json')).safe_cg===true;}
/* the switch as the player set it, and what is in force (the R18 filter wins) */
function setting(root){return readJSON(path.join(root,'data','config','library.json')).nsfw===true;}
function enabled(root){return setting(root)&&!safeOnly(root);}
function readCache(root){const v=readJSON(cacheFile(root)),out={vn:{},failedAt:Number.isFinite(v.failedAt)?v.failedAt:0};
 for(const [id,e] of Object.entries(v.vn&&typeof v.vn==='object'?v.vn:{})){if(!VID.test(id)||!e||!Number.isFinite(e.at))continue;out.vn[id]=e.miss===true?{miss:true,at:e.at}:{sexual:rating(e.sexual),violence:rating(e.violence),at:e.at};}return out;}
function writeCache(root,v){const f=cacheFile(root),tmp=f+'.'+process.pid+'.tmp';fs.mkdirSync(path.dirname(f),{recursive:true});fs.writeFileSync(tmp,JSON.stringify(v));fs.renameSync(tmp,f);}
/* every library game with a VNDB id: {id, cover basename} (the id the game page uses: a manual one first) */
function games(db){const out=[];try{for(const r of db.prepare("SELECT cover,original FROM games WHERE removed_at IS NULL AND cover<>''").all()){let o={};try{o=JSON.parse(r.original||'{}');}catch{}
  const id=vid(o.vndbManual||o.library?.vndbId||'');out.push({vid:id,cover:path.win32.basename(String(r.cover)).split('?')[0]});}}catch{}return out;}
let busy=null;
async function refresh(root,ids,{fetcher=globalThis.fetch,now=Date.now()}={}){const c=readCache(root);const want=[...new Set(ids)].filter(id=>{const e=c.vn[id];return !e||now-e.at>(e.miss?MISS:FRESH);});
 if(!want.length||!fetcher||now-c.failedAt<RETRY)return false;
 try{for(let i=0;i<want.length;i+=PAGE){const part=want.slice(i,i+PAGE),filters=part.length===1?['id','=',part[0]]:['or',...part.map(id=>['id','=',id])];
   const r=await fetcher(VNDB,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({filters,fields:'image.sexual,image.violence',results:PAGE}),signal:AbortSignal.timeout(TIMEOUT)});
   if(!r.ok)throw Error('VNDB_HTTP_'+r.status);const j=await r.json();if(!Array.isArray(j?.results))throw Error('VNDB_BAD_ANSWER');const seen=new Set();
   for(const x of j.results){const id=vid(x?.id);if(!id||!part.includes(id))continue;seen.add(id);c.vn[id]=x.image&&typeof x.image==='object'?{sexual:rating(x.image.sexual),violence:rating(x.image.violence),at:now}:{miss:true,at:now};}
   for(const id of part)if(!seen.has(id))c.vn[id]={miss:true,at:now};}
  c.failedAt=0;writeCache(root,c);return true;}catch{c.failedAt=now;try{writeCache(root,c);}catch{}return false;}}
/* the state for the page: {on, flagged:[cover file names VNDB rates adult], pending}. Answers from the cache at once; an unknown id is asked in the background. */
function state(db,root,{fetcher,now=Date.now(),wait=false}={}){
 const list=games(db),c=readCache(root),flagged=new Set(),unknown=[];
 for(const g of list){if(!g.vid||!g.cover)continue;const e=c.vn[g.vid];if(!e){unknown.push(g.vid);continue;}if(e.miss)continue;if(adult(e))flagged.add(g.cover);}
 const out={on:enabled(root),setting:setting(root),locked:setting(root)&&safeOnly(root),flagged:[...flagged].sort(),pending:unknown.length>0};
 if(wait)return refresh(root,list.map(g=>g.vid).filter(Boolean),{fetcher,now}).then(()=>state(db,root,{fetcher,now}));
 if((unknown.length||list.some(g=>g.vid&&c.vn[g.vid]&&now-c.vn[g.vid].at>(c.vn[g.vid].miss?MISS:FRESH)))&&!busy){busy=refresh(root,list.map(g=>g.vid).filter(Boolean),{fetcher,now}).finally(()=>{busy=null;});}
 return out;}
module.exports={state,refresh,enabled,setting,adult,rating,readCache,games,vid};
