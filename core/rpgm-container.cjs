/* SPDX-License-Identifier: GPL-3.0-or-later */
'use strict';
const fs=require('node:fs'),crypto=require('node:crypto');
const TYPE='nwjs-evb-rpgmaker-v1';
const REQUIRED=['package.json','www/js/rpg_core.js','www/js/rpg_windows.js','www/js/rpg_managers.js','www/js/main.js','www/data/system.json'];
function inspect(exe){
 if(!require('./nw-runtime.cjs').legacyNw(exe))throw Error('CONTAINER_NW');let fd;
 try{
  fd=fs.openSync(exe,'r');const before=fs.fstatSync(fd,{bigint:true}),h=Buffer.alloc(Math.min(65536,Number(before.size)));if(fs.readSync(fd,h,0,h.length,0)!==h.length)throw Error('CONTAINER_READ');
  const pe=h.readUInt32LE(60),count=h.readUInt16LE(pe+6),table=pe+24+h.readUInt16LE(pe+20);const candidates=[];
  for(let i=0;i<count;i++){const p=table+i*40;if(h.toString('latin1',p,p+8).replace(/\0.*$/,'')!=='.enigma1')continue;const offset=h.readUInt32LE(p+20),len=Math.min(h.readUInt32LE(p+16),65536);if(offset<table+count*40||offset+len>Number(before.size))throw Error('CONTAINER_SECTION');const b=Buffer.alloc(len);if(fs.readSync(fd,b,0,len,offset)!==len)throw Error('CONTAINER_READ');for(let at=0;(at=b.indexOf('EVB\0',at,'latin1'))>=0;at+=4)candidates.push(offset+at);}
  if(candidates.length!==1)throw Error('CONTAINER_HEADER');const result=require('../services/original-engines/evb.cjs').listInline(exe,candidates[0]),paths=new Map(result.files.map(f=>[f.path.join('/').toLowerCase(),f]));
  if(REQUIRED.some(p=>!paths.has(p)||paths.get(p).original<1||paths.get(p).stored<1))throw Error('CONTAINER_RPGM');
  const structure={metadataSHA256:result.metadataSHA256,nodes:result.nodes,files:result.files.map(f=>({path:f.path.join('/'),offset:f.offset,original:f.original,stored:f.stored}))};
  const after=fs.fstatSync(fd,{bigint:true}),stamp=s=>[s.dev,s.ino,s.size,s.mtimeNs,s.ctimeNs].join(':');if(stamp(before)!==stamp(after))throw Error('CONTAINER_CHANGED');
  return {type:TYPE,structureSHA256:crypto.createHash('sha256').update(JSON.stringify(structure)).digest('hex'),entries:result.files.length};
 }finally{if(fd!==undefined)fs.closeSync(fd);}
}
function shape(c,engine){return engine==='rpgmaker'&&c&&Object.getPrototypeOf(c)===Object.prototype&&Reflect.ownKeys(c).length===3&&Object.values(Object.getOwnPropertyDescriptors(c)).every(d=>'value'in d&&d.enumerable)&&c.type===TYPE&&typeof c.structureSHA256==='string'&&/^[a-f0-9]{64}$/.test(c.structureSHA256)&&Number.isSafeInteger(c.entries)&&c.entries>=REQUIRED.length&&c.entries<=16384;}
function verify(exe,c){const actual=inspect(exe);return actual.type===c.type&&actual.entries===c.entries&&actual.structureSHA256===c.structureSHA256;}
module.exports={TYPE,REQUIRED,inspect,shape,verify};
