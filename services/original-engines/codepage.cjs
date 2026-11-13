// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
/* E570 one code page per script: Shift-JIS for the originals, GBK for Chinese patches that re-pack the same script.
   Replacement characters and half-width katakana (what GBK bytes turn into when read as Shift-JIS) count against an
   encoding; a tie goes to the one with more kana. */
function codepage(all){if(!all||!all.length)return 'shift_jis';
 const score=enc=>{const t=new TextDecoder(enc).decode(all);return {bad:(t.match(/�/g)||[]).length*4+(t.match(/[｡-ﾟ]/g)||[]).length,kana:(t.match(/[ぁ-ゖァ-ヺ]/g)||[]).length};};
 const s=score('shift_jis'),g=score('gbk');return s.bad<g.bad||s.bad===g.bad&&s.kana>=g.kana?'shift_jis':'gbk';}
const decoder=bufs=>new TextDecoder(codepage(Buffer.concat(bufs.filter(b=>b&&b.some(c=>c>=0x80)).slice(0,4000))));
module.exports={codepage,decoder};
