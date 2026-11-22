/* SPDX-License-Identifier: GPL-3.0-or-later */
'use strict';
const fs=require('node:fs');
const MAX_HEADER=65536,MAX_DATA=16*1024*1024;
/* Old NW builds put Chromium/Node into the main PE. A publisher can virtualize their neighboring files;
   recognizing that runtime only permits the normal debugger launch path, never a draw/profile grant. */
function legacyNw(exe){let fd;
 try{
  fd=fs.openSync(exe,'r');const before=fs.fstatSync(fd);if(!before.isFile()||before.size<64)return false;
  const read=(offset,size)=>{if(!Number.isSafeInteger(offset)||offset<0||size<0||offset+size>before.size)return null;const b=Buffer.alloc(size);return fs.readSync(fd,b,0,size,offset)===size?b:null;};
  const h=read(0,Math.min(MAX_HEADER,before.size));if(!h||h.toString('latin1',0,2)!=='MZ')return false;
  const pe=h.readUInt32LE(60);if(pe<64||pe+26>h.length||h.toString('latin1',pe,pe+4)!=='PE\0\0')return false;
  const machine=h.readUInt16LE(pe+4),count=h.readUInt16LE(pe+6),optional=h.readUInt16LE(pe+20),magic=h.readUInt16LE(pe+24),table=pe+24+optional,end=table+count*40;
  if(!count||count>96||optional<2||end>h.length||!((machine===0x14c&&magic===0x10b)||(machine===0x8664&&magic===0x20b)))return false;
  let bytes=0,found=false;
  for(let i=0;i<count;i++){
   const s=table+i*40;if(h.toString('latin1',s,s+8).replace(/\0.*$/,'')!=='.rdata')continue;
   const size=h.readUInt32LE(s+16),offset=h.readUInt32LE(s+20);bytes+=size;if(!size||bytes>MAX_DATA||offset<end)return false;
   const b=read(offset,size);if(!b)return false;
   found=b.includes(Buffer.from('node-webkit'))&&b.includes(Buffer.from('remote-debugging-port'))&&b.includes(Buffer.from('nw.exe.pdb'))&&
    (b.includes(Buffer.from('\\nw\\src\\shell_main.cc'))||b.includes(Buffer.from('/nw/src/shell_main.cc')));
   if(found)break;
  }
  const after=fs.fstatSync(fd);return found&&before.size===after.size&&before.mtimeMs===after.mtimeMs&&before.ctimeMs===after.ctimeMs;
 }catch{return false;}finally{if(fd!==undefined)fs.closeSync(fd);}
}
module.exports={legacyNw,MAX_HEADER,MAX_DATA};
