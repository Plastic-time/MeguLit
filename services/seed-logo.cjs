// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
/* 2026-11-21 developer logos for the Seed catalog (web/seed-catalog.js). VNDB has no logo for a producer, so the small icon of the
   producer's own official website is used: VNDB lists that site (producer extlinks, name "website"); the page's <link rel="icon"> or
   /favicon.ico is fetched once, checked (a PNG / JPEG / WebP / GIF / ICO of at most 64 KB), kept under data/assets/logos and shown
   next to the developer's name. Only the producer id goes to VNDB and only the producer's own site is visited, never anything from
   the player's library. A producer with no site or no icon gets a first-letter badge (the page draws it). Answers are kept in
   data/config/seed-logos.json (found: 30 days, none: 7 days; a failed network ask is not repeated for 10 minutes). */
const fs=require('node:fs'),path=require('node:path');
const PID=/^p\d{1,7}$/,DAY=864e5,FRESH=30*DAY,MISS=7*DAY,RETRY=10*6e4,TIMEOUT=8000,MAX_ICON=64*1024,MAX_HTML=128*1024;
const cacheFile=root=>path.join(root,'data','config','seed-logos.json'),logoDir=root=>path.join(root,'data','assets','logos');
const plain=v=>!!v&&typeof v==='object'&&!Array.isArray(v);
function readCache(root){try{const v=JSON.parse(fs.readFileSync(cacheFile(root),'utf8'));return plain(v)?{p:plain(v.p)?v.p:{},failedAt:Number.isFinite(v.failedAt)?v.failedAt:0}:{p:{},failedAt:0};}catch{return {p:{},failedAt:0};}}
function writeCache(root,v){const f=cacheFile(root),tmp=f+'.'+process.pid+'.tmp';fs.mkdirSync(path.dirname(f),{recursive:true});fs.writeFileSync(tmp,JSON.stringify(v));fs.renameSync(tmp,f);}
/* a public web host only: no address literal, no local or internal name */
function publicUrl(u){let x;try{x=new URL(u);}catch{return null;}if(!/^https?:$/.test(x.protocol)||x.username||x.password)return null;const h=x.hostname.toLowerCase();
 if(!h.includes('.')||/^\d+(\.\d+){3}$/.test(h)||h.startsWith('[')||/(^|\.)(localhost|local|internal|lan|home|corp|test|invalid)$/.test(h))return null;return x;}
function iconType(b){
 if(b.length>3&&b[0]===0xff&&b[1]===0xd8&&b[2]===0xff)return {ext:'jpg',mime:'image/jpeg'};
 if(b.length>8&&b.readUInt32BE(0)===0x89504e47&&b.readUInt32BE(4)===0x0d0a1a0a)return {ext:'png',mime:'image/png'};
 if(b.length>12&&b.toString('latin1',0,4)==='RIFF'&&b.toString('latin1',8,12)==='WEBP')return {ext:'webp',mime:'image/webp'};
 if(b.length>6&&/^GIF8[79]a$/.test(b.toString('latin1',0,6)))return {ext:'gif',mime:'image/gif'};
 if(b.length>6&&b[0]===0&&b[1]===0&&b[2]===1&&b[3]===0&&b[4]>0)return {ext:'ico',mime:'image/x-icon'};
 return null;}
/* the icon address named by a home page, or '' */
function iconFromHtml(html,base){const tags=String(html).match(/<link\b[^>]*>/gi)||[];let best='',rank=9;
 for(const t of tags){const rel=/\brel\s*=\s*["']?([^"'>]+)/i.exec(t)?.[1]?.toLowerCase()||'',href=/\bhref\s*=\s*["']?([^"'\s>]+)/i.exec(t)?.[1];if(!href||!/\bicon\b/.test(rel))continue;
  const r=/apple-touch/.test(rel)?2:/shortcut/.test(rel)?0:1;if(r<rank){try{best=new URL(href.replace(/&amp;/g,'&'),base).href;rank=r;}catch{}}}
 return best;}
async function getBytes(fetcher,url,max,timeout){const u=publicUrl(url);if(!u)return null;const r=await fetcher(u.href,{headers:{'user-agent':'MeguLit'},redirect:'follow',signal:AbortSignal.timeout(timeout)});if(!r.ok)return null;
 if(r.url&&!publicUrl(r.url))return null;const len=Number(r.headers?.get?.('content-length')||0);if(len>max)return null;const b=Buffer.from(await r.arrayBuffer());return b.length>max?null:b;}
async function website(fetcher,pid,timeout){const r=await fetcher('https://api.vndb.org/kana/producer',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({filters:['id','=',pid],fields:'extlinks.url,extlinks.name',results:1}),signal:AbortSignal.timeout(timeout)});
 if(!r.ok)throw Error('VNDB_HTTP_'+r.status);const j=await r.json();if(!Array.isArray(j?.results))throw Error('VNDB_BAD_ANSWER');
 const link=(j.results[0]?.extlinks||[]).find(l=>plain(l)&&l.name==='website'&&typeof l.url==='string');return link&&publicUrl(link.url)?publicUrl(link.url).href:'';}
const fileUrl=(root,name)=>{try{const f=path.join(logoDir(root),name);if(!fs.existsSync(f))return '';const b=fs.readFileSync(f),t=iconType(b);return t?'data:'+t.mime+';base64,'+b.toString('base64'):'';}catch{return '';}};
/* the logo of one producer as a data: URL, or null (the page then draws the letter badge) */
async function logo(root,pid,{fetch:fetcher=globalThis.fetch,now=Date.now(),timeout=TIMEOUT}={}){
 if(!PID.test(String(pid||'')))return null;const c=readCache(root),e=c.p[pid];
 if(e&&now-e.at<(e.file?FRESH:MISS)){return e.file?fileUrl(root,e.file)||null:null;}
 if(!fetcher||now-c.failedAt<RETRY)return e?.file?fileUrl(root,e.file)||null:null;
 let site='';try{site=await website(fetcher,pid,timeout);}catch{c.failedAt=now;try{writeCache(root,c);}catch{}return e?.file?fileUrl(root,e.file)||null:null;}
 let file='';
 if(site){try{let icon='';try{const home=await getBytes(fetcher,site,MAX_HTML,timeout);if(home&&!iconType(home))icon=iconFromHtml(home.toString('utf8'),site);}catch{}
   for(const url of [icon,new URL('/favicon.ico',site).href].filter(Boolean)){let b=null;try{b=await getBytes(fetcher,url,MAX_ICON,timeout);}catch{}const t=b&&iconType(b);
    if(t){file=pid+'-'+require('node:crypto').createHash('sha256').update(b).digest('hex').slice(0,10)+'.'+t.ext;fs.mkdirSync(logoDir(root),{recursive:true});fs.writeFileSync(path.join(logoDir(root),file),b);break;}}}catch{}}
 c.p[pid]={at:now,site:site?new URL(site).origin:'',file};c.failedAt=0;try{writeCache(root,c);}catch{}
 return file?fileUrl(root,file)||null:null;}
module.exports={logo,iconType,iconFromHtml,publicUrl,readCache};
