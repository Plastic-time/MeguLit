// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
/* E449 FVP (FAVORITE View Point: いろとりどりのセカイ / ヒカリ and the other FAVORITE titles). The whole scenario is
   one <name>.hcb next to the exe: a u32 at 0 is the offset of the system description, the bytecode runs from 4 up to it.
   Text is pushed with opcode 0x0E: one length byte (the NUL included), then the bytes (Shift-JIS). Every push that ends
   in its NUL and reads as Japanese prose is a line; names, file names and commands (ASCII, no kana) are dropped.
   Chinese patches (いろとりどりのヒカリHD: a second, hidden .irohika.hcb next to irohika.hcb) keep the bytecode and
   rewrite each string in place in GBK, padded with NULs to the original length, so the push at the same offset in the
   other file is the translation of each Japanese line (checked on the HD release: same header, same code). */
const fs=require('node:fs'),path=require('node:path');
const sj=new TextDecoder('shift_jis'),gbk=new TextDecoder('gbk');
const PROSE=/[ぁ-ゖァ-ヺ]/,HAN=/[一-鿿]/;
const MAGIC=Buffer.from('FVP+ZH\0\0','latin1');
// Each 0x0E push of the code: {at, n} (n counts the NUL).
function pushes(b){const out=[];if(b.length<8)return out;const end=Math.min(b.readUInt32LE(0),b.length);
 for(let i=4;i+2<end;i++){if(b[i]!==0x0E)continue;const n=b[i+1];if(n<3||i+2+n>end||b[i+1+n]!==0)continue;
  const raw=b.subarray(i+2,i+1+n);if(raw.includes(0))continue;out.push({at:i,n});i+=1+n;}
 return out;}
const tidy=s=>s.replace(/\r?\n/g,'\n').replace(/^[\s　]+|[\s　]+$/g,'');
// The translated string at the same place in the patched file (up to its first NUL), or ''.
function twin(z,p){if(!z||p.at+2+p.n>z.length||z[p.at]!==0x0E||z[p.at+1]!==p.n)return '';const raw=z.subarray(p.at+2,p.at+1+p.n),cut=raw.indexOf(0);
 const s=tidy(gbk.decode(cut>=0?raw.subarray(0,cut):raw));return HAN.test(s)&&!PROSE.test(s)?s:'';}
function parse(buf){let b=Buffer.isBuffer(buf)?buf:Buffer.from(buf),z=null;
 if(b.subarray(0,8).equals(MAGIC)){const n=b.readUInt32LE(8);z=b.subarray(12+n);b=b.subarray(12,12+n);}
 const lines=[],zh=[];
 for(const p of pushes(b)){const s=tidy(sj.decode(b.subarray(p.at+2,p.at+1+p.n)));if(!s||!PROSE.test(s)||s.includes('�'))continue;lines.push(s);zh.push(twin(z,p));}
 return z?{lines,anchors:[],zh}:{lines,anchors:[]};}
// The scenario (the .hcb with the most Japanese) and a Chinese twin with the same header, if any.
function files(dir){let names;try{names=fs.readdirSync(dir).filter(f=>/\.hcb$/i.test(f));}catch{return null;}if(!names.length)return null;
 const info=names.map(f=>{const file=path.join(dir,f);let b;try{b=fs.readFileSync(file);}catch{return null;}const ps=pushes(b);
  let jp=0,cn=0;for(const p of ps.slice(0,4000)){const raw=b.subarray(p.at+2,p.at+1+p.n);if(!raw.some(c=>c>=0x80))continue;if(PROSE.test(sj.decode(raw)))jp++;else if(HAN.test(gbk.decode(raw)))cn++;}
  return {file,b,head:b.length>=4?b.readUInt32LE(0):-1,jp,cn};}).filter(Boolean);
 const main=info.filter(x=>x.jp>0).sort((a,b)=>b.jp-a.jp)[0];if(!main)return null;
 const twinFile=info.filter(x=>x!==main&&x.head===main.head&&x.cn>x.jp).sort((a,b)=>b.cn-a.cn)[0];
 return {main:main.file,zh:twinFile?twinFile.file:null};}
function read(f){const b=fs.readFileSync(f.main);if(!f.zh)return b;const z=fs.readFileSync(f.zh),n=Buffer.alloc(4);n.writeUInt32LE(b.length);return Buffer.concat([MAGIC,n,b,z]);}
const engine={
 id:'fvp',hint:'<游戏>.hcb',
 scenes(dir){const f=files(dir);return f?[{name:path.basename(f.main),read:()=>read(f)}]:[];},
 archives:()=>[],sources:dir=>{const f=files(dir);return f?[f.main,f.zh].filter(Boolean):[];},
 parse,test:n=>/\.hcb$/i.test(n),
 patchLines(base){let any=false;const list=base.map(scene=>{const zh=scene.zh||[];if(!zh.some(Boolean))return scene;any=true;return {...scene,patched:true,lines:scene.lines.map((t,k)=>zh[k]||t)};});return any?list:null;},
};
module.exports={parse,engine,pushes,files};
