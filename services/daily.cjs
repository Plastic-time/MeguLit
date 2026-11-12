// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
/* E415 每日 page (web/daily-view.js): Galgame news and today's hot Japanese words, read only from the relay
   (GET /api/news, GET /api/hotwords/daily; relay/src/daily.js fetches the source sites on a cron).
   Readings: the relay gives one only for kana words; otherwise the local dictionary's reading when its headword is
   exactly the term (never a tokenizer guess). No relay / no data → {state:'not-configured'|'error'|'empty'}. */
const fs=require('node:fs'),path=require('node:path');
const relay=require('./relay-config.cjs');
const TIMEOUT=8000,GLOSS_BUDGET=4000;
const str=(v,n)=>typeof v==='string'?v.slice(0,n):'';
const link=v=>{try{const u=new URL(String(v||''));return u.protocol==='https:'||u.protocol==='http:'?u.href:'';}catch{return '';}};
async function get(url,fetcher){
 try{const r=await fetcher(url,{method:'GET',headers:{'user-agent':'MeguLit'},signal:AbortSignal.timeout(TIMEOUT)});if(!r.ok)return {state:'error',error:'HTTP_'+r.status};return {state:'ok',data:await r.json()};}
 catch(e){return {state:'error',error:e?.name==='TimeoutError'?'TIMEOUT':'NETWORK'};}
}
function cleanNews(d){
 const items=(Array.isArray(d?.items)?d.items:[]).slice(0,120).map(n=>({fulltext:n?.fulltext===true,cat:n?.cat==='acg'?'acg':'gal',title:str(n?.title,160),link:link(n?.link),date:str(n?.date,30),source:str(n?.source,40),sourceId:str(n?.sourceId,20),summary:str(n?.summary,160),image:/^\/api\/news\/img\/[0-9a-f]{32}$/.test(String(n?.image||''))?n.image:''})).filter(n=>n.title&&n.link);
 return {items,sources:(Array.isArray(d?.sources)?d.sources:[]).slice(0,10).map(s=>({id:str(s?.id,20),name:str(s?.name,40)})),updatedAt:str(d?.updatedAt,30)||null};
}
/* the local dictionary is Chinese: its first line, first two senses, make the short gloss beside a hot word.
   Readings: first of 'a · b'. Only exact headwords, never a tokenizer guess. */
function dictFor(db,term){
 if(!db||!term)return null;
 try{const row=db.prepare('SELECT reading,definition FROM dictionary_entries WHERE spelling=? ORDER BY frequency LIMIT 1').get(term);if(!row)return null;
  const first=String(row.definition||'').split('\n')[0].split(/[；;]/).map(x=>x.trim()).filter(Boolean).slice(0,2).join('；');
  return {reading:str(String(row.reading||'').split(/\s*·\s*/)[0],40),gloss:first.slice(0,30)};}catch{return null;}
}
function readingFor(db,term){return dictFor(db,term)?.reading||'';}
function cleanWords(d,db){
 const words=(Array.isArray(d?.words)?d.words:[]).slice(0,20).map(w=>{const term=str(w?.term,40).trim(),dict=dictFor(db,term);
  /* gloss: dictionary first, then the relay's one-line note (Workers AI, with the headline as context); machine translation fills the rest in view() */
  const gloss=dict?.gloss?{gloss:dict.gloss,glossFrom:'dict'}:str(w?.gloss,40).trim()?{gloss:str(w.gloss,40).trim(),glossFrom:'ai'}:{gloss:'',glossFrom:''};
  /* kind (relay AI): word, or a proper noun (person, org, work, place, product, event) shown as a tag; a dictionary hit is a word */
  const kind=dict?.gloss?'word':['word','person','org','work','place','product','event'].includes(w?.kind)?w.kind:'';
  return {term,kind,reading:str(w?.reading,40)||dict?.reading||'',...gloss,traffic:str(w?.traffic,12),headline:str(w?.headline,160),url:link(w?.url),source:str(w?.source,40)};}).filter(w=>w.term);
 return {day:/^\d{4}-\d{2}-\d{2}$/.test(String(d?.day||''))?d.day:null,source:str(d?.source,60),words,updatedAt:str(d?.updatedAt,30)||null};
}
/* ---- E415 translation for the 日报: the user's engine first; when it cannot run (local model not downloaded, no API
   key, request failed) the free Microsoft engine, like E406. Paragraph results are cached in data/cache. ---------- */
const trFile=root=>root?path.join(root,'data','cache','daily-translate.json'):'';
let trCache=null;
function trLoad(root){if(trCache)return trCache;trCache=new Map();try{for(const [k,v] of Object.entries(JSON.parse(fs.readFileSync(trFile(root),'utf8'))))trCache.set(k,v);}catch{}return trCache;}
function trSave(root){const f=trFile(root);if(!f)return;try{const all=[...trLoad(root)].slice(-3000);fs.mkdirSync(path.dirname(f),{recursive:true});fs.writeFileSync(f,JSON.stringify(Object.fromEntries(all)));}catch{}}
async function translateList(root,runtime,list,goal,options={}){
 const cache=trLoad(root),key=t=>goal+'|'+t,val=v=>typeof v==='string'?{t:v,e:''}:v||{t:'',e:''},out=list.map(t=>t.trim()?val(cache.get(key(t))).t:'');
 const cachedEngines=new Set(list.map(t=>val(cache.get(key(t))).e).filter(Boolean));
 const todo=list.map((t,i)=>i).filter(i=>list[i].trim()&&!out[i]);if(!todo.length)return {texts:out,engine:[...cachedEngines].join('+')||'cache'};
 let engine='',reason='';
 if(runtime?.reviews)try{const got=await runtime.reviews().translate(todo.map(i=>list[i]),goal,'ja');if(Array.isArray(got)&&got.some(Boolean)){todo.forEach((i,n)=>{out[i]=String(got[n]||'');});engine='app';}else reason='ENGINE_EMPTY';}catch(e){reason=String(e?.message||e);}
 const left=todo.filter(i=>!out[i]);
 if(left.length){const free=options.translateFree||require('../core/translate.cjs').translateFree;let failed='';
  for(const i of left){try{out[i]=String(await free(list[i],{source:'ja',target:goal,preferred:'microsoft',fetcher:options.fetch||fetch})||'');}catch(e){failed=String(e?.message||e);}}
  if(left.some(i=>out[i]))engine=engine?engine+'+microsoft':'microsoft';else if(failed)reason=failed;}
 const by=new Set(left.filter(i=>out[i]));for(const i of todo)if(out[i])cache.set(key(list[i]),{t:out[i],e:by.has(i)?'microsoft':'app'});trSave(root);
 if(cachedEngines.has('microsoft')&&!engine.includes('microsoft'))engine=engine?engine+'+microsoft':'microsoft';
 if(!out.some(Boolean)&&list.some(t=>t.trim())){const e=Error('TRANSLATION_FAILED:'+(reason||'UNKNOWN'));throw e;}
 return {texts:out,engine};
}
async function view(root,db,options={}){
 const base=relay.relayBase(root,options.env||process.env);if(!base)return {state:'not-configured',news:null,words:null};
 const fetcher=options.fetch||fetch;
 /* force: the page's refresh button asks the relay to fetch the sources again */
 const q=options.force?'?refresh=1':'',[n,w]=await Promise.all([get(base+'/api/news'+q,fetcher),get(base+'/api/hotwords/daily'+q,fetcher)]);
 const news=n.state==='ok'?cleanNews(n.data):null,/* thumbnails come from the relay's R2 copy and reach the page as data: URLs (the app CSP allows no remote images) */
words=w.state==='ok'?cleanWords(w.data,db):null;
 const state=!news&&!words?'error':!(news?.items.length)&&!(words?.words.length)?'empty':'ok';
 if(news)await thumbnails(root,base,news.items,fetcher);
 /* machine translation of a proper noun only repeats the name, so it fills ordinary words only */
 const bare=(words?.words||[]).filter(w=>!w.gloss&&(!w.kind||w.kind==='word'));
 /* Issue 129: glosses are a nicety. Offline or with the translator unreachable, one call per word waited out its own
    timeout and the page sat on its loading card for minutes. They get GLOSS_BUDGET; whatever is not back by then is left
    out (the calls go on and fill the cache for the next visit). */
 if(bare.length){const glossing=translateList(root,options.runtime,bare.map(w=>w.term),'zh-CN',options).then(r=>{bare.forEach((w,i)=>{const t=String(r.texts[i]||'').trim();if(t&&t!==w.term){w.gloss=t.slice(0,30);w.glossFrom='mt';}});}).catch(()=>{});let timer;await Promise.race([glossing,new Promise(r=>{timer=setTimeout(r,options.glossBudget??GLOSS_BUDGET);})]);clearTimeout(timer);}
 for(const n of news?.items||[])if(n.fulltext)fulltext.add(n.link);
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
/* E461 (user: the 日报 still hung for players in China) a slow link to the relay held the page until every thumbnail of
   ~100 items had arrived; now the page waits at most THUMB_BUDGET, items whose picture is not back show without it, and
   the downloads go on into the cache for the next visit */
const THUMB_BUDGET=2500;
async function thumbnails(root,base,items,fetcher){pruneImages(root);const want=items.map(n=>n.image);items.forEach(n=>{n.image='';});
 const jobs=items.map(async(n,i)=>{if(!want[i])return;const img=await thumbnail(root,base,want[i],fetcher).catch(()=>'');n.image=img;});
 let timer;await Promise.race([Promise.all(jobs),new Promise(r=>{timer=setTimeout(r,THUMB_BUDGET);timer.unref?.();})]);clearTimeout(timer);}
/* only links the page was just given (news articles and hot-word headlines) open in the browser */
const shown=new Set();
function canOpen(url){return shown.has(String(url||''));}

/* ---- E415 reader: article text, translation, Anki ------------------------------------------------------------- */
const crypto=require('node:crypto');
const artDir=root=>root?path.join(root,'data','cache','daily-article'):'';
const hash=v=>crypto.createHash('sha256').update(String(v)).digest('hex').slice(0,32);
/* sources the relay may cache in full (wrangler.toml NEWS_FULLTEXT_SOURCES); the relay marks those items fulltext:true */
const fulltext=new Set();
async function fromRelay(base,link,fetcher){const r=await get(base+'/api/news/article?link='+encodeURIComponent(link),fetcher);return r.state==='ok'&&Array.isArray(r.data?.paragraphs)?{title:str(r.data.title,200),paragraphs:r.data.paragraphs.slice(0,120).map(p=>str(p,2000)).filter(Boolean),via:'relay'}:null;}
async function fromSite(link,options){const page=await require('./fast-fetch.cjs').getText(link,{fetch:options.fetch,doh:options.doh});if(!page.ok)return null;const x=require('./news-article.cjs').extract(page.text,page.url||link);return x.paragraphs.length?{...x,via:page.via}:null;}
/* readings only when the dictionary settled them (readingSource 'dictionary'), never the tokenizer's guess */
async function tokens(text,learning){
 if(!learning)return null;
 try{const list=learning.readings.resolve(await learning.tokenize(text));return list.map(t=>({s:String(t.surface||''),b:String(t.base_form&&t.base_form!=='*'?t.base_form:t.surface||''),r:t.readingSource==='dictionary'?String(t.reading||''):''})).filter(t=>t.s);}catch{return null;}
}
async function article(root,link,options={}){
 if(!canOpen(link))throw Error('URL_NOT_ALLOWED');
 const dir=artDir(root),file=dir&&path.join(dir,hash(link)+'.json');
 let body=null;
 if(file)try{const st=fs.statSync(file);if(Date.now()-st.mtimeMs<KEEP_DAYS*864e5)body=JSON.parse(fs.readFileSync(file,'utf8'));}catch{}
 if(!body){
  const base=relay.relayBase(root,options.env||process.env),fetcher=options.fetch||fetch;
  body=(fulltext.has(link)&&base?await fromRelay(base,link,fetcher).catch(()=>null):null)||await fromSite(link,options).catch(()=>null);
  if(!body)return {state:'error',link};
  if(file)try{fs.mkdirSync(dir,{recursive:true});fs.writeFileSync(file,JSON.stringify(body));for(const n of fs.readdirSync(dir)){const f=path.join(dir,n);if(Date.now()-fs.statSync(f).mtimeMs>KEEP_DAYS*864e5)fs.rmSync(f,{force:true});}}catch{}
 }
 let learning=null;try{const l=options.runtime?.learning?.();if(l?.installed?.())learning=l;}catch{}
 const paragraphs=[];for(const text of body.paragraphs)paragraphs.push({text,tokens:await tokens(text,learning)});
 return {state:'ok',link,title:body.title,via:body.via,paragraphs};
}
async function translate(root,runtime,texts,target,options={}){
 const goal={zh:'zh-CN',en:'en','zh-CN':'zh-CN'}[String(target)]||'zh-CN';
 const list=(Array.isArray(texts)?texts:[]).slice(0,60).map(t=>String(t||'').slice(0,2000));
 const r=await translateList(root,runtime,list,goal,options);
 /* withEngine (the reader): also say which engine answered, so the page can point out the Microsoft fallback */
 return options.withEngine?{texts:r.texts,engine:r.engine}:r.texts;
}
/* one card per word per article, in the megulit_news deck (created on first use) */
const NEWS_DECK='megulit_news';
async function anki(root,runtime,{term,reading,meaning,sentence,link,title}={}){
 term=str(term,40).trim();reading=str(reading,40).trim();if(!term)throw Error('INVALID_WORD');
 const store=require('./store.cjs');
 const config={...(runtime?.config?.()||store.readJSON(path.join(root,'data','config','v4-preferences.json'))),ankiDeck:NEWS_DECK};
 const word={surface:term,base:term,reading:reading||term,noReading:!reading,cardKey:'news:'+term+':'+str(link,500),meaning:str(meaning,2000),pos:'',pitch:[],sentence:str(sentence,1000)};
 const h=v=>v.replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const at=word.sentence.indexOf(term),html=at<0?h(word.sentence):h(word.sentence.slice(0,at))+'<b class="tm-hl">'+h(term)+'</b>'+h(word.sentence.slice(at+term.length));
 return await new(require('../core/anki.cjs').Anki)().sync(word,config,null,{sentenceHtml:html,gameTitle:str(title,200)});
}
module.exports={view,canOpen,article,translate,translateList,dictFor,anki,NEWS_DECK,cleanNews,cleanWords,readingFor};
