// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
/* E573 engine kit: the pieces every script reader was writing again (user 2026-11-14: 这些引擎都有共同处，先查重).
   An audit of services/original-engines (50 modules) found, written separately in each: a Shift-JIS / GBK picker (12×),
   a kana test (24×), "read n bytes at offset" (25×), folder walks, three LZSS decoders, XOR loops (18×), an index-table
   parser per archive, and the same scenes / archives / sources boilerplate. Readers for new engines are built from
   these instead; the adapter-pack runtime (services/adapter-packs.cjs) shares the transforms and the table container.

   io         readAt, head, tail, names, walk, files (by extension, magic, sub folder)
   text       codepage / decoder (SJIS vs GBK), KANA, hasKana, cstr, decodeRuns (generic kana scan), trimBoth
   transforms xor (byte key), xorDword (key, add per dword, add-increment), rol / ror, not, lzss (Okumura, every
              common variant: window, start, fill, flag bit order, length bits, minimum match), zlib / raw deflate
   containers table(): magic + count + entries of fixed, length-prefixed or C-string names, offsets absolute or
              relative, sizes stored or taken from the next entry, names ciphered; nested folders
   text models stringTable (offset table + C strings), pointerTable (index -> dword pointer -> C string), opcodeWalk
              (fixed operand encodings with text opcodes), lineGrammar (KAG-like text with tags, names, ruby)
   engine()   one call that gives scenes(dir) / archives(dir) / sources(dir) / parse / test from a declaration */
const fs=require('node:fs'),path=require('node:path'),zlib=require('node:zlib');

/* ---- io --------------------------------------------------------------------------------------------------------- */
function readAt(file,offset,length){const fd=fs.openSync(file,'r');try{const b=Buffer.alloc(Math.max(0,length));const n=fs.readSync(fd,b,0,b.length,offset);return n<b.length?b.subarray(0,n):b;}finally{fs.closeSync(fd);}}
const size=file=>{try{return fs.statSync(file).size;}catch{return -1;}};
const head=(file,n)=>{try{return readAt(file,0,n);}catch{return Buffer.alloc(0);}};
const tail=(file,n)=>{const s=size(file);if(s<0)return Buffer.alloc(0);try{return readAt(file,Math.max(0,s-n),Math.min(n,s));}catch{return Buffer.alloc(0);}};
const names=dir=>{try{return fs.readdirSync(dir);}catch{return [];}};
const isFile=f=>{try{return fs.statSync(f).isFile();}catch{return false;}};
/* files under dir (depth levels of sub folders) whose name passes test; save folders are never entered */
function walk(dir,depth,test,out=[]){let es;try{es=fs.readdirSync(dir,{withFileTypes:true});}catch{return out;}
 for(const e of es){const f=path.join(dir,e.name);if(e.isDirectory()){if(depth>0&&!/^(saves?|savedata|\.megulit)$/i.test(e.name))walk(f,depth-1,test,out);}else if(e.isFile()&&test(e.name,f))out.push(f);}return out;}
/* files in dir and the given sub folders matching name (RegExp) and, if given, starting with magic (string, latin1) */
function files(dir,{name=/./,magic=null,subs=[''],max=64}={}){const out=[];
 for(const s of subs){const d=s?path.join(dir,s):dir;for(const n of names(d)){if(out.length>=max)return out;if(!name.test(n))continue;const f=path.join(d,n);if(!isFile(f))continue;
  if(magic&&head(f,magic.length).toString('latin1')!==magic)continue;out.push(f);}}
 return out;}

/* ---- text ------------------------------------------------------------------------------------------------------- */
const KANA=/[ぁ-ゖァ-ヺ]/,KANA_G=/[ぁ-ゖァ-ヺ]/g;
const hasKana=t=>KANA.test(t);
/* Shift-JIS for the originals, GBK for Chinese patches: replacement characters and half-width katakana (what GBK bytes
   become when read as Shift-JIS) count against an encoding; a tie goes to the one with more kana */
function codepage(all){if(!all||!all.length)return 'shift_jis';
 const score=enc=>{const t=new TextDecoder(enc).decode(all);return {bad:(t.match(/�/g)||[]).length*4+(t.match(/[｡-ﾟ]/g)||[]).length,kana:(t.match(KANA_G)||[]).length};};
 const s=score('shift_jis'),g=score('gbk');return s.bad<g.bad||s.bad===g.bad&&s.kana>=g.kana?'shift_jis':'gbk';}
const decoder=bufs=>new TextDecoder(codepage(Buffer.concat(bufs.filter(b=>b&&b.some(c=>c>=0x80)).slice(0,4000))));
const cstr=(b,at,limit=b.length)=>{if(at<0||at>=b.length)return null;const e=b.indexOf(0,at);return b.subarray(at,e<0||e>limit?limit:e);};
const trimBoth=t=>t.replace(/^[\s　]+|[\s　]+$/g,'');
const ascii=t=>/^[\x20-\x7e]*$/.test(t);
/* the generic scan (GARbro fallback, engines whose grammar is unknown): runs of Japanese text with kana, in order */
const JP_RUN=/[ぁ-ゖァ-ヺー一-龯々〆〜～！？。、「」『』（）…―・　Ａ-Ｚａ-ｚ０-９]{2,}/g;
function decodeRuns(buf){const pick=[];for(const enc of ['shift_jis','utf-8','utf-16le']){let t;try{t=new TextDecoder(enc).decode(buf);}catch{continue;}pick.push({t,kana:(t.match(KANA_G)||[]).length});}
 const best=pick.sort((a,b)=>b.kana-a.kana)[0];if(!best||best.kana<4)return [];const lines=[];let last='';
 for(const raw of best.t.split(/[\r\n\0]+/))for(const m of raw.matchAll(JP_RUN)){const s=trimBoth(m[0]);if(s.length<2||!hasKana(s))continue;if(/^[ァ-ヺー]+$/.test(s)&&s.length<3)continue;if(s!==last)lines.push(s);last=s;}
 return lines;}

/* ---- transforms ------------------------------------------------------------------------------------------------- */
function xor(buf,key,start=0){const b=Buffer.from(buf),k=typeof key==='number'?[key&255]:key;for(let i=0;i<b.length;i++)b[i]^=k[(i+start)%k.length];return b;}
/* dword XOR whose key grows by add each dword, plus an increment added to the value (System-NNN's xor / addXor / addInc) */
function xorDword(buf,key,add=0,inc=0){const n=buf.length>>>2,out=Buffer.from(buf);let x=key>>>0,v=0;for(let i=0;i<n;i++){out.writeUInt32LE(((buf.readUInt32LE(i*4)^x)+v)>>>0,i*4);x=(x+add)>>>0;v=(v+inc)>>>0;}return out;}
const rol=(b,n)=>((b<<(n&7))|(b>>>(8-(n&7))))&255,ror=(b,n)=>((b>>>(n&7))|(b<<(8-(n&7))))&255;
const not=buf=>Buffer.from(buf.map(c=>~c&255));
/* LZSS, Okumura family. Defaults are the common one (GARbro LzssStream): 4 KB window, writes from 0xFEE, window filled
   with 0, flag bits LSB first and 1 = literal, a reference is lo | (hi & 0xF0) << 4 with length (hi & 0x0F) + 3.
   opts: window, start, fill, msb (flags read MSB first), zeroLiteral (0 = literal), minMatch, lenBits (low bits of
   the second byte), cap (output limit) */
function lzss(src,unpacked,opts={}){const W=opts.window||4096,mask=W-1,min=opts.minMatch??3,lb=opts.lenBits??4,lm=(1<<lb)-1;
 /* the output size when known, else what this input can grow to (every flag byte 8 references of up to 2^lenBits+min) */
 const limit=Math.min(unpacked??Math.ceil(src.length/3)*8*(lm+min),opts.cap??(64<<20));
 const win=new Uint8Array(W).fill(opts.fill||0),out=Buffer.alloc(Math.max(0,limit));let wp=(opts.start??0xfee)&mask,o=0,s=0;
 while(o<out.length&&s<src.length){const flags=src[s++];for(let bit=0;bit<8&&o<out.length&&s<src.length;bit++){const f=opts.msb?(flags>>(7-bit))&1:(flags>>bit)&1,lit=opts.zeroLiteral?!f:!!f;
  if(lit){const c=src[s++];out[o++]=c;win[wp]=c;wp=(wp+1)&mask;}
  else{if(s+1>=src.length)return out.subarray(0,o);const lo=src[s++],hi=src[s++];const pos=lo|((hi>>lb)<<8),len=(hi&lm)+min;for(let k=0;k<len&&o<out.length;k++){const c=win[(pos+k)&mask];out[o++]=c;win[wp]=c;wp=(wp+1)&mask;}}}}
 return out.subarray(0,o);}
const inflate=(b,max=64<<20)=>zlib.inflateSync(b,{maxOutputLength:max}),inflateRaw=(b,max=64<<20)=>zlib.inflateRawSync(b,{maxOutputLength:max});

/* ---- containers ------------------------------------------------------------------------------------------------- */
/* table(file, spec) -> [{name, offset, size, unpacked}] or null. spec:
     magic       string at 0 (latin1) the file must start with
     count       {at, type: u8|u16le|u32le|i32le}            how many entries
     entries     byte offset of the first entry (number) or {at, type} read from the header
     fields      [{name:'name'|'offset'|'size'|'unpacked'|'flags'|'next', type:u8|u16le|u32le|u64le|cstr|pstr8|skip, size}]
     nameCipher  'not' | {xor: n} applied to name bytes;  encoding (default shift_jis)
     base        'file' (default) | 'after-index' | {at, type} | number: added to every offset
     sizeFrom    'next' when sizes come from the next entry's offset (the last runs to the end of the file)
     validate    (entry, fileSize) -> bool, extra sanity check */
const INT={u8:[1,'readUInt8'],u16le:[2,'readUInt16LE'],u32le:[4,'readUInt32LE'],i32le:[4,'readInt32LE'],u32be:[4,'readUInt32BE']};
function rdInt(b,type,at){if(type==='u64le')return Number(b.readBigUInt64LE(at));const t=INT[type];return b[t[1]](at);}
const widthOf=type=>type==='u64le'?8:INT[type][0];
function table(file,spec,{maxIndex=64<<20}={}){const fsz=size(file);if(fsz<8)return null;
 const idx=readAt(file,0,Math.min(fsz,maxIndex));if(spec.magic&&idx.toString('latin1',0,spec.magic.length)!==spec.magic)return null;
 try{const count=spec.count?rdInt(idx,spec.count.type,spec.count.at):Infinity;if(spec.count&&(count<0||count>500000))return null;
  let p=typeof spec.entries==='number'?spec.entries:rdInt(idx,spec.entries.type,spec.entries.at);const raw=[];
  for(let n=0;n<count&&p<idx.length&&n<500000;n++){const e={};
   for(const f of spec.fields){if(f.type==='skip'){p+=f.size;continue;}
    if(f.type==='cstr'||f.type==='pstr8'){let nb;if(f.type==='cstr'){nb=idx.subarray(p,p+f.size);p+=f.size;const z=nb.indexOf(0);if(z>=0&&!spec.nameCipher)nb=nb.subarray(0,z);}else{const len=idx[p];nb=idx.subarray(p+1,p+1+len);p+=1+len;}
     nb=Buffer.from(nb);if(spec.nameCipher==='not')for(let i=0;i<nb.length;i++)nb[i]=~nb[i]&255;else if(spec.nameCipher?.xor!==undefined)for(let i=0;i<nb.length;i++)nb[i]^=spec.nameCipher.xor;
     const z=nb.indexOf(0);e.name=new TextDecoder(spec.encoding||'shift_jis').decode(z>=0?nb.subarray(0,z):nb);continue;}
    const v=rdInt(idx,f.type,p);p+=widthOf(f.type);if(f.name)e[f.name]=v;}
   raw.push(e);}
  const base=spec.base==='after-index'?p:typeof spec.base==='number'?spec.base:spec.base?rdInt(idx,spec.base.type,spec.base.at):0;
  const out=[];for(let i=0;i<raw.length;i++){const e=raw[i];let offset=base+e.offset,sz=e.size;
   if(spec.sizeFrom==='next'){const next=i+1<raw.length?base+raw[i+1].offset:fsz;sz=next-offset;}
   if(!Number.isSafeInteger(offset)||!Number.isSafeInteger(sz)||sz<0||offset+sz>fsz||!e.name)return null;
   const entry={name:e.name.replace(/\\/g,'/'),offset,size:sz,unpacked:e.unpacked??sz,flags:e.flags};if(spec.validate&&!spec.validate(entry,fsz))return null;out.push(entry);}
  return out;}catch{return null;}}
const entryRead=(file,e)=>readAt(file,e.offset,e.size);

/* ---- text models ------------------------------------------------------------------------------------------------ */
/* offsets[i] (relative to base) -> the C strings, in table order */
function stringTable(buf,{offsetsAt,count,base,limit=buf.length,width=4}){const out=[];for(let i=0;i<count;i++){const at=offsetsAt+i*width;if(at+width>buf.length)break;const o=width===4?buf.readInt32LE(at):buf.readUInt16LE(at);const s=cstr(buf,base+o,limit);if(s)out.push(s);}return out;}
/* index -> dword pointer in a table (dword units) -> C string at pointer*4 */
function pointerTable(buf,tableDword,count){const n=buf.length>>>2;return k=>k<count&&tableDword+k<n?cstr(buf,buf.readUInt32LE((tableDword+k)*4)*4):null;}
/* walk a bytecode whose operands have fixed encodings: enc(op) -> operand list ('i' 4, 'h' 2, 'b' 1, 's' u16 length +
   bytes, 'z' C string, 't' u16 count + bytes, 'c' u16 count × 4, or a number of bytes); emit(op, strings) for every
   instruction that carries strings. Stops at the first unknown opcode. opWidth 1 or 2 */
function opcodeWalk(code,enc,emit,{opWidth=2,start=0}={}){let p=start;
 while(p+opWidth<=code.length){const op=opWidth===2?code.readUInt16LE(p):code[p];p+=opWidth;const e=enc(op);if(e===undefined||e===null)return p-opWidth;const strs=[];
  for(const c of Array.isArray(e)||typeof e==='string'?e:[e]){
   if(typeof c==='number'){p+=c;continue;}
   if(c==='i'){p+=4;continue;}if(c==='h'){p+=2;continue;}if(c==='b'){p+=1;continue;}
   if(c==='s'){if(p+2>code.length)return p;const n=code.readUInt16LE(p);p+=2;strs.push(code.subarray(p,p+Math.max(0,n-1)));p+=n;continue;}
   if(c==='z'){const z=code.indexOf(0,p);if(z<0)return p;strs.push(code.subarray(p,z));p=z+1;continue;}
   if(c==='t'){if(p+2>code.length)return p;p+=2+code.readUInt16LE(p);continue;}
   if(c==='c'){if(p+2>code.length)return p;p+=2+4*code.readUInt16LE(p);continue;}}
  if(p>code.length)return code.length;emit(op,strs);}
 return p;}
/* KAG-like plain text: comments, labels, @commands and [tags] are anchors; "#name" / "【name】" lines are speakers;
   [ruby text=…] or [漢字'よみ] give readings. opts: comment (RegExp), code blocks [[open,close]], name (RegExp with
   group 1), strip (RegExp list), anchor (RegExp) */
function lineGrammar(text,opts={}){const lines=[],anchors=[];let block=null;
 const comment=opts.comment||/^(;|\/\/)/,anchor=opts.anchor||/^[@*]/,blocks=opts.blocks||[[/^[@[]\s*iscript\b/i,/^[@[]\s*endscript\b/i]];
 for(const raw of text.split(/\r?\n/)){const t=raw.trim();if(!t)continue;
  if(block){if(block.test(t))block=null;continue;}const b=blocks.find(([o])=>o.test(t));if(b){block=b[1];continue;}
  if(comment.test(t))continue;if(anchor.test(t)){anchors.push(t);continue;}
  if(opts.name){const m=opts.name.exec(t);if(m){if(m[1])lines.push(m[1].trim());continue;}}
  let s=t;for(const r of opts.strip||[/\[[^\]]*\]/g])s=s.replace(r,'');s=trimBoth(s);if(!s){anchors.push(t);continue;}lines.push(s);}
 return {lines,anchors};}

/* ---- engine factory --------------------------------------------------------------------------------------------- */
/* engine({id, hint, archives:{name, magic, subs, list(file) -> entries|null, read(file, entry) -> Buffer, entry: RegExp},
   loose:{name, subs}, parse}) -> {id, hint, scenes, archives, sources, parse, test}. Loose files override archived
   ones of the same base name; scenes are sorted by name. */
function engine(def){
 const arcFiles=dir=>def.archives?files(dir,{name:def.archives.name,magic:def.archives.magic,subs:def.archives.subs||['']}).filter(f=>{try{return !!def.archives.list(f);}catch{return false;}}):[];
 const looseFiles=dir=>def.loose?files(dir,{name:def.loose.name,subs:def.loose.subs||[''],max:20000}):[];
 const scenes=dir=>{const out=new Map();
  for(const a of arcFiles(dir)){let l;try{l=def.archives.list(a);}catch{l=null;}for(const e of l||[]){if(def.archives.entry&&!def.archives.entry.test(e.name))continue;const n=path.posix.basename(e.name);out.set(n.toLowerCase(),{name:n,read:()=>def.archives.read?def.archives.read(a,e):entryRead(a,e)});}}
  for(const f of looseFiles(dir))out.set(path.basename(f).toLowerCase(),{name:path.basename(f),read:()=>fs.readFileSync(f)});
  return [...out.values()].sort((a,b)=>a.name.localeCompare(b.name));};
 return {id:def.id,hint:def.hint,scenes,archives:scenes,sources:dir=>[...arcFiles(dir),...looseFiles(dir)],parse:buf=>{try{return def.parse(Buffer.isBuffer(buf)?buf:Buffer.from(buf));}catch{return {lines:[],anchors:[]};}},test:def.test||(n=>!!def.loose&&def.loose.name.test(n)),...(def.extra||{})};}

module.exports={readAt,size,head,tail,names,isFile,walk,files,KANA,KANA_G,hasKana,codepage,decoder,cstr,trimBoth,ascii,decodeRuns,
 xor,xorDword,rol,ror,not,lzss,inflate,inflateRaw,table,entryRead,rdInt,stringTable,pointerTable,opcodeWalk,lineGrammar,engine};
