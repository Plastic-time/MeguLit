// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
/* E415 每日 page (web/daily-view.js): Galgame news and today's hot Japanese words, read only from the relay
   (GET /api/news, GET /api/hotwords/daily; relay/src/daily.js fetches the source sites on a cron).
   Readings: the relay gives one only for kana words; otherwise the local dictionary's reading when its headword is
   exactly the term (never a tokenizer guess). No relay / no data → {state:'not-configured'|'error'|'empty'}. */
const relay=require('./relay-config.cjs');
const TIMEOUT=8000;
const str=(v,n)=>typeof v==='string'?v.slice(0,n):'';
const link=v=>{try{const u=new URL(String(v||''));return u.protocol==='https:'||u.protocol==='http:'?u.href:'';}catch{return '';}};
async function get(url,fetcher){
 try{const r=await fetcher(url,{method:'GET',headers:{'user-agent':'MeguLit'},signal:AbortSignal.timeout(TIMEOUT)});if(!r.ok)return {state:'error',error:'HTTP_'+r.status};return {state:'ok',data:await r.json()};}
 catch(e){return {state:'error',error:e?.name==='TimeoutError'?'TIMEOUT':'NETWORK'};}
}
function cleanNews(d){
 const items=(Array.isArray(d?.items)?d.items:[]).slice(0,40).map(n=>({title:str(n?.title,160),link:link(n?.link),date:str(n?.date,30),source:str(n?.source,40),sourceId:str(n?.sourceId,20),summary:str(n?.summary,160),image:link(n?.image)})).filter(n=>n.title&&n.link);
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
 const news=n.state==='ok'?cleanNews(n.data):null,words=w.state==='ok'?cleanWords(w.data,db):null;
 const state=!news&&!words?'error':!(news?.items.length)&&!(words?.words.length)?'empty':'ok';
 for(const u of [...(news?.items||[]).map(x=>x.link),...(words?.words||[]).map(x=>x.url)])if(u&&u.startsWith('https:'))shown.add(u);
 return {state,error:state==='error'?n.error||w.error:undefined,news,words};
}
/* only links the page was just given (news articles and hot-word headlines) open in the browser */
const shown=new Set();
function canOpen(url){return shown.has(String(url||''));}
module.exports={view,canOpen,cleanNews,cleanWords,readingFor};
