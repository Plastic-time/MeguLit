// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
/* 2026-11-21 developer panel of the Seed catalog (web/seed-catalog.js): a short introduction and links for one developer.
   The introduction is VNDB's own description of the producer (public API), cut to 2-3 sentences, VNDB markup removed, with the
   source named by the page. The links: the VNDB producer page, the official website and the Japanese Wikipedia page when VNDB lists
   them, and Moegirlpedia (a search link, or the page itself when it has one) (zh.moegirl.org.cn, CC BY-NC-SA) by the developer's name. Links are opened by the service from
   this cached answer, never from an address the page hands over (open(root,pid,kind)). Only the producer id goes to VNDB.
   Kept in data/config/seed-producers.json: found 30 days, a miss 7 days, a failed ask not repeated for 10 minutes. */
const fs=require('node:fs'),path=require('node:path'),{spawn}=require('node:child_process');
const {publicUrl}=require('./seed-logo.cjs');
const PID=/^p\d{1,7}$/,DAY=864e5,FRESH=30*DAY,MISS=7*DAY,RETRY=10*6e4,TIMEOUT=8000,MAX_INTRO=360;
const cacheFile=root=>path.join(root,'data','config','seed-producers.json');
const plain=v=>!!v&&typeof v==='object'&&!Array.isArray(v);
function readCache(root){try{const v=JSON.parse(fs.readFileSync(cacheFile(root),'utf8'));return plain(v)?{p:plain(v.p)?v.p:{},failedAt:Number.isFinite(v.failedAt)?v.failedAt:0}:{p:{},failedAt:0};}catch{return {p:{},failedAt:0};}}
function writeCache(root,v){const f=cacheFile(root),tmp=f+'.'+process.pid+'.tmp';fs.mkdirSync(path.dirname(f),{recursive:true});fs.writeFileSync(tmp,JSON.stringify(v));fs.renameSync(tmp,f);}
/* VNDB text markup -> plain text: [From ...] source lines and [spoiler] blocks go, [url=..]text[/url] keeps its text, then 2-3 sentences */
function intro(raw){let t=String(raw||'');
 t=t.replace(/\[From\s+\[url=[^\]]*\][^\]]*\[\/url\]\][^\n]*/gi,'').replace(/\[From[^\]]*\]/gi,'').replace(/\[spoiler\][\s\S]*?\[\/spoiler\]/gi,'')
  .replace(/\[url=[^\]]*\]([^\[]*)\[\/url\]/gi,'$1').replace(/\[\/?(?:b|i|u|s|raw|quote|code)\]/gi,'').replace(/\[[^\]]{0,40}\]/g,'');
 const paras=t.split(/\n\s*\n/).map(x=>x.replace(/\s+/g,' ').trim()).filter(Boolean);if(!paras.length)return '';
 const sentences=(paras[0]+' '+(paras[1]||'')).match(/[^.!?。！？]+[.!?。！？]+["'”’)」』]*|[^.!?。！？]+$/g)||[paras[0]];
 let out='';for(const s of sentences){const next=(out?out+' ':'')+s.trim();if(out&&(next.length>MAX_INTRO||out.split(/(?<=[.!?。！？])/).length>=3))break;out=next;}
 return out.length>MAX_INTRO?out.slice(0,MAX_INTRO).replace(/\s+\S*$/,'')+'…':out;}
const moegirl=name=>'https://zh.moegirl.org.cn/index.php?search='+encodeURIComponent(name);
function build(pid,x){
 const links=[{kind:'vndb',url:'https://vndb.org/'+pid}];
 const ext=(Array.isArray(x.extlinks)?x.extlinks:[]).filter(l=>plain(l)&&typeof l.url==='string');
 const site=ext.find(l=>l.name==='website'),ja=ext.find(l=>l.name==='jawiki');
 if(site&&publicUrl(site.url))links.push({kind:'site',url:publicUrl(site.url).href});
 const name=String(x.original||x.name||'').trim();if(name)links.push({kind:'moegirl',url:moegirl(name)});
 const jw=ja&&publicUrl(ja.url);if(jw&&/^ja\.wikipedia\.org$/i.test(jw.hostname)&&jw.protocol==='https:')links.push({kind:'jawiki',url:jw.href});
 return {pid,name:String(x.name||'').slice(0,120),original:String(x.original||'').slice(0,120),aliases:(Array.isArray(x.aliases)?x.aliases:[]).filter(a=>typeof a==='string'&&a.length<=80).slice(0,3),intro:intro(x.description),source:'VNDB',links};}
/* the Chinese UI takes the introduction from Moegirlpedia (CC BY-NC-SA 3.0, the page's own first lines through the MediaWiki "extracts"
   API, 2-3 sentences, the page linked); the other languages, and a developer with no page there, keep VNDB's */
async function moegirlIntro(fetcher,info,timeout){const names=[...new Set([info.name,info.original,...(info.aliases||[])].map(x=>String(x||'').trim()).filter(Boolean))].slice(0,4);if(!names.length)return null;
 try{const r=await fetcher('https://zh.moegirl.org.cn/api.php?action=query&format=json&prop=extracts&exintro=1&explaintext=1&redirects=1&titles='+names.map(encodeURIComponent).join('%7C'),{headers:{'user-agent':'MeguLit',accept:'application/json'},signal:AbortSignal.timeout(timeout)});
  if(!r.ok)return null;const j=await r.json();const pages=Object.values(j?.query?.pages||{}).filter(p=>plain(p)&&p.ns===0&&typeof p.extract==='string'&&p.extract.trim().length>=20&&!/消歧义|可以指|可能指/.test(p.extract.slice(0,200)));
  const order=t=>{const k=names.findIndex(n=>n.toLowerCase()===String(t).toLowerCase());return k<0?99:k;};pages.sort((a,b)=>order(a.title)-order(b.title));
  const page=pages[0];if(!page)return null;const text=intro(page.extract);return text?{title:String(page.title).slice(0,120),intro:text,url:'https://zh.moegirl.org.cn/'+encodeURIComponent(String(page.title).replace(/ /g,'_'))}:null;}catch{return null;}}
/* what the page gets: the VNDB answer, with Moegirlpedia's introduction and page link in the Chinese UI when it has one */
function view(info,moegirl){if(!info)return null;if(!moegirl||!info.zh)return info;
 return {...info,intro:info.zh.intro,source:'moegirl',links:info.links.map(l=>l.kind==='moegirl'?{kind:'moegirl',url:info.zh.url}:l)};}
/* -> {pid,name,original,intro,source,links:[{kind,url}]} or null; a stale answer is returned when the ask fails */
async function producer(root,pid,{fetch:fetcher=globalThis.fetch,now=Date.now(),timeout=TIMEOUT,locale='',moegirl=locale==='zh'}={}){
 if(!PID.test(String(pid||'')))return null;const c=readCache(root),e=c.p[pid];
 if(e&&now-e.at<(e.miss?MISS:FRESH)){if(e.miss)return null;if(moegirl&&e.info.zh===undefined&&fetcher){e.info.zh=await moegirlIntro(fetcher,e.info,timeout);writeCache(root,c);}return view(e.info,moegirl);}
 if(!fetcher||now-c.failedAt<RETRY)return e&&!e.miss?view(e.info,moegirl):null;
 try{const r=await fetcher('https://api.vndb.org/kana/producer',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({filters:['id','=',pid],fields:'name,original,aliases,description,extlinks.url,extlinks.name',results:1}),signal:AbortSignal.timeout(timeout)});
  if(!r.ok)throw Error('VNDB_HTTP_'+r.status);const j=await r.json();if(!Array.isArray(j?.results))throw Error('VNDB_BAD_ANSWER');
  const x=j.results[0];c.failedAt=0;c.p[pid]=plain(x)?{at:now,info:build(pid,x)}:{at:now,miss:true};if(!c.p[pid].miss&&moegirl)c.p[pid].info.zh=await moegirlIntro(fetcher,c.p[pid].info,timeout);writeCache(root,c);return c.p[pid].miss?null:view(c.p[pid].info,moegirl);}
 catch{c.failedAt=now;try{writeCache(root,c);}catch{}return e&&!e.miss?view(e.info,moegirl):null;}}
/* open one link of the cached answer in the system browser (never in the app) */
function open(root,pid,kind,{spawnFn=spawn}={}){const e=PID.test(String(pid||''))&&readCache(root).p[pid];const link=e&&!e.miss&&e.info.links.find(l=>l.kind===kind);if(!link)throw Error('INVALID_LINK');
 const u=new URL(link.url);if(!/^https?:$/.test(u.protocol)||u.username||u.password)throw Error('INVALID_LINK');
 const child=spawnFn('explorer.exe',[u.href],{windowsHide:true,detached:true,stdio:'ignore'});child.on?.('error',()=>{});child.unref?.();return {opened:true};}
module.exports={producer,open,intro,build,moegirl,view};
