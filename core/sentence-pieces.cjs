// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
/* 2026-11-19 (user, 素晴らしき日々 BGI: 「やっぱり……いい女には、」「たばこと」「屋上と」「……そして」「ヒラヒラ服だわね……」」 is one sentence the game adds to
   its box piece by piece, one click each; the reader showed four sentences replacing each other). The grown line also
   resolves in the script as one capture (Matcher steps over the resource lines between the messages), so its translation
   is the whole sentence's. Any engine.
   Engine evidence first: a \x05 continuation is joined in the bridge (HookSourceFrames), a page the engine turns or leaving
   the dialogue screen ends the sentence (reset), a new speaker name starts a new one. The text rule is only the fallback
   and stays narrow: the previous line of the same stream is inside an open 「『 (narration without a full stop never joins),
   and the piece does not open a new line (indent, bracket, a name before a bracket). */
const flat=s=>String(s||'').replace(/[\s　]+/g,'');
const NEW_LINE=/^[　 「『（(【［[]/,NAMED_QUOTE=/^[^「『」』。、\s]{1,16}[「『]/;
function unfinished(text){const t=String(text||'').trimEnd();if(!t||/[。．！？!?）)】]$/.test(t))return false;
 let depth=0;for(const c of t){if(c==='「'||c==='『')depth++;else if(c==='」'||c==='』')depth=Math.max(0,depth-1);}
 return depth>0;}
function continues(piece){const t=String(piece||'').replace(/^\n+/,'');return !!t.trim()&&!NEW_LINE.test(t)&&!NAMED_QUOTE.test(t);}
class SentencePieces{
 constructor(now=()=>Date.now(),{within=60000,max=400}={}){this.now=now;this.within=within;this.max=max;this.last=null;}
 /* The line to deliver for this piece: the grown sentence, or the piece itself. speaker: the name the engine gave with it. */
 take(stream,piece,speaker='',speakerAt=Infinity){const now=this.now(),L=this.last,p=String(piece??''),who=String(speaker||'');let out=p;
  /* 2026-11-19 (installed 1.4.17, 素晴らしき日々, pieces 1.8 s apart): the name of the previous piece came after that piece and was still
     recent, so it read as a new speaker and the line did not grow. Only a name that came after the previous piece is a new one. */
  const newName=who&&L&&speakerAt>L.at&&who!==L.speaker;
  if(L&&L.stream===stream&&now-L.at<this.within&&!newName&&unfinished(L.text)&&continues(p)){const a=flat(L.text),b=flat(p);
   if(b.startsWith(a))out=p; /* the engine sent the grown sentence itself */
   else if(a.endsWith(b))out=L.text; /* the last piece again (a redraw): nothing new */
   else if(L.text.length+p.length<=this.max)out=L.text+p;}
  const grew=out!==p&&!!L;this.last={stream,text:out,at:now,speaker:grew?L.speaker||who:who,pieces:grew?(out===L.text?L.pieces:[...L.pieces,p]):[p]};return out;}
 /* The pieces the current grown line was made of (for a translation pieced together when the whole line has none), or null. */
 piecesOf(text){const L=this.last;return L&&L.pieces.length>1&&flat(L.text)===flat(text)?L.pieces.slice():null;}
 /* A name given just after a line (a name stream flushed later than the text) belongs to that line. */
 nameAfter(name,at=this.now()){const L=this.last;if(L&&!L.speaker&&name&&at-L.at>=0&&at-L.at<=1000)L.speaker=String(name);}
 reset(){this.last=null;}
}
module.exports={SentencePieces,unfinished,continues};
