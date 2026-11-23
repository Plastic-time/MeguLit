// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
/* E587 Ikura GDL / Digital Romance System (Ikura, Hearty Soft, Marvelous-era Japanese brands; ~60 company releases).
   Format references (read, not copied): GARbro ArcFormats/Ikura/ArcDRS.cs (morkt, MIT: DRS, MPX, ISF transforms) and the
   ViLE source of the Ikura decoder (VienDesuPorting/ikuradroid jni/vile/ikura iscript.cpp, ikuradecoder.cpp iop_pm,
   GPL-3.0) for the instruction stream.
     archives   no extension. "SM2MPX10": i32 count at 8, entries from 0x20 {char name[12], u32 offset, u32 size}; old DRS
                (no magic): u16 index size at 0 (a multiple of 16, at least 0x20), entries from 2 {char name[12], u32 offset}
                of 16 bytes, an entry runs to the next one's offset. *.isf / *.snr are the scripts
     isf        u32 code start at 0 (8 + 4 × jump table size), u16 version at 4, byte 6 XOR key; bytes from 8 transformed by the
                version: 0x9795 ror 2, 0xD197 not, 0xCE89 XOR key (else ror 2, as ViLE does for all). A script ending in
                "SECRETFILTER100a" has an additional XOR layer. A matching game executable can supply its cyclic table.
     code       from the code start: {u8 opcode, length}; the second byte < 0x80 is the total length, else
                ((b & 0x7F) << 8 | next byte) is. Text opcodes 0x2B (PM), 0x2C, 0xD8, 0xD6, 0xD9: payload = window byte, then inline
                commands (0x03 clear; 0x01 sub-command colour / word; 0x04 name index; 0x06; 0x08 and 0x11 + dword; 0x13 voice
                name or name index); 0xFF is followed by the NUL-terminated line
   Lines come in script order, so a GBK patch's isf pairs 1:1. */
const kit=require('./kit.cjs'),fs=require('node:fs'),path=require('node:path');
const SECRET='SECRETFILTER100a',TEXT_OPS=new Set([0x2b,0x2c,0xd8,0xd6,0xd9]);
const ALPHABET='G5FXIL094MPRKWCJ3OEBVA7HQ2SU8Y6TZ1ND',TABLE_BYTES=0x800;
const isScript=n=>/\.(isf|snr)$/i.test(n);

function mpxList(file){return kit.table(file,{magic:'SM2MPX10',count:{at:8,type:'i32le'},entries:0x20,fields:[{name:'name',type:'cstr',size:12},{name:'offset',type:'u32le'},{name:'size',type:'u32le'}]});}
function drsList(file){const fsz=kit.size(file);if(fsz<0x22)return null;const h=kit.head(file,3),dir=h.readUInt16LE(0);
 if(dir<0x20||dir&0xf||dir+2>=fsz||h[2]<=0x20)return null;const idx=kit.readAt(file,2,dir),count=dir/16-1,out=[];let next=idx.readUInt32LE(12);
 if(next>fsz||next<dir+2)return null;
 for(let i=0;i<count;i++){const p=i*16,z=idx.indexOf(0,p),name=idx.toString('latin1',p,z<0||z>p+12?p+12:z);if(!name||!/^[\x20-\x7e]+$/.test(name))return null;
  const offset=next;next=idx.readUInt32LE(p+16+12);if(next>fsz||next<offset)return null;out.push({name,offset,size:next-offset});}
 return out;}
function list(file){let all=null;try{all=kit.head(file,8).toString('latin1')==='SM2MPX10'?mpxList(file):drsList(file);}catch{return null;}
 const s=(all||[]).filter(e=>isScript(e.name)).map(e=>({...e,name:e.name.toLowerCase()}));return s.length?s:null;}

const isEncoded=buf=>buf.length>0x10&&buf.toString('latin1',buf.length-0x10)===SECRET;
function codeOffset(buf,size){
 if(buf.length<8||size<12)return 0;
 const code=buf.readUInt32LE(0);
 return code>=8&&(code-8)%4===0&&code<=size?code:0;
}
/* IsfDecoder in GARbro describes the symbol order and the 64-row update cycle. */
function secretReader(table){
 const symbols=Uint8Array.from(table.toUpperCase(),char=>ALPHABET.indexOf(char));
 const delta=i=>(symbols[0x500+i]-symbols[0x100+i]+36)%36;
 const hex=ALPHABET[delta(0)]+ALPHABET[delta(1)];
 if(!/^[0-9A-F]{2}$/.test(hex))return null;
 const width=parseInt(hex,16);
 if(!width)return null;
 const initial=Uint8Array.from({length:width},(_,i)=>delta(0x10+i));
 return bytes=>{
  const state=initial.slice(),out=Buffer.from(bytes);
  for(let start=0,block=0;start<out.length;start+=width,block++){
   const row=(block&63)*16;
   for(let i=0;i<width&&start+i<out.length;i++){
    state[i]=(state[i]+symbols[row+i])%36;
    out[start+i]^=ALPHABET.charCodeAt(state[i]);
   }
  }
  return out;
 };
}
function installedSecretReaders(dir){
 const readers=[];
 for(const file of kit.files(dir,{name:/\.exe$/i})){
  const image=kit.head(file,4*1024*1024);
  if(image.toString('latin1',0,2)!=='MZ')continue;
  const alphabetAt=image.indexOf(ALPHABET);
  let end=alphabetAt;
  while(end>0&&alphabetAt-end<16&&image[end-1]===0)end--;
  if(end<TABLE_BYTES)continue;
  const table=image.toString('latin1',end-TABLE_BYTES,end);
  if(/[^0-9A-Z]/i.test(table))continue;
  const reader=secretReader(table);
  if(reader)readers.push(reader);
 }
 return readers;
}
/* the transformed script, or null when it still needs the secret */
function decode(buf){if(isEncoded(buf)||!codeOffset(buf,buf.length))return null;
 const v=buf.readUInt16LE(4),out=Buffer.from(buf);for(let i=8;i<out.length;i++){const c=out[i];out[i]=v===0xd197?~c&255:v===0xce89?(buf[6]?c^buf[6]:c):((c>>>2)|(c<<6))&255;}return out;}
function* instructions(b){let p=b.readUInt32LE(0);while(p+2<=b.length){const op=b[p],b1=b[p+1],hdr=b1&0x80?3:2,len=hdr===3?((b1&0x7f)<<8)|b[p+2]:b1;
 if(len<hdr||p+len>b.length)return;yield {op,payload:b.subarray(p+hdr,p+len)};p+=len;}}
/* the lines of one text instruction, as ViLE's iop_pm walks the payload */
function pmLines(d){const out=[];let i=1;
 while(i<d.length){const c=d[i++];
  if(c===0x03)continue;
  if(c===0x01){if(d[i]===0)i+=4;else if(d[i]===1)i+=3;continue;}
  if(c===0x04){i+=1;continue;}
  if(c===0x08||c===0x11){i+=4;continue;}
  if(c===0x13){if(d[i]>0x1f){while(i<d.length&&d[i++]);}else if(d[i]===0x04)i+=3;continue;}
  if(c===0xff){const e=d.indexOf(0,i),end=e<0?d.length:e;out.push(d.subarray(i,end));i=end+1;}}
 return out;}
function parse(buf){const b=decode(buf);if(!b)return {lines:[],anchors:[]};const raw=[];
 for(const ins of instructions(b))if(TEXT_OPS.has(ins.op))raw.push(...pmLines(ins.payload));
 const dec=kit.decoder(raw),lines=[];for(const r of raw){const t=kit.trimBoth(dec.decode(r));if(t)lines.push(t);}return {lines,anchors:[]};}

const engine=kit.engine({id:'ikura',hint:'无扩展名 SM2MPX10 / DRS 归档（*.isf）',
 archives:{name:/^[^.]+$/,list},loose:{name:/\.(isf|snr)$/i,subs:['','script']},parse,test:isScript});
const scriptScenes=engine.scenes;
function gameParser(dir){
 let readers;
 return buf=>{
  if(!isEncoded(buf))return parse(buf);
  readers??=installedSecretReaders(dir);
  const stored=buf.subarray(0,-0x10);
  for(const read of readers){
   const header=read(stored.subarray(0,8));
   if(!codeOffset(header,stored.length)||![0x9795,0xd197,0xce89].includes(header.readUInt16LE(4)))continue;
   const parsed=parse(read(stored));
   if(parsed.lines.length)return parsed;
  }
  return {lines:[],anchors:[]};
 };
}
engine.scenes=dir=>{
 const read=gameParser(dir);
 return scriptScenes(dir).map(scene=>({...scene,parse:()=>read(scene.read())}));
};
/* a game whose scripts are SECRETFILTER-encoded needs its secret: say so instead of showing no text */
engine.unsupported=dir=>{let encoded=false;const read=gameParser(dir);for(const sc of scriptScenes(dir)){let buf;try{buf=sc.read();}catch{continue;}if(isEncoded(buf))encoded=true;if(read(buf).lines.length)return '';}return encoded?'IKURA_SECRET':'';};
engine.REASONS={IKURA_SECRET:'这个 Ikura GDL 游戏的剧本带 SECRETFILTER 加密，需要该作品的密钥，暂时读不了'};
module.exports={engine,parse,list,decode,isEncoded,pmLines,mpxList,drsList};
