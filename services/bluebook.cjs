// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
/* 学习 → 语法 · grammar cards from the learner's own Anki (2026-11-11, user: 本地 Anki 里有蓝宝书 N5–N1 语法，把语法条加进来
   和我们的课融合). Nothing of those cards ships with MeguLit: they are read at run time from the collection on this
   computer (a copy, read only), so each learner sees the decks they own. A note type counts when it has the fields
   Word, Level and Explain1 / Example1 (the layout of the 蓝宝书 grammar decks); other decks are ignored. */
const fs=require('fs'),path=require('path'),os=require('os');
const plain=s=>String(s||'').replace(/<br\s*\/?>/gi,' ').replace(/<[^>]+>/g,'').replace(/&nbsp;/g,' ').replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&amp;/g,'&');
/* Anki furigana 「 以[い] 外[がい]」 → 以外 */
const noRuby=s=>plain(s).replace(/\s*([^\s\[\]]+?)\[[^\]]*\]/g,'$1').replace(/\s+/g,' ').trim();
function profiles(env=process.env){const base=env.APPDATA&&path.join(env.APPDATA,'Anki2');if(!base||!fs.existsSync(base))return [];
  return fs.readdirSync(base,{withFileTypes:true}).filter(d=>d.isDirectory()&&fs.existsSync(path.join(base,d.name,'collection.anki2'))).map(d=>({name:d.name,file:path.join(base,d.name,'collection.anki2')}));}
/* One example line: the text without furigana, and the bold part (the grammar) as the highlight. */
function example(html,zh){const ja=noRuby(html);if(!ja)return null;const m=String(html).match(/<b>([\s\S]*?)<\/b>/i),hl=m?noRuby(m[1]):'';return {ja,hl:hl&&ja.includes(hl)?hl:'',zh:plain(zh).trim()};}
/* The forms that mark the point in a line: the headword split at ／ and 、 without ～, plus the bold parts of its examples. */
function hitsOf(word,examples){const out=new Set();
  for(const w of noRuby(word).split(/[\/／、,，]|\s+or\s+/))for(const v of [w.replace(/[～~〜（）()]/g,'').trim()])if([...v].length>=2&&!/[A-Za-z＋+]/.test(v))out.add(v);
  for(const e of examples)if(e.hl&&[...e.hl].length>=2&&[...e.hl].length<=12)out.add(e.hl);
  return [...out];}
function parse(db){
  const types=db.prepare('SELECT id,name FROM notetypes').all().filter(t=>{const f=db.prepare('SELECT name FROM fields WHERE ntid=? ORDER BY ord').all(t.id).map(x=>x.name);return ['Word','Level','Explain1','Example1'].every(n=>f.includes(n));});
  const out=[];
  for(const t of types){const names=db.prepare('SELECT name FROM fields WHERE ntid=? ORDER BY ord').all(t.id).map(x=>x.name),idx=Object.fromEntries(names.map((n,i)=>[n,i]));
    const f=(row,n)=>idx[n]==null?'':row[idx[n]]||'',many=(row,p,max)=>Array.from({length:max},(_,i)=>f(row,p+(i+1))).filter(x=>plain(x).trim());
    for(const n of db.prepare('SELECT id,flds FROM notes WHERE mid=?').all(t.id)){const row=String(n.flds).split('\x1f'),level=(plain(f(row,'Level')).match(/N[1-5]/)||[])[0];if(!level)continue;
      const word=noRuby(f(row,'Word')).replace(/^\s+/,'');if(!word)continue;
      const examples=Array.from({length:25},(_,i)=>example(f(row,'Example'+(i+1)),f(row,'Chinese'+(i+1)))).filter(Boolean);
      out.push({id:'bb-'+String(n.id),level,word,form:many(row,'ConnectiveType',10).map(noRuby),explain:many(row,'Explain',15).map(noRuby),notes:many(row,'Note',15).map(noRuby),examples,hits:hitsOf(word,examples),order:Number(plain(f(row,'TotalOrder')))||0,deck:t.name});}}
  return out.sort((a,b)=>a.level.localeCompare(b.level)||a.order-b.order);
}
/* Reads every Anki profile on this computer (copies first: Anki may be open), cached by the files' modified time. */
function read(root,{env=process.env}={}){
  const list=profiles(env);if(!list.length)return {available:false,points:[]};
  const stamp=list.map(p=>{let m=0;for(const x of [p.file,p.file+'-wal'])try{m=Math.max(m,fs.statSync(x).mtimeMs);}catch{}return p.name+':'+m;}).join('|');
  const cache=path.join(root,'data','grammar-anki-cache.json');try{const c=JSON.parse(fs.readFileSync(cache,'utf8'));if(c.stamp===stamp)return c.result;}catch{}
  const {DatabaseSync}=require('node:sqlite'),points=[],seen=new Set();
  for(const p of list){const dir=fs.mkdtempSync(path.join(os.tmpdir(),'megulit-anki-')),copy=path.join(dir,'c.anki2');
    try{fs.copyFileSync(p.file,copy);if(fs.existsSync(p.file+'-wal'))fs.copyFileSync(p.file+'-wal',copy+'-wal');const db=new DatabaseSync(copy);try{for(const x of parse(db))if(!seen.has(x.word+x.level)){seen.add(x.word+x.level);points.push({...x,profile:p.name});}}finally{db.close();}}
    catch{}finally{try{fs.rmSync(dir,{recursive:true,force:true});}catch{}}}
  const result={available:points.length>0,points};
  try{fs.mkdirSync(path.dirname(cache),{recursive:true});fs.writeFileSync(cache,JSON.stringify({stamp,result}));}catch{}
  return result;
}
/* The lines you read that contain each card's forms (at most 4 per card, recorded lines and human translations first). */
function examplesFor(points,list,{max=4}={}){
  const score=e=>(e.translationSource==='group'||e.translationSource==='official'?4:e.translation?1:0)+(e.origin==='history'?2:0);
  const out={};for(const p of points){const hits=[...p.hits].sort((a,b)=>b.length-a.length),found=[];
    for(const c of list){if(found.length>=20)break;const h=hits.find(x=>c.text.includes(x));if(!h)continue;const at=c.text.indexOf(h),start=[...c.text.slice(0,at)].length;
      found.push({text:c.text,origin:c.origin,gameId:c.gameId,title:c.title,translation:c.translation,translationSource:c.translationSource,start,end:start+[...h].length,readAt:c.readAt,readBy:c.readBy});}
    if(found.length)out[p.id]=found.sort((a,b)=>score(b)-score(a)).slice(0,max);}
  return out;
}
module.exports={read,parse,profiles,examplesFor,noRuby,hitsOf};
