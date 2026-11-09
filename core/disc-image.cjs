// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
// E339 disc images for the Japanese import (user 2026-11-10: "让光盘镜像的文件也可以拿来替换日化"). Reads ISO 9660 from
// .iso (2048-byte sectors) and raw .bin images (2352-byte sectors, Mode 1 or Mode 2 Form 1; the .cue points at the .bin)
// and copies the files out. Joliet names are used when the disc has them; plain ISO 9660 names on Japanese discs are
// Shift-JIS. Nothing on the disc is run.
const fs=require('node:fs'),fsp=require('node:fs/promises'),path=require('node:path');
const sjis=new TextDecoder('shift_jis'),utf16be=new TextDecoder('utf-16be');

function geometry(fd,size){
 const head=Buffer.alloc(16);fs.readSync(fd,head,0,16,0);
 const sync=head.subarray(0,12).equals(Buffer.from([0,255,255,255,255,255,255,255,255,255,255,0]));
 if(sync&&size%2352===0){const mode=Buffer.alloc(1);fs.readSync(fd,mode,0,1,15);return {sector:2352,offset:mode[0]===2?24:16};}
 return {sector:2048,offset:0};
}
function reader(file){
 const fd=fs.openSync(file,'r'),size=fs.fstatSync(fd).size,g=geometry(fd,size);
 const read=(lba,count=1)=>{const out=Buffer.alloc(count*2048);for(let i=0;i<count;i++)fs.readSync(fd,out,i*2048,2048,(lba+i)*g.sector+g.offset);return out;};
 return {fd,read,g,close:()=>fs.closeSync(fd)};
}
function descriptors(r){
 let pvd=null,joliet=null;
 for(let lba=16;lba<64;lba++){const d=r.read(lba);if(d.toString('latin1',1,6)!=='CD001')break;const type=d[0];
  if(type===1&&!pvd)pvd=d;else if(type===2&&d[88]===0x25&&d[89]===0x2f&&[0x40,0x43,0x45].includes(d[90]))joliet=d;else if(type===255)break;}
 if(!pvd)throw Error('IMPORT_DISC_UNREADABLE');
 return {root:(joliet||pvd).subarray(156,190),joliet:!!joliet};
}
function entries(r,record,joliet){
 const lba=record.readUInt32LE(2),len=record.readUInt32LE(10),data=r.read(lba,Math.ceil(len/2048)),out=[];let p=0;
 while(p<len){const n=data[p];if(!n){p=(Math.floor(p/2048)+1)*2048;continue;}
  const rec=data.subarray(p,p+n),nameLen=rec[32],raw=rec.subarray(33,33+nameLen),flags=rec[25];p+=n;
  if(nameLen===1&&(raw[0]===0||raw[0]===1))continue;
  let name=joliet?utf16be.decode(raw):sjis.decode(raw);name=name.replace(/;\d+$/,'').replace(/\.$/,'');
  out.push({name,dir:!!(flags&2),lba:rec.readUInt32LE(2),size:rec.readUInt32LE(10),record:rec});}
 return out;
}
async function extract(file,dest){
 const r=reader(file),root=path.resolve(dest);let count=0;
 try{const {root:rootRecord,joliet}=descriptors(r);
  const walk=async(record,rel,depth)=>{if(depth>12)return;for(const e of entries(r,record,joliet)){
   const safe=e.name.replace(/[<>:"|?*\x00-\x1f]/g,'_');if(!safe||safe==='.'||safe==='..')continue;const target=path.resolve(root,rel,safe);if(!target.startsWith(root+path.sep))continue;
   if(e.dir){await fsp.mkdir(target,{recursive:true});await walk(e.record,path.join(rel,safe),depth+1);continue;}
   await fsp.mkdir(path.dirname(target),{recursive:true});const fd=fs.openSync(target,'w');
   try{for(let done=0;done<e.size;){const chunk=Math.min(e.size-done,2048*256),sectors=Math.ceil(chunk/2048),buf=r.read(e.lba+done/2048,sectors);fs.writeSync(fd,buf,0,chunk);done+=chunk;}}finally{fs.closeSync(fd);}count++;}};
  await walk(rootRecord,'',0);}
 finally{r.close();}
 return count;
}
// The data file a .cue sheet points at (first FILE line), else the image itself.
function imageOf(file){if(!/\.cue$/i.test(file))return file;try{const m=/FILE\s+"([^"]+)"/i.exec(fs.readFileSync(file,'latin1'));if(m){const f=path.join(path.dirname(file),m[1]);if(fs.existsSync(f))return f;}}catch{}
 const bin=file.replace(/\.cue$/i,'.bin');return fs.existsSync(bin)?bin:file;}
const IMAGE=/\.(iso|bin|cue|img)$/i;
// A raw .bin as a plain .iso (2048-byte user data per sector), which Windows can open (mount) with a double-click.
async function toIso(file,out){const r=reader(file),size=fs.fstatSync(r.fd).size,count=Math.floor(size/r.g.sector),tmp=out+'.part',fd=fs.openSync(tmp,'w');
 try{for(let lba=0;lba<count;lba+=512){const n=Math.min(512,count-lba);fs.writeSync(fd,r.read(lba,n));}}finally{fs.closeSync(fd);r.close();}
 await fsp.rename(tmp,out);return out;}
module.exports={extract,imageOf,toIso,IMAGE};
