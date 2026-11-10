// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
/* Musica engine PAZ archives (ぱれっと ましろ色シンフォニー scr.dat), as in GARbro (MIT, ArcFormats/Musica/ArcPAZ.cs,
   keys from its GameData/Formats.dat PazScheme). Version 1+: a 32-byte header naming the game, then the index size
   (XOR-ed with its top byte when that is not 0), a Blowfish (index key) index: count, then per entry a C-string name,
   u64 offset, unpacked size, size, aligned size, packed flag. An entry is Blowfish (data key), then for an unpacked
   entry RC4 keyed "<name lower> <unpacked size %08X> <type password>", then zlib when packed.
   A .sc scenario is Shift-JIS text: ".message <id> <voice> <name> <text>" lines. */
const fs=require('node:fs'),path=require('node:path'),zlib=require('node:zlib');
const {Blowfish}=require('./blowfish.cjs');
const SCHEMES={
 mashiroiro:{title:'Mashiro Iro Symphony',version:1,scr:{index:'f423a8c4a322f6fdf976c34674b634e775802d382c06aa1085dccf0ce987e6ee',data:'85a52bbacf893da5b1da1a24a1d458243f4854edecb2c4afdecdd966b751b42a'},sc:'rytKRa38'},
};
function rc4(key){const S=new Uint8Array(256);for(let i=0;i<256;i++)S[i]=i;let j=0;for(let i=0;i<256;i++){j=(j+S[i]+key[i%key.length])&255;const t=S[i];S[i]=S[j];S[j]=t;}let a=0,b=0;
 return buf=>{for(let i=0;i<buf.length;i++){a=(a+1)&255;b=(b+S[a])&255;const t=S[a];S[a]=S[b];S[b]=t;buf[i]^=S[(S[a]+S[b])&255];}return buf;};}
function schemeOf(file){let head;try{const fd=fs.openSync(file,'r');try{head=Buffer.alloc(32);fs.readSync(fd,head,0,32,0);}finally{fs.closeSync(fd);}}catch{return null;}
 const name=head.toString('latin1',0,head.indexOf(0)>0?head.indexOf(0):0);return SCHEMES[name]||null;}
function list(file){const scheme=schemeOf(file),arc=path.parse(file).name.toLowerCase();if(!scheme||!scheme[arc])return null;
 const b=fs.readFileSync(file),start=scheme.version>0?0x20:0;let size=b.readUInt32LE(start);const xor=size>>>24;if(xor)size=(size^(xor*0x01010101))>>>0;
 if(size&7||start+4+size>b.length)return null;const raw=Buffer.from(b.subarray(start+4,start+4+size));if(xor)for(let i=0;i<raw.length;i++)raw[i]^=xor;
 const idx=new Blowfish(Buffer.from(scheme[arc].index,'hex')).decryptBuffer(raw),count=idx.readUInt32LE(0),out=[];let p=4;
 if(count<=0||count>100000)return null;const dataKey=Buffer.from(scheme[arc].data,'hex');
 for(let i=0;i<count;i++){const z=idx.indexOf(0,p);if(z<0)return null;const name=new TextDecoder('shift_jis').decode(idx.subarray(p,z));p=z+1;
  const e={name,offset:Number(idx.readBigInt64LE(p)),unpacked:idx.readUInt32LE(p+8),size:idx.readUInt32LE(p+12),aligned:idx.readUInt32LE(p+16),packed:idx.readInt32LE(p+20)!==0};p+=24;
  if(e.offset+e.aligned>b.length)return null;
  out.push({name,read:()=>{let d=Buffer.from(b.subarray(e.offset,e.offset+e.aligned));if(xor)for(let k=0;k<d.length;k++)d[k]^=xor;d=new Blowfish(dataKey).decryptBuffer(d);
   const pw=!e.packed&&/\.sc$/i.test(name)?scheme.sc:'';if(scheme.version>0&&pw)rc4(Buffer.from(name.toLowerCase()+' '+e.unpacked.toString(16).toUpperCase().padStart(8,'0')+' '+pw,'latin1'))(d);
   d=d.subarray(0,e.size);return e.packed?zlib.inflateSync(d):d;}});}
 return out;}
function parse(data){const lines=[];
 for(const row of new TextDecoder('shift_jis').decode(data).split(/\r?\n/)){if(!row.startsWith('.message'))continue;const f=row.split('\t');const name=f[3]||'',text=(f.slice(4).join('\t')||'').trim();
  if(!text)continue;if(name)lines.push(name);lines.push(text);}
 return {lines,anchors:[]};}
function scrDat(dir){const f=path.join(dir,'scr.dat');return schemeOf(f)?f:null;}
const engine={
 id:'paz',hint:'scr.dat',
 scenes(dir){const f=scrDat(dir);if(!f)return [];return (list(f)||[]).filter(e=>/\.sc$/i.test(e.name));},
 archives:()=>[],sources:dir=>{const f=scrDat(dir);return f?[f]:[];},
 parse,test:n=>/\.sc$/i.test(n),
};
module.exports={SCHEMES,list,parse,engine};
