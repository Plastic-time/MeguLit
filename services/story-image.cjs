// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
const fs=require('node:fs');
function dimensions(b){
 if(b.length>=24&&b.toString('hex',0,8)==='89504e470d0a1a0a')return [b.readUInt32BE(16),b.readUInt32BE(20)];
 if(b.length>=26&&b.toString('latin1',0,2)==='BM')return [Math.abs(b.readInt32LE(18)),Math.abs(b.readInt32LE(22))];
 if(b.length>=30&&b.toString('latin1',0,4)==='RIFF'&&b.toString('latin1',8,12)==='WEBP'){
  if(b.toString('latin1',12,16)==='VP8X')return [1+b.readUIntLE(24,3),1+b.readUIntLE(27,3)];
  if(b.toString('latin1',12,16)==='VP8 '&&b[23]===0x9d&&b[24]===1&&b[25]===0x2a)return [b.readUInt16LE(26)&0x3fff,b.readUInt16LE(28)&0x3fff];
 }
 if(b.length>=4&&b[0]===255&&b[1]===216){let p=2;while(p+4<=b.length){if(b[p++]!==255)return null;const m=b[p++];if(m===0xda||m===0xd9)return null;if(m===0xff){p--;continue;}if(m===1||m>=0xd0&&m<=0xd7)continue;const n=b.readUInt16BE(p);if(n<2||p+n>b.length)return null;if([0xc0,0xc1,0xc2,0xc3,0xc5,0xc6,0xc7,0xc9,0xca,0xcb,0xcd,0xce,0xcf].includes(m)&&n>=7)return [b.readUInt16BE(p+5),b.readUInt16BE(p+3)];p+=n;}}
 return null;
}
function check(file){const stat=fs.statSync(file);if(!stat.isFile()||stat.size>24*1024*1024)return false;const fd=fs.openSync(file,'r'),buf=Buffer.alloc(Math.min(stat.size,128*1024));try{fs.readSync(fd,buf,0,buf.length,0);}finally{fs.closeSync(fd);}const d=dimensions(buf);return !!d&&d.every(n=>Number.isSafeInteger(n)&&n>0&&n<=8192)&&d[0]*d[1]<=16*1024*1024;}
module.exports={dimensions,check};
