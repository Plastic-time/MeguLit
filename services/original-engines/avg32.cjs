// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
/* AVG32 (ZERO 涙 1997, Key's engine before RealLive): TXT/SEEN.TXT is a "PACL" archive. Header: magic, 12 bytes, count at
   0x10, then 32-byte entries from 0x20 (16-byte name, offset, packed size, unpacked size, flag). Each entry is "PACK",
   4 bytes, unpacked size, packed size, then LZ: flag bytes read MSB first (1 = literal), a reference is a 16-bit word,
   length (w&15)+2, distance (w>>4)+1. The scenario bytecode ("TPC32") keeps its text as Shift-JIS runs; names are
   written 【名前】 in the line itself, ＊Ｋ ＊Ｌ ... are name variables. */
const fs=require('node:fs'),path=require('node:path');
function seenFile(dir){for(const sub of ['TXT','txt','.']){const f=path.join(dir,sub,'SEEN.TXT');try{if(fs.statSync(f).isFile())return f;}catch{}}return null;}
function lz(src,p,size){const o=Buffer.alloc(size);let d=0;
 while(d<size&&p<src.length){let f=src[p++];for(let i=0;i<8&&d<size&&p<src.length;i++,f<<=1){
  if(f&0x80)o[d++]=src[p++];else{if(p+1>=src.length)return o.subarray(0,d);const w=src.readUInt16LE(p);p+=2;const c=(w&15)+2,off=(w>>4)+1;for(let k=0;k<c&&d<size;k++,d++)o[d]=d-off>=0?o[d-off]:0;}}}
 return o.subarray(0,d);}
function list(file){const b=fs.readFileSync(file);if(b.toString('latin1',0,4)!=='PACL')return null;const n=b.readUInt32LE(16),out=[];
 if(n<=0||n>10000||32+n*32>b.length)return null;
 for(let i=0;i<n;i++){const e=32+i*32,name=b.toString('latin1',e,e+16).replace(/\0[\s\S]*$/,''),off=b.readUInt32LE(e+16);
  if(off+16>b.length)continue;out.push({name,read:()=>{if(b.toString('latin1',off,off+4)!=='PACK')return b.subarray(off,off+b.readUInt32LE(e+20));return lz(b,off+16,b.readUInt32LE(off+8));}});}
 return out;}
const lead=c=>(c>=0x81&&c<=0x9f)||(c>=0xe0&&c<=0xfc);
const dec=new TextDecoder('shift_jis');
// Text: runs of double-byte Shift-JIS characters (the engine stores dialogue full-width); a run must carry kana or kanji.
function parse(data){const lines=[];let i=0;
 while(i<data.length){let j=i;while(j+1<data.length&&lead(data[j])&&data[j+1]>=0x40&&data[j+1]!==0x7f)j+=2;
  if(j-i>=4){const t=dec.decode(data.subarray(i,j)).replace(/[\s　]+$/,'');if(/[ぁ-ゖァ-ヺ一-龯]/.test(t)&&!t.includes('�'))lines.push(t);i=j;}else i++;}
 return {lines,anchors:[]};}
const avg32={
 id:'avg32',hint:'TXT\\SEEN.TXT',
 scenes(dir){const f=seenFile(dir);if(!f)return [];return list(f)||[];},
 archives:()=>[],
 sources:dir=>{const f=seenFile(dir);return f?[f]:[];},
 parse,test:n=>/^SEEN\d+\.TXT$/i.test(n),
 _internal:{lz,list},
};
module.exports=avg32;
