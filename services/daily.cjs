// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
/* E415 每日 page (web/daily-view.js): Galgame news and today's hot Japanese words, read only from the relay
   (GET /api/news, GET /api/hotwords/daily; relay/src/daily.js fetches the source sites on a cron).
   Readings: the relay gives one only for kana words; otherwise the local dictionary's reading when its headword is
   exactly the term (never a tokenizer guess). No relay / no data → {state:'not-configured'|'error'|'empty'}. */
const fs=require('node:fs'),path=require('node:path');
const relay=require('./relay-config.cjs');
const TIMEOUT=8000;
const str=(v,n)=>typeof v==='string'?v.slice(0,n):'';
const link=v=>{try{const u=new URL(String(v||''));return u.protocol==='https:'||u.protocol==='http:'?u.href:'';}catch{return '';}};
async function get(url,fetcher){
 try{const r=await fetcher(url,{method:'GET',headers:{'user-agent':'MeguLit'},signal:AbortSignal.timeout(TIMEOUT)});if(!r.ok)return {state:'error',error:'HTTP_'+r.status};return {state:'ok',data:await r.json()};}
 catch(e){return {state:'error',error:e?.name==='TimeoutError'?'TIMEOUT':'NETWORK'};}
}
function cleanNews(d){
 const items=(Array.isArray(d?.items)?d.items:[]).slice(0,40).map(n=>({title:str(n?.title,160),link:link(n?.link),date:str(n?.date,30),source:str(n?.source,40),sourceId:str(n?.sourceId,20),summary:str(n?.summary,160),image:/^\/api\/news\/img\/[0-9a-f]{32}$/.test(String(n?.image||''))?n.image:''})).filter(n=>n.title&&n.link);
 return {items,sources:(Array.isArray(d?.sources)?d.sources:[]).slice(0,10).map(s=>({id:str(s?.id,20),name:str(s?.name,40)})),updatedAt:str(d?.updatedAt,30)||null};
}
function readingFor(db,term){
 if(!db||!term)return '';
 try{const row=db.prepare('SELECT reading FROM dictionary_entries WHERE spelling=? ORDER BY frequency LIMIT 1').get(term);return str(row?.reading,40);}catch{return '';}
}
function cleanWords(d,db){
 const words=(Array.isArray(d?.words)?d.words:[]).slice(0,20).map(w=>{const term=str(w?.term,40).trim();return {term,reading:str(w?.reading,40)||readingFor(db,term),traffic:str(w?.traffic,12),headline:str(w?.headline,160),url:link(w?.url),source:str(w?.source,40)};}).filter(w=>w.term);
 return {day:/^\d{4}-\d{2}-\d{2}$/.test(String(d?.day||''))?d.day:null,source:str(d?.source,60),words,updatedAt:str(d?.updatedAt,30)||null};
}
async function view(root,db,options={}){
 const base=relay.relayBase(root,options.env||process.env);if(!base)return {state:'not-configured',news:null,words:null};
 const fetcher=options.fetch||fetch;
 const [n,w]=await Promise.all([get(base+'/api/news',fetcher),get(base+'/api/hotwords/daily',fetcher)]);
 const news=n.state==='ok'?cleanNews(n.data):null,/* thumbnails come from the relay's R2 copy and reach the page as data: URLs (the app CSP allows no remote images) */
words=w.state==='ok'?cleanWords(w.data,db):null;
 const state=!news&&!words?'error':!(news?.items.length)&&!(words?.words.length)?'empty':'ok';
 if(news)await thumbnails(root,base,news.items,fetcher);
 for(const u of [...(news?.items||[]).map(x=>x.link),...(words?.words||[]).map(x=>x.url)])if(u&&u.startsWith('https:'))shown.add(u);
 return {state,error:state==='error'?n.error||w.error:undefined,news,words};
}
/* E415 thumbnails: cached in data/cache/daily-img for KEEP_DAYS, then fetched again from the relay */
const IMG_MAX=900*1024,KEEP_DAYS=2,TYPES={'image/jpeg':1,'image/png':1,'image/webp':1,'image/gif':1,'image/avif':1};
const imgDir=root=>root?path.join(root,'data','cache','daily-img'):'';
async function thumbnail(root,base,ref,fetcher){
 const id=ref.slice(14),dir=imgDir(root),file=dir&&path.join(dir,id);
 if(file)try{const raw=fs.readFileSync(file);const cut=raw.indexOf(10);if(cut>0)return 'data:'+raw.subarray(0,cut).toString()+';base64,'+raw.subarray(cut+1).toString('base64');}catch{}
 try{const r=await fetcher(base+ref,{method:'GET',headers:{'user-agent':'MeguLit'},signal:AbortSignal.timeout(TIMEOUT)});const type=String(r.headers?.get?.('content-type')||'').split(';')[0].trim();
  if(!r.ok||!TYPES[type])return '';const bytes=Buffer.from(await r.arrayBuffer());if(!bytes.length||bytes.length>IMG_MAX)return '';
  if(file)try{fs.mkdirSync(dir,{recursive:true});fs.writeFileSync(file,Buffer.concat([Buffer.from(type+String.fromCharCode(10)),bytes]));}catch{}
  return 'data:'+type+';base64,'+bytes.toString('base64');}catch{return '';}
}
function pruneImages(root,now=Date.now()){const dir=imgDir(root);if(!dir)return;try{for(const name of fs.readdirSync(dir)){const f=path.join(dir,name);if(now-fs.statSync(f).mtimeMs>KEEP_DAYS*864e5)fs.rmSync(f,{force:true});}}catch{}}
async function thumbnails(root,base,items,fetcher){pruneImages(root);await Promise.all(items.map(async n=>{n.image=n.image?await thumbnail(root,base,n.image,fetcher):'';}));}
/* only links the page was just given (news articles and hot-word headlines) open in the browser */
const shown=new Set();
function canOpen(url){return shown.has(String(url||''));}
module.exports={view,canOpen,cleanNews,cleanWords,readingFor};
