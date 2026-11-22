// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),{pe}=require('./draw-sites.cjs');
const header=fs.readFileSync(path.join(__dirname,'../../native/megulithook/MinoriInputSig.h'),'utf8');
const value=n=>Number(new RegExp(n+'=(0x[\\da-f]+|\\d+)').exec(header)[1]);
const bytes=n=>Buffer.from(new RegExp(n+'\\[\\]=\\{([^}]+)\\}').exec(header)[1].split(',').map(Number));
const sha256=/Sha256\[\]="([a-f0-9]{64})"/.exec(header)[1],fileBytes=value('FileBytes'),entryRva=value('EntryRva'),vtableRva=value('VtableRva'),pattern=bytes('Entry');
function find(code){const hits=[];for(let i=code.indexOf(pattern);i>=0;i=code.indexOf(pattern,i+1))hits.push({offset:i,thisRegister:'ecx',stackWords:1,arg1:'msvc-byte-string',cleanupBytes:4});return hits;}
function scanBuffer(raw){
 if(raw.length!==fileBytes||crypto.createHash('sha256').update(raw).digest('hex')!==sha256)return {pinned:false,sites:[]};
 const image=pe(raw),sites=image.code.flatMap(c=>find(c.bytes).map(s=>({...s,va:c.va+s.offset})));
 const at=(rva,n)=>{const s=image.secs.find(s=>rva>=s.rva&&rva+n<=s.rva+s.raw);return s?raw.subarray(s.ptr+rva-s.rva,s.ptr+rva-s.rva+n):Buffer.alloc(0);};
 const layout=['CopyEntry','CopyLayout'].every(n=>at(value(n==='CopyEntry'?'CopyRva':'CopyLayoutRva'),bytes(n).length).equals(bytes(n)));
 const vt=at(vtableRva,0x54),vtable=vt.length===0x54&&vt.readUInt32LE(0x3c)===image.base+entryRva&&vt.readUInt32LE(8)===image.base+0x10d0d0&&vt.readUInt32LE(0x50)===image.base+0x10e0d0;
 return {pinned:sites.length===1&&sites[0].va-image.base===entryRva&&layout&&vtable,base:image.base,sites,layout,vtable};
}
const scanFile=file=>scanBuffer(fs.readFileSync(file));
module.exports={find,scanFile,scanBuffer,sha256,fileBytes,entryRva,vtableRva,pattern};
