// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
/* E449 FVP (FAVORITE View Point: いろとりどりのセカイ and the other FAVORITE titles). The whole scenario is one
   <name>.hcb next to the exe: a u32 at 0 is the offset of the system description, the bytecode runs from 4 up to it.
   Text is pushed with opcode 0x0E: one length byte (the NUL included), then the bytes (Shift-JIS; a UTF-8 build is
   read as UTF-8). Every push that ends in its NUL and reads as Japanese prose is a line; names, file names and
   commands (ASCII, no kana) are dropped. Written from the public format notes (FVP tools, GARbro); not checked on a
   real release here, so a release whose bytecode differs simply reads as not readable. */
const fs=require('node:fs'),path=require('node:path');
const sj=new TextDecoder('shift_jis'),u8=new TextDecoder('utf-8',{fatal:true});
const PROSE=/[ぁ-ゖァ-ヺ]/;
function text(bytes){try{return u8.decode(bytes);}catch{}return sj.decode(bytes);}
function parse(buf){const b=Buffer.isBuffer(buf)?buf:Buffer.from(buf),lines=[];if(b.length<8)return {lines,anchors:[]};
 const end=Math.min(b.readUInt32LE(0),b.length);
 for(let i=4;i+2<end;i++){if(b[i]!==0x0E)continue;const n=b[i+1];if(n<3||i+2+n>end||b[i+1+n]!==0)continue;
  const raw=b.subarray(i+2,i+1+n);if(raw.includes(0))continue;const s=text(raw).replace(/\r?\n/g,'\n').trim();
  if(s&&PROSE.test(s)&&!/[�]/.test(s)){lines.push(s);i+=1+n;}}
 return {lines,anchors:[]};}
const hcbFiles=dir=>{try{return fs.readdirSync(dir).filter(f=>/\.hcb$/i.test(f)).map(f=>path.join(dir,f));}catch{return [];}};
const engine={
 id:'fvp',hint:'<游戏>.hcb',
 scenes:dir=>hcbFiles(dir).map(f=>({name:path.basename(f),read:()=>fs.readFileSync(f)})),
 archives:()=>[],sources:hcbFiles,
 parse,test:n=>/\.hcb$/i.test(n),
};
module.exports={parse,engine};
