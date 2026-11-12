// SPDX-License-Identifier: GPL-3.0-or-later
/* 2026-11-13 (user): after a dictionary search, words related to the query float into the drifting field. Taken only
   from local data: the bundled JLPT word list (core/jlpt-words.json) and the learner's own saved words. Three kinds:
   - kanji: shares a kanji with the query (夢 → 夢中・悪夢)
   - reading: same reading, other spelling (橋・箸・端)
   - near: a saved word whose definition shares a meaning token with the query's own definition (near-synonym)
   Each word comes back with the learner's proficiency (vocabulary.status: 0 new, 1 learning, 2+ known; unsaved = null). */
const fs=require('node:fs'),path=require('node:path');
const KANJI=/[㐀-鿿]/g;
const hira=s=>String(s||'').replace(/[ァ-ヶ]/g,c=>String.fromCharCode(c.charCodeAt(0)-0x60));
let cache=null;
function words(file=path.join(__dirname,'..','core','jlpt-words.json')){
  if(cache&&cache.file===file)return cache.list;
  const data=JSON.parse(fs.readFileSync(file,'utf8')),list=[];
  for(const level of ['N5','N4','N3','N2','N1'])for(const item of data?.levels?.[level]||[]){const [spell,reading='']=String(item).split('|');for(const f of spell.split('/').filter(Boolean))list.push({t:f,reading:hira(reading),level});}
  cache={file,list};return list;
}
/* meaning tokens: CJK runs of 2+ chars or latin words of 3+, from a definition string */
function tokens(def){
  const s=String(def||'').replace(/[（(][^）)]*[）)]/g,' ');const out=new Set();
  for(const m of s.match(/[一-鿿]{2,}/g)||[])out.add(m);
  for(const m of s.toLowerCase().match(/[a-z]{3,}/g)||[])if(!/^(the|and|for|with|one|something|someone|that|this|thing|being|have|from)$/.test(m))out.add(m);
  return out;
}
function related({query,reading='',definition=''},{list=words(),vocab=[],limit=16}={}){
  const q=String(query||'').trim();if(!q)return [];
  const qr=hira(reading||(/^[ぁ-ゟァ-ーー]+$/.test(q)?q:'')),kan=new Set(q.match(KANJI)||[]);
  const status=new Map();for(const v of vocab){const s=String(v?.spelling||'').trim();if(s&&!status.has(s))status.set(s,Number(v.status)||0);}
  const seen=new Set([q]),out=[];
  const add=(t,why)=>{if(!t||seen.has(t)||t.length>8)return;seen.add(t);out.push({t,why,status:status.has(t)?status.get(t):null});};
  const byKanji=[],byReading=[];
  for(const w of list){
    if(qr&&w.reading===qr&&w.t!==q)byReading.push(w.t);
    if(kan.size){const ks=w.t.match(KANJI)||[];if(ks.some(k=>kan.has(k)))byKanji.push(w.t);}
  }
  /* saved words first in each kind: they are the learner's own */
  const mine=t=>status.has(t)?0:1;
  byReading.sort((a,b)=>mine(a)-mine(b)).slice(0,5).forEach(t=>add(t,'reading'));
  byKanji.sort((a,b)=>mine(a)-mine(b)||a.length-b.length).slice(0,8).forEach(t=>add(t,'kanji'));
  for(const v of vocab){const t=String(v?.spelling||'').trim();if(!t||seen.has(t))continue;if(kan.size&&(t.match(KANJI)||[]).some(k=>kan.has(k)))add(t,'kanji');}
  const qt=tokens(definition);
  if(qt.size)for(const v of vocab){const t=String(v?.spelling||'').trim();if(!t||seen.has(t))continue;for(const x of tokens(v.definitions))if(qt.has(x)){add(t,'near');break;}if(out.filter(o=>o.why==='near').length>=5)break;}
  return out.slice(0,limit);
}
module.exports={related,tokens,words};
