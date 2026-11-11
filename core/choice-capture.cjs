// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
/* E407 choices for every engine: the hook's other streams (choice role 3, or any stream that is not the dialogue or the
   name) carry the choice texts. They are only collected here; nothing is ever written back into the game. A burst of two
   or more short distinct lines that are not the current dialogue line is a choice candidate; OCR (PageLocator) then
   keeps only those drawn on screen as rows of their own, so stray system strings never reach the overlay. */
const plain=s=>String(s||'').replace(/\s+/g,'');
const japanese=s=>/[぀-ヿ一-鿿]/.test(s);
/* E416 (BGI, 穢翼のユースティア): the name stream (【オズ】) and typewriter fragments of the line being shown (「こ、」 for
   「こいつです、間違いありません」) made a two-item "choice" on every spoken line, and the choice overlay was drawn over the
   dialogue. A 【name】 alone is a speaker; a short text whose characters all appear in order in the current line is part of it. */
const NAME=/^【[^】]{1,12}】$/;
const bare=s=>plain(s).replace(/[「」『』（）()【】、。，．！？!?…‥ー〜～]/g,'');
function partOf(line,dialogue){if(!/^[「『]/.test(line.trim()))return false;const a=bare(line),b=bare(dialogue);if(!a||!b||a.length>b.length)return false;let j=0;for(const c of b){if(c===a[j])j++;if(j===a.length)return true;}return false;}
class ChoiceCapture{
 constructor(now=()=>Date.now()){this.now=now;this.items=[];this.active=false;this.at=0;}
 /* text: one stream frame (may hold several choices separated by line breaks); dialogue/speaker: the current line and name. */
 add(text,dialogue='',speaker=''){
  const now=this.now(),skip=new Set([plain(dialogue),plain(speaker)]);this.items=this.items.filter(x=>now-x.at<1500);
  const added=[];
  for(const raw of String(text||'').split(/\r?\n|\\n/)){
   const line=raw.trim().replace(/^[\d０-９]+[.．、:：)\]]\s*/,'');const key=plain(line);
   if(!key||key.length<2||key.length>40||!japanese(line)||skip.has(key)||plain(dialogue).includes(key)&&key.length>6||NAME.test(key)||partOf(line,dialogue))continue;
   if(/^[\x00-\x7f]+$/.test(line)||/[{}<>\\\/=_]|\.(png|ogg|wav|bmp|txt|ks|ybn)$/i.test(line))continue;
   const old=this.items.find(x=>x.key===key);if(old){old.at=now;continue;}
   this.items.push({key,text:line,at:now});added.push(line);
  }
  if(this.items.length>12)this.items.splice(0,this.items.length-12);
  return added;
 }
 options(){return this.items.length>=2&&this.items.length<=8?this.items.map(x=>x.text):null;}
 reset(){this.items=[];this.active=false;}
}
module.exports={ChoiceCapture};
