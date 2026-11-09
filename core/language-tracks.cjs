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

/* A whole line of Chinese (no kana, mostly Han, at least two characters only Chinese uses). Japanese lines written only in
   kanji are short and do not use these function characters. */
const ZH_ONLY=/[這这麼么嗎吗您們们個个裡請请說说沒没還还讓让給给對对呢吧啊妳哪喔]/gu;
/* E270 (user, ATRI: a Traditional Chinese line still reached the reader as Japanese): also count Han forms that modern
   Japanese writes differently (traditional 從圖讓與學會實點經國關應歡聽讀賣錢樣黑處體發變邊氣當覺 and simplified 时为无开关长
   见头应问题电话书车门东亲爱欢谢语听读买卖钱样谁黑处发变边气觉), and the full-width comma ， that Japanese text does not use. */
const ZH_FORM=/[從圖讓與學會實點經國關應歡聽讀賣錢樣黑處體發變邊氣當覺爲无为时开关长见头应问题电话书车门东亲爱欢谢语听读买卖钱样谁处发变边气觉试图从实经]/gu;
function zhScore(t){return (t.match(ZH_ONLY)||[]).length+(t.match(ZH_FORM)||[]).length;}
function foreignLine(text){const t=String(text||'');if(KANA.test(t))return false;const han=(t.match(/[㐀-鿿]/gu)||[]).length;if(han<6)return false;const score=zhScore(t);return score>=2||(score>=1&&t.includes('，'));}
/* A line that arrives as Japanese rows plus a Chinese row of the same text keeps only the Japanese rows. */
// Chinese translation patches that "borrow" Shift-JIS code points (借码) store Chinese sentences as unrelated JIS kanji;
// only the patch's own font shows them as Chinese. Read back (an old save from the patched game, a patch launcher
// bypassed) they look like 根劃痩，扇晃顧顕亜錘廠笠… : long, kana-free, kanji-only, with Chinese full-width commas.
// Japanese dialogue of that length always carries kana and uses 、 (user report 2026-11-09, WHITE ALBUM2).
function borrowedCode(text){const t=String(text||'').replace(/\s+/g,'');if(KANA.test(t)||!t.includes('，'))return false;const han=(t.match(/[㐀-鿿]/gu)||[]).length;return han>=12&&han/[...t].length>=.7&&zhScore(t)<=1;}
function foreignRows(text){const rows=String(text).split(/\r?\n/);if(rows.length<2||!rows.some(r=>KANA.test(r)))return text;const kept=rows.filter(r=>!foreignLine(r));return kept.length&&kept.length<rows.length?kept.join('\n'):text;}
function japaneseTrack(text){
 if(typeof text!=='string'||!text)return text;
 let out=inlineAlternatives(text);
 out=tracks(out)??out;
 out=semicolonTracks(out)??out;
 out=foreignRows(out);
 return out;
}
module.exports={borrowedCode,foreignLine,foreignRows,japaneseTrack,inlineAlternatives,tracks,semicolonTracks};
