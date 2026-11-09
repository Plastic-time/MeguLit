// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
/* E342 MAGES. engine (Steam STEINS;GATE): USRDIR/script.mpk holds one SC3 file per scene (.SCX). An SC3 file is
   "SC3\0", the offset of its string table, the offset of the table after it; each string runs to 0xFF. A byte 0x80-0xAF
   starts a two-byte glyph: (big-endian word & 0x7FFF) is an index into the game's font sheet, so the text is only
   readable with that sheet's character list (mages-charset-sghd.txt: LunaHook's charset_SGHD, the same list the hook
   uses for this game, copied from preserved/source/lunahoook-adapted/.../resource/mages, GPL like LunaHook). Control bytes follow the hook's reader (native/mages/readString.cpp):
   01 name 02, 09 ruby base 0A reading 0B, 04/15 expression, 0C/11/12/13 one 16-bit argument, 00 line break.
   A speaker name is its own line (【倫太郎】), so a hooked line with or without the name lines up (the matcher joins
   consecutive lines). Only the Japanese release reads: the English MAGES releases decode to English and are left out.
   There is no Chinese in these releases; zero-latency translation machine-translates ahead. */
const fs=require('node:fs'),path=require('node:path'),zlib=require('node:zlib');
const KANA=/[ぁ-ゖァ-ヺ]/;
const stat=file=>{try{const s=fs.statSync(file);return s.size+'|'+s.mtimeMs;}catch{return '';}};
let charsetMemo=null;
const charset=()=>charsetMemo||(charsetMemo=fs.readFileSync(path.join(__dirname,'mages-charset-sghd.txt'),'utf8').replace(/[\r\n]/g,''));
// MPK v2: "MPK\0", version 2.0, entry count (u64), index at 0x40 of 256-byte entries (compression, id, offset, size,
// unpacked size, 224-byte name).
const listMemo=new Map();
function mpkList(file){const key=file+'|'+stat(file);if(listMemo.has(key))return listMemo.get(key);let out=null,fd;
 try{fd=fs.openSync(file,'r');const size=fs.fstatSync(fd).size,h=Buffer.alloc(16);fs.readSync(fd,h,0,16,0);
  if(h.toString('latin1',0,4)==='MPK\0'&&h.readUInt16LE(6)===2){const n=h.readUInt32LE(8);if(n>0&&n<100000&&0x40+n*256<=size){const idx=Buffer.alloc(n*256);fs.readSync(fd,idx,0,idx.length,0x40);out=[];
   for(let i=0;i<n;i++){const p=i*256,e={compressed:idx.readUInt32LE(p)!==0,offset:Number(idx.readBigUInt64LE(p+8)),packed:Number(idx.readBigUInt64LE(p+16)),size:Number(idx.readBigUInt64LE(p+24)),name:idx.toString('latin1',p+32,p+256).replace(/\0[\s\S]*$/,'')};
    if(e.offset+e.packed>size){out=null;break;}out.push(e);}}}
 }catch{out=null;}finally{if(fd!==undefined)fs.closeSync(fd);}
 listMemo.set(key,out);if(listMemo.size>16)listMemo.delete(listMemo.keys().next().value);return out;}
function mpkRead(file,e){const fd=fs.openSync(file,'r');try{const b=Buffer.alloc(e.packed);fs.readSync(fd,b,0,e.packed,e.offset);return e.compressed?zlib.inflateSync(b):b;}finally{fs.closeSync(fd);}}
// One SC3 string as display lines: the speaker's name (if any) and the text, with ruby pairs and unknown glyphs counted.
function decodeString(b,q,cs){let text='',name='',miss=0;const ruby=[];
 const glyph=()=>{const i=b.readUInt16BE(q)&0x7fff;q+=2;const c=cs[i];if(c===undefined){miss++;return '';}return c;};
 while(q<b.length&&b[q]!==0xff){const c=b[q];
  if(c>=0xb0){q++;continue;}
  if(c>=0x80){if(q+1>=b.length)break;text+=glyph();continue;}
  q++;
  if(c===0)text+='\n';
  else if(c===1){while(q<b.length&&b[q]!==2&&b[q]!==0xff){if(b[q]<0x20)q++;else if(b[q]>=0x80)name+=glyph();else q++;}if(b[q]===2)q++;}
  else if(c===4||c===0x15){let t=b[q];if(!t)q++;else{while(q<b.length&&t){if(t&0x80)q+=2+((t&0x60)>>5);else q+=2;t=b[q];}q++;}}
  else if(c===0x0c||c===0x11||c===0x12||c===0x13)q+=2;
  else if(c===9){let base='',reading='';
   while(q<b.length&&b[q]!==0x0b&&b[q]!==0xff){if(b[q]===0x0a){q++;while(q<b.length&&b[q]!==0x0b&&b[q]!==0xff){if(b[q]>=0x80)reading+=glyph();else q++;}}else if(b[q]>=0x80)base+=glyph();else q++;}
   if(b[q]===0x0b)q++;text+=base;if(base&&reading)ruby.push([base,reading]);}
 }
 return {name,text,miss,ruby};}
function parse(buf){const lines=[],ruby=[],anchors=[];let miss=0,glyphs=0;
 if(buf.length<12||buf.toString('latin1',0,4)!=='SC3\0')return {lines,anchors,ruby,miss};
 const so=buf.readUInt32LE(4),ro=buf.readUInt32LE(8),cs=charset();if(so<12||ro<so||ro>buf.length)return {lines,anchors,ruby,miss};
 for(let s=so;s+4<=ro;s+=4){const at=buf.readUInt32LE(s);if(at>=buf.length)continue;const d=decodeString(buf,at,cs);miss+=d.miss;glyphs+=d.name.length+d.text.length;
  if(d.name){lines.push('【'+d.name+'】');ruby.push(null);}
  const t=d.text.replace(/^\n+|\n+$/g,'');if(t){lines.push(t);ruby.push(d.ruby.length?d.ruby:null);}}
 return {lines,anchors,ruby,miss,glyphs};}
const scriptMpk=dir=>{for(const f of [path.join(dir,'USRDIR','script.mpk'),path.join(dir,'script.mpk')])if(fs.existsSync(f)&&mpkList(f))return f;return null;};
const SCX=n=>/\.scx$/i.test(n);
// Japanese and decodable with this character list: most strings of a sample of scenes have kana, few glyphs unknown.
const jpMemo=new Map();
function japanese(file){const key=file+'|'+stat(file);if(jpMemo.has(key))return jpMemo.get(key);let ok=false;
 try{const list=mpkList(file).filter(e=>SCX(e.name)&&e.size>4000);let lines=0,kana=0,miss=0,glyphs=0;
  for(const e of list.filter((_,i)=>i%Math.max(1,Math.floor(list.length/12))===0).slice(0,12)){const p=parse(mpkRead(file,e));lines+=p.lines.length;kana+=p.lines.filter(t=>KANA.test(t)).length;miss+=p.miss;glyphs+=p.glyphs||0;}
  ok=lines>0&&kana>=lines*.5&&miss<=glyphs*.01;}catch{ok=false;}
 jpMemo.set(key,ok);return ok;}
const mages={
 id:'mages',hint:'USRDIR\\script.mpk',
 scenes(dir){const f=scriptMpk(dir);if(!f||!japanese(f))return [];
  return mpkList(f).filter(e=>SCX(e.name)).map(e=>({name:e.name,read:()=>mpkRead(f,e)})).sort((a,b)=>a.name.localeCompare(b.name));},
 archives:()=>[],
 sources:dir=>{const f=scriptMpk(dir);return f?[f]:[];},
 parse:buf=>{const p=parse(buf);return {lines:p.lines,anchors:p.anchors,ruby:p.ruby};},
 test:()=>false,
 // No Chinese in these releases (zero-latency translation translates ahead).
 patchLines:()=>null,
 _internal:{mpkList,mpkRead,decodeString,parseSc3:parse,charset},
};
module.exports=mages;
