// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
/* E579 ShiinaRio / 椎名里緒 (Stage-nana's engine: Eushully until ~2010, GRAND†CROSS, Akatsuki Works, Hime Taiyou …;
   VNDB ~301 company releases). Format references (read, not copied): GARbro ArcFormats/ShiinaRio/ArcWARC.cs (morkt,
   MIT) for WARC and its YH1 / YPK / YLZ entries; OpenShiina docs/engine-notes.md (kagaminehaku, GPL-3.0) for the
   archive roles and the scenario grammar.
     *.war   "WARC 1.x"; u32 at 8 XOR 0xF182AD82 = index offset. Index entries {name[16 in 1.1, 32 later], u32 offset,
             u32 size, u32 unpacked, i64 file time, u32 flags}. An entry starts with a tag ("YH1" static Huffman, dword
             bits high first; "YPK" zlib; "YLZ" the engine's LZ) and the unpacked size; byte 3 set = the body is XOR'd
             with "KM" / "KMKM". 1.1 has no keys and is read here. From 1.2 on, the index and entries are encrypted
             with keys of the title (CryptKey, HelperKey, Region, DecodeBin, a ShiinaImage, often an ExtraCrypt); the
             math depends on doubles (acos, log, exp, pow), so those archives are opened by GARbro's scheme database
             (the "archives" runtime pack, 138 titles) and only the scenario text it extracts is parsed here.
     *_T.WAR the scenario: Shift-JIS .TXT, one message per non-empty line: "$NAME,args" commands, "【name】" speakers,
             ";" comments. (*_S.WAR holds the compiled engine scripts .SCN, which carry no story text.)
   Lines are the scenario messages in file order, so a translated TXT pairs line by line. */
const fs=require('node:fs'),path=require('node:path'),kit=require('./kit.cjs'),garbro=require('./garbro.cjs');

/* ---- WARC --------------------------------------------------------------------------------------------------------- */
/* {version (110 …170), indexOffset} or null */
function header(file){const h=kit.head(file,12);if(h.length<12||h.toString('latin1',0,4)!=='WARC'||h.toString('latin1',4,7)!==' 1.')return null;const d=h[7]-0x30;if(d<0||d>7)return null;
 const indexOffset=(h.readUInt32LE(8)^0xf182ad82)>>>0;return indexOffset<kit.size(file)?{version:100+d*10,indexOffset}:null;}
/* the entries of a WARC 1.1 archive (no keys), or null */
function list(file){const h=header(file);if(!h||h.version!==110)return null;const size=kit.size(file),nameSize=16,step=nameSize+24;
 const idx=kit.readAt(file,h.indexOffset,Math.min(step*8192,size-h.indexOffset)),out=[],seen=new Set();
 for(let p=0;p+step<=idx.length;p+=step){const z=idx.indexOf(0,p),name=new TextDecoder('shift_jis').decode(idx.subarray(p,z<0||z>p+nameSize?p+nameSize:z));
  const e={name,offset:idx.readUInt32LE(p+nameSize),size:idx.readUInt32LE(p+nameSize+4),unpacked:idx.readUInt32LE(p+nameSize+8),flags:idx.readUInt32LE(p+nameSize+20)};
  if(!name||idx[p]>=0x80)continue;if(e.offset+e.size>size)return null;if(!seen.has(name)){seen.add(name);out.push(e);}}
 return out.length?out:null;}
/* YLZ: the engine's LZ (bits from little-endian dwords, high first; literals and back references up to 64 KB back) */
function ylz(input,start,unpacked){const out=Buffer.alloc(unpacked);let src=start,ctl=0,mask=0,dst=0;
 const ctlBit=()=>{const b=(ctl&mask)!==0;mask>>>=1;if(!mask){ctl=input.readUInt32LE(src);src+=4;mask=0x80000000;}return b;};
 const bits=n=>{let v=0;for(let i=0;i<n;i++)v=(v<<1)|(ctlBit()?1:0);return v;};
 ctlBit();
 while(dst<unpacked){if(ctlBit()){out[dst++]=input[src++];continue;}const next=ctlBit();let offset=input[src++]|~0xffff,ah=0xff,count;
  if(next){if(ctlBit())ah=(ah<<1)|bits(1);else if(ctlBit()){ah=(ah<<1)|bits(1);offset-=0x200;}else if(ctlBit()){ah=(ah<<2)|bits(2);offset-=0x400;}else if(ctlBit()){ah=(ah<<3)|bits(3);offset-=0x800;}else{ah=(ah<<4)|bits(4);offset-=0x1000;}
   if(ctlBit())count=3;else if(ctlBit())count=4;else if(ctlBit())count=5+bits(1);else if(ctlBit())count=7+bits(2);else if(ctlBit())count=0x0b+bits(3);else count=0x13+input[src++];}
  else if(ctlBit()){ah=((ah<<3)|bits(3))-1&0xff;count=2;}
  else if((offset&0xff)===0xff)break;else count=2;
  offset+=(ah&0xff)<<8;for(let k=0;k<count&&dst<unpacked;k++,dst++){const from=dst+offset;out[dst]=from>=0?out[from]:0;}}
 return out.subarray(0,dst);}
/* an entry's bytes: the YH1 / YPK / YLZ body unpacked (the "KM" XOR undone first), anything else as stored */
function unpackEntry(b){if(b.length<=8)return b;const tag=b.toString('latin1',0,3),unpacked=b.readUInt32LE(4),x=Buffer.from(b),keyed=b[3]!==0;
 const xorDwords=key=>{let i=8;for(;i+4<=x.length;i+=4)x.writeUInt32LE((x.readUInt32LE(i)^key)>>>0,i);return i;};
 if(tag==='YH1'){if(keyed)xorDwords((0x6393528e^0x4b4d)>>>0);return kit.huffman(x.subarray(8),unpacked,{order:'dword-msb'});}
 if(tag==='YPK'){if(keyed){const k=(~0x4b4d4b4d)>>>0;for(let i=xorDwords(k);i<x.length;i++)x[i]^=k&255;}return kit.inflate(x.subarray(8));}
 if(tag==='YLZ'){if(keyed){let k=0x4b4d4b4d;for(let i=xorDwords(k);i<x.length;i++){x[i]^=k&255;k>>>=8;}}return ylz(x,8,unpacked);}
 return b;}
const read=(file,e)=>unpackEntry(kit.readAt(file,e.offset,e.size));

/* ---- scenario TXT ------------------------------------------------------------------------------------------------- */
function parse(buf){const b=Buffer.isBuffer(buf)?buf:Buffer.from(buf);if(!b.length)return {lines:[],anchors:[]};
 /* scenario text is mostly double-byte; a binary file (an .SCN, an image) is not */
 const ctl=b.subarray(0,4096).filter(c=>c<0x09||c>0x0d&&c<0x20).length;if(ctl>8)return {lines:[],anchors:[]};
 const text=kit.decoder([b]).decode(b);
 const r=kit.lineGrammar(text,{comment:/^;/,anchor:/^\$/,name:/^【([^】]+)】$/,strip:[],blocks:[]});
 return r.lines.some(kit.hasKana)||r.lines.some(l=>/[㐀-鿿]/.test(l))?r:{lines:[],anchors:r.anchors};}

/* ---- the game folder ---------------------------------------------------------------------------------------------- */
const wars=dir=>kit.files(dir,{name:/\.war$/i,magic:'WARC'}).filter(f=>header(f));
/* the scenario archives GARbro should open: *_T.WAR (and names like scenario / script / txt), else every keyed one */
const SCENARIO=/(_t|scenario|script|scr|txt|text)\.war$/i;
function scenes(dir){const out=new Map(),all=wars(dir),keyed=[];
 for(const a of all){const l=list(a);if(l){for(const e of l)if(/\.txt$/i.test(e.name))out.set(e.name.toLowerCase(),{name:path.basename(a)+'/'+e.name,read:()=>read(a,e)});}else keyed.push(a);}
 const targets=keyed.filter(f=>SCENARIO.test(path.basename(f)));
 for(const a of targets.length?targets:keyed){let c;try{c=garbro.cacheDir(a);}catch{continue;}const info=garbro.readJson(path.join(c,'done.json'));
  if(info){for(const rel of info.files)if(/\.txt$/i.test(rel))out.set(rel.toLowerCase(),{name:path.basename(a)+'/'+rel.replace(/\\/g,'/'),read:()=>fs.readFileSync(path.join(c,rel))});continue;}
  if(garbro.readJson(path.join(c,'failed.json'))?.version===garbro.version())continue;
  try{garbro.schedule(a);}catch{}}
 return [...out.values()].sort((a,b)=>a.name.localeCompare(b.name));}
const engine={id:'shiinario',hint:'*_T.WAR（*.TXT）',scenes,archives:scenes,sources:wars,parse:b=>{try{return parse(b);}catch{return {lines:[],anchors:[]};}},test:()=>false};
module.exports={engine,parse,header,list,read,unpackEntry,ylz};
