// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
/* 2026-11-21 (owner, ファタモルガーナの館 1.4.22 test 02:25Z: the opening 「聖なるかな」 three times on a picture, faded in row by row,
   showed one mistranslated line 「我想知道会不会是一份表格。」). The OCR art scan read the first row as 「型なるかな」 and that single
   reading was taken; the two-row group read 「聖なるかな平なるかな」 then 「型なるかな聖なるかな」 and was refused as a list; the three-row
   group read 「型なるかな型なるかな聖なるかな」, 「聖なるかな聖なるかな聖なるかな」, 「叩なるかな叩なるかな叩なるかな」 (fade out). Every engine's
   picture text fades in this way, so the read is settled here, not per game:
     vote(): one character a position, by majority over every reading of the group and, when its rows are the same phrase
             (a litany, a repeated line), over every row: 型/聖/平/叩 -> 聖;
     repeated: rows that vote to one phrase are that phrase once, never a list;
     confident: a reading taken only when a second reading agrees with it or the vote has at least two voices;
     supersedes(): a newer group over the same place with more rows is the same text still fading in: the smaller one waits. */
const plain=t=>String(t||'').replace(/[\s　]/g,'');
function majority(strings){
 const L=[...strings[0]].length;if(!strings.every(s=>[...s].length===L))return null;
 let out='';for(let i=0;i<L;i++){const n=new Map();for(const s of strings){const c=[...s][i];n.set(c,(n.get(c)||0)+1);}let best='',bn=0;for(const [c,k] of n)if(k>bn){best=c;bn=k;}out+=best;}
 return out;
}
const diff=(a,b)=>{const x=[...a],y=[...b];if(x.length!==y.length)return Infinity;let d=0;for(let i=0;i<x.length;i++)if(x[i]!==y[i])d++;return d;};
/* reads: [[row text, …] …] oldest first (the group's readings, each split in rows) -> {text, rows, repeated, voices} */
function vote(reads){
 const last=reads[reads.length-1]||[],rows=last.map(plain).filter(Boolean);if(!rows.length)return {text:'',rows:[],repeated:false,voices:0};
 /* the same phrase on every row: every row of every reading that has the phrase's length votes */
 const L=[...rows[0]].length,same=rows.length>=2&&rows.every(r=>[...r].length===L);
 if(same){const pool=reads.flat().map(plain).filter(r=>[...r].length===L),v=majority(pool);
  if(v&&rows.every(r=>diff(r,v)<=Math.max(1,Math.floor(L/3))))return {text:v,rows:[v],repeated:true,voices:pool.length};}
 /* otherwise row by row over the readings with the same row count */
 const alike=reads.filter(r=>r.length===last.length).map(r=>r.map(plain));let voices=alike.length;
 const out=rows.map((r,i)=>{const col=alike.map(a=>a[i]).filter(x=>x&&[...x].length===[...r].length);return col.length>=2?majority(col)||r:r;});
 return {text:out.join(''),rows:out,repeated:false,voices}; /* rows joined as the group's own text is */
}
/* the reading is good enough to show: read once (a still picture is read once), confirmed by the reading before it, or settled by a
   vote of two or more; a group whose readings disagree and cannot be voted is still changing (a fade) or misread */
function confident(reads,v){if(reads.length<2||v.voices>=2)return true;const a=reads[reads.length-1],b=reads[reads.length-2];return a.map(plain).join('\n')===b.map(plain).join('\n');}
const boxOf=rows=>rows.reduce((b,r)=>{const x=+r?.x,y=+r?.y,w=+r?.w,h=+r?.h;if(![x,y,w,h].every(Number.isFinite))return b;return b?{x0:Math.min(b.x0,x),y0:Math.min(b.y0,y),x1:Math.max(b.x1,x+w),y1:Math.max(b.y1,y+h)}:{x0:x,y0:y,x1:x+w,y1:y+h};},null);
/* another group over the same place with more rows (seen after this one) is this text still growing */
function supersedes(other,it){
 if(!other||other===it||!(other.rows?.length>it.rows?.length))return false;const a=boxOf(it.rows),b=boxOf(other.rows);if(!a||!b)return false;
 const iw=Math.min(a.x1,b.x1)-Math.max(a.x0,b.x0),ih=Math.min(a.y1,b.y1)-Math.max(a.y0,b.y0);if(iw<=0||ih<=0)return false;
 return iw*ih>=0.5*(a.x1-a.x0)*(a.y1-a.y0);
}
module.exports={vote,confident,supersedes,majority};
