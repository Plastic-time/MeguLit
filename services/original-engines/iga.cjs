// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
/* Innocent Grey / Noesis "IGA0" archives (虚ノ少女 script.iga), as in GARbro (MIT, ArcFormats/Noesis/ArcIGA.cs):
   from 0x10 a packed-uint index length, then (name offset, data offset, size) packed uints, the name table length and
   one packed uint per name byte (cp932). Packed uint: bytes shifted in 7 bits at a time until the low bit is 1, >> 1.
   Data is XOR (i + 2), and also 0xFF for .s scripts.
   In a .s scene a string operand is 04 00 <length> then that many bytes (padded): Shift-JIS up to a NUL. A speaker is a string
   "＃名前"; ruby is written <漢字<よみ>. */
const fs=require('node:fs'),path=require('node:path');
const sj=new TextDecoder('shift_jis');
function list(file){let b;try{b=fs.readFileSync(file);}catch{return null;}if(b.toString('latin1',0,4)!=='IGA0')return null;let p=0x10;
 const u=()=>{let v=0;while((v&1)===0){if(p>=b.length)throw Error('IGA_TRUNCATED');v=(v*128+b[p++])>>>0;}return v>>>1;};
 try{const len=u(),end=p+len,dir=[];while(p<end)dir.push({nameAt:u(),offset:u(),size:u()});
  const names=u(),data=p+names;
  for(let i=0;i<dir.length;i++){const n=(i+1<dir.length?dir[i+1].nameAt:names)-dir[i].nameAt,bytes=Buffer.alloc(n);for(let k=0;k<n;k++)bytes[k]=u();dir[i].name=sj.decode(bytes);dir[i].offset+=data;if(dir[i].offset+dir[i].size>b.length)return null;}
  return dir.map(e=>({name:e.name,read:()=>{const d=Buffer.from(b.subarray(e.offset,e.offset+e.size)),key=/\.s$/i.test(e.name)?0xff:0;for(let i=0;i<d.length;i++)d[i]^=((i+2)^key)&255;return d;}}));
 }catch{return null;}}
function parse(d){const lines=[],ruby=[];
 for(let i=0;i+3<d.length;i++){if(d[i]!==0x04||d[i+1]!==0)continue;const n=d[i+2];if(n<3||i+3+n>d.length)continue;
  const z=d.indexOf(0,i+3);if(z<i+5||z>=i+3+n)continue;const t=sj.decode(d.subarray(i+3,z));if(t.includes('�')||!/[ぁ-ゖァ-ヺ一-龯]/.test(t))continue;
  if(/^[!-~]+$/.test(t))continue;i+=2+n;
  if(t.startsWith('＃')){lines.push(t.slice(1));ruby.push(null);continue;}
  const pairs=[...t.matchAll(/<([^<>]*)<([^<>]*)>/g)].filter(m=>m[1]&&m[2]).map(m=>[m[1],m[2]]);
  lines.push(t.replace(/<([^<>]*)<[^<>]*>/g,'$1'));ruby.push(pairs.length?pairs:null);}
 return {lines,anchors:[],ruby};}
function scriptIga(dir){const f=path.join(dir,'script.iga');try{if(fs.statSync(f).isFile())return f;}catch{}return null;}
const engine={
 id:'iga',hint:'script.iga',
 scenes(dir){const f=scriptIga(dir);if(!f)return [];return (list(f)||[]).filter(e=>/\.s$/i.test(e.name));},
 archives:()=>[],sources:dir=>{const f=scriptIga(dir);return f?[f]:[];},
 parse,test:n=>/\.s$/i.test(n),
};
module.exports={list,parse,engine};
