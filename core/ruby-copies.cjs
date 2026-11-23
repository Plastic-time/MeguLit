// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
/* 2026-11-19 (1.4.17 live, 千恋＊万花 CHAPTER 1-1): a KiriKiri stream redrew one ruby line many times in one callback, the
   copies alternating between the base text and the reading laid over it:
     「志那都荘まで行って欲しいんですけど」「しなつ荘まで行って欲しいんですけど」「志那都荘まで…」…
   The exact-repeat normalizers (repeat-normalizer.cjs, double-line.cjs) fold only identical copies, so six copies reached the
   reader and overflowed the text box. This folds a block made of copies of one line that differ only where one copy has
   kanji and the other its kana reading (a ruby span), and keeps the copy with the base text (its reading belongs in the
   furigana, not in the line). Engine-agnostic. Kept as written:
    - identical copies (a script may repeat a line: the evidence rules of the other normalizers decide those),
    - copies that differ in kana only (「そうだ。」「そうか。」 are two sentences),
    - text that does not split into copies end to end. */
const HAN=/[㐀-鿿豈-﫿々〆ヶ]/u,KANA_ONLY=/^[ぁ-ゟァ-ヿー]+$/u;
function variant(a,b){
 if(a===b)return 'same';
 let p=0;while(p<a.length&&p<b.length&&a[p]===b[p])p++;
 let s=0;while(s<a.length-p&&s<b.length-p&&a[a.length-1-s]===b[b.length-1-s])s++;
 const ma=a.slice(p,a.length-s),mb=b.slice(p,b.length-s),kept=p+s,len=Math.max(a.length,b.length);
 if(kept<3||kept<len*.3)return '';
 const ruby=(x,y)=>x.length>0&&HAN.test(x)&&KANA_ONLY.test(y);
 return ruby(ma,mb)||ruby(mb,ma)?'ruby':'';
}
/* text -> {text, copies} when it is copies of one line with ruby variants, else null */
function collapse(text){
 if(typeof text!=='string')return null;
 const N=[],map=[];for(let i=0;i<text.length;i++){const c=text[i];if(!/\s/.test(c)){N.push(c);map.push(i);}}
 const n=N.length;if(n<8)return null;
 const open=N[0],close=N[n-1],str=c=>N.slice(c[0],c[1]).join('');
 for(let e=2;e<n-3;e++){
  if(N[e]!==close)continue; /* a copy ends where the line ends (its first character may itself be a ruby base) */
  const L=e+1,chunks=[[0,L]];let i=L,ok=true;
  while(i<n){let j=-1;
   for(let k=i+Math.max(1,Math.floor(L*.5))-1;k<n&&k-i+1<=Math.ceil(L*1.6);k++)if(N[k]===close&&(k===n-1||N[k+1]===open||variant(str([i,k+1]),str(chunks[0])))){j=k;break;}
   if(j<0){ok=false;break;}chunks.push([i,j+1]);i=j+1;}
  if(!ok||chunks.length<2)continue;
  const texts=chunks.map(str),kinds=texts.map(t=>variant(texts[0],t));
  if(kinds.some(k=>!k))continue;
  if(!kinds.includes('ruby'))return null; /* identical copies: not this normalizer's call */
  const han=t=>[...t].filter(c=>HAN.test(c)).length;let best=0;for(let k=1;k<texts.length;k++)if(han(texts[k])>han(texts[best]))best=k;
  const [a,b]=chunks[best],raw=text.slice(map[a],b<n?map[b]:text.length).trim();
  return {text:raw,copies:chunks.length};
 }
 return null;
}
module.exports={collapse,variant};
