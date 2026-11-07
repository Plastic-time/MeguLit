// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
// Engine string streams also carry scene/chapter keys and asset ids ("10_1", "bg_01.png", "Chapter2"). Text whose every
// non-empty line is a bare ASCII identifier with a digit or separator is never dialogue, a choice or a caption.
// Some engines also leak runaway control/script buffers made of one short token repeated ("_wipe_wipe_wipe…",
// "fadefadefade"); those are dropped at any length, while normal English prose still passes because it has spaces.
const IDENT=/^[A-Za-z0-9_.:\/\-]+$/;
function repeatedToken(line){
 if(line.length<12||!IDENT.test(line))return false;
 const tokens=line.split(/[_.:\/\-]+/).filter(Boolean);
 if(tokens.length>=4){const counts=new Map();for(const t of tokens)counts.set(t,(counts.get(t)||0)+1);const top=Math.max(...counts.values());if(top>=3&&top/tokens.length>=0.6)return true;}
 // No separator: a 2-16 char unit repeated at least three times, allowing a cut-off unit at either end.
 return /^.{0,15}?(.{2,16})\1{2,}.{0,15}$/.test(line)&&/^(?:.{0,15}?)(.{2,16})\1{2,}/.exec(line)[0].length>=line.length*0.6;
}
function identifierNoise(text){const lines=String(text||'').split(/\r?\n/).map(l=>l.trim()).filter(Boolean);return lines.length>0&&lines.every(l=>(l.length<=64&&IDENT.test(l)&&/[0-9_.:\/\-]/.test(l))||repeatedToken(l));}
module.exports={identifierNoise,repeatedToken};
