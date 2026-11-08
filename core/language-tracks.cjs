// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
/* Multilingual containers, for every engine (E243, 2026-11-09). Multilingual builds (KiriKiri Z: Maitetsu Pure Station,
   サノバウィッチ) keep every language of a line in one string and let the engine pick the track. A hook that sits before
   that split sees the whole container:
    - track separators the hook cannot decode arrive as runs of ？ / ? / U+FFFD / private-use characters:
      「jp」「jp」？？？？？？「jp」「jp」？？？？？？「简」「简」？？？？？？「繁」「繁」
    - inline alternatives are written as %l<ja>;<zh-Hans>;<zh-Hant>%l (the %l markers and ; leak as text).
   Only the Japanese track is kept. Nothing is cut unless the string proves it is a container: at least two tracks, one
   with kana, and another that repeats it or carries Han text without kana. Ordinary lines such as 「？？？」 pass. */
const KANA=/[ぁ-ゟァ-ヺー]/u,HAN=/[㐀-鿿]/u;
const SEP=/[?？�-￰-￿]{3,}/u,SEP_ALL=new RegExp(SEP.source,'gu');
const key=s=>s.replace(/\s+/g,'');

/* %l…%l groups: keep the first alternative with kana (else the first). Stray markers and the ; next to them go. */
function inlineAlternatives(text){
 if(!/%l[^%\r\n]*;[^%\r\n]*%l/.test(text)||!KANA.test(text))return text;
 let out=text.replace(/%l([^%\r\n]*?)%l/g,(all,body)=>{const alts=body.split(';');return alts.find(a=>KANA.test(a))??alts[0];});
 out=out.replace(/;?%l;?/g,'').replace(/^;|;(?=[。、．，」』）\s]|$)/g,'');
 return out;
}

/* Two halves of the same text (ignoring line breaks): keep the first, which carries the game's own breaks. */
function halve(s){const n=key(s);if(n.length<4||n.length%2)return s;const h=n.length/2;if(n.slice(0,h)!==n.slice(h))return s;
 let seen=0;for(let i=0;i<s.length;i++){if(!/\s/.test(s[i]))seen++;if(seen===h)return s.slice(0,i+1);}return s;}

function tracks(text){
 if(!SEP.test(text)||!KANA.test(text))return null;
 const parts=text.split(SEP_ALL).map(s=>s.trim()).filter(s=>key(s).length>=2);
 if(parts.length<2)return null;
 const jp=parts.filter(s=>KANA.test(s)),other=parts.filter(s=>!KANA.test(s)&&HAN.test(s));
 if(!jp.length)return null;
 const duplicated=jp.length>1&&jp.every(s=>key(s)===key(jp[0]));
 if(!duplicated&&!other.length)return null;
 /* The engine keeps each track twice (display + measure); one copy of the Japanese track is the line. */
 return halve(jp[0]);
}

/* Top-level ja;zh-Hans;zh-Hant: the first part has kana, every other part is Han without kana. */
function semicolonTracks(text){
 if(!text.includes(';')||!KANA.test(text))return null;
 const parts=text.split(';').map(s=>s.trim()).filter(Boolean);
 if(parts.length<2||!KANA.test(parts[0]))return null;
 return parts.slice(1).every(s=>!KANA.test(s)&&HAN.test(s))?parts[0]:null;
}

function japaneseTrack(text){
 if(typeof text!=='string'||!text)return text;
 let out=inlineAlternatives(text);
 out=tracks(out)??out;
 out=semicolonTracks(out)??out;
 return out;
}
module.exports={japaneseTrack,inlineAlternatives,tracks,semicolonTracks};
