// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
// KiriKiri XP3 archives: index (optionally zlib), File chunks with info / segm / adlr, segments optionally zlib.
// Only plain archives are read; an encrypted one (per-game filter) is reported so callers can skip it.
const fs=require('node:fs'),zlib=require('node:zlib');
const MAGIC=Buffer.from([0x58,0x50,0x33,0x0d,0x0a,0x20,0x0a,0x1a,0x8b,0x67,0x01]);
function readIndex(fd,size){
 const head=Buffer.alloc(32);fs.readSync(fd,head,0,32,0);if(!head.subarray(0,11).equals(MAGIC))return null;
 let at=Number(head.readBigUInt64LE(11));
 // Version 2 header: offset 0x17 holds an 0x80 block (u64 size, u64 index offset).
 if(at===0x17){const b=Buffer.alloc(17);fs.readSync(fd,b,0,17,at);if(b[0]!==0x80)return null;at=Number(b.readBigUInt64LE(9));}
 const flag=Buffer.alloc(9);fs.readSync(fd,flag,0,9,at);
 if(flag[0]&1){const packed=Number(flag.readBigUInt64LE(1)),b=Buffer.alloc(17);fs.readSync(fd,b,0,17,at);const plain=Number(b.readBigUInt64LE(9));const data=Buffer.alloc(packed);fs.readSync(fd,data,0,packed,at+17);const out=zlib.inflateSync(data);if(out.length!==plain)throw Error('XP3_INDEX_SIZE');return out;}
 const n=Number(flag.readBigUInt64LE(1)),data=Buffer.alloc(n);fs.readSync(fd,data,0,n,at+9);return data;
}
function chunks(buf,from,to){const out=[];let p=from;while(p+12<=to){const tag=buf.toString('latin1',p,p+4),len=Number(buf.readBigUInt64LE(p+4));out.push({tag,start:p+12,end:p+12+len});p+=12+len;}return out;}
function list(file){
 const fd=fs.openSync(file,'r');
 try{
  const index=readIndex(fd,fs.fstatSync(fd).size);if(!index)return null;const files=[];
  for(const c of chunks(index,0,index.length)){if(c.tag!=='File')continue;const entry={name:'',size:0,packed:0,encrypted:false,segments:[]};
   for(const s of chunks(index,c.start,c.end)){
    if(s.tag==='info'){entry.encrypted=index.readUInt32LE(s.start)!==0;entry.size=Number(index.readBigUInt64LE(s.start+4));entry.packed=Number(index.readBigUInt64LE(s.start+12));const len=index.readUInt16LE(s.start+20);entry.name=index.toString('utf16le',s.start+22,s.start+22+len*2);}
    else if(s.tag==='adlr')entry.hash=index.readUInt32LE(s.start);
    else if(s.tag==='segm')for(let p=s.start;p+28<=s.end;p+=28)entry.segments.push({zlib:(index.readUInt32LE(p)&7)===1,offset:Number(index.readBigUInt64LE(p+4)),size:Number(index.readBigUInt64LE(p+12)),packed:Number(index.readBigUInt64LE(p+20))});
   }
   if(entry.name)files.push(entry);}
  return {files};
 }finally{fs.closeSync(fd);}
}
function read(file,entry){
 const fd=fs.openSync(file,'r');
 try{const parts=entry.segments.map(s=>{const b=Buffer.alloc(s.packed);fs.readSync(fd,b,0,s.packed,s.offset);return s.zlib?zlib.inflateSync(b):b;});return Buffer.concat(parts);}finally{fs.closeSync(fd);}
}
// Text of a script file: UTF-16LE with BOM, UTF-8 with BOM, or Shift-JIS / GBK guessed by the caller.
function decodeText(buf){
 if(buf[0]===0xff&&buf[1]===0xfe)return {text:buf.toString('utf16le',2),encoding:'utf16le'};
 if(buf[0]===0xef&&buf[1]===0xbb&&buf[2]===0xbf)return {text:buf.toString('utf8',3),encoding:'utf8'};
 if(buf[0]===0xfe&&buf[1]===0xfe&&buf[2]<=2)return null; // KiriKiri's own scrambled text (mode 0-2): not handled
 return {buffer:buf,encoding:''};
}
module.exports={list,read,decodeText,MAGIC};
