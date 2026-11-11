// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
/* E407 choices for every engine: the hook's other streams (choice role 3, or any stream that is not the dialogue or the
   name) carry the choice texts. They are only collected here; nothing is ever written back into the game. A burst of two
   or more short distinct lines that are not the current dialogue line is a choice candidate; OCR (PageLocator) then
   keeps only those drawn on screen as rows of their own, so stray system strings never reach the overlay.
   E416 (user 2026-11-11: fix it for every engine, not per game). The streams next to the dialogue also carry the speaker's
   name and pieces of the line being typed out (穢翼のユースティア: 【オズ】 and 「こ、」 on every spoken line), which made a
   two-item "choice" and put the choice overlay over the text. Engine-independent signals now decide what is not a choice:
   - a lone bracketed name (【…】 〔…〕 ［…］ 《…》 <…>) is a speaker (an unbracketed name may be a route choice)
   - quoted text already shown as dialogue: equal to one of the recent lines
   - a quoted piece of the line on screen: a prefix of it, or its characters in order
   - the dialogue still growing (typewriter) after short candidates (3 characters or fewer) arrived */
const plain=s=>String(s||'').replace(/\s+/g,'');
const japanese=s=>/[぀-ヿ一-鿿]/.test(s);
const NAME=/^(【[^】]{1,16}】|〔[^〕]{1,16}〕|［[^］]{1,16}］|《[^》]{1,16}》|<[^>]{1,16}>)$/;
const bare=s=>plain(s).replace(/[「」『』（）()【】〔〕［］《》<>、。，．！？!?…‥ー〜～・]/g,'');
function partOf(line,dialogue){const key=plain(line),d=plain(dialogue);if(!key||!d)return false;
 /* only quoted pieces: an unquoted short choice (はい) may well begin the line or occur in it */
 if(!/^[「『（(]/.test(line.trim()))return false;if(d.startsWith(key))return true;const a=bare(line),b=bare(dialogue);if(!a||!b||a.length>b.length)return false;let j=0;for(const c of b){if(c===a[j])j++;if(j===a.length)return true;}return false;}
class ChoiceCapture{
 constructor(now=()=>Date.now()){this.now=now;this.items=[];this.active=false;this.at=0;this.lines=[];this.names=new Set();this.dialogue='';this.grewAt=0;}
 /* every dialogue line (and its speaker) as the hook delivers it; a line that extends the previous one is typing */
 noteDialogue(text,speaker=''){const t=plain(text);if(!t)return;
  if(this.dialogue&&t!==this.dialogue&&t.startsWith(this.dialogue))this.grewAt=this.now();
  this.dialogue=t;if(!this.lines.includes(t)){this.lines.push(t);if(this.lines.length>40)this.lines.shift();}
  const n=plain(speaker);if(n){this.names.add(n);this.names.add(n.replace(/^[【〔［《<]|[】〕］》>]$/g,''));if(this.names.size>64)this.names.delete(this.names.values().next().value);}}
 /* text: one stream frame (may hold several choices separated by line breaks); dialogue/speaker: the current line and name. */
 add(text,dialogue='',speaker=''){
  const now=this.now(),skip=new Set([plain(dialogue),plain(speaker)]);this.items=this.items.filter(x=>now-x.at<1500);
  if(plain(speaker))this.names.add(plain(speaker));
  const added=[];
  for(const raw of String(text||'').split(/\r?\n|\\n/)){
   const line=raw.trim().replace(/^[\d０-９]+[.．、:：)\]]\s*/,'');const key=plain(line);
   if(!key||key.length<2||key.length>40||!japanese(line)||skip.has(key)||plain(dialogue).includes(key)&&key.length>6)continue;
   /* kept narrow so a real choice is never dropped: a choice can be a character's name (route choices), so only a
      bracketed lone name counts as a speaker; an earlier line only when it is quoted dialogue */
   if(NAME.test(key)||/^[「『]/.test(key)&&this.lines.includes(key)||partOf(line,dialogue||this.dialogue))continue;
   if(/^[\x00-\x7f]+$/.test(line)||/[{}<>\\\/=_]|\.(png|ogg|wav|bmp|txt|ks|ybn)$/i.test(line))continue;
   const old=this.items.find(x=>x.key===key);if(old){old.at=now;continue;}
   this.items.push({key,text:line,at:now});added.push(line);
  }
  if(this.items.length>12)this.items.splice(0,this.items.length-12);
  return added;
 }
 options(){if(this.items.length<2||this.items.length>8)return null;
  /* the dialogue kept typing after the first candidate arrived: these were pieces of it, not a choice screen */
  const first=Math.min(...this.items.map(x=>x.at));if(this.grewAt&&this.grewAt>=first&&this.items.every(x=>bare(x.text).length<=3))return null;
  return this.items.map(x=>x.text);}
 reset(){this.items=[];this.active=false;}
}
module.exports={ChoiceCapture};
