// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
/* example_ruby: furigana spans for example sentences shown on the study pages (see core/example-ruby.cjs).
   The game's ruby comes from the request (grammar examples carry it) or from the recorded line the sentence was read
   as (reading_events keeps the engine's markup); the rest from the dictionary-settled readings. Answers are cached. */
const {exampleSpans,plainWithRuby}=require('../core/example-ruby.cjs');
const cache=new Map();let historyRuby=null,historyAt=0;
const key=(text,pairs)=>text+'\u0001'+JSON.stringify(pairs||[]);
/* Bound the copied prefix without splitting a supplementary character or walking the whole input. */
function prefixCodepoints(value,limit){let out='',n=0;for(const ch of String(value)){if(n++===limit)break;out+=ch;}return out;}
/* plain text → game ruby pairs, from the recorded lines that still carry ruby markup (refreshed once a minute) */
function gameRubyOf(db,text){
  if(!db)return [];
  if(!historyRuby||Date.now()-historyAt>60000){historyRuby=new Map();historyAt=Date.now();
    try{for(const r of db.prepare("SELECT text FROM reading_events WHERE text LIKE '%<r%' OR text LIKE '%《%' OR text LIKE '%\x1d%' ORDER BY id DESC LIMIT 20000").all()){
      const p=plainWithRuby(r.text,true);if(!p.ruby.length)continue;const plain=p.text.replace(/\s+/g,'');if(!historyRuby.has(plain))historyRuby.set(plain,p.ruby);}}catch{}}
  return historyRuby.get(String(text).replace(/\s+/g,''))||[];
}
async function exampleRuby(db,learning,items){
  const list=(Array.isArray(items)?items:[]).slice(0,120);
  const ready=!!learning?.installed?.();
  const out=[];
  for(const item of list){
    const raw=String(item?.text||'').slice(0,600);if(!raw){out.push({text:'',spans:[]});continue;}
    const own=plainWithRuby(raw,true),text=own.text;
    const given=Array.isArray(item.ruby)?item.ruby.filter(p=>Array.isArray(p)&&p.length>=2).slice(0,64).map(p=>{
      const pair=[prefixCodepoints(p[0],80),prefixCodepoints(p[1],160)];if(Number.isInteger(p[2]))pair.push(p[2]);return pair;}):[];
    const pairs=[...own.ruby,...given];if(!pairs.length&&item.ruby!==false)pairs.push(...gameRubyOf(db,text));
    const k=(ready?'1':'0')+key(text,pairs);if(cache.has(k)){out.push(cache.get(k));continue;}
    let tokens=[],failed=false;if(ready&&/[\p{Script=Han}々]/u.test(text))try{tokens=learning.readings.resolve(await learning.tokenize(text));}catch{tokens=[];failed=true;}
    const r={text,spans:exampleSpans(text,tokens,pairs)};
    if(!failed&&(ready||pairs.length)){cache.set(k,r);if(cache.size>3000)cache.delete(cache.keys().next().value);}
    out.push(failed?{...r,retry:true}:r);
  }
  return {ready,items:out};
}
module.exports={exampleRuby,gameRubyOf};
