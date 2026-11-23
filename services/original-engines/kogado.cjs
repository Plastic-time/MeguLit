// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
/* S5 Kogado Studio / Hypatia "HyPack" archives (シンフォニック＝レイン Script.pak), layout as in GARbro (MIT, morkt)
   ArcFormats/Hypatia/ArcKogado.cs: "HyPack" u16 version (0x100 / 0x200 / 0x300 / 0x301), u32 data size (index at
   0x10 + it), u32 count; entries of 32 / 40 / 48 bytes: name[0x15], ext[3], u32 offset (from 0x10), then (v2+) u32
   unpacked size, u32 stored size, u8 compression (0 none, 1 Mariel LZ, 2 Cocotte BWT + range coder, 3 XOR 0xFF).
   A .kgo scene ends with its string table: u32 offset, size and count at 0x28 in SR01 or 0x34 in SKTR and SK20.
   Each string has a u16 length (counting itself), text bytes and NUL padding. SK20 uses UTF-8. */
const fs=require('node:fs'),path=require('node:path'),kit=require('./kit.cjs');
const {rangeModel,rangeDecode}=require('./shiinario-crypt.cjs');
const ENTRY={0x100:32,0x200:40,0x300:48,0x301:48};
const COCOTTE_LIMIT=64*1024*1024;
function list(file){let h;try{h=kit.readAt(file,0,16);}catch{return null;}if(h.length<16||h.toString('latin1',0,6)!=='HyPack')return null;
 const ver=h.readUInt16LE(6),es=ENTRY[ver],size=kit.size(file),at=0x10+h.readUInt32LE(8),n=h.readInt32LE(12);if(!es||n<=0||n>0xfffff||at+n*es>size)return null;
 const idx=kit.readAt(file,at,n*es),out=[];
 for(let i=0;i<n;i++){const o=i*es,cut=b=>b.toString('latin1').replace(/\0.*$/s,'');const base=cut(idx.subarray(o,o+0x15))||String(i).padStart(5,'0'),ext=cut(idx.subarray(o+0x15,o+0x18));
  const e={name:ext?base+'.'+ext:base,offset:0x10+idx.readUInt32LE(o+0x18)};
  if(ver>=0x200){e.unpacked=idx.readUInt32LE(o+0x1c);e.size=idx.readUInt32LE(o+0x20);e.type=idx[o+0x24];}else{e.size=idx.readUInt32LE(o+0x1c);e.unpacked=e.size;e.type=0;}
  if(e.offset+e.size>size)return null;out.push(e);}
 return out;}
/* Mariel LZ (GARbro MarielEncoder.Unpack): 32-bit flag words, a set bit is a back reference */
function mariel(src,outSize){const out=Buffer.alloc(outSize);let s=0,d=0,bits=0;
 while(d<outSize){let carry=(bits&0x80000000)!==0;bits=(bits<<1)>>>0;
  if(bits===0){if(s+4>src.length)break;bits=src.readUInt32LE(s);s+=4;carry=(bits&0x80000000)!==0;bits=((bits<<1)|1)>>>0;}
  if(s>=src.length)break;let b=src[s++];if(!carry){out[d++]=b;continue;}
  let off=(b&0x0f)+1,count=((b>>4)&0x0f)+1;
  if(count===0x0f){if(s>=src.length)break;count=src[s++];}else if(count>0x0f){if(s+2>src.length)break;count=src.readUInt16LE(s);s+=2;}
  if(off>=0x0b){if(s>=src.length)break;off=((off-0x0b)<<8)|src[s++];}
  count=Math.min(count,outSize-d);const from=d-off;if(from<0)break;for(let k=0;k<count;k++)out[d+k]=out[from+k];d+=count;}
 return d===outSize?out:out.subarray(0,d);}
/* Cocotte uses the same range coder with its own initial symbol frequencies. */
const COCOTTE_FREQUENCIES=Uint16Array.from([
 1400,640,320,240,160,120,80,64,48,40,32,24,20,20,20,20,
 16,16,16,16,12,12,12,12,12,12,8,8,8,8,8,8,
 ...Array(16).fill(6),...Array(16).fill(5),...Array(32).fill(4),...Array(38).fill(3),...Array(123).fill(2),
]);
const cocotteError=()=>Object.assign(Error('HYPACK_COCOTTE'),{code:'HYPACK_COCOTTE'});
function inverseBwt(block,out,offset){
 let row=block.readUInt16LE(0);
 const column=block.subarray(2);
 if(row>=column.length)throw cocotteError();
 const starts=new Uint32Array(256);
 for(const byte of column)starts[byte]++;
 let start=0;
 for(let i=0;i<starts.length;i++){
  const count=starts[i];
  starts[i]=start;
  start+=count;
 }
 const next=new Uint16Array(column.length);
 for(let i=0;i<column.length;i++)next[starts[column[i]]++]=i;
 for(let i=0;i<column.length;i++){
  row=next[row];
  out[offset+i]=column[row];
 }
}
function cocotte(src,outSize){
 const out=Buffer.alloc(outSize),order=Uint8Array.from({length:256},(_,i)=>i);
 let model=rangeModel(COCOTTE_FREQUENCIES),s=0,d=0;
 while(s<src.length){
  if(s+4>src.length)throw cocotteError();
  const packed=src.readUInt16LE(s),size=src.readUInt16LE(s+2);
  if(packed<=4||s+packed>src.length||!size||size>0x8000||d+size>outSize)throw cocotteError();
  const payload=src.subarray(s+4,s+packed),transformSize=size+2;
  let block;
  if(payload.length===transformSize){
   block=Buffer.from(payload);
   model=rangeModel(COCOTTE_FREQUENCIES);
  }else{
   block=rangeDecode(payload,payload.length,transformSize,model);
   if(block?.length!==transformSize)throw cocotteError();
  }
  // Move-to-front order carries across every block, including stored blocks.
  for(let i=0;i<block.length;i++){
   const index=block[i],byte=order[index];
   order.copyWithin(1,0,index);
   order[0]=block[i]=byte;
  }
  inverseBwt(block,out,d);
  s+=packed;
  d+=size;
 }
 if(d!==outSize)throw cocotteError();
 return out;
}
function read(file,e){
 if(e.type===2&&(e.size>COCOTTE_LIMIT||e.unpacked>COCOTTE_LIMIT))throw cocotteError();
 const raw=kit.readAt(file,e.offset,e.size);
 if(e.type===0)return raw;if(e.type===1)return mariel(raw,e.unpacked);if(e.type===3){const b=Buffer.from(raw);for(let i=0;i<b.length;i++)b[i]^=0xff;return b;}
 if(e.type===2&&raw.length===e.size)return cocotte(raw,e.unpacked);
 throw cocotteError();}
const SCRIPT=/\.(kgo|scr|txt|tbl)$/i;
function archives(dir){let names=[];try{names=fs.readdirSync(dir);}catch{return [];}return names.filter(n=>/\.(pak|dat)$/i.test(n)&&/script|scenario|scene|text/i.test(n)).map(n=>path.join(dir,n)).filter(f=>!!list(f));}
function scenes(dir){const out=[];for(const f of archives(dir))for(const e of list(f)||[])if(SCRIPT.test(e.name))out.push({name:e.name,read:()=>read(f,e)});return out;}
/* The scene's string table, with the generic text scan for other formats. */
function parse(buf){const b=Buffer.isBuffer(buf)?buf:Buffer.from(buf),magic=b.toString('latin1',0,4);
 const header=magic==='SR01'?0x28:magic==='SKTR'||magic==='SK20'?0x34:0;
 if(header&&b.length>=header+12){const at=b.readUInt32LE(header),size=b.readUInt32LE(header+4),n=b.readUInt32LE(header+8);
  if(at+size<=b.length&&n<0x100000){const strs=[];let p=at;for(let i=0;i<n&&p+2<=at+size;i++){const len=b.readUInt16LE(p);if(len<2||p+len>at+size)break;let e=p+len;while(e>p+2&&b[e-1]===0)e--;strs.push(b.subarray(p+2,e));p+=len;}
   if(strs.length){const text=kit.decodeText(Buffer.concat(strs.flatMap(s=>[s,Buffer.from('\n')])));return {lines:text.split('\n').filter(t=>/[^\x00-\x7f]/.test(t)),anchors:[]};}}}
 return {lines:kit.decodeRuns(b),anchors:[]};}
const engine={id:'kogado',hint:'Script.pak（HyPack）',scenes,archives:scenes,sources:archives,parse,test:n=>/\.kgo$/i.test(n),_internal:{list,mariel,read}};
module.exports={engine,list,mariel,parse};
