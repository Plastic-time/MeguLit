// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
/* E576 Silky's family: Silky Engine (Silky's, Silky's Plus), AI6WIN and AI5WIN (elf / Silky's). One reader for the family,
   built on kit.cjs (E573): the archive layouts are kit tables, the scripts one opcode walk with a table per version.
   Format references (read, not copied): GARbro ArcFormats/Silky/{ArcARC,ArcIFL,ArcAi6Win}.cs and elf/ArcAi5Win.cs
   (morkt, MIT); TesterTesterov mesScriptAsseAndDisassembler (silky_mes.py), AI6WINScriptTool (ai6win_mes.py) and
   AI5WINScriptTool (ai5win_mes.py) (GPL-2.0 / GPL-3.0) for the .mes layout and opcode tables.
     Silky .arc    i32 count, count × {char name[32], u32 offset, u32 size}
     IFL           "IFLS", u32 data offset, i32 count, count × {char name[16], u32 offset, u32 size}; "CMP_" entries are
                   u32 unpacked at +4 and LZSS from +12 (window filled with 0x20)
     AI6WIN .arc   i32 count, count × {name[0x104] (byte j minus (length + 1 - j)), u32be size, u32be unpacked, u32be
                   offset}; packed entries LZSS
     AI5WIN .arc   i32 count, count × {name[n] XOR k, u32 size ^ a, u32 offset ^ b}; n is 0x14 / 0x1E / 0x20 / 0x100 and
                   k / a / b are recovered from the first two entries (GARbro GuessSchemes); .mes entries LZSS
     .mes          Silky: u32 n1, u32 n2, (n1 + n2) offsets, then code; AI6WIN: u32 n, n offsets, then code. One-byte
                   opcodes; 0x0A / 0x0B carry the text as C strings (Silky's 0x0A packs hiragana: a byte below 0x81 is the
                   Shift-JIS code 0x829E + byte), 0x33 pushes a string (choices, names and file names).
   AI5WIN scripts have three versions whose operands nest expressions; they are read with the generic text scan for now
   (their text is inline Shift-JIS, so the scan finds it), see ENGINE-ADAPTATION-NOTES E576. */
const fs=require('node:fs'),path=require('node:path'),kit=require('./kit.cjs');

/* ---- archives --------------------------------------------------------------------------------------------------- */
const SILKY_ARC={count:{at:0,type:'i32le'},entries:4,fields:[{name:'name',type:'cstr',size:32},{name:'offset',type:'u32le'},{name:'size',type:'u32le'}],
 validate:(e,size)=>/^[\x20-\x7e]+$/.test(e.name)};
const IFL={magic:'IFLS',count:{at:8,type:'i32le'},entries:12,fields:[{name:'name',type:'cstr',size:16},{name:'offset',type:'u32le'},{name:'size',type:'u32le'}]};
function ai6List(file){const size=kit.size(file),h=kit.head(file,4);if(h.length<4)return null;const count=h.readInt32LE(0);if(count<=0||count>100000||4+count*0x110>size)return null;
 const idx=kit.readAt(file,4,count*0x110),out=[];
 for(let i=0;i<count;i++){const p=i*0x110,raw=Buffer.from(idx.subarray(p,p+0x104));let n=raw.indexOf(0);if(n===0)return null;if(n<0)n=0x104;let key=(n+1)&255;
  for(let j=0;j<n;j++){raw[j]=(raw[j]-key)&255;key=(key-1)&255;if(raw[j]<0x20&&raw[j]!==0)return null;}
  const sz=idx.readUInt32BE(p+0x104),unpacked=idx.readUInt32BE(p+0x108),offset=idx.readUInt32BE(p+0x10c);if(offset<4+count*0x110||offset+sz>size)return null;
  out.push({name:new TextDecoder('shift_jis').decode(raw.subarray(0,n)),offset,size:sz,unpacked,packed:sz!==unpacked});}
 return out;}
function ai5List(file){const size=kit.size(file),h=kit.head(file,4);if(h.length<4)return null;const count=h.readInt32LE(0);if(count<2||count>100000)return null;
 for(const nl of [0x14,0x1e,0x20,0x100]){const dataAt=(nl+8)*count+4;if(dataAt>size)continue;const idx=kit.readAt(file,4,dataAt-4);
  const nameKey=idx[nl-1],firstSize=idx.readUInt32LE(nl),firstOff=idx.readUInt32LE(nl+4),offKey=(dataAt^firstOff)>>>0;if(nl+8+nl+8>idx.length)continue;
  const second=(idx.readUInt32LE((nl+8)+nl+4)^offKey)>>>0;if(second<dataAt||second>=size)continue;const sizeKey=((second-dataAt)^firstSize)>>>0;if(!offKey||!sizeKey)continue;
  const out=[];let ok=true;for(let i=0;i<count&&ok;i++){const p=i*(nl+8),nb=Buffer.from(idx.subarray(p,p+nl));let n=0;for(;n<nl;n++){nb[n]^=nameKey;if(!nb[n])break;if(nb[n]<0x20){ok=false;break;}}
   const sz=(idx.readUInt32LE(p+nl)^sizeKey)>>>0,off=(idx.readUInt32LE(p+nl+4)^offKey)>>>0;if(!ok||!n||off<dataAt||off+sz>size){ok=false;break;}out.push({name:new TextDecoder('shift_jis').decode(nb.subarray(0,n)),offset:off,size:sz,packed:/\.(mes|lib|a6?|msk|x)$/i.test(new TextDecoder('shift_jis').decode(nb.subarray(0,n)))});}
  if(ok)return out.map(e=>({...e,ai5:true}));}
 return null;}
/* every archive kind of the family, tried in order: [{kind, list}] */
function listAny(file){const head=kit.head(file,4).toString('latin1');
 if(head==='IFLS'){const l=kit.table(file,IFL);return l?{kind:'ifl',list:l}:null;}
 for(const [kind,fn] of [['ai6',ai6List],['silky',f=>kit.table(f,SILKY_ARC)],['ai5',ai5List]]){let l=null;try{l=fn(file);}catch{l=null;}if(l&&l.length)return {kind,list:l};}
 return null;}
function readEntry(file,kind,e){const b=kit.readAt(file,e.offset,e.size);
 if(kind==='ifl'){if(b.length>12&&b.toString('latin1',0,4)==='CMP_'&&!/\.grd$/i.test(e.name))return kit.lzss(b.subarray(12),b.readUInt32LE(4),{fill:0x20});return b;}
 if(kind==='ai6')return e.packed?kit.lzss(b,e.unpacked):b;
 if(kind==='ai5')return e.packed?kit.lzss(b):b;
 return b;}

/* ---- scripts ---------------------------------------------------------------------------------------------------- */
/* operand widths per opcode: 'z' a C string, numbers fixed bytes */
const t=entries=>new Map(entries.map(([op,e])=>[op,e]));
const COMMON=[[0x0a,'z'],[0x0b,'z'],[0x14,4],[0x15,4],[0x16,4],[0x17,0],[0x18,0],[0x19,4],[0x1a,4],[0x32,4],[0x33,'z'],...[0x34,0x35,0x37,0x38,0x39,0x3a,0x3b,0x3c,0x3d,0x3e,0x3f,0x40,0x41,0x42,0x43,0xfa,0xfb,0xfc,0xfd,0xfe,0xff].map(o=>[o,0])];
const TABLES={
 silky:t([[0x00,0],[0x01,4],[0x02,0],[0x03,0],[0x04,0],[0x05,0],[0x06,0],[0x0c,0],[0x0d,0],[0x0e,0],[0x0f,0],[0x10,1],[0x11,0],[0x1b,4],[0x1c,1],[0x36,1],...COMMON]),
 ai6v1:t([...[0,1,2,3,4,5,6,7,8,9,0x0c,0x0d,0x0e,0x0f,0x11,0x12,0x13].map(o=>[o,0]),[0x10,1],[0x1b,1],[0x1d,0],[0x36,1],...COMMON]),
 ai6v0:t([...[0,1,2,3,4,5,6,7,8,9,0x0c,0x0d,0x0e,0x0f,0x10,0x11,0x12,0x13].map(o=>[o,0]),[0x1b,1],[0x1d,0],[0x36,0],...COMMON])};
/* where the code starts: Silky (two offset lists) or AI6WIN (one) */
function starts(b){const out=[];if(b.length<8)return out;const n1=b.readUInt32LE(0),n2=b.readUInt32LE(4);
 if(n1<100000&&n2<100000&&8+4*(n1+n2)<=b.length)out.push({at:8+4*(n1+n2),hdr:'silky'});if(n1<100000&&4+4*n1<=b.length)out.push({at:4+4*n1,hdr:'ai6'});return out;}
/* the version whose table walks the code to its end (a table that stops early on an unknown opcode is the wrong one) */
function walk(b){let best=null;
 for(const s of starts(b))for(const [name,table] of Object.entries(TABLES)){if(s.hdr==='silky'&&name!=='silky'||s.hdr==='ai6'&&name==='silky')continue;
  const strs=[];const end=kit.opcodeWalk(b,op=>{const e=table.get(op);return e===undefined?undefined:[e];},(op,s2)=>{for(const x of s2)strs.push({op,bytes:x});},{opWidth:1,start:s.at});
  const score=end>=b.length?2:end/b.length;if(!best||score>best.score)best={score,name,strs};}
 return best&&best.score===2?best:null;}
/* Silky's packed hiragana: a byte below 0x81 stands for the two-byte Shift-JIS code 0x829E + byte */
function unpackHiragana(b){const out=[];for(let i=0;i<b.length;i++){const c=b[i];if(c<0x81){const code=(c+0x829e)&0xffff;out.push(code>>8,code&255);}else{out.push(c);if(i+1<b.length)out.push(b[++i]);}}return Buffer.from(out);}
function parse(buf){const b=Buffer.isBuffer(buf)?buf:Buffer.from(buf),w=walk(b);
 if(!w)return {lines:kit.decodeRuns(b),anchors:[]};/* AI5WIN and unknown versions: the generic scan */
 const strs=w.strs.map(x=>({...x,bytes:w.name==='silky'&&x.op===0x0a?unpackHiragana(x.bytes):x.bytes})),dec=kit.decoder(strs.map(x=>x.bytes)),lines=[],anchors=[];
 for(const x of strs){if(!x.bytes.length)continue;if(!x.bytes.some(c=>c>=0x80)){anchors.push(x.bytes.toString('latin1'));continue;}const s=kit.trimBoth(dec.decode(x.bytes));if(s)lines.push(s);}
 return {lines,anchors};}

/* ---- engine ----------------------------------------------------------------------------------------------------- */
const MES=/\.mes$/i;
function archives(dir){return kit.files(dir,{name:/\.(arc|ifl)$/i}).filter(f=>{const a=listAny(f);return a&&a.list.some(e=>MES.test(e.name));});}
function scenes(dir){const out=new Map();
 for(const a of archives(dir)){const {kind,list}=listAny(a);for(const e of list)if(MES.test(e.name)){const n=path.posix.basename(e.name.replace(/\\/g,'/'));out.set(n.toLowerCase(),{name:n,read:()=>readEntry(a,kind,e)});}}
 for(const f of kit.files(dir,{name:MES,subs:['','mes'],max:20000}))out.set(path.basename(f).toLowerCase(),{name:path.basename(f),read:()=>fs.readFileSync(f)});
 return [...out.values()].sort((a,b)=>a.name.localeCompare(b.name));}
const engine={id:'silky',hint:'mes.arc（*.mes）',scenes,archives:scenes,sources:dir=>[...archives(dir),...kit.files(dir,{name:MES,subs:['','mes'],max:20000})],parse,test:n=>MES.test(n)};
module.exports={engine,parse,listAny,readEntry,walk,unpackHiragana,TABLES};
