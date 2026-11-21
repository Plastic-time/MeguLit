// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
/* The Seed catalog page (web/seed-catalog.js): every game that has a seed, grouped by developer, with its cover.
   The list is the built-in seeds (core/profiles/seed.cjs). Names, developers and covers come from VNDB by each seed's public
   VNDB id (prints.vndb); only those ids are sent, nothing from the user's library. Answers are kept in
   data/config/seed-catalog.json: fresh for 30 days (ids VNDB does not know: 7 days). A stale answer is shown at once and
   refreshed behind it, as the site-updates list in bridge.cjs does; after a failed lookup VNDB is not asked again for 10
   minutes. A cover is saved once under data/assets/covers as seed-<vid>-<hash>.<ext> (a new hash when VNDB changes the image).
   Two modes. Normal: only covers VNDB rates safe (image.sexual < 1 and image.violence < 1, as services/leaderboard.cjs
   featureCover asks), and a cover without numeric ratings counts as not safe. NSFW: every cover. The app's R18 filter
   (native pref safe_cg, "适合录屏或给别人看") keeps the page in normal mode whatever the page asks. */
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const VNDB='https://api.vndb.org/kana/vn';
const FIELDS='title,alttitle,developers.id,developers.name,developers.original,image.url,image.thumbnail,image.sexual,image.violence';
const DAY=864e5,FRESH=30*DAY,MISS=7*DAY,RETRY=10*6e4,TIMEOUT=8000,MAX_COVER=4*1024*1024,PAGE=100;
const VID=/^v\d{1,7}$/,PID=/^p\d{1,7}$/,IMG=/^https:\/\/(?:[a-z0-9-]+\.)*vndb\.org\/[^\s?#]+$/;
const cacheFile=root=>path.join(root,'data','config','seed-catalog.json');
const coverDir=root=>path.join(root,'data','assets','covers');
/* VNDB rates 0 (safe) to 2; anything that is not a finite number counts as 2 */
const rating=v=>typeof v==='number'&&Number.isFinite(v)?v:2;
const safe=img=>!!img&&rating(img.sexual)<1&&rating(img.violence)<1;
const text=(v,n)=>typeof v==='string'?v.trim().slice(0,n):'';
/* seeds may write v0123; VNDB answers v123 */
const vid=v=>{const s=String(v||'').trim().toLowerCase();return VID.test(s)?'v'+Number(s.slice(1)):'';};
const plain=v=>!!v&&typeof v==='object'&&!Array.isArray(v);

/* one VNDB answer (or one cached entry), kept to the fields the page shows; the thumbnail is enough for a card */
function cleanVn(r){
 if(!plain(r))return null;
 const img=plain(r.image)?r.image:null,url=img&&[img.thumbnail,img.url].find(u=>typeof u==='string'&&IMG.test(u));
 return {title:text(r.title,200),alttitle:text(r.alttitle,200),
  developers:(Array.isArray(r.developers)?r.developers:[]).filter(d=>plain(d)&&PID.test(String(d.id||''))).slice(0,4).map(d=>({id:d.id,name:text(d.name,120),original:text(d.original,120)})),
  image:url?{url,sexual:rating(img.sexual),violence:rating(img.violence)}:null};
}
/* the cache file is cleaned the same way on every read: a hand-edited or damaged entry cannot bring an unsafe cover back */
function readCache(root){
 let v=null;try{v=JSON.parse(fs.readFileSync(cacheFile(root),'utf8'));}catch{}
 const out={vn:{},failedAt:Number.isFinite(v?.failedAt)?v.failedAt:0};
 if(plain(v)&&plain(v.vn))for(const [id,e] of Object.entries(v.vn)){
  if(!VID.test(id)||!plain(e)||!Number.isFinite(e.at))continue;
  out.vn[id]=e.miss===true?{miss:true,at:e.at}:{...cleanVn(e),at:e.at};
 }
 return out;
}
function writeCache(root,value){const file=cacheFile(root),tmp=file+'.'+process.pid+'.tmp';fs.mkdirSync(path.dirname(file),{recursive:true});fs.writeFileSync(tmp,JSON.stringify(value));fs.renameSync(tmp,file);}
function safeOnly(root){try{return JSON.parse(fs.readFileSync(path.join(root,'data','config','native-preferences.json'),'utf8')).safe_cg===true;}catch{return false;}}

/* the seeds as the page needs them: no prints, no settings */
function seedList(seeds){
 const s=seeds||require('../core/profiles/seed.cjs').seeds();
 return (Array.isArray(s?.games)?s.games:[]).map(g=>({slug:String(g.key||''),engine:String(g.engine||''),status:String(g.status||''),vndb:vid(g.prints?.vndb)}));
}
async function lookup(ids,{fetch:fetcher=fetch,timeout=TIMEOUT}={}){
 const out={};
 for(let i=0;i<ids.length;i+=PAGE){
  const part=ids.slice(i,i+PAGE),filters=part.length===1?['id','=',part[0]]:['or',...part.map(id=>['id','=',id])];
  const r=await fetcher(VNDB,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({filters,fields:FIELDS,results:PAGE}),signal:AbortSignal.timeout(timeout)});
  if(!r.ok)throw Error('VNDB_HTTP_'+r.status);
  const j=await r.json();if(!Array.isArray(j?.results))throw Error('VNDB_BAD_ANSWER');
  for(const x of j.results){const id=vid(x?.id);if(id&&part.includes(id)){const v=cleanVn(x);if(v)out[id]=v;}}
 }
 return out;
}
/* asks VNDB for ids and writes the answers; a failure only notes the time, so the next ten minutes do not wait on VNDB */
const refreshing=new Map();
function refresh(root,ids,{fetch:fetcher,timeout,now}){
 if(refreshing.has(root))return refreshing.get(root);
 const p=(async()=>{
  try{const got=await lookup(ids,{fetch:fetcher,timeout});const cache=readCache(root);for(const id of ids)cache.vn[id]=got[id]?{...got[id],at:now}:{miss:true,at:now};cache.failedAt=0;try{writeCache(root,cache);}catch{}return true;}
  catch{const cache=readCache(root);cache.failedAt=now;try{writeCache(root,cache);}catch{}return false;}
 })().finally(()=>refreshing.delete(root));
 refreshing.set(root,p);return p;
}
/* {games:[{slug, engine, status, vndb, title, alttitle, developers, cover:'safe'|'nsfw'|'none'}], offline, safeOnly}.
   Waits on VNDB only when some id has no answer at all; stale answers are refreshed behind the reply (wait:true waits, for tests).
   offline = VNDB could not be asked or did not answer and some names are missing. */
async function catalog(root,{seeds,fetch:fetcher,timeout,now=Date.now(),wait=false}={}){
 const list=seedList(seeds);let cache=readCache(root);
 const ids=[...new Set(list.map(g=>g.vndb).filter(Boolean))];
 const missing=ids.filter(id=>!cache.vn[id]),stale=ids.filter(id=>cache.vn[id]&&!(now-cache.vn[id].at<(cache.vn[id].miss?MISS:FRESH)));
 const resting=now-cache.failedAt<RETRY;let offline=false;
 if(missing.length){
  if(resting)offline=true;
  else{offline=!(await refresh(root,[...missing,...stale],{fetch:fetcher,timeout,now}));cache=readCache(root);}
 }else if(stale.length&&!resting){const p=refresh(root,stale,{fetch:fetcher,timeout,now});if(wait){await p;cache=readCache(root);}else p.catch(()=>{});}
 const games=list.map(g=>{const v=g.vndb&&cache.vn[g.vndb]&&!cache.vn[g.vndb].miss?cache.vn[g.vndb]:null;
  return {...g,title:v?.title||'',alttitle:v?.alttitle||'',developers:v?.developers||[],cover:v?.image?(safe(v.image)?'safe':'nsfw'):'none'};});
 return {games,offline,safeOnly:safeOnly(root)};
}
/* the picture's own first bytes decide what it is; a proxy page or an error body is never saved as a cover */
function imageType(b){
 if(b.length>3&&b[0]===0xff&&b[1]===0xd8&&b[2]===0xff)return 'jpg';
 if(b.length>8&&b.readUInt32BE(0)===0x89504e47&&b.readUInt32BE(4)===0x0d0a1a0a)return 'png';
 if(b.length>12&&b.toString('latin1',0,4)==='RIFF'&&b.toString('latin1',8,12)==='WEBP')return 'webp';
 return '';
}
/* a data: URL of one game's cover, or null. nsfw must be true (and the R18 filter off) for a cover VNDB does not rate safe;
   that check runs before anything is read or fetched, so a cover saved in NSFW mode never shows in normal mode. */
async function cover(root,id0,{nsfw=false,fetch:fetcher=fetch,timeout=TIMEOUT}={}){
 const id=vid(id0);if(!id||id!==String(id0))return null;
 const v=readCache(root).vn[id],img=v&&!v.miss?v.image:null;
 if(!img)return null;
 if(!safe(img)&&(nsfw!==true||safeOnly(root)))return null;
 const store=require('./store.cjs'),base=`seed-${id}-${crypto.createHash('sha256').update(img.url).digest('hex').slice(0,12)}`;
 for(const ext of ['jpg','png','webp']){const have=store.imageData(root,'covers',base+'.'+ext);if(have)return have;}
 try{
  const r=await fetcher(img.url,{signal:AbortSignal.timeout(timeout)});if(!r.ok)return null;
  const bytes=Buffer.from(await r.arrayBuffer()),ext=imageType(bytes);if(!ext||bytes.length>MAX_COVER)return null;
  fs.mkdirSync(coverDir(root),{recursive:true});fs.writeFileSync(path.join(coverDir(root),base+'.'+ext),bytes);
  return store.imageData(root,'covers',base+'.'+ext)||null;
 }catch{return null;}
}
module.exports={catalog,cover,cleanVn,readCache,seedList,safe,imageType,VNDB};
