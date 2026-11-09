// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
// Enigma Virtual Box: many Chinese patches ship as one program with the patched archives packed inside (素晴らしき日々's
// BGI-CHS.exe). Reads the virtual file table and returns files without writing anything to disk.
// Layout after evbunpack (Apache-2.0, mos9527); aPLib depacker after snemes/aplib (GPL-3.0), from aPLib 1.1.1.
const fs=require('node:fs');
function aplib(src,limit){
 const out=Buffer.allocUnsafe(limit);let n=0,p=0,tag=0,bits=0;
 const bit=()=>{if(--bits<0){tag=src[p++];bits=7;}const b=tag>>7&1;tag=tag<<1&255;return b;};
 const gamma=()=>{let r=1;do r=(r<<1)+bit();while(bit());return r;};
 const copy=(off,len)=>{if(off<=0||off>n||n+len>limit)throw Error('APLIB_BAD_MATCH');for(let i=0;i<len;i++,n++)out[n]=out[n-off];};
 out[n++]=src[p++];let r0=-1,lwm=0;
 for(;;){
  if(p>src.length)throw Error('APLIB_TRUNCATED');
  if(!bit()){if(n>=limit)throw Error('APLIB_OVERFLOW');out[n++]=src[p++];lwm=0;continue;}
  if(bit()){
   if(bit()){let off=0;for(let i=0;i<4;i++)off=(off<<1)+bit();if(off)copy(off,1);else{if(n>=limit)throw Error('APLIB_OVERFLOW');out[n++]=0;}lwm=0;}
   else{let off=src[p++];const len=2+(off&1);off>>=1;if(!off)break;copy(off,len);r0=off;lwm=1;}
   continue;
  }
  let off=gamma();
  if(!lwm&&off===2){copy(r0,gamma());}
  else{off-=lwm?2:3;off=off*256+src[p++];let len=gamma();if(off>=32000)len++;if(off>=1280)len++;if(off<128)len+=2;copy(off,len);r0=off;}
  lwm=1;
 }
 return out.subarray(0,n);
}
// Finds the table: "EVB\0" in the file, then the main node 64 bytes later.
function list(file){
 const fd=fs.openSync(file,'r');
 try{
  const size=fs.fstatSync(fd).size,read=(at,len)=>{const b=Buffer.alloc(len);fs.readSync(fd,b,0,len,at);return b;};
  let magic=-1;
  for(let at=0;at<size&&magic<0;at+=(1<<24)-4){const b=read(at,Math.min(1<<24,size-at)),i=b.indexOf('EVB\0','latin1');if(i>=0)magic=at+i;}
  if(magic<0)return null;
  const head=read(magic+64,16),mainSize=head.readUInt32LE(0);if(mainSize>64*1024*1024)return null;
  const table=read(magic+79,Math.min(size-magic-79,mainSize+16));
  // Pre-order tree: each folder is followed by its objects; the main node holds the top-level count.
  let base=magic+64+16+mainSize-12,p=0;const files=[],stack=[{name:'',left:head.readUInt32LE(12)}];
  while(stack.length&&p+17<table.length){
   const objects=table.readUInt32LE(p+12);let q=p+16;const start=q;while(q+1<table.length&&(table[q]||table[q+1]))q+=2;
   const name=table.subarray(start,q).toString('utf16le'),type=table[q+2];q+=3;
   if(type!==2&&type!==3)break;
   stack[stack.length-1].left--;
   const dir=stack.map(x=>x.name).filter(x=>x&&x!=='%DEFAULT FOLDER%');
   if(type===2){const original=table.readUInt32LE(q+2),stored=table.readUInt32LE(q+49);files.push({name,path:[...dir,name],offset:base,original,stored});base+=stored;q+=53;}
   else{q+=25;if(objects>0)stack.push({name,left:objects});}
   while(stack.length&&stack[stack.length-1].left<=0)stack.pop();
   p=q;
  }
  return {magic,files};
 }finally{fs.closeSync(fd);}
}
function read(file,entry){
 const fd=fs.openSync(file,'r');
 try{
  const data=Buffer.alloc(entry.stored);fs.readSync(fd,data,0,entry.stored,entry.offset);
  if(entry.original===entry.stored)return data;
  const block=data.readUInt32LE(0),sizes=[];for(let i=8;i+4<=block;i+=12)sizes.push(data.readUInt32LE(i));
  const parts=[];let p=block,left=entry.original;
  for(const s of sizes){const chunk=aplib(data.subarray(p,p+s),Math.min(left,1<<22));parts.push(chunk);left-=chunk.length;p+=s;if(left<=0)break;}
  const out=Buffer.concat(parts);if(out.length!==entry.original)throw Error('EVB_SIZE_MISMATCH');return out;
 }finally{fs.closeSync(fd);}
}
module.exports={list,read,aplib};
