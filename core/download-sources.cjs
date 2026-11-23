// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
/* The one list of download sources, kept in setup/runtime.json "mirrors" and read by both downloaders:
   setup/setup-runtime.ps1 (MeguFetch, first launch) and core/fast-download.cjs (everything inside the app).
   Each entry:
     url    template: {url} = the whole GitHub release URL, {tag}/{file} = its release tag and file name
     own    true: only for MeguLit's own release files (github.com/ilynthn/MeguLit), other files are not there
     cn     order in mainland China (lower first), world = order elsewhere; only a tie-break, every source is measured
     trust  first-party storage (our R2/EdgeOne, GitHub, our ModelScope/Hugging Face repos): after a SHA-256 mismatch
            on a mixed download only these are used again
     max    at most this many connections to the host (free public relays get few)
     off    true: listed but not used yet (repository not uploaded)
   A plain string entry (older manifests) is a relay: {url}, cn 2, world 2, not trusted. */
const fs=require('node:fs'),path=require('node:path');
const OWN=/^https:\/\/github\.com\/ilynthn\/MeguLit\/releases\/download\//i;
const DIRECT={url:'{url}',cn:9,world:0,trust:true};
const hostOf=u=>{try{return new URL(u).hostname.toLowerCase();}catch{return '';}};

let cache=null;
function load(root){
 const file=path.join(root||path.join(__dirname,'..'),'setup','runtime.json');
 if(cache&&cache.file===file)return cache.list;
 let raw=[];try{raw=JSON.parse(fs.readFileSync(file,'utf8')).mirrors||[];}catch{}
 const list=normalize(raw);cache={file,list};return list;
}
function normalize(raw){
 const list=(raw||[]).map(m=>typeof m==='string'?{url:m,cn:2,world:2,trust:false}:{...m}).filter(m=>m&&m.url&&!m.off);
 if(!list.some(m=>m.url==='{url}'))list.push({...DIRECT});
 return list;
}
function fill(template,url){const parts=String(url).split('/'),file=parts.pop()||'',tag=parts.pop()||'';return template.replace('{url}',url).replace('{tag}',tag).replace('{file}',file);}

/* Every source for one GitHub release URL, mainland or world order. */
function expand(url,{china=false,root,list}={}){
 const l=list||load(root),own=OWN.test(url);
 return l.filter(m=>own||!m.own).map((m,i)=>({u:fill(m.url,url),r:Number(china?m.cn:m.world),i})).sort((a,b)=>(a.r-b.r)||(a.i-b.i)).map(x=>x.u).filter((u,i,a)=>a.indexOf(u)===i);
}
/* host -> {rank, trust} from the templates; GitHub itself is the {url} entry */
function hostTable(list){
 const t=new Map();
 for(const m of list){const h=m.url.startsWith('{url}')?'github.com':hostOf(m.url.replace(/\{[a-z]+\}/g,'x'));if(h&&!t.has(h))t.set(h,m);}
 return t;
}
/* Orders any URL list by the hosts' rank in the list (unknown hosts keep their place after the known ones of lower rank). */
function rank(urls,{china=false,root,list}={}){
 const t=hostTable(list||load(root));
 const rows=[...new Set((urls||[]).filter(Boolean).map(String))].map((u,i)=>{const m=t.get(hostOf(u));return {u,i,r:m?Number(china?m.cn:m.world):5};});
 return rows.sort((a,b)=>(a.r-b.r)||(a.i-b.i)).map(x=>x.u);
}
const trusted=(url,{root,list}={})=>{const h=hostOf(url);if(h==='127.0.0.1'||h==='localhost')return false;const m=hostTable(list||load(root)).get(h);return !!(m&&m.trust)||/(^|\.)megulit\.com$/.test(h)||/(^|\.)github(usercontent)?\.com$/.test(h);};
/* connection limit of the host, 0 = none */
const limit=(url,{root,list}={})=>{const m=hostTable(list||load(root)).get(hostOf(url));return m&&Number(m.max)>0?Number(m.max):0;};
/* relay templates ({url}) only, for callers with their own GitHub URLs (update package, Locale Emulator) */
const relays=({root,list}={})=>(list||load(root)).filter(m=>m.url!=='{url}'&&m.url.startsWith('https://')&&m.url.endsWith('{url}')&&!m.own);

module.exports={load,normalize,expand,rank,trusted,limit,relays,fill,hostOf,_reset:()=>{cache=null;}};
