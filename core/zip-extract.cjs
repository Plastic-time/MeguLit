// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
// E327 zip extraction for the Japanese import. Windows' tar cannot read zips whose names are Shift-JIS without the
// UTF-8 flag (most Japanese archives), so zips are read here: central directory (with Zip64), stored and deflate
// entries, names decoded as UTF-8 when flagged and as Shift-JIS otherwise. Encrypted entries are refused.
const fs=require('node:fs'),fsp=require('node:fs/promises'),path=require('node:path'),zlib=require('node:zlib'),{pipeline}=require('node:stream/promises');

const sjis=new TextDecoder('shift_jis'),utf8=new TextDecoder('utf-8',{fatal:true});
function decodeName(buf,flag){if(flag&0x800)return buf.toString('utf8');try{return utf8.decode(buf);}catch{return sjis.decode(buf);}}

async function readAt(fd,pos,len){const b=Buffer.alloc(len);const {bytesRead}=await fd.read(b,0,len,pos);return b.subarray(0,bytesRead);}

async function entries(file){
 const fd=await fsp.open(file,'r');
 try{const size=(await fd.stat()).size,tailLen=Math.min(size,65557),tail=await readAt(fd,size-tailLen,tailLen);
  let eocd=-1;for(let i=tail.length-22;i>=0;i--)if(tail.readUInt32LE(i)===0x06054b50){eocd=i;break;}
  if(eocd<0)throw Error('IMPORT_EXTRACT_FAILED');
  let count=tail.readUInt16LE(eocd+10),cdSize=tail.readUInt32LE(eocd+12),cdOff=tail.readUInt32LE(eocd+16);
  if(cdOff===0xFFFFFFFF||count===0xFFFF){const loc=eocd-20;if(loc>=0&&tail.readUInt32LE(loc)===0x07064b50){const z=await readAt(fd,Number(tail.readBigUInt64LE(loc+8)),56);
   if(z.readUInt32LE(0)===0x06064b50){count=Number(z.readBigUInt64LE(32));cdSize=Number(z.readBigUInt64LE(40));cdOff=Number(z.readBigUInt64LE(48));}}}
  const cd=await readAt(fd,cdOff,cdSize),list=[];let p=0;
  for(let n=0;n<count&&p+46<=cd.length;n++){if(cd.readUInt32LE(p)!==0x02014b50)break;
   const flag=cd.readUInt16LE(p+8),method=cd.readUInt16LE(p+10),nameLen=cd.readUInt16LE(p+28),extraLen=cd.readUInt16LE(p+30),commentLen=cd.readUInt16LE(p+32);
   let csize=cd.readUInt32LE(p+20),usize=cd.readUInt32LE(p+24),local=cd.readUInt32LE(p+42);
   const name=decodeName(cd.subarray(p+46,p+46+nameLen),flag),extra=cd.subarray(p+46+nameLen,p+46+nameLen+extraLen);
   for(let e=0;e+4<=extra.length;){const id=extra.readUInt16LE(e),len=extra.readUInt16LE(e+2);if(id===1){let q=e+4;
     if(usize===0xFFFFFFFF){usize=Number(extra.readBigUInt64LE(q));q+=8;}if(csize===0xFFFFFFFF){csize=Number(extra.readBigUInt64LE(q));q+=8;}if(local===0xFFFFFFFF){local=Number(extra.readBigUInt64LE(q));}}e+=4+len;}
   list.push({name,flag,method,csize,usize,local});p+=46+nameLen+extraLen+commentLen;}
  return list;}finally{await fd.close();}
}

// Names are checked so an entry can never write outside the target folder.
async function extract(file,dest){
 const list=await entries(file),root=path.resolve(dest);
 const fd=await fsp.open(file,'r');
 try{for(const e of list){
  const rel=e.name.replace(/\\/g,'/');if(rel.endsWith('/'))continue;
  const target=path.resolve(root,rel);if(!target.startsWith(root+path.sep))throw Error('IMPORT_EXTRACT_FAILED');
  if(e.flag&1)throw Error('IMPORT_EXTRACT_FAILED');
  if(e.method!==0&&e.method!==8)throw Error('IMPORT_EXTRACT_FAILED');
  const head=await readAt(fd,e.local,30);if(head.readUInt32LE(0)!==0x04034b50)throw Error('IMPORT_EXTRACT_FAILED');
  const start=e.local+30+head.readUInt16LE(26)+head.readUInt16LE(28);
  await fsp.mkdir(path.dirname(target),{recursive:true});
  const input=e.csize?fs.createReadStream(file,{start,end:start+e.csize-1,highWaterMark:1<<20}):require('node:stream').Readable.from([]);
  await pipeline(input,...(e.method===8?[zlib.createInflateRaw()]:[]),fs.createWriteStream(target));}}
 finally{await fd.close();}
 return list.length;
}

module.exports={entries,extract,decodeName};
